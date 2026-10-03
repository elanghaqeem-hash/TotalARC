'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Arsipkan,
  CheckCircle2,
  Download,
  FileArsipkan,
  FileCheck,
  FilePlus2,
  Fingerprint,
  Link2,
  RefreshCw,
  Save,
  Trash2,
  Upload
} from 'lucide-react';

const emptyUpload = {
  documentId: '',
  title: '',
  description: '',
  category: 'ICOFR Testing Evidence',
  sensitivity: 'Confidential',
  retentionClass: '7 Years',
  retentionUntil: '',
  legalHold: false,
  ownerName: '',
  sourceSystem: '',
  uploadedBy: '',
  versionNote: '',
  entityType: '',
  entityId: '',
  relationship: 'SUPPORTS',
  linkNotes: '',
  syncWorkpaperIndex: false,
  workpaperEvidenceType: '',
  workpaperEvidenceOwner: ''
};

const emptyGovernance = {
  documentId: '',
  title: '',
  description: '',
  category: '',
  sensitivity: 'Confidential',
  retentionClass: '7 Years',
  retentionUntil: '',
  legalHold: false,
  ownerName: '',
  sourceSystem: ''
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return (value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1) + ' ' + units[index];
}

function tone(value: string) {
  if (['Active', 'Accepted', 'Verified', 'Internal'].includes(value)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (['Restricted', 'Arsipkand'].includes(value)) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  if (['Confidential', 'Pending'].includes(value)) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

const STATUS_LABEL_ID: Record<string, string> = {
  Active: 'Aktif',
  Arsipkand: 'Diarsipkan',
  Accepted: 'Diterima',
  Verified: 'Terverifikasi',
  Pending: 'Menunggu'
};

const SENSITIVITY_LABEL_ID: Record<string, string> = {
  Public: 'Publik',
  Internal: 'Internal',
  Confidential: 'Rahasia',
  Restricted: 'Terbatas'
};

const ENTITY_TYPE_LABEL_ID: Record<string, string> = {
  WORKPAPER_REVIEW: 'Reviu Kertas Kerja',
  WORKPAPER_EVIDENCE: 'Indeks Bukti Kertas Kerja',
  TOD: 'Test of Design (ToD)',
  TOE: 'Test of Effectiveness (ToE)',
  TOE_SAMPLE: 'Sampel ToE',
  SAMPLING_PLAN: 'Rencana Sampling',
  PBC_REQUEST: 'Permintaan PBC',
  SUB_CERTIFICATION: 'Sub-Sertifikasi',
  ATTESTATION: 'Atestasi Manajemen',
  EVIDENCE_PACK: 'Paket Bukti',
  DEFICIENCY: 'Defisiensi Pengendalian',
  MAP: 'Management Action Plan (MAP)',
  CONTROL: 'Pengendalian',
  RISK: 'Risiko',
  PROCESS: 'Proses Bisnis',
  SCOPE: 'Scope ICOFR',
  TESTING_PLAN_ITEM: 'Item Rencana Pengujian'
};

function statusLabel(value: string) {
  return STATUS_LABEL_ID[value] || value;
}

function sensitivityLabel(value: string) {
  return SENSITIVITY_LABEL_ID[value] || value;
}

function retentionLabel(value: string) {
  if (value === 'Custom') return 'Kustom';
  if (value === 'Permanent') return 'Permanen';
  const years = value.match(/^(\d+) Years?$/);
  if (years) return years[1] + ' Tahun';
  const months = value.match(/^(\d+) Months?$/);
  if (months) return months[1] + ' Bulan';
  return value;
}

function entityTypeLabel(value: string) {
  return ENTITY_TYPE_LABEL_ID[value] || value;
}

function relationshipLabel(value: string) {
  if (value === 'SUPPORTS') return 'Mendukung';
  if (value === 'BACKS_INDEX_ITEM') return 'Mendukung Item Indeks';
  return value;
}

export default function EvidenceRepositoryPage() {
  const [data, setData] = useState<any>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [uploadForm, setUploadForm] = useState(emptyUpload);
  const [governanceForm, setGovernanceForm] = useState(emptyGovernance);
  const [linkForm, setLinkForm] = useState({
    entityType: '',
    entityId: '',
    relationship: 'SUPPORTS',
    notes: '',
    syncWorkpaperIndex: false,
    evidenceType: '',
    evidenceOwner: ''
  });
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [verification, setVerification] = useState<any>(null);
  const [filter, setFilter] = useState('Active');

  const load = async (force = false) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/evidence', {
        cache: force ? 'no-store' : 'default'
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Repositori bukti tidak tersedia.');
      setData(body);

      const currentId =
        selectedDocumentId && body.documents?.some((item: any) => item.id === selectedDocumentId)
          ? selectedDocumentId
          : body.documents?.[0]?.id || '';
      setSelectedDocumentId(currentId);

      if (currentId) {
        const current = body.documents.find((item: any) => item.id === currentId);
        if (current) {
          setGovernanceForm({
            documentId: current.id,
            title: current.title || '',
            description: current.description || '',
            category: current.category || '',
            sensitivity: current.sensitivity || 'Confidential',
            retentionClass: current.retentionClass || '7 Years',
            retentionUntil: current.retentionUntil || '',
            legalHold: Boolean(current.legalHold),
            ownerName: current.ownerName || '',
            sourceSystem: current.sourceSystem || ''
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Repositori bukti tidak tersedia.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectedDocument = useMemo(
    () => data?.documents?.find((item: any) => item.id === selectedDocumentId) || null,
    [data, selectedDocumentId]
  );

  const filteredDocuments = useMemo(() => {
    return (data?.documents || []).filter((item: any) => {
      if (filter === 'All') return true;
      if (filter === 'Legal Hold') return Boolean(item.legalHold);
      return item.status === filter;
    });
  }, [data, filter]);

  const uploadTargets = useMemo(
    () =>
      (data?.linkTargets || []).filter(
        (item: any) => !uploadForm.entityType || item.entityType === uploadForm.entityType
      ),
    [data, uploadForm.entityType]
  );

  const linkTargets = useMemo(
    () =>
      (data?.linkTargets || []).filter(
        (item: any) => !linkForm.entityType || item.entityType === linkForm.entityType
      ),
    [data, linkForm.entityType]
  );

  const post = async (payload: any, success: string) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Tindakan pada bukti gagal.');
      setMessage(success);
      await load(true);
      return body;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tindakan pada bukti gagal.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError('Pilih file bukti yang valid sebelum mengunggah.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const form = new FormData();
      Object.entries(uploadForm).forEach(([key, value]) => {
        form.append(key, typeof value === 'boolean' ? String(value) : String(value || ''));
      });
      form.append('file', file);

      const response = await fetch('/api/evidence/upload', {
        method: 'POST',
        body: form
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unggah bukti gagal.');

      setSelectedDocumentId(body.documentId);
      setMessage(
        body.linkWarning
          ? `Bukti disimpan sebagai ${body.evidenceId} v${body.versionNo}. File aman di repositori, tetapi pengaitan ke target memerlukan perhatian: ${body.linkWarning}`
          : `Bukti disimpan sebagai ${body.evidenceId} v${body.versionNo}; SHA-256 ${body.sha256.slice(0, 16)}…`
      );
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setUploadForm(current => ({
        ...emptyUpload,
        documentId: current.documentId ? body.documentId : '',
        title: current.documentId ? current.title : '',
        description: current.documentId ? current.description : '',
        category: current.documentId ? current.category : 'ICOFR Testing Evidence',
        sensitivity: current.documentId ? current.sensitivity : 'Confidential',
        retentionClass: current.documentId ? current.retentionClass : '7 Years',
        ownerName: current.documentId ? current.ownerName : '',
        sourceSystem: current.documentId ? current.sourceSystem : ''
      }));
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unggah bukti gagal.');
    } finally {
      setSaving(false);
    }
  };

  const openDocument = (item: any) => {
    setSelectedDocumentId(item.id);
    setGovernanceForm({
      documentId: item.id,
      title: item.title || '',
      description: item.description || '',
      category: item.category || '',
      sensitivity: item.sensitivity || 'Confidential',
      retentionClass: item.retentionClass || '7 Years',
      retentionUntil: item.retentionUntil || '',
      legalHold: Boolean(item.legalHold),
      ownerName: item.ownerName || '',
      sourceSystem: item.sourceSystem || ''
    });
    setLinkForm({
      entityType: '',
      entityId: '',
      relationship: 'SUPPORTS',
      notes: '',
      syncWorkpaperIndex: false,
      evidenceType: '',
      evidenceOwner: item.ownerName || ''
    });
    setVerification(null);
  };

  const startNewVersion = (item: any) => {
    setUploadForm({
      ...emptyUpload,
      documentId: item.id,
      title: item.title || '',
      description: item.description || '',
      category: item.category || 'ICOFR Testing Evidence',
      sensitivity: item.sensitivity || 'Confidential',
      retentionClass: item.retentionClass || '7 Years',
      retentionUntil: item.retentionUntil || '',
      legalHold: Boolean(item.legalHold),
      ownerName: item.ownerName || '',
      sourceSystem: item.sourceSystem || '',
      uploadedBy: '',
      versionNote: ''
    });
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    document.getElementById('evidence-upload')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-cyan-700">
              <FileArsipkan className="h-4 w-4" /> Repositori Bukti Terpusat
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">
              File Bukti, Kontrol Versi, Integritas SHA-256 & Retensi
            </h1>
            <p className="mt-1 max-w-5xl text-xs leading-5 text-slate-500">
              Simpan file bukti aktual, kelola riwayat versi yang tidak dapat diubah, kaitkan versi bukti ke catatan assurance,
              verifikasi integritas dokumen sebelum digunakan atau diunduh, serta kelola sensitivitas, retensi, dan legal hold.
              SHA-256 digunakan sebagai sidik jari digital untuk memastikan file tetap identik dengan versi yang tersimpan.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat Ulang
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold">
          <Link href="/icofr/sampling-evidence" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Sampling & Bukti</Link>
          <Link href="/icofr/workpaper-review" className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-violet-700">Reviu Kertas Kerja</Link>
          <Link href="/tod" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">ToD</Link>
          <Link href="/toe" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">ToE</Link>
          <Link href="/certification" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Sertifikasi</Link>
          <Link href="/icofr/reporting" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">PBC / Reliance Audit</Link>
        </div>
      </section>

      {error && (
        <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {message && (
        <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {message}
        </div>
      )}

      {!loading && data?.security?.authenticatedIdentityAvailable === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-800">
          <strong>Status kontrol identitas:</strong> versi repositori, pembatasan per institusi, integritas SHA-256, metadata audit,
          retensi dan legal hold aktif. Pemilih peran Total ARC saat ini bukan mekanisme autentikasi, sehingga modul ini tidak
          menyajikan label peran sebagai kontrol akses yang otoritatif. RBAC berbasis identitas harus diterapkan sebelum otorisasi
          unduhan data produksi sensitif dapat dinyatakan memadai.
        </div>
      )}

      {!loading && !data?.institution ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">
          Daftarkan institusi sebelum menyimpan bukti.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {[
              ['Dokumen', data?.metrics?.documents || 0],
              ['Aktif', data?.metrics?.active || 0],
              ['Versi', data?.metrics?.versions || 0],
              ['Tertaut', data?.metrics?.linkedDocuments || 0],
              ['Legal hold', data?.metrics?.legalHold || 0],
              ['Jatuh Tempo Retensi', data?.metrics?.retentionDue || 0],
              ['Diarsipkan', data?.metrics?.archived || 0],
              ['Ukuran Tersimpan', formatBytes(Number(data?.metrics?.totalBytes || 0))]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-[8px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                <div className="mt-1 text-lg font-black text-slate-900">{value}</div>
              </div>
            ))}
          </section>

          <form
            id="evidence-upload"
            onSubmit={upload}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">
                    {uploadForm.documentId ? 'Unggah Versi Baru' : '1. Daftarkan & Unggah Bukti'}
                  </h2>
                  <p className="text-[10px] text-slate-500">
                    File asli disimpan; versi aktif yang duplikat diblokir berdasarkan SHA-256.
                  </p>
                </div>
              </div>
              {uploadForm.documentId && (
                <button
                  type="button"
                  onClick={() => {
                    setUploadForm(emptyUpload);
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                  className="text-[10px] font-bold text-slate-500"
                >
                  Beralih ke dokumen baru
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs font-bold text-slate-700 xl:col-span-2">
                Judul bukti *
                <input required value={uploadForm.title} onChange={e => setUploadForm({ ...uploadForm, title: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Kategori *
                <input required value={uploadForm.category} onChange={e => setUploadForm({ ...uploadForm, category: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Sensitivitas *
                <select value={uploadForm.sensitivity} onChange={e => setUploadForm({ ...uploadForm, sensitivity: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  {(data?.sensitivities || []).map((item: string) => <option key={item} value={item}>{sensitivityLabel(item)}</option>)}
                </select>
              </label>

              <label className="text-xs font-bold text-slate-700 md:col-span-2 xl:col-span-4">
                Deskripsi
                <textarea rows={2} value={uploadForm.description} onChange={e => setUploadForm({ ...uploadForm, description: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Pemilik bukti *
                <input required value={uploadForm.ownerName} onChange={e => setUploadForm({ ...uploadForm, ownerName: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Sistem sumber / repositori
                <input value={uploadForm.sourceSystem} onChange={e => setUploadForm({ ...uploadForm, sourceSystem: e.target.value })} placeholder="ERP / Core Banking / GRC / folder bersama" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Kelas retensi *
                <select value={uploadForm.retentionClass} onChange={e => setUploadForm({ ...uploadForm, retentionClass: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  {(data?.retentionClasses || []).map((item: string) => <option key={item} value={item}>{retentionLabel(item)}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">
                Retensi sampai {uploadForm.retentionClass === 'Custom' ? '*' : ''}
                <input type="date" required={uploadForm.retentionClass === 'Custom'} value={uploadForm.retentionUntil} onChange={e => setUploadForm({ ...uploadForm, retentionUntil: e.target.value })} disabled={uploadForm.retentionClass !== 'Custom'} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50" />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Diunggah oleh *
                <input required value={uploadForm.uploadedBy} onChange={e => setUploadForm({ ...uploadForm, uploadedBy: e.target.value })} placeholder="Nama pengunggah sebenarnya" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-xs font-bold text-slate-700 xl:col-span-2">
                Catatan versi {uploadForm.documentId ? '*' : ''}
                <input required={Boolean(uploadForm.documentId)} value={uploadForm.versionNote} onChange={e => setUploadForm({ ...uploadForm, versionNote: e.target.value })} placeholder={uploadForm.documentId ? 'Apa yang berubah dan alasannya' : 'Opsional untuk versi 1'} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 p-3 text-xs font-bold text-slate-700">
                <input type="checkbox" checked={uploadForm.legalHold} onChange={e => setUploadForm({ ...uploadForm, legalHold: e.target.checked })} />
                Legal hold
              </label>

              <label className="text-xs font-bold text-slate-700 md:col-span-2 xl:col-span-4">
                File bukti * · maks. {formatBytes(Number(data?.limits?.maxFileBytes || 0))}
                <input
                  ref={fileRef}
                  type="file"
                  required
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.json,.docx,.xlsx,.pptx"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-normal"
                />
                <span className="mt-1 block text-[9px] font-normal text-slate-400">
                  Diizinkan: {(data?.limits?.allowedExtensions || []).join(', ')}. Format ber-macro/dapat dieksekusi ditolak demi keamanan.
                </span>
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Tautan assurance opsional saat unggah</div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs font-bold text-slate-700">
                  Jenis target
                  <select
                    value={uploadForm.entityType}
                    onChange={e => setUploadForm({ ...uploadForm, entityType: e.target.value, entityId: '' })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"
                  >
                    <option value="">Belum ditautkan</option>
                    {Array.from(new Set((data?.linkTargets || []).map((item: any) => item.entityType))).map((item: any) => <option key={String(item)} value={String(item)}>{entityTypeLabel(String(item))}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700 xl:col-span-2">
                  Catatan target
                  <select value={uploadForm.entityId} disabled={!uploadForm.entityType} onChange={e => setUploadForm({ ...uploadForm, entityId: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal disabled:bg-slate-100">
                    <option value="">Pilih target</option>
                    {uploadTargets.map((item: any) => <option key={item.entityType + item.entityId} value={item.entityId}>{item.label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Hubungan
                  <select value={uploadForm.relationship} onChange={e => setUploadForm({ ...uploadForm, relationship: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal">
                    <option value="SUPPORTS">{relationshipLabel('SUPPORTS')}</option>
                  </select>
                </label>
                {uploadForm.entityType === 'WORKPAPER_REVIEW' && (
                  <>
                    <label className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-[10px] font-bold text-violet-700">
                      <input type="checkbox" checked={uploadForm.syncWorkpaperIndex} onChange={e => setUploadForm({ ...uploadForm, syncWorkpaperIndex: e.target.checked })} />
                      Juga buat item indeks bukti kertas kerja
                    </label>
                    {uploadForm.syncWorkpaperIndex && (
                      <>
                        <label className="text-xs font-bold text-slate-700">
                          Jenis bukti kertas kerja *
                          <input value={uploadForm.workpaperEvidenceType} onChange={e => setUploadForm({ ...uploadForm, workpaperEvidenceType: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal" />
                        </label>
                        <label className="text-xs font-bold text-slate-700">
                          Pemilik bukti *
                          <input value={uploadForm.workpaperEvidenceOwner || uploadForm.ownerName} onChange={e => setUploadForm({ ...uploadForm, workpaperEvidenceOwner: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal" />
                        </label>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button disabled={saving || !file} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-black text-white disabled:opacity-40">
                <FilePlus2 className="h-4 w-4" /> {saving ? 'Menyimpan…' : uploadForm.documentId ? 'Simpan Versi Baru' : 'Simpan Bukti'}
              </button>
            </div>
          </form>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.85fr_1.15fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-black text-slate-900">Register Bukti</h2>
                  <p className="mt-1 text-[10px] text-slate-500">Dokumen per institusi beserta versi aktifnya.</p>
                </div>
                <select value={filter} onChange={e => setFilter(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px]">
                  <option>Active</option>
                  <option>Arsipkand</option>
                  <option>Legal Hold</option>
                  <option>All</option>
                </select>
              </div>

              <div className="mt-4 space-y-2">
                {filteredDocuments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                    Tidak ada dokumen bukti untuk filter ini.
                  </div>
                ) : (
                  filteredDocuments.map((item: any) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openDocument(item)}
                      className={`w-full rounded-xl border p-3 text-left ${selectedDocumentId === item.id ? 'border-cyan-300 bg-cyan-50/40' : 'border-slate-200'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-mono text-[10px] font-black text-cyan-700">{item.evidenceId}</div>
                          <div className="truncate text-xs font-black text-slate-900">{item.title}</div>
                          <div className="mt-1 text-[9px] text-slate-500">
                            v{item.currentVersion?.versionNo || '—'} · {item.currentVersion ? formatBytes(Number(item.currentVersion.sizeBytes || 0)) : 'Tidak ada file'} · {item.ownerName}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${tone(item.status)}`}>{statusLabel(item.status)}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${tone(item.sensitivity)}`}>{sensitivityLabel(item.sensitivity)}</span>
                          {item.legalHold && <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[9px] font-bold text-rose-700">LEGAL HOLD</span>}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>

            {selectedDocument ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-mono text-[10px] font-black text-cyan-700">{selectedDocument.evidenceId}</div>
                    <h2 className="text-lg font-black text-slate-900">{selectedDocument.title}</h2>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${tone(selectedDocument.status)}`}>{statusLabel(selectedDocument.status)}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${tone(selectedDocument.sensitivity)}`}>{sensitivityLabel(selectedDocument.sensitivity)}</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-600">{retentionLabel(selectedDocument.retentionClass)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedDocument.status === 'Active' && (
                      <button type="button" onClick={() => startNewVersion(selectedDocument)} className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-[10px] font-bold text-brand-700">
                        <Upload className="h-3.5 w-3.5" /> Versi baru
                      </button>
                    )}
                    {selectedDocument.status === 'Active' && !selectedDocument.legalHold && (
                      <button
                        type="button"
                        onClick={() => {
                          const reason = window.prompt('Alasan pengarsipan yang terdokumentasi') || '';
                          if (reason) void post({ actionType: 'ARCHIVE', documentId: selectedDocument.id, reason }, 'Dokumen bukti telah diarsipkan. Seluruh versi file tetap dipertahankan.');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-[10px] font-bold text-rose-600"
                      >
                        <Arsipkan className="h-3.5 w-3.5" /> Arsipkan
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div>
                    <h3 className="text-xs font-black text-slate-800">Riwayat Versi</h3>
                    <div className="mt-2 space-y-2">
                      {(selectedDocument.versions || []).map((version: any) => (
                        <div key={version.id} className="rounded-xl border border-slate-200 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[11px] font-black text-slate-800">
                                v{version.versionNo} · {version.fileName}
                              </div>
                              <div className="mt-1 text-[9px] text-slate-500">
                                {formatBytes(Number(version.sizeBytes || 0))} · {version.mimeType} · diunggah oleh {version.uploadedBy}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-black ${
                                    verification?.versionId === version.id && verification?.matches
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                      : 'border-slate-200 bg-slate-50 text-slate-600'
                                  }`}
                                >
                                  {verification?.versionId === version.id && verification?.matches
                                    ? '✓ Integritas SHA-256: Terverifikasi'
                                    : 'Integritas SHA-256: Belum diverifikasi'}
                                </span>
                                <details className="group">
                                  <summary className="cursor-pointer text-[9px] font-bold text-cyan-700">
                                    Detail teknis
                                  </summary>
                                  <div className="mt-1 max-w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-[8px] text-slate-500">
                                    <div className="font-bold text-slate-600">SHA-256 tersimpan</div>
                                    <div className="mt-1 break-all font-mono">{version.sha256}</div>
                                    {verification?.versionId === version.id && verification?.actualSha256 && (
                                      <>
                                        <div className="mt-2 font-bold text-slate-600">SHA-256 hasil verifikasi</div>
                                        <div className="mt-1 break-all font-mono">{verification.actualSha256}</div>
                                      </>
                                    )}
                                  </div>
                                </details>
                              </div>
                              {version.versionNote && <div className="mt-1 text-[9px] text-slate-600">Catatan perubahan: {version.versionNote}</div>}
                            </div>
                            {version.isCurrent && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[8px] font-black text-emerald-700">VERSI AKTIF</span>}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <a href={`/api/evidence/download?versionId=${encodeURIComponent(version.id)}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[9px] font-bold text-slate-600">
                              <Download className="h-3 w-3" /> Download
                            </a>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={async () => {
                                const result = await post({ actionType: 'VERIFY', versionId: version.id }, resultMessage(version));
                                if (result) setVerification(result);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 px-2.5 py-1.5 text-[9px] font-bold text-cyan-700"
                            >
                              <Fingerprint className="h-3 w-3" /> Verifikasi Integritas
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {verification && verification.documentId === selectedDocument.id && (
                      <div className={`mt-3 rounded-xl border p-3 text-[10px] ${verification.matches ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                        <strong>{verification.matches ? '✓ Integritas dokumen terverifikasi.' : '⚠ Integritas dokumen tidak cocok.'}</strong>
                        <div className="mt-1 text-[9px]">
                          {verification.matches
                            ? 'File saat ini identik dengan fingerprint SHA-256 yang tersimpan.'
                            : 'Fingerprint file saat ini berbeda dari fingerprint yang tersimpan.'}
                        </div>
                        <details className="mt-2">
                          <summary className="cursor-pointer font-bold">Detail teknis SHA-256</summary>
                          <div className="mt-1 break-all font-mono text-[8px]">Aktual: {verification.actualSha256}</div>
                          {verification.expectedSha256 && (
                            <div className="mt-1 break-all font-mono text-[8px]">Tersimpan: {verification.expectedSha256}</div>
                          )}
                        </details>
                      </div>
                    )}
                  </div>

                  <form
                    onSubmit={event => {
                      event.preventDefault();
                      void post({ actionType: 'UPDATE_GOVERNANCE', ...governanceForm }, 'Metadata tata kelola bukti diperbarui.');
                    }}
                  >
                    <h3 className="text-xs font-black text-slate-800">Metadata Tata Kelola</h3>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="text-[10px] font-bold text-slate-700 sm:col-span-2">Judul<input required value={governanceForm.title} onChange={e => setGovernanceForm({ ...governanceForm, title: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal" /></label>
                      <label className="text-[10px] font-bold text-slate-700 sm:col-span-2">Deskripsi<textarea rows={2} value={governanceForm.description} onChange={e => setGovernanceForm({ ...governanceForm, description: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal" /></label>
                      <label className="text-[10px] font-bold text-slate-700">Kategori<input required value={governanceForm.category} onChange={e => setGovernanceForm({ ...governanceForm, category: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal" /></label>
                      <label className="text-[10px] font-bold text-slate-700">Pemilik<input required value={governanceForm.ownerName} onChange={e => setGovernanceForm({ ...governanceForm, ownerName: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal" /></label>
                      <label className="text-[10px] font-bold text-slate-700">Sensitivitas<select value={governanceForm.sensitivity} onChange={e => setGovernanceForm({ ...governanceForm, sensitivity: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal">{(data?.sensitivities || []).map((item: string) => <option key={item} value={item}>{sensitivityLabel(item)}</option>)}</select></label>
                      <label className="text-[10px] font-bold text-slate-700">Retensi<select value={governanceForm.retentionClass} onChange={e => setGovernanceForm({ ...governanceForm, retentionClass: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal">{(data?.retentionClasses || []).map((item: string) => <option key={item} value={item}>{retentionLabel(item)}</option>)}</select></label>
                      <label className="text-[10px] font-bold text-slate-700">Retensi sampai<input type="date" disabled={governanceForm.retentionClass !== 'Custom'} value={governanceForm.retentionUntil} onChange={e => setGovernanceForm({ ...governanceForm, retentionUntil: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal disabled:bg-slate-50" /></label>
                      <label className="text-[10px] font-bold text-slate-700">Sistem sumber<input value={governanceForm.sourceSystem} onChange={e => setGovernanceForm({ ...governanceForm, sourceSystem: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal" /></label>
                      <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-[10px] font-bold text-slate-700 sm:col-span-2">
                        <input type="checkbox" checked={governanceForm.legalHold} onChange={e => setGovernanceForm({ ...governanceForm, legalHold: e.target.checked })} />
                        Legal hold — mencegah proses pengarsipan
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40">
                        <Save className="h-3.5 w-3.5" /> Simpan tata kelola
                      </button>
                    </div>
                  </form>
                </div>
              </section>
            ) : (
              <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">
                Unggah atau pilih dokumen bukti.
              </section>
            )}
          </div>

          {selectedDocument && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-violet-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">Tautan Ketertelusuran Assurance</h2>
                  <p className="text-[10px] text-slate-500">
                    Tautan dikunci ke versi tertentu agar revisi dokumen berikutnya tidak mengubah bukti kertas kerja historis secara diam-diam.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <form
                  onSubmit={async event => {
                    event.preventDefault();
                    const result = await post(
                      {
                        actionType: 'LINK',
                        documentId: selectedDocument.id,
                        versionId: selectedDocument.currentVersionId,
                        ...linkForm
                      },
                      'Versi bukti berhasil ditautkan ke catatan assurance.'
                    );
                    if (result) {
                      setLinkForm({
                        entityType: '',
                        entityId: '',
                        relationship: 'SUPPORTS',
                        notes: '',
                        syncWorkpaperIndex: false,
                        evidenceType: '',
                        evidenceOwner: selectedDocument.ownerName || ''
                      });
                    }
                  }}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                >
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Tambahkan tautan untuk versi aktif</div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700">
                      Jenis target *
                      <select required value={linkForm.entityType} onChange={e => setLinkForm({ ...linkForm, entityType: e.target.value, entityId: '' })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal">
                        <option value="">Pilih jenis</option>
                        {Array.from(new Set((data?.linkTargets || []).map((item: any) => item.entityType))).map((item: any) => <option key={String(item)} value={String(item)}>{entityTypeLabel(String(item))}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Hubungan *
                      <select required value={linkForm.relationship} onChange={e => setLinkForm({ ...linkForm, relationship: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal">
                         <option value="SUPPORTS">{relationshipLabel('SUPPORTS')}</option>
                       </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Catatan target *
                      <select required value={linkForm.entityId} disabled={!linkForm.entityType} onChange={e => setLinkForm({ ...linkForm, entityId: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal disabled:bg-slate-100">
                        <option value="">Pilih target</option>
                        {linkTargets.map((item: any) => <option key={item.entityType + item.entityId} value={item.entityId}>{item.label}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Catatan tautan
                      <textarea rows={2} value={linkForm.notes} onChange={e => setLinkForm({ ...linkForm, notes: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal" />
                    </label>
                    {linkForm.entityType === 'WORKPAPER_REVIEW' && (
                      <>
                        <label className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-[10px] font-bold text-violet-700 sm:col-span-2">
                          <input type="checkbox" checked={linkForm.syncWorkpaperIndex} onChange={e => setLinkForm({ ...linkForm, syncWorkpaperIndex: e.target.checked })} />
                          Buat item indeks bukti kertas kerja dari versi repositori ini
                        </label>
                        {linkForm.syncWorkpaperIndex && (
                          <>
                            <label className="text-xs font-bold text-slate-700">Jenis bukti *<input value={linkForm.evidenceType} onChange={e => setLinkForm({ ...linkForm, evidenceType: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal" /></label>
                            <label className="text-xs font-bold text-slate-700">Pemilik bukti *<input value={linkForm.evidenceOwner} onChange={e => setLinkForm({ ...linkForm, evidenceOwner: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal" /></label>
                          </>
                        )}
                      </>
                    )}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button disabled={saving || !linkForm.entityId} className="rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">
                      Tautkan bukti
                    </button>
                  </div>
                </form>

                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Tautan tersimpan</div>
                  <div className="mt-3 space-y-2">
                    {(selectedDocument.links || []).length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                        Bukti ini belum ditautkan ke catatan assurance.
                      </div>
                    ) : (
                      (selectedDocument.links || []).map((item: any) => {
                        const version = selectedDocument.versions?.find((v: any) => v.id === item.versionId);
                        const target = data?.linkTargets?.find((targetItem: any) => targetItem.entityType === item.entityType && targetItem.entityId === item.entityId);
                        return (
                          <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-[10px] font-black text-slate-800">
                                  {entityTypeLabel(item.entityType)} · {relationshipLabel(item.relationship)}
                                </div>
                                <div className="mt-1 text-[9px] text-slate-500">
                                  {target?.label || item.entityId} · dikunci ke v{version?.versionNo || '—'}
                                </div>
                                {item.notes && <div className="mt-1 text-[9px] text-slate-600">{item.notes}</div>}
                              </div>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => window.confirm('Hapus tautan ketertelusuran bukti ini? File dan versinya tetap dipertahankan.') && void post({ actionType: 'UNLINK', id: item.id }, 'Tautan bukti dihapus; dokumen dan versi tetap dipertahankan.')}
                                className="rounded-lg border border-rose-200 p-1.5 text-rose-600 disabled:opacity-40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

        </>
      )}
    </div>
  );
}

function resultMessage(version: any) {
  return `Verifikasi integritas selesai untuk ${version.fileName} v${version.versionNo}.`;
}
