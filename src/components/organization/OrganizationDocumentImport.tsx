'use client';
import { useEffect, useRef, useState } from 'react';
import { PdfCompressControl } from '@/components/documents/PdfCompressControl';
import { preparePdfText } from '@/lib/pdf-ocr-client';
import { ORGANIZATION_TYPES, ORGANIZATION_HIERARCHY_STANDARD, splitOrganizationDocumentText, mergeOrganizationDrafts, validateOrganizationDraft, orderOrganizationDraft, type OrganizationDraft } from '@/lib/organization-import';

type Props = { institutionId: string; institutionName: string; existing: {id: string; code: string; name: string}[]; entities: {id: string; name: string}[]; onSaved: () => void };
export function OrganizationDocumentImport({institutionId, institutionName, existing, entities, onSaved}: Props) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [ocr, setOcr] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [rows, setRows] = useState<OrganizationDraft[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [entity, setEntity] = useState('');
  const [provider, setProvider] = useState('');
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; request.current?.abort(); }, []);
  const choose = (next: File | null) => { setFile(next); setRows([]); setConfirmed(false); setError(''); setWarnings([]); setProgress(''); };
  function edit(index: number, key: keyof OrganizationDraft, value: string) {
    setRows(current => current.map((row, i) => i === index ? {...row, [key]: value} : row)); setConfirmed(false);
  }
  async function analyze() {
    if (!file || busy || compressing) return;
    if (!/\.(pdf|txt|png|jpe?g)$/i.test(file.name) || file.size > 40 * 1024 * 1024) { setError('Pilih PDF/TXT/PNG/JPG maksimal 40 MB.'); return; }
    const current = ++generation.current;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setRows([]); setConfirmed(false); setWarnings([]);
    try {
      const status = (message: string) => { if (current !== generation.current) throw new Error('Proses dibatalkan.'); setProgress(message); };
      let text: string;
      if (/\.(png|jpe?g)$/i.test(file.name)) {
        if (ocr === 'off') throw new Error('Aktifkan OCR untuk membaca gambar.');
        status('Membaca gambar dengan OCR Indonesia/Inggris…');
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker(['ind','eng'], 1, {workerPath:'/ocr/worker.min.js', corePath:'/ocr', langPath:'/ocr', workerBlobURL:false});
        try { const result = await worker.recognize(file, {rotateAuto:true}); text = '--- Gambar halaman 1 ---\n' + result.data.text; }
        finally { await worker.terminate(); }
      } else {
        const pdf = await preparePdfText(file, ocr === 'all', status, ocr !== 'off');
        text = pdf ? pdf.chunks.join('\n\n') : await file.text();
      }
      if (current !== generation.current) return;
      const chunks = splitOrganizationDocumentText(text);
      const groups: OrganizationDraft[][] = [];
      const notices: string[] = [];
      const providers = new Set<string>();
      let finished = 0;
      const analyzePart = async (part: string, number: number, depth = 0): Promise<void> => {
        status('Analisis tahap ' + number + '/' + chunks.length + ' (' + finished +
          ' bagian selesai)' + (depth ? ' · mengulang bagian lebih kecil…' : '…'));
        const response = await fetch('/api/organization/document-analysis', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({text: part, institutionId}), signal: controller.signal
        });
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 422 &&
            ['STRUCTURE_INCOMPLETE','STRUCTURE_INVALID_JSON'].includes(result.code) &&
            depth < 2 && part.length > 2400) {
            const smaller = splitOrganizationDocumentText(part, Math.max(1200, Math.floor(part.length / 2)));
            if (smaller.length > 1) {
              for (const sub of smaller) await analyzePart(sub, number, depth + 1);
              return;
            }
          }
          throw new Error('Tahap ' + number + ': ' + (result.error || 'Analisis AI gagal.') +
            ' Tidak ada perubahan database.');
        }
        if (current !== generation.current) throw new Error('Analisis dibatalkan.');
        if (Array.isArray(result.units) && result.units.length) {
          groups.push(validateOrganizationDraft(result.units));
        }
        if (Array.isArray(result.warnings)) notices.push(...result.warnings);
        providers.add([result.provider,result.model].filter(Boolean).join(' · '));
        finished++;
      };
      for (let i = 0; i < chunks.length; i++) await analyzePart(chunks[i], i + 1);
      if (current !== generation.current) return;
      if (!groups.length) {
        throw new Error('Tidak ditemukan unit organisasi dengan bukti teks yang cukup. Periksa OCR dan halaman lampiran.');
      }
      const merged = mergeOrganizationDrafts(groups);
      setRows(validateOrganizationDraft(merged.units));
      setWarnings([...notices, ...merged.warnings]);
      setProvider(Array.from(providers).filter(Boolean).join(' / '));
      setProgress(merged.units.length + ' unit draft selesai dari ' + finished +
        ' bagian. Tinjau kode, garis pelaporan, dan bukti sebelum menyimpan.');
    } catch (err) { if (current === generation.current) setError(err instanceof Error ? err.message : 'Analisis gagal.'); }
    finally { if (current === generation.current) setBusy(false); }
  }
  async function save() {
    if (busy || !confirmed || !file) return;
    setBusy(true); setError('');
    const controller = new AbortController(); request.current = controller;
    try {
      const units = orderOrganizationDraft(validateOrganizationDraft(rows), existing);
      setProgress('Menyimpan struktur organisasi…');
      const response = await fetch('/api/organization/import', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({units, institutionId, sourceName:file.name, legalEntityId:entity || null, confirmed}), signal:controller.signal});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Penyimpanan gagal.');
      setRows([]); setConfirmed(false); setProgress(`${result.count} unit berhasil disimpan untuk ${institutionName}.`); onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Penyimpanan gagal.'); }
    finally { setBusy(false); }
  }
  const field = 'w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-sm';
  return <section className="mt-4 min-w-0 rounded-xl border border-sky-200 bg-white p-4">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-bold text-white">Unggah Struktur Organisasi</button>
    {open && <div className="mt-4 space-y-3">
      <p className="text-sm text-slate-700">Institusi: <strong>{institutionName}</strong>. Unggah → kompres PDF → OCR opsional → analisis AI → tinjau → simpan.</p>
      <p className="text-xs text-slate-500">PDF, TXT, PNG atau JPG · maksimal 40 MB / 300 halaman PDF. Analisis bertahap maksimal 90.000 karakter dan 100 unit per impor. Bagian yang tidak lengkap diulang dengan ukuran lebih kecil. File diproses di perangkat; hanya teks dikirim ke AI institusi. Dokumen asli belum diarsipkan.</p>
      <input aria-label="File struktur organisasi" type="file" accept=".pdf,.txt,.png,.jpg,.jpeg" disabled={busy || compressing} onChange={e => choose(e.target.files?.[0] || null)} className="block w-full min-w-0 text-sm" />
      <PdfCompressControl file={file} disabled={busy} onChange={choose} onBusyChange={setCompressing} />
      <p className="text-xs text-slate-600">Urutan acuan: {ORGANIZATION_HIERARCHY_STANDARD}</p>
      <label className="block text-sm">Pembacaan OCR<select className={field} value={ocr} disabled={busy || compressing} onChange={e => { setOcr(e.target.value); setRows([]); setConfirmed(false); }}><option value="auto">Otomatis untuk halaman scan</option><option value="all">OCR seluruh halaman</option><option value="off">Tanpa OCR — PDF teks / TXT</option></select></label>
      <button type="button" disabled={!file || busy || compressing} onClick={analyze} className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Memproses…' : 'Analisis AI Struktur'}</button>
      <p role="status" className="text-sm text-slate-600">{progress}</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {rows.length > 0 && <fieldset disabled={busy || compressing} className="min-w-0 space-y-3">
        <legend className="font-bold">Pratinjau draft · {rows.length} unit</legend>
        <p className="text-xs text-slate-500">{provider}. Cocokkan dengan bagan asli. Induk kosong berarti unit tingkat teratas; garis koordinasi dan pengawasan tidak otomatis menjadi hubungan induk.</p>
        {warnings.map((warning,i) => <p key={i} className="text-sm text-amber-800">{warning}</p>)}
        <label className="block text-sm">Entitas legal<select value={entity} onChange={e => {setEntity(e.target.value);setConfirmed(false);}} className={field}><option value="">Tingkat institusi</option>{entities.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <datalist id="organization-parent-codes">{[...existing,...rows].map((row,i) => <option key={i} value={row.code}>{row.name}</option>)}</datalist>
        {rows.map((row,index) => <div key={index} className="grid min-w-0 gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">Kode unit<input className={field} value={row.code} onChange={e => edit(index,'code',e.target.value)} /></label>
          <label className="text-xs font-semibold">Nama unit<input className={field} value={row.name} onChange={e => edit(index,'name',e.target.value)} /></label>
          <label className="text-xs font-semibold">Tipe unit<select className={field} value={row.type} onChange={e => edit(index,'type',e.target.value)}>{ORGANIZATION_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
          <label className="text-xs font-semibold">Kode induk (kosong = tingkat teratas)<input list="organization-parent-codes" className={field} value={row.parentCode} onChange={e => edit(index,'parentCode',e.target.value)} /></label>
          <label className="text-xs font-semibold">Nama pimpinan<input className={field} value={row.headName} onChange={e => edit(index,'headName',e.target.value)} /></label>
          <label className="text-xs font-semibold">Email pimpinan<input type="email" className={field} value={row.headEmail} onChange={e => edit(index,'headEmail',e.target.value)} /></label>
          <label className="text-xs font-semibold sm:col-span-2">Bukti / halaman sumber<textarea className={field} value={row.source} onChange={e => edit(index,'source',e.target.value)} /></label>
          <button type="button" onClick={() => {setRows(rows.filter((_,i) => i !== index));setConfirmed(false);}} className="justify-self-start text-sm text-red-700 underline">Hapus dari draft</button>
        </div>)}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" />Saya sudah memeriksa seluruh unit dan hubungan induk terhadap dokumen sumber untuk {institutionName}. Simpan sebagai unit aktif dan referensi AI institusi; unit lama tidak ditimpa.</label>
        <button type="button" disabled={!confirmed || !rows.length} onClick={save} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Validasi & Simpan Struktur</button>
      </fieldset>}
    </div>}
  </section>;
}
