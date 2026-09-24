'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  History,
  Loader2,
  Sparkles,
  X
} from 'lucide-react';

type Props = {
  processes: any[];
  onCreated: () => void | Promise<void>;
};

type Suggestion = {
  id: string;
  category: string;
  name: string;
  cause: string;
  event: string;
  impact: string;
  rationale: string;
  sourceActivityIds: string[];
  sourceActivityNames: string[];
  keyakinan: 'High' | 'Medium' | 'Low';
};

type Batch = {
  id: string;
  processId: string;
  processEnterpriseId: string;
  processName: string;
  analysisSummary: string;
  suggestions: Suggestion[];
  status: string;
  aiProvider?: string | null;
  aiModel?: string | null;
  appliedSuggestionIds: string[];
  createdAt: string;
  stale?: boolean;
};

const CATEGORY_ORDER = [
  'Operational',
  'Financial Reporting',
  'Compliance',
  'Technology',
  'Cybersecurity',
  'Strategic',
  'Fraud',
  'Third Party'
];

const CATEGORY_LABEL_ID: Record<string, string> = {
  Operational: 'Operasional',
  'Financial Reporting': 'Pelaporan Keuangan',
  Compliance: 'Kepatuhan',
  Technology: 'Teknologi',
  Cybersecurity: 'Keamanan Siber',
  Strategic: 'Strategis',
  Fraud: 'Fraud',
  'Third Party': 'Pihak Ketiga'
};

const CONFIDENCE_LABEL_ID: Record<string, string> = {
  High: 'Tinggi',
  Medium: 'Sedang',
  Low: 'Rendah'
};

function keyakinanTone(value: string) {
  if (value === 'High') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (value === 'Low') return 'border-slate-200 bg-slate-50 text-slate-500';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function categoryTone(value: string) {
  if (value === 'Cybersecurity' || value === 'Technology') {
    return 'border-violet-200 bg-violet-50 text-violet-700';
  }
  if (value === 'Compliance' || value === 'Fraud') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  if (value === 'Financial Reporting') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (value === 'Strategic') {
    return 'border-blue-200 bg-blue-50 text-blue-700';
  }
  if (value === 'Third Party') {
    return 'border-cyan-200 bg-cyan-50 text-cyan-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export function AiRiskRegisterGenerator({ processes, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [processId, setProcessId] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [batch, setBatch] = useState<Batch | null>(null);
  const [history, setHistory] = useState<Batch[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const selectedProcess = useMemo(
    () => processes.find(item => String(item.id) === processId) || null,
    [processes, processId]
  );

  const grouped = useMemo(() => {
    if (!batch) return [] as Array<[string, Suggestion[]]>;
    const map = new Map<string, Suggestion[]>();
    for (const item of batch.suggestions || []) {
      const current = map.get(item.category);
      if (current) current.push(item);
      else map.set(item.category, [item]);
    }
    return CATEGORY_ORDER
      .filter(category => map.has(category))
      .map(category => [category, map.get(category)!] as [string, Suggestion[]]);
  }, [batch]);

  const alreadyApplied = useMemo(
    () => new Set(batch?.appliedSuggestionIds || []),
    [batch?.appliedSuggestionIds]
  );

  const selectableCount = useMemo(
    () => (batch?.suggestions || []).filter(item => !alreadyApplied.has(item.id)).length,
    [batch, alreadyApplied]
  );

  const reset = () => {
    setProcessId('');
    setOwnerName('');
    setBatch(null);
    setHistory([]);
    setSelected(new Set());
    setError('');
    setMessage('');
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const loadHistory = async (nextProcessId: string) => {
    if (!nextProcessId) {
      setHistory([]);
      return;
    }
    setLoadingHistory(true);
    try {
      const response = await fetch(
        '/api/risks/ai-suggestions?processId=' + encodeURIComponent(nextProcessId),
        { cache: 'no-store' }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Tidak dapat memuat usulan risiko AI yang tersimpan.');
      setHistory(Array.isArray(payload.batches) ? payload.batches : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tidak dapat memuat usulan risiko AI yang tersimpan.');
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const changeProcess = (nextProcessId: string) => {
    setProcessId(nextProcessId);
    const next = processes.find(item => String(item.id) === nextProcessId);
    setOwnerName(String(next?.ownerName || ''));
    setBatch(null);
    setSelected(new Set());
    setError('');
    setMessage('');
    void loadHistory(nextProcessId);
  };

  const generate = async () => {
    if (!processId || generating) return;
    setGenerating(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/risks/ai-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Tidak dapat membuat usulan risiko AI.');

      setBatch(payload.batch);
      setSelected(new Set());
      setMessage(
        'ARC AI telah membuat usulan risiko yang dapat dipilih dari BPM terpilih. Belum ada data yang dibuat pada Register Risiko.'
      );
      setHistory(current => [
        payload.batch,
        ...current.filter(item => item.id !== payload.batch?.id)
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tidak dapat membuat usulan risiko AI.');
    } finally {
      setGenerating(false);
    }
  };

  const useSavedBatch = (item: Batch) => {
    if (item.stale) {
      setError('Batch usulan tersimpan ini sudah tidak mutakhir karena BPM berubah. Buat batch baru.');
      return;
    }
    setBatch(item);
    setSelected(new Set());
    setError('');
    setMessage('Usulan AI tersimpan dimuat tanpa menjalankan AI kembali.');
  };

  const toggle = (id: string) => {
    if (alreadyApplied.has(id)) return;
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCategory = (items: Suggestion[]) => {
    const available = items.filter(item => !alreadyApplied.has(item.id));
    const allSelected = available.length > 0 && available.every(item => selected.has(item.id));
    setSelected(current => {
      const next = new Set(current);
      for (const item of tersedia) {
        if (allSelected) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  };

  const createSelected = async () => {
    if (!batch || !selected.size || !processId || creating) return;
    if (!ownerName.trim()) {
      setError('Konfirmasi Pemilik Risiko yang bertanggung jawab sebelum membuat risiko terpilih.');
      return;
    }

    setCreating(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/risks/ai-suggestions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processId,
          batchId: batch.id,
          selectedSuggestionIds: Array.from(selected),
          ownerName: ownerName.trim()
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Tidak dapat membuat risiko terpilih.');

      const createdCount = Number(payload.result?.created?.length || 0);
      const duplicateCount = Number(payload.result?.duplicates?.length || 0);
      setBatch(current =>
        current
          ? {
              ...current,
              status: payload.result?.status || current.status,
              appliedSuggestionIds: payload.result?.appliedSuggestionIds || current.appliedSuggestionIds
            }
          : current
      );
      setSelected(new Set());
      setMessage(
        createdCount +
          ' risiko dibuat sebagai Draf / Belum Dinilai.' +
          (duplicateCount ? ' ' + duplicateCount + ' usulan duplikat dilewati.' : '')
      );
      await onCreated();
      await loadHistory(processId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tidak dapat membuat risiko terpilih.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-sky-500 px-4 text-xs font-black text-white shadow-sm shadow-sky-100 transition hover:from-brand-700 hover:to-sky-600"
      >
        <Sparkles className="h-4 w-4" />
        <span>AI Buat Register Risiko</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-4xl sm:rounded-3xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-brand-600">
                  <Sparkles className="h-4 w-4" />
                  ARC AI · BPM ke Register Risiko
                </div>
                <h2 className="mt-1 text-lg font-black text-slate-900 sm:text-xl">
                  Buat Register Risiko dari Proses Bisnis
                </h2>
                <p className="mt-1 max-w-2xl text-[10px] leading-4 text-slate-500 sm:text-[11px]">
                  Pilih BPM terlebih dahulu. AI hanya membuat usulan; pengguna memilih risiko yang relevan sebelum dibuat sebagai Draf / Belum Dinilai.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"
                aria-label="Tutup generator Register Risiko AI"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-4 sm:p-6">
              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[10px] leading-4 text-rose-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
              {message && (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[10px] leading-4 text-emerald-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  {message}
                </div>
              )}

              <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 sm:p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-[9px] font-black text-white">
                    1
                  </span>
                  <h3 className="text-xs font-black text-slate-900">Pilih Proses Bisnis</h3>
                </div>
                <select
                  value={processId}
                  onChange={event => changeProcess(event.target.value)}
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  <option value="">— Pilih BPM sebelum membuat risiko dengan AI —</option>
                  {processes.map(process => (
                    <option key={process.id} value={process.id}>
                      {process.processId} — {process.name}
                    </option>
                  ))}
                </select>

                {selectedProcess && (
                  <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                      BPM Terpilih
                    </div>
                    <div className="mt-1 text-xs font-black text-slate-900">
                      {selectedProcess.processId} · {selectedProcess.name}
                    </div>
                    <div className="mt-1 text-[9px] text-slate-500">
                      {selectedProcess.classification || 'Klasifikasi belum tersedia'} ·{' '}
                      {selectedProcess.criticality || 'Kritikalitas belum dinilai'}
                      {selectedProcess.ownerName ? ' · Pemilik: ' + selectedProcess.ownerName : ''}
                    </div>
                  </div>
                )}

                {history.length > 0 && processId && (
                  <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/50 p-2.5">
                    <div className="mb-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-sky-700">
                      <History className="h-3.5 w-3.5" />
                      Batch usulan AI tersimpan
                    </div>
                    <div className="space-y-1.5">
                      {history.slice(0, 3).map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => useSavedBatch(item)}
                          disabled={item.stale}
                          className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[9px] font-black text-slate-700">
                              {item.suggestions?.length || 0} usulan ·{' '}
                              {new Date(item.createdAt).toLocaleString('id-ID', {
                                dateStyle: 'medium',
                                timeStyle: 'short'
                              })}
                            </div>
                            <div className="mt-0.5 text-[8px] text-slate-400">
                              {item.stale
                                ? 'BPM berubah — perlu dibuat ulang'
                                : item.status === 'SELECTION_APPLIED'
                                  ? 'Sebagian usulan sudah dibuat'
                                  : 'Dapat digunakan kembali tanpa AI'}
                            </div>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-[9px] font-black text-white">
                        2
                      </span>
                      <h3 className="text-xs font-black text-slate-900">
                        Buat Jenis Risiko yang Relevan
                      </h3>
                    </div>
                    <p className="mt-1.5 pl-8 text-[9px] leading-4 text-slate-500">
                      AI membaca BPM terpilih dan hanya mengusulkan jenis risiko yang didukung konteks proses, tujuan, SIPOC, dan Register Aktivitas.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void generate()}
                    disabled={!processId || generating}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-sky-500 px-4 text-[10px] font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {generating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {generating ? 'Menganalisis BPM…' : 'Buat Risiko dengan AI'}
                  </button>
                </div>
              </section>

              {batch && (
                <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-[9px] font-black text-white">
                      3
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs font-black text-slate-900">
                        Pilih Risiko yang Akan Dibuat
                      </h3>
                      <p className="mt-0.5 text-[9px] leading-4 text-slate-500">
                        {batch.analysisSummary}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pl-8">
                    {grouped.map(([category, items]) => (
                      <span
                        key={category}
                        className={`rounded-full border px-2 py-1 text-[8px] font-black ${categoryTone(category)}`}
                      >
                        {CATEGORY_LABEL_ID[category] || category} · {items.length}
                      </span>
                    ))}
                  </div>

                  <div className="space-y-3">
                    {grouped.map(([category, items]) => {
                      const tersedia = items.filter(item => !alreadyApplied.has(item.id));
                      const allSelected =
                        tersedia.length > 0 && tersedia.every(item => selected.has(item.id));

                      return (
                        <div key={category} className="overflow-hidden rounded-xl border border-slate-200">
                          <div className="flex items-center justify-between bg-slate-50 px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full border px-2 py-1 text-[8px] font-black ${categoryTone(category)}`}>
                                {CATEGORY_LABEL_ID[category] || category}
                              </span>
                              <span className="text-[8px] font-bold text-slate-400">
                                {items.length} usulan risiko
                              </span>
                            </div>
                            {available.length > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleCategory(items)}
                                className="text-[8px] font-black text-brand-600"
                              >
                                {allSelected ? 'Bersihkan kategori' : 'Pilih semua'}
                              </button>
                            )}
                          </div>

                          <div className="divide-y divide-slate-100">
                            {items.map(item => {
                              const isApplied = alreadyApplied.has(item.id);
                              const isSelected = selected.has(item.id);
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => toggle(item.id)}
                                  disabled={isApplied}
                                  className={`block w-full p-3 text-left transition ${
                                    isApplied
                                      ? 'cursor-default bg-emerald-50/40'
                                      : isSelected
                                        ? 'bg-sky-50/70'
                                        : 'bg-white hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="flex items-start gap-2.5">
                                    <span
                                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                        isApplied
                                          ? 'border-emerald-500 bg-emerald-500 text-white'
                                          : isSelected
                                            ? 'border-brand-600 bg-brand-600 text-white'
                                            : 'border-slate-300 bg-white text-transparent'
                                      }`}
                                    >
                                      <Check className="h-3 w-3" />
                                    </span>

                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <div className="text-[10px] font-black leading-4 text-slate-900 sm:text-[11px]">
                                          {item.name}
                                        </div>
                                        <span className={`rounded-full border px-1.5 py-0.5 text-[7px] font-black ${confidenceTone(item.confidence)}`}>
                                          Keyakinan {CONFIDENCE_LABEL_ID[item.confidence] || item.confidence}
                                        </span>
                                        {isApplied && (
                                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[7px] font-black text-emerald-700">
                                            CREATED
                                          </span>
                                        )}
                                      </div>

                                      <div className="mt-2 grid gap-1.5 text-[8px] leading-3.5 sm:grid-cols-3">
                                        <div className="rounded-lg bg-slate-50 p-2 text-slate-600">
                                          <strong className="text-slate-500">Penyebab</strong>
                                          <br />
                                          {item.cause}
                                        </div>
                                        <div className="rounded-lg bg-amber-50 p-2 text-amber-900">
                                          <strong className="text-amber-700">Kejadian</strong>
                                          <br />
                                          {item.event}
                                        </div>
                                        <div className="rounded-lg bg-rose-50 p-2 text-rose-900">
                                          <strong className="text-rose-700">Dampak</strong>
                                          <br />
                                          {item.impact}
                                        </div>
                                      </div>

                                      <p className="mt-2 text-[8px] leading-3.5 text-slate-500">
                                        <strong>Alasan relevan:</strong> {item.rationale}
                                      </p>
                                      {item.sourceActivityNames?.length > 0 && (
                                        <p className="mt-1 text-[8px] leading-3.5 text-slate-400">
                                          <strong>Aktivitas BPM:</strong> {item.sourceActivityNames.join(' · ')}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="text-[9px] font-black text-amber-900">
                      Asesmen manusia tetap wajib
                    </div>
                    <p className="mt-1 text-[8px] leading-3.5 text-amber-800">
                      ARC AI tidak menetapkan kemungkinan, skor dampak, peringkat inheren, peringkat residual, atau perlakuan risiko. Risiko yang dipilih dibuat sebagai Draf / Belum Dinilai.
                    </p>
                  </div>

                  <label className="block text-[9px] font-black text-slate-700">
                    Pemilik Risiko *
                    <input
                      type="text"
                      value={ownerName}
                      onChange={event => setOwnerName(event.target.value)}
                      placeholder="Konfirmasi Pemilik Risiko yang bertanggung jawab"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-normal focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                  </label>

                  <div className="sticky bottom-0 -mx-3.5 -mb-3.5 border-t border-slate-100 bg-white/95 p-3.5 backdrop-blur sm:-mx-4 sm:-mb-4 sm:p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-[9px] font-bold text-slate-500">
                        {selected.size} dipilih · {selectableCount} tersedia
                      </div>
                      <button
                        type="button"
                        onClick={() => void createSelected()}
                        disabled={!selected.size || !ownerName.trim() || creating}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {creating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        {creating
                          ? 'Membuat Risiko Draf…'
                          : 'Buat ' + selected.size + ' Risiko Terpilih'}
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {!batch && !generating && processId && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center">
                  <Sparkles className="mx-auto h-6 w-6 text-brand-500" />
                  <div className="mt-2 text-xs font-black text-slate-800">
                    BPM terpilih — siap untuk identifikasi risiko
                  </div>
                  <p className="mx-auto mt-1 max-w-lg text-[9px] leading-4 text-slate-500">
                    Tekan Buat Risiko dengan AI untuk menghasilkan beberapa usulan jenis risiko yang relevan. Tidak ada data Register Risiko yang dibuat sampai Anda memilih usulannya.
                  </p>
                </div>
              )}

              {!processId && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center">
                  <div className="text-xs font-black text-slate-800">Pilih BPM terlebih dahulu</div>
                  <p className="mx-auto mt-1 max-w-lg text-[9px] leading-4 text-slate-500">
                    Tombol Buat Risiko dengan AI tetap nonaktif sampai pengguna memilih Proses Bisnis.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
