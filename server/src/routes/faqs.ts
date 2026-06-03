import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware.js';

const router = Router();

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
      'SELECT * FROM faqs WHERE condocorp_id = $1 ORDER BY created_at DESC',
      [condocorpId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get FAQs error:', error);
    res.status(500).json({ error: 'Failed to fetch FAQs' });
  }
});

router.post('/:condocorpId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId } = req.params;

    const admin = await pool.query(
      `SELECT 1 FROM condocorp_memberships WHERE user_id = $1 AND condocorp_id = $2 AND role IN ('condocorp_admin', 'board_member', 'property_manager', 'platform_admin') AND status = 'active' LIMIT 1`,
      [userId, condocorpId]
    );
    if (admin.rows.length === 0) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const { question, answer } = req.body;
    const result = await pool.query(
      'INSERT INTO faqs (condocorp_id, question, answer) VALUES ($1, $2, $3) RETURNING *',
      [condocorpId, question, answer]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create FAQ error:', error);
    res.status(500).json({ error: 'Failed to create FAQ' });
  }
});

router.put('/:condocorpId/:faqId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId, faqId } = req.params;

    const admin = await pool.query(
      `SELECT 1 FROM condocorp_memberships WHERE user_id = $1 AND condocorp_id = $2 AND role IN ('condocorp_admin', 'board_member', 'property_manager', 'platform_admin') AND status = 'active' LIMIT 1`,
      [userId, condocorpId]
    );
    if (admin.rows.length === 0) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const { question, answer } = req.body;
    const result = await pool.query(
      'UPDATE faqs SET question = $1, answer = $2 WHERE id = $3 AND condocorp_id = $4 RETURNING *',
      [question, answer, faqId, condocorpId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update FAQ error:', error);
    res.status(500).json({ error: 'Failed to update FAQ' });
  }
});

router.delete('/:condocorpId/:faqId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId, faqId } = req.params;

    const admin = await pool.query(
      `SELECT 1 FROM condocorp_memberships WHERE user_id = $1 AND condocorp_id = $2 AND role IN ('condocorp_admin', 'board_member', 'property_manager', 'platform_admin') AND status = 'active' LIMIT 1`,
      [userId, condocorpId]
    );
    if (admin.rows.length === 0) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    await pool.query('DELETE FROM faqs WHERE id = $1 AND condocorp_id = $2', [faqId, condocorpId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete FAQ error:', error);
    res.status(500).json({ error: 'Failed to delete FAQ' });
  }
});

export default router;
