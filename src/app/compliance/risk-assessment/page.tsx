'use client';
import { useCallback,useEffect,useMemo,useState } from 'react';
import Link from 'next/link';
import { ArrowLeft,ClipboardCheck,Loader2,RefreshCcw,ShieldAlert } from 'lucide-react';

type Option={id:string;name?:string;code?:string;obligationCode?:string;requirementText?:string;processId?:string;riskId?:string;controlId?:string};
type LinkRef={obligationId:string;targetType:string;targetId:string};
type Options={obligations:Option[];units:Option[];links:LinkRef[];processes:Option[];risks:Option[];controls:Option[];referenceLimit:number};
type Assessment={
 id:string;obligationId:string;reassessmentOfId:string|null;processId:string|null;riskId:string|null;controlId:string|null;
 ownerUnitId:string;productName:string|null;period:string;inherentLikelihood:number;inherentImpact:number;
 residualLikelihood:number;residualImpact:number;inherentScore:number;residualScore:number;
 threatDescription:string;existingControls:string;rationale:string;mitigationPlan:string|null;
 nextReviewDate:string;status:string;preparedById:string;reviewerId:string|null;
 reviewNote:string|null;
};
type RiskLineage={id:string;period:string;status:string;inherentScore:number;residualScore:number;reviewedAt:string|null};
type Detail={record:Assessment;history:Array<{action:string;actorRole:string;comment:string|null;createdAt:string}>;
 predecessor:RiskLineage|null;successor:RiskLineage|null};
type ListItem=Pick<Assessment,'id'|'obligationId'|'status'|'period'|'inherentScore'|'residualScore'|'nextReviewDate'> & {
  obligationCode:string;ownerName:string|null;updatedAt:string
};
const inputClass='mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-200';
const button='rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50';
const ghost='rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50';
const initial={
  obligationId:'',processId:'',riskId:'',controlId:'',ownerUnitId:'',productName:'',
  period:String(new Date().getFullYear()),inherentLikelihood:3,inherentImpact:3,
  residualLikelihood:2,residualImpact:2,threatDescription:'',existingControls:'',
  rationale:'',mitigationPlan:'',nextReviewDate:''
};
type Form=typeof initial;
async function request(url:string,body?:Record<string,unknown>){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(url,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',
      headers:body?{'Content-Type':'application/json'}:undefined,
      body:body?JSON.stringify(body):undefined,signal:controller.signal});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Server tidak merespons.');
    return data;
  }finally{clearTimeout(timeout);}
}
function band(s:number){return s>=16?'Kritis':s>=10?'Tinggi':s>=5?'Sedang':'Rendah';}
function sColor(s:number){return s>=16?'text-rose-800 bg-rose-50':s>=10?'text-orange-800 bg-orange-50':s>=5?'text-amber-800 bg-amber-50':'text-sky-800 bg-sky-50';}
export default function ComplianceRiskPage(){
 const [items,setItems]=useState<ListItem[]>([]);
 const [total,setTotal]=useState(0),[page,setPage]=useState(1);
 const [canEdit,setCanEdit]=useState(false),[canReview,setCanReview]=useState(false);
 const [options,setOptions]=useState<Options|null>(null);
 const [detail,setDetail]=useState<Detail|null>(null);
 const [form,setForm]=useState<Form>(initial),[editing,setEditing]=useState<string|null>(null);
 const [reassessing,setReassessing]=useState('');
 const [showForm,setShowForm]=useState(false),[note,setNote]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[success,setSuccess]=useState('');
 const load=useCallback(async(p:number)=>{
   setLoading(true);
   try{const d=await request('/api/compliance/risk-assessment?page='+p);
     setItems(d.items||[]);setTotal(d.total||0);setCanEdit(!!d.mayEdit);setCanReview(!!d.mayReview);
   }catch(e){setError(e instanceof Error?e.message:'Tidak dapat memuat daftar.');}
   finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load(page);},[page,load]);
 async function opts(){if(options)return options;const d=await request('/api/compliance/risk-assessment?view=options');setOptions(d);return d as Options;}
 async function open(id:string){setError('');try{setDetail(await request('/api/compliance/risk-assessment?id='+encodeURIComponent(id)));}
   catch(e){setError(e instanceof Error?e.message:'Detail gagal dibuka.');}}
 async function modify(body:Record<string,unknown>,close=false){
  setBusy(true);setError('');setSuccess('');
  try{const d=await request('/api/compliance/risk-assessment',body);setSuccess('Penilaian tersimpan pada institusi aktif.');
    await load(page);if(d.record?.id)await open(d.record.id);
    else if(detail)await open(detail.record.id);
    if(close){setShowForm(false);setEditing(null);setReassessing('');}
  }catch(e){setError(e instanceof Error?e.message:'Perubahan gagal disimpan.');}
  finally{setBusy(false);}
 }
 function beginEdit(r:Assessment){
   setReassessing('');
   setForm({obligationId:r.obligationId,processId:r.processId||'',riskId:r.riskId||'',
    controlId:r.controlId||'',ownerUnitId:r.ownerUnitId,productName:r.productName||'',
    period:r.period,inherentLikelihood:r.inherentLikelihood,inherentImpact:r.inherentImpact,
    residualLikelihood:r.residualLikelihood,residualImpact:r.residualImpact,
    threatDescription:r.threatDescription,existingControls:r.existingControls,
    rationale:r.rationale,mitigationPlan:r.mitigationPlan||'',nextReviewDate:r.nextReviewDate});
   setEditing(r.id);setShowForm(true);void opts().catch(e=>setError(String(e)));
 }
 function beginReassessment(r:Assessment){
   beginEdit(r);
   setEditing(null);
   setReassessing(r.id);
   setForm(old=>({...old,nextReviewDate:''}));
 }
 const maps=useMemo(()=>options?.links.filter(l=>l.obligationId===form.obligationId)||[],[options,form.obligationId]);
 const eligible=(type:string)=>(arr:Option[])=>arr.filter(o=>maps.some(l=>l.targetType===type&&l.targetId===o.id));
 const bp=eligible('PROCESS')(options?.processes||[]);
 const risks=eligible('RISK')(options?.risks||[]);
 const controls=eligible('CONTROL')(options?.controls||[]);
 return <main className="mx-auto max-w-7xl space-y-5 pb-10">
  <header className="rounded-2xl border border-slate-200 bg-white p-5 md:p-7">
   <Link href="/compliance" className="inline-flex items-center gap-2 text-xs font-semibold text-sky-800"><ArrowLeft className="h-4 w-4"/> Compliance Dashboard 360</Link>
   <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
    <div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-800"><ShieldAlert className="h-4 w-4"/> Compliance · Tahap 3</p>
     <h1 className="mt-1 text-2xl font-bold text-slate-950">Compliance Risk Assessment</h1>
     <p className="mt-2 max-w-2xl text-sm text-slate-600">Penilaian risiko inheren dan residual berbasis kewajiban, proses, kontrol, dan unit kerja. Kesimpulan memerlukan validasi independen.</p></div>
    {canEdit&&<button className={button} onClick={async()=>{setError('');setEditing(null);setReassessing('');setForm({...initial});setShowForm(true);try{await opts();}catch(e){setError(String(e));}}}>+ Buat penilaian</button>}
   </div>
  </header>
  {error&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
  {success&&<div role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">{success}</div>}
  {showForm&&canEdit&&<form className="space-y-4 rounded-2xl border border-sky-200 bg-white p-5" onSubmit={e=>{e.preventDefault();void modify({action:editing?'SAVE':reassessing?'REASSESS':'CREATE',...(editing?{id:editing}:{}),...(reassessing?{reassessmentOfId:reassessing}:{}),...form},true);}}>
   <div className="flex justify-between gap-2"><h2 className="font-bold text-slate-900">{editing?'Revisi penilaian':reassessing?'Reassessment — draft baru':'Penilaian baru — draft'}</h2><button type="button" className={ghost} onClick={()=>setShowForm(false)}>Tutup</button></div>
   {reassessing&&<p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">Penilaian ulang akan membuat rekaman baru; penilaian yang telah disetujui tetap utuh sebagai pembanding. Isi kembali tanggal review berikutnya.</p>}
   <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
    <label className="text-xs font-semibold text-slate-700">Kewajiban regulasi
     <select required className={inputClass} value={form.obligationId} onChange={e=>setForm({...form,obligationId:e.target.value,processId:'',riskId:'',controlId:''})}>
      <option value="">Pilih kewajiban aktif</option>{(options?.obligations||[]).map(o=><option key={o.id} value={o.id}>{o.obligationCode} — {o.requirementText?.slice(0,80)}</option>)}
     </select></label>
    <label className="text-xs font-semibold text-slate-700">Pemilik risiko
     <select required className={inputClass} value={form.ownerUnitId} onChange={e=>setForm({...form,ownerUnitId:e.target.value})}>
      <option value="">Pilih unit</option>{(options?.units||[]).map(u=><option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
     </select></label>
    <label className="text-xs font-semibold text-slate-700">Periode penilaian
     <input required maxLength={50} className={inputClass} value={form.period} onChange={e=>setForm({...form,period:e.target.value})}/></label>
    <label className="text-xs font-semibold text-slate-700">BPM terkait (jika ada mapping)
     <select className={inputClass} value={form.processId} onChange={e=>setForm({...form,processId:e.target.value})}>
      <option value="">Tidak dipilih</option>{bp.map(o=><option key={o.id} value={o.id}>{o.processId} — {o.name}</option>)}</select></label>
    <label className="text-xs font-semibold text-slate-700">Risiko RCM (jika terdaftar)
     <select className={inputClass} value={form.riskId} onChange={e=>setForm({...form,riskId:e.target.value})}>
      <option value="">Tidak dipilih</option>{risks.map(o=><option key={o.id} value={o.id}>{o.riskId} — {o.name}</option>)}</select></label>
    <label className="text-xs font-semibold text-slate-700">Kontrol RCM (jika terdaftar)
     <select className={inputClass} value={form.controlId} onChange={e=>setForm({...form,controlId:e.target.value})}>
      <option value="">Tidak dipilih</option>{controls.map(o=><option key={o.id} value={o.id}>{o.controlId} — {o.name}</option>)}</select></label>
    <label className="text-xs font-semibold text-slate-700">Produk yang dianalisis (opsional, isi sesuai sumber)
     <input maxLength={120} className={inputClass} value={form.productName} onChange={e=>setForm({...form,productName:e.target.value})}/></label>
    <label className="text-xs font-semibold text-slate-700">Tanggal review berikutnya
     <input type="date" required className={inputClass} value={form.nextReviewDate} onChange={e=>setForm({...form,nextReviewDate:e.target.value})}/></label>
   </div>
   <div className="grid gap-3 md:grid-cols-2">
     {([{key:'inherent',title:'Risiko inheren',likelihood:'inherentLikelihood',impact:'inherentImpact'},
       {key:'residual',title:'Risiko residual',likelihood:'residualLikelihood',impact:'residualImpact'}] as const).map(x=>
       <div key={x.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
         <div className="font-semibold text-sm text-slate-900">{x.title}</div>
         <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-700">Likelihood (1–5)
            <select className={inputClass} value={form[x.likelihood]} onChange={e=>setForm({...form,[x.likelihood]:Number(e.target.value)})}>
            {[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
          <label className="text-xs text-slate-700">Impact (1–5)
            <select className={inputClass} value={form[x.impact]} onChange={e=>setForm({...form,[x.impact]:Number(e.target.value)})}>
            {[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
         </div>
         <p className="mt-3 text-sm font-semibold text-slate-900">Skor {form[x.likelihood]*form[x.impact]} · {band(form[x.likelihood]*form[x.impact])}</p>
       </div>)}
   </div>
   <div className="grid gap-3 md:grid-cols-2">
    {([{key:'threatDescription',label:'Risiko dan ancaman yang dianalisis'},
       {key:'existingControls',label:'Pengendalian yang sudah tersedia'},
       {key:'rationale',label:'Justifikasi nilai inheren/residual'},
       {key:'mitigationPlan',label:'Rencana mitigasi (opsional)'}] as const).map(x=>
       <label key={x.key} className="text-xs font-semibold text-slate-700">{x.label}
        <textarea required={x.key!=='mitigationPlan'} maxLength={2000} rows={3} className={inputClass}
         value={form[x.key]} onChange={e=>setForm({...form,[x.key]:e.target.value})}/></label>)}
   </div>
   <button type="submit" disabled={busy||!options} className={button}>Simpan penilaian draft</button>
  </form>}
  <div className="grid min-w-0 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
   <section className="self-start overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="flex items-center justify-between border-b border-slate-100 p-4">
     <div><h2 className="text-sm font-bold text-slate-900">Daftar assessment</h2><p className="text-xs text-slate-500">{total} rekaman</p></div>
     <button className={ghost} type="button" onClick={()=>void load(page)} aria-label="Refresh"><RefreshCcw className="h-4 w-4"/></button>
    </div>
    {loading?<p className="p-5 text-sm text-slate-600"><Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>Memuat data...</p>:
     items.length===0?<p className="p-5 text-sm text-slate-600">Belum ada penilaian risiko yang tercatat.</p>:
     <div className="divide-y divide-slate-100">{items.map(r=><button type="button" key={r.id} onClick={()=>void open(r.id)}
       className={'block w-full p-4 text-left hover:bg-slate-50 '+(detail?.record.id===r.id?'bg-sky-50':'')}>
       <div className="flex flex-wrap justify-between gap-2 text-xs"><span className="font-bold text-sky-800">{r.obligationCode}</span>
         <span className="font-medium text-slate-500">{r.status}</span></div>
       <p className="mt-1 text-sm text-slate-900">Periode {r.period} · {r.ownerName||'Unit belum tersedia'}</p>
       <div className="mt-2 flex gap-2 text-xs">
        <span className={'rounded-md px-2 py-1 '+sColor(r.inherentScore)}>Inheren {r.inherentScore}</span>
        <span className={'rounded-md px-2 py-1 '+sColor(r.residualScore)}>Residual {r.residualScore}</span>
       </div>
      </button>)}</div>}
    <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-3 text-xs">
     <button className={ghost} disabled={page===1} onClick={()=>setPage(n=>n-1)}>Sebelumnya</button>
     <span>{page}</span><button className={ghost} disabled={page*25>=total} onClick={()=>setPage(n=>n+1)}>Berikutnya</button>
    </div>
   </section>
   <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
    {!detail?<div className="py-16 text-center text-sm text-slate-500"><ClipboardCheck className="mx-auto mb-2 h-6 w-6"/>Pilih penilaian untuk melihat detail dan keputusan.</div>:
     <>
      <p className="text-xs font-bold text-sky-800">{detail.record.period} · {detail.record.status}</p>
      <h2 className="mt-1 text-lg font-bold text-slate-950">Penilaian kewajiban</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
       <div className={'rounded-xl p-3 '+sColor(detail.record.inherentScore)}><p className="text-xs">Inheren</p><p className="text-2xl font-bold">{detail.record.inherentScore}</p><p className="text-xs">{band(detail.record.inherentScore)}</p></div>
       <div className={'rounded-xl p-3 '+sColor(detail.record.residualScore)}><p className="text-xs">Residual</p><p className="text-2xl font-bold">{detail.record.residualScore}</p><p className="text-xs">{band(detail.record.residualScore)}</p></div>
      </div>
      <div className="mt-4 space-y-3 text-sm text-slate-700">
       <p><b>Risiko:</b> {detail.record.threatDescription}</p><p><b>Kontrol:</b> {detail.record.existingControls}</p>
       <p><b>Justifikasi:</b> {detail.record.rationale}</p><p><b>Mitigasi:</b> {detail.record.mitigationPlan||'Belum ditetapkan'}</p>
       <p><b>Review berikutnya:</b> {detail.record.nextReviewDate}</p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
       {canEdit&&['DRAFT','REJECTED'].includes(detail.record.status)&&<button className={ghost} onClick={()=>beginEdit(detail.record)}>Ubah / revisi</button>}
       {canEdit&&detail.record.status==='APPROVED'&&!detail.successor&&<button className={button} disabled={busy} onClick={()=>beginReassessment(detail.record)}>Buat reassessment berkala</button>}
       {canEdit&&detail.record.status==='DRAFT'&&<button className={button} disabled={busy} onClick={()=>void modify({action:'SUBMIT',id:detail.record.id})}>Ajukan validasi</button>}
      </div>
      {canReview&&detail.record.status==='SUBMITTED'&&<div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
       <label className="block text-xs font-semibold text-slate-700">Catatan reviewer / alasan penolakan
        <textarea maxLength={1500} rows={2} className={inputClass} value={note} onChange={e=>setNote(e.target.value)}/></label>
       <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy} onClick={()=>void modify({action:'APPROVE',id:detail.record.id,note})}>Validasi</button>
        <button className={ghost} disabled={busy||!note.trim()} onClick={()=>void modify({action:'REJECT',id:detail.record.id,note})}>Kembalikan</button>
       </div>
       <p className="text-xs text-slate-600">Pembuat penilaian tidak boleh mengesahkan hasilnya sendiri.</p>
      </div>}
      {detail.predecessor&&<div className="mt-4 rounded-xl border border-slate-200 p-3 text-sm text-slate-700"><b>Penilaian sebelumnya:</b> {detail.predecessor.period} · {detail.predecessor.status} · Residual {detail.predecessor.residualScore} <button className="ml-2 text-sky-800 underline" onClick={()=>void open(detail.predecessor!.id)}>Lihat penilaian asal</button></div>}
      {detail.successor&&<div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-slate-700"><b>Reassessment berikutnya:</b> {detail.successor.period} · {detail.successor.status} <button className="ml-2 text-sky-800 underline" onClick={()=>void open(detail.successor!.id)}>Lihat tindak lanjut</button></div>}
      {detail.record.reviewNote&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{detail.record.reviewNote}</p>}
      <details className="mt-5 border-t border-slate-100 pt-3"><summary className="cursor-pointer text-sm font-semibold text-slate-700">Jejak audit ({detail.history.length})</summary>
       <div className="mt-2 space-y-2 text-xs text-slate-500">{detail.history.map((h,i)=><p key={i}>{new Date(h.createdAt).toLocaleDateString('id-ID')} · {h.action} · {h.actorRole}</p>)}</div>
      </details>
     </>}
   </section>
  </div>
  <p className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">Skala penilaian: kemungkinan × dampak, 1–25. Hasil merupakan judgment yang dicatat user; sistem tidak menyatakan bank patuh berdasarkan skor. Daftar pilihan referensi dibatasi 500 per jenis untuk kinerja D1.</p>
 </main>;
}
