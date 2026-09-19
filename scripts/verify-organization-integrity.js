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
  /organizationUnits:\s*organization\.organizationUnits/
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
  /orgUnitId:\s*row\.processOrgUnitId/
]);

if (findings.length) {
  console.error('Organization integrity guardrail violations detected:');
  for (const finding of findings) console.error(' - ' + finding);
  process.exit(1);
}

console.log('Organization integrity guardrails passed.');
