const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const output = ts.transpileModule(fs.readFileSync('src/lib/pdf-text-input.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(output, sandbox);
const { readPdfTextInput: read } = sandbox.exports;
assert.equal(read(null, 'a.pdf'), null);
const input = { text: '--- Halaman 1 ---\nProsedur pembukaan rekening', pages: 1, ocrPages: 1 };
assert.equal(read(JSON.stringify(input), 'SCAN.PDF').method, 'browser-pdf-ocr');
assert.equal(read(JSON.stringify({ ...input, ocrPages: 0 }), 'a.pdf').method, 'browser-pdf-text');
for (const value of ['null', '{}', 'broken', JSON.stringify({ ...input, pages: 101 }), JSON.stringify({ ...input, ocrPages: 2 }), JSON.stringify({ ...input, text: 'a'.repeat(90001) })]) {
  assert.throws(() => read(value, 'a.pdf'), /PDF_TEXT_INVALID/);
}
assert.throws(() => read(JSON.stringify(input), 'a.docx'), /PDF_TEXT_INVALID/);
console.log('PDF OCR input validation PASS');
