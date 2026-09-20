const fs = require('fs');

const findings = [];

const tenantRoutes = [
  'src/app/api/processes/route.ts',
  'src/app/api/risks/route.ts',
  'src/app/api/controls/route.ts',
  'src/app/api/rcm/route.ts',
  'src/app/api/dashboard/route.ts',
  'src/app/api/assurance/route.ts',
  'src/app/api/organization/route.ts',
  'src/app/api/assure/rcsa/route.ts',
  'src/app/api/assure/tod/route.ts',
  'src/app/api/assure/icofr/route.ts',
  'src/app/api/assure/toe/route.ts',
  'src/app/api/assure/remediation/route.ts',
  'src/app/api/monitor/ccm/route.ts',
  'src/app/api/ai/analyze/route.ts',
  'src/app/api/ai/chat/route.ts',
  'src/app/api/ai/status/route.ts'
];

const routesRequiringExplicitTenantPropagation = new Set([
  'src/app/api/processes/route.ts',
  'src/app/api/risks/route.ts',
  'src/app/api/controls/route.ts',
  'src/app/api/rcm/route.ts',
  'src/app/api/dashboard/route.ts',
  'src/app/api/assurance/route.ts',
  'src/app/api/organization/route.ts',
  'src/app/api/assure/toe/route.ts',
  'src/app/api/assure/remediation/route.ts',
  'src/app/api/monitor/ccm/route.ts',
  'src/app/api/ai/analyze/route.ts'
]);

for (const route of tenantRoutes) {
  if (!fs.existsSync(route)) {
    findings.push(`${route}: expected tenant-scoped operational route is missing`);
    continue;
  }
  const content = fs.readFileSync(route, 'utf8');
  if (!/authorizeTenantApi\s*\(/.test(content)) {
    findings.push(`${route}: authorizeTenantApi() is required`);
  }
  if (
    routesRequiringExplicitTenantPropagation.has(route) &&
    !/auth\.user\.institutionId/.test(content)
  ) {
    findings.push(`${route}: persistence calls must use authenticated institutionId`);
  }
}

const corePath = 'src/lib/d1-core.ts';
const assurancePath = 'src/lib/d1-assurance.ts';
const institutionPath = 'src/lib/d1.ts';
const organizationPath = 'src/lib/d1-organization.ts';

for (const file of [corePath, assurancePath, institutionPath, organizationPath]) {
  if (!fs.existsSync(file)) {
    findings.push(`${file}: expected D1 domain file is missing`);
    continue;
  }
  const content = fs.readFileSync(file, 'utf8');

  if (/\bprimaryInstitution\s*\(/.test(content)) {
    findings.push(`${file}: primaryInstitution fallback is forbidden`);
  }
  if (/\bgetPrimaryInstitution\b/.test(content)) {
    findings.push(`${file}: getPrimaryInstitution fallback is forbidden`);
  }
}

const core = fs.existsSync(corePath) ? fs.readFileSync(corePath, 'utf8') : '';
const requiredCoreSignatures = [
  /listBusinessProcesses\(institutionId:\s*string\)/,
  /findBusinessProcessForAi\([\s\S]*institutionId:\s*string\)/,
  /createBusinessProcess\([\s\S]*institutionId:\s*string\)/,
  /listRisks\(institutionId:\s*string\)/,
  /createRisk\([\s\S]*institutionId:\s*string\)/,
  /listControls\(institutionId:\s*string\)/,
  /createControl\([\s\S]*institutionId:\s*string\)/,
  /listRcmRows\(institutionId:\s*string\)/,
  /getCoreDashboardData\(institutionId:\s*string\)/
];

for (const pattern of requiredCoreSignatures) {
  if (!pattern.test(core)) findings.push(`${corePath}: missing tenant-scoped signature ${pattern}`);
}

const assurance = fs.existsSync(assurancePath) ? fs.readFileSync(assurancePath, 'utf8') : '';
const requiredAssuranceSignatures = [
  /listRcsaData\(institutionId:\s*string\)/,
  /listTodData\(institutionId:\s*string\)/,
  /listIcofrData\(institutionId:\s*string\)/,
  /listToeTests\(institutionId:\s*string\)/,
  /listRemediationData\(institutionId:\s*string\)/,
  /listMonitoringRules\(institutionId:\s*string\)/,
  /getAssuranceDashboardMetrics\(institutionId:\s*string\)/,
  /enrichRcmWithAssurance\([\s\S]*institutionId:\s*string/
];

for (const pattern of requiredAssuranceSignatures) {
  if (!pattern.test(assurance)) findings.push(`${assurancePath}: missing tenant-scoped signature ${pattern}`);
}

const organization = fs.existsSync(organizationPath) ? fs.readFileSync(organizationPath, 'utf8') : '';
const requiredOrganizationSignatures = [
  /getOrganizationData\(institutionId:\s*string\)/,
  /createLegalEntity\([\s\S]*institutionId:\s*string/,
  /createOrganizationUnit\([\s\S]*institutionId:\s*string/,
  /createOrganizationPosition\([\s\S]*institutionId:\s*string/,
  /importOrganizationUnits\([\s\S]*institutionId:\s*string/
];

for (const pattern of requiredOrganizationSignatures) {
  if (!pattern.test(organization)) {
    findings.push(`${organizationPath}: missing tenant-scoped organization contract ${pattern}`);
  }
}

const processRoutePath = 'src/app/api/processes/route.ts';
if (fs.existsSync(processRoutePath)) {
  const processRoute = fs.readFileSync(processRoutePath, 'utf8');
  if (!/getOrganizationData\(auth\.user\.institutionId\)/.test(processRoute)) {
    findings.push(`${processRoutePath}: BPM process ownership must resolve from the authenticated tenant organization master`);
  }
  if (!/PROCESS_ORGANIZATION_ENTITY_MISMATCH/.test(processRoute)) {
    findings.push(`${processRoutePath}: legal entity and organization unit mismatch protection is required`);
  }
}


const authPath = 'src/lib/auth.ts';
if (fs.existsSync(authPath)) {
  const auth = fs.readFileSync(authPath, 'utf8');
  if (/bindAdminToPrimaryInstitution/.test(auth)) {
    findings.push(`${authPath}: automatic first-institution admin binding is forbidden`);
  }
  if (/SELECT id FROM Institution ORDER BY createdAt ASC LIMIT 1/.test(auth)) {
    findings.push(`${authPath}: first-institution lookup is forbidden in authentication`);
  }
  if (/WHERE institutionId = \? OR institutionId IS NULL/.test(auth)) {
    findings.push(`${authPath}: tenant admins must not enumerate unbound/global users`);
  }
  if (!/bindBootstrapAdminToInstitution/.test(auth)) {
    findings.push(`${authPath}: explicit bootstrap-admin institution binding is required`);
  }
}

const onboardingPath = 'src/app/api/onboarding/route.ts';
if (fs.existsSync(onboardingPath)) {
  const onboarding = fs.readFileSync(onboardingPath, 'utf8');
  if (!/upsertInstitution\([\s\S]*auth\.user\.institutionId\)/.test(onboarding)) {
    findings.push(`${onboardingPath}: onboarding updates must be bound to authenticated tenant context`);
  }
  if (!/bindBootstrapAdminToInstitution\(auth\.user/.test(onboarding)) {
    findings.push(`${onboardingPath}: bootstrap admin must be explicitly bound to the newly created institution`);
  }
}

if (findings.length) {
  console.error('Tenant isolation guardrail violations detected:');
  for (const finding of findings) console.error(' - ' + finding);
  process.exit(1);
}

console.log('Tenant isolation guardrails passed.');
