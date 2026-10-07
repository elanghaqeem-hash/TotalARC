const fs = require('fs');
const path = require('path');

const root = process.cwd();

function read(relativePath) {
  const full = path.join(root, relativePath);
  if (!fs.existsSync(full)) {
    throw new Error('POLICY_INTELLIGENCE_VERIFY_ERROR: missing ' + relativePath);
  }
  return fs.readFileSync(full, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error('POLICY_INTELLIGENCE_VERIFY_ERROR: ' + message);
  }
}

function verifyDataLayer() {
  const source = read('src/lib/d1-policy-intelligence.ts');

  assert(!/SELECT\s+\*/i.test(source), 'D1 Policy Intelligence must not use SELECT *.');
  assert(
    source.includes("host.endsWith('.go.id')"),
    'Regulatory scanner must restrict sources to Indonesian government/regulator domains.'
  );

  for (const table of [
    'RegulatoryWatchSource',
    'RegulatoryCandidate',
    'PolicyRelationship'
  ]) {
    assert(source.includes('CREATE TABLE IF NOT EXISTS ' + table), table + ' schema is missing.');
  }

  for (const marker of [
    'idx_regulatory_watch_source_url',
    'idx_regulatory_watch_source_active',
    'idx_regulatory_candidate_fingerprint',
    'idx_regulatory_candidate_status',
    'idx_policy_relationship_unique',
    'idx_policy_relationship_source',
    'idx_policy_relationship_target'
  ]) {
    assert(source.includes(marker), 'Required D1 index is missing: ' + marker);
  }

  for (const marker of [
    'WHERE institutionId = ?',
    'WHERE id = ? AND institutionId = ?',
    'institutionId, sourceType, sourceId',
    'institutionId, targetType, targetId'
  ]) {
    assert(source.includes(marker), 'Tenant-scoping marker is missing: ' + marker);
  }

  assert(
    source.includes("feature: 'regulatory_intelligence'") &&
      source.includes("sensitivity: 'confidential'"),
    'Regulatory AI screening must use the configured AI gateway with confidential sensitivity.'
  );
  assert(
    source.includes('screening awal') && source.includes('bukan opini hukum'),
    'AI prompt must preserve legal-review disclaimer.'
  );

  return {
    dataLayer: 'PASS',
    selectStar: 0,
    sourceAllowlist: '*.go.id',
    tenantScoped: true
  };
}

function verifyApiAndRbac() {
  const route = read('src/app/api/policy-library/intelligence/route.ts');
  const analyze = read('src/app/api/policy-library/intelligence/analyze/route.ts');
  const access = read('src/lib/access-control.ts');

  for (const action of [
    'ADD_SOURCE',
    'SEED_OFFICIAL_SOURCES',
    'SCAN_SOURCE',
    'SCAN_ALL',
    'MARK_CANDIDATE',
    'CREATE_RELATION'
  ]) {
    assert(route.includes(action), 'Intelligence API action missing: ' + action);
  }

  assert(
    route.includes("'ComplianceOfficer'") &&
      route.includes("'Executive'") &&
      route.includes("'ReadOnlyAuditor'"),
    'Policy Intelligence read/manage role contract is incomplete.'
  );
  assert(
    analyze.includes("guardAiPost(request, 'AI_ANALYZE_RATE_LIMIT'"),
    'AI analysis endpoint must use AI analysis rate limiting.'
  );
  assert(
    access.includes("{ api: '/api/policy-library', page: '/policy-library' }") &&
      access.includes("pathname.startsWith('/api/policy-library')"),
    'Policy Library API must be covered by central RBAC.'
  );

  return { api: 'PASS', aiRateLimit: true, centralRbac: true };
}

function verifyRelationshipUi() {
  const ui = read('src/components/policy/PolicyIntelligenceWorkspace.tsx');
  const page = read('src/app/policy-library/page.tsx');

  assert(
    page.includes("'intelligence'") &&
      page.includes('<PolicyIntelligenceWorkspace'),
    'Policy Intelligence workspace is not integrated into Policy Library.'
  );

  for (const relation of [
    'IMPLEMENTS',
    'REFERENCES',
    'AMENDS',
    'SUPERSEDES',
    'REVOKES',
    'RELATED_TO',
    'IMPACTED_BY',
    'DERIVED_FROM'
  ]) {
    assert(ui.includes(relation), 'Relationship type missing from UI: ' + relation);
  }

  assert(
    ui.includes("item.sourceType === 'INTERNAL' && item.targetType === 'INTERNAL'"),
    'Internal-to-internal relation view is missing.'
  );
  assert(
    ui.includes("item.sourceType === 'EXTERNAL' || item.targetType === 'EXTERNAL'"),
    'External relation view is missing.'
  );

  return { relationshipUi: 'PASS', relationTypes: 8 };
}

function verifyScheduler() {
  const cronRoute = read('src/app/api/policy-library/intelligence/cron/route.ts');
  const middleware = read('src/middleware.ts');
  const vercel = JSON.parse(read('vercel.json'));
  const workflow = read('.github/workflows/regulatory-monitor.yml');

  assert(
    cronRoute.includes('REGULATORY_MONITOR_CRON_SECRET') &&
      cronRoute.includes('CRON_SECRET') &&
      cronRoute.includes("authorization") &&
      cronRoute.includes('x-totalarc-cron-secret'),
    'Scheduled monitor must support secured Vercel and external scheduler authentication.'
  );
  assert(
    middleware.includes('authorizedRegulatoryCron') &&
      middleware.includes("['GET', 'POST'].includes(request.method)"),
    'Middleware must only bypass session auth for an authenticated regulatory cron request.'
  );

  const cron = Array.isArray(vercel.crons) ? vercel.crons[0] : null;
  assert(
    cron &&
      cron.path === '/api/policy-library/intelligence/cron' &&
      cron.schedule === '0 1 * * *',
    'Vercel daily regulatory cron must run at 01:00 UTC / 08:00 WIB.'
  );
  assert(
    workflow.includes("cron: '10 1 * * *'") &&
      workflow.includes('TOTALARC_REGULATORY_MONITOR_URL') &&
      workflow.includes('REGULATORY_MONITOR_CRON_SECRET'),
    'GitHub Actions fallback scheduler contract is incomplete.'
  );

  return { scheduler: 'PASS', vercelWib: '08:00', fallbackWib: '08:10' };
}

function verifyAiCatalog() {
  const types = read('src/lib/ai/types.ts');
  const admin = read('src/lib/ai/admin-config.ts');

  assert(
    types.includes("'regulatory_intelligence'"),
    'AI feature type regulatory_intelligence is missing.'
  );
  assert(
    admin.includes("id: 'regulatory_intelligence'") &&
      admin.includes("page: '/policy-library'"),
    'AI admin routing catalog does not expose Regulatory Intelligence.'
  );

  return { aiCatalog: 'PASS', configurableRouting: true };
}

const result = {
  ...verifyDataLayer(),
  ...verifyApiAndRbac(),
  ...verifyRelationshipUi(),
  ...verifyScheduler(),
  ...verifyAiCatalog()
};

console.log('Policy & Regulatory Intelligence verification: PASS');
console.log(JSON.stringify(result, null, 2));
