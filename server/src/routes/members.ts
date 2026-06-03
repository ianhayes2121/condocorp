import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware.js';

const router = Router();

// Get members of a condocorp
router.get('/:condocorpId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId } = req.params;

    const member = await pool.query(
      `SELECT 1 FROM condocorp_memberships WHERE user_id = $1 AND condocorp_id = $2 AND status = 'active' LIMIT 1`,
      [userId, condocorpId]
    );
    if (member.rows.length === 0) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const result = await pool.query(
      `SELECT m.id, m.role, m.status, m.created_at,
              u.id as user_id, u.email, u.first_name, u.last_name
       FROM condocorp_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.condocorp_id = $1
       ORDER BY m.created_at DESC`,
      [condocorpId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Invite user to condocorp
router.post('/:condocorpId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId } = req.params;

    const admin = await pool.query(
      `SELECT 1 FROM condocorp_memberships
       WHERE user_id = $1 AND status = 'active'
         AND ((condocorp_id = $2 AND role IN ('condocorp_admin', 'platform_admin'))
              OR role = 'platform_admin')
       LIMIT 1`,
      [userId, condocorpId]
    );
    if (admin.rows.length === 0) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { email, role } = req.body;
    if (!email || !role) {
      res.status(400).json({ error: 'Email and role are required' });
      return;
    }

    const validRoles = ['condocorp_admin', 'board_member', 'homeowner', 'property_manager'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    // Check if already an active member
    const existingMember = await pool.query(
      `SELECT 1 FROM condocorp_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE u.email = $1 AND m.condocorp_id = $2 AND m.status = 'active'
       LIMIT 1`,
      [email, condocorpId]
    );
    if (existingMember.rows.length > 0) {
      res.status(409).json({ error: 'User is already a member of this CondoCorp.' });
      return;
    }

    // Check for existing pending invitation
    const existingInvite = await pool.query(
      `SELECT 1 FROM invitations
       WHERE email = $1 AND condocorp_id = $2 AND status = 'pending' AND expires_at > now()
       LIMIT 1`,
      [email, condocorpId]
    );
    if (existingInvite.rows.length > 0) {
      res.status(409).json({ error: 'A pending invitation already exists for this email.' });
      return;
    }

    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

    // Create invitation record
    await pool.query(
      `INSERT INTO invitations (condocorp_id, email, role, invited_by)
       VALUES ($1, $2, $3, $4)`,
      [condocorpId, email, role, userId]
    );

    if (userResult.rows.length > 0) {
      // Existing user — add membership directly
      await pool.query(
        `INSERT INTO condocorp_memberships (condocorp_id, user_id, role, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (condocorp_id, user_id) DO UPDATE SET role = $3, status = 'active'`,
        [condocorpId, userResult.rows[0].id, role]
      );
      await pool.query(
        `UPDATE invitations SET status = 'accepted'
         WHERE email = $1 AND condocorp_id = $2 AND status = 'pending'`,
        [email, condocorpId]
      );
      res.status(201).json({ success: true, invited: false, message: 'User added to CondoCorp' });
    } else {
      // New user — invitation saved, they'll be added when they sign up
      res.status(201).json({ success: true, invited: true, message: 'Invitation created. User will be added when they create an account.' });
    }
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({ error: 'Failed to invite user' });
  }
});

// Remove member (set inactive)
router.patch('/:condocorpId/:membershipId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId, membershipId } = req.params;

    const admin = await pool.query(
      `SELECT 1 FROM condocorp_memberships WHERE user_id = $1 AND condocorp_id = $2 AND role IN ('condocorp_admin', 'platform_admin') AND status = 'active' LIMIT 1`,
      [userId, condocorpId]
    );
    if (admin.rows.length === 0) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    await pool.query(
      `UPDATE condocorp_memberships SET status = 'inactive' WHERE id = $1 AND condocorp_id = $2`,
      [membershipId, condocorpId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

export default router;
