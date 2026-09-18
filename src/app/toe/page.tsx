'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Cpu, FlaskConical, Plus, RefreshCw } from 'lucide-react';
import { useRole } from '@/context/RoleContext';

type Control = { id:string; controlId:string; name:string; process:{ processId:string; name:string } };
type Sample = {
  id:string; sampleNumber:number; transactionRef:string; transactionDate:string; amount?:number|null;
  attributesTested?:string|null; result:string; failureReason?:string|null; evidenceRef?:string|null;
};
type ExceptionRow = { id:string; exceptionNumber:string; sampleRef:string; description:string; severity:string; status:string };
type Test = {
  id:string; testId:string; period:string; populationSize:number; populationSource:string; samplingMethod:string;
  sampleSize:number; passCount:number; failCount:number; testerConclusion:string; finalConclusion:string; status:string;
  notes?:string|null; testerName:string; reviewerName?:string|null; control:Control; process:{processId:string;name:string};
  samples:Sample[]; exceptions:ExceptionRow[];
};

const conclusions = ['Effective','Effective with Minor Exception','Partially Effective','Ineffective'];

export default function ToEWorkpaperPage() {
  const { currentUser } = useRole();
  const [tests,setTests]=useState<Test[]>([]);
  const [controls,setControls]=useState<Control[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [filter,setFilter]=useState<'ALL'|'PASS'|'FAIL'|'NOT_TESTED'>('ALL');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [showCreate,setShowCreate]=useState(false);
  const [showSample,setShowSample]=useState(false);

  const [testForm,setTestForm]=useState({
    controlId:'',period:'',populationSize:'',populationSource:'',samplingMethod:'Risk-Based Sampling',reviewerName:'',notes:''
  });
  const [sampleForm,setSampleForm]=useState({
    transactionRef:'',transactionDate:'',amount:'',attributesTested:'',evidenceRef:''
  });

  const load=async()=>{
    const [a,b]=await Promise.all([
      fetch('/api/assure/toe',{cache:'no-store'}),
      fetch('/api/controls',{cache:'no-store'})
    ]);
    const ad=await a.json(); const bd=await b.json();
    if(!a.ok) throw new Error(ad.error||'Unable to load ToE tests');
    if(!b.ok) throw new Error(bd.error||'Unable to load controls');
    setTests(ad.tests||[]);
    setControls((bd.controls||[]).map((x:any)=>({id:x.id,controlId:x.controlId,name:x.name,process:x.process})));
    const nextSelected = selectedId && (ad.tests||[]).some((x:Test)=>x.id===selectedId) ? selectedId : ad.tests?.[0]?.id || '';
    setSelectedId(nextSelected);
    setTestForm(v=>({...v,controlId:v.controlId||bd.controls?.[0]?.id||''}));
  };

  useEffect(()=>{load().catch(e=>setMessage(e.message));},[]);

  const selected=useMemo(()=>tests.find(t=>t.id===selectedId)||null,[tests,selectedId]);
  const samples=useMemo(()=>{
    if(!selected) return [];
    if(filter==='PASS') return selected.samples.filter(x=>x.result==='Pass');
    if(filter==='FAIL') return selected.samples.filter(x=>x.result==='Fail');
    if(filter==='NOT_TESTED') return selected.samples.filter(x=>x.result==='Not Tested');
    return selected.samples;
  },[selected,filter]);

  const api=async(body:any)=>{
    setBusy(true);setMessage('');
    try{
      const r=await fetch('/api/assure/toe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||'ToE operation failed');
      await load();
      return d;
    }catch(e){setMessage(e instanceof Error?e.message:'ToE operation failed');return null;}
    finally{setBusy(false);}
  };

  const createTest=async(e:React.FormEvent)=>{
    e.preventDefault();
    const d=await api({action:'CREATE_TEST',...testForm,populationSize:Number(testForm.populationSize)});
    if(d){setSelectedId(d.id);setShowCreate(false);setTestForm(v=>({...v,period:'',populationSize:'',populationSource:'',reviewerName:'',notes:''}));}
  };

  const addSample=async(e:React.FormEvent)=>{
    e.preventDefault();if(!selected)return;
    const d=await api({action:'ADD_SAMPLE',testId:selected.id,...sampleForm,amount:sampleForm.amount===''?null:Number(sampleForm.amount)});
    if(d){setShowSample(false);setSampleForm({transactionRef:'',transactionDate:'',amount:'',attributesTested:'',evidenceRef:''});}
  };

  const setResult=async(sample:Sample,result:'Pass'|'Fail'|'N/A')=>{
    let failureReason:string|undefined;
    if(result==='Fail'){
      failureReason=window.prompt('Describe the evidence-based failure reason:')?.trim()||undefined;
      if(!failureReason)return;
    }
    await api({action:'UPDATE_SAMPLE',sampleId:sample.id,result,failureReason});
  };

  const registerException=async(sample:Sample)=>{
    const description=window.prompt('Exception description:',sample.failureReason||'')?.trim();
    if(!description)return;
    const severity=window.prompt('Severity (Critical / High / Medium / Low):','Medium')?.trim()||'Medium';
    await api({action:'REGISTER_EXCEPTION',sampleId:sample.id,description,severity});
  };

  const finalize=async()=>{
    if(!selected)return;
    const conclusion=window.prompt('Tester conclusion:\n'+conclusions.join(' / '),selected.testerConclusion==='Not Assessed'?'':selected.testerConclusion)?.trim();
    if(!conclusion)return;
    if(!conclusions.includes(conclusion)){setMessage('Conclusion must match an allowed value.');return;}
    await api({action:'FINALIZE_TEST',testId:selected.id,testerConclusion:conclusion});
  };

  const review=async()=>{
    if(!selected)return;
    const conclusion=window.prompt('Reviewer final conclusion:\n'+conclusions.join(' / '),selected.finalConclusion==='Not Assessed'?'':selected.finalConclusion)?.trim();
    if(!conclusion)return;
    if(!conclusions.includes(conclusion)){setMessage('Conclusion must match an allowed value.');return;}
    await api({action:'REVIEW_TEST',testId:selected.id,finalConclusion:conclusion});
  };

  return <div className="space-y-6">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-bold text-sky-600 uppercase tracking-wider"><FlaskConical className="w-4 h-4"/>Test of Operating Effectiveness</div>
        <h1 className="text-2xl font-black text-slate-900 mt-1">Digital ToE Workpaper</h1>
        <p className="text-xs text-slate-500 mt-1">Population, samples, results, exceptions and conclusions below come only from persisted testing evidence.</p>
      </div>
      <div className="flex gap-2">
        <button onClick={()=>load().catch(e=>setMessage(e.message))} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-xs font-bold px-3 py-2 rounded-lg"><RefreshCw className="w-4 h-4"/>Refresh</button>
        <button onClick={()=>setShowCreate(v=>!v)} className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-xs font-bold px-3 py-2 rounded-lg"><Plus className="w-4 h-4"/>New ToE</button>
      </div>
    </div>

    {message&&<div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{message}</div>}

    {showCreate&&<form onSubmit={createTest} className="bg-white border border-slate-200 rounded-xl p-5 grid md:grid-cols-2 gap-3 text-xs">
      <label className="font-semibold text-slate-700 md:col-span-2">Control<select required value={testForm.controlId} onChange={e=>setTestForm({...testForm,controlId:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option value="">Select control</option>{controls.map(c=><option key={c.id} value={c.id}>{c.controlId} — {c.name} ({c.process?.processId})</option>)}</select></label>
      <label className="font-semibold text-slate-700">Period<input required value={testForm.period} onChange={e=>setTestForm({...testForm,period:e.target.value})} placeholder="e.g. 2027-Q1" className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <label className="font-semibold text-slate-700">Population size<input required type="number" min="0" value={testForm.populationSize} onChange={e=>setTestForm({...testForm,populationSize:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <label className="font-semibold text-slate-700 md:col-span-2">Population source<input required value={testForm.populationSource} onChange={e=>setTestForm({...testForm,populationSource:e.target.value})} placeholder="Source system/report/query and evidence reference" className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <label className="font-semibold text-slate-700">Sampling method<select value={testForm.samplingMethod} onChange={e=>setTestForm({...testForm,samplingMethod:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option>Random</option><option>Systematic</option><option>Judgmental</option><option>Risk-Based Sampling</option><option>100% Population</option></select></label>
      <label className="font-semibold text-slate-700">Reviewer name<input value={testForm.reviewerName} onChange={e=>setTestForm({...testForm,reviewerName:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <label className="font-semibold text-slate-700 md:col-span-2">Planning notes<textarea value={testForm.notes} onChange={e=>setTestForm({...testForm,notes:e.target.value})} rows={3} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <button disabled={busy} className="md:col-span-2 justify-self-start bg-slate-900 text-white font-bold px-4 py-2.5 rounded-lg">Create ToE Test</button>
    </form>}

    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <label className="text-xs font-semibold text-slate-700">Active workpaper
        <select value={selectedId} onChange={e=>setSelectedId(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white">
          <option value="">No test selected</option>
          {tests.map(t=><option key={t.id} value={t.id}>{t.testId} — {t.control.controlId} — {t.period} — {t.status}</option>)}
        </select>
      </label>
    </div>

    {selected ? <>
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div><div className="text-[10px] font-mono text-slate-400">{selected.testId}</div><h2 className="text-base font-bold text-slate-900">{selected.control.controlId} — {selected.control.name}</h2><div className="text-[11px] text-slate-500 mt-1">{selected.process.processId} • {selected.period} • Tester: {selected.testerName}{selected.reviewerName?' • Reviewer: '+selected.reviewerName:''}</div></div>
          <span className="text-[10px] font-bold bg-slate-100 text-slate-600 rounded-full px-2.5 py-1">{selected.status}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
          <Metric label="Population" value={selected.populationSize}/>
          <Metric label="Samples" value={selected.sampleSize}/>
          <Metric label="Pass" value={selected.passCount}/>
          <Metric label="Fail" value={selected.failCount}/>
          <Metric label="Exceptions" value={selected.exceptions.length}/>
          <Metric label="Untested" value={selected.samples.filter(x=>x.result==='Not Tested').length}/>
        </div>
        <div className="grid md:grid-cols-2 gap-3 text-[11px]">
          <div className="bg-slate-50 p-3 rounded-lg"><strong>Population source:</strong> {selected.populationSource}</div>
          <div className="bg-slate-50 p-3 rounded-lg"><strong>Sampling method:</strong> {selected.samplingMethod}</div>
          <div className="bg-slate-50 p-3 rounded-lg"><strong>Tester conclusion:</strong> {selected.testerConclusion}</div>
          <div className="bg-slate-50 p-3 rounded-lg"><strong>Final conclusion:</strong> {selected.finalConclusion}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={()=>setShowSample(v=>!v)} className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-xs font-bold px-3 py-2 rounded-lg"><Plus className="w-4 h-4"/>Add Sample</button>
          {['Admin','Tester'].includes(currentUser?.role||'')&&<button disabled={busy||selected.status==='Reviewed'} onClick={finalize} className="inline-flex items-center gap-1.5 bg-slate-900 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-lg"><BadgeCheck className="w-4 h-4"/>Finalize Tester</button>}
          {['Admin','Reviewer'].includes(currentUser?.role||'')&&<button disabled={busy||!['Completed','Reviewed'].includes(selected.status)} onClick={review} className="inline-flex items-center gap-1.5 bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-lg"><BadgeCheck className="w-4 h-4"/>Reviewer Conclusion</button>}
        </div>
      </section>

      {showSample&&<form onSubmit={addSample} className="bg-white border border-slate-200 rounded-xl p-5 grid md:grid-cols-2 gap-3 text-xs">
        <label className="font-semibold text-slate-700">Transaction / evidence reference<input required value={sampleForm.transactionRef} onChange={e=>setSampleForm({...sampleForm,transactionRef:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="font-semibold text-slate-700">Transaction date<input required type="date" value={sampleForm.transactionDate} onChange={e=>setSampleForm({...sampleForm,transactionDate:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="font-semibold text-slate-700">Amount (optional)<input type="number" step="any" value={sampleForm.amount} onChange={e=>setSampleForm({...sampleForm,amount:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="font-semibold text-slate-700">Evidence reference<input value={sampleForm.evidenceRef} onChange={e=>setSampleForm({...sampleForm,evidenceRef:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="font-semibold text-slate-700 md:col-span-2">Attributes to test<textarea value={sampleForm.attributesTested} onChange={e=>setSampleForm({...sampleForm,attributesTested:e.target.value})} rows={3} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <button disabled={busy} className="md:col-span-2 justify-self-start bg-slate-900 text-white font-bold px-4 py-2.5 rounded-lg">Add Untested Sample</button>
      </form>}

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div><h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Cpu className="w-4 h-4 text-brand-600"/>Sample Testing Grid</h3><p className="text-[11px] text-slate-500">No sample is assumed to pass until a tester records the result.</p></div>
          <div className="flex gap-1.5">{(['ALL','PASS','FAIL','NOT_TESTED'] as const).map(x=><button key={x} onClick={()=>setFilter(x)} className={filter===x?'text-[10px] font-bold bg-slate-900 text-white px-2.5 py-1.5 rounded-lg':'text-[10px] font-bold bg-slate-100 text-slate-600 px-2.5 py-1.5 rounded-lg'}>{x.replace('_',' ')}</button>)}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="text-left p-3">#</th><th className="text-left p-3">Reference</th><th className="text-left p-3">Date</th><th className="text-right p-3">Amount</th><th className="text-left p-3">Result</th><th className="text-left p-3">Failure reason</th><th className="text-right p-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {samples.map(s=><tr key={s.id}>
                <td className="p-3">{s.sampleNumber}</td>
                <td className="p-3"><div className="font-semibold text-slate-900">{s.transactionRef}</div><div className="text-[10px] text-slate-400">{s.evidenceRef||'No evidence reference'}</div></td>
                <td className="p-3">{new Date(s.transactionDate).toLocaleDateString('id-ID')}</td>
                <td className="p-3 text-right">{s.amount==null?'—':s.amount.toLocaleString('id-ID')}</td>
                <td className="p-3 font-semibold">{s.result}</td>
                <td className="p-3 text-slate-500">{s.failureReason||'—'}</td>
                <td className="p-3"><div className="flex justify-end gap-1.5"><button disabled={busy} onClick={()=>setResult(s,'Pass')} className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">Pass</button><button disabled={busy} onClick={()=>setResult(s,'Fail')} className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded">Fail</button>{s.result==='Fail'&&!selected.exceptions.some(e=>e.sampleRef===s.transactionRef&&e.status!=='False Positive')&&<button disabled={busy} onClick={()=>registerException(s)} className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">Register Exception</button>}</div></td>
              </tr>)}
              {!samples.length&&<tr><td colSpan={7} className="p-8 text-center text-slate-400">No samples in this workpaper.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900">Registered Exceptions</h3>
        <div className="mt-3 space-y-2">{selected.exceptions.map(e=><div key={e.id} className="border border-slate-100 rounded-lg p-3 text-xs"><div className="flex justify-between gap-3"><span className="font-bold text-slate-900">{e.exceptionNumber} • {e.sampleRef}</span><span className="text-[10px] bg-slate-100 px-2 py-1 rounded">{e.severity} • {e.status}</span></div><p className="text-[11px] text-slate-600 mt-1">{e.description}</p></div>)}{!selected.exceptions.length&&<div className="text-xs text-slate-400">No testing exception has been registered.</div>}</div>
      </section>
    </> : <div className="border border-dashed border-slate-300 rounded-xl p-8 text-xs text-slate-500">No ToE test is registered. Create a workpaper from an existing control.</div>}
  </div>;
}

function Metric({label,value}:{label:string;value:number|string}) {
  return <div className="bg-slate-50 border border-slate-200 rounded-lg p-3"><div className="text-[10px] uppercase font-bold text-slate-400">{label}</div><div className="text-xl font-black text-slate-900 mt-0.5">{value}</div></div>;
}
