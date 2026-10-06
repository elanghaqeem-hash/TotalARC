const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'public/ocr');
fs.mkdirSync(dest, { recursive: true });
function copy(source, target) {
  fs.cpSync(path.join(root, 'node_modules', source), path.join(dest, target), { recursive: true });
}
copy('pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs');
for (const dir of ['cmaps', 'standard_fonts', 'wasm']) copy('pdfjs-dist/' + dir, dir);
copy('tesseract.js/dist/worker.min.js', 'worker.min.js');
for (const file of fs.readdirSync(path.join(root, 'node_modules/tesseract.js-core'))) {
  if (/^tesseract-core.*\.(js|wasm)$/.test(file)) copy('tesseract.js-core/' + file, file);
}
for (const lang of ['ind', 'eng']) copy('@tesseract.js-data/' + lang + '/4.0.0_best_int/' + lang + '.traineddata.gz', lang + '.traineddata.gz');
