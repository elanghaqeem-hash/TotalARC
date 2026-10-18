'use strict';
// Generate additive DDL from the runtime sources. This command never connects to D1.
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const output=process.argv[2];
if(!output) throw new Error('Usage: node scripts/prepare-icofr-test-governance-schema.cjs <output.sql>');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/icofr-test-governance.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{exports:exportsObject});
const statements=[];
for(const path of ['src/lib/d1-icofr-workpaper-review.ts','src/lib/d1-evidence-repository.ts']){
  const source=fs.readFileSync(path,'utf8');
  const match=source.match(/await executeSchemaScript\(db,\s*`([\s\S]*?)`\);/);
  if(!match || match[1].includes('${')) throw new Error('SCHEMA_DEFINITION_DRIFT: '+path);
  statements.push(match[1]);
}
statements.push(exportsObject.TEST_GOVERNANCE_SCHEMA);
const sql=statements.join('\n');
for(const statement of sql.split(';').map(v=>v.trim()).filter(Boolean))
  if(!/^CREATE (?:TABLE|(?:UNIQUE )?INDEX|VIEW) IF NOT EXISTS\b/.test(statement))
    throw new Error('NON_ADDITIVE_SCHEMA_STATEMENT');
fs.writeFileSync(output,'-- Generated additive ICOFR approval schema; no bank data updates.\n'+sql+'\n');
console.log('Generated additive ICOFR test governance schema.');
