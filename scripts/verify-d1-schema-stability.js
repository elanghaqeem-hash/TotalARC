const fs = require('fs');
const path = require('path');

const root = process.cwd();
const libDir = path.join(root, 'src', 'lib');

const files = fs
  .readdirSync(libDir)
  .filter(name => /^d1.*\.ts$/.test(name) || name === 'auth.ts' || name === 'auth-security.ts')
  .map(name => path.join('src', 'lib', name));

const findings = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');

  if (/\bdb\.exec\(/.test(content)) {
    findings.push(
      file +
        ': direct db.exec() is blocked for runtime D1 schema initialization; execute DDL statements individually through prepared statements.'
    );
  }

  const schemaPromiseAll = /await\s+Promise\.all\(\[\s*([\s\S]*?)\s*\]\);/g;
  for (const match of content.matchAll(schemaPromiseAll)) {
    const inside = match[1];
    const ensures = Array.from(inside.matchAll(/ensure[A-Za-z0-9_]+\(\)/g));
    if (!ensures.length) continue;
    const remainder = inside
      .replace(/ensure[A-Za-z0-9_]+\(\)/g, '')
      .replace(/[\s,]/g, '');
    if (!remainder) {
      findings.push(
        file +
          ': concurrent schema dependency initialization is blocked; await dependent ensure* schema functions sequentially.'
      );
    }
  }
}



const hubPath = path.join(root, 'src', 'app', 'api', 'icofr', 'hub', 'route.ts');
if (!fs.existsSync(hubPath)) {
  findings.push('src/app/api/icofr/hub/route.ts: missing ICOFR hub route');
} else {
  const hub = fs.readFileSync(hubPath, 'utf8');
  const requiredHubPrewarm = [
    'await ensureIcofrScopeSchema();',
    'await ensureIcofrDomainSchema();',
    'await ensureIcofrTraceabilitySchema();',
    'await ensureIcofrCoverageSchema();',
    'await ensureIcofrTestingPlanSchema();',
    'await ensureIcofrCertificationSchema();',
    'await ensureIcofrExecutiveReportingSchema();'
  ];
  const fanOutIndex = hub.indexOf('const [');
  for (const marker of requiredHubPrewarm) {
    const markerIndex = hub.indexOf(marker);
    if (markerIndex < 0 || fanOutIndex < 0 || markerIndex > fanOutIndex) {
      findings.push(
        'src/app/api/icofr/hub/route.ts: ICOFR hub schema prewarm must complete before parallel read fan-out: ' + marker
      );
    }
  }
}



const integrityPath = path.join(root, 'src', 'lib', 'd1-icofr-integrity.ts');
if (fs.existsSync(integrityPath)) {
  const integrity = fs.readFileSync(integrityPath, 'utf8');
  for (const required of [
    'assertIntegrityTablesReady',
    'INTEGRITY_REQUIRED_TABLES',
    'db.batch',
    'Integrity verification is deliberately read-only'
  ]) {
    if (!integrity.includes(required)) {
      findings.push(
        'src/lib/d1-icofr-integrity.ts: missing read-efficient integrity marker: ' + required
      );
    }
  }
  for (const forbidden of [
    'ensureCoreDomainSchema()',
    'ensureIcofrScopeSchema()',
    'ensureIcofrDomainSchema()',
    'ensureIcofrTraceabilitySchema()',
    'ensureAssuranceSchema()',
    'ensureIcofrTestingPlanSchema()',
    'ensureIcofrCertificationSchema()'
  ]) {
    if (integrity.includes(forbidden)) {
      findings.push(
        'src/lib/d1-icofr-integrity.ts: production integrity verification must not execute runtime schema initialization: ' + forbidden
      );
    }
  }
}

const corePath = path.join(root, 'src', 'lib', 'd1-core.ts');
if (fs.existsSync(corePath)) {
  const core = fs.readFileSync(corePath, 'utf8');
  const dashboardStart = core.indexOf('export async function getCoreDashboardData');
  const dashboardEnd = core.indexOf('\nexport async function ', dashboardStart + 30);
  const dashboardBlock = dashboardStart >= 0
    ? core.slice(dashboardStart, dashboardEnd > dashboardStart ? dashboardEnd : core.length)
    : '';
  for (const marker of [
    "SUM(CASE WHEN criticality = 'Critical'",
    "SUM(CASE WHEN inherentRating = 'Critical'",
    "SUM(CASE WHEN isKeyControl = 1"
  ]) {
    if (!dashboardBlock.includes(marker)) {
      findings.push(
        'src/lib/d1-core.ts: dashboard metrics must aggregate repeated counts in one table scan: ' + marker
      );
    }
  }
}

const assurancePath = path.join(root, 'src', 'lib', 'd1-assurance.ts');
if (fs.existsSync(assurancePath)) {
  const assurance = fs.readFileSync(assurancePath, 'utf8');
  const metricsStart = assurance.indexOf('export async function getAssuranceDashboardMetrics');
  const metricsEnd = assurance.indexOf('\nexport async function ', metricsStart + 30);
  const metricsBlock = metricsStart >= 0
    ? assurance.slice(metricsStart, metricsEnd > metricsStart ? metricsEnd : assurance.length)
    : '';
  for (const required of [
    'ensureAssuranceColumns',
    "'humanApproved'",
    "'INTEGER NOT NULL DEFAULT 0'",
    "'approvedBy'"
  ]) {
    if (!assurance.includes(required)) {
      findings.push(
        'src/lib/d1-assurance.ts: existing assurance tables must migrate required columns: ' + required
      );
    }
  }

  for (const marker of [
    "SUM(CASE WHEN status <> 'Closed'",
    "SUM(CASE WHEN m.status = 'Overdue'",
    'COUNT(DISTINCT CASE WHEN c.isKeyControl = 1 THEN t.controlId END)'
  ]) {
    if (!metricsBlock.includes(marker)) {
      findings.push(
        'src/lib/d1-assurance.ts: assurance dashboard must use consolidated aggregate scans: ' + marker
      );
    }
  }
}

const rcmDraftPath = path.join(root, 'src', 'lib', 'd1-rcm-draft.ts');
if (fs.existsSync(rcmDraftPath)) {
  const rcmDraft = fs.readFileSync(rcmDraftPath, 'utf8');
  const start = rcmDraft.indexOf('export async function listBpmWithoutRcm');
  const end = rcmDraft.indexOf('\nfunction buildDerivedPair', start);
  const block = start >= 0 ? rcmDraft.slice(start, end > start ? end : rcmDraft.length) : '';
  for (const required of ['activity_counts AS (', 'risk_counts AS (', 'mapping_counts AS (']) {
    if (!block.includes(required)) {
      findings.push(
        'src/lib/d1-rcm-draft.ts: BPM without RCM query must pre-aggregate related counts: ' + required
      );
    }
  }
  if (/\(\s*SELECT\s+COUNT\s*\(\s*\*\s*\)\s+FROM\s+(ProcessActivity|RiskMaster|ControlMaster)/i.test(block)) {
    findings.push(
      'src/lib/d1-rcm-draft.ts: correlated COUNT(*) subqueries are blocked in listBpmWithoutRcm.'
    );
  }
}

const coveragePath = path.join(root, 'src', 'lib', 'd1-icofr-coverage.ts');
if (fs.existsSync(coveragePath)) {
  const coverage = fs.readFileSync(coveragePath, 'utf8');
  if (!coverage.includes('JOIN Issue i ON i.id = m.issueId') || !coverage.includes('WHERE i.institutionId = ?')) {
    findings.push(
      'src/lib/d1-icofr-coverage.ts: ManagementActionPlan reads must be scoped through Issue.institutionId.'
    );
  }
  if (!coverage.includes('export async function getIcofrCoverageMetrics')) {
    findings.push(
      'src/lib/d1-icofr-coverage.ts: lightweight aggregate ICOFR coverage metrics are required for hub loading.'
    );
  }
}

const traceabilityPath = path.join(root, 'src', 'lib', 'd1-icofr-traceability.ts');
if (fs.existsSync(traceabilityPath)) {
  const traceability = fs.readFileSync(traceabilityPath, 'utf8');
  if (!traceability.includes('export async function getTraceabilityMetrics')) {
    findings.push(
      'src/lib/d1-icofr-traceability.ts: lightweight aggregate traceability metrics are required to avoid hub N+1 reads.'
    );
  }
}

if (fs.existsSync(hubPath)) {
  const hub = fs.readFileSync(hubPath, 'utf8');
  if (!hub.includes('getTraceabilityMetrics()') || !hub.includes('getIcofrCoverageMetrics()')) {
    findings.push(
      'src/app/api/icofr/hub/route.ts: view=metrics must use lightweight aggregate metrics rather than full ICOFR graph loads.'
    );
  }
}

const queryInventory = files.reduce(
  (summary, file) => {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    summary.countStar += (content.match(/COUNT\s*\(\s*\*\s*\)/gi) || []).length;
    summary.selectStar += (content.match(/SELECT\s+(?:[A-Za-z_]\w*\.)?\*/gi) || []).length;
    summary.runtimeSchemaStatements +=
      (content.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS/gi) || []).length +
      (content.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/gi) || []).length;
    return summary;
  },
  { countStar: 0, selectStar: 0, runtimeSchemaStatements: 0 }
);
console.log('D1 static query inventory:', JSON.stringify(queryInventory));

if (findings.length) {
  console.error('D1 schema stability violations detected:');
  for (const finding of findings) console.error(' - ' + finding);
  process.exit(1);
}

console.log(
  'D1 schema/query stability verified: runtime schema DDL is serialized, hot-path D1 scans are guarded, and dependent schema initialization is deterministic.'
);
