import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware.js';
import { hasCondoCorpAccess, hasCondoCorpAdminAccess } from '../access.js';

const router = Router();

// Get user's condocorps with memberships
router.get('/', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const result = await pool.query(
      `SELECT m.id as membership_id, m.role, m.status as membership_status,
              c.id, c.name, c.address, c.status, c.created_at
       FROM condocorp_memberships m
       JOIN condocorps c ON c.id = m.condocorp_id
       WHERE m.user_id = $1 AND m.status = 'active'
       ORDER BY c.name`,
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get condocorps error:', error);
    res.status(500).json({ error: 'Failed to fetch condocorps' });
  }
});

// Get all condocorps (platform admin)
router.get('/all', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const admin = await pool.query(
      `SELECT 1 FROM condocorp_memberships WHERE user_id = $1 AND role = 'platform_admin' AND status = 'active' LIMIT 1`,
      [userId]
    );
    if (admin.rows.length === 0) {
      res.status(403).json({ error: 'Platform admin access required' });
      return;
    }

    const result = await pool.query('SELECT * FROM condocorps ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get all condocorps error:', error);
    res.status(500).json({ error: 'Failed to fetch condocorps' });
  }
});

// Create condocorp (platform admin)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const admin = await pool.query(
      `SELECT 1 FROM condocorp_memberships WHERE user_id = $1 AND role = 'platform_admin' AND status = 'active' LIMIT 1`,
      [userId]
    );
    if (admin.rows.length === 0) {
      res.status(403).json({ error: 'Platform admin access required' });
      return;
    }

    const { name, address } = req.body;
    const result = await pool.query(
      `INSERT INTO condocorps (name, address, status) VALUES ($1, $2, 'active') RETURNING *`,
      [name, address]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create condocorp error:', error);
    res.status(500).json({ error: 'Failed to create condocorp' });
  }
});

// Update condocorp status (platform admin)
router.patch('/:id/status', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const admin = await pool.query(
      `SELECT 1 FROM condocorp_memberships WHERE user_id = $1 AND role = 'platform_admin' AND status = 'active' LIMIT 1`,
      [userId]
    );
    if (admin.rows.length === 0) {
      res.status(403).json({ error: 'Platform admin access required' });
      return;
    }

    const { status } = req.body;
    const result = await pool.query(
      `UPDATE condocorps SET status = $1 WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Update condocorp settings
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    if (!(await hasCondoCorpAdminAccess(userId, req.params.id))) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { name, address } = req.body;
    const result = await pool.query(
      `UPDATE condocorps SET name = $1, address = $2 WHERE id = $3 RETURNING *`,
      [name, address, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update condocorp error:', error);
    res.status(500).json({ error: 'Failed to update condocorp' });
  }
});

// Get dashboard stats
router.get('/:id/stats', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const condocorpId = req.params.id;

    if (!(await hasCondoCorpAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const [docs, chunks, users, convos, faqs] = await Promise.all([
      pool.query('SELECT count(*)::int FROM documents WHERE condocorp_id = $1', [condocorpId]),
      pool.query('SELECT count(*)::int FROM document_chunks WHERE condocorp_id = $1', [condocorpId]),
      pool.query(`SELECT count(*)::int FROM condocorp_memberships WHERE condocorp_id = $1 AND status = 'active'`, [condocorpId]),
      pool.query('SELECT count(*)::int FROM conversations WHERE condocorp_id = $1', [condocorpId]),
      pool.query('SELECT count(*)::int FROM faqs WHERE condocorp_id = $1', [condocorpId]),
    ]);

    res.json({
      totalDocuments: docs.rows[0].count,
      totalChunks: chunks.rows[0].count,
      totalUsers: users.rows[0].count,
      totalConversations: convos.rows[0].count,
      totalFaqs: faqs.rows[0].count,
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get recent activity
router.get('/:id/activity', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const condocorpId = req.params.id;

    if (!(await hasCondoCorpAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const result = await pool.query(
      `SELECT * FROM audit_logs WHERE condocorp_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [condocorpId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Activity error:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

export default router;
