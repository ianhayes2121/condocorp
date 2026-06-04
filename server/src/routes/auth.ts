import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { acceptPendingInvitations } from '../accept-invitations.js';
import { isGoogleAuthConfigured, verifyGoogleIdToken } from '../google-auth.js';
import { requireAuth, signToken, type AuthenticatedRequest } from '../middleware.js';

const router = Router();

router.post('/signup', async (req, res) => {
  try {
    const { email, password, first_name, last_name } = req.body;
    if (!email || !password || !first_name || !last_name) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name)
         VALUES ($1, $2, $3, $4) RETURNING id, email, first_name, last_name`,
        [normalizedEmail, passwordHash, first_name, last_name]
      );
      const user = result.rows[0];
      await acceptPendingInvitations(user.id, normalizedEmail, client);
      await client.query('COMMIT');

      const token = signToken(user.id);
      res.status(201).json({
        token,
        user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, password_hash FROM users WHERE LOWER(email) = $1',
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const user = result.rows[0];
    if (!user.password_hash) {
      res.status(401).json({ error: 'This account uses Google sign-in. Continue with Google instead.' });
      return;
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = signToken(user.id);
    res.json({ token, user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/google', async (req, res) => {
  try {
    if (!isGoogleAuthConfigured()) {
      res.status(503).json({ error: 'Google sign-in is not configured' });
      return;
    }

    const { credential, invite_email } = req.body as { credential?: string; invite_email?: string };
    if (!credential) {
      res.status(400).json({ error: 'Google credential is required' });
      return;
    }

    const profile = await verifyGoogleIdToken(credential);
    const invitedEmail = invite_email?.trim().toLowerCase();
    if (invitedEmail && profile.email !== invitedEmail) {
      res.status(403).json({
        error: `Please sign in with the invited email address (${invitedEmail}).`,
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const byGoogle = await client.query(
        'SELECT id, email, first_name, last_name, password_hash, google_id FROM users WHERE google_id = $1',
        [profile.googleId]
      );

      let user: {
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        password_hash: string | null;
        google_id: string | null;
      };

      if (byGoogle.rows.length > 0) {
        user = byGoogle.rows[0];
      } else {
        const byEmail = await client.query(
          'SELECT id, email, first_name, last_name, password_hash, google_id FROM users WHERE LOWER(email) = $1',
          [profile.email]
        );

        if (byEmail.rows.length > 0) {
          user = byEmail.rows[0];
          if (user.google_id && user.google_id !== profile.googleId) {
            await client.query('ROLLBACK');
            res.status(409).json({ error: 'This email is linked to a different Google account' });
            return;
          }
          await client.query(
            `UPDATE users SET google_id = $1,
              first_name = CASE WHEN first_name = '' THEN $2 ELSE first_name END,
              last_name = CASE WHEN last_name = '' THEN $3 ELSE last_name END
             WHERE id = $4`,
            [profile.googleId, profile.firstName, profile.lastName, user.id]
          );
        } else {
          const inserted = await client.query(
            `INSERT INTO users (email, password_hash, first_name, last_name, google_id)
             VALUES ($1, NULL, $2, $3, $4)
             RETURNING id, email, first_name, last_name, password_hash, google_id`,
            [profile.email, profile.firstName, profile.lastName, profile.googleId]
          );
          user = inserted.rows[0];
        }
      }

      await acceptPendingInvitations(user.id, profile.email, client);
      await client.query('COMMIT');

      const token = signToken(user.id);
      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Google auth error:', error);
    const message = error instanceof Error ? error.message : 'Google sign-in failed';
    if (message.includes('GOOGLE_CLIENT_ID')) {
      res.status(503).json({ error: 'Google sign-in is not configured' });
      return;
    }
    res.status(401).json({ error: 'Google sign-in failed. Please try again.' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, created_at FROM users WHERE id = $1',
      [userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.post('/request-access', async (req, res) => {
  try {
    const { condocorp_name, condocorp_address, email, password, first_name, last_name, confirm_board_member, confirm_terms } = req.body;

    if (!condocorp_name || !email || !password || !first_name || !last_name) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    if (!confirm_board_member || !confirm_terms) {
      res.status(400).json({ error: 'You must confirm board membership and accept the terms' });
      return;
    }

    const existingCorp = await pool.query(
      'SELECT id FROM condocorps WHERE LOWER(name) = LOWER($1)',
      [condocorp_name.trim()]
    );

    if (existingCorp.rows.length > 0) {
      res.status(409).json({
        error: 'condocorp_exists',
        message: 'This condo corporation is already registered on our platform. Please contact your board members to request access.'
      });
      return;
    }

    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      res.status(409).json({ error: 'Email already registered. Please sign in instead.' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const passwordHash = await bcrypt.hash(password, 12);
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name)
         VALUES ($1, $2, $3, $4) RETURNING id, email, first_name, last_name`,
        [email, passwordHash, first_name, last_name]
      );
      const user = userResult.rows[0];

      const corpResult = await client.query(
        `INSERT INTO condocorps (name, address, status) VALUES ($1, $2, 'active') RETURNING id`,
        [condocorp_name.trim(), condocorp_address?.trim() ?? '']
      );
      const condocorp = corpResult.rows[0];

      await client.query(
        `INSERT INTO condocorp_memberships (condocorp_id, user_id, role, status)
         VALUES ($1, $2, 'condocorp_admin', 'active')`,
        [condocorp.id, user.id]
      );

      await client.query(
        `INSERT INTO audit_logs (condocorp_id, user_id, action, details)
         VALUES ($1, $2, 'condocorp_created', $3)`,
        [condocorp.id, user.id, JSON.stringify({ method: 'self_registration', condocorp_name: condocorp_name.trim() })]
      );

      await client.query('COMMIT');

      const token = signToken(user.id);
      res.status(201).json({
        token,
        user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    console.error('Request access error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

export default router;
