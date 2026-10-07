const fs = require('fs');
const path = require('path');

const root = process.cwd();

function read(relativePath) {
  const full = path.join(root, relativePath);
  if (!fs.existsSync(full)) throw new Error('REG_CLAUSE_VERIFY_ERROR: missing ' + relativePath);
  return fs.readFileSync(full, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error('REG_CLAUSE_VERIFY_ERROR: ' + message);
}

function verifyDataLayer() {
  const source = read('src/lib/d1-regulatory-clause-intelligence.ts');

  assert(!/SELECT\s+(?:[A-Za-z_]\w*\.)?\*/i.test(source), 'Clause Intelligence must not use SELECT *.');

  for (const table of [
    'RegulationSourceVersion',
    'RegulatoryClauseSnapshot',
    'RegulatoryClauseAnalysisRun',
    'RegulatoryClauseDraft',
    'RegulatoryClauseImpactDraft'
  ]) {
    assert(source.includes('CREATE TABLE IF NOT EXISTS ' + table), table + ' schema missing.');
  }

  for (const index of [
    'idx_reg_source_version_unique',
    'idx_reg_source_version_regulation',
    'idx_reg_clause_snapshot_unique',
    'idx_reg_clause_snapshot_version',
    'idx_reg_clause_run',
    'idx_reg_clause_draft_unique',
    'idx_reg_clause_draft_status',
    'idx_reg_clause_impact_unique',
    'idx_reg_clause_impact_status'
  ]) {
    assert(source.includes(index), 'D1 index missing: ' + index);
  }

  assert(
    source.includes("WHERE id = ? AND institutionId = ?") &&
      source.includes("WHERE id = ? AND regulationId = ? AND institutionId = ?"),
    'Regulation/source/draft lookups must be tenant-scoped.'
  );

  assert(
    source.includes("matchAll(/(?:^|\\n)\\s*(PASAL") &&
      source.includes("textHash") &&
      source.includes("changeType"),
    'Deterministic Pasal parser + hash-based version comparison is required.'
  );

  assert(
    source.includes("Gunakan HANYA pasal/klausul yang diberikan") &&
      source.includes("Jangan menciptakan pasal") &&
      source.includes("clauseSnapshotId"),
    'AI prompt must prohibit invented clauses and bind drafts to source snapshots.'
  );

  assert(
    source.includes("status = 'APPROVED'") &&
      source.includes("createRegulatoryObligation(") &&
      source.includes("createRegulatoryObligationLink("),
    'Accepted obligations may only carry approved impact suggestions.'
  );

  const draftInsert = source.slice(
    source.indexOf('INSERT INTO RegulatoryClauseDraft'),
    source.indexOf('draftCount += 1')
  );
  const valuesLine = draftInsert.match(/VALUES\s*\(([^\n]+)\)/);
  assert(Boolean(valuesLine), 'Clause draft INSERT VALUES clause missing.');
  if (valuesLine) {
    const placeholders = (valuesLine[1].match(/\?/g) || []).length;
    const bindBlock = draftInsert.slice(draftInsert.indexOf(').bind('), draftInsert.lastIndexOf(').run()'));
    const bindArgs = bindBlock
      .replace(/^[\s\S]*?\.bind\(/, '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
    assert(placeholders === 19, 'Clause draft insert must have 19 bound placeholders.');
    assert(bindArgs.length === 19, 'Clause draft bind must supply exactly 19 arguments.');
  }

  return {
    dataLayer: 'PASS',
    hashComparison: true,
    aiGrounding: true,
    impactApprovalGate: true
  };
}

function verifyApiAndSecurity() {
  const route = read('src/app/api/policy-library/clauses/route.ts');
  const aiRoute = read('src/app/api/policy-library/clauses/analyze/route.ts');
  const upload = read('src/app/api/policy-library/clauses/source-upload/route.ts');
  const download = read('src/app/api/policy-library/clauses/source-download/route.ts');
  const access = read('src/lib/access-control.ts');

  for (const action of [
    'LINK_SOURCE_VERSION',
    'BUILD_SNAPSHOT',
    'COMPARE_VERSIONS',
    'REVIEW_IMPACT',
    'REVIEW_DRAFT'
  ]) {
    assert(route.includes(action), 'Clause Intelligence API action missing: ' + action);
  }

  assert(aiRoute.includes('guardAiPost('), 'Clause AI endpoint must use AI rate/security guard.');
  assert(aiRoute.includes("'ComplianceOfficer'"), 'Clause AI must allow ComplianceOfficer management.');
  assert(upload.includes("MAX_UPLOAD_BYTES = 8 * 1024 * 1024"), 'Regulatory source upload size cap missing.');
  assert(upload.includes("readPdfTextInput"), 'Regulatory PDF upload must require validated OCR/text payload.');
  assert(download.includes("getSourceBinary") && download.includes("context.institution.id"), 'Source download must be tenant-scoped.');
  assert(
    access.includes("pathname.startsWith('/api/policy-library')") &&
      access.includes("role === 'Admin' || role === 'ComplianceOfficer'"),
    'Central Policy Library RBAC must protect Clause Intelligence routes.'
  );

  return { api: 'PASS', upload: 'PASS', download: 'PASS', aiGuard: true };
}

function verifyUiAndRouting() {
  const page = read('src/app/policy-library/page.tsx');
  const ui = read('src/components/policy/RegulatoryClauseWorkspace.tsx');
  const types = read('src/lib/ai/types.ts');
  const config = read('src/lib/ai/admin-config.ts');

  assert(
    page.includes("'clauses'") &&
      page.includes('Clause Intelligence') &&
      page.includes('<RegulatoryClauseWorkspace'),
    'Clause Intelligence tab is not integrated into Policy Library.'
  );

  for (const phrase of [
    'Regulatory Clause Intelligence',
    'Sumber & Versi',
    'Perbandingan Pasal',
    'Draft Obligation AI',
    'Upload Dokumen Regulasi',
    'Terima Draft'
  ]) {
    assert(ui.includes(phrase), 'Clause Intelligence UI missing: ' + phrase);
  }

  assert(
    types.includes("'regulatory_clause_intelligence'") &&
      config.includes("id: 'regulatory_clause_intelligence'"),
    'AI feature routing for regulatory_clause_intelligence is missing.'
  );

  return { ui: 'PASS', aiRouting: 'PASS' };
}

const result = {
  ...verifyDataLayer(),
  ...verifyApiAndSecurity(),
  ...verifyUiAndRouting()
};

console.log('Regulatory Clause Intelligence verification: PASS');
console.log(JSON.stringify(result, null, 2));
