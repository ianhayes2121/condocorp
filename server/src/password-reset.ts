import crypto from 'crypto';
import { pool } from './db.js';

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export function generatePasswordResetToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  return { token, tokenHash, expiresAt };
}

export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createPasswordResetToken(userId: string): Promise<string> {
  const { token, tokenHash, expiresAt } = generatePasswordResetToken();
  await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
  return token;
}

export async function consumePasswordResetToken(
  token: string
): Promise<{ userId: string } | null> {
  const tokenHash = hashResetToken(token);
  const result = await pool.query(
    `SELECT user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND expires_at > now()
     LIMIT 1`,
    [tokenHash]
  );
  if (result.rows.length === 0) return null;

  const userId = result.rows[0].user_id as string;
  await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
  return { userId };
}
