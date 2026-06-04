import { pool } from './db.js';

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM condocorp_memberships WHERE user_id = $1 AND role = 'platform_admin' AND status = 'active' LIMIT 1`,
    [userId]
  );
  return result.rows.length > 0;
}

/** Any active membership for the corp, or global platform admin. */
export async function hasCondoCorpAccess(userId: string, condocorpId: string): Promise<boolean> {
  if (await isPlatformAdmin(userId)) return true;
  const result = await pool.query(
    `SELECT 1 FROM condocorp_memberships WHERE user_id = $1 AND condocorp_id = $2 AND status = 'active' LIMIT 1`,
    [userId, condocorpId]
  );
  return result.rows.length > 0;
}

/** Corp admin membership for the corp, or global platform admin. */
export async function hasCondoCorpAdminAccess(userId: string, condocorpId: string): Promise<boolean> {
  if (await isPlatformAdmin(userId)) return true;
  const result = await pool.query(
    `SELECT 1 FROM condocorp_memberships
     WHERE user_id = $1 AND condocorp_id = $2 AND role IN ('condocorp_admin', 'platform_admin') AND status = 'active'
     LIMIT 1`,
    [userId, condocorpId]
  );
  return result.rows.length > 0;
}
