'use client';

export type PdfCompressionQuality = 'high' | 'balanced' | 'small';
const MAX_PDF_PAGES = 300;
const YIELD_EVERY_PAGES = 4;

const presets = {
  high: { edge: 2600, quality: 0.9 },
  balanced: { edge: 2000, quality: 0.8 },
  small: { edge: 1500, quality: 0.65 }
};

async function importPdfDependencies() {
  const [pdfLib, pdfjs] = await Promise.all([import('pdf-lib'), import('pdfjs-dist')]);
  return { pdfLib, pdfjs };
}

let dependencyPromise: ReturnType<typeof importPdfDependencies> | null = null;

function loadPdfDependencies() {
  if (!dependencyPromise) {
    dependencyPromise = importPdfDependencies().catch(error => {
      dependencyPromise = null;
      throw error;
    });
  }
  return dependencyPromise;
}

export async function preloadPdfCompression() {
  await loadPdfDependencies();
}

export async function compressPdf(file: File, quality: PdfCompressionQuality, progress: (text: string) => void, signal?: AbortSignal) {
  if (!/\.pdf$/i.test(file.name)) throw new Error('Pilih file PDF.');
  if (file.size > 100 * 1024 * 1024) throw new Error('Kompresi di browser dibatasi 100 MB. Pisahkan PDF terlebih dahulu.');
  const check = () => { if (signal?.aborted) throw new Error('Kompresi dibatalkan.'); };
  progress('Membuka PDF…');
  const { pdfLib, pdfjs } = await loadPdfDependencies();
  const { PDFDocument, PDFName, PDFDict } = pdfLib;
  const bytes = new Uint8Array(await file.arrayBuffer());
  check();
  let source;
  try { source = await PDFDocument.load(bytes, { updateMetadata: false }); }
  catch { throw new Error('PDF tidak dapat dibuka. Pastikan file tidak rusak atau terkunci kata sandi.'); }
  for (const [, object] of source.context.enumerateIndirectObjects()) {
    if (object instanceof PDFDict && (object.has(PDFName.of('ByteRange')) || object.get(PDFName.of('FT')) === PDFName.of('Sig'))) {
      throw new Error('PDF bertanda tangan digital harus menggunakan file asli agar tanda tangan tetap valid.');
    }
  }
  const count = source.getPageCount();
  if (!count || count > MAX_PDF_PAGES) throw new Error(`Kompresi mendukung 1–${MAX_PDF_PAGES} halaman per file. Pisahkan PDF yang lebih panjang.`);
  // Documents with interactive/navigation structures only use lossless rewriting.
  const preserveStructure = ['AcroForm', 'Outlines', 'Names', 'StructTreeRoot'].some(key => source.catalog.has(PDFName.of(key))) ||
    source.getPages().some(page => (page.node.Annots()?.size() || 0) > 0);
  const compact = await source.save({ useObjectStreams: true });
  let best = compact;
  let scannedPages = 0;
  if (!preserveStructure) {
    pdfjs.GlobalWorkerOptions.workerSrc = '/ocr/pdf.worker.min.mjs';
    const task = pdfjs.getDocument({ data: bytes.slice(), cMapUrl: '/ocr/cmaps/', cMapPacked: true,
      standardFontDataUrl: '/ocr/standard_fonts/', wasmUrl: '/ocr/wasm/' });
    try {
      const pdf = await task.promise;
      const output = await PDFDocument.create();
      const preset = presets[quality];
      for (let i = 0; i < count; i++) {
        check();
        progress(`Mengompres halaman ${i + 1}/${count}…`);
        const page = await pdf.getPage(i + 1);
        try {
          const text = await page.getTextContent();
          const hasText = text.items.some(item => 'str' in item && item.str.trim());
          if (hasText) {
            const [copied] = await output.copyPages(source, [i]);
            output.addPage(copied);
          } else {
            const base = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: Math.min(2.5, preset.edge / Math.max(base.width, base.height)) });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            try {
              await page.render({ canvas, viewport, background: 'white' }).promise;
              check();
              const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Gambar halaman gagal dikompres.')), 'image/jpeg', preset.quality));
              const image = await output.embedJpg(await blob.arrayBuffer());
              const target = output.addPage([base.width, base.height]);
              target.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
              scannedPages++;
            } finally { canvas.width = canvas.height = 0; }
          }
        } finally {
          page.cleanup();
        }
        if ((i + 1) % YIELD_EVERY_PAGES === 0) {
          await new Promise<void>(resolve => setTimeout(resolve, 0));
        }
      }
      if (scannedPages) {
        const candidate = await output.save({ useObjectStreams: true });
        if (candidate.length < best.length) best = candidate;
      }
    } finally { await task.destroy(); }
  }
  check();
  if (best.length >= file.size) return { file, reduced: false, scannedPages };
  return { file: new File([best.slice().buffer as ArrayBuffer], file.name.replace(/\.pdf$/i, '-compressed.pdf'), { type: 'application/pdf' }), reduced: true, scannedPages };
}
