'use client';

import type { Worker } from 'tesseract.js';

const MAX_PDF_PAGES = 300;
const MAX_TOTAL_TEXT_CHARS = 1_100_000;
const AI_CHUNK_CHARS = 50_000;
const MAX_AI_CHUNKS = 24;
const PREVIEW_CHARS = 90_000;
const PREVIEW_HEAD_CHARS = 62_000;
const PREVIEW_MARKER = '\n\n[...preview dipersingkat; seluruh bagian tetap dikirim ke analisis bertahap Total ARC...]\n\n';
const YIELD_EVERY_PAGES = 3;

function splitSections(sections: string[]) {
  const chunks: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (!current.trim()) return;
    chunks.push(current.trim());
    current = '';
  };

  for (const section of sections) {
    if (section.length > AI_CHUNK_CHARS) {
      pushCurrent();
      for (let offset = 0; offset < section.length; offset += AI_CHUNK_CHARS) {
        chunks.push(section.slice(offset, offset + AI_CHUNK_CHARS));
      }
      continue;
    }

    const candidate = current ? current + '\n\n' + section : section;
    if (candidate.length > AI_CHUNK_CHARS) {
      pushCurrent();
      current = section;
    } else {
      current = candidate;
    }
  }
  pushCurrent();

  if (chunks.length > MAX_AI_CHUNKS) {
    throw new Error(
      'Isi teks PDF terlalu padat untuk satu analisis. Kurangi dokumen menjadi beberapa bagian agar seluruh isi tetap dianalisis tanpa ada halaman yang dibuang.'
    );
  }
  return chunks;
}

function previewText(fullText: string) {
  if (fullText.length <= PREVIEW_CHARS) return fullText;
  const tailChars = PREVIEW_CHARS - PREVIEW_HEAD_CHARS - PREVIEW_MARKER.length;
  return (
    fullText.slice(0, PREVIEW_HEAD_CHARS) +
    PREVIEW_MARKER +
    fullText.slice(-Math.max(0, tailChars))
  );
}

/** Read every page; OCR pages without useful text or all pages when requested. */
export async function preparePdfText(
  file: File,
  forceOcr: boolean,
  progress: (message: string) => void
) {
  if (!/\.pdf$/i.test(file.name)) return null;
  progress('Membuka PDF…');
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/ocr/pdf.worker.min.mjs';
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: '/ocr/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/ocr/standard_fonts/',
    wasmUrl: '/ocr/wasm/'
  });

  let worker: Worker | undefined;
  let pageNumber = 0;
  let pages = 0;
  let ocrPages = 0;
  let readablePages = 0;
  let totalTextChars = 0;
  const sections: string[] = [];

  try {
    const pdf = await task.promise;
    pages = pdf.numPages;
    if (!pages || pages > MAX_PDF_PAGES) {
      throw new Error(
        `PDF mendukung 1–${MAX_PDF_PAGES} halaman per analisis. Pisahkan dokumen yang lebih panjang.`
      );
    }

    for (pageNumber = 1; pageNumber <= pages; pageNumber++) {
      progress(`Membaca halaman ${pageNumber}/${pages}…`);
      const page = await pdf.getPage(pageNumber);
      try {
        const pageContent = await page.getTextContent();
        let pageText = pageContent.items
          .map(item => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
          .join('')
          .trim();

        const needsOcr = forceOcr || pageText.replace(/\s/g, '').length < 80;
        if (needsOcr) {
          if (!worker) {
            const { createWorker } = await import('tesseract.js');
            worker = await createWorker(['ind', 'eng'], 1, {
              workerPath: '/ocr/worker.min.js',
              corePath: '/ocr',
              langPath: '/ocr',
              workerBlobURL: false,
              logger: entry => {
                if (entry.status === 'recognizing text') {
                  progress(
                    `OCR halaman ${pageNumber}/${pages}: ${Math.round(entry.progress * 100)}%`
                  );
                }
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
            pageText = result.data.text.trim();
            if (pageText) readablePages++;
            ocrPages++;
            if (!pageText) {
              pageText = '[Tidak ada teks terbaca pada halaman ini. Periksa PDF asli.]';
            } else if (result.data.confidence < 60) {
              pageText =
                '[Hasil OCR kurang jelas; cocokkan dengan PDF asli.]\n' + pageText;
            }
          } finally {
            canvas.width = 0;
            canvas.height = 0;
          }
        }

        if (!needsOcr && pageText) readablePages++;

        const section = `--- Halaman ${pageNumber} ---\n${pageText}`;
        totalTextChars += section.length + 2;
        if (totalTextChars > MAX_TOTAL_TEXT_CHARS) {
          throw new Error(
            'Teks hasil pembacaan PDF terlalu besar untuk satu analisis penuh. Pisahkan dokumen menjadi beberapa bagian agar tidak ada isi yang diabaikan.'
          );
        }
        sections.push(section);
      } finally {
        page.cleanup();
      }

      if (pageNumber % YIELD_EVERY_PAGES === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }

    if (!readablePages) {
      throw new Error('Tidak ada teks yang dapat dibaca. Unggah scan yang lebih jelas.');
    }

    const fullText = sections.join('\n\n');
    const chunks = splitSections(sections);

    return {
      text: previewText(fullText),
      chunks,
      ocrPages,
      pages,
      truncated: false,
      totalTextChars: fullText.length
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') {
      throw new Error('PDF terkunci. Unggah salinan PDF tanpa kata sandi.');
    }
    throw error;
  } finally {
    try {
      await worker?.terminate();
    } finally {
      await task.destroy();
    }
  }
}
