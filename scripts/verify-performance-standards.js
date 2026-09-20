const fs = require('fs');

const findings = [];

function read(path) {
  if (!fs.existsSync(path)) {
    findings.push(`${path}: missing file`);
    return '';
  }
  return fs.readFileSync(path, 'utf8');
}

function requirePattern(path, content, pattern, message) {
  if (!pattern.test(content)) {
    findings.push(`${path}: ${message || 'missing ' + pattern}`);
  }
}

const performancePath = 'src/lib/performance.ts';
const performance = read(performancePath);

const numericStandards = [
  ['focusedReadBudgetMs', 1200],
  ['aggregateReadBudgetMs', 2000],
  ['mutationBudgetMs', 1500],
  ['clientHardTimeoutMs', 8000],
  ['clientCacheTtlMs', 15000],
  ['authActivityWriteIntervalMs', 300000]
];

for (const [name, expected] of numericStandards) {
  const match = performance.match(new RegExp(name + ':\\s*(\\d+)'));
  if (!match || Number(match[1]) !== expected) {
    findings.push(
      `${performancePath}: ${name} must remain ${expected}ms unless the performance standard is formally revised`
    );
  }
}

const schemaFiles = [
  ['src/lib/d1-core.ts', /coreSchemaPromise/],
  ['src/lib/d1-assurance.ts', /assuranceSchemaPromise/],
  ['src/lib/d1-organization.ts', /organizationSchemaPromise/],
  ['src/lib/auth.ts', /authSchemaPromise/]
];

for (const [path, pattern] of schemaFiles) {
  const content = read(path);
  requirePattern(path, content, pattern, 'schema initialization must be memoized per Worker isolate');
}

const auth = read('src/lib/auth.ts');
requirePattern(
  'src/lib/auth.ts',
  auth,
  /authActivityWriteIntervalMs/,
  'lastAuthenticatedAt writes must be throttled'
);

const core = read('src/lib/d1-core.ts');
for (const pattern of [
  /idx_process_org_unit/,
  /idx_process_legal_entity/,
  /idx_risk_institution/,
  /idx_control_institution/
]) {
  requirePattern('src/lib/d1-core.ts', core, pattern, 'required performance index is missing');
}
if (/rows\.map\(row\s*=>\s*hydrateProcess/.test(core)) {
  findings.push('src/lib/d1-core.ts: BPM register must use batch hydration instead of per-row hydrateProcess N+1 queries');
}
if (/return Promise\.all\(\s*rows\.map\(async row/.test(core)) {
  findings.push('src/lib/d1-core.ts: Risk/Control register reads must not regress to per-row N+1 hydration');
}

const assurance = read('src/lib/d1-assurance.ts');
for (const pattern of [
  /export async function listCalendarData/,
  /responsesByCampaign/,
  /assertionsByAccount/,
  /LEFT JOIN AccessUser/
]) {
  requirePattern('src/lib/d1-assurance.ts', assurance, pattern, 'batch assurance read optimization is missing');
}

const aggregateRoute = read('src/app/api/assurance/route.ts');
for (const pattern of [
  /searchParams\.get\('modules'\)/,
  /loadedModules/,
  /listCalendarData/,
  /recordApiPerformance/
]) {
  requirePattern('src/app/api/assurance/route.ts', aggregateRoute, pattern, 'focused assurance loading/performance telemetry is required');
}

const hook = read('src/hooks/useAssuranceData.ts');
for (const pattern of [
  /clientHardTimeoutMs/,
  /clientCacheTtlMs/,
  /assuranceInflight/,
  /modules:\s*AssuranceModule\[\]/
]) {
  requirePattern('src/hooks/useAssuranceData.ts', hook, pattern, 'assurance client load optimization is required');
}

const focusedPages = [
  'src/app/rcsa/page.tsx',
  'src/app/tod/page.tsx',
  'src/app/icofr/page.tsx',
  'src/app/certification/page.tsx',
  'src/app/tasks/page.tsx',
  'src/app/calendar/page.tsx',
  'src/app/health/page.tsx',
  'src/app/reports/page.tsx'
];

for (const path of focusedPages) {
  const content = read(path);
  if (/useAssuranceData\(\)/.test(content)) {
    findings.push(`${path}: focused pages must request explicit assurance modules instead of loading the full assurance graph`);
  }
}

const transactionHelper = read('src/lib/client-transaction.ts');
for (const pattern of [
  /clientHardTimeoutMs/,
  /mutationBudgetMs/,
  /AbortController/,
  /totalarc\.client-transaction/
]) {
  requirePattern('src/lib/client-transaction.ts', transactionHelper, pattern, 'transaction deadline/telemetry control is missing');
}

const mutationPages = [
  'src/app/onboarding/page.tsx',
  'src/app/organization/page.tsx',
  'src/app/processes/page.tsx',
  'src/app/risks/page.tsx',
  'src/app/controls/page.tsx',
  'src/app/rcsa/page.tsx',
  'src/app/tod/page.tsx',
  'src/app/icofr/page.tsx',
  'src/app/certification/page.tsx',
  'src/app/tasks/page.tsx',
  'src/app/toe/page.tsx',
  'src/app/remediation/page.tsx',
  'src/app/ccm/page.tsx'
];

for (const path of mutationPages) {
  const content = read(path);
  requirePattern(path, content, /jsonTransaction/, 'interactive mutations must use the standard transaction helper');
  if (/fetch\([\s\S]{0,220}method:\s*['"](?:POST|PATCH)['"]/.test(content)) {
    findings.push(`${path}: direct POST/PATCH fetch bypasses the transaction deadline standard`);
  }
}

if (findings.length) {
  console.error('Performance standard guardrail violations detected:');
  for (const finding of findings) console.error(' - ' + finding);
  process.exit(1);
}

console.log('Performance standards guardrails passed.');
