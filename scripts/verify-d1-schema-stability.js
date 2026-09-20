const fs = require('fs');

const criticalFiles = [
  'src/lib/d1.ts',
  'src/lib/d1-organization.ts',
  'src/lib/d1-rcsa.ts',
  'src/lib/d1-icofr.ts',
  'src/lib/d1-icofr-traceability.ts',
  'src/lib/d1-icofr-testing-plan.ts',
  'src/lib/d1-icofr-roll-forward.ts',
  'src/lib/d1-icofr-period-lock.ts',
  'src/lib/d1-icofr-certification.ts',
  'src/lib/d1-icofr-smart-testing.ts',
  'src/lib/d1-icofr-sampling-evidence.ts'
];

const findings = [];

for (const path of criticalFiles) {
  if (!fs.existsSync(path)) {
    findings.push(path + ': missing critical D1 module');
    continue;
  }

  const content = fs.readFileSync(path, 'utf8');

  if (/await\s+db\.exec\(script\)/.test(content)) {
    findings.push(
      path +
        ': multi-statement db.exec(script) is blocked for cold-start schema initialization; use serialized prepared statements'
    );
  }

  if (/await\s+Promise\.all\(\[\s*ensure[A-Z]/m.test(content)) {
    findings.push(
      path +
        ': concurrent schema dependency warmup is blocked; initialize dependent D1 schemas sequentially'
    );
  }
}

if (findings.length) {
  console.error('D1 schema stability violations detected:');
  for (const finding of findings) console.error(' - ' + finding);
  process.exit(1);
}

console.log('D1 schema initialization stability guardrails passed.');
