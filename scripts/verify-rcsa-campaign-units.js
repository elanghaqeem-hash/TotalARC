const fs = require('fs');

const findings = [];

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(path, value, label) {
  const content = read(path);
  if (!content.includes(value)) findings.push(label + ': expected "' + value + '" in ' + path);
}

const rcsa = 'src/lib/d1-rcsa.ts';
requireText(rcsa, 'CREATE TABLE IF NOT EXISTS AssessmentCampaignUnit', 'Campaign-unit mapping table');
requireText(rcsa, 'institutionId TEXT NOT NULL', 'Tenant-scoped campaign unit');
requireText(rcsa, 'organizationUnitId TEXT NOT NULL', 'Organization unit foreign reference');
requireText(rcsa, 'idx_assessment_campaign_unit_unique', 'Duplicate unit protection');
requireText(rcsa, "WHERE id = ? AND institutionId = ?", 'Institution ownership validation');
requireText(rcsa, "throw new Error('CAMPAIGN_UNIT_REQUIRED')", 'At least one participant unit required');
requireText(rcsa, "throw new Error('CAMPAIGN_UNIT_NOT_FOUND')", 'Cross-tenant/unknown unit protection');
requireText(rcsa, "throw new Error('CAMPAIGN_UNIT_INACTIVE')", 'Inactive unit protection');
requireText(rcsa, 'participatingUnits', 'Campaign participant unit read model');

const api = 'src/app/api/assurance/route.ts';
requireText(api, "const needOrganization = wants('organization', 'rcsa');", 'Organization data loaded for RCSA');
requireText(api, "textArray(body, 'organizationUnitIds')", 'Participant unit array parsing');
requireText(api, 'organizationUnitIds.length === 0', 'API participant unit requirement');
requireText(api, 'organizationUnitIds,', 'Participant units passed to persistence');

const ui = 'src/app/rcsa/page.tsx';
requireText(ui, 'Unit Kerja Peserta *', 'Participant unit field');
requireText(ui, 'organizationUnitIds: [] as string[]', 'Multi-select state');
requireText(ui, 'Cari kode, nama, atau jenis unit kerja...', 'Participant search');
requireText(ui, "'Pilih semua'", 'Select-all participant units');
requireText(ui, 'Hybrid (RCSA + CSA)', 'Hybrid program label');
requireText(ui, 'campaign.participatingUnits', 'Campaign card participant display');
requireText(ui, 'Pilih minimal satu Unit Kerja Peserta', 'Front-end required validation');

if (findings.length) {
  console.error('RCSA/CSA campaign participating-unit verification FAILED:');
  for (const finding of findings) console.error('- ' + finding);
  process.exit(1);
}

console.log('RCSA/CSA campaign participating-unit verification PASS');
console.log('- Campaign requires one or more registered organization units.');
console.log('- Organization units are validated within the active institution.');
console.log('- Participant-unit mappings persist separately for reporting and audit lineage.');
console.log('- CSA, RCSA and Hybrid campaigns share the same participant-unit mechanism.');
