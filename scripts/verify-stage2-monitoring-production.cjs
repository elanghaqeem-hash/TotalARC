/**
 * Stage 2 Compliance Monitoring production readiness.
 * Uses the exact deployed D1 binding, additive DDL and read-only integrity
 * checks. Never inserts/updates/deletes bank monitoring or RCM records.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const name = String(process.env.TOTALARC_D1_DATABASE_NAME || '').trim();
const id = String(process.env.TOTALARC_D1_DATABASE_ID || '').trim();
const site = String(process.env.TOTALARC_PRODUCTION_URL || '').replace(/\/+$/, '');
if (!name || !id || !/^https:\/\//.test(site)) {
  throw Error('STAGE2_MONITORING_PINNED_PRODUCTION_CONFIG_REQUIRED');
}
const config = JSON.parse(fs.readFileSync('wrangler.production.json', 'utf8'));
const binding = (config.d1_databases || []).filter(item => item.binding === 'DB');
assert.equal(binding.length, 1, 'DB binding must be unique');
assert.equal(binding[0].database_id, id, 'D1 database ID mismatch');
assert.equal(binding[0].database_name, name, 'D1 database name mismatch');

function query(sql) {
  const stdout = execFileSync(
    'npx', ['wrangler', 'd1', 'execute', name, '--remote', '--json', '--command', sql],
    { encoding: 'utf8', timeout: 90000, maxBuffer: 4 * 1024 * 1024, env: process.env }
  );
  const response = JSON.parse(stdout);
  assert.ok(Array.isArray(response) && response.length, 'D1 CLI returned unexpected response');
  assert.ok(response.every(block => block.success !== false), 'D1 SQL execution failed');
  return response.flatMap(block => Array.isArray(block.results) ? block.results : []);
}
function count(sql) {
  const data = query(sql);
  return Number(data[0]?.count || 0);
}
const institution = query(
  "SELECT id FROM Institution WHERE legalName = 'PT. Bank Pembangunan Daerah Kalimantan Barat' LIMIT 2"
);
assert.equal(institution.length, 1, 'Bank Kalbar production D1 identity is not unique');

// Identical schema/index names to src/lib/d1-compliance-monitoring.ts.
// Only IF NOT EXISTS changes are allowed: historical plans must be preserved.
const ddl = [
  "CREATE TABLE IF NOT EXISTS ComplianceMonitoringPlan (id TEXT PRIMARY KEY, institutionId TEXT NOT NULL, code TEXT NOT NULL, title TEXT NOT NULL, year INTEGER NOT NULL, period TEXT NOT NULL, quarter INTEGER, objective TEXT NOT NULL, scope TEXT NOT NULL, ownerUnitId TEXT NOT NULL, startDate TEXT NOT NULL, endDate TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT', preparedById TEXT NOT NULL, submittedAt TEXT, approvedById TEXT, approvedAt TEXT, reviewNote TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_cmp_plan_code ON ComplianceMonitoringPlan(institutionId,code)",
  "CREATE INDEX IF NOT EXISTS idx_cmp_plan_queue ON ComplianceMonitoringPlan(institutionId,year,status,startDate)",
  "CREATE TABLE IF NOT EXISTS ComplianceMonitoringActivity (id TEXT PRIMARY KEY, institutionId TEXT NOT NULL, planId TEXT NOT NULL, obligationId TEXT NOT NULL, processId TEXT, ownerUnitId TEXT NOT NULL, description TEXT NOT NULL, scheduledDate TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PLANNED', actualDate TEXT, outcomeNote TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_cmp_activity_plan ON ComplianceMonitoringActivity(institutionId,planId,scheduledDate)",
  "CREATE INDEX IF NOT EXISTS idx_cmp_activity_obligation ON ComplianceMonitoringActivity(institutionId,obligationId)",
  "CREATE TABLE IF NOT EXISTS ComplianceMonitoringEvent (id TEXT PRIMARY KEY, institutionId TEXT NOT NULL, planId TEXT NOT NULL, actorId TEXT NOT NULL, actorRole TEXT NOT NULL, action TEXT NOT NULL, detail TEXT, createdAt TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_cmp_event_plan ON ComplianceMonitoringEvent(institutionId,planId,createdAt)"
];
for (const sql of ddl) query(sql);

// Catch schema drift instead of trusting CREATE TABLE IF NOT EXISTS on legacy D1.
const columns = {
  ComplianceMonitoringPlan: ['id','institutionId','code','status','preparedById','approvedById','ownerUnitId','updatedAt'],
  ComplianceMonitoringActivity: ['id','institutionId','planId','obligationId','ownerUnitId','processId','status'],
  ComplianceMonitoringEvent: ['id','institutionId','planId','actorId','action','createdAt']
};
for (const [table, required] of Object.entries(columns)) {
  const actual = new Set(query('PRAGMA table_info(' + table + ')').map(row => row.name));
  for (const col of required) assert.ok(actual.has(col), 'Missing Stage 2 column: ' + table + '.' + col);
}
const indexes = new Set(query(
  "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_cmp_%'"
).map(row => row.name));
for (const index of [
  'idx_cmp_plan_code','idx_cmp_plan_queue','idx_cmp_activity_plan',
  'idx_cmp_activity_obligation','idx_cmp_event_plan'
]) assert.ok(indexes.has(index), 'Missing Stage 2 index: ' + index);

const checks = {
  planOwnerMissing: "SELECT COUNT(*) AS count FROM ComplianceMonitoringPlan p LEFT JOIN OrganizationUnit u ON u.id=p.ownerUnitId AND u.institutionId=p.institutionId WHERE u.id IS NULL",
  activityPlanMissing: "SELECT COUNT(*) AS count FROM ComplianceMonitoringActivity a LEFT JOIN ComplianceMonitoringPlan p ON p.id=a.planId AND p.institutionId=a.institutionId WHERE p.id IS NULL",
  activityObligationMissing: "SELECT COUNT(*) AS count FROM ComplianceMonitoringActivity a LEFT JOIN RegulatoryObligation o ON o.id=a.obligationId AND o.institutionId=a.institutionId WHERE o.id IS NULL",
  activityOwnerMissing: "SELECT COUNT(*) AS count FROM ComplianceMonitoringActivity a LEFT JOIN OrganizationUnit u ON u.id=a.ownerUnitId AND u.institutionId=a.institutionId WHERE u.id IS NULL",
  processMappingMissing: "SELECT COUNT(*) AS count FROM ComplianceMonitoringActivity a WHERE a.processId IS NOT NULL AND TRIM(a.processId)<>'' AND NOT EXISTS (SELECT 1 FROM RegulatoryObligationLink l JOIN BusinessProcess b ON b.id=l.targetId AND b.institutionId=l.institutionId WHERE l.institutionId=a.institutionId AND l.obligationId=a.obligationId AND l.targetType='PROCESS' AND l.targetId=a.processId)",
  eventPlanMissing: "SELECT COUNT(*) AS count FROM ComplianceMonitoringEvent e LEFT JOIN ComplianceMonitoringPlan p ON p.id=e.planId AND p.institutionId=e.institutionId WHERE p.id IS NULL",
  selfApproval: "SELECT COUNT(*) AS count FROM ComplianceMonitoringPlan WHERE approvedById IS NOT NULL AND approvedById=preparedById",
  invalidPlanStatus: "SELECT COUNT(*) AS count FROM ComplianceMonitoringPlan WHERE status NOT IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','IN_PROGRESS','COMPLETED')",
  invalidActivityStatus: "SELECT COUNT(*) AS count FROM ComplianceMonitoringActivity WHERE status NOT IN ('PLANNED','IN_PROGRESS','DONE','CANCELLED')"
};
for (const [check, sql] of Object.entries(checks)) {
  const violations = count(sql);
  assert.equal(violations, 0, 'STAGE2_MONITORING_INTEGRITY_FAILED:' + check + '=' + violations);
}
console.log('PASS Stage 2 production D1 schema, tenant relationship checks and maker-checker integrity.');

async function boundary(method) {
  const response = await fetch(site + '/api/compliance/monitoring', {
    method, redirect: 'manual',
    headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
    body: method === 'POST' ? '{}' : undefined,
    signal: AbortSignal.timeout(18000)
  });
  const location = response.headers.get('location') || '';
  const loginRedirect = [302,303,307,308].includes(response.status) &&
    (/^\/login(?:[/?]|$)/.test(location) || location.startsWith(site + '/login'));
  assert.ok([401,403].includes(response.status) || loginRedirect,
    'Stage 2 API is exposing an unauthenticated ' + method + ' boundary: HTTP ' + response.status);
  console.log('PASS Stage 2 ' + method + ' anonymous rejection HTTP ' + response.status);
}
(async () => {
  await boundary('GET');
  await boundary('POST');
  console.log('PASS STAGE2_MONITORING_PRODUCTION_READINESS');
})().catch(error => {
  console.error('FAIL STAGE2_MONITORING_PRODUCTION_READINESS: ' + error.message);
  process.exitCode = 1;
});
