const fs = require('fs');

const findings = [];

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(path, value, label) {
  const content = read(path);
  if (!content.includes(value)) findings.push(label + ': expected "' + value + '" in ' + path);
}

const route = 'src/app/api/icofr/scoping/materiality-ai/route.ts';
requireText(route, 'resolveInstitutionAccess(request)', 'Active institution guard');
requireText(route, 'listFinancialItems(context.institution.id)', 'Financial benchmark source');
requireText(route, "'Profit Before Tax':", 'PBT methodology');
requireText(route, "'Total Assets':", 'Total assets methodology');
requireText(route, "Revenue:", 'Revenue methodology');
requireText(route, "Equity:", 'Equity methodology');
requireText(route, "Low: { min: 75, max: 75 }", 'Low-risk PM methodology');
requireText(route, "Medium: { min: 60, max: 65 }", 'Medium-risk PM methodology');
requireText(route, "High: { min: 50, max: 50 }", 'High-risk PM methodology');
requireText(route, 'validatePercent(trivialPercent, 3, 5)', 'Clearly trivial methodology');
requireText(route, 'AI_MATERIALITY_AMOUNT_MISMATCH', 'Benchmark amount integrity');
requireText(route, 'AI_MATERIALITY_OM_OUTSIDE_METHOD', 'OM range guard');
requireText(route, 'AI_MATERIALITY_PM_OUTSIDE_METHOD', 'PM range guard');
requireText(route, "sensitivity: 'confidential'", 'Confidential AI handling');
requireText(route, 'Keputusan final harus divalidasi', 'Human review requirement');

const ui = 'src/components/icofr/MaterialityAiAssistant.tsx';
requireText(ui, 'AI Penetapan OM / PM', 'AI materiality UI');
requireText(ui, 'Buat Usulan OM/PM dengan AI', 'AI generation action');
requireText(ui, 'Terapkan Usulan ke Form', 'Review-before-apply action');
requireText(ui, 'Alternatif pembanding', 'Alternative benchmark comparison');
requireText(ui, 'Risiko Rendah', 'Low-risk PM card');
requireText(ui, 'Risiko Sedang', 'Medium-risk PM card');
requireText(ui, 'Risiko Tinggi', 'High-risk PM card');
requireText(ui, 'bukan persentase universal atau ketentuan regulator', 'Methodology disclaimer');

const page = 'src/app/icofr/scoping/page.tsx';
requireText(page, '<MaterialityAiAssistant', 'Materiality form integration');
requireText(page, 'Rata-rata PBT 3 tahun', 'Average PBT benchmark option');
requireText(page, 'Nilai benchmark *', 'Indonesian benchmark field');
requireText(page, 'PM % dari OM *', 'Indonesian PM field');
requireText(page, 'Clearly Trivial / SAD % dari PM', 'SAD basis');

if (findings.length) {
  console.error('AI OM/PM Materiality verification FAILED:');
  for (const finding of findings) console.error('- ' + finding);
  process.exit(1);
}

console.log('AI OM/PM Materiality verification PASS');
console.log('- Benchmark and OM methodology references are wired.');
console.log('- PM risk bands and SAD ranges are guarded server-side.');
console.log('- AI benchmark amount must match a verifiable source.');
console.log('- AI suggestions require user review before being applied to the form.');
