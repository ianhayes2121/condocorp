import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware.js';

const router = Router();

async function isPlatformAdmin(userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM condocorp_memberships WHERE user_id = $1 AND role = 'platform_admin' AND status = 'active' LIMIT 1`,
    [userId]
  );
  return result.rows.length > 0;
}

async function isCondoCorpAdmin(userId: string, condocorpId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM condocorp_memberships WHERE user_id = $1 AND condocorp_id = $2 AND role IN ('condocorp_admin', 'platform_admin') AND status = 'active' LIMIT 1`,
    [userId, condocorpId]
  );
  return result.rows.length > 0;
}

async function hasActiveMembership(userId: string, condocorpId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM condocorp_memberships WHERE user_id = $1 AND condocorp_id = $2 AND status = 'active' LIMIT 1`,
    [userId, condocorpId]
  );
  return result.rows.length > 0;
}

function normalizePresetTexts(texts: unknown): string[] | null {
  if (!Array.isArray(texts)) return null;
  const normalized = texts
    .map(t => (typeof t === 'string' ? t.trim() : ''))
    .filter(t => t.length > 0);
  if (normalized.length === 0) return null;
  return normalized;
}

// Platform default presets (SuperAdmin)
router.get('/platform', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, text, sort_order FROM question_presets WHERE condocorp_id IS NULL ORDER BY sort_order ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get platform presets error:', error);
    res.status(500).json({ error: 'Failed to fetch platform presets' });
  }
});

router.put('/platform', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    if (!(await isPlatformAdmin(userId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const texts = normalizePresetTexts(req.body.texts);
    if (!texts) {
      res.status(400).json({ error: 'At least one preset question is required' });
      return;
    }

    await pool.query('DELETE FROM question_presets WHERE condocorp_id IS NULL');
    for (let i = 0; i < texts.length; i++) {
      await pool.query(
        'INSERT INTO question_presets (condocorp_id, text, sort_order) VALUES (NULL, $1, $2)',
        [texts[i], i]
      );
    }

    const result = await pool.query(
      'SELECT id, text, sort_order FROM question_presets WHERE condocorp_id IS NULL ORDER BY sort_order ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Update platform presets error:', error);
    res.status(500).json({ error: 'Failed to update platform presets' });
  }
});

// CondoCorp-specific presets for admin management
router.get('/:condocorpId/manage', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId } = req.params;

    if (!(await isCondoCorpAdmin(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const [corpResult, platformResult] = await Promise.all([
      pool.query(
        'SELECT id, text, sort_order FROM question_presets WHERE condocorp_id = $1 ORDER BY sort_order ASC',
        [condocorpId]
      ),
      pool.query(
        'SELECT id, text, sort_order FROM question_presets WHERE condocorp_id IS NULL ORDER BY sort_order ASC'
      ),
    ]);

    const usingPlatformDefaults = corpResult.rows.length === 0;
    res.json({
      using_platform_defaults: usingPlatformDefaults,
      presets: usingPlatformDefaults ? platformResult.rows : corpResult.rows,
      platform_presets: platformResult.rows,
    });
  } catch (error) {
    console.error('Get manage presets error:', error);
    res.status(500).json({ error: 'Failed to fetch presets' });
  }
});

router.put('/:condocorpId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId } = req.params;

    if (!(await isCondoCorpAdmin(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const texts = normalizePresetTexts(req.body.texts);
    if (!texts) {
      res.status(400).json({ error: 'At least one preset question is required' });
      return;
    }

    await pool.query('DELETE FROM question_presets WHERE condocorp_id = $1', [condocorpId]);
    for (let i = 0; i < texts.length; i++) {
      await pool.query(
        'INSERT INTO question_presets (condocorp_id, text, sort_order) VALUES ($1, $2, $3)',
        [condocorpId, texts[i], i]
      );
    }

    const result = await pool.query(
      'SELECT id, text, sort_order FROM question_presets WHERE condocorp_id = $1 ORDER BY sort_order ASC',
      [condocorpId]
    );
    res.json({ using_platform_defaults: false, presets: result.rows });
  } catch (error) {
    console.error('Update presets error:', error);
    res.status(500).json({ error: 'Failed to update presets' });
  }
});

router.delete('/:condocorpId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId } = req.params;

    if (!(await isCondoCorpAdmin(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    await pool.query('DELETE FROM question_presets WHERE condocorp_id = $1', [condocorpId]);

    const platformResult = await pool.query(
      'SELECT id, text, sort_order FROM question_presets WHERE condocorp_id IS NULL ORDER BY sort_order ASC'
    );
    res.json({ using_platform_defaults: true, presets: platformResult.rows });
  } catch (error) {
    console.error('Reset presets error:', error);
    res.status(500).json({ error: 'Failed to reset presets' });
  }
});

// Resolved presets for Ask a Question (condocorp overrides, else platform defaults)
router.get('/:condocorpId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId } = req.params;

    if (!(await hasActiveMembership(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const corpResult = await pool.query(
      'SELECT id, text, sort_order FROM question_presets WHERE condocorp_id = $1 ORDER BY sort_order ASC',
      [condocorpId]
    );

    if (corpResult.rows.length > 0) {
      res.json({ source: 'condocorp', presets: corpResult.rows });
      return;
    }

    const platformResult = await pool.query(
      'SELECT id, text, sort_order FROM question_presets WHERE condocorp_id IS NULL ORDER BY sort_order ASC'
    );
    res.json({ source: 'platform', presets: platformResult.rows });
  } catch (error) {
    console.error('Get presets error:', error);
    res.status(500).json({ error: 'Failed to fetch presets' });
  }
});

export default router;
