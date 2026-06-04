import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware.js';
import { InviteError, inviteUserToCondoCorp, isValidInviteRole } from '../invite-user.js';

const router = Router();

router.post('/', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { email, role, condocorp_id } = req.body;

    if (!email || !role || !condocorp_id) {
      res.status(400).json({ error: 'email, role, and condocorp_id are required' });
      return;
    }

    if (!isValidInviteRole(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

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

    const result = await inviteUserToCondoCorp({
      condocorpId: condocorp_id,
      email,
      role,
      invitedByUserId: userId,
    });

    if (result.existing_user) {
      res.status(201).json({ message: 'User added to CondoCorp', existing_user: true });
    } else {
      res.status(201).json({
        message: 'Invitation email sent. User will be added when they create an account.',
        existing_user: false,
      });
    }
  } catch (error) {
    if (error instanceof InviteError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
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
