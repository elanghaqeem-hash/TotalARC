'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, Search, Shield, X } from 'lucide-react';
import { useRole } from '@/context/RoleContext';

type ProcessRow={id:string;processId:string;name:string};
type RiskRow={
  id:string;riskId:string;name:string;description:string;cause:string;event:string;impact:string;category:string;ownerName:string;
  inherentLikelihood:number;inherentImpact:number;inherentScore:number;inherentRating:string;
  residualLikelihood:number;residualImpact:number;residualScore:number;residualRating:string;riskTreatment:string;status:string;
  process:ProcessRow;controls:Array<{id:string;control:{id:string;controlId:string;name:string;type:string;nature:string;overallHealth:string}}>;
  issues:any[];
};

export default function RisksPage(){
  const { currentUser }=useRole();
  const [risks,setRisks]=useState<RiskRow[]>([]);
  const [processes,setProcesses]=useState<ProcessRow[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [search,setSearch]=useState('');
  const [activeTab,setActiveTab]=useState<'register'|'inherent_heatmap'|'residual_heatmap'>('register');
  const [modal,setModal]=useState(false);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({
    riskId:'',name:'',cause:'',event:'',impact:'',category:'Operational',processId:'',ownerName:'',
    inherentLikelihood:3,inherentImpact:3
  });

  const load=async()=>{
    const [a,b]=await Promise.all([fetch('/api/risks',{cache:'no-store'}),fetch('/api/processes',{cache:'no-store'})]);
    const ad=await a.json();const bd=await b.json();
    if(!a.ok)throw new Error(ad.error||'Unable to load risks');
    if(!b.ok)throw new Error(bd.error||'Unable to load processes');
    setRisks(ad.risks||[]);
    setProcesses((bd.processes||[]).map((p:any)=>({id:p.id,processId:p.processId,name:p.name})));
    setSelectedId(v=>v&&(ad.risks||[]).some((r:RiskRow)=>r.id===v)?v:ad.risks?.[0]?.id||'');
    setForm(v=>({...v,processId:v.processId||bd.processes?.[0]?.id||'',ownerName:v.ownerName||currentUser?.name||''}));
  };
  useEffect(()=>{load().catch(e=>setMessage(e.message));},[currentUser?.name]);

  const selected=useMemo(()=>risks.find(r=>r.id===selectedId)||null,[risks,selectedId]);
  const filtered=useMemo(()=>risks.filter(r=>{
    const q=search.trim().toLowerCase();
    return !q||r.name.toLowerCase().includes(q)||r.riskId.toLowerCase().includes(q)||r.category.toLowerCase().includes(q)||r.process?.name?.toLowerCase().includes(q);
  }),[risks,search]);

  const create=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setMessage('');
    try{
      const r=await fetch('/api/risks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to create risk');
      setModal(false);
      setForm(v=>({...v,riskId:'',name:'',cause:'',event:'',impact:'',inherentLikelihood:3,inherentImpact:3}));
      await load();setSelectedId(d.id);
    }catch(e){setMessage(e instanceof Error?e.message:'Unable to create risk');}
    finally{setBusy(false);}
  };

  return <div className="space-y-6">
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div><div className="flex items-center gap-2 text-xs font-bold text-amber-600 uppercase tracking-wider"><AlertTriangle className="w-4 h-4"/>Risk Universe</div><h1 className="text-2xl font-black text-slate-900 mt-1">Enterprise Risk Register & Heatmaps</h1><p className="text-xs text-slate-500 mt-1">Risk ratings and heatmap positions are calculated exclusively from registered risk records.</p></div>
      <button onClick={()=>setModal(true)} className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl"><Plus className="w-4 h-4"/>Identify New Risk</button>
    </div>
    {message&&<div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{message}</div>}

    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div className="relative flex-1 max-w-md"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search risk, category or process…" className="w-full text-xs pl-9 pr-4 py-2 rounded-lg bg-slate-100 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
      <div className="flex gap-2">{[
        ['register','Risk Register'],['inherent_heatmap','Inherent Heatmap'],['residual_heatmap','Residual Heatmap']
      ].map(([k,label])=><button key={k} onClick={()=>setActiveTab(k as any)} className={activeTab===k?'text-xs font-bold px-3 py-2 rounded-lg bg-slate-900 text-white':'text-xs font-bold px-3 py-2 rounded-lg bg-slate-100 text-slate-600'}>{label}</button>)}</div>
    </div>

    {activeTab==='register'?<div className="grid lg:grid-cols-12 gap-5">
      <div className="lg:col-span-5 space-y-3">
        {filtered.map(r=><button key={r.id} onClick={()=>setSelectedId(r.id)} className={selectedId===r.id?'w-full text-left p-4 rounded-xl border bg-amber-50/50 border-amber-400 shadow-sm':'w-full text-left p-4 rounded-xl border bg-white border-slate-200 hover:border-slate-300'}>
          <div className="flex items-start justify-between gap-2"><div><div className="text-[10px] font-mono text-slate-400">{r.riskId}</div><div className="text-sm font-bold text-slate-900">{r.name}</div><div className="text-[11px] text-slate-500 mt-1">{r.process?.processId} • {r.category}</div></div><span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded-full">{r.inherentRating} {r.inherentScore}</span></div>
        </button>)}
        {!filtered.length&&<div className="border border-dashed border-slate-300 rounded-xl p-8 text-xs text-slate-500">No risk matches this view.</div>}
      </div>
      <div className="lg:col-span-7">
        {selected?<div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5">
          <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-mono text-slate-400">{selected.riskId}</div><h2 className="text-base font-bold text-slate-900">{selected.name}</h2><div className="text-[11px] text-slate-500 mt-1">{selected.process?.processId} — {selected.process?.name} • Owner: {selected.ownerName}</div></div><span className="text-[10px] bg-slate-100 px-2 py-1 rounded-full">{selected.status}</span></div>
          <div className="grid md:grid-cols-3 gap-3 text-xs"><Box label="Cause" value={selected.cause}/><Box label="Event" value={selected.event}/><Box label="Impact" value={selected.impact}/></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Metric label="Inherent L" value={selected.inherentLikelihood}/><Metric label="Inherent I" value={selected.inherentImpact}/><Metric label="Inherent Score" value={selected.inherentScore}/><Metric label="Residual Score" value={selected.residualScore}/></div>
          <div><h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Linked Controls</h3><div className="mt-2 space-y-2">{selected.controls?.map(m=><div key={m.id} className="p-3 border border-slate-200 rounded-lg bg-slate-50 flex items-center justify-between gap-3 text-xs"><div className="flex items-center gap-2"><Shield className="w-4 h-4 text-brand-600"/><div><div className="font-bold text-slate-900">{m.control.controlId} — {m.control.name}</div><div className="text-[11px] text-slate-500">{m.control.type} • {m.control.nature}</div></div></div><span className="text-[10px] bg-white border border-slate-200 px-2 py-1 rounded">{m.control.overallHealth||'Not Assessed'}</span></div>)}{!selected.controls?.length&&<div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">No control is mapped to this risk.</div>}</div></div>
          <div className="text-[11px] text-slate-500">Open/closed issues linked to this risk: {selected.issues?.length||0}</div>
        </div>:<div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-xs text-slate-500">Select a risk to inspect its profile.</div>}
      </div>
    </div>:<Heatmap risks={risks} mode={activeTab==='inherent_heatmap'?'inherent':'residual'}/>}

    {modal&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3"><h2 className="font-bold text-slate-900">Identify Risk</h2><button onClick={()=>setModal(false)} className="p-1 text-slate-400"><X className="w-5 h-5"/></button></div>
      <form onSubmit={create} className="mt-4 space-y-3 text-xs">
        <label className="block font-semibold text-slate-700">Business Process *<select required value={form.processId} onChange={e=>setForm({...form,processId:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option value="">Select process</option>{processes.map(p=><option key={p.id} value={p.id}>{p.processId} — {p.name}</option>)}</select></label>
        <div className="grid md:grid-cols-2 gap-3"><label className="font-semibold text-slate-700">Risk ID (optional)<input value={form.riskId} onChange={e=>setForm({...form,riskId:e.target.value})} placeholder="Leave blank for generated ID" className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label><label className="font-semibold text-slate-700">Category<input value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label></div>
        <label className="block font-semibold text-slate-700">Risk Name *<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="block font-semibold text-slate-700">Cause *<textarea required rows={2} value={form.cause} onChange={e=>setForm({...form,cause:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="block font-semibold text-slate-700">Risk Event *<textarea required rows={2} value={form.event} onChange={e=>setForm({...form,event:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="block font-semibold text-slate-700">Impact *<textarea required rows={2} value={form.impact} onChange={e=>setForm({...form,impact:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="block font-semibold text-slate-700">Risk Owner *<input required value={form.ownerName} onChange={e=>setForm({...form,ownerName:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <div className="grid grid-cols-2 gap-3"><label className="font-semibold text-slate-700">Likelihood<select value={form.inherentLikelihood} onChange={e=>setForm({...form,inherentLikelihood:Number(e.target.value)})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white">{[1,2,3,4,5].map(v=><option key={v} value={v}>{v}</option>)}</select></label><label className="font-semibold text-slate-700">Impact<select value={form.inherentImpact} onChange={e=>setForm({...form,inherentImpact:Number(e.target.value)})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white">{[1,2,3,4,5].map(v=><option key={v} value={v}>{v}</option>)}</select></label></div>
        <div className="pt-3 flex justify-end gap-2"><button type="button" onClick={()=>setModal(false)} className="px-4 py-2 bg-slate-100 rounded-lg font-semibold">Cancel</button><button disabled={busy||!processes.length} className="px-4 py-2 bg-brand-600 text-white rounded-lg font-bold disabled:opacity-50">Save Risk</button></div>
      </form>
    </div></div>}
  </div>;
}

function Heatmap({risks,mode}:{risks:RiskRow[];mode:'inherent'|'residual'}){
 return <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"><h2 className="text-sm font-bold text-slate-900">5×5 {mode==='inherent'?'Inherent':'Residual'} Risk Matrix</h2><p className="text-[11px] text-slate-500 mt-1">Each cell shows actual registered risks at the selected likelihood and impact.</p><div className="max-w-3xl mx-auto mt-5 grid grid-cols-5 gap-2">{[5,4,3,2,1].flatMap(l=>[1,2,3,4,5].map(i=>{
   const rows=risks.filter(r=>mode==='inherent'?r.inherentLikelihood===l&&r.inherentImpact===i:r.residualLikelihood===l&&r.residualImpact===i);
   const score=l*i;
   const style=score>=15?'bg-red-100 border-red-300':score>=10?'bg-rose-50 border-rose-200':score>=5?'bg-amber-50 border-amber-200':'bg-emerald-50 border-emerald-200';
   return <div key={l+'-'+i} className={'min-h-24 rounded-xl border p-2 '+style}><div className="flex justify-between text-[9px] text-slate-500"><span>L{l}</span><span>I{i}</span></div><div className="text-center font-black text-sm mt-1">{score}</div><div className="mt-1 text-center text-[9px] font-bold text-slate-700">{rows.length} risk{rows.length===1?'':'s'}</div><div className="mt-1 space-y-0.5">{rows.slice(0,2).map(r=><div key={r.id} className="truncate text-[8px] font-mono bg-white/70 rounded px-1 py-0.5">{r.riskId}</div>)}</div></div>;
 }))}</div><div className="max-w-3xl mx-auto mt-2 flex justify-between text-[10px] text-slate-400"><span>Impact 1</span><span>Impact 5</span></div></div>;
}
function Metric({label,value}:{label:string;value:number|string}){return <div className="bg-slate-50 border border-slate-200 rounded-lg p-3"><div className="text-[10px] uppercase font-bold text-slate-400">{label}</div><div className="text-xl font-black text-slate-900 mt-0.5">{value}</div></div>}
function Box({label,value}:{label:string;value:string}){return <div className="bg-slate-50 border border-slate-200 rounded-lg p-3"><div className="text-[10px] uppercase font-bold text-slate-400">{label}</div><div className="text-[11px] text-slate-700 mt-1 leading-relaxed">{value||'Not recorded'}</div></div>}
