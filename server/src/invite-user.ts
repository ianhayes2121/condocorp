import { pool } from './db.js';
import { sendAddedToCorpEmail, sendInviteEmail } from './email.js';

const validRoles = ['condocorp_admin', 'board_member', 'homeowner', 'property_manager'] as const;

export type InviteRole = (typeof validRoles)[number];

export function isValidInviteRole(role: string): role is InviteRole {
  return (validRoles as readonly string[]).includes(role);
}

export type InviteUserResult =
  | { existing_user: true }
  | { existing_user: false };

export async function inviteUserToCondoCorp(params: {
  condocorpId: string;
  email: string;
  role: InviteRole;
  invitedByUserId: string;
}): Promise<InviteUserResult> {
  const email = params.email.trim().toLowerCase();

  const corpResult = await pool.query(
    'SELECT name FROM condocorps WHERE id = $1',
    [params.condocorpId]
  );
  if (corpResult.rows.length === 0) {
    throw new InviteError('CondoCorp not found', 404);
  }
  const condocorpName = corpResult.rows[0].name as string;

  const inviterResult = await pool.query(
    'SELECT first_name, last_name FROM users WHERE id = $1',
    [params.invitedByUserId]
  );
  const inviter = inviterResult.rows[0] as { first_name: string; last_name: string } | undefined;
  const inviterName = inviter
    ? `${inviter.first_name} ${inviter.last_name}`.trim() || 'A team member'
    : 'A team member';

  const existingMember = await pool.query(
    `SELECT 1 FROM condocorp_memberships m
     JOIN users u ON u.id = m.user_id
     WHERE LOWER(u.email) = $1 AND m.condocorp_id = $2 AND m.status = 'active'
     LIMIT 1`,
    [email, params.condocorpId]
  );
  if (existingMember.rows.length > 0) {
    throw new InviteError('User is already a member of this CondoCorp.', 409);
  }

  const existingInvite = await pool.query(
    `SELECT 1 FROM invitations
     WHERE LOWER(email) = $1 AND condocorp_id = $2 AND status = 'pending' AND expires_at > now()
     LIMIT 1`,
    [email, params.condocorpId]
  );
  if (existingInvite.rows.length > 0) {
    throw new InviteError('A pending invitation already exists for this email.', 409);
  }

  const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);

  await pool.query(
    `INSERT INTO invitations (condocorp_id, email, role, invited_by)
     VALUES ($1, $2, $3, $4)`,
    [params.condocorpId, email, params.role, params.invitedByUserId]
  );

  try {
    if (userResult.rows.length > 0) {
      await pool.query(
        `INSERT INTO condocorp_memberships (condocorp_id, user_id, role, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (condocorp_id, user_id) DO UPDATE SET role = $3, status = 'active'`,
        [params.condocorpId, userResult.rows[0].id, params.role]
      );
      await pool.query(
        `UPDATE invitations SET status = 'accepted'
         WHERE LOWER(email) = $1 AND condocorp_id = $2 AND status = 'pending'`,
        [email, params.condocorpId]
      );
      await sendAddedToCorpEmail({ to: email, condocorpName, role: params.role });
      return { existing_user: true };
    }

    await sendInviteEmail({
      to: email,
      condocorpName,
      role: params.role,
      inviterName,
    });
    return { existing_user: false };
  } catch (err) {
    await pool.query(
      `DELETE FROM invitations
       WHERE LOWER(email) = $1 AND condocorp_id = $2 AND status = 'pending'`,
      [email, params.condocorpId]
    );
    if (userResult.rows.length > 0) {
      await pool.query(
        `DELETE FROM condocorp_memberships
         WHERE condocorp_id = $1 AND user_id = $2`,
        [params.condocorpId, userResult.rows[0].id]
      );
    }
    const message = err instanceof Error ? err.message : 'Failed to send invitation email';
    throw new InviteError(message, 502);
  }
}

export class InviteError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'InviteError';
  }
}
