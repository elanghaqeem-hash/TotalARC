const fs = require('fs');
const path = require('path');

const blocked = [
  /PT Nusantara Digital Services/i,
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
  /ensureBankKalbarPersisted/i,
  /\bBANK_KALBAR\b/,
  /bootstrapped to persistent D1 storage/i,
  /\|\|\s*['"]Effective['"]/,
  /\|\|\s*['"]Effective Design['"]/
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

      if (full !== path.join('src', 'lib', 'prisma.ts') && /new\s+PrismaClient\s*\(/.test(content)) {
        findings.push(`${full}: PrismaClient must be created only by src/lib/prisma.ts`);
      }

      if (/import\s*\{\s*prisma\s*\}\s*from\s*['"]@\/lib\/prisma['"]/.test(content)) {
        findings.push(`${full}: global prisma import is forbidden; use getPrisma() per request`);
      }

      if (/from\s*['"]@\/lib\/d1['"]/.test(content)) {
        findings.push(`${full}: legacy D1 operational helper import is forbidden`);
      }
    }
  }
}

walk('src');
walk('prisma');
walk('migrations');

if (fs.existsSync('prisma/dev.db')) findings.push('prisma/dev.db is committed/present');

if (findings.length) {
  console.error('Dummy/simulated data or unsafe persistence patterns detected:');
  findings.forEach((item) => console.error(' - ' + item));
  process.exit(1);
}

console.log('No blocked dummy data or unsafe persistence patterns detected.');
