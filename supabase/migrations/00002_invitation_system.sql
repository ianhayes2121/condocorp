-- ============================================================
-- INVITATIONS TABLE
-- ============================================================

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  condocorp_id uuid not null references condocorps(id) on delete cascade,
  email text not null,
  role text not null check (role in ('condocorp_admin', 'board_member', 'homeowner', 'property_manager')),
  invited_by uuid not null references users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  unique(condocorp_id, email, status)
);

create index idx_invitations_email on invitations(email);
create index idx_invitations_condocorp on invitations(condocorp_id);

-- RLS
alter table invitations enable row level security;

create policy "Admins can view invitations for their condocorp" on invitations
  for select using (is_admin_of(condocorp_id) or is_platform_admin());

create policy "Admins can create invitations" on invitations
  for insert with check (is_admin_of(condocorp_id) or is_platform_admin());

create policy "Admins can update invitations" on invitations
  for update using (is_admin_of(condocorp_id) or is_platform_admin());

-- ============================================================
-- AUTO-CREATE MEMBERSHIP WHEN INVITED USER SIGNS UP
-- ============================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into users (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', '')
  )
  on conflict (id) do update set
    email = excluded.email,
    first_name = excluded.first_name,
    last_name = excluded.last_name;

  -- Auto-accept pending invitations for this email
  insert into condocorp_memberships (condocorp_id, user_id, role, status)
  select i.condocorp_id, new.id, i.role, 'active'
  from invitations i
  where i.email = new.email
    and i.status = 'pending'
    and i.expires_at > now()
  on conflict (condocorp_id, user_id) do nothing;

  update invitations
  set status = 'accepted'
  where email = new.email
    and status = 'pending';

  return new;
end;
$$;

-- Remove "Users can insert themselves" policy since users are now created via invitation
drop policy if exists "Users can insert themselves" on users;
