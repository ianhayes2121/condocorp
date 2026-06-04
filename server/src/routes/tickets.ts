import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware.js';
import { hasCondoCorpAccess, hasCondoCorpAdminAccess } from '../access.js';
import { sendTicketCreatedEmail } from '../email.js';
import { ingestTicketToKnowledgeBase } from '../knowledge-ingest.js';

const router = Router();

async function getCondoCorpAdmins(condocorpId: string): Promise<Array<{ email: string; first_name: string; last_name: string }>> {
  const result = await pool.query(
    `SELECT u.email, u.first_name, u.last_name
     FROM condocorp_memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.condocorp_id = $1 AND m.role = 'condocorp_admin' AND m.status = 'active'`,
    [condocorpId]
  );
  return result.rows;
}

async function notifyAdminsOfNewTicket(
  condocorpId: string,
  ticket: { id: string; subject: string },
  submitter: { first_name: string; last_name: string }
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;

  const corpResult = await pool.query('SELECT name FROM condocorps WHERE id = $1', [condocorpId]);
  const condocorpName = corpResult.rows[0]?.name ?? 'your condo';
  const submitterName = `${submitter.first_name} ${submitter.last_name}`.trim() || 'A resident';
  const admins = await getCondoCorpAdmins(condocorpId);

  await Promise.all(
    admins.map(admin =>
      sendTicketCreatedEmail({
        to: admin.email,
        condocorpName,
        subject: ticket.subject,
        submitterName,
        ticketId: ticket.id,
      }).catch(err => console.error('Ticket notification email failed:', err))
    )
  );
}

function ticketSelectQuery(): string {
  return `
    SELECT t.*,
           creator.email AS creator_email,
           creator.first_name AS creator_first_name,
           creator.last_name AS creator_last_name,
           assignee.email AS assignee_email,
           assignee.first_name AS assignee_first_name,
           assignee.last_name AS assignee_last_name
    FROM support_tickets t
    JOIN users creator ON creator.id = t.created_by
    LEFT JOIN users assignee ON assignee.id = t.assigned_to
  `;
}

// List tickets
router.get('/:condocorpId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId } = req.params;

    if (!(await hasCondoCorpAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const isAdmin = await hasCondoCorpAdminAccess(userId, condocorpId);
    const result = isAdmin
      ? await pool.query(
          `${ticketSelectQuery()} WHERE t.condocorp_id = $1 ORDER BY t.updated_at DESC`,
          [condocorpId]
        )
      : await pool.query(
          `${ticketSelectQuery()} WHERE t.condocorp_id = $1 AND t.created_by = $2 ORDER BY t.updated_at DESC`,
          [condocorpId, userId]
        );

    res.json(result.rows);
  } catch (error) {
    console.error('List tickets error:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// Get ticket with replies
router.get('/:condocorpId/:ticketId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId, ticketId } = req.params;

    if (!(await hasCondoCorpAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const isAdmin = await hasCondoCorpAdminAccess(userId, condocorpId);
    const ticketResult = await pool.query(
      `${ticketSelectQuery()} WHERE t.id = $1 AND t.condocorp_id = $2`,
      [ticketId, condocorpId]
    );
    if (ticketResult.rows.length === 0) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const ticket = ticketResult.rows[0];
    if (!isAdmin && ticket.created_by !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const repliesResult = await pool.query(
      `SELECT r.*, u.first_name, u.last_name, u.email
       FROM support_ticket_replies r
       JOIN users u ON u.id = r.user_id
       WHERE r.ticket_id = $1
       ORDER BY r.created_at ASC`,
      [ticketId]
    );

    res.json({ ticket, replies: repliesResult.rows });
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

// Create ticket
router.post('/:condocorpId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId } = req.params;
    const { subject, question, conversation_id, message_id } = req.body;

    if (!(await hasCondoCorpAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (!subject?.trim() || !question?.trim()) {
      res.status(400).json({ error: 'Subject and question are required' });
      return;
    }

    const userResult = await pool.query(
      'SELECT first_name, last_name FROM users WHERE id = $1',
      [userId]
    );

    const result = await pool.query(
      `INSERT INTO support_tickets (
         condocorp_id, created_by, subject, question, conversation_id, message_id
       ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        condocorpId,
        userId,
        subject.trim(),
        question.trim(),
        conversation_id ?? null,
        message_id ?? null,
      ]
    );

    const ticket = result.rows[0];

    await pool.query(
      `INSERT INTO audit_logs (condocorp_id, user_id, action, details) VALUES ($1, $2, 'support_ticket_created', $3)`,
      [condocorpId, userId, JSON.stringify({ ticket_id: ticket.id, subject: ticket.subject })]
    );

    await notifyAdminsOfNewTicket(condocorpId, ticket, userResult.rows[0] ?? { first_name: '', last_name: '' });

    res.status(201).json(ticket);
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// Add reply
router.post('/:condocorpId/:ticketId/replies', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId, ticketId } = req.params;
    const { content } = req.body;

    if (!(await hasCondoCorpAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (!content?.trim()) {
      res.status(400).json({ error: 'Reply content is required' });
      return;
    }

    const ticketResult = await pool.query(
      'SELECT * FROM support_tickets WHERE id = $1 AND condocorp_id = $2',
      [ticketId, condocorpId]
    );
    if (ticketResult.rows.length === 0) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const ticket = ticketResult.rows[0];
    const isAdmin = await hasCondoCorpAdminAccess(userId, condocorpId);
    if (!isAdmin && ticket.created_by !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (ticket.status === 'closed') {
      res.status(400).json({ error: 'Ticket is closed' });
      return;
    }

    const replyResult = await pool.query(
      `INSERT INTO support_ticket_replies (ticket_id, user_id, content) VALUES ($1, $2, $3) RETURNING *`,
      [ticketId, userId, content.trim()]
    );

    const newStatus = isAdmin && ticket.status === 'open' ? 'in_progress' : ticket.status;
    await pool.query(
      `UPDATE support_tickets SET status = $1, updated_at = now() WHERE id = $2`,
      [newStatus, ticketId]
    );

    res.status(201).json(replyResult.rows[0]);
  } catch (error) {
    console.error('Add reply error:', error);
    res.status(500).json({ error: 'Failed to add reply' });
  }
});

// Update ticket (assign, status)
router.patch('/:condocorpId/:ticketId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId, ticketId } = req.params;
    const { status, assigned_to } = req.body;

    if (!(await hasCondoCorpAdminAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const ticketResult = await pool.query(
      'SELECT * FROM support_tickets WHERE id = $1 AND condocorp_id = $2',
      [ticketId, condocorpId]
    );
    if (ticketResult.rows.length === 0) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const updates: string[] = ['updated_at = now()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (status !== undefined) {
      if (!['open', 'in_progress', 'closed'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
      }
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
      if (status === 'closed') {
        updates.push(`closed_at = now()`);
      }
    }

    if (assigned_to !== undefined) {
      if (assigned_to !== null) {
        const memberCheck = await pool.query(
          `SELECT 1 FROM condocorp_memberships
           WHERE condocorp_id = $1 AND user_id = $2 AND status = 'active'`,
          [condocorpId, assigned_to]
        );
        if (memberCheck.rows.length === 0) {
          res.status(400).json({ error: 'Assignee must be an active member' });
          return;
        }
      }
      updates.push(`assigned_to = $${paramIndex++}`);
      values.push(assigned_to);
    }

    if (updates.length === 1) {
      res.status(400).json({ error: 'No updates provided' });
      return;
    }

    values.push(ticketId, condocorpId);
    const result = await pool.query(
      `UPDATE support_tickets SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND condocorp_id = $${paramIndex}
       RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update ticket error:', error);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// Close ticket and optionally add to knowledge base
router.post('/:condocorpId/:ticketId/close', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId, ticketId } = req.params;
    const { add_to_knowledge, kb_question, kb_answer } = req.body;

    if (!(await hasCondoCorpAdminAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const ticketResult = await pool.query(
      'SELECT * FROM support_tickets WHERE id = $1 AND condocorp_id = $2',
      [ticketId, condocorpId]
    );
    if (ticketResult.rows.length === 0) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const ticket = ticketResult.rows[0];
    if (ticket.status === 'closed') {
      res.status(400).json({ error: 'Ticket is already closed' });
      return;
    }

    let knowledgeResult = null;
    if (add_to_knowledge) {
      const question = (kb_question ?? ticket.question)?.trim();
      const answer = kb_answer?.trim();
      if (!question || !answer) {
        res.status(400).json({ error: 'Knowledge base question and answer are required' });
        return;
      }

      knowledgeResult = await ingestTicketToKnowledgeBase(pool, {
        condocorpId,
        userId,
        question,
        answer,
        ticketId,
      });

      await pool.query(
        'UPDATE support_tickets SET knowledge_added = true WHERE id = $1',
        [ticketId]
      );
    }

    const closeResult = await pool.query(
      `UPDATE support_tickets SET status = 'closed', closed_at = now(), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [ticketId]
    );

    res.json({
      ticket: closeResult.rows[0],
      knowledge: knowledgeResult,
      prompt_add_to_knowledge: !add_to_knowledge,
    });
  } catch (error) {
    console.error('Close ticket error:', error);
    res.status(500).json({ error: 'Failed to close ticket' });
  }
});

export default router;
