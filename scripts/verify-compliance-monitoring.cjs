const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');
const model = read('src/lib/d1-compliance-monitoring.ts');
const api = read('src/app/api/compliance/monitoring/route.ts');
const ui = read('src/app/compliance/monitoring/page.tsx');
const dashboard = read('src/app/compliance/page.tsx');
const acl = read('src/lib/access-control.ts');
const workflow = read('.github/workflows/required-checks.yml');
function has(file,text,why) { assert.ok(file.includes(text),why+' missing'); }

for (const table of ['ComplianceMonitoringPlan','ComplianceMonitoringActivity','ComplianceMonitoringEvent'])
  has(model,'CREATE TABLE IF NOT EXISTS '+table,table+' persisted in D1');
for (const index of ['idx_cmp_plan_code','idx_cmp_plan_queue','idx_cmp_activity_plan','idx_cmp_activity_obligation','idx_cmp_event_plan'])
  has(model,index+' ON ',index+' index');
has(model,'CREATE UNIQUE INDEX IF NOT EXISTS idx_cmp_plan_code ON ComplianceMonitoringPlan(institutionId,code)','tenant unique codes');
has(model,'WHERE institutionId = ? AND id = ?','tenant lookup');
has(model,'WHERE institutionId = ? AND status =','tenant-filtered options');
has(model,'l.institutionId = ? AND l.obligationId = ?','tenant-filtered process mapping');
has(model,'plan.preparedById === actor.id','maker-checker');
has(model,'MONITORING_ACTIVITY_REQUIRED','plan submission gate');
has(model,'MONITORING_ACTIVITIES_PENDING','plan closure gate');
has(model,'AND status = ?','optimistic update guard');
has(model,'ComplianceMonitoringEvent (id,institutionId,planId,actorId','append-only action history');
has(api,'resolveInstitutionAccess(request)','session-authoritative institution');
assert.ok(!api.includes('body.institutionId'),'client institutionId must not be accepted');
assert.ok(!api.includes("searchParams.get('institutionId')"),'query institutionId must not be accepted');
has(api,'if (!ctx.canManage)','server RBAC on mutation');
has(acl,"pathname.startsWith('/api/compliance/monitoring')",'central API RBAC');
has(ui,'Monitoring Plan','UI route');
has(ui,'Tanpa BPM spesifik','explicit BPM relation');
has(ui,'Aktivitas selesai tidak berarti kewajiban dinyatakan patuh','completion is not compliance');
has(dashboard,'href="/compliance/monitoring"','dashboard navigation');
has(workflow,'npm run verify:compliance-monitoring','required CI suite');
const deploy = read('.github/workflows/deploy-cloudflare.yml');
const production = read('scripts/verify-stage2-monitoring-production.cjs');
const assuranceMigration = read('scripts/migrate-assurance-schema.py');
has(deploy,'Verify Stage 2 Compliance Monitoring production gate','Stage 2 deploy gate');
has(deploy,'node scripts/verify-stage2-monitoring-production.cjs','Stage 2 runtime/D1 verification command');
has(deploy,'python scripts/migrate-assurance-schema.py','legacy assurance D1 repair before deployment');
for (const table of ['ComplianceMonitoringPlan','ComplianceMonitoringActivity','ComplianceMonitoringEvent'])
  has(production,'CREATE TABLE IF NOT EXISTS '+table,table+' safe additive production schema');
for (const index of ['idx_cmp_plan_code','idx_cmp_plan_queue','idx_cmp_activity_plan','idx_cmp_activity_obligation','idx_cmp_event_plan'])
  has(production,index,index+' required in production');
for (const criterion of [
  'planOwnerMissing','activityPlanMissing','activityObligationMissing','activityOwnerMissing',
  'processMappingMissing','eventPlanMissing','selfApproval','invalidPlanStatus',
  "boundary('GET')","boundary('POST')",'database_id','database_name'
]) has(production,criterion,'Stage 2 production contract '+criterion);
for (const criterion of ['TOTALARC_D1_DATABASE_ID','TOTALARC_D1_DATABASE_NAME',
  'PRAGMA table_info(ControlDeficiency)','humanApproved','approvedBy'])
  has(assuranceMigration,criterion,'pinned assurance schema repair '+criterion);

console.log('PASS Compliance Monitoring Plan static contract: tenant, RBAC, maker-checker, traceability, persistence, UI and CI');
