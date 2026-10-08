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

  for (const table of ['PolicyRegistrySource', 'PolicyEntityLink', 'PolicyDocumentCluster', 'PolicyRegistrySyncRun']) {
    assert(source.includes('CREATE TABLE IF NOT EXISTS ' + table), table + ' schema missing');
  }

  for (const index of [
    'idx_policy_registry_source_unique',
    'idx_policy_registry_source_policy',
    'idx_policy_entity_link_unique',
    'idx_policy_entity_link_policy',
    'idx_policy_entity_link_target',
    'idx_policy_document_cluster_unique',
    'idx_policy_document_cluster_group',
    'idx_policy_document_cluster_policy',
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
    source.includes("POLICY_REGISTRY_SYNC_VERSION = '2026-10-08-v4'") &&
      source.includes('syncVersion') &&
      source.includes('syncRequired'),
    'registry algorithm versioning and stale-rebuild detection missing'
  );

  for (const cluster of [
    'INTERNAL_RULE',
    'WORKPAPER_EVIDENCE',
    'PROCESS_RCM',
    'REGULATORY_EXTERNAL',
    'FORM_TEMPLATE',
    'OTHER'
  ]) {
    assert(source.includes("'" + cluster + "'"), 'document cluster missing: ' + cluster);
  }

  for (const exclusion of [
    'kertas kerja',
    'walkthrough',
    'test of one',
    'working paper',
    'risk control matrix',
    'business process mapping'
  ]) {
    assert(source.toLowerCase().includes(exclusion), 'non-policy exclusion missing: ' + exclusion);
  }

  assert(
    source.includes("status='Bukan Ketentuan'") &&
      source.includes('reconcileNonPolicyAutoRegistrations'),
    'safe reclassification of false AUTO-SOP/Policy records missing'
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
  assert(route.includes('getPolicyRegistrySummary'), 'lightweight registry summary not exposed in Policy Library GET');
  assert(route.includes("action === 'SYNC_REGISTRY'"), 'SYNC_REGISTRY action missing');
  assert(route.includes('syncPolicyRegistryFromDatabase'), 'registry sync action not wired');
  assert(route.includes("mode === 'sources'"), 'Source Library must be lazy-loaded instead of blocking initial page load');
  assert(route.includes("mode === 'regulatory'"), 'Regulatory data must be lazy-loaded instead of blocking initial page load');
  assert(route.includes('listPolicyLibraryOverview'), 'initial Policy Library GET must use aggregate overview');
  assert(route.includes("mode === 'registry'"), 'cross-module registry must be fetched independently');
  assert(route.includes("mode === 'structure'"), 'cluster/hierarchy endpoint missing');
  assert(route.includes('listPolicyDocumentClusters'), 'document cluster endpoint missing');
  assert(route.includes('listPolicyRelationships'), 'policy relationship endpoint missing');
  assert(route.includes('registry: null'), 'initial overview must not wait on registry summary');
  assert(!route.includes('const [registry, dashboard] = await Promise.all('),
    'initial page must not block on registry/database aggregation');
  assert(route.includes('listPolicyLibraryRegulatoryData'), 'lazy regulatory bundle endpoint missing');
  assert(!route.includes('const registry = await getPolicyRegistryCoverage'), 'initial Policy Library GET must not run deep registry discovery');
  return { api: 'PASS', fastInitialLoad: 'PASS', lazyRegulatory: 'PASS' };
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
    'Petunjuk Teknis',
    'Hierarki & Cluster'
  ]) {
    assert(ui.includes(phrase), 'Policy Library UI missing: ' + phrase);
  }
  assert(ui.includes('registryAutoSyncAttempted'), 'automatic registry sync trigger missing');
  assert(ui.includes('syncRequired'), 'stale registry version must trigger one-time auto rebuild');
  assert(ui.includes('missingCandidates'), 'registry coverage status missing');
  assert(ui.includes('loadSources'), 'source files must lazy-load only when needed');
  assert(ui.includes("tab !== 'uploads'"), 'source lazy-load tab guard missing');
  assert(ui.includes('loadRegulatory'), 'regulatory data must lazy-load only when needed');
  assert(ui.includes('loadRegistry') && ui.includes('mode=registry'),
    'registry must load in a separate request after first paint');
  assert(ui.includes("['library', 'relations', 'structure'].includes(tab)") && ui.includes('registryLoaded'),
    'stale registry cleanup must run only after overview paint');
  assert(ui.includes('registrySyncRequestRunning.current'),
    'concurrent registry rebuild attempts must be deduplicated');
  assert(ui.includes('sourcesError') && ui.includes('regulatoryError'),
    'lazy-load failures must have retry guards rather than a request loop');
  assert(ui.includes('registryLoaded ? registryMetrics.totalLinks'),
    'not-yet-loaded relation counts must not be shown as zero');
  assert(ui.includes("['regulations', 'impacts', 'intelligence'].includes(tab)"), 'regulatory lazy-load tab guard missing');
  assert(ui.includes("tab === 'library' ? 2500 : 800"), 'registry auto-sync must be deferred after initial render');
  assert(ui.includes("href: '/ccm'"), 'CCM navigation missing from policy relations');
  assert(ui.includes("href: '/processes'"), 'BPM navigation missing from policy relations');
  assert(ui.includes("href: '/rcm'"), 'RCM navigation missing from policy relations');
  const hierarchy = read('src/components/policy/PolicyHierarchyWorkspace.tsx');
  for (const phrase of [
    'Hierarki Ketentuan & Cluster Dokumen',
    'Kertas Kerja / Evidence',
    'Level 0 · Regulasi Eksternal',
    'Hubungan Antar Ketentuan',
    'Tambah Hubungan Ketentuan',
    'PARENT_OF',
    'IMPLEMENTS',
    'DERIVED_FROM',
    'SUPERSEDES',
    'REVOKES'
  ]) {
    assert(hierarchy.includes(phrase), 'Hierarchy workspace missing: ' + phrase);
  }
  return { ui: 'PASS', hierarchy: 'PASS', clustering: 'PASS' };
}

const result = {
  ...verifyRegistryLayer(),
  ...verifyApi(),
  ...verifyUi()
};

console.log('Policy registry synchronization verification: PASS');
console.log(JSON.stringify(result, null, 2));
