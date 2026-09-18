'use client';

import React, { useEffect, useState } from 'react';
import { BadgeCheck, CheckCircle2, RefreshCw, ShieldAlert, Wrench } from 'lucide-react';
import { useRole } from '@/context/RoleContext';

type RemediationData = {
  unclassifiedExceptions:any[];
  deficiencies:any[];
  issues:any[];
  maps:any[];
  retests:any[];
};

export default function RemediationPage() {
  const { currentUser } = useRole();
  const [data,setData]=useState<RemediationData>({unclassifiedExceptions:[],deficiencies:[],issues:[],maps:[],retests:[]});
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  const load=async()=>{
    const r=await fetch('/api/assure/remediation',{cache:'no-store'});
    const d=await r.json();
    if(!r.ok) throw new Error(d.error||'Unable to load remediation data');
    setData(d);
  };
  useEffect(()=>{load().catch(e=>setMessage(e.message));},[]);

  const act=async(body:any)=>{
    setBusy(true);setMessage('');
    try{
      const r=await fetch('/api/assure/remediation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||'Remediation action failed');
      await load();
      return d;
    }catch(e){setMessage(e instanceof Error?e.message:'Remediation action failed');return null;}
    finally{setBusy(false);}
  };

  const createDeficiency=async(exception:any)=>{
    const title=window.prompt('Deficiency title:',exception.description?.slice(0,120)||'')?.trim(); if(!title)return;
    const description=window.prompt('Deficiency description:',exception.description||'')?.trim(); if(!description)return;
    const classification=window.prompt('Classification (Observation / Control Deficiency / Significant Deficiency / Material Weakness):','Control Deficiency')?.trim()||'Control Deficiency';
    await act({actionType:'CREATE_DEFICIENCY',exceptionId:exception.id,title,description,classification});
  };

  const approveDeficiency=async(def:any)=>{await act({actionType:'APPROVE_DEFICIENCY',deficiencyId:def.id});};

  const createRca=async(def:any)=>{
    const rootCauseStatement=window.prompt('Validated root-cause statement:')?.trim(); if(!rootCauseStatement)return;
    const category=window.prompt('Root cause category (People / Process / Technology / Data / Governance):','Process')?.trim()||'Process';
    const why1=window.prompt('Why 1 (optional):')||'';
    const why2=window.prompt('Why 2 (optional):')||'';
    await act({actionType:'CREATE_RCA',deficiencyId:def.id,method:'5 Why',category,rootCauseStatement,why1,why2});
  };

  const createIssue=async(def:any)=>{
    const title=window.prompt('Issue title:',def.title||'')?.trim(); if(!title)return;
    const description=window.prompt('Issue description:',def.description||'')?.trim(); if(!description)return;
    const ownerName=window.prompt('Issue owner:')?.trim(); if(!ownerName)return;
    const targetDate=window.prompt('Target date (YYYY-MM-DD):')?.trim(); if(!targetDate)return;
    const severity=window.prompt('Severity (Critical / High / Medium / Low):','High')?.trim()||'High';
    await act({actionType:'CREATE_ISSUE',deficiencyId:def.id,title,description,ownerName,targetDate,severity});
  };

  const createMap=async(issue:any)=>{
    const agreedAction=window.prompt('Agreed remediation action:')?.trim(); if(!agreedAction)return;
    const actionOwner=window.prompt('Action owner:',issue.ownerName||'')?.trim(); if(!actionOwner)return;
    const originalDueDate=window.prompt('Original due date (YYYY-MM-DD):',issue.targetDate?String(issue.targetDate).slice(0,10):'')?.trim(); if(!originalDueDate)return;
    const recommendation=window.prompt('Recommendation / expected outcome (optional):')||'';
    await act({actionType:'CREATE_MAP',issueId:issue.id,agreedAction,actionOwner,originalDueDate,recommendation});
  };

  const updateMap=async(map:any)=>{
    const raw=window.prompt('Progress percentage (0-100):',String(map.progressPercent??0)); if(raw===null)return;
    const progressPercent=Number(raw);
    const status=window.prompt('Status (Agreed / In Progress / Completed by Owner / Pending Validation / Pending Retest):',progressPercent===100?'Completed by Owner':map.status)?.trim();
    if(!status)return;
    await act({actionType:'UPDATE_MAP',mapId:map.id,progressPercent,status});
  };

  const extendMap=async(map:any)=>{
    const newDueDate=window.prompt('Revised due date (YYYY-MM-DD):')?.trim(); if(!newDueDate)return;
    const extensionReason=window.prompt('Extension reason:')?.trim(); if(!extensionReason)return;
    await act({actionType:'REQUEST_EXTENSION',mapId:map.id,newDueDate,extensionReason});
  };

  const createRetest=async(map:any)=>{
    const sampleCountRaw=window.prompt('Retest sample count:','1'); if(sampleCountRaw===null)return;
    const passedRaw=window.prompt('Passed count:','1'); if(passedRaw===null)return;
    const failedRaw=window.prompt('Failed count:','0'); if(failedRaw===null)return;
    const conclusionNotes=window.prompt('Retest evidence and conclusion notes:')?.trim(); if(!conclusionNotes)return;
    const reviewerName=window.prompt('Reviewer name (optional):')||'';
    await act({actionType:'CREATE_RETEST',mapId:map.id,sampleCount:Number(sampleCountRaw),passedCount:Number(passedRaw),failedCount:Number(failedRaw),conclusionNotes,reviewerName});
  };

  const closeIssue=async(issue:any)=>{
    if(!window.confirm('Close this issue only if every MAP has a latest passing retest?'))return;
    await act({actionType:'CLOSE_ISSUE',issueId:issue.id});
  };

  const reviewer=['Admin','Reviewer'].includes(currentUser?.role||'');
  const extensionApprover=['Admin','Reviewer','Executive'].includes(currentUser?.role||'');

  return <div className="space-y-6">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><Wrench className="w-5 h-5 text-brand-600"/>Remediation & Management Action Plan</h1>
        <p className="text-xs text-slate-500 mt-1">Traceable lifecycle from actual testing exception → deficiency → root cause → issue → MAP → independent retest → closure.</p>
      </div>
      <button onClick={()=>load().catch(e=>setMessage(e.message))} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-xs font-bold px-3 py-2 rounded-lg"><RefreshCw className="w-4 h-4"/>Refresh</button>
    </div>
    {message&&<div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{message}</div>}

    <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Metric label="Unclassified Exceptions" value={data.unclassifiedExceptions.length}/>
      <Metric label="Deficiencies" value={data.deficiencies.length}/>
      <Metric label="Open Issues" value={data.issues.filter(x=>x.status!=='Closed').length}/>
      <Metric label="Active MAP" value={data.maps.filter(x=>x.status!=='Closed').length}/>
      <Metric label="Retests" value={data.retests.length}/>
    </section>

    <Section title="1. Testing Exceptions Awaiting Classification" subtitle="Only exceptions registered from failed ToE samples appear here." icon={<ShieldAlert className="w-4 h-4 text-amber-600"/>}>
      <div className="space-y-3">
        {data.unclassifiedExceptions.map(ex=><div key={ex.id} className="border border-slate-200 rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1"><div className="text-xs font-bold text-slate-900">{ex.exceptionNumber} • {ex.sampleRef}</div><div className="text-[11px] text-slate-500 mt-0.5">{ex.toeTest?.control?.controlId} • {ex.toeTest?.process?.processId} • {ex.severity}</div><p className="text-[11px] text-slate-700 mt-2">{ex.description}</p></div>
          <button disabled={busy} onClick={()=>createDeficiency(ex)} className="text-[11px] font-bold bg-brand-600 text-white px-3 py-2 rounded-lg">Classify Deficiency</button>
        </div>)}
        {!data.unclassifiedExceptions.length&&<Empty text="No unclassified testing exception."/>}
      </div>
    </Section>

    <Section title="2. Deficiencies & Root Cause" subtitle="Reviewer approval is required before a deficiency becomes a formal issue." icon={<ShieldAlert className="w-4 h-4 text-rose-600"/>}>
      <div className="space-y-3">
        {data.deficiencies.map(def=><div key={def.id} className="border border-slate-200 rounded-lg p-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-2"><div><div className="text-[10px] font-mono text-slate-400">{def.deficiencyId}</div><div className="text-xs font-bold text-slate-900">{def.title}</div><div className="text-[11px] text-slate-500 mt-1">{def.classification} • {def.humanApproved?'Approved by '+def.approvedBy:'Pending reviewer approval'}</div></div><span className={def.humanApproved?'text-[10px] bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full':'text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded-full'}>{def.humanApproved?'Approved':'Pending'}</span></div>
          <p className="text-[11px] text-slate-700 mt-2">{def.description}</p>
          {def.rootCause&&<div className="mt-3 bg-slate-50 rounded-lg p-3 text-[11px]"><strong>Root cause:</strong> {def.rootCause.rootCauseStatement} <span className="text-slate-400">({def.rootCause.category})</span></div>}
          <div className="mt-3 flex flex-wrap gap-2">
            {reviewer&&!def.humanApproved&&<button disabled={busy} onClick={()=>approveDeficiency(def)} className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1.5 rounded-lg">Approve Deficiency</button>}
            {!def.rootCause&&<button disabled={busy} onClick={()=>createRca(def)} className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg">Record Root Cause</button>}
            {def.humanApproved&&!def.issues?.length&&<button disabled={busy} onClick={()=>createIssue(def)} className="text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1.5 rounded-lg">Create Formal Issue</button>}
          </div>
        </div>)}
        {!data.deficiencies.length&&<Empty text="No control deficiency is recorded."/>}
      </div>
    </Section>

    <Section title="3. Formal Issues" subtitle="Issues remain open until remediation is independently retested and reviewer-approved for closure." icon={<BadgeCheck className="w-4 h-4 text-brand-600"/>}>
      <div className="space-y-3">
        {data.issues.map(issue=><div key={issue.id} className="border border-slate-200 rounded-lg p-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-2"><div><div className="text-[10px] font-mono text-slate-400">{issue.issueId}</div><div className="text-xs font-bold text-slate-900">{issue.title}</div><div className="text-[11px] text-slate-500 mt-1">{issue.process?.processId} • Owner: {issue.ownerName} • Target: {new Date(issue.targetDate).toLocaleDateString('id-ID')}</div></div><span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{issue.severity} • {issue.status}</span></div>
          <p className="text-[11px] text-slate-700 mt-2">{issue.description}</p>
          <div className="mt-3 text-[11px] text-slate-500">{issue.actionPlans?.length||0} MAP(s) linked</div>
          <div className="mt-3 flex gap-2">
            {issue.status!=='Closed'&&<button disabled={busy} onClick={()=>createMap(issue)} className="text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1.5 rounded-lg">Create MAP</button>}
            {reviewer&&issue.status!=='Closed'&&<button disabled={busy} onClick={()=>closeIssue(issue)} className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1.5 rounded-lg">Validate & Close</button>}
          </div>
        </div>)}
        {!data.issues.length&&<Empty text="No formal issue is recorded."/>}
      </div>
    </Section>

    <Section title="4. Management Action Plans & Retests" subtitle="Original due dates are preserved; extensions are recorded separately with an approver and reason." icon={<CheckCircle2 className="w-4 h-4 text-emerald-600"/>}>
      <div className="space-y-3">
        {data.maps.map(map=><div key={map.id} className="border border-slate-200 rounded-lg p-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-2"><div><div className="text-[10px] font-mono text-slate-400">{map.mapId}</div><div className="text-xs font-bold text-slate-900">{map.issue?.issueId} • {map.issue?.title}</div><div className="text-[11px] text-slate-500 mt-1">Owner: {map.actionOwner} • Original due: {new Date(map.originalDueDate).toLocaleDateString('id-ID')}{map.revisedDueDate?' • Revised: '+new Date(map.revisedDueDate).toLocaleDateString('id-ID'):''}</div></div><span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{map.status} • {map.progressPercent}%</span></div>
          <p className="text-[11px] text-slate-700 mt-2">{map.agreedAction}</p>
          {map.extensionReason&&<div className="mt-2 text-[11px] bg-amber-50 text-amber-800 border border-amber-200 rounded-lg p-2">Extension #{map.extensionCount}: {map.extensionReason}</div>}
          <div className="mt-3 space-y-2">{(map.retests||[]).map((r:any)=><div key={r.id} className="bg-slate-50 rounded-lg p-2.5 text-[11px] flex justify-between gap-3"><span>{r.retestId} • {r.sampleCount} samples • {r.passedCount} pass / {r.failedCount} fail</span><span className="font-bold">{r.result}</span></div>)}</div>
          {map.status!=='Closed'&&<div className="mt-3 flex flex-wrap gap-2">
            <button disabled={busy} onClick={()=>updateMap(map)} className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg">Update Progress</button>
            {extensionApprover&&<button disabled={busy} onClick={()=>extendMap(map)} className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1.5 rounded-lg">Approve Extension</button>}
            {map.progressPercent===100&&<button disabled={busy} onClick={()=>createRetest(map)} className="text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1.5 rounded-lg">Record Independent Retest</button>}
          </div>}
        </div>)}
        {!data.maps.length&&<Empty text="No management action plan is recorded."/>}
      </div>
    </Section>
  </div>;
}

function Metric({label,value}:{label:string;value:number}) {
  return <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm"><div className="text-[10px] uppercase font-bold text-slate-400">{label}</div><div className="text-2xl font-black text-slate-900 mt-1">{value}</div></div>;
}
function Empty({text}:{text:string}) {
  return <div className="border border-dashed border-slate-300 rounded-lg p-6 text-xs text-slate-400">{text}</div>;
}
function Section({title,subtitle,icon,children}:{title:string;subtitle:string;icon:React.ReactNode;children:React.ReactNode}) {
  return <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"><div className="flex items-start gap-2 mb-4">{icon}<div><h2 className="text-sm font-bold text-slate-900">{title}</h2><p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p></div></div>{children}</section>;
}
