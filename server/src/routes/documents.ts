import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { pool } from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware.js';
import { hasCondoCorpAccess, hasCondoCorpAdminAccess } from '../access.js';
import { getOpenAI } from '../openai.js';

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads';
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const uniqueName = `${crypto.randomUUID()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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

  const result: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length > targetSize * 2) {
      let start = 0;
      while (start < chunk.length) {
        result.push(chunk.slice(start, start + targetSize).trim());
        start += targetSize - overlap;
      }
    } else {
      result.push(chunk);
    }
  }
  return result;
}

function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const batchSize = 20;
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await getOpenAI().embeddings.create({ model: 'text-embedding-3-small', input: batch });
    for (const item of response.data) allEmbeddings.push(item.embedding);
  }
  return allEmbeddings;
}

// List documents
router.get('/:condocorpId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId } = req.params;

    if (!(await hasCondoCorpAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const result = await pool.query(
      'SELECT * FROM documents WHERE condocorp_id = $1 ORDER BY created_at DESC',
      [condocorpId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Upload document
router.post('/:condocorpId', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId } = req.params;

    if (!(await hasCondoCorpAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const file = req.file;
    if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }

    const title = (req.body.title as string) || file.originalname.replace(/\.[^/.]+$/, '');
    const documentType = (req.body.document_type as string) || 'other';

    const result = await pool.query(
      `INSERT INTO documents (condocorp_id, title, filename, file_path, document_type, status, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, 'uploaded', $6) RETURNING *`,
      [condocorpId, title, file.originalname, file.filename, documentType, userId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Process document (extract text, chunk, embed)
router.post('/:condocorpId/:documentId/process', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId, documentId } = req.params;

    if (!(await hasCondoCorpAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    await pool.query(`UPDATE documents SET status = 'processing' WHERE id = $1`, [documentId]);

    const docResult = await pool.query(
      'SELECT * FROM documents WHERE id = $1 AND condocorp_id = $2',
      [documentId, condocorpId]
    );
    if (docResult.rows.length === 0) { res.status(404).json({ error: 'Document not found' }); return; }
    const doc = docResult.rows[0];

    const filePath = path.join(UPLOAD_DIR, doc.file_path);
    if (!fs.existsSync(filePath)) {
      await pool.query(`UPDATE documents SET status = 'failed' WHERE id = $1`, [documentId]);
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }

    let rawText = '';
    const ext = doc.filename.toLowerCase().split('.').pop();

    if (ext === 'txt') {
      rawText = fs.readFileSync(filePath, 'utf-8');
    } else if (ext === 'html' || ext === 'htm') {
      rawText = extractTextFromHtml(fs.readFileSync(filePath, 'utf-8'));
    } else if (ext === 'pdf') {
      const buffer = fs.readFileSync(filePath);
      const parser = new PDFParse(buffer);
      const pdfData = await parser.getText();
      rawText = pdfData.text;
    } else if (ext === 'docx') {
      const buffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value;
    } else {
      rawText = fs.readFileSync(filePath, 'utf-8');
    }

    const cleanedText = cleanText(rawText);
    if (!cleanedText) {
      await pool.query(`UPDATE documents SET status = 'failed' WHERE id = $1`, [documentId]);
      res.status(400).json({ error: 'No text content extracted' });
      return;
    }

    const textChunks = chunkText(cleanedText);
    await pool.query(`UPDATE documents SET status = 'chunked' WHERE id = $1`, [documentId]);

    // Delete existing chunks (for reprocessing)
    await pool.query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);

    const embeddings = await generateEmbeddings(textChunks);

    // Insert chunks with embeddings
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
      `INSERT INTO audit_logs (condocorp_id, user_id, action, details)
       VALUES ($1, $2, 'document_processed', $3)`,
      [condocorpId, doc.uploaded_by, JSON.stringify({ description: `Processed ${doc.title}`, document_id: documentId, chunks_created: textChunks.length })]
    );

    res.json({ success: true, chunks_created: textChunks.length });
  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Processing failed' });
  }
});

// Get chunks for a document
router.get('/:condocorpId/:documentId/chunks', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId, documentId } = req.params;

    if (!(await hasCondoCorpAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const result = await pool.query(
      `SELECT id, condocorp_id, document_id, chunk_number, chunk_text, created_at
       FROM document_chunks WHERE document_id = $1 AND condocorp_id = $2
       ORDER BY chunk_number`,
      [documentId, condocorpId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get chunks error:', error);
    res.status(500).json({ error: 'Failed to fetch chunks' });
  }
});

// Delete document
router.delete('/:condocorpId/:documentId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { condocorpId, documentId } = req.params;

    if (!(await hasCondoCorpAdminAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const docResult = await pool.query('SELECT file_path FROM documents WHERE id = $1 AND condocorp_id = $2', [documentId, condocorpId]);
    if (docResult.rows.length > 0) {
      const filePath = path.join(UPLOAD_DIR, docResult.rows[0].file_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await pool.query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);
    await pool.query('DELETE FROM documents WHERE id = $1 AND condocorp_id = $2', [documentId, condocorpId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
