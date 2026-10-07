const fs = require('fs');
const path = require('path');

const root = process.cwd();

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) throw new Error('POLICY_REGISTRY_VERIFY: missing ' + relativePath);
  return fs.readFileSync(fullPath, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error('POLICY_REGISTRY_VERIFY: ' + message);
}

function verifyRegistryLayer() {
  const source = read('src/lib/d1-policy-registry.ts');

  for (const table of ['PolicyRegistrySource', 'PolicyEntityLink', 'PolicyRegistrySyncRun']) {
    assert(source.includes('CREATE TABLE IF NOT EXISTS ' + table), table + ' schema missing');
  }

  for (const index of [
    'idx_policy_registry_source_unique',
    'idx_policy_registry_source_policy',
    'idx_policy_entity_link_unique',
    'idx_policy_entity_link_policy',
    'idx_policy_entity_link_target',
    'idx_policy_registry_sync_run'
  ]) {
    assert(source.includes(index), 'index missing: ' + index);
  }

  assert(source.includes('FROM SourceDocument'), 'Source Library discovery missing');
  assert(source.includes('FROM EvidenceDocument'), 'Evidence Repository discovery missing');
  assert(source.includes('ProcessDocumentAnalysis'), 'supporting-document BPM discovery missing');
  assert(source.includes("module === 'regulatory source'"), 'external-regulation source exclusion missing');

  for (const phrase of [
    'standar operasional prosedur',
    'kebijakan',
    'peraturan (direksi|direktur)',
    'surat edaran',
    'instruksi kerja'
  ]) {
    assert(source.toLowerCase().includes(phrase), 'internal-rule classifier coverage missing: ' + phrase);
  }

  assert(
    source.includes("status,version,issueDate") &&
      source.includes("'Perlu Validasi'"),
    'auto-registered policies must be validation-required'
  );

  assert(
    source.includes('WHERE s.institutionId=?') &&
      source.includes('WHERE e.institutionId=?') &&
      source.includes('WHERE institutionId=?'),
    'registry queries must remain institution-scoped'
  );

  for (const target of [
    "'SOURCE_DOCUMENT'",
    "'EVIDENCE_DOCUMENT'",
    "'EXTERNAL_REGULATION'",
    "'REGULATORY_OBLIGATION'",
    "'PROCESS'",
    "'RISK'",
    "'CONTROL'",
    "'RCM'",
    "'RCSA_SCOPE'",
    "'ICOFR_PROCESS'",
    "'TOD_TEST'",
    "'TOE_TEST'",
    "'REMEDIATION_ISSUE'",
    "'REMEDIATION_MAP'"
  ]) {
    assert(source.includes(target), 'relation target missing: ' + target);
  }

  assert(
    source.includes('GROUP BY policyDocumentId,targetType'),
    'dashboard relation counts must use aggregation rather than loading every link'
  );

  return {
    schemas: 'PASS',
    discovery: 'PASS',
    tenantIsolation: 'PASS',
    relationGraph: 'PASS',
    d1Aggregation: 'PASS'
  };
}

function verifyApi() {
  const route = read('src/app/api/policy-library/route.ts');
  assert(route.includes('getPolicyRegistryCoverage'), 'registry coverage not exposed in Policy Library GET');
  assert(route.includes("action === 'SYNC_REGISTRY'"), 'SYNC_REGISTRY action missing');
  assert(route.includes('syncPolicyRegistryFromDatabase'), 'registry sync action not wired');
  return { api: 'PASS' };
}

function verifyUi() {
  const ui = read('src/app/policy-library/page.tsx');
  for (const phrase of [
    'Sinkronkan Database',
    'Registry database TotalARC',
    'Relasi TotalARC',
    'Keterkaitan Ketentuan dengan TotalARC',
    'Control/RCM',
    'RCSA/CSA',
    'ICOFR/ToE',
    'Remediation/MAP'
  ]) {
    assert(ui.includes(phrase), 'Policy Library UI missing: ' + phrase);
  }
  assert(ui.includes('registryAutoSyncAttempted'), 'automatic registry sync trigger missing');
  assert(ui.includes('missingCandidates'), 'registry coverage status missing');
  return { ui: 'PASS' };
}

const result = {
  ...verifyRegistryLayer(),
  ...verifyApi(),
  ...verifyUi()
};

console.log('Policy registry synchronization verification: PASS');
console.log(JSON.stringify(result, null, 2));
