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

export const SUPPORTED_FORMATS_HELP =
  'Supported file types: PDF (.pdf, including scanned — OCR runs automatically), Word (.docx), plain text (.txt), HTML (.html), ' +
  'and images (.png, .jpg, .webp, .tif). Export legacy Word files as .docx, not .doc. Large scanned PDFs may take several minutes to process.';

export const DROPZONE_ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
  'text/html': ['.html', '.htm'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'image/tiff': ['.tif', '.tiff'],
  'image/gif': ['.gif'],
  'image/bmp': ['.bmp'],
} as const;

export function getFileExtension(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? (parts.pop() ?? '') : '';
}

export function validateDocumentFilename(filename: string): string | null {
  const ext = getFileExtension(filename);
  if (!ext) {
    return `This file has no extension and cannot be processed. ${SUPPORTED_FORMATS_HELP}`;
  }
  if (!SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) {
    return `File type ".${ext}" cannot be processed. ${SUPPORTED_FORMATS_HELP}`;
  }
  return null;
}
