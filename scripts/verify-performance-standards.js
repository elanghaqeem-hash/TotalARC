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

const mutationSecurity = read('src/lib/mutation-security.ts');
requirePattern(
  'src/lib/mutation-security.ts',
  mutationSecurity,
  /performanceStartedAt/,
  'server-side mutation timing start must be captured'
);

const auth = read('src/lib/auth.ts');
requirePattern(
  'src/lib/auth.ts',
  auth,
  /authActivityWriteIntervalMs/,
  'lastAuthenticatedAt writes must be throttled'
);

const core = read('src/lib/d1-core.ts');
requirePattern(
  'src/lib/d1-core.ts',
  core,
  /MUTATION \${input\.entityType}/,
  'audited mutations must emit server-side duration telemetry'
);

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

const readHelper = read('src/lib/client-read.ts');
for (const pattern of [
  /clientHardTimeoutMs/,
  /focusedReadBudgetMs/,
  /AbortController/,
  /inflightReads/
]) {
  requirePattern('src/lib/client-read.ts', readHelper, pattern, 'client read deadline/dedupe control is missing');
}

const standardizedReadPages = [
  'src/app/onboarding/page.tsx',
  'src/app/organization/page.tsx',
  'src/app/processes/page.tsx',
  'src/app/risks/page.tsx',
  'src/app/controls/page.tsx',
  'src/app/toe/page.tsx',
  'src/app/remediation/page.tsx',
  'src/app/ccm/page.tsx',
  'src/context/RoleContext.tsx'
];

for (const path of standardizedReadPages) {
  const content = read(path);
  requirePattern(path, content, /jsonRead/, 'interactive reads must use the standard request deadline helper');
}

const paginationHelper = read('src/lib/pagination.ts');
for (const pattern of [
  /DEFAULT_REGISTER_PAGE_SIZE\s*=\s*50/,
  /MAX_REGISTER_PAGE_SIZE\s*=\s*100/,
  /parsePaginationRequest/,
  /paginationMeta/
]) {
  requirePattern('src/lib/pagination.ts', paginationHelper, pattern, 'bounded register pagination contract is required');
}

const registerPagination = read('src/lib/d1-register-pagination.ts');
for (const pattern of [
  /listProcessRegisterPage/,
  /listRiskRegisterPage/,
  /listControlRegisterPage/,
  /listRcmRegisterPage/,
  /listToeRegisterPage/,
  /getToeTestDetailPage/,
  /listAuditRegisterPage/,
  /LIMIT \? OFFSET \?/,
  /json_each/
]) {
  requirePattern('src/lib/d1-register-pagination.ts', registerPagination, pattern, 'server-side paginated register query is required');
}

const toeRegisterStart = registerPagination.indexOf('export async function listToeRegisterPage');
const toeDetailStart = registerPagination.indexOf('export async function getToeTestDetailPage');
const toeAuditStart = registerPagination.indexOf('export async function listAuditRegisterPage');

if (toeRegisterStart < 0 || toeDetailStart < 0 || toeAuditStart < 0) {
  findings.push('src/lib/d1-register-pagination.ts: ToE register/detail pagination boundaries are missing');
} else {
  const toeRegisterBlock = registerPagination.slice(toeRegisterStart, toeDetailStart);
  const toeDetailBlock = registerPagination.slice(toeDetailStart, toeAuditStart);

  if (/FROM TestSample/.test(toeRegisterBlock)) {
    findings.push('src/lib/d1-register-pagination.ts: ToE register must not hydrate samples before a workpaper is selected');
  }

  for (const pattern of [
    /sampleFilter/,
    /TestSample/,
    /LIMIT \? OFFSET \?/,
    /samplePagination/,
    /TestingException/,
    /json_each/
  ]) {
    requirePattern(
      'src/lib/d1-register-pagination.ts',
      toeDetailBlock,
      pattern,
      'selected ToE workpaper detail must page samples and hydrate only current-page exception context'
    );
  }
}

const toePage = read('src/app/toe/page.tsx');
for (const pattern of [
  /loadDetail/,
  /samplePageSize:\s*'50'/,
  /samplePagination/,
  /RegisterPager/
]) {
  requirePattern(
    'src/app/toe/page.tsx',
    toePage,
    pattern,
    'ToE sample workpaper must use on-demand bounded detail loading'
  );
}

const pagedRoutes = [
  'src/app/api/processes/route.ts',
  'src/app/api/risks/route.ts',
  'src/app/api/controls/route.ts',
  'src/app/api/rcm/route.ts',
  'src/app/api/assure/toe/route.ts',
  'src/app/api/audit/route.ts'
];

for (const path of pagedRoutes) {
  const content = read(path);
  requirePattern(path, content, /parsePaginationRequest/, 'large register routes must enforce bounded server-side pagination');
}

const pagedPages = [
  'src/app/processes/page.tsx',
  'src/app/risks/page.tsx',
  'src/app/controls/page.tsx',
  'src/app/rcm/page.tsx',
  'src/app/toe/page.tsx',
  'src/app/audit/page.tsx'
];

for (const path of pagedPages) {
  const content = read(path);
  requirePattern(path, content, /RegisterPager/, 'large register UI must keep rendered rows bounded with server paging');
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
