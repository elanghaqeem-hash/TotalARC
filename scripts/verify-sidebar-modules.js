const fs = require('fs');
const path = require('path');

const root = process.cwd();
const appShellPath = path.join(root, 'src/components/layout/AppShell.tsx');

const moduleChecks = {
  '/': { page: 'src/app/page.tsx', markers: ['/api/dashboard'] },
  '/onboarding': { page: 'src/app/onboarding/page.tsx', markers: ['/api/onboarding'] },
  '/organization': { page: 'src/app/organization/page.tsx', markers: ['/api/organization'] },
  '/processes': { page: 'src/app/processes/page.tsx', markers: ['/api/processes'] },
  '/risks': { page: 'src/app/risks/page.tsx', markers: ['/api/risks'] },
  '/controls': { page: 'src/app/controls/page.tsx', markers: ['/api/controls'] },
  '/rcm': { page: 'src/app/rcm/page.tsx', markers: ['/api/rcm'] },
  '/rcsa': { page: 'src/app/rcsa/page.tsx', markers: ['/api/assurance'] },
  '/icofr': { page: 'src/app/icofr/page.tsx', markers: ['/api/icofr/hub'] },
  '/icofr/scoping': { page: 'src/app/icofr/scoping/page.tsx', markers: ['/api/icofr/scoping'] },
  '/icofr/accounts': { page: 'src/app/icofr/accounts/page.tsx', markers: ['/api/icofr/financial-items'] },
  '/icofr/traceability': { page: 'src/app/icofr/traceability/page.tsx', markers: ['/api/icofr/traceability'] },
  '/icofr/coverage': { page: 'src/app/icofr/coverage/page.tsx', markers: ['/api/icofr/coverage'] },
  '/icofr/elc': { page: 'src/app/icofr/elc/page.tsx', markers: ['ControlDomainWorkspace'] },
  '/icofr/plc': { page: 'src/app/icofr/plc/page.tsx', markers: ['ControlDomainWorkspace'] },
  '/icofr/itgc': { page: 'src/app/icofr/itgc/page.tsx', markers: ['ControlDomainWorkspace'] },
  '/icofr/itac': { page: 'src/app/icofr/itac/page.tsx', markers: ['ControlDomainWorkspace'] },
  '/icofr/information': { page: 'src/app/icofr/information/page.tsx', markers: ['/api/icofr/information'] },
  '/icofr/testing-plan': { page: 'src/app/icofr/testing-plan/page.tsx', markers: ['/api/icofr/testing-plan'] },
  '/icofr/smart-testing': { page: 'src/app/icofr/smart-testing/page.tsx', markers: ['/api/icofr/smart-testing'] },
  '/icofr/sampling-evidence': { page: 'src/app/icofr/sampling-evidence/page.tsx', markers: ['/api/icofr/sampling-evidence'] },
  '/icofr/roll-forward': { page: 'src/app/icofr/roll-forward/page.tsx', markers: ['/api/icofr/roll-forward'] },
  '/icofr/period-close': { page: 'src/app/icofr/period-close/page.tsx', markers: ['/api/icofr/period-close'] },
  '/tod': { page: 'src/app/tod/page.tsx', markers: ['useAssuranceData'] },
  '/toe': { page: 'src/app/toe/page.tsx', markers: ['/api/assure/toe'] },
  '/icofr/deficiencies': { page: 'src/app/icofr/deficiencies/page.tsx', markers: ['/api/icofr/deficiencies'] },
  '/remediation': { page: 'src/app/remediation/page.tsx', markers: ['/api/assure/remediation'] },
  '/health': { page: 'src/app/health/page.tsx', markers: ['useAssuranceData'] },
  '/ccm': { page: 'src/app/ccm/page.tsx', markers: ['/api/monitor/ccm'] },
  '/certification': { page: 'src/app/certification/page.tsx', markers: ['/api/icofr/certification'] },
  '/calendar': { page: 'src/app/calendar/page.tsx', markers: ['useAssuranceData'] },
  '/tasks': { page: 'src/app/tasks/page.tsx', markers: ['useAssuranceData'] },
  '/reports': { page: 'src/app/reports/page.tsx', markers: ['useAssuranceData'] },
  '/admin/users': { page: 'src/app/admin/users/page.tsx', markers: ['/api/admin/users'] },
  '/admin/institutions': { page: 'src/app/admin/institutions/page.tsx', markers: ['/api/admin/institutions'] },
  '/admin/security': { page: 'src/app/admin/security/page.tsx', markers: ['/api/admin/security'] }
};

function fail(message) {
  console.error('MODULE_INTEGRITY_ERROR:', message);
  process.exitCode = 1;
}

if (!fs.existsSync(appShellPath)) {
  fail('AppShell.tsx was not found.');
  process.exit();
}

const appShell = fs.readFileSync(appShellPath, 'utf8');
const sidebarHrefs = [...appShell.matchAll(/href:\s*['"]([^'"]+)['"]/g)]
  .map(match => match[1])
  .filter(href => href.startsWith('/') && href !== '/profile');

const uniqueSidebarHrefs = [...new Set(sidebarHrefs)];

for (const href of uniqueSidebarHrefs) {
  if (!moduleChecks[href]) fail('Sidebar route has no integrity definition: ' + href);
}

for (const [href, check] of Object.entries(moduleChecks)) {
  if (!uniqueSidebarHrefs.includes(href)) {
    fail('Integrity definition is not present in sidebar navigation: ' + href);
    continue;
  }

  const filePath = path.join(root, check.page);
  if (!fs.existsSync(filePath)) {
    fail(href + ' is missing page file ' + check.page);
    continue;
  }

  const source = fs.readFileSync(filePath, 'utf8');
  const connected = check.markers.some(marker => source.includes(marker));
  if (!connected) {
    fail(href + ' does not contain an expected active data/workspace marker: ' + check.markers.join(' OR '));
  }
}

const apiFiles = [
  'src/app/api/dashboard/route.ts',
  'src/app/api/onboarding/route.ts',
  'src/app/api/organization/route.ts',
  'src/app/api/processes/route.ts',
  'src/app/api/risks/route.ts',
  'src/app/api/controls/route.ts',
  'src/app/api/rcm/route.ts',
  'src/app/api/assurance/route.ts',
  'src/app/api/icofr/hub/route.ts',
  'src/app/api/icofr/scoping/route.ts',
  'src/app/api/icofr/financial-items/route.ts',
  'src/app/api/icofr/traceability/route.ts',
  'src/app/api/icofr/coverage/route.ts',
  'src/app/api/icofr/controls/route.ts',
  'src/app/api/icofr/information/route.ts',
  'src/app/api/icofr/testing-plan/route.ts',
  'src/app/api/icofr/smart-testing/route.ts',
  'src/app/api/icofr/sampling-evidence/route.ts',
  'src/app/api/icofr/roll-forward/route.ts',
  'src/app/api/icofr/period-close/route.ts',
  'src/app/api/assure/toe/route.ts',
  'src/app/api/icofr/deficiencies/route.ts',
  'src/app/api/assure/remediation/route.ts',
  'src/app/api/monitor/ccm/route.ts',
  'src/app/api/icofr/certification/route.ts',
  'src/app/api/auth/login/route.ts',
  'src/app/api/auth/logout/route.ts',
  'src/app/api/auth/me/route.ts',
  'src/app/api/auth/switch-institution/route.ts',
  'src/app/api/profile/route.ts',
  'src/app/api/admin/users/route.ts',
  'src/app/api/admin/institutions/route.ts',
  'src/app/api/admin/security/route.ts',
  'src/middleware.ts'
];

for (const apiFile of apiFiles) {
  if (!fs.existsSync(path.join(root, apiFile))) {
    fail('Required module API route is missing: ' + apiFile);
  }
}

if (!process.exitCode) {
  console.log(
    'Sidebar module integrity verified: ' +
      uniqueSidebarHrefs.length +
      ' routes have active page markers and required API routes are present.'
  );
}
