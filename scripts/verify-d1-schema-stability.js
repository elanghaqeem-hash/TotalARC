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

if (findings.length) {
  console.error('D1 schema stability violations detected:');
  for (const finding of findings) console.error(' - ' + finding);
  process.exit(1);
}

console.log(
  'D1 schema stability verified: runtime schema DDL is serialized and dependent schema initialization is deterministic.'
);
