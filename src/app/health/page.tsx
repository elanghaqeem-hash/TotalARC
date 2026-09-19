'use client';

import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react';

type HealthRow = {
  id:string;controlId:string;name:string;owner:string;derivedHealth:string;isKeyControl:boolean;
  process:{processId:string;name:string};
  tod:{conclusion:string;testedAt:string;status:string}|null;
  toe:{conclusion:string;testedAt:string;passCount:number;failCount:number;sampleSize:number}|null;
  openIssues:Array<{id:string;issueId:string;severity:string;title:string;status:string}>;
  ccm:Array<{ruleId:string;name:string;lastStatus:string;lastRunDate?:string|null;lastRun?:{populationChecked:number;exceptionsFound:number}|null}>;
  certification:any;
};

export default function HealthPage(){
  const[data,setData]=useState<{metrics:any;controls:HealthRow[]}|null>(null);
  const[error,setError]=useState('');
  useEffect(()=>{fetch('/api/control-health',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to load control health');setData(d);}).catch(e=>setError(e.message));},[]);
  const m=data?.metrics||{total:0,healthy:0,attention:0,deficient:0,notAssessed:0};
  const cards=[
    ['Total Controls',m.total,'text-slate-900'],['Healthy',m.healthy,'text-emerald-700'],['Attention',m.attention,'text-amber-700'],['Deficient',m.deficient,'text-rose-700'],['Not Assessed',m.notAssessed,'text-slate-500']
  ];
  return <div className="space-y-6">
    <div><h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><Activity className="w-5 h-5 text-brand-600"/>Control Health Cockpit</h1><p className="text-xs text-slate-500 mt-1">Health is derived from latest ToD, ToE, open issues and CCM evidence. Missing evidence remains Not Assessed.</p></div>
    {error&&<div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</div>}
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{cards.map(([label,value,cls])=><div key={String(label)} className="bg-white border border-slate-200 rounded-xl p-4"><div className="text-[10px] uppercase font-bold text-slate-400">{label}</div><div className={'text-2xl font-black mt-1 '+cls}>{value}</div></div>)}</div>
    <div className="space-y-4">
      {(data?.controls||[]).map(c=><article key={c.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div><div className="text-[10px] font-mono text-slate-400">{c.controlId} • {c.process.processId}</div><h2 className="text-sm font-bold text-slate-900">{c.name}</h2><div className="text-[11px] text-slate-500 mt-1">Owner: {c.owner} • {c.isKeyControl?'Key Control':'Non-key Control'}</div></div>
          <span className={'text-[10px] font-bold px-2.5 py-1 rounded-full '+(c.derivedHealth==='Healthy'?'bg-emerald-50 text-emerald-700':c.derivedHealth==='Deficient'?'bg-rose-50 text-rose-700':c.derivedHealth==='Attention Required'?'bg-amber-50 text-amber-700':'bg-slate-100 text-slate-600')}>{c.derivedHealth}</span>
        </div>
        <div className="mt-4 grid md:grid-cols-4 gap-3 text-[11px]">
          <div className="bg-slate-50 rounded-lg p-3"><div className="font-bold text-slate-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5"/>ToD</div><div className="mt-1 text-slate-600">{c.tod?.conclusion||'Not Assessed'}</div>{c.tod&&<div className="text-[10px] text-slate-400 mt-1">{new Date(c.tod.testedAt).toLocaleDateString('id-ID')}</div>}</div>
          <div className="bg-slate-50 rounded-lg p-3"><div className="font-bold text-slate-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5"/>ToE</div><div className="mt-1 text-slate-600">{c.toe?.conclusion||'Not Tested'}</div>{c.toe&&<div className="text-[10px] text-slate-400 mt-1">{c.toe.passCount}/{c.toe.sampleSize} pass • {c.toe.failCount} fail</div>}</div>
          <div className="bg-slate-50 rounded-lg p-3"><div className="font-bold text-slate-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5"/>Open Issues</div><div className="mt-1 text-slate-600">{c.openIssues.length}</div>{c.openIssues[0]&&<div className="text-[10px] text-slate-400 mt-1">{c.openIssues[0].issueId} • {c.openIssues[0].severity}</div>}</div>
          <div className="bg-slate-50 rounded-lg p-3"><div className="font-bold text-slate-700 flex items-center gap-1"><CircleDashed className="w-3.5 h-3.5"/>CCM</div><div className="mt-1 text-slate-600">{c.ccm.length?c.ccm.map(r=>r.lastStatus).join(', '):'No Rule'}</div>{c.ccm[0]?.lastRun&&<div className="text-[10px] text-slate-400 mt-1">{c.ccm[0].lastRun.populationChecked} checked • {c.ccm[0].lastRun.exceptionsFound} exception(s)</div>}</div>
        </div>
      </article>)}
      {!data?.controls?.length&&!error&&<div className="border border-dashed border-slate-300 rounded-xl p-8 text-xs text-slate-500">No controls are registered, so no health conclusion can be produced.</div>}
    </div>
  </div>;
}
