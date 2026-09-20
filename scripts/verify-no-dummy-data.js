const fs = require('fs');
const path = require('path');

const blocked = [
  /PT Nusantara Digital Services/i,
  /NDS\.JK/i,
  /TECHNOLOGY\s*(?:→|->)\s*IT\s+SERVICES/i,
  /nusantaradigital\.id/i,
  /Satria Pratama/i,
  /Maya Indira/i,
  /Rizky Ananda/i,
  /Kevin Sanjaya/i,
  /Dian Sastrowardoyo/i,
  /Budi Santoso/i,
  /Dewi Lestari/i,
  /Demo Showcase/i,
  /Section 136 Scenario/i,
  /simulateFailure/i,
  /Simulate Exception/i,
  /\bBANK_KALBAR\b/,
  /\bensureBankKalbarPersisted\b/,
  /Bank Kalbar institution master bootstrapped to persistent D1 storage/i,
  /View as role/i
];

const findings = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (/\.(ts|tsx|js|jsx|prisma|md)$/.test(entry.name)) {
      const content = fs.readFileSync(full, 'utf8');
      for (const pattern of blocked) {
        if (pattern.test(content)) findings.push(`${full}: ${pattern}`);
      }
    }
  }
}

walk('src');
walk('prisma');

const d1CoreRoutes = [
  'src/app/api/processes/route.ts',
  'src/app/api/risks/route.ts',
  'src/app/api/controls/route.ts',
  'src/app/api/rcm/route.ts',
  'src/app/api/audit/route.ts',
  'src/app/api/dashboard/route.ts',
  'src/app/api/organization/route.ts',
  'src/app/api/ai/analyze/route.ts',
  'src/app/api/assure/rcsa/route.ts',
  'src/app/api/assure/tod/route.ts',
  'src/app/api/assure/icofr/route.ts',
  'src/app/api/assure/certification/route.ts',
  'src/app/api/assure/tasks/route.ts',
  'src/app/api/assure/toe/route.ts',
  'src/app/api/assure/remediation/route.ts',
  'src/app/api/monitor/ccm/route.ts'
];

for (const route of d1CoreRoutes) {
  if (!fs.existsSync(route)) continue;
  const content = fs.readFileSync(route, 'utf8');
  if (/from\s+['"]@\/lib\/prisma['"]/.test(content)) {
    findings.push(`${route}: core production route must use Cloudflare D1, not Prisma/SQLite`);
  }
}

const authenticatedOperationalRoutes = [
  'src/app/api/onboarding/route.ts',
  'src/app/api/processes/route.ts',
  'src/app/api/risks/route.ts',
  'src/app/api/controls/route.ts',
  'src/app/api/rcm/route.ts',
  'src/app/api/audit/route.ts',
  'src/app/api/dashboard/route.ts',
  'src/app/api/assurance/route.ts',
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
  'src/app/api/ai/status/route.ts'
];

for (const route of authenticatedOperationalRoutes) {
  if (!fs.existsSync(route)) {
    findings.push(`${route}: expected authenticated operational route is missing`);
    continue;
  }
  const content = fs.readFileSync(route, 'utf8');
  if (!/from\s+['"]@\/lib\/api-auth['"]/.test(content)) {
    findings.push(`${route}: operational route must enforce server-side authentication/RBAC`);
  }
  if (!/(?:authorizeApi|authorizeTenantApi)\s*\(/.test(content)) {
    findings.push(`${route}: server-side authorization guard is required`);
  }
}

const roleContextPath = 'src/context/RoleContext.tsx';
if (fs.existsSync(roleContextPath)) {
  const roleContext = fs.readFileSync(roleContextPath, 'utf8');
  if (/\bsetRole\b/.test(roleContext) || /\bUSERS\s*=/.test(roleContext)) {
    findings.push(`${roleContextPath}: client-side role simulation is forbidden`);
  }
}

if (!fs.existsSync('src/lib/auth.ts')) {
  findings.push('src/lib/auth.ts: Cloudflare Access authentication foundation is required');
}

if (fs.existsSync('prisma/dev.db')) findings.push('prisma/dev.db is committed/present');

if (findings.length) {
  console.error('Dummy/simulated operational data signatures detected:');
  findings.forEach((item) => console.error(' - ' + item));
  process.exit(1);
}

console.log('No blocked dummy operational data signatures detected.');
