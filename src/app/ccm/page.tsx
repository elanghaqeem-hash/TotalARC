'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Database, PlayCircle, Plus, ShieldCheck } from 'lucide-react';

type Control={id:string;controlId:string;name:string;process:{processId:string;name:string}};
type Rule = {
  id:string;ruleId:string;name:string;description:string;dataSource:string;queryLogic:string;frequency:string;threshold:string;lastStatus:string;status:string;
  control:Control;
  runs:Array<{id:string;runTimestamp:string;populationChecked:number;exceptionsFound:number;status:string;details?:string|null;exceptions:Array<{id:string;transactionRef:string;details:string}>}>;
};

export default function CCMPage() {
  const [rules,setRules]=useState<Rule[]>([]);
  const [controls,setControls]=useState<Control[]>([]);
  const [selected,setSelected]=useState('');
  const [population,setPopulation]=useState('');
  const [details,setDetails]=useState('');
  const [exceptionLines,setExceptionLines]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [showRule,setShowRule]=useState(false);
  const [ruleForm,setRuleForm]=useState({controlId:'',ruleId:'',name:'',description:'',dataSource:'',queryLogic:'',frequency:'Daily',threshold:'0 Exceptions'});

  const load=async()=>{
    const [a,b]=await Promise.all([fetch('/api/monitor/ccm',{cache:'no-store'}),fetch('/api/controls',{cache:'no-store'})]);
    const ad=await a.json();const bd=await b.json();
    if(!a.ok)throw new Error(ad.error||'Unable to load CCM rules');
    if(!b.ok)throw new Error(bd.error||'Unable to load controls');
    setRules(ad.rules||[]);
    setControls((bd.controls||[]).map((x:any)=>({id:x.id,controlId:x.controlId,name:x.name,process:x.process})));
    setSelected(v=>v&&(ad.rules||[]).some((r:Rule)=>r.id===v)?v:ad.rules?.[0]?.id||'');
    setRuleForm(v=>({...v,controlId:v.controlId||bd.controls?.[0]?.id||''}));
  };
  useEffect(()=>{load().catch(err=>setMessage(err.message));},[]);

  const createRule=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setMessage('');
    try{
      const r=await fetch('/api/monitor/ccm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'CREATE_RULE',...ruleForm})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to create monitoring rule');
      setShowRule(false);setRuleForm(v=>({...v,ruleId:'',name:'',description:'',dataSource:'',queryLogic:'',threshold:'0 Exceptions'}));
      await load();setSelected(d.id);
    }catch(e){setMessage(e instanceof Error?e.message:'Unable to create monitoring rule');}
    finally{setBusy(false);}
  };

  const recordRun=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true);setMessage('');
    try{
      const exceptions=exceptionLines.split('\n').map(x=>x.trim()).filter(Boolean).map(line=>{
        const [transactionRef,...rest]=line.split('|');
        return {transactionRef:transactionRef.trim(),details:rest.join('|').trim()||'Exception recorded from verified monitoring source.'};
      });
      const r=await fetch('/api/monitor/ccm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'RECORD_RUN',ruleId:selected,populationChecked:Number(population),details,exceptions})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to record CCM execution');
      setPopulation('');setDetails('');setExceptionLines('');setMessage('Verified monitoring execution recorded.');await load();
    }catch(e){setMessage(e instanceof Error?e.message:'Unable to record CCM execution');}
    finally{setBusy(false);}
  };

  return <div className="space-y-6">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div><h1 className="text-xl font-black text-slate-900">Continuous Control Monitoring</h1><p className="text-xs text-slate-500 mt-1">Monitoring rules are persistent control records. Runs store only supplied population/evidence; Total ARC never generates simulated failures.</p></div>
      <button onClick={()=>setShowRule(v=>!v)} className="inline-flex items-center gap-1.5 bg-slate-900 text-white text-xs font-bold px-3 py-2 rounded-lg"><Plus className="w-4 h-4"/>New Monitoring Rule</button>
    </div>

    {message&&<div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">{message}</div>}

    {showRule&&<form onSubmit={createRule} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3 text-xs">
      <div className="flex items-center gap-2"><Plus className="w-4 h-4 text-brand-600"/><h2 className="text-sm font-bold text-slate-900">Create Monitoring Rule</h2></div>
      <label className="font-semibold text-slate-700 block">Control *<select required value={ruleForm.controlId} onChange={e=>setRuleForm({...ruleForm,controlId:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option value="">Select control</option>{controls.map(c=><option key={c.id} value={c.id}>{c.process?.processId} • {c.controlId} — {c.name}</option>)}</select></label>
      <div className="grid md:grid-cols-2 gap-3"><label className="font-semibold text-slate-700">Rule ID (optional)<input value={ruleForm.ruleId} onChange={e=>setRuleForm({...ruleForm,ruleId:e.target.value})} placeholder="Leave blank for generated ID" className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label><label className="font-semibold text-slate-700">Rule name *<input required value={ruleForm.name} onChange={e=>setRuleForm({...ruleForm,name:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label></div>
      <label className="font-semibold text-slate-700 block">Description *<textarea required rows={2} value={ruleForm.description} onChange={e=>setRuleForm({...ruleForm,description:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <label className="font-semibold text-slate-700 block">Data source *<input required value={ruleForm.dataSource} onChange={e=>setRuleForm({...ruleForm,dataSource:e.target.value})} placeholder="System / API / report / controlled dataset" className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <label className="font-semibold text-slate-700 block">Rule/query logic *<textarea required rows={3} value={ruleForm.queryLogic} onChange={e=>setRuleForm({...ruleForm,queryLogic:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <div className="grid md:grid-cols-2 gap-3"><label className="font-semibold text-slate-700">Frequency<input required value={ruleForm.frequency} onChange={e=>setRuleForm({...ruleForm,frequency:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label><label className="font-semibold text-slate-700">Threshold<input required value={ruleForm.threshold} onChange={e=>setRuleForm({...ruleForm,threshold:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label></div>
      <button disabled={busy||!controls.length} className="bg-brand-600 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg">Create Rule</button>
    </form>}

    <form onSubmit={recordRun} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-600"/><h2 className="text-sm font-bold text-slate-900">Record Verified Execution</h2></div>
      <div className="grid md:grid-cols-2 gap-3 text-xs">
        <label className="font-semibold text-slate-700">Monitoring rule<select required value={selected} onChange={e=>setSelected(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option value="">No rule selected</option>{rules.filter(r=>r.status==='Active').map(r=><option key={r.id} value={r.id}>{r.ruleId} — {r.name}</option>)}</select></label>
        <label className="font-semibold text-slate-700">Population checked<input required type="number" min="0" value={population} onChange={e=>setPopulation(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      </div>
      <label className="block text-xs font-semibold text-slate-700">Execution evidence / source details<textarea value={details} onChange={e=>setDetails(e.target.value)} rows={3} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5" placeholder="Connector run ID, query execution ID, source file hash or other evidence."/></label>
      <label className="block text-xs font-semibold text-slate-700">Exceptions (one per line: reference | details)<textarea value={exceptionLines} onChange={e=>setExceptionLines(e.target.value)} rows={4} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 font-mono text-[11px]" placeholder="Leave blank when the verified run produced no exception."/></label>
      <button disabled={busy||!selected} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-lg"><PlayCircle className="w-4 h-4"/>{busy?'Recording…':'Record Execution'}</button>
    </form>

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {rules.map(rule=><article key={rule.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex justify-between gap-3"><div><div className="text-[10px] font-mono text-slate-400">{rule.ruleId}</div><h3 className="text-sm font-bold text-slate-900">{rule.name}</h3><div className="text-[11px] text-slate-500">{rule.control.process.processId} • {rule.control.controlId}</div></div><span className="h-fit text-[10px] px-2 py-1 rounded-full bg-slate-100 text-slate-600">{rule.lastStatus||'Not Run'}</span></div>
        <p className="text-[11px] text-slate-600">{rule.description}</p>
        <div className="grid grid-cols-2 gap-2 text-[11px]"><div className="p-2.5 rounded-lg bg-slate-50"><Database className="w-3.5 h-3.5 text-brand-600 mb-1"/><strong>Source:</strong> {rule.dataSource}</div><div className="p-2.5 rounded-lg bg-slate-50"><Activity className="w-3.5 h-3.5 text-brand-600 mb-1"/><strong>Frequency:</strong> {rule.frequency}</div></div>
        <div className="text-[11px] text-slate-600"><strong>Rule logic:</strong> {rule.queryLogic}</div>
        <div className="text-[11px] text-slate-600"><strong>Threshold:</strong> {rule.threshold}</div>
        <div className="border-t border-slate-100 pt-3 space-y-2">{rule.runs.map(run=><div key={run.id} className="text-[11px] border border-slate-100 rounded-lg p-2.5"><div className="flex items-center justify-between gap-3"><span className="text-slate-500">{new Date(run.runTimestamp).toLocaleString('id-ID')}</span><span className="font-semibold text-slate-700">{run.populationChecked} checked • {run.exceptionsFound} exception(s)</span></div>{run.details&&<div className="text-[10px] text-slate-500 mt-1">{run.details}</div>}</div>)}{!rule.runs.length&&<div className="text-xs text-slate-400">No verified execution has been recorded.</div>}</div>
      </article>)}
      {!rules.length&&<div className="xl:col-span-2 border border-dashed border-slate-300 rounded-xl p-8 text-xs text-slate-500">No monitoring rule is registered.</div>}
    </div>
  </div>;
}
