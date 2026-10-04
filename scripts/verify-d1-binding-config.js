const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function read(file) {
  if (!fs.existsSync(file)) throw new Error('D1_BINDING_CONFIG_ERROR: missing ' + file);
  return fs.readFileSync(file, 'utf8');
}

function requireMarker(file, marker) {
  if (!read(file).includes(marker)) {
    throw new Error('D1_BINDING_CONFIG_ERROR: ' + file + ' missing marker: ' + marker);
  }
}

const workflow = '.github/workflows/deploy-cloudflare.yml';
for (const marker of [
  'Resolve and pin production D1 binding',
  'TOTALARC_D1_DATABASE_ID',
  'TOTALARC_D1_DATABASE_NAME',
  '/workers/scripts/totalarc/settings',
  'prepare-production-d1-config.cjs',
  'wrangler.production.json',
  '--no-x-provision',
  'Verify production D1 binding identity',
  'Production Worker DB binding does not match the pinned TotalARC D1 database',
  "PT. Bank Pembangunan Daerah Kalimantan Barat"
]) {
  requireMarker(workflow, marker);
}

for (const marker of [
  'requested_id = str(os.environ.get("TOTALARC_D1_DATABASE_ID")',
  'requested_name = str(os.environ.get("TOTALARC_D1_DATABASE_NAME")',
  'TOTAL_ARC_D1_NOT_FOUND_OR_AMBIGUOUS',
  'TOTAL_ARC_D1_ID_MISMATCH',
  'TOTAL_ARC_D1_NAME_MISMATCH'
]) {
  requireMarker('scripts/backfill-process-objectives.py', marker);
}

const baseConfig = read('wrangler.jsonc');
if (!baseConfig.includes('"binding": "DB"')) {
  throw new Error('D1_BINDING_CONFIG_ERROR: wrangler.jsonc must declare binding DB.');
}

const output = path.join(os.tmpdir(), 'totalarc-wrangler-production-' + process.pid + '.json');
const fakeId = '123e4567-e89b-42d3-a456-426614174000';
const fakeName = 'totalarc-production-verification';

const result = spawnSync(
  process.execPath,
  ['scripts/prepare-production-d1-config.cjs'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TOTALARC_D1_DATABASE_ID: fakeId,
      TOTALARC_D1_DATABASE_NAME: fakeName,
      TOTALARC_WRANGLER_OUTPUT: output
    },
    encoding: 'utf8'
  }
);

if (result.status !== 0) {
  throw new Error(
    'D1_BINDING_CONFIG_ERROR: production config generator failed: ' +
      (result.stderr || result.stdout || 'unknown error')
  );
}

const generated = JSON.parse(fs.readFileSync(output, 'utf8'));
fs.rmSync(output, { force: true });

const binding = (generated.d1_databases || []).find(item => item.binding === 'DB');
if (!binding || binding.database_id !== fakeId || binding.database_name !== fakeName) {
  throw new Error(
    'D1_BINDING_CONFIG_ERROR: generated production config does not pin DB name and database_id.'
  );
}

console.log(
  'D1 binding deployment contract verified: production config pins database_name/database_id, disables auto-provisioning, and verifies the live Worker binding.'
);
