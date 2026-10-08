'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, Loader2, Plus, RefreshCw, ShieldCheck } from 'lucide-react';

type Plan = {
  id:string;code:string;title:string;year:number;period:string;quarter:number|null;
  ownerUnitId:string;ownerUnitName?:string;objective:string;scope:string;
  startDate:string;endDate:string;status:string;preparedById:string;
  activityCount?:number;completedCount?:number;updatedAt:string;
  reviewNote?:string|null;
};
type Activity = {
  id:string;obligationId:string;obligationCode:string;criticality:string;
  complianceStatus:string;processCode:string|null;ownerUnitName:string|null;
  description:string;scheduledDate:string;status:string;actualDate:string|null;
  outcomeNote:string|null;
};
type Detail = {plan:Plan;activities:Activity[];history:Array<{action:string;actorRole:string;detail:string;createdAt:string}>};
type Options = {
  units:Array<{id:string;code:string;name:string}>;
  obligations:Array<{id:string;obligationCode:string;requirementText:string;criticality:string;ownerUnitId:string|null}>;
  processes:Array<{id:string;processId:string;name:string}>;
  processLinks:Array<{obligationId:string;targetId:string}>;
};
type Draft = {code:string;title:string;year:number;period:string;quarter:number;objective:string;scope:string;ownerUnitId:string;startDate:string;endDate:string};
const yearNow = new Date().getFullYear();
const emptyDraft:Draft = {code:'',title:'',year:yearNow,period:'TAHUNAN',quarter:1,objective:'',scope:'',ownerUnitId:'',startDate:yearNow+'-01-01',endDate:yearNow+'-12-31'};
const statusText:Record<string,string> = {
  DRAFT:'Draft',SUBMITTED:'Menunggu persetujuan',APPROVED:'Disetujui',
  REJECTED:'Perlu revisi',IN_PROGRESS:'Sedang dilaksanakan',COMPLETED:'Selesai',
  PLANNED:'Direncanakan',DONE:'Aktivitas selesai'
};
const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100';
const primary = 'rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50';
const secondary = 'rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

function localDate(value:string|null|undefined) {
  if (!value) return '—';
  const date = new Date(value.slice(0,10)+'T00:00:00');
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
}
async function jsonRequest(url:string,method:'GET'|'POST'='GET',body?:Record<string,unknown>) {
  const controller = new AbortController();
  const timeout = window.setTimeout(()=>controller.abort(),15000);
  try {
    const response = await fetch(url,{method,credentials:'same-origin',cache:'no-store',
      headers:body ? {'Content-Type':'application/json'} : undefined,
      body:body ? JSON.stringify(body) : undefined,signal:controller.signal});
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Server belum dapat memproses permintaan.');
    return payload;
  } finally {window.clearTimeout(timeout);}
}
export default function ComplianceMonitoringPage() {
  const [plans,setPlans] = useState<Plan[]>([]);
  const [total,setTotal] = useState(0);
  const [page,setPage] = useState(1);
  const [canManage,setCanManage] = useState(false);
  const [detail,setDetail] = useState<Detail|null>(null);
  const [options,setOptions] = useState<Options|null>(null);
  const [showCreate,setShowCreate] = useState(false);
  const [showActivity,setShowActivity] = useState(false);
  const [draft,setDraft] = useState<Draft>(emptyDraft);
  const [item,setItem] = useState({obligationId:'',processId:'',ownerUnitId:'',description:'',scheduledDate:''});
  const [note,setNote] = useState('');
  const [actualNotes,setActualNotes] = useState<Record<string,string>>({});
  const [actualDates,setActualDates] = useState<Record<string,string>>({});
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');

  const load = useCallback(async (p:number) => {
    try {
      setLoading(true);
      const data = await jsonRequest('/api/compliance/monitoring?page='+p);
      setPlans(data.plans || []);setTotal(data.total || 0);setCanManage(Boolean(data.canManage));
    } catch(e) {setError(e instanceof Error ? e.message:'Gagal memuat rencana.');}
    finally {setLoading(false);}
  },[]);
  const openPlan = useCallback(async (id:string) => {
    const data = await jsonRequest('/api/compliance/monitoring?planId='+encodeURIComponent(id));
    setDetail(data as Detail);
    setNote('');
  },[]);
  const loadOptions = useCallback(async () => {
    if (options) return;
    const data = await jsonRequest('/api/compliance/monitoring?view=options');
    setOptions(data as Options);
  },[options]);
  useEffect(()=>{void load(page);},[load,page]);

  async function mutate(body:Record<string,unknown>,after?:()=>void) {
    setBusy(true);setError('');setMessage('');
    try {
      const res = await jsonRequest('/api/compliance/monitoring','POST',body);
      setMessage('Perubahan berhasil disimpan pada institusi aktif.');
      after?.();
      await load(page);
      if (body.action === 'CREATE' && res.result?.id) await openPlan(res.result.id);
      else if (detail?.plan.id) await openPlan(detail.plan.id);
    } catch(e) {setError(e instanceof Error ? e.message:'Perubahan tidak tersimpan.');}
    finally {setBusy(false);}
  }
  const selectedObligation = options?.obligations.find(o=>o.id===item.obligationId);
  const allowedProcesses = options?.processes.filter(p=>
    (options.processLinks || []).some(l=>l.obligationId===item.obligationId && l.targetId===p.id)) || [];
  const canEdit = Boolean(canManage && detail?.plan.status === 'DRAFT');
  const plan = detail?.plan;

  return (
    <main className="mx-auto max-w-7xl space-y-5 pb-12">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
        <Link href="/compliance" className="inline-flex items-center gap-2 text-xs font-semibold text-sky-800">
          <ArrowLeft className="h-4 w-4" /> Compliance Dashboard 360
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-800">
              <ClipboardList className="h-4 w-4" /> Operasional Kepatuhan · Tahap 2
            </div>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 md:text-3xl">Compliance Monitoring Plan</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Susun rencana tahunan atau triwulanan berdasarkan kewajiban aktif, tentukan unit penanggung jawab,
              minta persetujuan terpisah, lalu catat realisasi aktivitas.
            </p>
          </div>
          {canManage && <button className={primary} type="button" onClick={async()=>{
            setError('');setShowCreate(true);try{await loadOptions();}catch(e){setError(e instanceof Error?e.message:'Referensi tidak tersedia.');}
          }}><Plus className="mr-2 inline h-4 w-4" /> Buat rencana</button>}
        </div>
      </header>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {message && <div role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">{message}</div>}

      {showCreate && canManage && (
        <form onSubmit={e=>{e.preventDefault();void mutate({action:'CREATE',...draft},()=>{setShowCreate(false);setDraft(emptyDraft);});}}
          className="space-y-4 rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900">Rencana baru · Draft</h2>
            <button type="button" className={secondary} onClick={()=>setShowCreate(false)}>Tutup</button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">Kode rencana
              <input required maxLength={40} className={field} value={draft.code} onChange={e=>setDraft({...draft,code:e.target.value})} placeholder="CMP-2026-01" />
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Nama rencana
              <input required maxLength={180} className={field} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="Monitoring kepatuhan operasional" />
            </label>
            <label className="text-sm font-medium text-slate-700">Tahun
              <input required type="number" min={2000} max={2100} className={field} value={draft.year}
                onChange={e=>setDraft({...draft,year:Number(e.target.value)})} />
            </label>
            <label className="text-sm font-medium text-slate-700">Periode
              <select className={field} value={draft.period} onChange={e=>setDraft({...draft,period:e.target.value})}>
                <option value="TAHUNAN">Tahunan</option><option value="TRIWULAN">Triwulanan</option>
              </select>
            </label>
            {draft.period==='TRIWULAN' && <label className="text-sm font-medium text-slate-700">Triwulan
              <select className={field} value={draft.quarter} onChange={e=>setDraft({...draft,quarter:Number(e.target.value)})}>
                {[1,2,3,4].map(q=><option key={q} value={q}>Triwulan {q}</option>)}
              </select>
            </label>}
            <label className="text-sm font-medium text-slate-700">Awal rencana
              <input required type="date" className={field} value={draft.startDate} onChange={e=>setDraft({...draft,startDate:e.target.value})}/>
            </label>
            <label className="text-sm font-medium text-slate-700">Akhir rencana
              <input required type="date" className={field} value={draft.endDate} onChange={e=>setDraft({...draft,endDate:e.target.value})}/>
            </label>
            <label className="text-sm font-medium text-slate-700">Unit pengelola
              <select required className={field} value={draft.ownerUnitId} onChange={e=>setDraft({...draft,ownerUnitId:e.target.value})}>
                <option value="">Pilih dari struktur organisasi</option>
                {(options?.units||[]).map(u=><option key={u.id} value={u.id}>{u.code} · {u.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Tujuan monitoring
              <textarea required rows={2} maxLength={2000} className={field} value={draft.objective} onChange={e=>setDraft({...draft,objective:e.target.value})}/>
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Ruang lingkup
              <textarea required rows={2} maxLength={2000} className={field} value={draft.scope} onChange={e=>setDraft({...draft,scope:e.target.value})}/>
            </label>
          </div>
          <button disabled={busy||!options} className={primary} type="submit">Simpan draft</button>
        </form>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <section className="min-w-0 self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <div><h2 className="font-bold text-slate-900">Daftar rencana</h2><p className="text-xs text-slate-500">{total} rencana tersimpan</p></div>
            <button type="button" aria-label="Muat ulang" className={secondary} onClick={()=>void load(page)}><RefreshCw className="h-4 w-4"/></button>
          </div>
          {loading ? <p className="p-5 text-sm text-slate-600"><Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>Memuat data...</p> :
            plans.length===0 ? <p className="p-5 text-sm text-slate-600">Belum ada rencana monitoring. Belum ada aktivitas yang diklaim selesai.</p> :
              <div className="divide-y divide-slate-100">
                {plans.map(p=><button key={p.id} type="button" onClick={()=>{setError('');void openPlan(p.id).catch(e=>setError(e instanceof Error?e.message:'Rencana gagal dimuat.'));}}
                  className={'block w-full p-4 text-left hover:bg-slate-50 '+(plan?.id===p.id?'bg-sky-50':'')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-sky-800">{p.code}</span>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">{statusText[p.status]||p.status}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900">{p.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{p.year} · {p.activityCount} aktivitas · {p.completedCount} selesai</p>
                </button>)}
              </div>}
          <div className="flex items-center justify-between border-t border-slate-100 p-3 text-xs">
            <button disabled={page===1} className={secondary} onClick={()=>setPage(p=>Math.max(1,p-1))}>Sebelumnya</button>
            <span>Halaman {page}</span>
            <button disabled={page*25>=total} className={secondary} onClick={()=>setPage(p=>p+1)}>Berikutnya</button>
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          {!detail ? <div className="flex min-h-56 flex-col items-center justify-center text-center text-sm text-slate-500">
            <CalendarDays className="mb-3 h-7 w-7 text-slate-400"/>Pilih rencana untuk melihat detail, persetujuan, serta realisasinya.
          </div> : <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-sky-800">{plan?.code} · {statusText[plan?.status||'']||plan?.status}</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">{plan?.title}</h2>
                <p className="mt-2 text-xs text-slate-500">{localDate(plan?.startDate)}—{localDate(plan?.endDate)} · {plan?.period}</p>
              </div>
              <CheckCircle2 className="h-6 w-6 shrink-0 text-sky-800"/>
            </div>
            <p className="mt-3 text-sm text-slate-700"><span className="font-semibold">Tujuan:</span> {plan?.objective}</p>
            <p className="mt-1 text-sm text-slate-700"><span className="font-semibold">Ruang lingkup:</span> {plan?.scope}</p>
            {plan?.reviewNote && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Catatan reviewer: {plan.reviewNote}</p>}
            {canManage && <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <div className="flex flex-wrap gap-2">
                {canEdit && <button type="button" disabled={busy} className={secondary} onClick={async()=>{setShowActivity(!showActivity);if(!options)try{await loadOptions();}catch(e){setError(e instanceof Error?e.message:'Referensi gagal dimuat.');}}}><Plus className="mr-1 inline h-4 w-4"/>Tambah aktivitas</button>}
                {plan?.status==='DRAFT' && <button type="button" disabled={busy||detail.activities.length===0} className={primary} onClick={()=>void mutate({action:'SUBMIT',planId:plan.id})}>Ajukan persetujuan</button>}
                {plan?.status==='SUBMITTED' && <>
                  <button type="button" disabled={busy} className={primary} onClick={()=>void mutate({action:'APPROVE',planId:plan.id,note})}>Setujui</button>
                  <button type="button" disabled={busy||!note.trim()} className={secondary} onClick={()=>void mutate({action:'REJECT',planId:plan.id,note})}>Tolak</button>
                </>}
                {plan?.status==='REJECTED' && <button type="button" disabled={busy} className={secondary} onClick={()=>void mutate({action:'REVISE',planId:plan.id})}>Kembalikan ke draft</button>}
                {plan?.status==='APPROVED' && <button type="button" disabled={busy} className={primary} onClick={()=>void mutate({action:'START',planId:plan.id})}>Mulai pelaksanaan</button>}
                {plan?.status==='IN_PROGRESS' && <button type="button" disabled={busy||detail.activities.some(a=>a.status!=='DONE')} className={primary} onClick={()=>void mutate({action:'COMPLETE',planId:plan.id})}>Tutup rencana</button>}
              </div>
              {plan?.status==='SUBMITTED' && <label className="block text-xs text-slate-600">Catatan keputusan / alasan penolakan
                <textarea className={field} rows={2} maxLength={1500} value={note} onChange={e=>setNote(e.target.value)}/>
              </label>}
            </div>}
            {showActivity && canEdit && <form className="mt-4 space-y-3 rounded-xl border border-sky-200 bg-sky-50/40 p-4" onSubmit={e=>{
              e.preventDefault();void mutate({action:'ADD_ACTIVITY',planId:plan?.id,...item},()=>{setShowActivity(false);setItem({obligationId:'',processId:'',ownerUnitId:'',description:'',scheduledDate:''});});
            }}>
              <h3 className="font-bold text-slate-900">Aktivitas pemantauan</h3>
              <label className="block text-sm text-slate-700">Kewajiban regulasi aktif
                <select required className={field} value={item.obligationId} onChange={e=>{
                  const id=e.target.value;const obligation=options?.obligations.find(o=>o.id===id);
                  setItem({...item,obligationId:id,processId:'',ownerUnitId:obligation?.ownerUnitId||''});
                }}>
                  <option value="">Pilih kewajiban</option>
                  {(options?.obligations||[]).map(o=><option key={o.id} value={o.id}>{o.obligationCode} · {o.requirementText.slice(0,100)}</option>)}
                </select>
              </label>
              {selectedObligation && <p className="text-xs text-slate-600">Prioritas bersumber dari criticality kewajiban: <strong>{selectedObligation.criticality}</strong>. Belum menggantikan Compliance Risk Assessment.</p>}
              <label className="block text-sm text-slate-700">BPM yang sudah dipetakan (opsional)
                <select className={field} value={item.processId} onChange={e=>setItem({...item,processId:e.target.value})}>
                  <option value="">Tanpa BPM spesifik</option>
                  {allowedProcesses.map(p=><option key={p.id} value={p.id}>{p.processId} · {p.name}</option>)}
                </select>
              </label>
              <label className="block text-sm text-slate-700">Unit pelaksana
                <select required className={field} value={item.ownerUnitId} onChange={e=>setItem({...item,ownerUnitId:e.target.value})}>
                  <option value="">Pilih unit</option>
                  {(options?.units||[]).map(u=><option key={u.id} value={u.id}>{u.code} · {u.name}</option>)}
                </select>
              </label>
              <label className="block text-sm text-slate-700">Tanggal monitoring
                <input required type="date" min={plan?.startDate} max={plan?.endDate} className={field} value={item.scheduledDate} onChange={e=>setItem({...item,scheduledDate:e.target.value})}/>
              </label>
              <label className="block text-sm text-slate-700">Kegiatan / metode monitoring
                <textarea required maxLength={1200} rows={2} className={field} value={item.description} onChange={e=>setItem({...item,description:e.target.value})}/>
              </label>
              <button disabled={busy||!options} className={primary} type="submit">Tambahkan ke rencana</button>
            </form>}

            <h3 className="mt-6 flex items-center gap-2 border-b border-slate-100 pb-3 text-base font-bold text-slate-900">
              <CalendarDays className="h-4 w-4 text-sky-800"/>Jadwal dan realisasi ({detail.activities.length})
            </h3>
            {detail.activities.length===0 ? <p className="py-5 text-sm text-slate-500">Belum ada aktivitas. Tambahkan kewajiban yang akan dipantau sebelum mengajukan persetujuan.</p> :
              <div className="divide-y divide-slate-100">
                {detail.activities.map(a=><article className="py-4" key={a.id}>
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="text-xs font-bold text-sky-800">{a.obligationCode} · {a.criticality}</span>
                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{statusText[a.status]||a.status}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{a.description}</p>
                  <p className="mt-1 text-xs text-slate-500">{a.ownerUnitName||'Unit tidak tersedia'} · Rencana {localDate(a.scheduledDate)} · Realisasi {localDate(a.actualDate)}
                    {a.processCode ? ' · BPM '+a.processCode : ''}
                  </p>
                  {a.outcomeNote && <p className="mt-2 text-xs text-slate-600">Catatan realisasi: {a.outcomeNote}</p>}
                  {canManage && plan?.status==='IN_PROGRESS' && a.status!=='DONE' && <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
                    {a.status==='PLANNED' && <button className={secondary} disabled={busy} onClick={()=>void mutate({action:'PROGRESS_ACTIVITY',activityId:a.id,status:'IN_PROGRESS'})}>Mulai aktivitas</button>}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-xs text-slate-700">Tanggal realisasi
                        <input type="date" className={field} value={actualDates[a.id]||''} onChange={e=>setActualDates({...actualDates,[a.id]:e.target.value})}/>
                      </label>
                      <label className="text-xs text-slate-700">Ringkasan hasil pelaksanaan (bukan status patuh)
                        <input maxLength={2000} className={field} value={actualNotes[a.id]||''} onChange={e=>setActualNotes({...actualNotes,[a.id]:e.target.value})}/>
                      </label>
                    </div>
                    <button type="button" disabled={busy||!actualDates[a.id]||!actualNotes[a.id]?.trim()} className={secondary}
                      onClick={()=>void mutate({action:'PROGRESS_ACTIVITY',activityId:a.id,status:'DONE',actualDate:actualDates[a.id],outcomeNote:actualNotes[a.id]})}>
                      Tandai aktivitas selesai
                    </button>
                  </div>}
                </article>)}
              </div>}
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              Aktivitas selesai tidak berarti kewajiban dinyatakan patuh atau kontrol lolos pengujian.
              Kesimpulan tersebut hanya berasal dari assessment dan bukti terpisah.
            </p>
            <details className="mt-5 border-t border-slate-100 pt-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Riwayat aktivitas dan persetujuan</summary>
              {detail.history.length===0 ? <p className="mt-3 text-xs text-slate-500">Belum ada riwayat.</p> :
                <div className="mt-3 space-y-2">{detail.history.map((h,i)=><p key={i} className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                  {localDate(h.createdAt)} · {h.action} · {h.actorRole} {h.detail&&'· '+h.detail}
                </p>)}</div>}
            </details>
          </>}
        </section>
      </div>
      <footer className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
        Data berasal dari D1 institusi aktif; tidak ada rencana atau hasil monitoring fiktif.
        Daftar referensi saat ini memuat maksimum 500 item per kategori; jika data lebih banyak,
        lengkapi mapping dan gunakan peningkatan pencarian sebelum menetapkan cakupan final.
      </footer>
    </main>
  );
}
