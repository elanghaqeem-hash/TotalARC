const fs = require('fs');
const path = require('path');

const root = process.cwd();
const libDir = path.join(root, 'src', 'lib');

const files = fs
  .readdirSync(libDir)
  .filter(name => /^d1.*\.ts$/.test(name) || name === 'auth.ts' || name === 'auth-security.ts')
  .map(name => path.join('src', 'lib', name));

const findings = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');

  if (/\bdb\.exec\(/.test(content)) {
    findings.push(
      file +
        ': direct db.exec() is blocked for runtime D1 schema initialization; execute DDL statements individually through prepared statements.'
    );
  }

  const schemaPromiseAll = /await\s+Promise\.all\(\[\s*([\s\S]*?)\s*\]\);/g;
  for (const match of content.matchAll(schemaPromiseAll)) {
    const inside = match[1];
    const ensures = Array.from(inside.matchAll(/ensure[A-Za-z0-9_]+\(\)/g));
    if (!ensures.length) continue;
    const remainder = inside
      .replace(/ensure[A-Za-z0-9_]+\(\)/g, '')
      .replace(/[\s,]/g, '');
    if (!remainder) {
      findings.push(
        file +
          ': concurrent schema dependency initialization is blocked; await dependent ensure* schema functions sequentially.'
      );
    }
  }
}



const hubPath = path.join(root, 'src', 'app', 'api', 'icofr', 'hub', 'route.ts');
if (!fs.existsSync(hubPath)) {
  findings.push('src/app/api/icofr/hub/route.ts: missing ICOFR hub route');
} else {
  const hub = fs.readFileSync(hubPath, 'utf8');
  const requiredHubPrewarm = [
    'await ensureIcofrScopeSchema();',
    'await ensureIcofrDomainSchema();',
    'await ensureIcofrTraceabilitySchema();',
    'await ensureIcofrCoverageSchema();',
    'await ensureIcofrTestingPlanSchema();',
    'await ensureIcofrCertificationSchema();',
    'await ensureIcofrExecutiveReportingSchema();'
  ];
  const fanOutIndex = hub.indexOf('const [');
  for (const marker of requiredHubPrewarm) {
    const markerIndex = hub.indexOf(marker);
    if (markerIndex < 0 || fanOutIndex < 0 || markerIndex > fanOutIndex) {
      findings.push(
        'src/app/api/icofr/hub/route.ts: ICOFR hub schema prewarm must complete before parallel read fan-out: ' + marker
      );
    }
  }
}


if (findings.length) {
  console.error('D1 schema stability violations detected:');
  for (const finding of findings) console.error(' - ' + finding);
  process.exit(1);
}

console.log(
  'D1 schema stability verified: runtime schema DDL is serialized and dependent schema initialization is deterministic.'
);
