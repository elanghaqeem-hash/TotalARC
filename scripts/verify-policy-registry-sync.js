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
  assert(source.includes('canonicalDocumentType'), 'explicit document-type metadata classification missing');
  assert(source.includes('contentHash'), 'source hash deduplication missing');
  assert(
    source.includes('policyIdentityTitle') &&
      source.includes("normalize(candidate.documentType) + ':' + policyIdentityTitle(candidate.title)"),
    'policy deduplication must include document type and normalized artifact identity'
  );

  for (const phrase of [
    'standar operasional prosedur',
    'kebijakan',
    'peraturan (direksi|direktur)',
    'surat edaran',
    'instruksi kerja',
    'buku pedoman perusahaan',
    'piagam',
    'petunjuk teknis'
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
    "'REMEDIATION_MAP'",
    "'ICOFR_CONTROL'",
    "'EVIDENCE'",
    "'INTERNAL_POLICY'",
    "'CCM_RULE'",
    "'CCM_EXCEPTION'"
  ]) {
    assert(source.includes(target), 'relation target missing: ' + target);
  }

  assert(
    source.includes('OperationalRiskMetadata') &&
      source.includes('RCMControlSourceMetadata') &&
      source.includes('RCMDraftReference'),
    'source-backed Risk/RCM relationships must be synchronized'
  );

  assert(
    source.includes('PolicyRelationship') &&
      source.includes("'INTERNAL_POLICY'"),
    'internal/external policy relationship graph must be synchronized'
  );

  assert(
    source.includes("['PROCESS', 'RISK', 'CONTROL'].includes") &&
      source.includes('sourceTargetExists'),
    'source metadata targets must be allow-listed and tenant-validated'
  );

  assert(
    source.includes('isIcofrKey') &&
      source.includes('isItgc') &&
      source.includes("'ICOFR_CONTROL'"),
    'ICOFR control relationship propagation missing'
  );

  assert(
    source.includes("'SUPPORTING_EVIDENCE'") &&
      source.includes("'EVIDENCE'"),
    'related evidence propagation missing'
  );

  assert(
    source.includes("POLICY_REGISTRY_SYNC_VERSION = '2026-10-07-v3'") &&
      source.includes('syncVersion') &&
      source.includes('syncRequired'),
    'registry algorithm versioning and stale-rebuild detection missing'
  );

  assert(
    source.includes('FROM MonitoringRule') &&
      source.includes('FROM CCMException'),
    'CCM relationship propagation missing'
  );

  assert(
    source.includes('externalTitlePatterns') &&
      source.includes('peraturan otoritas jasa keuangan') &&
      source.includes('peraturan bank indonesia'),
    'external regulatory documents must be excluded from internal policy registration'
  );

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
    'Remediation/MAP',
    'Ketentuan Lain',
    'Evidence',
    'ICOFR/ToD/ToE',
    'CCM',
    'Buku Pedoman Perusahaan',
    'Petunjuk Teknis'
  ]) {
    assert(ui.includes(phrase), 'Policy Library UI missing: ' + phrase);
  }
  assert(ui.includes('registryAutoSyncAttempted'), 'automatic registry sync trigger missing');
  assert(ui.includes('syncRequired'), 'stale registry version must trigger one-time auto rebuild');
  assert(ui.includes('missingCandidates'), 'registry coverage status missing');
  assert(ui.includes("href: '/ccm'"), 'CCM navigation missing from policy relations');
  assert(ui.includes("href: '/processes'"), 'BPM navigation missing from policy relations');
  assert(ui.includes("href: '/rcm'"), 'RCM navigation missing from policy relations');
  return { ui: 'PASS' };
}

const result = {
  ...verifyRegistryLayer(),
  ...verifyApi(),
  ...verifyUi()
};

console.log('Policy registry synchronization verification: PASS');
console.log(JSON.stringify(result, null, 2));
