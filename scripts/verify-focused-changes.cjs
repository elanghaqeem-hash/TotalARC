/**
 * Fast, dependency-free diagnostics for the affected Total ARC module.
 * Optional preflight; never replaces Required Checks or Production Gate.
 * node scripts/verify-focused-changes.cjs --files src/lib/d1-compliance-risk-assessment.ts
 * node scripts/verify-focused-changes.cjs --base origin/main
 */
'use strict';
const fs=require('node:fs');
const cp=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..'), args=process.argv.slice(2);
let files=[];
if(args[0]==='--files' && args.length>1)files=args.slice(1);
else {
 const base=args.length===0?'HEAD^':args[0]==='--base'&&args.length===2?args[1]:null;
 if(!base)throw Error('Use --files <paths> or --base <commit>');
 files=cp.execFileSync('git',['diff','--name-only','--diff-filter=ACMR',base,'HEAD'],{cwd:root,encoding:'utf8'}).split(/\r?\n/).filter(Boolean);
}
const scripts=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).scripts;
const jobs=new Set(),add=(...v)=>v.forEach(x=>jobs.add(x));
for(const file of files){
 if(/(compliance|risk-assessment|d1-regulatory-obligations)/.test(file))add('verify:compliance-dashboard','verify:compliance-risk-testing','verify:compliance-risk-reassessment');
 if(/(rcm|d1-core|ControlRiskMapping)/i.test(file))add('verify:rcm-integrity');
 if(/(icofr|d1-core)/.test(file))add('verify:icofr-traceability');
 if(/(auth|access-control|tenant|institution-context|middleware)/.test(file))add('verify:auth-security','verify:tenant-isolation');
 if(/(d1-|wrangler)/.test(file))add('verify:d1-schema-stability','verify:d1-binding-config');
 if(/(ai|redaction)/.test(file))add('verify:ai-security');
 if(/^(src|data)\//.test(file))add('verify:no-dummy');
 if(/(\.github\/workflows|package\.json|package-lock\.json)/.test(file))add('verify:github-gates','verify:ci-supply-chain');
}
if(!jobs.size)add('verify:github-gates');
console.log('Changed paths: '+files.length+'; selected source tests: '+[...jobs].sort().join(', '));
for(const job of [...jobs].sort()){
 const command=scripts[job];
 if(!command||!/^node scripts\/[\w.-]+\.(js|cjs)$/.test(command))throw Error('Node-only test unavailable: '+job);
 console.log('>> '+job);
 cp.execFileSync(process.execPath,[command.split(' ')[1]],{cwd:root,stdio:'inherit'});
}
console.log('PASS focused source checks; full security/deploy acceptance remains mandatory.');
