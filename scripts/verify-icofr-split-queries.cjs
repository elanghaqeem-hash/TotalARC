'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync('src/lib/d1-icofr-integrity.ts','utf8');
const tableNames=[...source.split('const INTEGRITY_REQUIRED_TABLES = [')[1].split('] as const')[0].matchAll(/'([^']+)'/g)].map(x=>({name:x[1]}));
assert.ok(source.includes('const completenessMetricGroups = ['));
assert.ok(!source.includes('const completenessSql = \`'));
assert.ok(source.includes("merged.completeChains = Number(merged.inScopeAssertions) - Number(merged.incompleteChains)"));
assert.ok(source.includes("integrityStage('COMPLETENESS_METRICS'"));
const aliases=['significantFinancialItems','significantFinancialItemsWithAssertion','inScopeAssertions',
 'financialAssertionMissing','assertionsWithProcess','assertionsWithRisk','assertionsWithControl',
 'assertionRiskMissing','assertionProcessMissing','riskControlMissing','controlsWithToD',
 'controlsWithToE','keyControlToDMissing','keyControlToEMissing','exceptionsWithDeficiency',
 'deficienciesWithIssue','issuesWithMAP','exceptionDeficiencyMissing','approvedDeficiencyIssueMissing',
 'issueMapMissing','incompleteChains'];
const expected=new Set(aliases);
let queries=[];
const sample=Object.fromEntries(aliases.map(k=>[k,0]));
sample.inScopeAssertions=10; sample.incompleteChains=3;
function statement(sql){
 const aliasesInSql=[...sql.matchAll(/\bAS\s+([a-z][A-Za-z]+)(?=\s*(?:,|$))/gm)].map(x=>x[1]).filter(x=>expected.has(x));
 const run=async()=>{
   if(sql.includes('sqlite_master'))return tableNames;
   if(sql.includes('ORDER BY createdAt'))return [];
   if(sql.includes('AS subCertifications'))return [{subCertifications:0}];
   if(sql.includes('significant_financial AS')){
     queries.push({sql,fields:aliasesInSql});
     assert.ok(aliasesInSql.length<=6,'Complex metric query contains too many separate scalar aggregates');
     return [Object.fromEntries(aliasesInSql.map(k=>[k,sample[k]]))];
   }
   return [{count:0}];
 };
 const stmt={bind:()=>stmt,all:async()=>({results:await run()}),first:async()=> (await run())[0]||null};
 return stmt;
}
const DB={prepare:statement,batch:async statements=>statements.map(()=>({results:[{count:0}]}))};
const moduleExports={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports:moduleExports,console:{error(){}},require(id){assert.equal(id,'@opennextjs/cloudflare');return {getCloudflareContext:async()=>({env:{DB}})}}
});
(async()=>{
 const report=await moduleExports.getIcofrReferentialIntegrityReport();
 assert.equal(queries.length,5,'Must issue 5 bounded metric queries');
 assert.equal(queries.every(x=>x.sql.trimStart().startsWith('WITH')&&x.sql.includes('incomplete_assertions AS')),true);
 const collected=queries.flatMap(x=>x.fields);
 assert.equal(collected.length,new Set(collected).size,'Metric aliases cannot be counted twice');
 assert.deepEqual(new Set(collected),expected,'Every original completeness metric must be measured');
 assert.equal(report.metrics.inScopeAssertions,10);
 assert.equal(report.metrics.incompleteChains,3);
 assert.equal(report.metrics.completeChains,7,'No missing chain may be marked complete');
 assert.equal(report.metrics.coveragePercent,70);
 console.log('ICOFR SPLIT QUERY PASS: five bounded D1 read-only metric queries and unchanged coverage semantics');
})().catch(e=>{console.error(e);process.exitCode=1});
