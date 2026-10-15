'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRole } from '@/context/RoleContext';
import { AlertCircle, CheckCircle2, FileSearch, Link2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
type RecordAny=Record<string,any>;
const assertions=['Existence / Occurrence','Completeness','Accuracy','Valuation / Allocation',
  'Rights & Obligations','Cut-off','Classification','Presentation & Disclosure'];
const endpoint='/api/icofr/ai-mapping';
export default function IcofrAiMappingPage(){
  const {currentUser}=useRole();
  const role=currentUser?.role||'';
  const [data,setData]=useState<RecordAny|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [query,setQuery]=useState('');
  const [onlyGaps,setOnlyGaps]=useState(false);
  const [selectedId,setSelectedId]=useState('');
  const [choice,setChoice]=useState('');
  const [assertion,setAssertion]=useState('');
  const [rationale,setRationale]=useState('');
  const [sourceReference,setSourceReference]=useState('');
  const [reviewNote,setReviewNote]=useState('');
  const [history,setHistory]=useState<RecordAny[]|null>(null);
  const [aiStatus,setAiStatus]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{const response=await fetch(endpoint,{cache:'no-store'});
      const json=await response.json();
      if(!response.ok)throw new Error(json.error||'Tidak dapat memuat workspace');
      setData(json);setSelectedId(id=>json.items?.some((v:RecordAny)=>v.id===id)?id:json.items?.[0]?.id||'');
    }catch(e){setError(e instanceof Error?e.message:'Gagal memuat data');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  const filtered=useMemo(()=>(data?.items||[]).filter((item:RecordAny)=>{
    const text=(item.itemCode+' '+item.name).toLowerCase();
    return text.includes(query.toLowerCase())&&(!onlyGaps||item.plcGap||!item.source);
  }),[data,query,onlyGaps]);
  const selected=(data?.items||[]).find((item:RecordAny)=>item.id===selectedId);
  const candidate=selected?.riskControlCandidates?.find((c:RecordAny)=>c.riskId+'|'+c.controlId===choice);
  useEffect(()=>{setChoice('');setAssertion('');setRationale('');setSourceReference('');setHistory(null);setAiStatus('');},[selectedId]);
  async function post(url:string,payload:RecordAny){
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await response.json();
    if(!response.ok)throw new Error(json.error||'Gagal menyimpan');
    return json;
  }
  async function draft(){
    if(!selected||!candidate)return;
    setBusy(true);setError('');setMessage('');
    try {
      await post(endpoint,{action:'CREATE_DRAFT',financialItemId:selected.id,
        assertion,riskId:candidate.riskId,controlMasterId:candidate.controlId,
        sourceReference,rationale});
      setMessage('Usulan tersimpan sebagai DRAFT. Belum masuk assertion resmi dan belum memengaruhi production gate.');
      await load();
    }catch(e){setError(e instanceof Error?e.message:'Tidak dapat menyimpan draft');}finally{setBusy(false);}
  }
  async function ai(){
    if(!selected)return;
    setBusy(true);setError('');setAiStatus('');
    try{
      const result=await post(endpoint+'/recommend',{financialItemId:selected.id});
      const suggestion=result.recommendation;
      setChoice(suggestion.riskId+'|'+suggestion.controlMasterId);
      setAssertion(String(suggestion.assertion));
      setRationale(String(suggestion.rationale||''));
      setAiStatus('Usulan AI dari '+result.provider+' / '+result.model+'. Harus direviu manusia. '+(suggestion.limitations||''));
    }catch(e){setError(e instanceof Error?e.message:'AI belum tersedia');}
    finally{setBusy(false);}
  }
  async function advance(id:string,action:string){
    setBusy(true);setError('');setMessage('');
    try{
      await post(endpoint,{id,action,note:reviewNote});
      setMessage('Tahapan '+action+' dicatat dalam riwayat persetujuan.');
      setReviewNote('');await load();
    }catch(e){setError(e instanceof Error?e.message:'Persetujuan gagal');}
    finally{setBusy(false);}
  }
  async function viewHistory(id:string){
    try{const r=await fetch(endpoint+'?history='+encodeURIComponent(id),{cache:'no-store'});
      if(!r.ok)throw new Error('Riwayat belum tersedia');
      const j=await r.json();setHistory(j.history||[]);
    }catch(e){setError(e instanceof Error?e.message:'Riwayat gagal dimuat');}
  }
  const canCreate=role==='ICOFRCoordinator'||role==='SystemAdmin';
  const summary=data?.summary||{};
  return <div className="mx-auto max-w-7xl space-y-5 px-1 pb-12">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-widest text-sky-700">ICOFR · Source-to-control assurance</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 md:text-2xl">AI Mapping & Validation Workspace</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">Kandidat assertion dan RCM berbasis dokumen sumber, review pemilik proses dan persetujuan berjenjang. Rekomendasi AI tidak dipublikasikan otomatis.</p>
        </div>
        <button onClick={()=>void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"><RefreshCw className="h-4 w-4"/> Refresh</button>
      </div>
      <div className="mt-3"><Link href="/icofr/traceability" className="text-sm font-semibold text-sky-700 hover:underline">Buka matriks traceability →</Link></div>
    </section>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {([['Akun signifikan',summary.significantItems],['Relasi FSLI–BPM',summary.scopingPairs],
        ['Akun dengan kandidat',summary.itemsWithCandidates],['Gap PLC',summary.missingPlc],
        ['Usulan draft/review',summary.proposals],['Published',summary.published]] as [string,unknown][]).map(([label,value])=>
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value??'—'}</p></div>)}
    </div>
    {error&&<div className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="h-4 w-4 shrink-0"/>{error}</div>}
    {message&&<div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0"/>{message}</div>}
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(250px,0.37fr)_minmax(0,1fr)]">
      <section className="rounded-xl border bg-white p-4">
        <h2 className="font-bold">Akun dalam cakupan</h2>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari kode/nama akun" className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"/>
        <label className="my-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={onlyGaps} onChange={e=>setOnlyGaps(e.target.checked)}/> Hanya gap PLC / sumber</label>
        <div className="max-h-[620px] space-y-1 overflow-y-auto">
          {loading?<p className="p-3 text-sm">Memuat data...</p>:filtered.length===0?<p className="p-3 text-sm">Tidak ada hasil.</p>:filtered.map((item:RecordAny)=>
            <button key={item.id} onClick={()=>setSelectedId(item.id)} className={'w-full rounded-lg border p-3 text-left text-sm '+(selectedId===item.id?'border-sky-500 bg-sky-50':'border-transparent hover:bg-slate-50')}>
              <span className="block text-xs font-bold text-sky-700">{item.itemCode}</span>
              <span className="mt-1 block font-medium text-slate-800">{item.name}</span>
              <span className="mt-1 block text-xs text-slate-500">{item.processes?.length||0} BPM · {item.candidateCount||0} kandidat RCM</span>
              {item.plcGap&&<span className="mt-1 block text-xs font-semibold text-amber-700">Belum ada PLC terkait</span>}
            </button>)}
        </div>
      </section>
      {selected?<div className="space-y-4">
        <section className="rounded-xl border bg-white p-5">
          <h2 className="text-lg font-bold">{selected.itemCode} · {selected.name}</h2>
          <p className="mt-1 text-sm text-slate-500">{selected.financialStatement}</p>
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-6">
            <p className="font-bold">Referensi dokumen scoping</p>
            <p className="break-words">{selected.source?.documentTitle||'Tidak ditemukan pasangan dokumen yang persis sama'}</p>
            <p>Record: {selected.source?.recordKey||'—'}</p>
            <p className="break-all">SHA-256: {selected.source?.sha256||'—'}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">{selected.processes.map((p:RecordAny)=>
            <span key={p.id} title={p.sourceReference||''} className="rounded-full bg-sky-50 px-3 py-1 text-xs text-sky-800">{p.code} · {p.name}</span>)}</div>
          {selected.plcGap&&<div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Gap PLC: belum ada kontrol proses yang terdaftar sebagai ICOFR PLC pada rantai kandidat. ITGC saja tidak cukup untuk menerbitkan mapping ini.</div>}
        </section>
        <section className="rounded-xl border bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-bold">Kandidat Assertion – RCM</h2>
            {canCreate&&<button onClick={()=>void ai()} disabled={busy||!selected.source} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Sparkles className="h-4 w-4"/> Rekomendasi AI</button>}
          </div>
          {aiStatus&&<p className="mt-2 rounded-lg bg-sky-50 p-3 text-xs leading-5 text-sky-800">{aiStatus}</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold">Assertion
              <select value={assertion} onChange={e=>setAssertion(e.target.value)} className="mt-1 w-full rounded-lg border p-2.5 text-sm font-normal">
                <option value="">Pilih assertion</option>{assertions.map(x=><option key={x}>{x}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold">RCM Risk → Control
              <select value={choice} onChange={e=>setChoice(e.target.value)} className="mt-1 w-full min-w-0 rounded-lg border p-2.5 text-sm font-normal">
                <option value="">Pilih pasangan risiko-kontrol</option>
                {selected.riskControlCandidates.map((c:RecordAny)=><option key={c.riskId+'|'+c.controlId} value={c.riskId+'|'+c.controlId}>{c.riskCode} → {c.controlCode} {c.domainCategory?'('+c.domainCategory+')':'(PLC belum terdaftar)'}</option>)}
              </select>
            </label>
          </div>
          {candidate&&<div className="mt-3 rounded-lg border p-3 text-xs leading-6">
            <p><strong>Risk:</strong> {candidate.riskName}</p><p><strong>Control:</strong> {candidate.controlName}</p>
            <p><strong>ICOFR domain:</strong> {candidate.domainCategory||'Belum terhubung ke domain ICOFR'}</p>
          </div>}
          <label className="mt-3 block text-xs font-bold">Alasan pemetaan dan relevansi kontrol (minimal 50 karakter)
            <textarea rows={3} value={rationale} onChange={e=>setRationale(e.target.value)} className="mt-1 w-full rounded-lg border p-3 text-sm font-normal" placeholder="Jelaskan alasan assertion → risk → control, serta bukti yang mendasarinya"/>
          </label>
          <label className="mt-3 block text-xs font-bold">Rujukan bukti spesifik (minimal 12 karakter)
            <input value={sourceReference} onChange={e=>setSourceReference(e.target.value)} className="mt-1 w-full rounded-lg border p-2.5 text-sm font-normal" placeholder="Nama dokumen, sheet/baris atau halaman, nomor SOP"/>
          </label>
          <div className="mt-4 flex justify-end">
            <button onClick={()=>void draft()} disabled={!canCreate||busy||!selected.source||!candidate||!assertion||rationale.trim().length<50||sourceReference.trim().length<12} className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">Simpan usulan Draft</button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Simpan Draft tidak menulis ICOFRAssertion, hasil ToD/ToE, atau kesimpulan compliance.</p>
        </section>
        <section className="rounded-xl border bg-white p-5">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-sky-700"/><h2 className="font-bold">Validasi dan persetujuan berjenjang</h2></div>
          <p className="mt-2 text-xs leading-5 text-slate-500">Process Owner → Koordinator ICOFR → Reviewer independen → Publish. Identitas setiap peninjau dicatat; pembuat draft tidak dapat meninjau proposal sendiri.</p>
          <label className="mt-3 block text-xs font-semibold">Catatan review (minimal 15 karakter)
            <textarea value={reviewNote} onChange={e=>setReviewNote(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal"/>
          </label>
          <div className="mt-4 space-y-3">{selected.proposals?.length?selected.proposals.map((p:RecordAny)=>
            <div key={p.id} className="rounded-lg border p-3">
              <p className="text-xs font-bold">{p.assertion} · {p.status}</p>
              <p className="mt-1 break-words text-xs text-slate-600">{p.rationale}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {([['OWNER_REVIEW','ProcessOwner','DRAFT'],['ICOFR_REVIEW','ICOFRCoordinator','OWNER_REVIEWED'],['APPROVE','Reviewer','ICOFR_REVIEWED'],['PUBLISH','ICOFRCoordinator','APPROVED']] as const).map(([action,allowed,status])=>
                  role===allowed&&p.status===status?<button key={action} disabled={busy||reviewNote.trim().length<15} onClick={()=>void advance(p.id,action)} className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{action==='PUBLISH'?'Publikasikan':action.replace('_',' ')}</button>:null)}
                {['Reviewer','ICOFRCoordinator'].includes(role)&&!['PUBLISHED','REJECTED'].includes(p.status)&&<button disabled={busy||reviewNote.trim().length<15} onClick={()=>void advance(p.id,'REJECT')} className="rounded-md border border-rose-200 px-3 py-2 text-xs text-rose-700 disabled:opacity-40">Tolak</button>}
                <button onClick={()=>void viewHistory(p.id)} className="rounded-md border px-3 py-2 text-xs">Audit Trail</button>
              </div>
              {p.status==='APPROVED'&&selected.plcGap&&<p className="mt-2 text-xs text-amber-800">Publish ditolak sampai PLC yang relevan dan bersumber bukti terdaftar.</p>}
            </div>):<p className="text-sm text-slate-500">Belum ada usulan untuk akun ini.</p>}</div>
          {history&&<div className="mt-3 rounded-lg bg-slate-50 p-3"><h3 className="text-xs font-bold">Riwayat persetujuan</h3>{history.map((h,i)=><p key={i} className="mt-2 text-xs">{h.createdAt} · {h.actorRole} · {h.action} · {h.note}</p>)}</div>}
        </section>
      </div>:<section className="rounded-xl border bg-white p-10 text-center text-sm text-slate-500"><FileSearch className="mx-auto mb-2 h-6 w-6"/>Pilih akun untuk melihat kandidat pemetaan.</section>}
    </div>
  </div>;
}
