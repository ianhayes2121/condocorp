import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware.js';
import { hasCondoCorpAccess, hasCondoCorpAdminAccess } from '../access.js';
import { InviteError, inviteUserToCondoCorp, isValidInviteRole } from '../invite-user.js';

const router = Router();

// Get members of a condocorp
router.get('/:condocorpId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId } = req.params;

    if (!(await hasCondoCorpAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const result = await pool.query(
      `SELECT m.id, m.role, m.status, m.created_at,
              u.id as user_id, u.email, u.first_name, u.last_name
       FROM condocorp_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.condocorp_id = $1 AND m.role != 'platform_admin'
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

    if (!(await hasCondoCorpAdminAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { email, role } = req.body;
    if (!email || !role) {
      res.status(400).json({ error: 'Email and role are required' });
      return;
    }

    if (!isValidInviteRole(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    const result = await inviteUserToCondoCorp({
      condocorpId,
      email,
      role,
      invitedByUserId: userId,
    });

    if (result.existing_user) {
      res.status(201).json({ success: true, invited: false, message: 'User added to CondoCorp' });
    } else {
      res.status(201).json({
        success: true,
        invited: true,
        message: 'Invitation email sent. They can create an account using the link in the email.',
      });
    }
  } catch (error) {
    if (error instanceof InviteError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('Invite error:', error);
    res.status(500).json({ error: 'Failed to invite user' });
  }
});

// Remove member (set inactive)
router.patch('/:condocorpId/:membershipId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId, membershipId } = req.params;

    if (!(await hasCondoCorpAdminAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const result = await pool.query(
      `UPDATE condocorp_memberships SET status = 'inactive'
       WHERE id = $1 AND condocorp_id = $2 AND role != 'platform_admin'
       RETURNING id`,
      [membershipId, condocorpId]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

export default router;
