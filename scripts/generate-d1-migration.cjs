const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const outputPath = path.join('migrations', '0001_initial.sql');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'prisma',
    'migrate',
    'diff',
    '--from-empty',
    '--to-schema-datamodel',
    'prisma/schema.prisma',
    '--script'
  ],
  {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    shell: false
  }
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (result.status !== 0) {
  process.stderr.write(result.stderr || '');
  process.exit(result.status || 1);
}

let sql = result.stdout || '';
if (!sql.includes('CREATE TABLE') || !sql.includes('"Institution"')) {
  console.error('Prisma did not generate the expected D1/SQLite schema.');
  process.exit(1);
}

// Total ARC had an early D1 proof-of-concept that may already have created
// Institution/AuditLog. Keep the baseline migration safe for that partial state.
sql = sql
  .replace(/^CREATE TABLE /gm, 'CREATE TABLE IF NOT EXISTS ')
  .replace(/^CREATE UNIQUE INDEX /gm, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
  .replace(/^CREATE INDEX /gm, 'CREATE INDEX IF NOT EXISTS ');

const header = [
  '-- Total ARC initial Cloudflare D1 schema.',
  '-- Generated from prisma/schema.prisma; do not hand-edit model structure here.',
  '-- CREATE statements are idempotent to support databases created during the',
  '-- early D1 proof-of-concept without inserting any operational records.',
  ''
].join('\n');

fs.writeFileSync(outputPath, header + sql.trim() + '\n', 'utf8');
console.log(`Generated ${outputPath}`);
