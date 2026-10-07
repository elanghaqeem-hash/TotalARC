'use client';

import { PdfCompressControl } from '@/components/documents/PdfCompressControl';

import { preparePdfText } from '@/lib/pdf-ocr-client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  FileSearch,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Upload,
  XCircle
} from 'lucide-react';

type Candidate = {
  recordType: 'Account' | 'Disclosure';
  itemCode: string;
  codeSource: 'DOCUMENT' | 'TOTAL_ARC_GENERATED';
  name: string;
  financialStatement?: string | null;
  documentAmount?: number | null;
  unitMultiplier?: number | null;
  balanceAmount?: number | null;
  currency?: string | null;
  sourceReference?: string | null;
  quantitativeSignificant: boolean;
  qualitativeSignificant: boolean;
  recommendedSignificant: boolean;
  pmRatio?: number | null;
  significanceBasis:
    | 'PM'
    | 'QUALITATIVE'
    | 'PM_AND_QUALITATIVE'
    | 'NOT_SIGNIFICANT'
    | 'REVIEW_REQUIRED';
  assertions?: string | null;
  riskFactors?: string | null;
  processReference?: string | null;
  owner?: string | null;
  rationale: string;
  confidence: 'High' | 'Medium' | 'Low';
  qualitativeFactors?: string[];
};

type Analysis = {
  id: string;
  fileName: string;
  status: string;
  performanceMaterialityAmount: number;
  currency: string;
  createdAt: string;
  aiProvider?: string | null;
  result: {
    documentTitle?: string | null;
    reportingPeriod?: string | null;
    sourceSummary?: string | null;
    gaps?: string[];
    candidates: Candidate[];
    analysisMode?: 'INITIAL' | 'COMPLEMENT' | 'REPLACE';
    baseAnalysisId?: string | null;
    sourceFiles?: string[];
  };
};

type Scope = {
  id: string;
  scopeName: string;
  fiscalYear: number;
  reportingPeriod: string;
  currency: string;
  performanceMaterialityAmount: number;
  overallMaterialityAmount: number;
  status: string;
};

const MAX_BYTES = 40 * 1024 * 1024;

function formatAmount(value: number | null | undefined, currency = '') {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Nilai belum terbaca';
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 2
  }).format(value) + (currency ? ' ' + currency : '');
}

function statusTone(status: string) {
  if (status === 'APPLIED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'REJECTED') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function basisLabel(candidate: Candidate) {
  if (candidate.significanceBasis === 'PM_AND_QUALITATIVE') return '≥ PM + Kualitatif';
  if (candidate.significanceBasis === 'PM') return '≥ PM';
  if (candidate.significanceBasis === 'QUALITATIVE') return 'Kualitatif';
  if (candidate.significanceBasis === 'REVIEW_REQUIRED') return 'Perlu Review';
  return '< PM';
}

export function SignificantAccountAI({ onApplied }: { onApplied?: () => void | Promise<void> }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [scope, setScope] = useState<Scope | null>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [active, setActive] = useState<Analysis | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState('');
  const [forceOcr, setForceOcr] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<'INITIAL' | 'COMPLEMENT' | 'REPLACE'>('INITIAL');
  const [baseAnalysisId, setBaseAnalysisId] = useState('');
  const [applying, setApplying] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/icofr/financial-items/ai-scoping', {
        cache: 'no-store'
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Gagal memuat alat analisis akun signifikan.');
      const nextAnalyses = Array.isArray(payload.analyses) ? payload.analyses : [];
      setScope(payload.scope || null);
      setAnalyses(nextAnalyses);
      const latestUsable =
        nextAnalyses.find((item: Analysis) => item.status !== 'REJECTED') || null;
      setBaseAnalysisId(current =>
        current && nextAnalyses.some((item: Analysis) => item.id === current)
          ? current
          : latestUsable?.id || ''
      );
      setAnalysisMode(current => {
        if (!latestUsable) return 'INITIAL';
        return current === 'INITIAL' ? 'COMPLEMENT' : current;
      });
      setActive(current => {
        if (current && nextAnalyses.some((item: Analysis) => item.id === current.id)) return current;
        return nextAnalyses.find((item: Analysis) => item.status === 'PENDING_USER_VALIDATION') || latestUsable;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat alat analisis akun signifikan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!active) {
      setSelectedCodes([]);
      return;
    }
    setSelectedCodes(
      (active.result?.candidates || [])
        .filter(candidate => candidate.recommendedSignificant)
        .map(candidate => candidate.itemCode)
    );
  }, [active?.id]);

  const candidates = active?.result?.candidates || [];
  const recommendedCount = useMemo(
    () => candidates.filter(candidate => candidate.recommendedSignificant).length,
    [candidates]
  );
  const quantitativeCount = useMemo(
    () => candidates.filter(candidate => candidate.quantitativeSignificant).length,
    [candidates]
  );
  const qualitativeCount = useMemo(
    () =>
      candidates.filter(
        candidate => candidate.qualitativeSignificant && !candidate.quantitativeSignificant
      ).length,
    [candidates]
  );
  const hasUsableAnalysis = analyses.some(item => item.status !== 'REJECTED');

  const analyze = async () => {
    if (!file || !scope || analyzing || compressing) return;
    if (file.size > MAX_BYTES) {
      setError('Ukuran dokumen melebihi batas 40 MB.');
      return;
    }

    setAnalyzing(true);
    setError('');
    setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      const pdfText = await preparePdfText(file, forceOcr, setOcrProgress);
      if (pdfText) form.append('pdfText', JSON.stringify(pdfText));
      setOcrProgress('Dokumen dibaca. Analisis AI sedang berlangsung…');
      form.append('analysisMode', hasUsableAnalysis ? analysisMode : 'INITIAL');
      if (hasUsableAnalysis && analysisMode === 'COMPLEMENT' && baseAnalysisId) {
        form.append('baseAnalysisId', baseAnalysisId);
      }
      const response = await fetch('/api/icofr/financial-items/ai-scoping', {
        method: 'POST',
        body: form
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Analisis AI belum dapat diselesaikan.');
      setActive(payload.analysis as Analysis);
      setAnalyses(current => [
        payload.analysis,
        ...current.filter(item => item.id !== payload.analysis.id)
      ]);
      setBaseAnalysisId(String(payload.analysis?.id || ''));
      setAnalysisMode('COMPLEMENT');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setMessage(payload.message || 'Analisis selesai. Tinjau rekomendasi sebelum diterapkan.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analisis AI belum dapat diselesaikan.');
    } finally {
      setAnalyzing(false);
      setOcrProgress('');
    }
  };

  const chooseNextDocument = (
    mode: 'COMPLEMENT' | 'REPLACE',
    analysisId?: string
  ) => {
    setAnalysisMode(mode);
    setBaseAnalysisId(
      mode === 'COMPLEMENT'
        ? String(analysisId || active?.id || baseAnalysisId || '')
        : ''
    );
    setFile(null);
    setError('');
    setMessage(
      mode === 'COMPLEMENT'
        ? 'Pilih dokumen berikutnya. Hasilnya akan melengkapi analisis kumulatif yang dipilih.'
        : 'Pilih dokumen pengganti. Dokumen baru akan dianalisis sebagai sumber utama; riwayat lama tetap tersimpan.'
    );
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      window.setTimeout(() => fileInputRef.current?.click(), 0);
    }
  };

  const apply = async () => {
    if (!active || !selectedCodes.length || applying) return;
    setApplying(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/icofr/financial-items/ai-scoping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'APPLY',
          analysisId: active.id,
          selectedCodes
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Hasil analisis belum dapat diterapkan.');
      setMessage(payload.message || 'Akun signifikan terpilih telah diterapkan sebagai Draf.');
      setActive(current => (current ? { ...current, status: 'APPLIED' } : current));
      setAnalyses(current =>
        current.map(item => (item.id === active.id ? { ...item, status: 'APPLIED' } : item))
      );
      await onApplied?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hasil analisis belum dapat diterapkan.');
    } finally {
      setApplying(false);
    }
  };

  const reject = async () => {
    if (!active || rejecting) return;
    setRejecting(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/icofr/financial-items/ai-scoping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'REJECT',
          analysisId: active.id
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Draf analisis belum dapat ditolak.');
      setMessage(payload.message || 'Draf analisis ditolak.');
      setActive(current => (current ? { ...current, status: 'REJECTED' } : current));
      setAnalyses(current =>
        current.map(item => (item.id === active.id ? { ...item, status: 'REJECTED' } : item))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Draf analisis belum dapat ditolak.');
    } finally {
      setRejecting(false);
    }
  };

  const toggle = (code: string) => {
    setSelectedCodes(current =>
      current.includes(code) ? current.filter(item => item !== code) : [...current, code]
    );
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm">
      <div className="border-b border-sky-100 bg-gradient-to-r from-sky-50 via-white to-indigo-50 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-sky-700">
              <Sparkles className="h-4 w-4" />
              AI Penetapan Akun Signifikan
            </div>
            <h2 className="mt-1 text-lg font-black text-slate-950">
              Analisis laporan keuangan berdasarkan Performance Materiality
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              Unggah dan analisis dokumen satu per satu. Setelah satu dokumen selesai,
              dokumen berikutnya dapat <strong>melengkapi</strong> hasil kumulatif atau
              <strong> menggantikan</strong> dokumen sebelumnya. Perbandingan terhadap PM
              tetap dihitung oleh Total ARC dan hasil akhir harus divalidasi pengguna.
            </p>
          </div>

          {scope && (
            <div className="rounded-2xl border border-sky-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                Performance Materiality aktif
              </div>
              <div className="mt-1 text-base font-black text-sky-700">
                {formatAmount(scope.performanceMaterialityAmount, scope.currency)}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                {scope.scopeName} · FY {scope.fiscalYear}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {loading ? (
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Memuat nilai PM dan riwayat analisis…
          </div>
        ) : !scope ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-black">Performance Materiality belum tersedia.</div>
                <div className="mt-1">
                  Tetapkan PM terlebih dahulu agar Total ARC memiliki threshold kuantitatif
                  untuk menilai akun signifikan.
                </div>
                <Link
                  href="/icofr/scoping"
                  className="mt-3 inline-flex rounded-lg bg-amber-800 px-3 py-2 text-[10px] font-black text-white"
                >
                  Buka Ruang Lingkup & Materialitas
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/40 p-4">
            {hasUsableAnalysis && (
              <div className="mb-3 rounded-xl border border-sky-100 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black text-slate-800">Dokumen berikutnya</div>
                    <div className="mt-0.5 text-[9px] leading-4 text-slate-500">
                      Analisis dilakukan bertahap satu dokumen per eksekusi. Pilih perlakuan dokumen baru.
                    </div>
                  </div>
                  <span className="rounded-full bg-sky-50 px-2 py-1 text-[8px] font-black text-sky-700">
                    {analyses.filter(item => item.status !== 'REJECTED').length} DOKUMEN
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAnalysisMode('COMPLEMENT');
                      setBaseAnalysisId(String(active?.id || analyses.find(item => item.status !== 'REJECTED')?.id || ''));
                    }}
                    className={
                      'rounded-xl border p-2.5 text-left transition ' +
                      (analysisMode === 'COMPLEMENT'
                        ? 'border-sky-300 bg-sky-50 ring-1 ring-sky-200'
                        : 'border-slate-200 bg-white hover:bg-slate-50')
                    }
                  >
                    <div className="text-[10px] font-black text-slate-800">Lengkapi analisis sebelumnya</div>
                    <div className="mt-1 text-[9px] leading-4 text-slate-500">
                      Tambahkan akun/disclosure dari dokumen baru dan perbarui item yang sama jika ditemukan.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAnalysisMode('REPLACE');
                      setBaseAnalysisId('');
                    }}
                    className={
                      'rounded-xl border p-2.5 text-left transition ' +
                      (analysisMode === 'REPLACE'
                        ? 'border-amber-300 bg-amber-50 ring-1 ring-amber-200'
                        : 'border-slate-200 bg-white hover:bg-slate-50')
                    }
                  >
                    <div className="text-[10px] font-black text-slate-800">Ganti dengan dokumen baru</div>
                    <div className="mt-1 text-[9px] leading-4 text-slate-500">
                      Gunakan dokumen baru sebagai sumber utama tanpa membawa hasil sebelumnya.
                    </div>
                  </button>
                </div>
              </div>
            )}
            <PdfCompressControl file={file} disabled={analyzing} onChange={setFile} onBusyChange={setCompressing} />
        {file && /\.pdf$/i.test(file.name) && (
              <div className="my-2 text-xs text-slate-600">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={forceOcr} disabled={analyzing} onChange={event => setForceOcr(event.target.checked)} />
                  PDF hasil scan / campuran: gunakan OCR pada seluruh halaman
                </label>
                <p>OCR otomatis untuk halaman tanpa teks. Bahasa Indonesia dan Inggris didukung. Periksa kembali angka dan hasil bacanya.</p>
              </div>
            )}
            {analyzing && <p role="status" aria-live="polite" className="my-2 text-xs text-sky-700">{ocrProgress}</p>}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-12 flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-left transition hover:border-sky-300"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                  <Upload className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-black text-slate-800">
                    {file ? file.name : 'Pilih dokumen laporan keuangan'}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-slate-400">
                    PDF, XLSX, DOCX, TXT, JPG/PNG · maksimum 40 MB · 1 dokumen per analisis
                  </span>
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                  disabled={compressing}
                className="hidden"
                accept=".pdf,.xlsx,.docx,.txt,.jpg,.jpeg,.png"
                onChange={event => setFile(event.target.files?.[0] || null)}
              />
              <button
                type="button"
                disabled={!file || analyzing || compressing}
                onClick={() => void analyze()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-sky-500 px-5 text-xs font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {analyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSearch className="h-4 w-4" />
                )}
                {analyzing
                  ? 'Menganalisis…'
                  : hasUsableAnalysis && analysisMode === 'COMPLEMENT'
                    ? 'Analisis & Lengkapi'
                    : hasUsableAnalysis && analysisMode === 'REPLACE'
                      ? 'Analisis & Ganti'
                      : 'Analisis dengan AI'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {message && (
          <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            {message}
          </div>
        )}

        {active && (
          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-900">
                      {active.result?.documentTitle || active.fileName}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-black text-slate-600">
                      {active.result?.analysisMode === 'COMPLEMENT'
                        ? 'KUMULATIF'
                        : active.result?.analysisMode === 'REPLACE'
                          ? 'PENGGANTI'
                          : 'DOKUMEN AWAL'}
                    </span>
                    <span
                      className={
                        'rounded-full border px-2 py-0.5 text-[9px] font-black ' +
                        statusTone(active.status)
                      }
                    >
                      {active.status === 'PENDING_USER_VALIDATION'
                        ? 'MENUNGGU VALIDASI'
                        : active.status === 'APPLIED'
                          ? 'DITERAPKAN'
                          : 'DITOLAK'}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    {active.fileName}
                    {active.result?.reportingPeriod ? ' · ' + active.result.reportingPeriod : ''}
                    {active.aiProvider ? ' · AI ' + active.aiProvider : ''}
                    {active.result?.sourceFiles?.length
                      ? ' · ' + active.result.sourceFiles.length + ' dokumen sumber'
                      : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-[9px] font-black">
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                    Rekomendasi {recommendedCount}
                  </span>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700">
                    ≥ PM {quantitativeCount}
                  </span>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                    Kualitatif {qualitativeCount}
                  </span>
                </div>
              </div>

              {active.result?.sourceSummary && (
                <p className="mt-3 text-[11px] leading-5 text-slate-600">
                  {active.result.sourceSummary}
                </p>
              )}
              {active.result?.gaps?.length ? (
                <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                  <div className="text-[10px] font-black text-amber-800">Hal yang perlu divalidasi</div>
                  <div className="mt-1 text-[10px] leading-4 text-amber-700">
                    {active.result.gaps.slice(0, 4).join(' · ')}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-2 p-3 sm:p-4">
              {candidates.map(candidate => {
                const selected = selectedCodes.includes(candidate.itemCode);
                return (
                  <label
                    key={candidate.itemCode}
                    className={
                      'block cursor-pointer rounded-xl border p-3 transition ' +
                      (selected
                        ? 'border-sky-300 bg-sky-50/50'
                        : 'border-slate-200 bg-white hover:bg-slate-50')
                    }
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={active.status !== 'PENDING_USER_VALIDATION'}
                        onChange={() => toggle(candidate.itemCode)}
                        className="mt-1 h-4 w-4 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10px] font-black text-brand-700">
                            {candidate.itemCode}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">
                            {candidate.recordType === 'Account' ? 'Akun' : 'Disclosure'}
                          </span>
                          <span
                            className={
                              'rounded-full px-2 py-0.5 text-[9px] font-black ' +
                              (candidate.recommendedSignificant
                                ? 'bg-sky-100 text-sky-800'
                                : candidate.significanceBasis === 'REVIEW_REQUIRED'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-500')
                            }
                          >
                            {basisLabel(candidate)}
                          </span>
                          {candidate.codeSource === 'TOTAL_ARC_GENERATED' && (
                            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-bold text-violet-700">
                              Kode Total ARC
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-sm font-black text-slate-900">
                          {candidate.name}
                        </div>

                        <div className="mt-2 grid grid-cols-1 gap-2 text-[10px] sm:grid-cols-3">
                          <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                            <div className="font-bold text-slate-400">Nilai normalisasi</div>
                            <div className="mt-0.5 font-black text-slate-700">
                              {formatAmount(
                                candidate.balanceAmount,
                                candidate.currency || active.currency
                              )}
                            </div>
                          </div>
                          <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                            <div className="font-bold text-slate-400">Rasio terhadap PM</div>
                            <div className="mt-0.5 font-black text-slate-700">
                              {candidate.pmRatio === null || candidate.pmRatio === undefined
                                ? 'Perlu validasi'
                                : candidate.pmRatio.toFixed(2) + '× PM'}
                            </div>
                          </div>
                          <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                            <div className="font-bold text-slate-400">Referensi sumber</div>
                            <div className="mt-0.5 line-clamp-2 font-black text-slate-700">
                              {candidate.sourceReference || 'Belum tersedia'}
                            </div>
                          </div>
                        </div>

                        <p className="mt-2 text-[10px] leading-4 text-slate-600">
                          {candidate.rationale}
                        </p>

                        {candidate.qualitativeFactors?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {candidate.qualitativeFactors.map(factor => (
                              <span
                                key={factor}
                                className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-700"
                              >
                                {factor}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-2 border-t border-slate-100 p-4 sm:grid-cols-2">
              <button
                type="button"
                disabled={analyzing}
                onClick={() => chooseNextDocument('COMPLEMENT', active.id)}
                className="min-h-10 rounded-xl border border-sky-200 bg-sky-50 px-4 text-[10px] font-black text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
              >
                + Tambah Dokumen untuk Melengkapi
              </button>
              <button
                type="button"
                disabled={analyzing}
                onClick={() => chooseNextDocument('REPLACE')}
                className="min-h-10 rounded-xl border border-amber-200 bg-amber-50 px-4 text-[10px] font-black text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
              >
                Ganti dengan Dokumen Baru
              </button>
            </div>

            {active.status === 'PENDING_USER_VALIDATION' && (
              <div className="flex flex-col gap-2 border-t border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-[10px] leading-4 text-slate-500">
                  {selectedCodes.length} kandidat dipilih. Hanya kandidat yang dipilih pengguna
                  akan ditetapkan sebagai akun signifikan berstatus <strong>Draf</strong>.
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={rejecting || applying}
                    onClick={() => void reject()}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 text-[10px] font-black text-rose-700 disabled:opacity-50"
                  >
                    {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    Tolak Draf
                  </button>
                  <button
                    type="button"
                    disabled={!selectedCodes.length || applying || rejecting}
                    onClick={() => void apply()}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-[10px] font-black text-white disabled:opacity-50"
                  >
                    {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                    {applying ? 'Menerapkan…' : 'Terapkan Akun Terpilih'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {analyses.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
              Riwayat Analisis
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {analyses.slice(0, 6).map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(item)}
                  className={
                    'rounded-xl border bg-white p-3 text-left transition ' +
                    (active?.id === item.id ? 'border-sky-300 ring-2 ring-sky-100' : 'border-slate-200')
                  }
                >
                  <div className="flex items-start gap-2">
                    <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                    <div className="min-w-0">
                      <div className="truncate text-[10px] font-black text-slate-800">{item.fileName}</div>
                      <div className="mt-1 text-[9px] text-slate-400">
                        {new Date(item.createdAt).toLocaleString('id-ID', {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })}
                      </div>
                      <div className="mt-1 text-[8px] font-black text-slate-500">
                        {item.result?.analysisMode === 'COMPLEMENT'
                          ? 'Melengkapi hasil sebelumnya'
                          : item.result?.analysisMode === 'REPLACE'
                            ? 'Mengganti hasil sebelumnya'
                            : 'Dokumen awal'}
                      </div>
                      <span
                        className={
                          'mt-2 inline-flex rounded-full border px-2 py-0.5 text-[8px] font-black ' +
                          statusTone(item.status)
                        }
                      >
                        {item.status === 'PENDING_USER_VALIDATION'
                          ? 'MENUNGGU VALIDASI'
                          : item.status === 'APPLIED'
                            ? 'DITERAPKAN'
                            : 'DITOLAK'}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
