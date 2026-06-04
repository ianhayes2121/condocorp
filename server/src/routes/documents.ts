import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mammoth from 'mammoth';
import { pool } from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware.js';
import { hasCondoCorpAccess } from '../access.js';
import { getOpenAI } from '../openai.js';
import {
  assertMeaningfulDocumentText,
  chunkText,
  cleanText,
  extractImageText,
  extractPdfText,
  extractTextFromHtml,
  isImageExtension,
} from '../document-text.js';
import { isOcrEnabled } from '../ocr.js';
import {
  PROCESSING_ERRORS,
  SUPPORTED_FORMATS_HELP,
  contentTypeForFilename,
  validateDocumentFilename,
} from '../document-file-types.js';
import { routeParam } from '../route-params.js';

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
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const validation = validateDocumentFilename(file.originalname);
    if (!validation.ok) {
      cb(new Error(validation.error));
      return;
    }
    cb(null, true);
  },
});

async function markDocumentFailed(documentId: string, reason: string): Promise<void> {
  await pool.query(
    `UPDATE documents SET status = 'failed', failure_reason = $2 WHERE id = $1`,
    [documentId, reason]
  );
}

function processingFailure(
  res: import('express').Response,
  documentId: string,
  status: number,
  reason: string
): void {
  void markDocumentFailed(documentId, reason);
  res.status(status).json({ error: reason, failure_reason: reason });
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
    const condocorpId = routeParam(req, 'condocorpId');

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
router.post('/:condocorpId', requireAuth, (req, res, next) => {
  upload.single('file')(req, res, err => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      const isTypeError =
        message.includes('cannot be processed') || message.includes('Supported file types');
      res.status(isTypeError ? 400 : 500).json({
        error: message,
        failure_reason: message,
        code: isTypeError ? 'unsupported_type' : undefined,
      });
      return;
    }
    next();
  });
}, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const condocorpId = routeParam(req, 'condocorpId');

    if (!(await hasCondoCorpAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded', failure_reason: 'No file uploaded' });
      return;
    }

    const fileCheck = validateDocumentFilename(file.originalname);
    if (!fileCheck.ok) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      res.status(400).json({ error: fileCheck.error, failure_reason: fileCheck.error, code: fileCheck.code });
      return;
    }

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
    const message = error instanceof Error ? error.message : 'Failed to upload document';
    const isTypeError = message.includes('cannot be processed') || message.includes('Supported file types');
    res.status(isTypeError ? 400 : 500).json({
      error: message,
      failure_reason: isTypeError ? message : 'Failed to upload document',
      code: isTypeError ? 'unsupported_type' : undefined,
    });
  }
});

// Process document (extract text, chunk, embed)
router.post('/:condocorpId/:documentId/process', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const condocorpId = routeParam(req, 'condocorpId');
    const documentId = routeParam(req, 'documentId');

    if (!(await hasCondoCorpAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const docResult = await pool.query(
      'SELECT * FROM documents WHERE id = $1 AND condocorp_id = $2',
      [documentId, condocorpId]
    );
    if (docResult.rows.length === 0) { res.status(404).json({ error: 'Document not found' }); return; }
    const doc = docResult.rows[0];

    const fileCheck = validateDocumentFilename(doc.filename);
    if (!fileCheck.ok) {
      processingFailure(res, documentId, 400, fileCheck.error);
      return;
    }
    const ext = fileCheck.ext;

    await pool.query(
      `UPDATE documents SET status = 'processing', failure_reason = NULL WHERE id = $1`,
      [documentId]
    );

    const filePath = path.join(UPLOAD_DIR, doc.file_path);
    if (!fs.existsSync(filePath)) {
      processingFailure(res, documentId, 404, PROCESSING_ERRORS.fileMissing);
      return;
    }

    let rawText = '';
    try {
      if (ext === 'txt') {
        rawText = fs.readFileSync(filePath, 'utf-8');
      } else if (ext === 'html' || ext === 'htm') {
        rawText = extractTextFromHtml(fs.readFileSync(filePath, 'utf-8'));
      } else if (ext === 'pdf') {
        rawText = await extractPdfText(filePath);
      } else if (isImageExtension(ext)) {
        rawText = await extractImageText(filePath);
      } else if (ext === 'docx') {
        const buffer = fs.readFileSync(filePath);
        const result = await mammoth.extractRawText({ buffer });
        rawText = result.value;
      }
    } catch (extractError) {
      const detail = extractError instanceof Error ? extractError.message : 'Extraction failed';
      const reason = detail.includes('DISABLE_OCR')
        ? PROCESSING_ERRORS.ocrDisabled
        : detail.includes('OCR')
          ? PROCESSING_ERRORS.ocrFailed
          : `Could not read this ${ext.toUpperCase()} file (${detail}). ${SUPPORTED_FORMATS_HELP}`;
      processingFailure(res, documentId, 400, reason);
      return;
    }

    const cleanedText = cleanText(rawText);
    if (!cleanedText) {
      const reason = isImageExtension(ext) || ext === 'pdf'
        ? (isOcrEnabled() ? PROCESSING_ERRORS.ocrFailed : PROCESSING_ERRORS.ocrDisabled)
        : PROCESSING_ERRORS.noTextExtracted(ext);
      processingFailure(res, documentId, 400, reason);
      return;
    }

    try {
      assertMeaningfulDocumentText(cleanedText);
    } catch (validationError) {
      const message =
        validationError instanceof Error ? validationError.message : PROCESSING_ERRORS.scannedPdf;
      const reason = isOcrEnabled() ? PROCESSING_ERRORS.scannedPdf : `${message} ${PROCESSING_ERRORS.ocrDisabled}`;
      processingFailure(res, documentId, 400, reason);
      return;
    }

    const textChunks = chunkText(cleanedText);
    if (textChunks.length === 0) {
      processingFailure(res, documentId, 400, PROCESSING_ERRORS.noChunks);
      return;
    }

    let embeddings: number[][];
    try {
      embeddings = await generateEmbeddings(textChunks);
    } catch (embedError) {
      const message = embedError instanceof Error ? embedError.message : '';
      const reason = message.includes('OPENAI_API_KEY')
        ? PROCESSING_ERRORS.openaiNotConfigured
        : `Indexing failed: ${message || 'embedding service error'}. Try Reprocess.`;
      processingFailure(res, documentId, 500, reason);
      return;
    }

    if (embeddings.length !== textChunks.length) {
      processingFailure(res, documentId, 500, PROCESSING_ERRORS.embeddingMismatch);
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);

      for (let i = 0; i < textChunks.length; i++) {
        const embeddingStr = `[${embeddings[i].join(',')}]`;
        await client.query(
          `INSERT INTO document_chunks (condocorp_id, document_id, chunk_number, chunk_text, embedding)
           VALUES ($1, $2, $3, $4, $5)`,
          [condocorpId, documentId, i + 1, textChunks[i], embeddingStr]
        );
      }

      await client.query(
        `UPDATE documents SET status = 'indexed', failure_reason = NULL WHERE id = $1`,
        [documentId]
      );
      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    await pool.query(
      `INSERT INTO audit_logs (condocorp_id, user_id, action, details)
       VALUES ($1, $2, 'document_processed', $3)`,
      [condocorpId, doc.uploaded_by, JSON.stringify({ description: `Processed ${doc.title}`, document_id: documentId, chunks_created: textChunks.length })]
    );

    res.json({ success: true, chunks_created: textChunks.length });
  } catch (error) {
    console.error('Processing error:', error);
    const failedDocId = routeParam(req, 'documentId');
    const message = error instanceof Error ? error.message : PROCESSING_ERRORS.generic;
    const reason = message.includes('OPENAI_API_KEY')
      ? PROCESSING_ERRORS.openaiNotConfigured
      : message || PROCESSING_ERRORS.generic;
    if (failedDocId) {
      try {
        await markDocumentFailed(failedDocId, reason);
      } catch (statusError) {
        console.error('Failed to mark document as failed:', statusError);
      }
    }
    res.status(500).json({ error: reason, failure_reason: reason });
  }
});

// Download / view original uploaded file
router.get('/:condocorpId/:documentId/file', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const condocorpId = routeParam(req, 'condocorpId');
    const documentId = routeParam(req, 'documentId');

    if (!(await hasCondoCorpAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const docResult = await pool.query(
      'SELECT filename, file_path FROM documents WHERE id = $1 AND condocorp_id = $2',
      [documentId, condocorpId]
    );
    if (docResult.rows.length === 0) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const doc = docResult.rows[0];
    const filePath = path.join(UPLOAD_DIR, doc.file_path);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: PROCESSING_ERRORS.fileMissing });
      return;
    }

    const contentType = contentTypeForFilename(doc.filename);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.filename)}"`);
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error('Get document file error:', error);
    res.status(500).json({ error: 'Failed to fetch document file' });
  }
});

// Get chunks for a document
router.get('/:condocorpId/:documentId/chunks', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const condocorpId = routeParam(req, 'condocorpId');
    const documentId = routeParam(req, 'documentId');

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
    const condocorpId = routeParam(req, 'condocorpId');
    const documentId = routeParam(req, 'documentId');

    if (!(await hasCondoCorpAccess(userId, condocorpId))) {
      res.status(403).json({ error: 'Access denied' });
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
