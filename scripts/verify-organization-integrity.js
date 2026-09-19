const fs = require('fs');

const findings = [];

function requireFile(path) {
  if (!fs.existsSync(path)) {
    findings.push(`${path}: required organization implementation file is missing`);
    return '';
  }
  return fs.readFileSync(path, 'utf8');
}

function requirePatterns(path, content, patterns) {
  for (const pattern of patterns) {
    if (!pattern.test(content)) {
      findings.push(`${path}: missing organization integrity contract ${pattern}`);
    }
  }
}

const domainPath = 'src/lib/d1-organization.ts';
const routePath = 'src/app/api/organization/route.ts';
const processRoutePath = 'src/app/api/processes/route.ts';
const corePath = 'src/lib/d1-core.ts';
const orgPagePath = 'src/app/organization/page.tsx';
const processPagePath = 'src/app/processes/page.tsx';
const prismaPath = 'prisma/schema.prisma';
const authPath = 'src/lib/auth.ts';
const authUsersRoutePath = 'src/app/api/auth/users/route.ts';
const assuranceDomainPath = 'src/lib/d1-assurance.ts';
const toeRoutePath = 'src/app/api/assure/toe/route.ts';
const remediationRoutePath = 'src/app/api/assure/remediation/route.ts';
const ccmRoutePath = 'src/app/api/monitor/ccm/route.ts';
const dashboardRoutePath = 'src/app/api/dashboard/route.ts';
const aiAnalyzeRoutePath = 'src/app/api/ai/analyze/route.ts';

const domain = requireFile(domainPath);
requirePatterns(domainPath, domain, [
  /CREATE TABLE IF NOT EXISTS LegalEntity/,
  /CREATE TABLE IF NOT EXISTS OrganizationUnit/,
  /CREATE TABLE IF NOT EXISTS OrganizationPosition/,
  /idx_legal_entity_institution_code/,
  /idx_org_unit_institution_code/,
  /idx_org_position_institution_code/,
  /LEGAL_ENTITY_HIERARCHY_CYCLE/,
  /ORGANIZATION_UNIT_HIERARCHY_CYCLE/,
  /ORGANIZATION_IMPORT_HIERARCHY_CYCLE/,
  /ORGANIZATION_IMPORT_ENTITY_MISMATCH/,
  /rawRows\.length > 500/,
  /recordMutationAudit\s*\(/,
  /SELECT \* FROM LegalEntity WHERE id = \? AND institutionId = \?/,
  /SELECT \* FROM OrganizationUnit WHERE id = \? AND institutionId = \?/
]);

const route = requireFile(routePath);
requirePatterns(routePath, route, [
  /authorizeTenantApi\(request, READ_ROLES\)/,
  /resolveAuthorizedOrgUnitIds\(auth\.user\)/,
  /scopeOrganizationData\(data, authorizedOrgUnitIds, auth\.user\.id\)/,
  /authorizeTenantApi\(request, \['Admin'\]\)/,
  /guardMutationRequest\(request\)/,
  /mutationActorFromRequest\(request, auth\.user\)/,
  /create-legal-entity/,
  /create-unit/,
  /create-position/,
  /import-units/
]);

const processRoute = requireFile(processRoutePath);
requirePatterns(processRoutePath, processRoute, [
  /getOrganizationData\(auth\.user\.institutionId\)/,
  /PROCESS_ORGANIZATION_UNIT_REQUIRED/,
  /PROCESS_ORGANIZATION_ENTITY_MISMATCH/,
  /PROCESS_OWNER_INVALID/,
  /legalEntityId:\s*resolvedLegalEntityId/,
  /orgUnitId:\s*orgUnitId/
]);

const core = requireFile(corePath);
requirePatterns(corePath, core, [
  /nullable\(input\.legalEntityId\)/,
  /nullable\(input\.orgUnitId\)/,
  /nullable\(input\.ownerEmail\)/,
  /FROM OrganizationUnit WHERE id = \? AND institutionId = \?/,
  /FROM LegalEntity WHERE id = \? AND institutionId = \?/,
  /legalEntity,\s*\n\s*orgUnit,/
]);

const orgPage = requireFile(orgPagePath);
requirePatterns(orgPagePath, orgPage, [
  /Organization Structure/,
  /Org Chart/,
  /Import Organization Structure/,
  /Legal Entities/,
  /Positions/,
  /Users/,
  /\/api\/organization/,
  /currentUser\?\.role === 'Admin'/
]);

const processPage = requireFile(processPagePath);
requirePatterns(processPagePath, processPage, [
  /All Organization Units/,
  /Organization Unit/,
  /Legal Entity/,
  /Select process owner/,
  /p\.orgUnitId === selectedOrgUnit/,
  /selectedProcess\.orgUnit\?\.name/,
  /selectedProcess\.legalEntity\?\.name/
]);

const prisma = requireFile(prismaPath);
requirePatterns(prismaPath, prisma, [
  /model LegalEntity \{/,
  /parentEntityId\s+String\?/,
  /model OrganizationUnit \{/,
  /headUserId\s+String\?/,
  /model OrganizationPosition \{/,
  /@@unique\(\[institutionId, code\]\)/
]);

const riskPagePath = 'src/app/risks/page.tsx';
const controlPagePath = 'src/app/controls/page.tsx';
const rcmRoutePath = 'src/app/api/rcm/route.ts';
const rcmPagePath = 'src/app/rcm/page.tsx';

const riskPage = requireFile(riskPagePath);
requirePatterns(riskPagePath, riskPage, [
  /processData\.organization\?\.organizationUnits/,
  /selectedOrgUnit/,
  /process\?\.orgUnitId === selectedOrgUnit/,
  /selectedRiskProcess\?\.orgUnit\?\.name/
]);

const controlPage = requireFile(controlPagePath);
requirePatterns(controlPagePath, controlPage, [
  /processData\.organization\?\.organizationUnits/,
  /selectedOrgUnit/,
  /process\?\.orgUnitId === selectedOrgUnit/,
  /selectedControlProcess\?\.orgUnit\?\.name/
]);

const rcmRoute = requireFile(rcmRoutePath);
requirePatterns(rcmRoutePath, rcmRoute, [
  /getOrganizationData\(auth\.user\.institutionId\)/,
  /resolveAuthorizedOrgUnitIds\(auth\.user\)/,
  /isOrgUnitAuthorized\(authorizedOrgUnitIds/,
  /organizationUnits:\s*scopedUnits/
]);

const rcmPage = requireFile(rcmPagePath);
requirePatterns(rcmPagePath, rcmPage, [
  /selectedOrgUnit/,
  /row\.orgUnitId === selectedOrgUnit/,
  /unitById\.get\(row\.orgUnitId\)\?\.name/
]);

requirePatterns(corePath, core, [
  /p\.legalEntityId AS processLegalEntityId/,
  /p\.orgUnitId AS processOrgUnitId/,
  /legalEntityId:\s*row\.processLegalEntityId/,
  /orgUnitId:\s*row\.processOrgUnitId/,
  /legalEntityId, orgUnitId, criticality, classification/
]);

const auth = requireFile(authPath);
requirePatterns(authPath, auth, [
  /ORG_ACCESS_SCOPES/,
  /orgUnitId:\s*string \| null/,
  /orgAccessScope:\s*OrgAccessScope/,
  /idx_access_user_org_unit/,
  /resolveAuthorizedOrgUnitIds/,
  /UNIT_AND_CHILDREN/,
  /isOrgUnitAuthorized/
]);

const authUsersRoute = requireFile(authUsersRoutePath);
requirePatterns(authUsersRoutePath, authUsersRoute, [
  /orgUnitId/,
  /orgAccessScope/,
  /isOrgScope/
]);

requirePatterns(processRoutePath, processRoute, [
  /resolveAuthorizedOrgUnitIds\(auth\.user\)/,
  /scopeOrganizationData/,
  /PROCESS_ORGANIZATION_SCOPE_FORBIDDEN/,
  /isOrgUnitAuthorized\(authorizedOrgUnitIds/
]);

const riskRoutePath = 'src/app/api/risks/route.ts';
const controlRoutePath = 'src/app/api/controls/route.ts';
const riskRoute = requireFile(riskRoutePath);
const controlRoute = requireFile(controlRoutePath);

requirePatterns(riskRoutePath, riskRoute, [
  /resolveAuthorizedOrgUnitIds\(auth\.user\)/,
  /RISK_ORGANIZATION_SCOPE_FORBIDDEN/,
  /isOrgUnitAuthorized/
]);

requirePatterns(controlRoutePath, controlRoute, [
  /resolveAuthorizedOrgUnitIds\(auth\.user\)/,
  /CONTROL_ORGANIZATION_SCOPE_FORBIDDEN/,
  /isOrgUnitAuthorized/
]);

requirePatterns(orgPagePath, orgPage, [
  /Edit User Organization Access/,
  /UNIT_AND_CHILDREN/,
  /\/api\/auth\/users/
]);

const assuranceDomain = requireFile(assuranceDomainPath);
requirePatterns(assuranceDomainPath, assuranceDomain, [
  /legalEntityId, orgUnitId FROM BusinessProcess/,
  /process:\s*\(mapWithIssue\?\.issue/,
  /process\s*\n\s*};/
]);

const toeRoute = requireFile(toeRoutePath);
requirePatterns(toeRoutePath, toeRoute, [
  /resolveAuthorizedOrgUnitIds\(auth\.user\)/,
  /TOE_ORGANIZATION_SCOPE_FORBIDDEN/,
  /isOrgUnitAuthorized/,
  /listControls\(auth\.user\.institutionId\)/
]);

const remediationRoute = requireFile(remediationRoutePath);
requirePatterns(remediationRoutePath, remediationRoute, [
  /resolveAuthorizedOrgUnitIds\(auth\.user\)/,
  /REMEDIATION_ORGANIZATION_SCOPE_FORBIDDEN/,
  /data\.exceptions\.filter/,
  /data\.maps\.filter/,
  /data\.retests\.filter/
]);

const ccmRoute = requireFile(ccmRoutePath);
requirePatterns(ccmRoutePath, ccmRoute, [
  /resolveAuthorizedOrgUnitIds\(auth\.user\)/,
  /CCM_ORGANIZATION_SCOPE_FORBIDDEN/,
  /scopedRules/,
  /listControls\(auth\.user\.institutionId\)/
]);

const dashboardRoute = requireFile(dashboardRoutePath);
requirePatterns(dashboardRoutePath, dashboardRoute, [
  /authorizedOrgUnitIds !== null/,
  /organization-scoped-bpm-risk-control-assurance-remediation-ccm/,
  /recentAuditLogs:\s*\[\]/,
  /authorizedUnitCount:\s*authorizedOrgUnitIds\.length/
]);

const aiAnalyzeRoute = requireFile(aiAnalyzeRoutePath);
requirePatterns(aiAnalyzeRoutePath, aiAnalyzeRoute, [
  /resolveAuthorizedOrgUnitIds\(auth\.user\)/,
  /AI_ORGANIZATION_SCOPE_FORBIDDEN/,
  /registeredProcess\.orgUnitId/
]);

requirePatterns(domainPath, domain, [
  /export function scopeOrganizationData/,
  /allowedUnitIds/,
  /relevantUserIds/,
  /childUnitCount/
]);

if (findings.length) {
  console.error('Organization integrity guardrail violations detected:');
  for (const finding of findings) console.error(' - ' + finding);
  process.exit(1);
}

console.log('Organization integrity guardrails passed.');
