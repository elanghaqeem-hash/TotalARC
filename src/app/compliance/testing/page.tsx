'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,Beaker,Loader2,RefreshCw,CheckSquare} from 'lucide-react';

type Basic={id:string;code?:string;obligationCode?:string;requirementText?:string;
 controlId?:string;name?:string;period?:string;residualScore?:number;description?:string;
 evidenceId?:string;title?:string;currentVersionId?:string;obligationId?:string};
type Options={
 obligations:Basic[];controls:Basic[];links:Array<{obligationId:string;targetId:string}>;
 risks:Basic[];activities:Basic[];units:Basic[];evidence:Basic[];referenceLimit:number
};
type Work={
 id:string;code:string;obligationId:string;controlId:string;riskAssessmentId:string|null;
 monitoringActivityId:string|null;icofrReviewId:string|null;sourceTestId:string|null;
 testType:string;period:string;objective:string;procedures:string;populationDescription:string;
 populationSize:number;sampleSize:number;samplingMethod:string;targetDate:string;status:string;
 conclusion:string;preparedById:string;reviewNote:string|null
};
type Detail={
 record:Work;
 samples:Array<{id:string;reference:string;result:string;exceptionNote:string|null}>;
 evidences:Array<{id:string;evidenceId:string;title:string;description:string}>;
 findings:Array<{id:string;title:string;severity:string;dueDate:string;mapId:string|null}>;
 history:Array<{action:string;actorRole:string;createdAt:string}>
};
type List=Pick<Work,'id'|'code'|'status'|'conclusion'|'period'|'testType'|'obligationId'|'controlId'> & {
 obligationCode:string;controlCode:string;samples:number;evidences:number
};
const currentYear=new Date().getFullYear();
const empty={
 code:'',obligationId:'',controlId:'',riskAssessmentId:'',monitoringActivityId:'',
 icofrReviewId:'',testType:'TOE',period:String(currentYear),objective:'',procedures:'',
 populationDescription:'',populationSize:0,sampleSize:0,samplingMethod:'',targetDate:''
};
type Form=typeof empty;
const field='mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-200';
const primary='rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50';
const ghost='rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50';
async function req(url:string,body?:Record<string,unknown>){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{const response=await fetch(url,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',
   headers:body?{'Content-Type':'application/json'}:undefined,
   body:body?JSON.stringify(body):undefined,signal:controller.signal});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Tidak dapat memproses permintaan.');
   return data;
 }finally{clearTimeout(timeout);}
}
export default function ComplianceTestingPage(){
 const [list,setList]=useState<List[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(1);
 const [mayWrite,setMayWrite]=useState(false),[mayReview,setMayReview]=useState(false);
 const [options,setOptions]=useState<Options|null>(null),[detail,setDetail]=useState<Detail|null>(null);
 const [form,setForm]=useState<Form>(empty),[createOpen,setCreateOpen]=useState(false),[sourceId,setSourceId]=useState('');
 const [sample,setSample]=useState({reference:'',result:'PASS',exceptionNote:''});
 const [evidence,setEvidence]=useState({documentId:'',description:''});
 const [finding,setFinding]=useState({title:'',description:'',severity:'HIGH',ownerUnitId:'',dueDate:''});
 const [review,setReview]=useState({decision:'INCONCLUSIVE',note:''});
 const [testerResult,setTesterResult]=useState({conclusion:'INCONCLUSIVE',note:''});
 const [linkMap,setLinkMap]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async(p:number)=>{
  setLoading(true);try{const d=await req('/api/compliance/testing?page='+p);
   setList(d.items||[]);setTotal(d.total||0);setMayWrite(!!d.mayWrite);setMayReview(!!d.mayReview);
  }catch(e){setError(e instanceof Error?e.message:'Gagal memuat workprogram.');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load(page);},[load,page]);
 async function refs(){if(options)return options;const d=await req('/api/compliance/testing?view=options') as Options;setOptions(d);return d;}
 async function open(id:string){
  try{setDetail(await req('/api/compliance/testing?id='+encodeURIComponent(id)));}
  catch(e){setError(e instanceof Error?e.message:'Workpaper gagal dibuka.');}
 }
 async function action(body:Record<string,unknown>,close=false){
  setBusy(true);setError('');setNotice('');
  try{const result=await req('/api/compliance/testing',body);
   setNotice('Data pengujian berhasil disimpan.');await load(page);
   if(result.record?.id)await open(result.record.id);
   else if(detail)await open(detail.record.id);
   if(close){setCreateOpen(false);setSourceId('');setForm(empty);}
  }catch(e){setError(e instanceof Error?e.message:'Perubahan gagal disimpan.');}
  finally{setBusy(false);}
 }
 const mappedControls=useMemo(()=>options?.controls.filter(c=>options.links.some(l=>l.obligationId===form.obligationId&&l.targetId===c.id))||[],[options,form.obligationId]);
 const riskOptions=options?.risks.filter(r=>r.obligationId===form.obligationId)||[];
 const activityOptions=options?.activities.filter(a=>a.obligationId===form.obligationId)||[];
 const w=detail?.record;
 const draft=w?.status==='DRAFT';
 return <main className="mx-auto max-w-7xl space-y-5 pb-12">
  <header className="rounded-2xl border border-slate-200 bg-white p-5 md:p-7">
   <Link href="/compliance" className="flex items-center gap-2 text-xs font-semibold text-sky-800"><ArrowLeft className="h-4 w-4"/> Compliance Dashboard 360</Link>
   <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
    <div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-800"><Beaker className="h-4 w-4"/> Operasional Kepatuhan · Tahap 4</p>
     <h1 className="mt-1 text-2xl font-bold text-slate-950">Compliance Testing & Review</h1>
     <p className="mt-2 max-w-2xl text-sm text-slate-600">Workprogram berbasis kewajiban dan kontrol nyata, prosedur ToD/ToE, sampel, bukti, temuan, review independen, serta re-test.</p>
    </div>
    {mayWrite&&<button className={primary} onClick={async()=>{setError('');setSourceId('');setForm({...empty});setCreateOpen(true);try{await refs();}catch(e){setError(String(e));}}}>+ Workpaper baru</button>}
   </div>
  </header>
  {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
  {notice&&<p role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">{notice}</p>}
  {createOpen&&mayWrite&&<form className="space-y-4 rounded-2xl border border-sky-200 bg-white p-5" onSubmit={e=>{e.preventDefault();void action({action:sourceId?'RETEST':'CREATE',sourceTestId:sourceId,...form},true);}}>
   <div className="flex justify-between gap-2"><h2 className="font-semibold text-slate-900">{sourceId?'Re-test dari workpaper sebelumnya':'Buat workprogram — draft'}</h2>
    <button type="button" className={ghost} onClick={()=>setCreateOpen(false)}>Tutup</button></div>
   <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
    <label className="text-xs font-semibold text-slate-700">Kode pengujian
     <input required className={field} maxLength={45} value={form.code} onChange={e=>setForm({...form,code:e.target.value})} placeholder="CT-2026-001"/></label>
    <label className="text-xs font-semibold text-slate-700">Jenis pengujian
     <select className={field} value={form.testType} onChange={e=>setForm({...form,testType:e.target.value})}>
      <option value="TOD">Test of Design (ToD)</option><option value="TOE">Test of Effectiveness (ToE)</option>
     </select></label>
    <label className="text-xs font-semibold text-slate-700">Periode
     <input required className={field} maxLength={40} value={form.period} onChange={e=>setForm({...form,period:e.target.value})}/></label>
    <label className="text-xs font-semibold text-slate-700">Kewajiban aktif
     <select required className={field} value={form.obligationId} onChange={e=>setForm({...form,obligationId:e.target.value,controlId:'',riskAssessmentId:'',monitoringActivityId:''})}>
      <option value="">Pilih kewajiban</option>{(options?.obligations||[]).map(o=><option value={o.id} key={o.id}>{o.obligationCode} — {o.requirementText?.slice(0,70)}</option>)}
     </select></label>
    <label className="text-xs font-semibold text-slate-700">Kontrol terpetakan
     <select required className={field} value={form.controlId} onChange={e=>setForm({...form,controlId:e.target.value})}>
      <option value="">Pilih kontrol yang sudah terhubung</option>{mappedControls.map(o=><option value={o.id} key={o.id}>{o.controlId} — {o.name}</option>)}
     </select></label>
    <label className="text-xs font-semibold text-slate-700">Assessment risiko APPROVED (opsional)
     <select className={field} value={form.riskAssessmentId} onChange={e=>setForm({...form,riskAssessmentId:e.target.value})}>
      <option value="">Tanpa assessment khusus</option>{riskOptions.map(o=><option value={o.id} key={o.id}>{o.period} · Residual {o.residualScore}</option>)}
     </select></label>
    <label className="text-xs font-semibold text-slate-700">Monitoring Plan disetujui (opsional)
     <select className={field} value={form.monitoringActivityId} onChange={e=>setForm({...form,monitoringActivityId:e.target.value})}>
      <option value="">Tidak dipilih</option>{activityOptions.map(o=><option value={o.id} key={o.id}>{o.description?.slice(0,80)}</option>)}
     </select></label>
    <label className="text-xs font-semibold text-slate-700">ID review ICOFR ToD/ToE (opsional, divalidasi)
     <input className={field} value={form.icofrReviewId} onChange={e=>setForm({...form,icofrReviewId:e.target.value})} placeholder="ID workpaper review"/></label>
    <label className="text-xs font-semibold text-slate-700">Tanggal target
     <input required type="date" className={field} value={form.targetDate} onChange={e=>setForm({...form,targetDate:e.target.value})}/></label>
    <label className="text-xs font-semibold text-slate-700">Populasi (total)
     <input required min={0} type="number" className={field} value={form.populationSize} onChange={e=>setForm({...form,populationSize:Number(e.target.value)})}/></label>
    <label className="text-xs font-semibold text-slate-700">Jumlah sampel
     <input required min={0} type="number" max={form.populationSize} className={field} value={form.sampleSize} onChange={e=>setForm({...form,sampleSize:Number(e.target.value)})}/></label>
    <label className="text-xs font-semibold text-slate-700">Metode sampling
     <input required maxLength={180} className={field} value={form.samplingMethod} onChange={e=>setForm({...form,samplingMethod:e.target.value})} placeholder="Random, judgmental, full population"/></label>
    {([{k:'objective',label:'Tujuan pengujian',limit:2000},{k:'procedures',label:'Langkah prosedur ToD/ToE',limit:4000},
      {k:'populationDescription',label:'Definisi dan sumber populasi',limit:1600}] as const).map(x=>
      <label key={x.k} className="text-xs font-semibold text-slate-700 md:col-span-2">{x.label}
       <textarea required className={field} rows={2} maxLength={x.limit} value={form[x.k]} onChange={e=>setForm({...form,[x.k]:e.target.value})}/></label>)}
   </div>
   <button type="submit" disabled={busy||!options} className={primary}>Simpan workpaper draft</button>
  </form>}
  <div className="grid min-w-0 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
   <section className="self-start overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-4">
     <div><h2 className="text-sm font-bold text-slate-900">Workpaper pengujian</h2><p className="text-xs text-slate-500">{total} workpaper tercatat</p></div>
     <button className={ghost} onClick={()=>void load(page)} aria-label="Refresh"><RefreshCw className="h-4 w-4"/></button>
    </div>
    {loading?<p className="p-4 text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>Memuat...</p>:
      list.length===0?<p className="p-4 text-sm text-slate-500">Belum ada workpaper. Tidak ada pengujian dianggap lulus otomatis.</p>:
      <div className="divide-y divide-slate-100">{list.map(t=><button type="button" key={t.id} onClick={()=>void open(t.id)} className={'block w-full p-4 text-left hover:bg-slate-50 '+(w?.id===t.id?'bg-sky-50':'')}>
        <div className="flex justify-between gap-2 text-xs"><span className="font-bold text-sky-800">{t.code}</span><span className="text-slate-600">{t.status}</span></div>
        <p className="mt-1 text-sm font-medium text-slate-900">{t.testType} · {t.obligationCode} · {t.controlCode}</p>
        <p className="mt-2 text-xs text-slate-500">{t.period} · {t.samples} sampel · {t.evidences} bukti · {t.conclusion}</p>
       </button>)}</div>}
    <div className="flex items-center justify-between border-t border-slate-100 p-3 text-xs">
     <button className={ghost} disabled={page===1} onClick={()=>setPage(n=>n-1)}>Sebelumnya</button><span>{page}</span>
     <button className={ghost} disabled={page*25>=total} onClick={()=>setPage(n=>n+1)}>Berikutnya</button>
    </div>
   </section>
   <section className="min-w-0 space-y-5 rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
    {!detail?<p className="py-16 text-center text-sm text-slate-500"><CheckSquare className="mx-auto mb-2 h-6 w-6"/>Pilih workpaper untuk sampel, bukti, temuan dan reviewer.</p>:<>
     <div><p className="text-xs font-bold text-sky-800">{w?.code} · {w?.testType} · {w?.status}</p>
      <h2 className="mt-1 text-lg font-bold text-slate-950">{w?.objective}</h2>
      <p className="mt-2 text-sm text-slate-600">{w?.procedures}</p>
      <p className="mt-2 text-xs text-slate-500">Populasi {w?.populationSize} · Target sampel {w?.sampleSize} · {w?.samplingMethod}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">Hasil penguji: {w?.testerConclusion||'NOT_ASSESSED'} · Keputusan reviewer: {w?.conclusion||'NOT_ASSESSED'}</p>
      {w?.testerResultNote&&<p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">Catatan pelaksanaan: {w.testerResultNote}</p>}</div>
     {mayWrite&&w?.status==='APPROVED'&&<button className={ghost} onClick={async()=>{
      setSourceId(w.id);setForm({code:w.code+'-RT',obligationId:w.obligationId,controlId:w.controlId,
       riskAssessmentId:w.riskAssessmentId||'',monitoringActivityId:w.monitoringActivityId||'',icofrReviewId:w.icofrReviewId||'',
       testType:w.testType,period:w.period,objective:w.objective,procedures:w.procedures,
       populationDescription:w.populationDescription,populationSize:w.populationSize,sampleSize:w.sampleSize,
       samplingMethod:w.samplingMethod,targetDate:w.targetDate});setCreateOpen(true);
      try{await refs();}catch(e){setError(String(e));}
     }}>Buat re-test terpisah</button>}

     <div className="border-t border-slate-100 pt-4">
      <h3 className="text-sm font-bold text-slate-900">Sampel pengujian ({detail.samples.length})</h3>
      {detail.samples.map(s=><p key={s.id} className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-700">{s.reference} · <b>{s.result}</b> {s.exceptionNote&&'· '+s.exceptionNote}</p>)}
      {draft&&mayWrite&&w?.testType==='TOE'&&<form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void action({action:'ADD_SAMPLE',id:w.id,...sample});}}>
       <label className="text-xs text-slate-700">Referensi sampel<input required maxLength={160} className={field} value={sample.reference} onChange={e=>setSample({...sample,reference:e.target.value})}/></label>
       <label className="text-xs text-slate-700">Hasil
        <select className={field} value={sample.result} onChange={e=>setSample({...sample,result:e.target.value})}>
         <option value="PASS">PASS</option><option value="FAIL">FAIL</option><option value="NOT_TESTED">Belum diuji</option>
        </select></label>
       {sample.result==='FAIL'&&<label className="sm:col-span-2 text-xs text-slate-700">Penjelasan kegagalan<textarea required maxLength={1500} className={field} value={sample.exceptionNote} onChange={e=>setSample({...sample,exceptionNote:e.target.value})}/></label>}
       <button className={ghost} disabled={busy||detail.samples.length>=w.sampleSize} type="submit">Tambahkan sampel nyata</button>
      </form>}
     </div>
     <div className="border-t border-slate-100 pt-4">
      <h3 className="text-sm font-bold text-slate-900">Bukti terverifikasi ({detail.evidences.length})</h3>
      {detail.evidences.map(x=><p key={x.id} className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-700">{x.evidenceId} · {x.title} · {x.description}</p>)}
      {draft&&mayWrite&&<form className="mt-3 space-y-3" onSubmit={e=>{e.preventDefault();void action({action:'ADD_EVIDENCE',id:w?.id,...evidence});}}>
       <label className="block text-xs text-slate-700">Dokumen dari Evidence Repository
        <select required className={field} value={evidence.documentId} onChange={e=>setEvidence({...evidence,documentId:e.target.value})}>
         <option value="">Pilih dokumen yang memiliki versi aktif</option>
         {(options?.evidence||[]).map(e=><option key={e.id} value={e.id}>{e.evidenceId} · {e.title}</option>)}
        </select></label>
       <label className="block text-xs text-slate-700">Relevansi bukti
        <input required maxLength={1500} className={field} value={evidence.description} onChange={e=>setEvidence({...evidence,description:e.target.value})}/></label>
       <button type="button" className={ghost} onClick={()=>void refs().catch(e=>setError(String(e)))}>Muat referensi</button>
       <button className={ghost} disabled={busy||!options} type="submit">Tautkan bukti</button>
      </form>}
     </div>
     <div className="border-t border-slate-100 pt-4">
      <h3 className="text-sm font-bold text-slate-900">Temuan dan tindak lanjut ({detail.findings.length})</h3>
      {detail.findings.map(f=><div key={f.id} className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
       <p><b>{f.severity}</b> · {f.title} · Tenggat {f.dueDate}</p><p>MAP: {f.mapId||'Belum ditautkan — memerlukan tindak lanjut'}</p>
       {mayWrite&&!f.mapId&&<div className="mt-2 flex flex-wrap gap-2">
        <input aria-label="ID MAP existing" className={field} placeholder="ID MAP existing" value={linkMap[f.id]||''} onChange={e=>setLinkMap({...linkMap,[f.id]:e.target.value})}/>
        <button type="button" className={ghost} disabled={busy||!linkMap[f.id]?.trim()} onClick={()=>void action({action:'LINK_MAP',id:w?.id,findingId:f.id,mapId:linkMap[f.id]})}>Tautkan MAP</button>
       </div>}
      </div>)}
      {draft&&mayWrite&&<form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void action({action:'ADD_FINDING',id:w?.id,...finding});}}>
       <label className="text-xs text-slate-700">Judul temuan<input required maxLength={150} className={field} value={finding.title} onChange={e=>setFinding({...finding,title:e.target.value})}/></label>
       <label className="text-xs text-slate-700">Tingkat keparahan<select className={field} value={finding.severity} onChange={e=>setFinding({...finding,severity:e.target.value})}>
        {['CRITICAL','HIGH','MEDIUM','LOW'].map(x=><option key={x} value={x}>{x}</option>)}
       </select></label>
       <label className="text-xs text-slate-700">Pemilik tindak lanjut<select required className={field} value={finding.ownerUnitId} onChange={e=>setFinding({...finding,ownerUnitId:e.target.value})}>
        <option value="">Pilih unit</option>{(options?.units||[]).map(u=><option value={u.id} key={u.id}>{u.code} · {u.name}</option>)}
       </select></label>
       <label className="text-xs text-slate-700">Due date<input required type="date" className={field} value={finding.dueDate} onChange={e=>setFinding({...finding,dueDate:e.target.value})}/></label>
       <label className="sm:col-span-2 text-xs text-slate-700">Deskripsi temuan<textarea required maxLength={2000} className={field} value={finding.description} onChange={e=>setFinding({...finding,description:e.target.value})}/></label>
       <button type="button" className={ghost} onClick={()=>void refs().catch(e=>setError(String(e)))}>Muat referensi</button>
       <button type="submit" className={ghost} disabled={busy||!options}>Catat temuan</button>
      </form>}
     </div>
     <div className="border-t border-slate-100 pt-4">
      <h3 className="text-sm font-bold text-slate-900">Pengajuan dan review independen</h3>
      {draft&&mayWrite&&<form className="mt-3 space-y-3 rounded-xl border border-sky-100 bg-sky-50 p-4" onSubmit={e=>{
       e.preventDefault();void action({action:'RECORD_RESULT',id:w?.id,conclusion:testerResult.conclusion,note:testerResult.note});
      }}>
       <h4 className="text-xs font-bold text-slate-800">Hasil pelaksanaan oleh penguji</h4>
       <label className="block text-xs text-slate-700">Kesimpulan penguji
        <select className={field} value={testerResult.conclusion} onChange={e=>setTesterResult({...testerResult,conclusion:e.target.value})}>
         {['EFFECTIVE','PARTIAL','INEFFECTIVE','INCONCLUSIVE'].map(x=><option key={x} value={x}>{x}</option>)}
        </select></label>
       <label className="block text-xs text-slate-700">Hasil aktual dan justifikasi yang didukung bukti
        <textarea required rows={3} maxLength={2000} className={field} value={testerResult.note} onChange={e=>setTesterResult({...testerResult,note:e.target.value})}/>
       </label>
       <button className={ghost} disabled={busy||!testerResult.note.trim()} type="submit">Simpan hasil penguji</button>
      </form>}
      <div className="mt-3 flex flex-wrap gap-2">
       {draft&&mayWrite&&<button className={primary} disabled={busy} onClick={()=>void action({action:'SUBMIT',id:w.id})}>Ajukan review hasil</button>}
       {w?.status==='RETURNED'&&mayWrite&&<button className={ghost} disabled={busy} onClick={()=>void action({action:'REVISE',id:w.id})}>Kembalikan ke draft</button>}
      </div>
      {w?.status==='SUBMITTED'&&mayReview&&<div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-4">
       <label className="block text-xs text-slate-700">Keputusan reviewer<select className={field} value={review.decision} onChange={e=>setReview({...review,decision:e.target.value})}>
        {['EFFECTIVE','PARTIAL','INEFFECTIVE','INCONCLUSIVE'].map(x=><option key={x} value={x}>{x}</option>)}
       </select></label>
       <label className="block text-xs text-slate-700">Catatan reviewer / alasan pengembalian<textarea maxLength={1500} rows={2} className={field} value={review.note} onChange={e=>setReview({...review,note:e.target.value})}/></label>
       <div className="flex flex-wrap gap-2">
        <button className={primary} disabled={busy} onClick={()=>void action({action:'APPROVE',id:w.id,...review})}>Setujui hasil</button>
        <button className={ghost} disabled={busy||!review.note.trim()} onClick={()=>void action({action:'RETURN',id:w.id,...review})}>Kembalikan untuk revisi</button>
       </div>
       <p className="text-xs text-slate-600">Reviewer tidak boleh sama dengan preparer. Kegagalan sampel mencegah kesimpulan EFFECTIVE.</p>
      </div>}
      {w?.reviewNote&&<p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">Catatan reviewer: {w.reviewNote}</p>}
     </div>
     <details className="border-t border-slate-100 pt-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">Histori audit ({detail.history.length})</summary>
      {detail.history.map((h,i)=><p className="mt-2 text-xs text-slate-500" key={i}>{new Date(h.createdAt).toLocaleDateString('id-ID')} · {h.action} · {h.actorRole}</p>)}
     </details>
    </>}
   </section>
  </div>
  <footer className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
   Belum diuji ≠ lulus. Workpaper ToD/ToE di sini tidak otomatis mengubah status kepatuhan, hasil ICOFR, atau menutup MAP. Bukti dan relasi tetap mengacu ke institusi aktif. Batas lookup 500 item per sumber.
  </footer>
 </main>;
}
