'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Plus, RefreshCw, Workflow } from 'lucide-react';
import { useRole } from '@/context/RoleContext';

type Test={
  id:string;testId:string;period:string;testObjective:string;conclusion:string;status:string;testedAt:string;
  testerName:string;reviewerName?:string|null;observations?:string|null;
  objectiveAlignment:boolean;riskCoverage:boolean;precisionAdequate:boolean;segregationDuties:boolean;evidenceSufficiency:boolean;
  control:{id:string;controlId:string;name:string};process:{processId:string;name:string}
};
type Walk={id:string;controlId:string;date:string;participants?:string|null;transactionRef?:string|null;systemsInspected?:string|null;observations?:string|null;conclusion:string;processChanged:boolean};
type Control={id:string;controlId:string;name:string};
const TOD_CONCLUSIONS=['Effective Design','Partially Effective Design','Ineffective Design'];

export default function ToDPage(){
  const { currentUser }=useRole();
  const [tests,setTests]=useState<Test[]>([]);
  const [walks,setWalks]=useState<Walk[]>([]);
  const [controls,setControls]=useState<Control[]>([]);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [mode,setMode]=useState<'TOD'|'WALK'>('TOD');
  const [form,setForm]=useState({
    controlId:'',period:'',testObjective:'',reviewerName:'',observations:'',
    objectiveAlignment:false,riskCoverage:false,precisionAdequate:false,segregationDuties:false,evidenceSufficiency:false,
    participants:'',transactionRef:'',systemsInspected:'',processChanged:false,walkConclusion:'Pending Review'
  });

  const load=async()=>{
    const[a,b]=await Promise.all([
      fetch('/api/tod',{cache:'no-store'}),
      fetch('/api/controls',{cache:'no-store'})
    ]);
    const ad=await a.json();const bd=await b.json();
    if(!a.ok)throw new Error(ad.error||'Unable to load ToD');
    if(!b.ok)throw new Error(bd.error||'Unable to load controls');
    setTests(ad.tests||[]);
    setWalks(ad.walkthroughs||[]);
    setControls((bd.controls||[]).map((x:any)=>({id:x.id,controlId:x.controlId,name:x.name})));
    setForm(v=>({...v,controlId:v.controlId||bd.controls?.[0]?.id||''}));
  };
  useEffect(()=>{load().catch(e=>setMessage(e.message));},[]);

  const api=async(body:any)=>{
    setBusy(true);setMessage('');
    try{
      const r=await fetch('/api/tod',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'Unable to save ToD data');
      await load();
      return d;
    }catch(e){setMessage(e instanceof Error?e.message:'Unable to save ToD data');return null;}
    finally{setBusy(false);}
  };

  const submitForm=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(mode==='TOD'){
      const d=await api({
        action:'CREATE_TOD',
        controlId:form.controlId,
        period:form.period,
        testObjective:form.testObjective,
        reviewerName:form.reviewerName,
        observations:form.observations,
        objectiveAlignment:form.objectiveAlignment,
        riskCoverage:form.riskCoverage,
        precisionAdequate:form.precisionAdequate,
        segregationDuties:form.segregationDuties,
        evidenceSufficiency:form.evidenceSufficiency
      });
      if(d)setForm(v=>({...v,period:'',testObjective:'',observations:'',objectiveAlignment:false,riskCoverage:false,precisionAdequate:false,segregationDuties:false,evidenceSufficiency:false}));
    }else{
      const d=await api({
        action:'CREATE_WALKTHROUGH',
        controlId:form.controlId,
        participants:form.participants,
        transactionRef:form.transactionRef,
        systemsInspected:form.systemsInspected,
        observations:form.observations,
        processChanged:form.processChanged,
        conclusion:form.walkConclusion
      });
      if(d)setForm(v=>({...v,participants:'',transactionRef:'',systemsInspected:'',observations:'',processChanged:false,walkConclusion:'Pending Review'}));
    }
  };

  const submitTod=async(test:Test)=>{
    const conclusion=window.prompt('Tester conclusion:\n'+TOD_CONCLUSIONS.join(' / '),test.conclusion==='Not Assessed'?'':test.conclusion)?.trim();
    if(!conclusion)return;
    if(!TOD_CONCLUSIONS.includes(conclusion)){setMessage('Conclusion must match an allowed ToD conclusion.');return;}
    await api({action:'SUBMIT_TOD',testId:test.id,conclusion});
  };

  const reviewTod=async(test:Test)=>{
    const conclusion=window.prompt('Reviewer final conclusion:\n'+TOD_CONCLUSIONS.join(' / '),test.conclusion)?.trim();
    if(!conclusion)return;
    if(!TOD_CONCLUSIONS.includes(conclusion)){setMessage('Conclusion must match an allowed ToD conclusion.');return;}
    await api({action:'REVIEW_TOD',testId:test.id,conclusion});
  };

  const canTest=['Admin','Tester'].includes(currentUser?.role||'');
  const canReview=['Admin','Reviewer'].includes(currentUser?.role||'');

  return <div className="space-y-6">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><Workflow className="w-5 h-5 text-brand-600"/>Walkthrough & Test of Design</h1>
        <p className="text-xs text-slate-500 mt-1">ToD now follows Draft → Submitted → Approved. A final design conclusion requires reviewer approval.</p>
      </div>
      <button onClick={()=>load().catch(e=>setMessage(e.message))} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-xs font-bold px-3 py-2 rounded-lg"><RefreshCw className="w-4 h-4"/>Refresh</button>
    </div>

    {message&&<div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{message}</div>}

    <div className="flex gap-2">
      <button onClick={()=>setMode('TOD')} className={mode==='TOD'?'text-xs font-bold px-3 py-2 rounded-lg bg-slate-900 text-white':'text-xs font-bold px-3 py-2 rounded-lg bg-slate-100 text-slate-600'}>Test of Design</button>
      <button onClick={()=>setMode('WALK')} className={mode==='WALK'?'text-xs font-bold px-3 py-2 rounded-lg bg-slate-900 text-white':'text-xs font-bold px-3 py-2 rounded-lg bg-slate-100 text-slate-600'}>Walkthrough</button>
    </div>

    <form onSubmit={submitForm} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs">
      <label className="font-semibold text-slate-700 block">Control<select required value={form.controlId} onChange={e=>setForm({...form,controlId:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option value="">Select control</option>{controls.map(c=><option key={c.id} value={c.id}>{c.controlId} — {c.name}</option>)}</select></label>

      {mode==='TOD'?<>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="font-semibold text-slate-700">Period<input required value={form.period} onChange={e=>setForm({...form,period:e.target.value})} placeholder="e.g. 2027-Annual" className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
          <label className="font-semibold text-slate-700">Reviewer name (planning)<input value={form.reviewerName} onChange={e=>setForm({...form,reviewerName:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        </div>
        <label className="font-semibold text-slate-700 block">Test objective<textarea required value={form.testObjective} onChange={e=>setForm({...form,testObjective:e.target.value})} rows={3} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="font-semibold text-slate-700 block">Testing observations / evidence summary<textarea required value={form.observations} onChange={e=>setForm({...form,observations:e.target.value})} rows={4} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <div className="flex flex-wrap gap-4 text-slate-700">
          {[
            ['objectiveAlignment','Objective alignment'],
            ['riskCoverage','Risk coverage'],
            ['precisionAdequate','Precision adequate'],
            ['segregationDuties','Segregation of duties'],
            ['evidenceSufficiency','Evidence sufficiency']
          ].map(([k,l])=><label key={k} className="flex items-center gap-2"><input type="checkbox" checked={(form as any)[k]} onChange={e=>setForm({...form,[k]:e.target.checked})}/>{l}</label>)}
        </div>
        <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">Creating the test stores a <strong>Draft</strong> only. No Effective/Ineffective conclusion is created until the tester submits it and a reviewer approves it.</div>
      </>:<>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="font-semibold text-slate-700">Participants<input value={form.participants} onChange={e=>setForm({...form,participants:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
          <label className="font-semibold text-slate-700">Transaction reference<input value={form.transactionRef} onChange={e=>setForm({...form,transactionRef:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
          <label className="font-semibold text-slate-700 md:col-span-2">Systems inspected<input value={form.systemsInspected} onChange={e=>setForm({...form,systemsInspected:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
          <label className="font-semibold text-slate-700 md:col-span-2">Observations<textarea required value={form.observations} onChange={e=>setForm({...form,observations:e.target.value})} rows={4} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
          <label className="font-semibold text-slate-700">Walkthrough conclusion<select value={form.walkConclusion} onChange={e=>setForm({...form,walkConclusion:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option>Pending Review</option><option>Satisfactory</option><option>Process Change Noted</option><option>Exception Noted</option></select></label>
          <label className="flex items-center gap-2 font-semibold text-slate-700 mt-6"><input type="checkbox" checked={form.processChanged} onChange={e=>setForm({...form,processChanged:e.target.checked})}/>Process changed since prior walkthrough</label>
        </div>
      </>}

      <button disabled={busy||!form.controlId||(mode==='TOD'&&!canTest)} className="inline-flex items-center gap-1.5 bg-brand-600 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg"><Plus className="w-4 h-4"/>{mode==='TOD'?(canTest?'Create ToD Draft':'Tester role required'):'Save Walkthrough'}</button>
    </form>

    <div className="grid xl:grid-cols-2 gap-4">
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-bold text-slate-900 mb-3">ToD Tests</h2>
        <div className="space-y-3">
          {tests.map(t=><div key={t.id} className="border border-slate-100 rounded-lg p-3">
            <div className="flex justify-between gap-3"><div><span className="text-xs font-bold text-slate-900">{t.testId} — {t.control.controlId}</span><div className="text-[11px] text-slate-500 mt-1">{t.process.processId} • {t.period} • Tester: {t.testerName}{t.reviewerName?' • Reviewer: '+t.reviewerName:''}</div></div><span className="text-[10px] bg-slate-100 px-2 py-1 rounded h-fit">{t.status}</span></div>
            <div className="grid grid-cols-5 gap-1.5 mt-3 text-[9px]">
              {[
                ['Objective',t.objectiveAlignment],['Risk',t.riskCoverage],['Precision',t.precisionAdequate],['SoD',t.segregationDuties],['Evidence',t.evidenceSufficiency]
              ].map(([label,val])=><div key={String(label)} className={val?'rounded bg-emerald-50 text-emerald-700 px-2 py-1 text-center':'rounded bg-slate-100 text-slate-500 px-2 py-1 text-center'}>{label}: {val?'Yes':'No'}</div>)}
            </div>
            <div className="text-[11px] text-slate-700 mt-3"><strong>Conclusion:</strong> {t.conclusion}</div>
            <div className="text-[11px] text-slate-500 mt-1">{t.observations||'No observations recorded.'}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {t.status==='Draft'&&canTest&&<button disabled={busy} onClick={()=>submitTod(t)} className="text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1.5 rounded-lg">Submit Tester Conclusion</button>}
              {t.status==='Submitted'&&canReview&&<button disabled={busy} onClick={()=>reviewTod(t)} className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1.5 rounded-lg"><CheckCircle2 className="w-3 h-3"/>Approve / Revise Conclusion</button>}
            </div>
          </div>)}
          {!tests.length&&<div className="text-xs text-slate-400">No ToD test registered.</div>}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-bold text-slate-900 mb-3">Walkthroughs</h2>
        <div className="space-y-3">
          {walks.map(w=><div key={w.id} className="border border-slate-100 rounded-lg p-3">
            <div className="flex justify-between gap-3"><div className="text-xs font-bold text-slate-900">{new Date(w.date).toLocaleDateString('id-ID')}</div><span className="text-[10px] bg-slate-100 px-2 py-1 rounded">{w.conclusion}</span></div>
            <div className="text-[11px] text-slate-500 mt-1">{w.transactionRef||'No transaction reference'} • {w.participants||'Participants not specified'}</div>
            <div className="text-[11px] text-slate-700 mt-2">{w.observations||'No observations recorded.'}</div>
            <div className="text-[10px] text-slate-400 mt-1">{w.systemsInspected||'Systems not specified'}{w.processChanged?' • Process change noted':''}</div>
          </div>)}
          {!walks.length&&<div className="text-xs text-slate-400">No walkthrough registered.</div>}
        </div>
      </section>
    </div>
  </div>;
}
