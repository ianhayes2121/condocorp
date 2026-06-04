import fs from 'fs';
import { PDFParse } from 'pdf-parse';
import { createWorker, type Worker } from 'tesseract.js';

const OCR_MAX_PAGES = Math.min(
  Math.max(parseInt(process.env.OCR_MAX_PAGES ?? '75', 10) || 75, 1),
  200
);
const OCR_SCALE = Math.min(Math.max(parseFloat(process.env.OCR_SCALE ?? '1.5') || 1.5, 1), 3);
const OCR_DISABLED = process.env.DISABLE_OCR === 'true';

let workerInstance: Worker | null = null;
let workerInit: Promise<Worker> | null = null;
let ocrQueue: Promise<unknown> = Promise.resolve();

function enqueueOcr<T>(task: () => Promise<T>): Promise<T> {
  const run = ocrQueue.then(task, task);
  ocrQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function getOcrWorker(): Promise<Worker> {
  if (workerInstance) return workerInstance;
  if (!workerInit) {
    workerInit = (async () => {
      const worker = await createWorker('eng');
      workerInstance = worker;
      return worker;
    })();
  }
  return workerInit;
}

export function isOcrEnabled(): boolean {
  return !OCR_DISABLED;
}

export async function ocrImageBuffer(image: Buffer | Uint8Array): Promise<string> {
  if (OCR_DISABLED) {
    throw new Error('OCR is disabled on this server (DISABLE_OCR=true).');
  }

  return enqueueOcr(async () => {
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(image);
    return data.text;
  });
}

/** OCR each page of a PDF (for scanned / image-only documents). */
export async function ocrPdfFile(filePath: string): Promise<string> {
  if (OCR_DISABLED) {
    throw new Error('OCR is disabled on this server (DISABLE_OCR=true).');
  }

  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const pdfData = await parser.getText();
    const totalPages = pdfData.total || pdfData.pages.length || 1;
    const pagesToProcess = Math.min(totalPages, OCR_MAX_PAGES);
    const parts: string[] = [];

    for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
      const shots = await parser.getScreenshot({ scale: OCR_SCALE, partial: [pageNum] });
      const page = shots.pages.find(p => p.pageNumber === pageNum) ?? shots.pages[0];
      if (!page?.data?.length) continue;

      const text = await ocrImageBuffer(Buffer.from(page.data));
      const trimmed = text.trim();
      if (trimmed) parts.push(trimmed);
    }

    if (totalPages > OCR_MAX_PAGES) {
      console.warn(
        `OCR stopped at ${OCR_MAX_PAGES} pages (document has ${totalPages}). Increase OCR_MAX_PAGES to process more.`
      );
    }

    return parts.join('\n\n');
  } finally {
    await parser.destroy();
  }
}
