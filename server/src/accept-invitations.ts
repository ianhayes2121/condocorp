import type { PoolClient } from 'pg';
import { pool } from './db.js';

/** Apply pending invitations for this email to memberships and mark invites accepted. */
export async function acceptPendingInvitations(
  userId: string,
  email: string,
  client?: PoolClient
): Promise<number> {
  const db = client ?? pool;
  const memberships = await db.query(
    `INSERT INTO condocorp_memberships (condocorp_id, user_id, role, status)
     SELECT i.condocorp_id, $1, i.role, 'active'
     FROM invitations i
     WHERE LOWER(i.email) = LOWER($2)
       AND i.status = 'pending'
       AND i.expires_at > now()
     ON CONFLICT (condocorp_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active'
     RETURNING condocorp_id`,
    [userId, email]
  );

  await db.query(
    `UPDATE invitations SET status = 'accepted'
     WHERE LOWER(email) = LOWER($1) AND status = 'pending' AND expires_at > now()`,
    [email]
  );

  return memberships.rowCount ?? 0;
}
