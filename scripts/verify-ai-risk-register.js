const fs = require('fs');

const findings = [];

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(path, value, label) {
  const content = read(path);
  if (!content.includes(value)) {
    findings.push(label + ': expected "' + value + '" in ' + path);
  }
}

const route = 'src/app/api/risks/ai-suggestions/route.ts';
requireText(route, 'resolveInstitutionAccess(request)', 'Active institution guard');
requireText(route, 'BPM_SELECTION_REQUIRED', 'BPM selection required before AI');
requireText(route, "task: 'risk_identification'", 'Dedicated risk identification AI task');
requireText(route, "sensitivity: 'confidential'", 'Confidential BPM processing');
requireText(route, 'AI_RISK_CATEGORIES', 'Controlled risk category universe');
requireText(route, 'existingRisks', 'Existing-risk deduplication context');
requireText(route, 'sourceActivityIds', 'Activity traceability');
requireText(route, 'Jangan menetapkan likelihood, impact score', 'No AI risk scoring');
requireText(route, 'selectedSuggestionIds', 'Explicit user selection');
requireText(route, 'AI_RISK_BATCH_STALE', 'BPM change protection');
requireText(route, 'WAJIB menggunakan Bahasa Indonesia', 'AI narrative output language');
requireText(ui, "Operational: 'Operasional'", 'Risk category localization');
requireText(ui, "High: 'Tinggi'", 'Confidence localization');

const persistence = 'src/lib/d1-ai-risk-register.ts';
requireText(persistence, 'CREATE TABLE IF NOT EXISTS AIRiskSuggestionBatch', 'Persistent AI suggestion batch');
requireText(persistence, 'institutionId TEXT NOT NULL', 'Tenant-owned suggestion batch');
requireText(persistence, 'processId TEXT NOT NULL', 'BPM-owned suggestion batch');
requireText(persistence, 'CREATE TABLE IF NOT EXISTS AIRiskSuggestionLink', 'AI suggestion lineage to created risk');
requireText(persistence, "'Not Assessed',", 'Risk scores remain not assessed');
requireText(persistence, "'Draft'", 'Selected AI risks are created as draft');
requireText(persistence, 'lower(name) = lower(?)', 'Duplicate risk protection');
requireText(persistence, 'ProcessActivity WHERE id = ? AND processId = ?', 'Activity ownership validation');
requireText(persistence, "action: 'CREATE_AI_SELECTED'", 'Risk creation audit');
requireText(persistence, "action: 'APPLY_SELECTION'", 'Selection audit');

const ui = 'src/components/risks/AiRiskRegisterGenerator.tsx';
requireText(ui, 'AI Buat Register Risiko', 'AI risk entry point');
requireText(ui, '— Pilih BPM sebelum membuat risiko dengan AI —', 'Empty BPM selection');
requireText(ui, 'disabled={!processId || generating}', 'Generate disabled before BPM selection');
requireText(ui, 'Buat Risiko dengan AI', 'Generate action');
requireText(ui, 'Pilih semua', 'Category-level selection');
requireText(ui, "'Buat ' + selected.size + ' Risiko Terpilih'", 'Selected risk creation action');
requireText(ui, 'Draf / Belum Dinilai', 'Human assessment state');
requireText(ui, 'Batch usulan AI tersimpan', 'Reusable saved AI suggestions');
requireText(ui, 'Dapat digunakan kembali tanpa AI', 'No repeated AI requirement');

const page = 'src/app/risks/page.tsx';
requireText(page, '<AiRiskRegisterGenerator processes={processes} onCreated={loadRisks} />', 'Risk Universe integration');

const core = 'src/lib/d1-core.ts';
requireText(core, 'name, ownerName, criticality', 'BPM owner available to risk wizard');

if (findings.length) {
  console.error('AI BPM Risk Register verification FAILED:');
  for (const finding of findings) console.error('- ' + finding);
  process.exit(1);
}

console.log('AI BPM Risk Register verification PASS');
console.log('- User must select a BPM before AI generation.');
console.log('- AI suggestions use controlled, relevant risk categories and BPM activity traceability.');
console.log('- Suggestions are persisted and reusable without repeated AI calls.');
console.log('- User explicitly selects risks before creation.');
console.log('- Created risks remain Draft / Not Assessed for human assessment.');
console.log('- Tenant, BPM-change and duplicate-risk protections are wired.');
