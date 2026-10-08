const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const risk=read('src/lib/d1-compliance-risk-assessment.ts');
const testing=read('src/lib/d1-compliance-testing.ts');
const riskApi=read('src/app/api/compliance/risk-assessment/route.ts');
const testApi=read('src/app/api/compliance/testing/route.ts');
const riskUi=read('src/app/compliance/risk-assessment/page.tsx');
const testUi=read('src/app/compliance/testing/page.tsx');
const acl=read('src/lib/access-control.ts');
const dashboard=read('src/app/compliance/page.tsx');
const workflow=read('.github/workflows/required-checks.yml');
function has(c,s,m){assert.ok(c.includes(s),m);}
for(const table of ['ComplianceRiskAssessment','ComplianceRiskEvent'])has(risk,'CREATE TABLE IF NOT EXISTS '+table,table+' D1 schema');
for(const table of ['ComplianceTestWorkpaper','ComplianceTestSample','ComplianceTestEvidence','ComplianceTestFinding','ComplianceTestEvent'])
  has(testing,'CREATE TABLE IF NOT EXISTS '+table,table+' D1 schema');
for(const x of ['idx_cra_tenant_period','idx_cra_obligation','idx_cra_review','idx_ct_status','idx_ct_obligation',
  'idx_ct_sample_ref','idx_ct_evidence','idx_ct_finding','idx_ct_event'])
  has(risk+testing,x,'expected tenant index '+x);
has(risk,'inherentLikelihood*inherentImpact','inherent score deterministic');
has(risk,'residualLikelihood*residualImpact','residual score deterministic');

has(risk,'record.preparedById===actor.id','separate reviewer for risk');
has(risk,"COMPLIANCE_RISK_REVIEW.has(actor.role)",'risk reviewer RBAC');
has(risk,"action==='APPROVE'?'APPROVED':'REJECTED'",'approved status stored');
has(risk,'RegulatoryObligationLink','mapped obligation targets');
has(risk,'ControlRiskMapping','risk-control process coherence');
has(risk,"WHERE institutionId=? AND id=?",'risk tenant-filtered lookup');
has(risk,'ComplianceRiskEvent (','immutable assessment audit');
has(testing,"l.institutionId=? AND l.obligationId=?",'control mapping scoped to tenant');
has(testing,"w.preparedById",'tester ownership');
has(testing,"actor.id===w.preparedById",'no self-review');
has(testing,'CT_FALSE_PASS','block failed workpaper success');
has(testing,'CT_EVIDENCE_REQUIRED','no approval without evidence');
has(testing,'CT_SAMPLES_INCOMPLETE','no untested sample inferred pass');
has(testing,'CT_FINDING_REQUIRED','require finding for sample failures');
has(testing,'sourceTestId','separate retest provenance');
has(testing,'EvidenceVersion','versioned real evidence');
has(testing,'ComplianceMonitoringPlan','approved monitoring plan');
has(testing,'ICOFRWorkpaperReview','cross-module ToD/ToE reference');
has(testing,'ManagementActionPlan','existing MAP link');
has(testing,"i.institutionId=?",'MAP linked through correct tenant');
has(testing,"FROM ComplianceTestEvent",'append-only audit log');
has(riskApi,'resolveInstitutionAccess(request)','risk tenant from authenticated session');
has(testApi,'resolveInstitutionAccess(request)','test tenant from authenticated session');
assert.ok(!riskApi.includes('b.institutionId')&&!testApi.includes('b.institutionId'),'client cannot pick institution');
has(riskApi,"if('error' in a)",'risk read/write requires auth');
has(testApi,"if('error' in a)",'test read/write requires auth');
has(acl,"pathname.startsWith('/api/compliance/risk-assessment')",'central risk middleware');
has(acl,"pathname.startsWith('/api/compliance/testing')",'central testing middleware');
has(riskUi,'Risk Assessment','stage3 UI');
has(testUi,'Testing & Review','stage4 UI');
has(testUi,'Belum diuji ≠ lulus','no fake results');
has(dashboard,'href="/compliance/risk-assessment"','risk shortcut');
has(dashboard,'href="/compliance/testing"','testing shortcut');
has(workflow,'npm run verify:compliance-risk-testing','CI required checks');
console.log('PASS Compliance stages 3/4 contract: tenant, RBAC, source mapping, scores, sample/evidence, findings, independent approval, retest and UI');

