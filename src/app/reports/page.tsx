'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BarChart3,
  Download,
  Lightbulb,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Target
} from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';

type EnterpriseOverview = {
  generatedAt: string;
  analysisMode: 'ai' | 'data-rules-fallback';
  readiness: {
    score: number;
    label: string;
    description: string;
  };
  metrics: Record<string, any>;
  analysis: {
    headline: string;
    executiveSummary: string;
    icofrInsight: string;
    riskInsight: string;
    complianceInsight: string;
    priorityInsight: string;
    recommendations: string[];
    caution: string;
  };
  ai: null | {
    provider: string;
    model: string;
    fallbackUsed: boolean;
    durationMs: number;
  };
  disclaimer: string;
};

function readinessClasses(label?: string) {
  if (label === 'Strong') {
    return {
      card: 'border-emerald-200 bg-emerald-50',
      text: 'text-emerald-800',
      badge: 'bg-emerald-100 text-emerald-800'
    };
  }
  if (label === 'Moderate') {
    return {
      card: 'border-amber-200 bg-amber-50',
      text: 'text-amber-800',
      badge: 'bg-amber-100 text-amber-800'
    };
  }
  if (label === 'Needs Attention' || label === 'Early Stage') {
    return {
      card: 'border-orange-200 bg-orange-50',
      text: 'text-orange-800',
      badge: 'bg-orange-100 text-orange-800'
    };
  }
  return {
    card: 'border-slate-200 bg-slate-50',
    text: 'text-slate-700',
    badge: 'bg-slate-200 text-slate-700'
  };
}

export default function ReportsPage() {
  const { data, loading, error, refresh } = useAssuranceData(['tasks', 'remediation']);
  const [overview, setOverview] = useState<EnterpriseOverview | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const autoAnalyzed = useRef(false);

  const sources = data ? [
    { title: 'Business processes', count: data.processes?.length || 0, href: '/processes', detail: 'Process Architecture / BPM' },
    { title: 'Risk register', count: data.risks?.length || 0, href: '/risks', detail: 'Enterprise and process risks' },
    { title: 'Control master', count: data.controls?.length || 0, href: '/controls', detail: 'Single Control Library' },
    { title: 'RCSA / CSA campaigns', count: data.campaigns?.length || 0, href: '/rcsa', detail: 'Assessment campaigns and responses' },
    { title: 'ToD workpapers', count: data.todTests?.length || 0, href: '/tod', detail: 'Walkthrough and design assessment' },
    { title: 'ToE workpapers', count: data.toeTests?.length || 0, href: '/toe', detail: 'Operating-effectiveness testing' },
    { title: 'Issues & remediation', count: data.actionPlans?.length || 0, href: '/remediation', detail: 'MAP and retesting' },
    { title: 'CCM rules', count: data.monitoringRules?.length || 0, href: '/ccm', detail: 'Continuous monitoring' },
    { title: 'ICOFR financial items', count: data.financialAccounts?.length || 0, href: '/icofr/accounts', detail: 'Accounts & disclosures' },
    { title: 'IPE / EUC register', count: data.ipeRegisters?.length || 0, href: '/icofr/information', detail: 'Information reliability register' },
    { title: 'ICOFR testing plan', count: data.testingPlanItems?.length || 0, href: '/icofr/testing-plan', detail: 'Annual testing cycle' },
    { title: 'Management attestations', count: data.attestations?.length || 0, href: '/certification', detail: 'Certification and close' }
  ] : [];

  const totalRecords = sources.reduce((sum, source) => sum + source.count, 0);
  const openTasks = (data?.tasks || []).filter(
    (task: any) => !['Completed', 'Closed', 'Accepted', 'Cancelled'].includes(String(task.status))
  ).length;
  const openMaps = (data?.actionPlans || []).filter(
    (map: any) => !['Completed', 'Closed', 'Cancelled'].includes(String(map.status))
  ).length;

  const runAiAnalysis = useCallback(async () => {
    if (aiLoading) return;
    setAiLoading(true);
    setAiError('');

    try {
      const response = await fetch('/api/ai/enterprise-overview', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'report-source-center' })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Analisis Total ARC tidak dapat dibuat.');
      }
      setOverview(payload as EnterpriseOverview);
    } catch (analysisError) {
      setAiError(
        analysisError instanceof Error
          ? analysisError.message
          : 'Analisis Total ARC tidak dapat dibuat.'
      );
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading]);

  useEffect(() => {
    if (loading || !data || autoAnalyzed.current) return;
    autoAnalyzed.current = true;
    void runAiAnalysis();
  }, [data, loading, runAiAnalysis]);

  const handleRefresh = async () => {
    try {
      await refresh();
    } finally {
      void runAiAnalysis();
    }
  };

  const readinessTone = readinessClasses(overview?.readiness?.label);
  const analysis = overview?.analysis;

  const insightCards = [
    {
      title: 'ICOFR',
      icon: ShieldCheck,
      iconClass: 'text-sky-600',
      bgClass: 'bg-sky-50',
      text: analysis?.icofrInsight || 'Menunggu analisis data ICOFR persisted Total ARC.'
    },
    {
      title: 'Risiko',
      icon: AlertTriangle,
      iconClass: 'text-orange-600',
      bgClass: 'bg-orange-50',
      text: analysis?.riskInsight || 'Menunggu analisis profil risiko dan residual risk.'
    },
    {
      title: 'Kepatuhan',
      icon: ShieldCheck,
      iconClass: 'text-emerald-600',
      bgClass: 'bg-emerald-50',
      text: analysis?.complianceInsight || 'Menunggu analisis regulatory mapping dan evidence.'
    },
    {
      title: 'Prioritas',
      icon: Target,
      iconClass: 'text-violet-600',
      bgClass: 'bg-violet-50',
      text: analysis?.priorityInsight || 'Menunggu prioritas tindak lanjut berbasis data.'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase">
              <Download className="w-4 h-4" />Workpapers & Analytics
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Report Source Center</h1>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              Report sources are counted from persisted records across connected Total ARC modules, so analytics reflects operational data rather than placeholder values.
            </p>
          </div>
          <button
            onClick={() => void handleRefresh()}
            disabled={loading || aiLoading}
            className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-brand-700 disabled:opacity-50"
            title="Refresh report sources and AI analysis"
          >
            <RefreshCcw className={`w-4 h-4 ${loading || aiLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase text-slate-400">Connected sources</div>
          <div className="text-2xl font-black text-slate-900">{sources.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase text-slate-400">Persisted records</div>
          <div className="text-2xl font-black text-slate-900">{totalRecords}</div>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
          <div className="text-[10px] font-bold uppercase text-sky-600">Open tasks</div>
          <div className="text-2xl font-black text-sky-900">{openTasks}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-[10px] font-bold uppercase text-amber-700">Open MAP</div>
          <div className="text-2xl font-black text-amber-900">{openMaps}</div>
        </div>
      </div>

      <Link href="/icofr/reporting" className="block rounded-2xl border border-sky-200 bg-sky-50 p-5 hover:border-sky-300">
        <div className="text-xs font-black uppercase tracking-wide text-sky-600">ICOFR Executive Reporting</div>
        <div className="mt-1 text-sm font-black text-slate-900">Board / Audit Committee & External Audit Reliance</div>
        <div className="mt-1 text-[11px] text-slate-600">Open the database-backed reporting pack, reliance mapping, deficiency aging and PBC tracker.</div>
      </Link>

      <section className="overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-br from-white via-sky-50/50 to-white shadow-sm">
        <div className="border-b border-sky-100 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-sky-600">
                <Sparkles className="h-4 w-4" />
                AI Analisis Total ARC
              </div>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                Analisis Menyeluruh Kondisi ICOFR, Risiko & Kepatuhan Bank
              </h2>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Ringkasan otomatis berbasis persisted data Total ARC untuk memberikan pandangan menyeluruh atas
                pengendalian internal pelaporan keuangan, profil risiko, efektivitas kontrol, dan lensa kepatuhan bank.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row xl:items-stretch">
              <div className={`min-w-[220px] rounded-xl border p-3 ${readinessTone.card}`}>
                <div className="text-[9px] font-black uppercase tracking-wide text-slate-500">
                  Overall ICOFR Readiness
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${readinessTone.badge}`}>
                    {overview?.readiness?.label || (aiLoading ? 'Analyzing…' : 'Not analyzed')}
                  </span>
                  <span className={`text-lg font-black ${readinessTone.text}`}>
                    {overview ? overview.readiness.score + '%' : '—'}
                  </span>
                </div>
                <div className="mt-1 text-[9px] leading-4 text-slate-500">
                  {overview?.readiness?.description || 'Data & assurance coverage signal — bukan opini audit.'}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void runAiAnalysis()}
                disabled={aiLoading}
                className="inline-flex min-h-[64px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-sky-500 px-4 text-xs font-black text-white shadow-sm transition hover:from-brand-700 hover:to-sky-600 disabled:opacity-60"
              >
                <Sparkles className={`h-4 w-4 ${aiLoading ? 'animate-pulse' : ''}`} />
                {aiLoading ? 'Menganalisis…' : overview ? 'Analisis Ulang' : 'Jalankan Analisis AI'}
              </button>
            </div>
          </div>
        </div>

        {aiError && (
          <div className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 sm:mx-6">
            {aiError}
          </div>
        )}

        <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(330px,0.8fr)]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-sky-100 bg-white p-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-sky-600" />
                <h3 className="text-sm font-black text-slate-900">Ringkasan Analisis</h3>
                {overview && (
                  <span className={`ml-auto rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                    overview.analysisMode === 'ai'
                      ? 'bg-sky-50 text-sky-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}>
                    {overview.analysisMode === 'ai' ? 'ARC AI' : 'Data-derived fallback'}
                  </span>
                )}
              </div>

              <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/60 p-4">
                {aiLoading && !analysis ? (
                  <div className="space-y-2">
                    <div className="h-3 w-full animate-pulse rounded bg-sky-100" />
                    <div className="h-3 w-11/12 animate-pulse rounded bg-sky-100" />
                    <div className="h-3 w-4/5 animate-pulse rounded bg-sky-100" />
                  </div>
                ) : (
                  <>
                    <div className="text-xs font-black text-slate-900">
                      {analysis?.headline || 'Analisis belum dijalankan.'}
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-slate-600">
                      {analysis?.executiveSummary ||
                        'Jalankan analisis untuk menggabungkan kondisi ICOFR, risiko, kontrol, RCSA/CSA, testing, remediation, monitoring, dan regulatory mapping dari data persisted Total ARC.'}
                    </p>
                  </>
                )}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {insightCards.map(({ title, icon: Icon, iconClass, bgClass, text }) => (
                  <div key={title} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${bgClass} ${iconClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="text-xs font-black text-slate-900">{title}</div>
                    </div>
                    <p className="mt-2 text-[10px] leading-4 text-slate-600">{text}</p>
                  </div>
                ))}
              </div>
            </div>

            {overview?.metrics && (
              <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-4">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Risk coverage</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{overview.metrics.risks?.assessmentCoveragePct ?? 0}%</div>
                  <div className="text-[9px] text-slate-500">Residual assessment</div>
                </div>
                <div>
                  <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Key controls</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{overview.metrics.controls?.keyControls ?? 0}</div>
                  <div className="text-[9px] text-slate-500">{overview.metrics.controls?.icoFrKeyControls ?? 0} ICOFR key</div>
                </div>
                <div>
                  <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Testing</div>
                  <div className="mt-1 text-lg font-black text-slate-900">
                    {(overview.metrics.icofr?.todCompleted ?? 0) + (overview.metrics.icofr?.toeCompleted ?? 0)}
                  </div>
                  <div className="text-[9px] text-slate-500">Completed ToD + ToE</div>
                </div>
                <div>
                  <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Regulatory mapping</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{overview.metrics.compliance?.regulatoryMappingCoveragePct ?? 0}%</div>
                  <div className="text-[9px] text-slate-500">Mapped controls</div>
                </div>
              </div>
            )}
          </div>

          <aside className="rounded-2xl border border-sky-100 bg-white p-4">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-sky-600" />
              <h3 className="text-sm font-black text-slate-900">Rekomendasi AI</h3>
            </div>

            <div className="mt-4 space-y-3">
              {(analysis?.recommendations?.length
                ? analysis.recommendations
                : [
                    'Jalankan analisis untuk mendapatkan rekomendasi berbasis kondisi persisted Total ARC.'
                  ]
              ).map((item, index) => (
                <div key={item + index} className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[10px] font-black text-white">
                    {index + 1}
                  </div>
                  <div className="pt-1 text-[10px] leading-4 text-slate-600">{item}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="flex items-start gap-2 text-[9px] leading-4 text-slate-500">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
                <span>
                  {overview?.analysisMode === 'ai'
                    ? 'Generated by ARC AI from persisted Total ARC records.'
                    : overview
                      ? 'AI provider unavailable; deterministic data-derived analysis is displayed.'
                      : 'Analysis uses persisted Total ARC records and requires human review.'}
                </span>
              </div>
              {analysis?.caution && (
                <p className="mt-2 text-[9px] leading-4 text-slate-400">{analysis.caution}</p>
              )}
              {overview?.generatedAt && (
                <div className="mt-2 text-[8px] text-slate-400">
                  Generated {new Date(overview.generatedAt).toLocaleString('id-ID')}
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>

      {error && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}
      {loading ? (
        <div className="text-xs text-slate-500">Loading connected report sources…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sources.map((source) => (
            <Link key={source.title} href={source.href} className="group bg-white border border-slate-200 rounded-2xl p-5 hover:border-brand-300 hover:shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-900">{source.title}</div>
                  <div className="text-[11px] text-slate-500 mt-1">{source.detail}</div>
                </div>
                <BarChart3 className="w-4 h-4 text-slate-300 group-hover:text-brand-600" />
              </div>
              <div className="text-2xl font-black text-brand-600 mt-4">{source.count}</div>
              <div className="text-[11px] text-slate-500">persisted record(s)</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
