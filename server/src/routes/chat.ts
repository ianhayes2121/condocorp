import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware.js';
import { hasCondoCorpAccess } from '../access.js';
import { getOpenAI } from '../openai.js';
import {
  buildSystemPrompt,
  getLlmPromptTemplate,
  normalizeCannotAnswerResponse,
  isCannotAnswerResponse,
} from '../llm-prompt.js';
import { RAG_TOP_K, hasRetrievalContext } from '../rag.js';
import {
  buildRetrievalQuery,
  looksLikeFollowUp,
  toLlmHistoryMessages,
} from '../conversation-rag.js';

const router = Router();

// Get conversations
router.get('/:condocorpId/conversations', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId } = req.params;

    if (!(await hasCondoCorpAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

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

    if (!(await hasCondoCorpAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

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

    if (!(await hasCondoCorpAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const convoCheck = await pool.query(
      'SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2',
      [conversation_id, userId]
    );
    if (convoCheck.rows.length === 0) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const historyResult = await pool.query(
      `SELECT role, content FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversation_id]
    );
    const priorMessages = historyResult.rows as Array<{ role: string; content: string }>;

    const embedQuestion = looksLikeFollowUp(question, priorMessages)
      ? buildRetrievalQuery(question, priorMessages)
      : question;

    async function searchChunks(searchText: string) {
      const embeddingResponse = await getOpenAI().embeddings.create({
        model: 'text-embedding-3-small',
        input: searchText,
      });
      const embeddingStr = `[${embeddingResponse.data[0].embedding.join(',')}]`;
      return pool.query(
        `SELECT dc.id, dc.document_id, dc.chunk_number, dc.chunk_text,
                1 - (dc.embedding <=> $1::vector) as similarity
         FROM document_chunks dc
         WHERE dc.condocorp_id = $2
           AND dc.embedding IS NOT NULL
         ORDER BY dc.embedding <=> $1::vector
         LIMIT $3`,
        [embeddingStr, condocorpId, RAG_TOP_K]
      );
    }

    let chunksResult = await searchChunks(embedQuestion);
    let chunks = chunksResult.rows;

    // Store user message
    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [conversation_id, 'user', question]
    );

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

    let topSimilarity = chunks[0]?.similarity != null ? Number(chunks[0].similarity) : null;
    let hasRelevantContext = hasRetrievalContext(topSimilarity, faqsResult.rows.length);

    if (!hasRelevantContext && priorMessages.length > 0 && embedQuestion === question) {
      const expandedQuery = buildRetrievalQuery(question, priorMessages);
      if (expandedQuery !== question) {
        chunksResult = await searchChunks(expandedQuery);
        chunks = chunksResult.rows;
        topSimilarity = chunks[0]?.similarity != null ? Number(chunks[0].similarity) : null;
        hasRelevantContext = hasRetrievalContext(topSimilarity, faqsResult.rows.length);

        const retryDocIds = [...new Set(chunks.map(c => c.document_id))].filter(id => !docTitleMap.has(id));
        if (retryDocIds.length > 0) {
          const docsResult = await pool.query(
            'SELECT id, title FROM documents WHERE id = ANY($1)',
            [retryDocIds]
          );
          for (const d of docsResult.rows) docTitleMap.set(d.id, d.title);
        }
      }
    }
    const contextChunks = hasRelevantContext ? chunks : [];

    // Build context
    const chunkContext =
      contextChunks.length > 0
        ? contextChunks
            .map((c, i) =>
              `[Source ${i + 1}: ${docTitleMap.get(c.document_id) ?? 'Unknown'}, Chunk ${c.chunk_number}]\n${c.chunk_text}`
            )
            .join('\n\n')
        : '(No matching document excerpts were retrieved for this question.)';

    const faqContext = faqsResult.rows
      .map(f => `Q: ${f.question}\nA: ${f.answer}`)
      .join('\n\n');

    const contextBlock = [chunkContext, faqContext && `\n\nFAQs:\n${faqContext}`]
      .filter(Boolean)
      .join('');

    const promptTemplate = await getLlmPromptTemplate(pool);
    const systemPrompt = buildSystemPrompt(promptTemplate, contextBlock, question);

    const historyForLlm = toLlmHistoryMessages(priorMessages);

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyForLlm,
        { role: 'user', content: question },
      ],
      temperature: 0.45,
      max_tokens: 1536,
    });

    let answer = completion.choices[0].message.content ?? '';
    answer = normalizeCannotAnswerResponse(answer);
    const cannotAnswer = isCannotAnswerResponse(answer);

    const sources = cannotAnswer ? [] : contextChunks.map(c => ({
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

    res.json({
      answer,
      sources,
      message_id: msgResult.rows[0].id,
      cannot_answer: cannotAnswer,
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal error' });
  }
});

export default router;
