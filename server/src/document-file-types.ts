export const SUPPORTED_EXTENSIONS = [
  'pdf',
  'docx',
  'txt',
  'html',
  'htm',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'tif',
  'tiff',
  'gif',
  'bmp',
] as const;
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'gif', 'bmp'] as const;

export const SUPPORTED_FORMATS_HELP =
  'Supported file types: PDF (.pdf, including scanned — OCR runs automatically), Word (.docx), plain text (.txt), HTML (.html), ' +
  'and images (.png, .jpg, .webp, .tif). Export legacy Word files as .docx, not .doc. Large scanned PDFs may take several minutes to process.';

export function getFileExtension(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? (parts.pop() ?? '') : '';
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain; charset=utf-8',
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

export function contentTypeForFilename(filename: string): string {
  const ext = getFileExtension(filename);
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}

export type DocumentFileValidation =
  | { ok: true; ext: SupportedExtension }
  | { ok: false; code: 'unsupported_type'; error: string };

export function validateDocumentFilename(filename: string): DocumentFileValidation {
  const ext = getFileExtension(filename);
  if (!ext) {
    return {
      ok: false,
      code: 'unsupported_type',
      error: `This file has no extension and cannot be processed. ${SUPPORTED_FORMATS_HELP}`,
    };
  }
  if (!SUPPORTED_EXTENSIONS.includes(ext as SupportedExtension)) {
    return {
      ok: false,
      code: 'unsupported_type',
      error:
        `File type ".${ext}" cannot be processed. ${SUPPORTED_FORMATS_HELP}`,
    };
  }
  return { ok: true, ext: ext as SupportedExtension };
}

export function unsupportedFileMessage(filename: string): string {
  const validation = validateDocumentFilename(filename);
  return validation.ok ? `Unsupported file. ${SUPPORTED_FORMATS_HELP}` : validation.error;
}

export const PROCESSING_ERRORS = {
  noTextExtracted: (ext: string) =>
    `No text could be extracted from this ${ext.toUpperCase()} file. ${SUPPORTED_FORMATS_HELP}`,
  scannedPdf:
    'Could not extract enough text from this PDF, even with OCR. Try a higher-resolution scan or upload the original .docx file.',
  ocrFailed:
    'OCR failed for this file. Ensure the scan is readable and not password-protected, then try Reprocess.',
  ocrDisabled:
    'This file needs OCR (scanned PDF or image), but OCR is disabled on the server. Contact your administrator.',
  noChunks: 'The document text was too short to index after processing.',
  fileMissing: 'The uploaded file is missing from storage. Delete this entry and upload again.',
  openaiNotConfigured:
    'OpenAI API key is not configured on the server. Set OPENAI_API_KEY in the environment and reprocess.',
  embeddingMismatch: 'Indexing failed while saving embeddings. Try Reprocess.',
  generic: 'Document processing failed. Try Reprocess or upload a supported file type.',
} as const;
