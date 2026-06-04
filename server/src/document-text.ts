import fs from 'fs';
import { PDFParse } from 'pdf-parse';
import { isOcrEnabled, ocrImageBuffer, ocrPdfFile } from './ocr.js';

const PAGE_MARKER_RE = /--\s*\d+\s+of\s+\d+\s*--/gi;
const MIN_CHUNK_CHARS = 50;
export const MIN_MEANINGFUL_DOC_CHARS = 200;

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'gif', 'bmp']);

/** Remove PDF page markers and normalize whitespace. */
export function cleanText(raw: string): string {
  return raw
    .replace(PAGE_MARKER_RE, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function chunkText(
  text: string,
  targetSize = 1000,
  overlap = 200,
  minChunkChars = MIN_CHUNK_CHARS
): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
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
        const piece = chunk.slice(start, start + targetSize).trim();
        if (piece.length >= minChunkChars) result.push(piece);
        start += targetSize - overlap;
      }
    } else if (chunk.trim().length >= minChunkChars) {
      result.push(chunk.trim());
    }
  }

  if (result.length > 0) return result;
  const fallback = text.trim();
  return fallback.length >= minChunkChars ? [fallback] : [];
}

export function meaningfulTextLength(text: string): number {
  return text.replace(/\s+/g, '').length;
}

export function hasMeaningfulText(text: string): boolean {
  return meaningfulTextLength(cleanText(text)) >= MIN_MEANINGFUL_DOC_CHARS;
}

export function assertMeaningfulDocumentText(cleanedText: string): void {
  if (!hasMeaningfulText(cleanedText)) {
    const hint = isOcrEnabled()
      ? 'Text extraction and OCR did not produce enough readable content.'
      : 'No selectable text found. Enable OCR on the server or upload a text-based PDF or DOCX.';
    throw new Error(hint);
  }
}

async function extractPdfTextNative(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const pdfData = await parser.getText();
    const pageTexts = pdfData.pages
      .map(p => p.text.trim())
      .filter(t => t.length > 0);
    if (pageTexts.length > 0) return pageTexts.join('\n\n');
    return pdfData.text;
  } finally {
    await parser.destroy();
  }
}

export async function extractPdfText(filePath: string): Promise<string> {
  const native = await extractPdfTextNative(filePath);
  if (hasMeaningfulText(native)) return native;

  if (!isOcrEnabled()) return native;

  console.log(`Running OCR on PDF: ${filePath}`);
  return ocrPdfFile(filePath);
}

export function isImageExtension(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext.toLowerCase());
}

export async function extractImageText(filePath: string): Promise<string> {
  if (!isOcrEnabled()) {
    throw new Error('Image files require OCR, which is disabled on this server (DISABLE_OCR=true).');
  }
  const buffer = fs.readFileSync(filePath);
  return ocrImageBuffer(buffer);
}

export function extractTextFromHtml(html: string): string {
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
