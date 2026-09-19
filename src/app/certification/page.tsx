'use client';

import React,{useEffect,useMemo,useState} from 'react';
import { BadgeCheck, RefreshCw } from 'lucide-react';

type Control={id:string;controlId:string;name:string;overallHealth:string};
type Cert={id:string;period:string;declarationText:string;certifierName:string;certifierRole:string;status:string;certifiedAt:string;control:{id:string;controlId:string;name:string}};
type Att={id:string;period:string;scopeSummary:string;cfoSignOff:boolean;cfoName?:string|null;croSignOff:boolean;croName?:string|null;overallOpinion?:string|null;attestedAt?:string|null};

function statusesForHealth(health:string){
  if(health==='Healthy') return ['Certified','Not Certified'];
  if(health==='Attention Required') return ['Certified with Exception','Not Certified'];
  return ['Not Certified'];
}

export default function CertificationPage(){
  const[certs,setCerts]=useState<Cert[]>([]);
  const[atts,setAtts]=useState<Att[]>([]);
  const[controls,setControls]=useState<Control[]>([]);
  const[message,setMessage]=useState('');
  const[busy,setBusy]=useState(false);
  const[certForm,setCertForm]=useState({controlId:'',period:'',declarationText:'',status:'Not Certified'});
  const[attForm,setAttForm]=useState({period:'',scopeSummary:'',overallOpinion:'',cfoSignOff:false,croSignOff:false});

  const selectedControl=useMemo(()=>controls.find(c=>c.id===certForm.controlId)||null,[controls,certForm.controlId]);
  const allowedStatuses=statusesForHealth(selectedControl?.overallHealth||'Not Assessed');

  const load=async()=>{
    const[a,b]=await Promise.all([
      fetch('/api/certification',{cache:'no-store'}),
      fetch('/api/controls',{cache:'no-store'})
    ]);
    const ad=await a.json();const bd=await b.json();
    if(!a.ok)throw new Error(ad.error||'Unable to load certifications');
    if(!b.ok)throw new Error(bd.error||'Unable to load controls');
    const nextControls=(bd.controls||[]).map((x:any)=>({id:x.id,controlId:x.controlId,name:x.name,overallHealth:x.overallHealth||'Not Assessed'}));
    setCerts(ad.certifications||[]);
    setAtts(ad.attestations||[]);
    setControls(nextControls);
    setCertForm(v=>{
      const controlId=v.controlId&&nextControls.some((x:Control)=>x.id===v.controlId)?v.controlId:nextControls[0]?.id||'';
      const health=nextControls.find((x:Control)=>x.id===controlId)?.overallHealth||'Not Assessed';
      const statuses=statusesForHealth(health);
      return {...v,controlId,status:statuses.includes(v.status)?v.status:statuses[0]};
    });
  };

  useEffect(()=>{load().catch(e=>setMessage(e.message));},[]);

  const changeControl=(controlId:string)=>{
    const health=controls.find(c=>c.id===controlId)?.overallHealth||'Not Assessed';
    setCertForm(v=>({...v,controlId,status:statusesForHealth(health)[0]}));
  };

  const certify=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setMessage('');
    try{
      const r=await fetch('/api/certification',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'CERTIFY_CONTROL',...certForm})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'Unable to certify');
      setMessage(`Certification recorded against current evidence-derived health: ${d.evidenceDerivedHealth}.`);
      setCertForm(v=>({...v,period:'',declarationText:''}));
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:'Unable to certify');}
    finally{setBusy(false);}
  };

  const attest=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setMessage('');
    try{
      const r=await fetch('/api/certification',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'ATTEST_MANAGEMENT',...attForm})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'Unable to attest');
      const snap=d.evidenceSnapshot;
      setMessage(snap?`Attestation recorded. Evidence snapshot: ${snap.certifiedKeyControls}/${snap.keyControls} key controls certified; ${snap.openIssues} open issue(s).`:'Attestation recorded.');
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:'Unable to attest');}
    finally{setBusy(false);}
  };

  return <div className="space-y-6">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><BadgeCheck className="w-5 h-5 text-brand-600"/>Certification & Attestation</h1>
        <p className="text-xs text-slate-500 mt-1">Certification status is constrained by reviewer-approved ToD/ToE, open issues and CCM evidence; it is not generated from defaults.</p>
      </div>
      <button onClick={()=>load().catch(e=>setMessage(e.message))} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-xs font-bold px-3 py-2 rounded-lg"><RefreshCw className="w-4 h-4"/>Refresh</button>
    </div>

    {message&&<div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">{message}</div>}

    <div className="grid xl:grid-cols-2 gap-5">
      <form onSubmit={certify} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
        <h2 className="text-sm font-bold text-slate-900">Control Certification</h2>
        <label className="font-semibold text-slate-700 block">Control
          <select required value={certForm.controlId} onChange={e=>changeControl(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white">
            <option value="">Select control</option>
            {controls.map(c=><option key={c.id} value={c.id}>{c.controlId} — {c.name} — {c.overallHealth}</option>)}
          </select>
        </label>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px]">
          <strong>Current evidence-derived health:</strong> {selectedControl?.overallHealth||'Not Assessed'}
          <div className="text-slate-500 mt-1">Permitted certification status: {allowedStatuses.join(' / ')}</div>
        </div>

        <label className="font-semibold text-slate-700 block">Period<input required value={certForm.period} onChange={e=>setCertForm({...certForm,period:e.target.value})} placeholder="e.g. 2027-Annual" className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="font-semibold text-slate-700 block">Declaration<textarea required value={certForm.declarationText} onChange={e=>setCertForm({...certForm,declarationText:e.target.value})} rows={5} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="font-semibold text-slate-700 block">Status<select value={certForm.status} onChange={e=>setCertForm({...certForm,status:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white">{allowedStatuses.map(s=><option key={s}>{s}</option>)}</select></label>
        <button disabled={busy||!certForm.controlId} className="bg-brand-600 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg">Record / Update Certification</button>
      </form>

      <form onSubmit={attest} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
        <h2 className="text-sm font-bold text-slate-900">Management Attestation</h2>
        <p className="text-[11px] text-slate-500">The system records an evidence snapshot with each attestation audit event. Sign-off boxes mean the currently authenticated Executive/Admin is signing in that capacity.</p>
        <label className="font-semibold text-slate-700 block">Period<input required value={attForm.period} onChange={e=>setAttForm({...attForm,period:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="font-semibold text-slate-700 block">Scope summary<textarea required value={attForm.scopeSummary} onChange={e=>setAttForm({...attForm,scopeSummary:e.target.value})} rows={3} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="font-semibold text-slate-700 block">Overall opinion<textarea required value={attForm.overallOpinion} onChange={e=>setAttForm({...attForm,overallOpinion:e.target.value})} rows={3} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <div className="flex flex-col sm:flex-row gap-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={attForm.cfoSignOff} onChange={e=>setAttForm({...attForm,cfoSignOff:e.target.checked})}/>Current actor signs as CFO</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={attForm.croSignOff} onChange={e=>setAttForm({...attForm,croSignOff:e.target.checked})}/>Current actor signs as CRO</label>
        </div>
        <button disabled={busy} className="bg-slate-900 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg">Record / Update Attestation</button>
      </form>
    </div>

    <div className="grid xl:grid-cols-2 gap-5">
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-bold text-slate-900 mb-3">Control Certifications</h2>
        <div className="space-y-3">{certs.map(c=><div key={c.id} className="border border-slate-100 rounded-lg p-3"><div className="flex justify-between gap-3"><span className="text-xs font-bold">{c.control.controlId} — {c.period}</span><span className="text-[10px] bg-slate-100 px-2 py-1 rounded">{c.status}</span></div><div className="text-[11px] text-slate-500 mt-1">{c.certifierName} • {c.certifierRole} • {new Date(c.certifiedAt).toLocaleString('id-ID')}</div><p className="text-[11px] text-slate-700 mt-2">{c.declarationText}</p></div>)}{!certs.length&&<div className="text-xs text-slate-400">No certification recorded.</div>}</div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-bold text-slate-900 mb-3">Management Attestations</h2>
        <div className="space-y-3">{atts.map(a=><div key={a.id} className="border border-slate-100 rounded-lg p-3"><div className="flex justify-between gap-3"><div className="text-xs font-bold">{a.period}</div><div className="text-[10px] text-slate-500">{a.attestedAt?new Date(a.attestedAt).toLocaleString('id-ID'):'Not attested'}</div></div><div className="text-[10px] text-slate-500 mt-1">CFO: {a.cfoSignOff?(a.cfoName||'Signed'):'Not signed'} • CRO: {a.croSignOff?(a.croName||'Signed'):'Not signed'}</div><p className="text-[11px] text-slate-700 mt-2">{a.overallOpinion||'No opinion recorded.'}</p></div>)}{!atts.length&&<div className="text-xs text-slate-400">No management attestation recorded.</div>}</div>
      </section>
    </div>
  </div>;
}
