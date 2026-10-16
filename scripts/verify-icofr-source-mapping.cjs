const assert = require('node:assert/strict');
const fs = require('node:fs');
const lib = fs.readFileSync('src/lib/d1-icofr-traceability.ts','utf8');
const page = fs.readFileSync('src/app/icofr/traceability/page.tsx','utf8');
const api = fs.readFileSync('src/app/api/icofr/traceability/route.ts','utf8');
const workspace = fs.readFileSync('src/lib/d1-icofr-mapping-workspace.ts','utf8');
const mappingPage = fs.readFileSync('src/app/icofr/ai-mapping/page.tsx','utf8');

for (const marker of [
  'scopedProcessMappings',"JOIN ICOFRScope s ON s.id=l.scopeId AND s.institutionId=?",
  "fi.itemType='Financial Account'","pi.itemType='Business Process'",
  "f.institutionId=s.institutionId","b.institutionId=s.institutionId",
  "l.relationType='FSLI_TO_PROCESS'","COALESCE(f.status,'Draft') <> 'Retired'",
  "ASSERTION_MAPPING_RATIONALE_REQUIRED"
]) assert.ok(lib.includes(marker),'Missing registered BPM scope or evidence rule: '+marker);

for (const marker of [
  'getTraceabilityData','resolveInstitutionAccess',
  'readRoles', 'todRoles', "actionType === 'SAVE_CHAIN'",
  'MAPPING_APPROVAL_REQUIRED','TRACEABILITY_REVERSAL_REVIEW_REQUIRED',
  "actionType !== 'SAVE_TOD'",'Cross-origin blocked.',
  'requiresHumanApproval: true','Cache-Control'
]) assert.ok(api.includes(marker),'Traceability route must enforce human-governed access: '+marker);

assert.ok(!api.includes('saveTraceabilityChain('),
  'Legacy API must never publish an in-scope assertion directly');
assert.ok(!api.includes('removeTraceabilityChain('),
  'Legacy API must never remove a published approved chain directly');

for (const marker of [
  'unmappedItems','scopedProcessMappings','approvedPlc',
  '/icofr/ai-mapping?item=', 'Buat Draft berbasis bukti',
  'Process Owner → ICOFR Reviewer → Approver',
  'ITGC tidak otomatis menggantikan PLC'
]) assert.ok(page.includes(marker),'Traceability UI must reveal completeness blockers: '+marker);
assert.ok(!page.includes("actionType: 'SAVE_CHAIN'"),
  'Legacy matrix must not show a direct publishing form');
assert.ok(!page.includes('onClick={() => removeChain(row)}'),
  'Legacy matrix must not offer an unapproved reversal');
assert.ok(mappingPage.includes("new URLSearchParams(window.location.search).get('item')"),
  'Account links must resolve in the approval workspace');

for (const marker of [
  "OWNER_REVIEW: {from:['DRAFT']",
  "ICOFR_REVIEW: {from:['OWNER_REVIEWED']",
  "APPROVE: {from:['ICOFR_REVIEWED']",
  "PUBLISH: {from:['APPROVED']",
  "saveTraceabilityChain({",
  "status='PUBLISHING'",
  "category='PLC'",
  "SOURCE_VERSION_CHANGED",
  "SEGREGATION_OF_DUTIES_REQUIRED"
]) assert.ok(workspace.includes(marker),'Approved traceability publishing must retain: '+marker);

console.log('PASS ICOFR traceability approval enforcement, source BPM, PLC gaps and tenant-safe UI');
