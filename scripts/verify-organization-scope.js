const fs = require('fs');

const findings = [];

function read(path) {
  if (!fs.existsSync(path)) {
    findings.push(`${path}: required file is missing`);
    return '';
  }
  return fs.readFileSync(path, 'utf8');
}

function expect(path, content, patterns) {
  for (const pattern of patterns) {
    if (!pattern.test(content)) {
      findings.push(`${path}: missing organization-scope control ${pattern}`);
    }
  }
}

const authPath = 'src/lib/auth.ts';
const accessPath = 'src/lib/organization-access.ts';
const userRoutePath = 'src/app/api/auth/users/route.ts';
const orgRoutePath = 'src/app/api/organization/route.ts';
const processRoutePath = 'src/app/api/processes/route.ts';
const riskRoutePath = 'src/app/api/risks/route.ts';
const controlRoutePath = 'src/app/api/controls/route.ts';
const rcmRoutePath = 'src/app/api/rcm/route.ts';
const roleContextPath = 'src/context/RoleContext.tsx';
const orgPagePath = 'src/app/organization/page.tsx';

const auth = read(authPath);
expect(authPath, auth, [
  /ORGANIZATION_ACCESS_SCOPES/,
  /'Institution'/,
  /'Unit'/,
  /'UnitAndDescendants'/,
  /orgUnitId:\s*string \| null/,
  /accessScope:\s*OrganizationAccessScope/,
  /ALTER TABLE AccessUser ADD COLUMN orgUnitId TEXT/,
  /ALTER TABLE AccessUser ADD COLUMN accessScope TEXT NOT NULL DEFAULT 'Institution'/,
  /SELECT id FROM OrganizationUnit WHERE id = \? AND institutionId = \?/,
  /ORGANIZATION_UNIT_REQUIRED/,
  /ORGANIZATION_UNIT_INVALID/,
  /orgUnitId, accessScope/
]);

const access = read(accessPath);
expect(accessPath, access, [
  /resolveOrganizationAccess/,
  /user\.role === 'Admin' \|\| user\.accessScope === 'Institution'/,
  /user\.accessScope === 'Unit'/,
  /UnitAndDescendants/,
  /SELECT id, parentId FROM OrganizationUnit WHERE institutionId = \?/,
  /organizationScopeAllows/,
  /filterByOrganizationScope/,
  /assertOrganizationScope/,
  /ORGANIZATION_SCOPE_FORBIDDEN/
]);

const userRoute = read(userRoutePath);
expect(userRoutePath, userRoute, [
  /ORGANIZATION_ACCESS_SCOPES/,
  /orgUnitId/,
  /accessScope/,
  /isAccessScope/,
  /updateProvisionedUser/
]);

const orgRoute = read(orgRoutePath);
expect(orgRoutePath, orgRoute, [
  /resolveOrganizationAccess\(auth\.user\)/,
  /allowedUnitIds/,
  /organizationUnits\.filter\(unit => allowedUnitIds\.has\(unit\.id\)\)/,
  /positions\.filter\(position => allowedUnitIds\.has\(position\.orgUnitId\)\)/
]);

const processRoute = read(processRoutePath);
expect(processRoutePath, processRoute, [
  /resolveOrganizationAccess\(auth\.user\)/,
  /filterByOrganizationScope\(processes, access\)/,
  /assertOrganizationScope\(access, selectedUnit\.id\)/,
  /PROCESS_OWNER_SCOPE_FORBIDDEN/,
  /PROCESS_LEGAL_ENTITY_SCOPE_FORBIDDEN/
]);

const riskRoute = read(riskRoutePath);
expect(riskRoutePath, riskRoute, [
  /resolveOrganizationAccess\(auth\.user\)/,
  /access\.unitIds\.includes\(risk\.process\.orgUnitId\)/,
  /assertOrganizationScope\(access, selectedProcess\.orgUnitId\)/,
  /ORGANIZATION_SCOPE_FORBIDDEN/
]);

const controlRoute = read(controlRoutePath);
expect(controlRoutePath, controlRoute, [
  /resolveOrganizationAccess\(auth\.user\)/,
  /access\.unitIds\.includes\(control\.process\.orgUnitId\)/,
  /assertOrganizationScope\(access, selectedProcess\.orgUnitId\)/,
  /ORGANIZATION_SCOPE_FORBIDDEN/
]);

const rcmRoute = read(rcmRoutePath);
expect(rcmRoutePath, rcmRoute, [
  /resolveOrganizationAccess\(auth\.user\)/,
  /filterByOrganizationScope\(baseRows, access\)/,
  /visibleUnits/,
  /access/
]);

const roleContext = read(roleContextPath);
expect(roleContextPath, roleContext, [
  /orgUnitId:\s*string \| null/,
  /accessScope:\s*'Institution' \| 'Unit' \| 'UnitAndDescendants'/,
  /user\.accessScope === 'Unit'/,
  /user\.accessScope === 'UnitAndDescendants'/
]);

const orgPage = read(orgPagePath);
expect(orgPagePath, orgPage, [
  /Manage User Organization Access/,
  /Institution-wide/,
  /Assigned unit only/,
  /Assigned unit \+ descendants/,
  /\/api\/auth\/users/,
  /accessScope/
]);

if (findings.length) {
  console.error('Organization scope RBAC guardrail violations detected:');
  for (const finding of findings) console.error(' - ' + finding);
  process.exit(1);
}

console.log('Organization scope RBAC guardrails passed.');
