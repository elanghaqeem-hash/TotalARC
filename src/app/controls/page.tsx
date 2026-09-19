'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Plus, Search, Shield, X } from 'lucide-react';
import { useRole } from '@/context/RoleContext';

type ProcessRow={id:string;processId:string;name:string};
type RiskRow={id:string;riskId:string;name:string;processId:string};
type ControlRow={
  id:string;controlId:string;name:string;description:string;objective:string;controlOwner:string;
  type:string;nature:string;method:string;frequency:string;isKeyControl:boolean;isIcofrKey:boolean;
  evidenceRequirement?:string|null;frameworkMapping?:string|null;regulationMapping?:string|null;
  designAssessment:string;operatingStatus:string;overallHealth:string;healthRationale?:string|null;status:string;
  process:ProcessRow;
  risks:Array<{id:string;risk:RiskRow}>;
  todTests:Array<any>;toeTests:Array<any>;monitoringRules:Array<any>;certifications:Array<any>;
};

export default function ControlsPage(){
  const { currentUser }=useRole();
  const [controls,setControls]=useState<ControlRow[]>([]);
  const [processes,setProcesses]=useState<ProcessRow[]>([]);
  const [risks,setRisks]=useState<RiskRow[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [search,setSearch]=useState('');
  const [modal,setModal]=useState(false);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({
    controlId:'',name:'',description:'',objective:'',processId:'',riskId:'',controlOwner:'',
    type:'Preventive',nature:'Manual',frequency:'Per Transaction',isKeyControl:false,isIcofrKey:false
  });

  const load=async()=>{
    const [a,b,c]=await Promise.all([
      fetch('/api/controls',{cache:'no-store'}),
      fetch('/api/processes',{cache:'no-store'}),
      fetch('/api/risks',{cache:'no-store'})
    ]);
    const ad=await a.json();const bd=await b.json();const cd=await c.json();
    if(!a.ok)throw new Error(ad.error||'Unable to load controls');
    if(!b.ok)throw new Error(bd.error||'Unable to load processes');
    if(!c.ok)throw new Error(cd.error||'Unable to load risks');
    setControls(ad.controls||[]);
    setProcesses((bd.processes||[]).map((p:any)=>({id:p.id,processId:p.processId,name:p.name})));
    setRisks((cd.risks||[]).map((r:any)=>({id:r.id,riskId:r.riskId,name:r.name,processId:r.processId})));
    setSelectedId(v=>v&&(ad.controls||[]).some((x:ControlRow)=>x.id===v)?v:ad.controls?.[0]?.id||'');
    setForm(v=>({...v,processId:v.processId||bd.processes?.[0]?.id||'',controlOwner:v.controlOwner||currentUser?.name||''}));
  };
  useEffect(()=>{load().catch(e=>setMessage(e.message));},[currentUser?.name]);

  const selected=useMemo(()=>controls.find(c=>c.id===selectedId)||null,[controls,selectedId]);
  const filtered=useMemo(()=>controls.filter(c=>{
    const q=search.trim().toLowerCase();
    return !q||c.controlId.toLowerCase().includes(q)||c.name.toLowerCase().includes(q)||c.type.toLowerCase().includes(q)||c.controlOwner.toLowerCase().includes(q)||c.process?.name?.toLowerCase().includes(q);
  }),[controls,search]);
  const eligibleRisks=risks.filter(r=>!form.processId||r.processId===form.processId);

  const create=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setMessage('');
    try{
      const r=await fetch('/api/controls',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,riskId:form.riskId||null})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to create control');
      setModal(false);
      setForm(v=>({...v,controlId:'',name:'',description:'',objective:'',riskId:'',isKeyControl:false,isIcofrKey:false}));
      await load();setSelectedId(d.id);
    }catch(e){setMessage(e instanceof Error?e.message:'Unable to create control');}
    finally{setBusy(false);}
  };

  return <div className="space-y-6">
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div><div className="flex items-center gap-2 text-xs font-bold text-brand-600 uppercase tracking-wider"><Shield className="w-4 h-4"/>Single Control Library</div><h1 className="text-2xl font-black text-slate-900 mt-1">Enterprise Control Library</h1><p className="text-xs text-slate-500 mt-1">One persistent control master shared across RCM, RCSA, ToD, ToE, remediation and CCM. Missing assurance evidence remains Not Assessed.</p></div>
      <button onClick={()=>setModal(true)} className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl"><Plus className="w-4 h-4"/>Register Control</button>
    </div>
    {message&&<div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{message}</div>}

    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between gap-3">
      <div className="relative flex-1 max-w-md"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search control, owner or process…" className="w-full text-xs pl-9 pr-4 py-2 rounded-lg bg-slate-100 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
      <div className="text-xs text-slate-500">{filtered.length} control(s)</div>
    </div>

    <div className="grid lg:grid-cols-12 gap-5">
      <div className="lg:col-span-5 space-y-3">
        {filtered.map(c=><button key={c.id} onClick={()=>setSelectedId(c.id)} className={selectedId===c.id?'w-full text-left p-4 rounded-xl border bg-brand-50/50 border-brand-500 shadow-sm':'w-full text-left p-4 rounded-xl border bg-white border-slate-200 hover:border-slate-300'}>
          <div className="flex items-start justify-between gap-2"><div><div className="text-[10px] font-mono text-slate-400">{c.controlId}</div><div className="text-sm font-bold text-slate-900">{c.name}</div><div className="text-[11px] text-slate-500 mt-1">{c.process?.processId} • {c.type} • {c.nature}</div></div><span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-1 rounded-full">{c.overallHealth||'Not Assessed'}</span></div>
        </button>)}
        {!filtered.length&&<div className="border border-dashed border-slate-300 rounded-xl p-8 text-xs text-slate-500">No controls match this view.</div>}
      </div>

      <div className="lg:col-span-7">
        {selected?<div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5">
          <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-mono text-slate-400">{selected.controlId}</div><h2 className="text-base font-bold text-slate-900">{selected.name}</h2><div className="text-[11px] text-slate-500 mt-1">{selected.process?.processId} — {selected.process?.name} • Owner: {selected.controlOwner}</div></div><span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{selected.status}</span></div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs"><strong>Description:</strong><div className="text-[11px] text-slate-700 mt-1">{selected.description}</div></div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs"><strong>Control objective:</strong><div className="text-[11px] text-slate-700 mt-1">{selected.objective}</div></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Metric label="Type" value={selected.type}/><Metric label="Nature" value={selected.nature}/><Metric label="Frequency" value={selected.frequency}/><Metric label="Key Control" value={selected.isKeyControl?'Yes':'No'}/></div>

          <section><h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Mapped Risks</h3><div className="mt-2 space-y-2">{selected.risks?.map(m=><div key={m.id} className="border border-slate-200 rounded-lg p-3 text-xs"><span className="font-mono text-[10px] text-slate-400">{m.risk.riskId}</span><div className="font-bold text-slate-900">{m.risk.name}</div></div>)}{!selected.risks?.length&&<div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">No risk is mapped to this control.</div>}</div></section>

          <section><h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-brand-600"/>Assurance Evidence</h3><div className="mt-2 grid md:grid-cols-2 gap-3 text-[11px]">
            <Evidence label="Design Assessment" value={selected.designAssessment||'Not Assessed'} detail={selected.todTests?.[0]?selected.todTests[0].testId+' • '+selected.todTests[0].conclusion:'No ToD evidence'}/>
            <Evidence label="Operating Effectiveness" value={selected.operatingStatus||'Not Assessed'} detail={selected.toeTests?.[0]?selected.toeTests[0].testId+' • '+selected.toeTests[0].finalConclusion+' • '+selected.toeTests[0].passCount+'/'+selected.toeTests[0].sampleSize+' pass':'No ToE evidence'}/>
            <Evidence label="CCM" value={selected.monitoringRules?.length?selected.monitoringRules.map((r:any)=>r.lastStatus||'Not Run').join(', '):'No Rule'} detail={selected.monitoringRules?.length?selected.monitoringRules.map((r:any)=>r.ruleId).join(', '):'No monitoring rule configured'}/>
            <Evidence label="Certification" value={selected.certifications?.[0]?.status||'Not Certified'} detail={selected.certifications?.[0]?selected.certifications[0].period+' • '+selected.certifications[0].certifierName:'No certification evidence'}/>
          </div></section>

          <section><h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Framework & Evidence Requirements</h3><div className="mt-2 grid md:grid-cols-2 gap-3 text-[11px]"><Box label="Framework Mapping" value={selected.frameworkMapping||'Not recorded'}/><Box label="Evidence Requirement" value={selected.evidenceRequirement||'Not recorded'}/><Box label="Regulation Mapping" value={selected.regulationMapping||'Not recorded'}/><Box label="Overall Health" value={selected.overallHealth||'Not Assessed'}/></div></section>
        </div>:<div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-xs text-slate-500">Select a control to inspect its profile.</div>}
      </div>
    </div>

    {modal&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3"><h2 className="font-bold text-slate-900">Register Control Master</h2><button onClick={()=>setModal(false)} className="p-1 text-slate-400"><X className="w-5 h-5"/></button></div>
      <form onSubmit={create} className="mt-4 space-y-3 text-xs">
        <label className="block font-semibold text-slate-700">Business Process *<select required value={form.processId} onChange={e=>setForm({...form,processId:e.target.value,riskId:''})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option value="">Select process</option>{processes.map(p=><option key={p.id} value={p.id}>{p.processId} — {p.name}</option>)}</select></label>
        <label className="block font-semibold text-slate-700">Mapped Risk (optional)<select value={form.riskId} onChange={e=>setForm({...form,riskId:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option value="">No initial mapping</option>{eligibleRisks.map(r=><option key={r.id} value={r.id}>{r.riskId} — {r.name}</option>)}</select></label>
        <div className="grid md:grid-cols-2 gap-3"><label className="font-semibold text-slate-700">Control ID (optional)<input value={form.controlId} onChange={e=>setForm({...form,controlId:e.target.value})} placeholder="Leave blank for generated ID" className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label><label className="font-semibold text-slate-700">Control Owner *<input required value={form.controlOwner} onChange={e=>setForm({...form,controlOwner:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label></div>
        <label className="block font-semibold text-slate-700">Control Name *<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="block font-semibold text-slate-700">Control Description *<textarea required rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="block font-semibold text-slate-700">Control Objective<textarea rows={2} value={form.objective} onChange={e=>setForm({...form,objective:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="font-semibold text-slate-700">Type<select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option>Preventive</option><option>Detective</option><option>Corrective</option></select></label>
          <label className="font-semibold text-slate-700">Nature<select value={form.nature} onChange={e=>setForm({...form,nature:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option>Manual</option><option>IT Dependent Manual</option><option>Automated</option></select></label>
          <label className="font-semibold text-slate-700">Frequency<input value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        </div>
        <div className="flex flex-wrap gap-5"><label className="flex items-center gap-2 font-semibold text-slate-700"><input type="checkbox" checked={form.isKeyControl} onChange={e=>setForm({...form,isKeyControl:e.target.checked})}/>Key Control</label><label className="flex items-center gap-2 font-semibold text-slate-700"><input type="checkbox" checked={form.isIcofrKey} onChange={e=>setForm({...form,isIcofrKey:e.target.checked})}/>ICOFR Key</label></div>
        <div className="pt-3 flex justify-end gap-2"><button type="button" onClick={()=>setModal(false)} className="px-4 py-2 bg-slate-100 rounded-lg font-semibold">Cancel</button><button disabled={busy||!processes.length} className="px-4 py-2 bg-brand-600 text-white rounded-lg font-bold disabled:opacity-50">Save Control</button></div>
      </form>
    </div></div>}
  </div>;
}

function Metric({label,value}:{label:string;value:string}){return <div className="bg-slate-50 border border-slate-200 rounded-lg p-3"><div className="text-[10px] uppercase font-bold text-slate-400">{label}</div><div className="text-xs font-bold text-slate-900 mt-1">{value}</div></div>}
function Evidence({label,value,detail}:{label:string;value:string;detail:string}){return <div className="bg-slate-50 border border-slate-200 rounded-lg p-3"><div className="text-[10px] uppercase font-bold text-slate-400">{label}</div><div className="text-xs font-bold text-slate-900 mt-1">{value}</div><div className="text-[10px] text-slate-500 mt-1">{detail}</div></div>}
function Box({label,value}:{label:string;value:string}){return <div className="bg-slate-50 border border-slate-200 rounded-lg p-3"><div className="text-[10px] uppercase font-bold text-slate-400">{label}</div><div className="text-[11px] text-slate-700 mt-1">{value}</div></div>}
