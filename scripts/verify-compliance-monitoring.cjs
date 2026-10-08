const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const model = read('src/lib/d1-compliance-monitoring.ts');
const api = read('src/app/api/compliance/monitoring/route.ts');
const ui = read('src/app/compliance/monitoring/page.tsx');
const dashboard = read('src/app/compliance/page.tsx');
const acl = read('src/lib/access-control.ts');
const workflow = read('.github/workflows/required-checks.yml');

function contains(source, pattern, message) {
  assert.match(source,pattern,message);
}
for (const table of ['ComplianceMonitoringPlan','ComplianceMonitoringActivity','ComplianceMonitoringEvent']) {
  contains(model,new RegExp('CREATE TABLE IF NOT EXISTS '+table+' \\('),table+' persisted in D1');
}
for (const index of ['idx_cmp_plan_code','idx_cmp_plan_queue','idx_cmp_activity_plan','idx_cmp_activity_obligation','idx_cmp_event_plan']) {
  contains(model,new RegExp(index+' ON .*\\(institutionId'),index+' tenant first');
}
contains(model,/CREATE UNIQUE INDEX IF NOT EXISTS idx_cmp_plan_code/,'plan codes unique per institution');
contains(model,/WHERE institutionId = \\? AND id = \\?/,'tenant-scoped plan lookup');
contains(model,/o\.institutionId|institutionId = \\?/,'tenant scoping obligations');
contains(model,/l\.institutionId = \\? AND l\.obligationId/,'tenant scoping BPM mapping');
contains(model,/plan\.preparedById === actor\.id/,'maker checker self-approval defense');
contains(model,/UPDATE ComplianceMonitoringPlan SET status = \\?/,'persist workflow');
contains(model,/AND status = \\?/,'optimistic status transition guard');
contains(model,/MONITORING_ACTIVITY_REQUIRED/,'must have activity before submission');
contains(model,/MONITORING_ACTIVITIES_PENDING/,'cannot fake all activities complete');
contains(model,/ComplianceMonitoringEvent \(id,institutionId,planId,actorId/,'append-only action history');
contains(api,/resolveInstitutionAccess\(request\)/,'session-authoritative tenant');
assert.doesNotMatch(api,/body\.institutionId|searchParams\.get\(['"]institutionId/,'never accept tenant from client');
contains(api,/if \(!ctx\.canManage\)/,'negative RBAC write guard');
contains(api,/status:403/,'forbidden responses');
contains(acl,/pathname\.startsWith\(['"]\\/api\\/compliance\\/monitoring/,'central middleware guard');
contains(ui,/Monitoring Plan/,'user-facing module');
contains(ui,/Tanpa BPM spesifik/,'no speculative BPM mapping');
contains(ui,/Aktivitas selesai tidak berarti kewajiban dinyatakan patuh/,'completion not compliance');
contains(dashboard,/href="\\/compliance\\/monitoring"/,'navigation link');
contains(workflow,/npm run verify:compliance-monitoring/,'required CI test');
console.log('PASS Compliance Monitoring Plan: tenant isolation, RBAC, maker-checker, persistence, mapping, workflow and UI integration contract');
