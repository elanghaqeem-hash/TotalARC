'use client';

import type { Worker } from 'tesseract.js';

const MAX_PDF_PAGES = 300;
const MAX_TEXT_CHARS = 90000;
const TEXT_HEAD_CHARS = 65000;
const TRUNCATION_MARKER = '\n\n[...bagian tengah PDF diringkas oleh Total ARC karena dokumen panjang...]\n\n';
const TEXT_TAIL_CHARS = MAX_TEXT_CHARS - TEXT_HEAD_CHARS - TRUNCATION_MARKER.length;
const YIELD_EVERY_PAGES = 3;

/** Read every page; OCR pages without useful text or all pages when requested. */
export async function preparePdfText(file: File, forceOcr: boolean, progress: (message: string) => void) {
  if (!/\.pdf$/i.test(file.name)) return null;
  progress('Membuka PDF…');
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/ocr/pdf.worker.min.mjs';
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: '/ocr/cmaps/', cMapPacked: true,
    standardFontDataUrl: '/ocr/standard_fonts/', wasmUrl: '/ocr/wasm/'
  });
  let worker: Worker | undefined;
  let pageNumber = 0;
  let pages = 0;
  let ocrPages = 0;
  let readablePages = 0;
  let truncated = false;
  let headText = '';
  let tailText = '';

  const appendSection = (section: string) => {
    if (!truncated) {
      const next = headText ? headText + '\n\n' + section : section;
      if (next.length <= MAX_TEXT_CHARS) {
        headText = next;
        return;
      }
      truncated = true;
      headText = next.slice(0, TEXT_HEAD_CHARS);
      tailText = next.slice(-TEXT_TAIL_CHARS);
      return;
    }
    tailText = (tailText + '\n\n' + section).slice(-TEXT_TAIL_CHARS);
  };
  try {
    const pdf = await task.promise;
    pages = pdf.numPages;
    if (pages > MAX_PDF_PAGES) throw new Error(`PDF melebihi ${MAX_PDF_PAGES} halaman. Pisahkan dokumen dan unggah bertahap.`);
    for (pageNumber = 1; pageNumber <= pages; pageNumber++) {
      progress(`Membaca halaman ${pageNumber}/${pages}…`);
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        let text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
        const needsOcr = forceOcr || text.replace(/\s/g, '').length < 80;
        if (needsOcr) {
          if (!worker) {
            const { createWorker } = await import('tesseract.js');
            worker = await createWorker(['ind', 'eng'], 1, {
              workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr',
              workerBlobURL: false,
              logger: entry => {
                if (entry.status === 'recognizing text') progress(`OCR halaman ${pageNumber}/${pages}: ${Math.round(entry.progress * 100)}%`);
              }
            });
            await worker.setParameters({ preserve_interword_spaces: '1' });
          }
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(2.5, 2400 / Math.max(base.width, base.height));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          try {
            await page.render({ canvas, viewport }).promise;
            const result = await worker.recognize(canvas, { rotateAuto: true });
            text = result.data.text.trim();
            if (text) readablePages++;
            ocrPages++;
            if (!text) text = '[Tidak ada teks terbaca pada halaman ini. Periksa PDF asli.]';
            else if (result.data.confidence < 60) text = '[Hasil OCR kurang jelas; cocokkan dengan PDF asli.]\n' + text;
          } finally {
            canvas.width = canvas.height = 0;
          }
        }
        if (!needsOcr && text) readablePages++;
        appendSection(`--- Halaman ${pageNumber} ---\n${text}`);
      } finally {
        page.cleanup();
      }
      if (pageNumber % YIELD_EVERY_PAGES === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
    if (!readablePages) throw new Error('Tidak ada teks yang dapat dibaca. Unggah scan yang lebih jelas.');
    const text = truncated ? headText + TRUNCATION_MARKER + tailText : headText;
    return { text, ocrPages, pages, truncated };
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('PDF terkunci. Unggah salinan PDF tanpa kata sandi.');
    throw error;
  } finally {
    try { await worker?.terminate(); } finally { await task.destroy(); }
  }
}
