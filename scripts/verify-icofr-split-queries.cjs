'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync('src/lib/d1-icofr-integrity.ts','utf8');
const tables=[...source.split('const INTEGRITY_REQUIRED_TABLES = [')[1].split('] as const')[0]
  .matchAll(/'([^']+)'/g)].map(x=>({name:x[1]}));
assert.ok(source.includes('function completenessSqlFor'));
assert.ok(source.includes('const incompleteSources = ['));
assert.ok(source.includes('NON_ADVANCING_COMPLETENESS_CURSOR'));
const fields=['significantFinancialItems','significantFinancialItemsWithAssertion','inScopeAssertions',
 'financialAssertionMissing','assertionsWithProcess','assertionsWithRisk','assertionsWithControl',
 'assertionRiskMissing','assertionProcessMissing','riskControlMissing','controlsWithToD',
 'controlsWithToE','keyControlToDMissing','keyControlToEMissing','exceptionsWithDeficiency',
 'deficienciesWithIssue','issuesWithMAP','exceptionDeficiencyMissing',
 'approvedDeficiencyIssueMissing','issueMapMissing'];
const expected=new Set(fields),values=Object.fromEntries(fields.map(f=>[f,0]));
values.inScopeAssertions=10;
const gaps={risk_missing:['a-1','a-2'],process_missing:['a-2','a-3'],
 control_missing:[],tod_missing:[],toe_missing:[],exception_deficiency_missing:[],
 approved_deficiency_issue_missing:[],issue_map_missing:[]};
const aggregates=[],scans=[];
function prepare(sql){
 let params=[];
 const aliases=[...sql.matchAll(/\bAS\s+([a-z][A-Za-z]+)(?=\s*(?:,|$))/gm)]
   .map(m=>m[1]).filter(x=>expected.has(x));
 const kind=sql.match(/SELECT DISTINCT assertionId FROM (\w+) WHERE assertionId > \? ORDER BY assertionId LIMIT 500/);
 const execute=async()=>{
   if(sql.includes('sqlite_master'))return tables;
   if(sql.includes('ORDER BY createdAt'))return [];
   if(sql.includes('AS subCertifications'))return [{subCertifications:0}];
   if(kind){
     scans.push({name:kind[1],sql});
     return (gaps[kind[1]]||[]).filter(x=>x>String(params[0]||''))
       .slice(0,500).map(assertionId=>({assertionId}));
   }
   if(aliases.length){
     aggregates.push({sql,aliases});
     assert.ok(aliases.length<=6,'Each D1 query must stay bounded');
     assert.ok(!sql.includes('incomplete_assertions AS ('),'No giant UNION in compiled SQL');
     assert.ok(sql.length<5000,'Unused CTEs must be pruned');
     return [Object.fromEntries(aliases.map(key=>[key,values[key]]))];
   }
   return [{count:0}];
 };
 const statement={bind:(...p)=>{params=p;return statement;},
   all:async()=>({results:await execute()}),
   first:async()=>(await execute())[0]||null};
 return statement;
}
const db={prepare,batch:async s=>s.map(()=>({results:[{count:0}]}))};
const moduleExports={};
vm.runInNewContext(ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{
 exports:moduleExports,console:{error(){}},
 require(id){assert.equal(id,'@opennextjs/cloudflare');
   return {getCloudflareContext:async()=>({env:{DB:db}})}}
});
(async()=>{
 const report=await moduleExports.getIcofrReferentialIntegrityReport();
 assert.equal(aggregates.length,4,'Four bounded aggregate queries');
 assert.deepEqual(new Set(aggregates.flatMap(x=>x.aliases)),expected);
 assert.equal(scans.length,8,'Eight distinct gap-source scans');
 assert.ok(scans.every(x=>x.sql.length<5000 && !x.sql.includes('incomplete_assertions AS (')));
 assert.equal(report.metrics.inScopeAssertions,10);
 assert.equal(report.metrics.incompleteChains,3,'Overlapping missing IDs must count once');
 assert.equal(report.metrics.completeChains,7);
 assert.equal(report.metrics.coveragePercent,70);
 console.log('PASS: ICOFR pruned CTEs, bounded read-only gap scans, exact missing assertion union');
})().catch(e=>{console.error(e);process.exitCode=1});
