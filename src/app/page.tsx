'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Cpu,
  FileSpreadsheet,
  Layers,
  Network,
  RefreshCw,
  Shield,
  Sparkles,
  Target,
  Workflow
} from 'lucide-react';
import { useRole } from '@/context/RoleContext';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';

const emptyMetrics = {
  totalProcesses: 0,
  criticalProcesses: 0,
  totalRisks: 0,
  criticalRisks: 0,
  highRisks: 0,
  totalControls: 0,
  keyControls: 0,
  failedToEs: 0,
  totalExceptions: 0,
  openIssues: 0,
  closedIssues: 0,
  overdueMAP: 0,
  completedMAP: 0,
  ccmHealthy: 0,
  totalRetests: 0
};

type DashboardPayload = {
  metrics?: Partial<typeof emptyMetrics>;
  executiveQandA?: Array<{
    question: string;
    status: string;
    summary: string;
    badge?: string;
  }>;
  recentAuditLogs?: Array<{
    id: string;
    action: string;
    entityType: string;
    reason?: string | null;
    timestamp: string;
  }>;
};

const quickActions = [
  {
    title: 'Dynamic RCM',
    description: 'Kelola keterkaitan proses, risiko, dan kontrol.',
    href: '/rcm',
    icon: FileSpreadsheet,
    accent: 'from-sky-500 to-blue-600',
    iconBg: 'bg-white/18'
  },
  {
    title: 'ToE Workpaper',
    description: 'Uji efektivitas kontrol dan dokumentasikan evidence.',
    href: '/toe',
    icon: Cpu,
    accent: 'from-emerald-500 to-teal-600',
    iconBg: 'bg-white/18'
  },
  {
    title: 'CSA Assessment',
    description: 'Lakukan control self-assessment secara terstruktur.',
    href: '/rcsa',
    icon: ClipboardCheck,
    accent: 'from-violet-500 to-purple-600',
    iconBg: 'bg-white/18'
  },
  {
    title: 'Reports & Analytics',
    description: 'Pantau assurance, remediation, dan status kontrol.',
    href: '/reports',
    icon: BarChart3,
    accent: 'from-amber-500 to-orange-500',
    iconBg: 'bg-white/18'
  }
];

const modules = [
  { label: 'BPM & Process', href: '/processes', icon: Layers },
  { label: 'Risk Management', href: '/risks', icon: AlertTriangle },
  { label: 'Control Library', href: '/controls', icon: Shield },
  { label: 'RCSA / CSA', href: '/rcsa', icon: ClipboardCheck },
  { label: 'Walkthrough & ToD', href: '/tod', icon: Workflow },
  { label: 'ToE Testing', href: '/toe', icon: Cpu },
  { label: 'Remediation & MAP', href: '/remediation', icon: Target },
  { label: 'Continuous Monitoring', href: '/ccm', icon: Activity },
  { label: 'Certification', href: '/certification', icon: BadgeCheck }
];

function formatNumber(value: number) {
  return new Intl.NumberFormat('id-ID').format(value || 0);
}

export default function DashboardPage() {
  const { institutionName, currentUser } = useRole();
  const [data, setData] = useState<Required<DashboardPayload>>({
    metrics: emptyMetrics,
    executiveQandA: [],
    recentAuditLogs: []
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/dashboard', { cache: 'no-store' });
      if (!response.ok) throw new Error('Dashboard data unavailable');

      const payload: DashboardPayload = await response.json();
      setData({
        metrics: { ...emptyMetrics, ...(payload.metrics || {}) },
        executiveQandA: payload.executiveQandA || [],
        recentAuditLogs: payload.recentAuditLogs || []
      });
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dashboard data unavailable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const metrics = data.metrics;

  const keyMetrics = useMemo(
    () => [
      {
        label: 'Business Processes',
        value: metrics.totalProcesses,
        note: `${metrics.criticalProcesses} proses berstatus critical`,
        icon: Layers,
        href: '/processes',
        tone: 'sky'
      },
      {
        label: 'Registered Risks',
        value: metrics.totalRisks,
        note: `${metrics.criticalRisks} critical · ${metrics.highRisks} high`,
        icon: AlertTriangle,
        href: '/risks',
        tone: 'rose'
      },
      {
        label: 'Active Controls',
        value: metrics.totalControls,
        note: `${metrics.keyControls} key controls`,
        icon: Shield,
        href: '/controls',
        tone: 'emerald'
      },
      {
        label: 'Open Action Items',
        value: metrics.openIssues,
        note: `${metrics.overdueMAP} MAP overdue`,
        icon: Target,
        href: '/remediation',
        tone: 'amber'
      }
    ],
    [metrics]
  );

  const toneClasses: Record<string, { card: string; icon: string; value: string }> = {
    sky: {
      card: 'border-sky-100 bg-gradient-to-br from-white to-sky-50/70',
      icon: 'bg-sky-100 text-sky-700',
      value: 'text-sky-950'
    },
    rose: {
      card: 'border-rose-100 bg-gradient-to-br from-white to-rose-50/70',
      icon: 'bg-rose-100 text-rose-700',
      value: 'text-rose-950'
    },
    emerald: {
      card: 'border-emerald-100 bg-gradient-to-br from-white to-emerald-50/70',
      icon: 'bg-emerald-100 text-emerald-700',
      value: 'text-emerald-950'
    },
    amber: {
      card: 'border-amber-100 bg-gradient-to-br from-white to-amber-50/70',
      icon: 'bg-amber-100 text-amber-700',
      value: 'text-amber-950'
    }
  };

  return (
    <div className="space-y-6 sm:space-y-7">
      <section className="relative overflow-hidden rounded-[28px] border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-blue-100/70 shadow-[0_20px_60px_-30px_rgba(2,132,199,0.45)]">
        <div className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full bg-sky-300/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-1/4 h-64 w-64 rounded-full bg-blue-400/15 blur-3xl" />

        <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.45fr_0.75fr] lg:p-9">
          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-sky-200 bg-white/85 px-3 py-1.5 text-xs font-bold text-sky-800 shadow-sm backdrop-blur">
                <Building2 className="h-4 w-4 shrink-0" />
                <span className="truncate">{institutionName}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-slate-600">
                <Shield className="h-3.5 w-3.5 text-brand-600" />
                {currentUser.roleTitle}
              </div>
            </div>

            <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-brand-600">Total ARC Command Center</p>
            <h1 className="max-w-4xl text-3xl font-black leading-[1.06] tracking-tight text-slate-950 sm:text-4xl lg:text-[46px]">
              Assurance, Risk & Control
              <span className="block text-brand-700">dalam satu pandangan yang lebih jelas.</span>
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600 sm:text-[15px]">
              Pantau proses, risiko, kontrol, pengujian, remediation, dan continuous monitoring dari satu dashboard yang menggunakan data persisten pada sistem.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/rcm"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-sky-200 transition hover:bg-brand-700"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Open Dynamic RCM
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/toe"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/85 px-4 py-2.5 text-xs font-bold text-slate-800 shadow-sm transition hover:border-brand-200 hover:text-brand-700"
              >
                <Cpu className="h-4 w-4 text-brand-600" />
                ToE Workpaper
              </Link>
            </div>
          </div>

          <div className="self-stretch rounded-2xl border border-white/80 bg-slate-950/[0.93] p-5 text-white shadow-2xl shadow-sky-900/10 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-300">Live Assurance Snapshot</div>
                <div className="mt-1 text-lg font-bold">Current control environment</div>
              </div>
              <div className="rounded-xl bg-white/10 p-2">
                <Sparkles className="h-5 w-5 text-sky-300" />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-white/[0.06] px-3.5 py-3">
                <span className="text-xs text-slate-300">ToE exceptions</span>
                <span className="text-lg font-black">{formatNumber(metrics.totalExceptions)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white/[0.06] px-3.5 py-3">
                <span className="text-xs text-slate-300">Failed / ineffective ToE</span>
                <span className="text-lg font-black">{formatNumber(metrics.failedToEs)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white/[0.06] px-3.5 py-3">
                <span className="text-xs text-slate-300">Healthy CCM rules</span>
                <span className="text-lg font-black">{formatNumber(metrics.ccmHealthy)}</span>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-4 text-[11px] text-slate-300">
              {error ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-300" />
                  Data source sedang tidak tersedia
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  Metrics berasal dari database terhubung
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}. Total ARC tidak mengganti kegagalan ini dengan data demo atau simulasi.</span>
          </div>
          <button onClick={() => void loadDashboard()} className="inline-flex shrink-0 items-center gap-1 font-bold hover:text-rose-950">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-black text-slate-950 sm:text-lg">Quick Access</h2>
            <p className="mt-0.5 text-xs text-slate-500">Masuk langsung ke pekerjaan yang paling sering digunakan.</p>
          </div>
          <span className="hidden text-[11px] font-semibold text-slate-400 sm:inline">
            {loading ? 'Memuat data…' : 'Operational workspace'}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${item.accent} p-4 text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg`}
              >
                <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/10" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className={`rounded-xl p-2.5 ${item.iconBg}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 opacity-70 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </div>
                <div className="relative mt-4 text-sm font-black">{item.title}</div>
                <p className="relative mt-1 min-h-[34px] text-[11px] leading-4 text-white/80">{item.description}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-950 sm:text-lg">Key Metrics</h2>
            <p className="mt-0.5 text-xs text-slate-500">Ringkasan kondisi GRC berdasarkan record yang tersimpan saat ini.</p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <Clock3 className="h-3.5 w-3.5" />
            {lastUpdated ? `Diperbarui ${lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : 'Menunggu data'}
            {!error && !loading && <span className="ml-1 h-2 w-2 rounded-full bg-emerald-500" title="Data loaded" />}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {keyMetrics.map((item) => {
            const Icon = item.icon;
            const tone = toneClasses[item.tone];
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`group rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tone.card}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className={`rounded-xl p-2.5 ${tone.icon}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                </div>
                <div className={`mt-4 text-3xl font-black tracking-tight ${tone.value}`}>
                  {loading ? '—' : formatNumber(item.value)}
                </div>
                <div className="mt-1 text-xs font-bold text-slate-700">{item.label}</div>
                <div className="mt-1 text-[11px] text-slate-500">{item.note}</div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-black text-slate-950 sm:text-lg">Core Modules</h2>
              <p className="mt-0.5 text-xs text-slate-500">Seluruh capability utama Total ARC dalam satu area.</p>
            </div>
            <Network className="h-5 w-5 text-brand-600" />
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {modules.map((module) => {
              const Icon = module.icon;
              return (
                <Link
                  key={module.href}
                  href={module.href}
                  className="group rounded-xl border border-slate-200 bg-slate-50/60 p-3 transition hover:border-brand-200 hover:bg-brand-50/60"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-brand-700 shadow-sm ring-1 ring-slate-200 transition group-hover:ring-brand-200">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="mt-2 text-[11px] font-bold leading-4 text-slate-700 group-hover:text-brand-800">{module.label}</div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-black text-slate-950 sm:text-lg">Recent Activity</h2>
              <p className="mt-0.5 text-xs text-slate-500">Aktivitas terbaru dari audit trail yang tersimpan.</p>
            </div>
            <Activity className="h-5 w-5 text-brand-600" />
          </div>

          <div className="space-y-1">
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : data.recentAuditLogs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <Activity className="mx-auto h-5 w-5 text-slate-300" />
                <div className="mt-2 text-xs font-semibold text-slate-500">Belum ada audit-log yang tersimpan.</div>
              </div>
            ) : (
              data.recentAuditLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-50">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                    <Activity className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold text-slate-800">{log.action} · {log.entityType}</div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-500">{log.reason || 'Tidak ada catatan alasan tambahan.'}</div>
                    <div className="mt-1 text-[10px] text-slate-400">{new Date(log.timestamp).toLocaleString('id-ID')}</div>
                  </div>
                  <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300" />
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-950 sm:text-lg">Executive Assurance Indicators</h2>
            <p className="mt-0.5 text-xs text-slate-500">Interpretasi ringkas yang dihitung dari data aktif, bukan narasi statis.</p>
          </div>
          <Link href="/reports" className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800">
            Open analytics <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {data.executiveQandA.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
            Belum ada assurance indicators yang dapat dihitung dari record saat ini.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.executiveQandA.map((item, index) => (
              <div key={`${item.question}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs font-bold leading-5 text-slate-900">{item.question}</div>
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-brand-700 ring-1 ring-slate-200">
                    {item.status}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-slate-600">{item.summary}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4">
          <h2 className="text-base font-black text-slate-950">End-to-End Traceability</h2>
          <p className="mt-0.5 text-xs text-slate-500">Telusuri hubungan process → risk → control → testing → remediation secara konsisten.</p>
        </div>
        <TraceabilityFlow currentStep="Dashboard" />
      </section>
    </div>
  );
}
