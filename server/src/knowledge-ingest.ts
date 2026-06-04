import fs from 'fs';
import path from 'path';
import type { Pool } from 'pg';
import { getOpenAI } from './openai.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads';

function chunkText(text: string, targetSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length + 1 > targetSize && current.length > 0) {
      chunks.push(current.trim());
      const overlapText = current.slice(-overlap);
      current = overlapText + '\n\n' + para;
    } else {
      current += (current ? '\n\n' : '') + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text.trim()];
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const batchSize = 20;
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await getOpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
    });
    for (const item of response.data) allEmbeddings.push(item.embedding);
  }
  return allEmbeddings;
}

/** Add resolved ticket Q&A to FAQs and vector-indexed knowledge document. */
export async function ingestTicketToKnowledgeBase(
  pool: Pool,
  params: {
    condocorpId: string;
    userId: string;
    question: string;
    answer: string;
    ticketId: string;
  }
): Promise<{ faqId: string; documentId: string; chunksCreated: number }> {
  const { condocorpId, userId, question, answer, ticketId } = params;

  const faqResult = await pool.query(
    'INSERT INTO faqs (condocorp_id, question, answer) VALUES ($1, $2, $3) RETURNING id',
    [condocorpId, question.trim(), answer.trim()]
  );
  const faqId = faqResult.rows[0].id as string;

  const knowledgeText = `Question: ${question.trim()}\n\nAnswer: ${answer.trim()}`;
  const title = `Support knowledge: ${question.trim().slice(0, 80)}${question.length > 80 ? '…' : ''}`;

  fs.mkdirSync(path.join(UPLOAD_DIR, 'knowledge'), { recursive: true });
  const filename = `support-knowledge-${ticketId}.txt`;
  const filePath = path.join('knowledge', filename);
  fs.writeFileSync(path.join(UPLOAD_DIR, filePath), knowledgeText, 'utf-8');

  const docResult = await pool.query(
    `INSERT INTO documents (condocorp_id, title, filename, file_path, document_type, status, uploaded_by)
     VALUES ($1, $2, $3, $4, 'faq', 'chunked', $5) RETURNING id`,
    [condocorpId, title, filename, filePath, userId]
  );
  const documentId = docResult.rows[0].id as string;

  const textChunks = chunkText(knowledgeText);
  const embeddings = await generateEmbeddings(textChunks);

  for (let i = 0; i < textChunks.length; i++) {
    const embeddingStr = `[${embeddings[i].join(',')}]`;
    await pool.query(
      `INSERT INTO document_chunks (condocorp_id, document_id, chunk_number, chunk_text, embedding)
       VALUES ($1, $2, $3, $4, $5)`,
      [condocorpId, documentId, i + 1, textChunks[i], embeddingStr]
    );
  }

  await pool.query(`UPDATE documents SET status = 'indexed' WHERE id = $1`, [documentId]);

  await pool.query(
    `INSERT INTO audit_logs (condocorp_id, user_id, action, details) VALUES ($1, $2, 'ticket_knowledge_added', $3)`,
    [
      condocorpId,
      userId,
      JSON.stringify({ ticket_id: ticketId, faq_id: faqId, document_id: documentId, chunks_created: textChunks.length }),
    ]
  );

  return { faqId, documentId, chunksCreated: textChunks.length };
}
