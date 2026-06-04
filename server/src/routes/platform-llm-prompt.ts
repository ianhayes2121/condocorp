import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware.js';
import {
  CONTEXT_PLACEHOLDER,
  DEFAULT_LLM_PROMPT_TEMPLATE,
} from '../llm-prompt.js';

const router = Router();

async function isPlatformAdmin(userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM condocorp_memberships WHERE user_id = $1 AND role = 'platform_admin' AND status = 'active' LIMIT 1`,
    [userId]
  );
  return result.rows.length > 0;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    if (!(await isPlatformAdmin(userId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const result = await pool.query(
      'SELECT template, updated_at FROM platform_llm_prompt WHERE id = $1',
      ['default']
    );
    const row = result.rows[0];
    res.json({
      template: row?.template ?? DEFAULT_LLM_PROMPT_TEMPLATE,
      default_template: DEFAULT_LLM_PROMPT_TEMPLATE,
      context_placeholder: CONTEXT_PLACEHOLDER,
      updated_at: row?.updated_at ?? null,
    });
  } catch (error) {
    console.error('Get LLM prompt error:', error);
    res.status(500).json({ error: 'Failed to fetch LLM prompt' });
  }
});

router.put('/', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    if (!(await isPlatformAdmin(userId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const template = typeof req.body.template === 'string' ? req.body.template.trim() : '';
    if (!template) {
      res.status(400).json({ error: 'Prompt template is required' });
      return;
    }
    if (!template.includes(CONTEXT_PLACEHOLDER)) {
      res.status(400).json({
        error: `Prompt must include the ${CONTEXT_PLACEHOLDER} placeholder where documentation context is inserted`,
      });
      return;
    }

    const result = await pool.query(
      `INSERT INTO platform_llm_prompt (id, template, updated_at)
       VALUES ('default', $1, now())
       ON CONFLICT (id) DO UPDATE SET template = EXCLUDED.template, updated_at = now()
       RETURNING template, updated_at`,
      [template]
    );

    res.json({
      template: result.rows[0].template,
      default_template: DEFAULT_LLM_PROMPT_TEMPLATE,
      context_placeholder: CONTEXT_PLACEHOLDER,
      updated_at: result.rows[0].updated_at,
    });
  } catch (error) {
    console.error('Update LLM prompt error:', error);
    res.status(500).json({ error: 'Failed to update LLM prompt' });
  }
});

export default router;
