import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware.js';
import { getOpenAI } from '../openai.js';

const router = Router();

// Get conversations
router.get('/:condocorpId/conversations', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId } = req.params;

    const member = await pool.query(
      `SELECT 1 FROM condocorp_memberships WHERE user_id = $1 AND condocorp_id = $2 AND status = 'active' LIMIT 1`,
      [userId, condocorpId]
    );
    if (member.rows.length === 0) { res.status(403).json({ error: 'Access denied' }); return; }

    const result = await pool.query(
      'SELECT * FROM conversations WHERE condocorp_id = $1 AND user_id = $2 ORDER BY created_at DESC',
      [condocorpId, userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Create conversation
router.post('/:condocorpId/conversations', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId } = req.params;

    const member = await pool.query(
      `SELECT 1 FROM condocorp_memberships WHERE user_id = $1 AND condocorp_id = $2 AND status = 'active' LIMIT 1`,
      [userId, condocorpId]
    );
    if (member.rows.length === 0) { res.status(403).json({ error: 'Access denied' }); return; }

    const result = await pool.query(
      'INSERT INTO conversations (condocorp_id, user_id) VALUES ($1, $2) RETURNING *',
      [condocorpId, userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Get messages for a conversation
router.get('/conversations/:conversationId/messages', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { conversationId } = req.params;

    const convo = await pool.query(
      'SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    if (convo.rows.length === 0) { res.status(403).json({ error: 'Access denied' }); return; }

    const result = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send message (RAG pipeline)
router.post('/:condocorpId/ask', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId } = req.params;
    const { conversation_id, question } = req.body;

    if (!conversation_id || !question) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const member = await pool.query(
      `SELECT 1 FROM condocorp_memberships WHERE user_id = $1 AND condocorp_id = $2 AND status = 'active' LIMIT 1`,
      [userId, condocorpId]
    );
    if (member.rows.length === 0) { res.status(403).json({ error: 'Access denied' }); return; }

    // Store user message
    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [conversation_id, 'user', question]
    );

    // Generate embedding for the question
    const embeddingResponse = await getOpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: question,
    });
    const questionEmbedding = embeddingResponse.data[0].embedding;
    const embeddingStr = `[${questionEmbedding.join(',')}]`;

    // Vector search — filtered by condocorp_id BEFORE ranking
    const chunksResult = await pool.query(
      `SELECT dc.id, dc.document_id, dc.chunk_number, dc.chunk_text,
              1 - (dc.embedding <=> $1::vector) as similarity
       FROM document_chunks dc
       WHERE dc.condocorp_id = $2
         AND dc.embedding IS NOT NULL
         AND 1 - (dc.embedding <=> $1::vector) > 0.5
       ORDER BY dc.embedding <=> $1::vector
       LIMIT 5`,
      [embeddingStr, condocorpId]
    );

    const chunks = chunksResult.rows;

    // Get document titles for citations
    const docIds = [...new Set(chunks.map(c => c.document_id))];
    let docTitleMap = new Map<string, string>();
    if (docIds.length > 0) {
      const docsResult = await pool.query(
        'SELECT id, title FROM documents WHERE id = ANY($1)',
        [docIds]
      );
      docTitleMap = new Map(docsResult.rows.map(d => [d.id, d.title]));
    }

    // Fetch FAQs for this condocorp
    const faqsResult = await pool.query(
      'SELECT question, answer FROM faqs WHERE condocorp_id = $1',
      [condocorpId]
    );

    // Build context
    const chunkContext = chunks
      .map((c, i) =>
        `[Source ${i + 1}: ${docTitleMap.get(c.document_id) ?? 'Unknown'}, Chunk ${c.chunk_number}]\n${c.chunk_text}`
      )
      .join('\n\n');

    const faqContext = faqsResult.rows
      .map(f => `Q: ${f.question}\nA: ${f.answer}`)
      .join('\n\n');

    const contextBlock = [chunkContext, faqContext && `\n\nFAQs:\n${faqContext}`]
      .filter(Boolean)
      .join('');

    const systemPrompt = `You are a condominium knowledge assistant.

Answer only using the supplied CondoCorp documentation.

Do not invent policies, fees, procedures, bylaws, or rules.

If the answer is unavailable in the provided documentation, respond with:
"I could not find information about that in the CondoCorp documentation."

Context:
${contextBlock}`;

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    });

    const answer = completion.choices[0].message.content ?? '';

    const sources = chunks.map(c => ({
      document_title: docTitleMap.get(c.document_id) ?? 'Unknown',
      chunk_text: c.chunk_text.substring(0, 200),
      chunk_number: c.chunk_number,
      similarity: c.similarity,
    }));

    // Store assistant message
    const msgResult = await pool.query(
      'INSERT INTO messages (conversation_id, role, content, sources) VALUES ($1, $2, $3, $4) RETURNING id',
      [conversation_id, 'assistant', answer, JSON.stringify(sources)]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (condocorp_id, user_id, action, details) VALUES ($1, $2, 'question_asked', $3)`,
      [condocorpId, userId, JSON.stringify({ question, sources_count: sources.length })]
    );

    res.json({ answer, sources, message_id: msgResult.rows[0].id });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal error' });
  }
});

export default router;
