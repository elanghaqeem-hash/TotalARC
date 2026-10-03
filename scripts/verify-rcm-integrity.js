const fs = require('fs');

function read(path) {
  if (!fs.existsSync(path)) throw new Error('RCM_INTEGRITY_ERROR: missing ' + path);
  return fs.readFileSync(path, 'utf8');
}

function requireMarker(path, marker) {
  if (!read(path).includes(marker)) {
    throw new Error('RCM_INTEGRITY_ERROR: ' + path + ' missing marker: ' + marker);
  }
}

const core = 'src/lib/d1-core.ts';
for (const marker of [
  'controls: Number(controlTotalRow?.count || 0)',
  'uusControls: Number(uusControlTotalRow?.count || 0)',
  'itgcControls: Number(itgcControlTotalRow?.count || 0)',
  'ckpnRequirements: Number(ckpnRequirementTotalRow?.count || 0)',
  'reverseRepoRequirements: Number(reverseRepoRequirementTotalRow?.count || 0)',
  'elcDraftReferences: Number(elcDraftReferenceTotalRow?.count || 0)',
  "integrity: String(parsedIntegrity?.status || 'PENDING')"
]) requireMarker(core, marker);

requireMarker('src/app/api/system/rcm-integrity/route.ts', "test: 'RCM_PRODUCTION_INTEGRITY'");
requireMarker('src/app/api/system/rcm-integrity/route.ts', 'getRcmGovernanceData');

const workflow = '.github/workflows/verify-production-d1.yml';
for (const marker of [
  '/api/system/rcm-integrity',
  '.summary.controls == 132',
  '.summary.uusControls == 42',
  '.summary.itgcControls == 10',
  '.summary.ckpnRequirements == 9',
  '.summary.reverseRepoRequirements == 1',
  '.summary.elcDraftReferences == 63',
  '.summary.integrity == "PASS"'
]) requireMarker(workflow, marker);

console.log('RCM integrity contract verified: production gate enforces 132/42/10/9/1/63 and PASS.');
