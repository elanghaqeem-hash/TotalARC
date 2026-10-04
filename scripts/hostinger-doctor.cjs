const fs = require('node:fs');
const path = require('node:path');

function value(name) {
  return String(process.env[name] || '').trim();
}

function fail(message) {
  console.error('[FAIL] ' + message);
  process.exitCode = 1;
}

function ok(message) {
  console.log('[OK] ' + message);
}

const major = Number(process.versions.node.split('.')[0]);
if (major >= 20 && major < 25) ok('Node.js ' + process.versions.node + ' supported.');
else fail('Use Node.js 20.x, 22.x, or 24.x.');

if (value('TOTAL_ARC_AUTH_SECRET').length >= 32) ok('TOTAL_ARC_AUTH_SECRET configured.');
else fail('TOTAL_ARC_AUTH_SECRET must be at least 32 characters.');

const driver = (value('TOTAL_ARC_DB_DRIVER') || 'sqlite').toLowerCase();
if (driver === 'd1-http' || driver === 'cloudflare-d1') {
  const required = [
    'CLOUDFLARE_ACCOUNT_ID',
    'TOTAL_ARC_D1_DATABASE_ID',
    'CLOUDFLARE_D1_API_TOKEN',
  ];
  const missing = required.filter(name => !value(name));
  if (missing.length) fail('D1 HTTP mode missing: ' + missing.join(', '));
  else ok('Cloudflare D1 HTTP compatibility configuration present.');
} else {
  const dbPath = path.resolve(process.cwd(), value('TOTAL_ARC_SQLITE_PATH') || 'data/totalarc.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.accessSync(path.dirname(dbPath), fs.constants.W_OK);
  ok('SQLite directory writable: ' + path.dirname(dbPath));
}

const bootstrapEmail = value('TOTAL_ARC_BOOTSTRAP_ADMIN_EMAIL');
if (bootstrapEmail.toLowerCase() === 'serayamg@gmail.com') {
  ok('Bootstrap superadmin email is serayamg@gmail.com.');
} else if (bootstrapEmail) {
  console.warn('[WARN] Bootstrap admin email is ' + bootstrapEmail + '.');
} else {
  console.warn('[WARN] Bootstrap email is not set. Existing migrated users can still sign in.');
}

console.log('Hostinger preflight completed.');
