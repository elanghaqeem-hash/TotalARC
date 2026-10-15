'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const Module=require('node:module');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(process.cwd(),name),'utf8');
const source=read('src/lib/access-control.ts');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const mod=new Module('access-control.ts',module);
mod.filename=path.resolve('src/lib/access-control.ts');
mod._compile(js,mod.filename);
const {canAccessApi,canAccessPage}=mod.exports;
assert.equal(canAccessPage('ProcessOwner','/icofr/ai-mapping'),true);
for(const role of ['Admin','RiskManager','Executive','Tester','ReadOnlyAuditor','InternalAuditor'])
  assert.equal(canAccessApi(role,'/api/icofr/ai-mapping','POST'),false);
for(const role of ['ICOFRCoordinator','ProcessOwner','Reviewer'])
  assert.equal(canAccessApi(role,'/api/icofr/ai-mapping','POST'),true);
assert.equal(canAccessApi('ProcessOwner','/api/icofr/ai-mapping/recommend','POST'),false);
assert.equal(canAccessApi('ICOFRCoordinator','/api/icofr/ai-mapping/recommend','POST'),true);
const lib=read('src/lib/d1-icofr-mapping-workspace.ts');
for(const token of ['FSLI_TO_PROCESS','ControlRiskMapping','SourceDocument','sourceHash','ICOFRMappingProposal','ICOFRMappingReviewEvent','OWNER_REVIEW','ICOFR_REVIEW','SEGREGATION_OF_DUTIES_REQUIRED','PLC_MAPPING_REQUIRED'])
  assert.ok(lib.includes(token),token);
assert.ok(!lib.includes('INSERT INTO ToETest'));
assert.ok(!lib.includes('INSERT INTO ICOFRDesignAssessment'));
const ai=read('src/app/api/icofr/ai-mapping/recommend/route.ts');
assert.ok(ai.includes('guardAiPost'));
assert.ok(ai.includes('candidates.find'));
assert.ok(ai.includes('persisted:false'));
console.log('ICOFR_AI_MAPPING_WORKSPACE: PASS');
