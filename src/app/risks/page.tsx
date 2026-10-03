'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Plus,
  Search,
  Filter,
  ArrowRight,
  Shield,
  Layers,
  Sparkles,
  CheckCircle2,
  TrendingDown,
  X,
  FileSpreadsheet,
  RefreshCw
} from 'lucide-react';
import { getRiskBadgeClasses } from '@/lib/utils';
import { DataLoadingState } from '@/components/common/DataLoadingState';
import { AiRiskRegisterGenerator } from '@/components/risks/AiRiskRegisterGenerator';

function displayRiskRating(value: unknown) {
  const raw = String(value || '').trim();
  switch (raw.toLowerCase()) {
    case 'critical':
      return 'Kritis';
    case 'high':
      return 'Tinggi';
    case 'medium':
      return 'Sedang';
    case 'low':
      return 'Rendah';
    case 'not assessed':
    case '':
      return 'Belum Dinilai';
    default:
      return raw;
  }
}

function displayAssessmentStatus(value: unknown) {
  const raw = String(value || '').trim();
  return !raw || raw.toLowerCase() === 'not assessed' ? 'Belum Dinilai' : raw;
}

export default function RisksPage() {
  const [risks, setRisks] = useState<any[]>([]);
  const [processes, setProcesses] = useState<any[]>([]);
  const [selectedRisk, setSelectedRisk] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'register' | 'inherent_heatmap' | 'residual_heatmap'>('register');
  const [newRiskModal, setNewRiskModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [riskLoading, setRiskLoading] = useState(true);
  const [riskLoadError, setRiskLoadError] = useState('');
  const [heatmapAi, setHeatmapAi] = useState<any>(null);
  const [heatmapAiLoading, setHeatmapAiLoading] = useState(false);
  const [heatmapAiError, setHeatmapAiError] = useState('');
  const [heatmapAiKey, setHeatmapAiKey] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    riskId: '',
    name: '',
    cause: '',
    event: '',
    impact: '',
    category: 'Operational',
    processId: '',
    ownerName: '',
    inherentLikelihood: 0,
    inherentImpact: 0
  });

  const loadRisks = () => {
    setRiskLoading(true);
    setRiskLoadError('');
    fetch('/api/risks')
      .then(res => {
        if (!res.ok) throw new Error('Unable to load risks.');
        return res.json();
      })
      .then(riskData => {
        const nextRisks = Array.isArray(riskData.risks) ? riskData.risks : [];
        const nextProcesses = Array.isArray(riskData.processes) ? riskData.processes : [];
        setRisks(nextRisks);
        setProcesses(nextProcesses);

        if (nextRisks.length > 0 && !selectedRisk) {
          setSelectedRisk(nextRisks[0]);
        }

        setFormData(prev => ({
          ...prev,
          processId:
            prev.processId && nextProcesses.some((process: any) => process.id === prev.processId)
              ? prev.processId
              : nextProcesses[0]?.id || ''
        }));
      })
      .catch(error => {
        console.error(error);
        setRiskLoadError(
          error instanceof Error ? error.message : 'Unable to load risk data.'
        );
      })
      .finally(() => {
        setRiskLoading(false);
      });
  };

  useEffect(() => {
    loadRisks();
  }, []);

  const generateHeatmapAiAnalysis = async (force = false) => {
    if (activeTab === 'register' || riskLoading) return;

    const mode = activeTab === 'inherent_heatmap' ? 'inherent' : 'residual';
    const scoreField = mode === 'inherent' ? 'inherentScore' : 'residualScore';
    const assessedCount = risks.filter((risk: any) => Number(risk[scoreField] || 0) > 0).length;
    const scoreTotal = risks.reduce(
      (sum: number, risk: any) => sum + Number(risk[scoreField] || 0),
      0
    );
    const nextKey = `${mode}:${risks.length}:${assessedCount}:${scoreTotal}`;

    if (!force && heatmapAiKey === nextKey && heatmapAi) return;

    setHeatmapAiLoading(true);
    setHeatmapAiError('');

    try {
      const response = await fetch('/api/ai/risk-heatmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to generate AI heatmap analysis.');
      }

      setHeatmapAi(payload);
      setHeatmapAiKey(nextKey);
    } catch (error) {
      setHeatmapAiError(
        error instanceof Error ? error.message : 'Unable to generate AI heatmap analysis.'
      );
    } finally {
      setHeatmapAiLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'register' && !riskLoading) {
      void generateHeatmapAiAnalysis();
    }
  }, [activeTab, riskLoading, risks]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');

    try {
      const res = await fetch('/api/risks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Unable to save risk.');

      setRisks(current =>
        [...current, payload].sort((a, b) => String(a.riskId).localeCompare(String(b.riskId)))
      );
      setSelectedRisk(payload);
      setFormData({
        riskId: '',
        name: '',
        cause: '',
        event: '',
        impact: '',
        category: 'Operational',
        processId: formData.processId || processes[0]?.id || '',
        ownerName: '',
        inherentLikelihood: 0,
        inherentImpact: 0
      });
      setNewRiskModal(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save risk.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = risks.filter(r => {
    return (
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.riskId.toLowerCase().includes(search.toLowerCase()) ||
      r.category.toLowerCase().includes(search.toLowerCase())
    );
  });

  const assessedRiskCount = risks.filter(r => Number(r.inherentScore || 0) > 0).length;
  const unassessedRiskCount = Math.max(0, risks.length - assessedRiskCount);
  const draftRiskCount = risks.filter(r => String(r.status || '').toLowerCase() === 'draft').length;
  const elevatedRiskCount = risks.filter(r =>
    ['High', 'Critical'].includes(String(r.inherentRating || ''))
  ).length;

  return (
    <div className="space-y-6">
      {/* Desktop-first header */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-50 via-white to-sky-50/60 px-5 py-5 xl:px-7 xl:py-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 max-w-3xl">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-amber-600">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-amber-200 bg-amber-50">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
                <span>Risk Universe · Manage</span>
              </div>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 xl:text-[28px]">
                Enterprise Risk Register &amp; Heatmaps
              </h1>
              <p className="mt-1.5 max-w-2xl text-[11px] leading-5 text-slate-500 xl:text-xs">
                Kelola artikulasi Cause → Event → Impact, assessment inherent/residual, dan pemetaan risiko
                dalam satu workspace yang konsisten.
              </p>
              <div className="mt-3 inline-flex max-w-full items-start gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-[10px] leading-4 text-slate-500">
                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span>
                  Risiko dari sumber tetap berstatus <strong className="text-slate-700">Draft / Belum Dinilai</strong>{' '}
                  sampai assessment Likelihood × Impact 1–5 tervalidasi.
                </span>
              </div>
            </div>

            <div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2 lg:w-auto lg:min-w-[430px]">
              <AiRiskRegisterGenerator processes={processes} onCreated={loadRisks} />
              <button
                type="button"
                onClick={() => setNewRiskModal(true)}
                className="group inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-[11px] font-black text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300 sm:text-xs"
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/10 transition group-hover:bg-white/15">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="whitespace-nowrap">Identifikasi Risiko Baru</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-slate-100 bg-white md:grid-cols-4">
          {[
            ['Total Risiko', riskLoading ? '…' : risks.length, 'Register aktif'],
            ['Belum Dinilai', riskLoading ? '…' : unassessedRiskCount, 'Perlu assessment'],
            ['Draft', riskLoading ? '…' : draftRiskCount, 'Perlu validasi'],
            ['High / Critical', riskLoading ? '…' : elevatedRiskCount, 'Prioritas review']
          ].map(([label, value, hint], index) => (
            <div
              key={String(label)}
              className={`px-5 py-3.5 xl:px-6 ${index > 0 ? 'border-l border-slate-100' : ''} ${
                index > 1 ? 'border-t border-slate-100 md:border-t-0' : ''
              }`}
            >
              <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-black tracking-tight text-slate-900">{value}</span>
                <span className="text-[9px] font-medium text-slate-400">{hint}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Search & view toolbar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm xl:p-3.5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative min-w-0 flex-1 xl:max-w-xl">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari Risk ID, kategori, atau nama risiko..."
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Hapus pencarian"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => setActiveTab('register')}
              className={`min-h-9 shrink-0 rounded-lg px-3.5 text-[10px] font-black transition xl:text-[11px] ${
                activeTab === 'register'
                  ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Risk Register · {riskLoading ? '…' : risks.length}
            </button>
            <button
              onClick={() => setActiveTab('inherent_heatmap')}
              className={`min-h-9 shrink-0 rounded-lg px-3.5 text-[10px] font-black transition xl:text-[11px] ${
                activeTab === 'inherent_heatmap'
                  ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Inherent Heatmap
            </button>
            <button
              onClick={() => setActiveTab('residual_heatmap')}
              className={`min-h-9 shrink-0 rounded-lg px-3.5 text-[10px] font-black transition xl:text-[11px] ${
                activeTab === 'residual_heatmap'
                  ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Residual Heatmap
            </button>
          </div>
        </div>
        <div className="mt-2 px-1 text-[9px] font-medium text-slate-400">
          {search ? `${filtered.length} dari ${risks.length} risiko sesuai pencarian` : 'Pilih risiko di daftar untuk membuka profil 360° di panel kanan.'}
        </div>
      </section>

      {riskLoadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          <strong className="font-black">Risk data unavailable.</strong>{' '}
          {riskLoadError} Please retry after the database/API connection is available.
        </div>
      )}

      {/* Main Content Area */}
      {activeTab === 'register' ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(360px,430px)_minmax(0,1fr)] xl:items-start">
          {/* Desktop register navigator */}
          <aside className="space-y-3 xl:max-h-[calc(100vh-210px)] xl:overflow-y-auto xl:pr-1.5 [scrollbar-width:thin]">
            {riskLoading ? (
              <DataLoadingState label="Loading risks..." variant="list" rows={4} />
            ) : (
              filtered.map(r => {
              const isSelected = selectedRisk?.id === r.id;
              const badge = getRiskBadgeClasses(r.inherentRating);
              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedRisk(r)}
                  className={`group relative overflow-hidden rounded-2xl border p-4 transition-all cursor-pointer xl:p-4.5 ${

                    isSelected
                      ? 'border-amber-300 bg-amber-50/70 shadow-sm ring-1 ring-amber-200'
                      : 'border-slate-200 bg-white hover:border-brand-200 hover:shadow-md hover:shadow-slate-200/60'
                  }`}
                >
                  {isSelected && (
                    <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-amber-400" />
                  )}
                  <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 font-mono text-xs font-bold text-amber-800">
                          {r.riskId}
                        </span>
                        <span className="max-w-full truncate rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          {r.category}
                        </span>
                        {r.status === 'Draft' && (
                          <span className="shrink-0 rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[9px] font-black text-sky-700">
                            Draft
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1.5 break-words text-sm font-bold leading-5 text-slate-900">
                        {r.name}
                      </h3>
                    </div>

                    <div className="flex max-w-full shrink-0 flex-wrap items-center gap-1.5 sm:max-w-[46%] sm:flex-col sm:items-end">
                      <span
                        className={`inline-flex h-6 max-w-full shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 text-[9px] font-bold leading-none ${badge.bg} ${badge.text} ${badge.border}`}
                      >
                        {r.inherentScore > 0
                          ? `Skor ${r.inherentScore} · ${displayRiskRating(r.inherentRating)}`
                          : 'Belum Dinilai'}
                      </span>
                      {r.sourceMetadata?.sourceRiskRating && (
                        <span className="inline-flex max-w-full items-center whitespace-nowrap rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[9px] font-bold leading-none text-violet-700">
                          Sumber · {r.sourceMetadata.sourceRiskRating}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-slate-500">
                    {r.description}
                  </p>

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                    <span>Process: <strong>{r.process?.name || 'Unassigned'}</strong></span>
                    <span className="text-emerald-700 font-semibold flex items-center space-x-1">
                      <TrendingDown className="w-3.5 h-3.5" />
                      <span>
                        {r.residualScore > 0
                          ? `Residual: ${r.residualScore} (${displayRiskRating(r.residualRating)})`
                          : 'Residual: Belum Dinilai'}
                      </span>
                    </span>
                  </div>
                </div>
              );
            })
            )}
          </aside>

          {/* Risk 360 workspace */}
          <div className="min-w-0">
            {riskLoading ? (
              <DataLoadingState label="Loading risk profile..." variant="profile" className="min-h-[220px]" />
            ) : selectedRisk ? (
              <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:p-6">
                <div className="rounded-xl border border-slate-100 bg-gradient-to-r from-slate-50 to-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-sm font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
                        {selectedRisk.riskId}
                      </span>
                      <span className="text-xs text-slate-500 font-semibold">
                        Category: {selectedRisk.category}
                      </span>
                      {selectedRisk.status === 'Draft' && (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[9px] font-black text-sky-700">
                          Draft · Human Validation Required
                        </span>
                      )}
                    </div>
                    <Link
                      href="/rcm"
                      className="text-xs font-bold text-brand-600 hover:text-brand-700 bg-brand-50 px-3 py-1.5 rounded-lg border border-brand-200 flex items-center space-x-1"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>View in RCM</span>
                    </Link>
                  </div>

                  <h2 className="text-xl font-black text-slate-900 mt-2">
                    {selectedRisk.name}
                  </h2>
                  {selectedRisk.sourceMetadata && (
                    <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-bold text-violet-700">
                        Source-backed
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-bold text-slate-600">
                        Source rating: {selectedRisk.sourceMetadata.sourceRiskRating || 'Not provided'}
                      </span>
                      {selectedRisk.sourceMetadata.reviewRequired ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-bold text-amber-700">
                          Owner validation required
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Structured Cause - Event - Impact (Section 29) */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Cause → Event → Impact Syntax (Section 29)
                  </h3>

                  <div className="space-y-2 text-xs">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-slate-500 font-bold uppercase text-[10px]">Due to Cause:</span>
                      <p className="text-slate-800 font-medium mt-0.5">{selectedRisk.cause || 'Not provided in source'}</p>
                    </div>

                    <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-200">
                      <span className="text-amber-700 font-bold uppercase text-[10px]">There is a Risk that (Event):</span>
                      <p className="text-amber-900 font-medium mt-0.5">{selectedRisk.event || 'Not provided in source'}</p>
                    </div>

                    <div className="p-3 bg-rose-50/60 rounded-lg border border-rose-200">
                      <span className="text-rose-700 font-bold uppercase text-[10px]">Resulting in (Impact):</span>
                      <p className="text-rose-900 font-medium mt-0.5">{selectedRisk.impact || 'Not provided in source'}</p>
                    </div>
                  </div>
                </div>

                {/* Inherent vs Residual Score Grid (Section 31 & 37) */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-rose-50/80 border border-rose-200 text-center space-y-1">
                    <span className="text-[10px] uppercase font-bold text-rose-600 tracking-wider">
                      Inherent Risk
                    </span>
                    <div className="text-3xl font-black text-rose-800">
                      {selectedRisk.inherentScore > 0 ? selectedRisk.inherentScore : '—'}
                    </div>
                    <div className="text-xs font-bold text-rose-700">{displayRiskRating(selectedRisk.inherentRating)}</div>
                    <div className="text-[10px] text-rose-600">
                      {selectedRisk.inherentScore > 0
                        ? `Likelihood ${selectedRisk.inherentLikelihood} × Impact ${selectedRisk.inherentImpact}`
                        : 'Awaiting validated 1–5 assessment'}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 text-center space-y-1">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">
                      Residual Risk (Post-Control)
                    </span>
                    <div className="text-3xl font-black text-emerald-800">
                      {selectedRisk.residualScore > 0 ? selectedRisk.residualScore : '—'}
                    </div>
                    <div className="text-xs font-bold text-emerald-700">{displayRiskRating(selectedRisk.residualRating)}</div>
                    <div className="text-[10px] text-emerald-600">
                      Treatment: {selectedRisk.riskTreatment}
                    </div>
                  </div>
                </div>

                {/* Mitigating Controls in Library */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Linked Mitigating Controls (Single Control Library)
                  </h3>
                  {selectedRisk.controls?.length > 0 ? (
                    selectedRisk.controls.map((m: any) => (
                      <div
                        key={m.id}
                        className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center space-x-2.5">
                          <Shield className="w-4 h-4 text-brand-600" />
                          <div>
                            <div className="font-bold text-slate-900">{m.control?.controlId}: {m.control?.name}</div>
                            <div className="text-[11px] text-slate-500">
                              Type: {m.control?.type} • Nature: {m.control?.nature}
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {displayAssessmentStatus(m.control?.overallHealth)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>Warning: No active control mapped to this risk. Control gap identified.</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-xs">
                Select a risk from the register to inspect its 360° profile.
              </div>
            )}
          </div>
        </div>
      ) : riskLoading ? (
        <DataLoadingState label="Loading risk heatmap..." variant="panel" />
      ) : (
        /* 5x5 Heatmap Matrix + AI Analysis */
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:gap-6">
          <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 xl:col-span-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900">
                  5×5 {activeTab === 'inherent_heatmap' ? 'Inherent' : 'Residual'} Risk Matrix
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Likelihood (Vertical Axis, 1–5) × Impact (Horizontal Axis, 1–5). Only assessed risks are mapped.
                  <span className="ml-1 font-bold text-slate-700">
                    {risks.filter((risk: any) =>
                      Number(
                        activeTab === 'inherent_heatmap'
                          ? risk.inherentScore || 0
                          : risk.residualScore || 0
                      ) === 0
                    ).length} risiko saat ini Belum Dinilai.
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                <span className="h-3 w-3 rounded border border-emerald-300 bg-emerald-100"></span>
                <span className="text-slate-500">Rendah 1–4</span>
                <span className="h-3 w-3 rounded border border-amber-300 bg-amber-100"></span>
                <span className="text-slate-500">Sedang 5–9</span>
                <span className="h-3 w-3 rounded border border-rose-300 bg-rose-100"></span>
                <span className="text-slate-500">Tinggi 10–14</span>
                <span className="h-3 w-3 rounded border border-red-400 bg-red-200"></span>
                <span className="text-slate-500">Kritis 15–25</span>
              </div>
            </div>

            <div className="mx-auto w-full max-w-xl py-2 sm:py-4">
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {[5, 4, 3, 2, 1].map(l =>
                  [1, 2, 3, 4, 5].map(i => {
                    const score = l * i;
                    let bg = 'bg-emerald-50 border-emerald-200 text-emerald-800';
                    if (score >= 15) bg = 'bg-red-100 border-red-300 text-red-900 font-black';
                    else if (score >= 10) bg = 'bg-rose-100 border-rose-200 text-rose-800 font-bold';
                    else if (score >= 5) bg = 'bg-amber-50 border-amber-200 text-amber-800';

                    const count = risks.filter((risk: any) => {
                      const likelihood =
                        activeTab === 'inherent_heatmap'
                          ? risk.inherentLikelihood
                          : risk.residualLikelihood;
                      const impact =
                        activeTab === 'inherent_heatmap'
                          ? risk.inherentImpact
                          : risk.residualImpact;
                      return likelihood === l && impact === i;
                    }).length;

                    return (
                      <div
                        key={`${l}-${i}`}
                        className={`flex h-[72px] min-w-0 flex-col justify-between rounded-xl border p-1.5 shadow-sm transition hover:scale-[1.02] sm:h-20 sm:p-2 ${bg}`}
                      >
                        <div className="flex justify-between text-[9px] opacity-70 sm:text-[10px]">
                          <span>L{l}</span>
                          <span>I{i}</span>
                        </div>
                        <div className="text-center text-sm font-extrabold">{score}</div>
                        <div className="truncate text-center text-[8px] opacity-60 sm:text-[9px]">
                          {count} risiko
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="mt-3 flex justify-between gap-4 px-1 text-[10px] font-bold text-slate-500 sm:px-2 sm:text-xs">
                <span>Dampak 1 (Tidak Signifikan)</span>
                <span className="text-right">Dampak 5 (Katastropik)</span>
              </div>
            </div>
          </div>

          <aside className="overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-b from-cyan-50/80 to-white shadow-sm xl:col-span-5">
            <div className="border-b border-cyan-100 px-4 py-4 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-700">
                    <Sparkles className="h-4 w-4" />
                    Analisis Risiko ARC AI
                  </div>
                  <h3 className="mt-1 text-base font-black text-slate-900">
                    Interpretasi Heatmap
                  </h3>
                  <p className="mt-1 text-[10px] leading-4 text-slate-500">
                    AI menjelaskan distribusi risiko {activeTab === 'inherent_heatmap' ? 'inheren' : 'residual'} saat ini hanya berdasarkan data Risk Master yang tersimpan.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void generateHeatmapAiAnalysis(true)}
                  disabled={heatmapAiLoading}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-cyan-200 bg-white px-2.5 text-[10px] font-black text-cyan-700 transition hover:bg-cyan-50 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${heatmapAiLoading ? 'animate-spin' : ''}`} />
                  Perbarui
                </button>
              </div>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              {heatmapAiLoading ? (
                <DataLoadingState label="ARC AI sedang menganalisis distribusi risiko..." variant="panel" />
              ) : heatmapAiError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] leading-5 text-rose-700">
                  <strong>Analisis AI tidak tersedia.</strong> {heatmapAiError}
                </div>
              ) : heatmapAi?.analysis ? (
                <>
                  <div className="rounded-xl border border-cyan-100 bg-white p-3.5">
                    <div className="text-[10px] font-black uppercase tracking-wide text-cyan-700">
                      Ringkasan eksekutif
                    </div>
                    <div className="mt-1 text-sm font-black leading-5 text-slate-900">
                      {heatmapAi.analysis.headline}
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-slate-600">
                      {heatmapAi.analysis.executiveSummary}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                      <div className="text-[9px] font-black uppercase text-slate-400">Sudah Dinilai</div>
                      <div className="mt-1 text-xl font-black text-slate-900">
                        {heatmapAi.metrics?.assessed ?? 0}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                      <div className="text-[9px] font-black uppercase text-slate-400">Belum Dinilai</div>
                      <div className="mt-1 text-xl font-black text-slate-900">
                        {heatmapAi.metrics?.unassessed ?? 0}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                      <div className="text-[9px] font-black uppercase text-slate-400">Cakupan</div>
                      <div className="mt-1 text-xl font-black text-slate-900">
                        {heatmapAi.metrics?.coveragePct ?? 0}%
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                    <div className="text-[10px] font-black uppercase tracking-wide text-amber-700">
                      Kualitas data
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-amber-900">
                      {heatmapAi.analysis.dataQuality}
                    </p>
                  </div>

                  {heatmapAi.analysis.concentrationInsights?.length > 0 && (
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                        Insight konsentrasi risiko
                      </div>
                      <div className="mt-2 space-y-2">
                        {heatmapAi.analysis.concentrationInsights.map((item: string, index: number) => (
                          <div
                            key={`insight-${index}`}
                            className="flex gap-2 rounded-xl border border-slate-200 bg-white p-3 text-[11px] leading-5 text-slate-700"
                          >
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-[9px] font-black text-cyan-700">
                              {index + 1}
                            </span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {heatmapAi.analysis.managementActions?.length > 0 && (
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                        Perhatian manajemen
                      </div>
                      <div className="mt-2 space-y-2">
                        {heatmapAi.analysis.managementActions.map((item: string, index: number) => (
                          <div
                            key={`action-${index}`}
                            className="flex gap-2 rounded-xl border border-brand-100 bg-brand-50/40 p-3 text-[11px] leading-5 text-slate-700"
                          >
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-slate-100 pt-3">
                    <p className="text-[9px] leading-4 text-slate-400">
                      {heatmapAi.analysis.caution}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[8px] font-bold uppercase tracking-wide text-slate-400">
                      <span>{heatmapAi.disclaimer}</span>
                      {heatmapAi.ai?.provider && (
                        <span>
                          {heatmapAi.ai.provider} · {heatmapAi.ai.model}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-cyan-200 bg-white p-5 text-center text-[11px] leading-5 text-slate-500">
                  Analisis ARC AI akan tampil di sini setelah data heatmap selesai dimuat.
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Identify New Risk Modal */}
      {newRiskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900">Identify New Risk Master</h3>
              <button
                onClick={() => setNewRiskModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              {saveError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700">
                  {saveError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Risk ID</label>
                  <input
                    type="text"
                    placeholder="Auto-generated if blank"
                    value={formData.riskId}
                    onChange={e => setFormData({ ...formData, riskId: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Risk Category *</label>
                  <select
                    required
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="Operational">Operational</option>
                    <option value="Financial Reporting">Financial Reporting</option>
                    <option value="Compliance">Compliance</option>
                    <option value="Technology">Technology</option>
                    <option value="Cybersecurity">Cybersecurity</option>
                    <option value="Strategic">Strategic</option>
                    <option value="Fraud">Fraud</option>
                    <option value="Third Party">Third Party</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Business Process *</label>
                <select
                  required
                  value={formData.processId}
                  onChange={e => setFormData({ ...formData, processId: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                >
                  {processes.length === 0 ? (
                    <option value="">Register a business process first</option>
                  ) : (
                    processes.map(process => (
                      <option key={process.id} value={process.id}>
                        {process.processId} — {process.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Risk Owner *</label>
                <input
                  type="text"
                  required
                  placeholder="Enter accountable risk owner"
                  value={formData.ownerName}
                  onChange={e => setFormData({ ...formData, ownerName: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Risk Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Unreconciled FX Hedging Settlement"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Due to Cause: *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Manual trade ticket entry without automated feed validation"
                  value={formData.cause}
                  onChange={e => setFormData({ ...formData, cause: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">There is a Risk that (Event): *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Discrepant currency rates are executed"
                  value={formData.event}
                  onChange={e => setFormData({ ...formData, event: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Resulting in (Impact): *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Direct forex variance loss and inaccurate quarterly revaluation"
                  value={formData.impact}
                  onChange={e => setFormData({ ...formData, impact: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Inherent Likelihood (1-5)</label>
                  <select
                    value={formData.inherentLikelihood}
                    onChange={e => setFormData({ ...formData, inherentLikelihood: parseInt(e.target.value) })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value={0}>Belum Dinilai</option>
                    {[1, 2, 3, 4, 5].map(v => (
                      <option key={v} value={v}>Level {v}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Inherent Impact (1-5)</label>
                  <select
                    value={formData.inherentImpact}
                    onChange={e => setFormData({ ...formData, inherentImpact: parseInt(e.target.value) })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value={0}>Belum Dinilai</option>
                    {[1, 2, 3, 4, 5].map(v => (
                      <option key={v} value={v}>Level {v}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setNewRiskModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || processes.length === 0}
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : 'Save Risk Master'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
