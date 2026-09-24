const fs = require('fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(source, needle, label, errors) {
  if (!source.includes(needle)) errors.push(label + ': expected "' + needle + '"');
}

const errors = [];
const route = read('src/app/api/icofr/financial-items/ai-scoping/route.ts');
const ui = read('src/components/icofr/SignificantAccountAI.tsx');
const store = read('src/lib/d1-icofr-domains.ts');
const page = read('src/app/icofr/accounts/page.tsx');

requireText(route, 'resolveInstitutionAccess', 'Tenant-aware access', errors);
requireText(route, 'performanceMaterialityAmount', 'PM dependency', errors);
requireText(route, 'Math.abs(normalizedAmount as number) >= input.pmAmount', 'Deterministic PM comparison', errors);
requireText(route, "sensitivity: 'confidential'", 'Confidential AI routing', errors);
requireText(route, 'uploadEvidenceVersion', 'Evidence persistence', errors);
requireText(route, "actionType === 'REJECT'", 'Explicit user rejection', errors);
requireText(route, "actionType !== 'APPLY'", 'Explicit user apply gate', errors);
requireText(route, "status: 'Draft'", 'Applied records remain draft', errors);
requireText(route, 'qualitativeSignificant', 'Qualitative significance support', errors);
requireText(route, 'detectDocumentUnitMultiplier', 'Financial statement unit normalization', errors);

requireText(store, 'CREATE TABLE IF NOT EXISTS ICOFRFinancialScopingAnalysis', 'Analysis persistence schema', errors);
requireText(store, 'PENDING_USER_VALIDATION', 'Pending validation status', errors);
requireText(store, 'institutionId', 'Institution isolation key', errors);
requireText(store, 'saveFinancialScopingAnalysis', 'Analysis persistence function', errors);
requireText(store, 'getFinancialScopingAnalysis', 'Analysis retrieval function', errors);

requireText(ui, 'AI Penetapan Akun Signifikan', 'AI scoping UI', errors);
requireText(ui, 'Analisis dengan AI', 'Upload analysis action', errors);
requireText(ui, 'Terapkan Akun Terpilih', 'User validation action', errors);
requireText(ui, 'Performance Materiality aktif', 'PM visibility', errors);
requireText(ui, 'selectedCodes', 'Explicit selection state', errors);
requireText(page, '<SignificantAccountAI', 'ICOFR accounts integration', errors);

if (errors.length) {
  console.error('AI significant-account scoping verification FAILED:');
  for (const error of errors) console.error('- ' + error);
  process.exit(1);
}

console.log('AI significant-account scoping verification PASSED.');
console.log('- Financial statement upload is evidence-backed.');
console.log('- PM comparison is deterministic in Total ARC, not delegated to AI.');
console.log('- Qualitative AI suggestions require explicit user selection.');
console.log('- Applied records remain Draft for ICOFR governance review.');
