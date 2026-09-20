const fs = require('fs');

const findings = [];

const mutationRoutes = [
  'src/app/api/onboarding/route.ts',
  'src/app/api/processes/route.ts',
  'src/app/api/risks/route.ts',
  'src/app/api/controls/route.ts',
  'src/app/api/reports/route.ts',
  'src/app/api/reports/ai/route.ts',
  'src/app/api/organization/route.ts',
  'src/app/api/assure/rcsa/route.ts',
  'src/app/api/assure/tod/route.ts',
  'src/app/api/assure/icofr/route.ts',
  'src/app/api/assure/certification/route.ts',
  'src/app/api/assure/tasks/route.ts',
  'src/app/api/assure/toe/route.ts',
  'src/app/api/assure/remediation/route.ts',
  'src/app/api/monitor/ccm/route.ts',
  'src/app/api/ai/analyze/route.ts',
  'src/app/api/ai/chat/route.ts',
  'src/app/api/auth/users/route.ts'
];

for (const route of mutationRoutes) {
  if (!fs.existsSync(route)) {
    findings.push(`${route}: expected mutation route is missing`);
    continue;
  }

  const content = fs.readFileSync(route, 'utf8');
  if (!/guardMutationRequest\s*\(request\)/.test(content)) {
    findings.push(`${route}: guardMutationRequest(request) is required`);
  }

  if (!/export async function (?:POST|PATCH)\s*\(request:\s*Request\)/.test(content)) {
    findings.push(`${route}: expected POST/PATCH mutation handler is missing`);
  }
}

const actorRoutes = [
  'src/app/api/onboarding/route.ts',
  'src/app/api/processes/route.ts',
  'src/app/api/risks/route.ts',
  'src/app/api/controls/route.ts',
  'src/app/api/reports/route.ts',
  'src/app/api/reports/ai/route.ts',
  'src/app/api/organization/route.ts',
  'src/app/api/assure/rcsa/route.ts',
  'src/app/api/assure/tod/route.ts',
  'src/app/api/assure/icofr/route.ts',
  'src/app/api/assure/certification/route.ts',
  'src/app/api/assure/tasks/route.ts',
  'src/app/api/assure/toe/route.ts',
  'src/app/api/assure/remediation/route.ts',
  'src/app/api/monitor/ccm/route.ts',
  'src/app/api/ai/analyze/route.ts',
  'src/app/api/ai/chat/route.ts'
];

for (const route of actorRoutes) {
  const content = fs.existsSync(route) ? fs.readFileSync(route, 'utf8') : '';
  if (!/mutationActorFromRequest\s*\(request,\s*auth\.user\)/.test(content)) {
    findings.push(`${route}: authenticated mutation actor context is required`);
  }
}

const auditedAssuranceRoutes = [
  'src/app/api/assure/rcsa/route.ts',
  'src/app/api/assure/tod/route.ts',
  'src/app/api/assure/icofr/route.ts',
  'src/app/api/assure/certification/route.ts',
  'src/app/api/assure/tasks/route.ts',
  'src/app/api/assure/toe/route.ts',
  'src/app/api/assure/remediation/route.ts',
  'src/app/api/monitor/ccm/route.ts',
  'src/app/api/ai/chat/route.ts'
];

for (const route of auditedAssuranceRoutes) {
  const content = fs.existsSync(route) ? fs.readFileSync(route, 'utf8') : '';
  if (!/recordMutationAudit\s*\(/.test(content)) {
    findings.push(`${route}: authenticated mutation audit is required`);
  }
}

const reportingDomainPath = 'src/lib/d1-reporting.ts';
if (!fs.existsSync(reportingDomainPath)) {
  findings.push(`${reportingDomainPath}: regulatory reporting D1 domain is required`);
} else {
  const content = fs.readFileSync(reportingDomainPath, 'utf8');
  for (const required of [
    /recordMutationAudit\s*\(/,
    /actor:\s*MutationActor/,
    /AI Draft — Human Review Required/,
    /RegulatoryReportSourceSnapshot/
  ]) {
    if (!required.test(content)) {
      findings.push(`${reportingDomainPath}: missing reporting mutation control ${required}`);
    }
  }
}

const organizationDomainPath = 'src/lib/d1-organization.ts';
if (!fs.existsSync(organizationDomainPath)) {
  findings.push(`${organizationDomainPath}: organization D1 domain is required`);
} else {
  const content = fs.readFileSync(organizationDomainPath, 'utf8');
  for (const required of [
    /recordMutationAudit\s*\(/,
    /actor:\s*MutationActor/,
    /institutionId:\s*string/,
    /LEGAL_ENTITY_HIERARCHY_CYCLE/,
    /ORGANIZATION_UNIT_HIERARCHY_CYCLE/
  ]) {
    if (!required.test(content)) {
      findings.push(`${organizationDomainPath}: missing organization mutation control ${required}`);
    }
  }
}

const analyze = fs.existsSync('src/app/api/ai/analyze/route.ts')
  ? fs.readFileSync('src/app/api/ai/analyze/route.ts', 'utf8')
  : '';
if (!/recordAiAnalysisAudit\([\s\S]*?actor\s*\)/.test(analyze)) {
  findings.push('src/app/api/ai/analyze/route.ts: AI analysis audit must receive authenticated actor context');
}

const mutationSecurityPath = 'src/lib/mutation-security.ts';
if (!fs.existsSync(mutationSecurityPath)) {
  findings.push(`${mutationSecurityPath}: mutation security helper is required`);
} else {
  const content = fs.readFileSync(mutationSecurityPath, 'utf8');
  for (const required of [
    /application\/json/,
    /CROSS_ORIGIN_MUTATION_BLOCKED/,
    /CROSS_SITE_MUTATION_BLOCKED/,
    /MUTATION_BODY_TOO_LARGE/,
    /METHOD_OVERRIDE_FORBIDDEN/,
    /cf-connecting-ip/,
    /requestId/
  ]) {
    if (!required.test(content)) {
      findings.push(`${mutationSecurityPath}: missing control ${required}`);
    }
  }
}

const corePath = 'src/lib/d1-core.ts';
if (fs.existsSync(corePath)) {
  const content = fs.readFileSync(corePath, 'utf8');
  for (const required of [
    /createBusinessProcess\([\s\S]*?actor:\s*MutationActor/,
    /createRisk\([\s\S]*?actor:\s*MutationActor/,
    /createControl\([\s\S]*?actor:\s*MutationActor/,
    /recordMutationAudit\(/,
    /recordAiAnalysisAudit\([\s\S]*?actor:\s*MutationActor/
  ]) {
    if (!required.test(content)) findings.push(`${corePath}: missing actor-aware audit contract ${required}`);
  }
}

const institutionPath = 'src/lib/d1.ts';
if (fs.existsSync(institutionPath)) {
  const content = fs.readFileSync(institutionPath, 'utf8');
  if (!/upsertInstitution\([\s\S]*?actor:\s*MutationActor/.test(content)) {
    findings.push(`${institutionPath}: institution writes must require MutationActor`);
  }
  if (/['"]System['"][\s\S]{0,80}['"]System['"]/.test(content)) {
    findings.push(`${institutionPath}: institution mutation audit must not use System/System attribution`);
  }
}

const probePath = 'src/app/api/ai/probe/route.ts';
if (fs.existsSync(probePath)) {
  const content = fs.readFileSync(probePath, 'utf8');
  if (!/AI_PROBE_TOKEN/.test(content) || !/tokenMatches\s*\(/.test(content)) {
    findings.push(`${probePath}: service-only AI probe must retain bearer-token verification`);
  }
}

for (const route of [
  'src/app/api/processes/route.ts',
  'src/app/api/risks/route.ts',
  'src/app/api/controls/route.ts',
  'src/app/api/organization/route.ts'
]) {
  if (!fs.existsSync(route)) continue;
  const content = fs.readFileSync(route, 'utf8');
  const getStart = content.indexOf('export async function GET');
  const postStart = content.indexOf('export async function POST');
  if (getStart >= 0 && postStart > getStart) {
    const getBody = content.slice(getStart, postStart);
    if (/guardMutationRequest|mutationActorFromRequest/.test(getBody)) {
      findings.push(`${route}: mutation guards/actors must not be initialized inside GET handlers`);
    }
  }
}

if (findings.length) {
  console.error('Mutation security guardrail violations detected:');
  for (const finding of findings) console.error(' - ' + finding);
  process.exit(1);
}

console.log('Mutation security guardrails passed.');
