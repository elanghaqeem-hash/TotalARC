const MAX_PDF_PAGES = 300;
const MAX_PREVIEW_CHARS = 90_000;
const MAX_CHUNK_CHARS = 85_000;
const MAX_CHUNKS = 16;
const MAX_TOTAL_CHARS = 1_100_000;
const MAX_SERIALIZED_CHARS = 1_350_000;

/** Browser OCR is user-supplied source material, never trusted instructions. */
export function readPdfTextInput(value: FormDataEntryValue | null, fileName: string) {
  if (value === null) return null;
  if (
    typeof value !== 'string' ||
    value.length > MAX_SERIALIZED_CHARS ||
    !/\.pdf$/i.test(fileName)
  ) {
    throw new Error('PDF_TEXT_INVALID');
  }

  let result: {
    text?: unknown;
    chunks?: unknown;
    pages?: unknown;
    ocrPages?: unknown;
    truncated?: unknown;
    totalTextChars?: unknown;
  };

  try {
    result = JSON.parse(value);
  } catch {
    throw new Error('PDF_TEXT_INVALID');
  }

  const chunks = Array.isArray(result?.chunks)
    ? result.chunks.filter((item): item is string => typeof item === 'string')
    : [];

  const totalChunkChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const chunksValid =
    chunks.length >= 1 &&
    chunks.length <= MAX_CHUNKS &&
    chunks.every(chunk => Boolean(chunk.trim()) && chunk.length <= MAX_CHUNK_CHARS) &&
    totalChunkChars <= MAX_TOTAL_CHARS;

  if (
    !result ||
    typeof result.text !== 'string' ||
    !result.text.trim() ||
    result.text.length > MAX_PREVIEW_CHARS ||
    !chunksValid ||
    !Number.isInteger(result.pages) ||
    Number(result.pages) < 1 ||
    Number(result.pages) > MAX_PDF_PAGES ||
    !Number.isInteger(result.ocrPages) ||
    Number(result.ocrPages) < 0 ||
    Number(result.ocrPages) > Number(result.pages)
  ) {
    throw new Error('PDF_TEXT_INVALID');
  }

  return {
    text: result.text,
    chunks,
    truncated: result.truncated === true,
    pages: Number(result.pages),
    ocrPages: Number(result.ocrPages),
    totalTextChars:
      Number.isInteger(result.totalTextChars) && Number(result.totalTextChars) >= totalChunkChars
        ? Number(result.totalTextChars)
        : totalChunkChars,
    method:
      Number(result.ocrPages) > 0
        ? ('browser-pdf-ocr' as const)
        : ('browser-pdf-text' as const)
  };
}
