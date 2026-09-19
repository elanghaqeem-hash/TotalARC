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
  /Simulate Exception/i
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

if (fs.existsSync('prisma/dev.db')) findings.push('prisma/dev.db is committed/present');

if (findings.length) {
  console.error('Dummy/simulated operational data signatures detected:');
  findings.forEach((item) => console.error(' - ' + item));
  process.exit(1);
}

console.log('No blocked dummy operational data signatures detected.');
