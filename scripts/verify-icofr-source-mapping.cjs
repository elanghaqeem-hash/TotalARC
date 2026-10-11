
const assert=require('node:assert/strict');
const fs=require('node:fs');
const lib=fs.readFileSync('src/lib/d1-icofr-traceability.ts','utf8');
const page=fs.readFileSync('src/app/icofr/traceability/page.tsx','utf8');
const api=fs.readFileSync('src/app/api/icofr/traceability/route.ts','utf8');
for(const marker of [
  "scopedProcessMappings","JOIN ICOFRScope s ON s.id=l.scopeId AND s.institutionId=?",
  "fi.itemType='Financial Account'","pi.itemType='Business Process'",
  "f.institutionId=s.institutionId","b.institutionId=s.institutionId",
  "l.relationType='FSLI_TO_PROCESS'","COALESCE(f.status,'Draft') <> 'Retired'",
  "ASSERTION_MAPPING_RATIONALE_REQUIRED"
])assert.ok(lib.includes(marker),'Missing source-grounded tenant-safe mapping: '+marker);
for(const marker of ["suggestedRisks","sourceProcesses","visibleRisks",
 "Referensi BPM dari dokumen scoping","minLength={25}","setShowAllRisks(false)"]) {
 assert.ok(page.includes(marker),'Missing human-validation UI: '+marker);
}
assert.ok(!page.includes("payload.risks?.[0]?.id"),'Never autochoose first risk');
assert.ok(!page.includes("controls?.[0]?.id || ''"),'Never autochoose first ICOFR control');
assert.ok(api.includes('ASSERTION_MAPPING_RATIONALE_REQUIRED'));
console.log('PASS ICOFR source-backed BPM recommendations, manual risk/assertion selection and rationale validation');
