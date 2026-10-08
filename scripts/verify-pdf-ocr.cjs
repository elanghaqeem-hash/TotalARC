const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const output = ts.transpileModule(fs.readFileSync('src/lib/pdf-text-input.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(output, sandbox);
const { readPdfTextInput: read } = sandbox.exports;
assert.equal(read(null, 'a.pdf'), null);
const text = '--- Halaman 1 ---\nProsedur pembukaan rekening';
const input = { text, chunks: [text], pages: 1, ocrPages: 1, totalTextChars: text.length };
assert.equal(read(JSON.stringify(input), 'SCAN.PDF').method, 'browser-pdf-ocr');
assert.equal(read(JSON.stringify({ ...input, ocrPages: 0 }), 'a.pdf').method, 'browser-pdf-text');
assert.equal(read(JSON.stringify({ ...input, pages: 300, ocrPages: 0 }), 'a.pdf').method, 'browser-pdf-text');
const chunked = read(JSON.stringify({ ...input, text: 'preview', chunks: ['bagian 1', 'bagian 2'], totalTextChars: 16 }), 'a.pdf');
assert.equal(chunked.chunks.length, 2);
assert.equal(chunked.truncated, false);
assert.equal(read(JSON.stringify({ ...input, truncated: true }), 'a.pdf').truncated, true);
for (const value of [
  'null',
  '{}',
  'broken',
  JSON.stringify({ ...input, pages: 301 }),
  JSON.stringify({ ...input, ocrPages: 2 }),
  JSON.stringify({ ...input, text: 'a'.repeat(90001) }),
  JSON.stringify({ ...input, chunks: Array.from({ length: 25 }, () => 'x') }),
  JSON.stringify({ ...input, chunks: ['a'.repeat(50001)] })
]) {
  assert.throws(() => read(value, 'a.pdf'), /PDF_TEXT_INVALID/);
}
assert.throws(() => read(JSON.stringify(input), 'a.docx'), /PDF_TEXT_INVALID/);
console.log('PDF OCR input validation PASS');
