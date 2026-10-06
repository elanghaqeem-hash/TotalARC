/** Browser OCR is user-supplied source material, never trusted instructions. */
export function readPdfTextInput(value: FormDataEntryValue | null, fileName: string) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 550000 || !/\.pdf$/i.test(fileName)) {
    throw new Error('PDF_TEXT_INVALID');
  }
  let result: { text?: unknown; pages?: unknown; ocrPages?: unknown };
  try { result = JSON.parse(value); } catch { throw new Error('PDF_TEXT_INVALID'); }
  if (!result || typeof result.text !== 'string' || !result.text.trim() || result.text.length > 90000 ||
      !Number.isInteger(result.pages) || Number(result.pages) < 1 || Number(result.pages) > 100 ||
      !Number.isInteger(result.ocrPages) || Number(result.ocrPages) < 0 || Number(result.ocrPages) > Number(result.pages)) {
    throw new Error('PDF_TEXT_INVALID');
  }
  return {
    text: result.text,
    truncated: false,
    method: Number(result.ocrPages) > 0 ? 'browser-pdf-ocr' as const : 'browser-pdf-text' as const
  };
}
