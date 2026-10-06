'use client';

import type { Worker } from 'tesseract.js';

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
  const sections: string[] = [];
  try {
    const pdf = await task.promise;
    pages = pdf.numPages;
    if (pages > 100) throw new Error('PDF melebihi 100 halaman. Pisahkan dokumen dan unggah bertahap.');
    for (pageNumber = 1; pageNumber <= pages; pageNumber++) {
      progress(`Membaca halaman ${pageNumber}/${pages}…`);
      const page = await pdf.getPage(pageNumber);
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
      sections.push(`--- Halaman ${pageNumber} ---\n${text}`);
      page.cleanup();
      if (sections.join('\n\n').length > 90000) throw new Error('Teks PDF melebihi kapasitas satu analisis. Pisahkan dokumen dan unggah bertahap.');
    }
    if (!readablePages) throw new Error('Tidak ada teks yang dapat dibaca. Unggah scan yang lebih jelas.');
    return { text: sections.join('\n\n'), ocrPages, pages };
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('PDF terkunci. Unggah salinan PDF tanpa kata sandi.');
    throw error;
  } finally {
    try { await worker?.terminate(); } finally { await task.destroy(); }
  }
}
