'use strict';
// Read-only debug tool: fetch original completeness SQL from source and run it on
// the deployment-pinned D1 database. Never copy or dump banking record content.
const fs=require('node:fs');
const cp=require('node:child_process');
const name=String(process.env.TOTALARC_D1_DATABASE_NAME||'').trim();
const id=String(process.env.TOTALARC_D1_DATABASE_ID||'').trim();
if(!name || !id)throw new Error('ICOFR_DIAGNOSTIC_REQUIRES_PINNED_D1');
const dbs=cp.spawnSync('npx',['wrangler','d1','list','--json'],{
  encoding:'utf8',timeout:25000,env:process.env,maxBuffer:2*1024*1024
});
if(dbs.status!==0)throw new Error('ICOFR_DIAGNOSTIC_D1_LIST_UNAVAILABLE');
const matches=JSON.parse(dbs.stdout).filter(x=>x.name===name && (x.uuid||x.id)===id);
if(matches.length!==1)throw new Error('ICOFR_DIAGNOSTIC_D1_IDENTITY_MISMATCH');
const code=fs.readFileSync('src/lib/d1-icofr-integrity.ts','utf8');
const match=code.match(/const completenessSql = `([\s\S]*?)`;/);
if(!match)throw new Error('ICOFR_COMPLETENESS_SQL_SOURCE_NOT_FOUND');
const result=cp.spawnSync('npx',['wrangler','d1','execute',name,'--remote','--json','--command',match[1]],{
  encoding:'utf8',timeout:100000,env:process.env,maxBuffer:2*1024*1024
});
if(result.error){
  console.log('ICOFR_COMPLETENESS_DIAGNOSTIC: CLI_TIMEOUT_OR_RUNTIME_ERROR '+result.error.code);
  process.exit(0);
}
if(result.status===0){
  try {
    const payload=JSON.parse(result.stdout);
    if(Array.isArray(payload)&&payload.every(x=>x.success!==false)){
      console.log('ICOFR_COMPLETENESS_DIAGNOSTIC: DIRECT_D1_QUERY_PASS; check Worker execution budget');
      process.exit(0);
    }
  }catch{}
}
const raw=(result.stderr||'')+'\n'+(result.stdout||'');
const patterns=[
  /no such column:\s*[\w.]+/i,
  /no such table:\s*[\w.]+/i,
  /too many[^\n]*/i,
  /query[^\n]{0,130}(?:timeout|too long|too complex|exhausted|limit)/i,
  /SQLITE_[A-Z_]+/i,
  /D1_ERROR[^\n]{0,170}/i,
  /near "[^"]+": syntax error/i,
  /out of memory/i,
  /maximum[^\n]{0,130}/i
];
let hint='UNCLASSIFIED_D1_ERROR';
for(const re of patterns){const match=raw.match(re);if(match){hint=match[0].slice(0,180);break}}
console.log('ICOFR_COMPLETENESS_DIAGNOSTIC: '+hint);
console.log('CLI_EXIT_STATUS: '+result.status);
