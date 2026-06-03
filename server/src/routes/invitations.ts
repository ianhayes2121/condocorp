import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware.js';

const router = Router();

router.post('/', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { email, role, condocorp_id } = req.body;

    if (!email || !role || !condocorp_id) {
      res.status(400).json({ error: 'email, role, and condocorp_id are required' });
      return;
    }

    const validRoles = ['condocorp_admin', 'board_member', 'homeowner', 'property_manager'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    // Check caller is admin of this condocorp or platform admin
    const admin = await pool.query(
      `SELECT role FROM condocorp_memberships
       WHERE user_id = $1 AND status = 'active'
         AND (condocorp_id = $2 AND role IN ('condocorp_admin', 'platform_admin')
              OR role = 'platform_admin')
       LIMIT 1`,
      [userId, condocorp_id]
    );
    if (admin.rows.length === 0) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    // Check if user already has an active membership
    const existingMembership = await pool.query(
      `SELECT 1 FROM condocorp_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE u.email = $1 AND m.condocorp_id = $2 AND m.status = 'active'
       LIMIT 1`,
      [email, condocorp_id]
    );
    if (existingMembership.rows.length > 0) {
      res.status(409).json({ error: 'User is already a member of this CondoCorp' });
      return;
    }

    // Check if there's already a pending invitation
    const existingInvite = await pool.query(
      `SELECT 1 FROM invitations
       WHERE email = $1 AND condocorp_id = $2 AND status = 'pending' AND expires_at > now()
       LIMIT 1`,
      [email, condocorp_id]
    );
    if (existingInvite.rows.length > 0) {
      res.status(409).json({ error: 'A pending invitation already exists for this email' });
      return;
    }

    // Check if user already exists in the system
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    // Create the invitation record
    await pool.query(
      `INSERT INTO invitations (condocorp_id, email, role, invited_by)
       VALUES ($1, $2, $3, $4)`,
      [condocorp_id, email, role, userId]
    );

    if (existingUser.rows.length > 0) {
      // User already exists — create membership directly
      await pool.query(
        `INSERT INTO condocorp_memberships (condocorp_id, user_id, role, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (condocorp_id, user_id) DO UPDATE SET role = $3, status = 'active'`,
        [condocorp_id, existingUser.rows[0].id, role]
      );

      // Mark invitation as accepted
      await pool.query(
        `UPDATE invitations SET status = 'accepted'
         WHERE email = $1 AND condocorp_id = $2 AND status = 'pending'`,
        [email, condocorp_id]
      );

      res.status(201).json({ message: 'User added to CondoCorp', existing_user: true });
    } else {
      // New user — invitation saved, they'll be added when they sign up
      res.status(201).json({ message: 'Invitation created. User will be added when they create an account.', existing_user: false });
    }
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({ error: 'Failed to create invitation' });
  }
});

// List invitations for a condocorp
router.get('/:condocorp_id', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorp_id } = req.params;

    const admin = await pool.query(
      `SELECT 1 FROM condocorp_memberships
       WHERE user_id = $1 AND status = 'active'
         AND (condocorp_id = $2 AND role IN ('condocorp_admin', 'platform_admin')
              OR role = 'platform_admin')
       LIMIT 1`,
      [userId, condocorp_id]
    );
    if (admin.rows.length === 0) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const result = await pool.query(
      `SELECT i.*, u.first_name as invited_by_first, u.last_name as invited_by_last
       FROM invitations i
       JOIN users u ON u.id = i.invited_by
       WHERE i.condocorp_id = $1
       ORDER BY i.created_at DESC`,
      [condocorp_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('List invitations error:', error);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

export default router;
