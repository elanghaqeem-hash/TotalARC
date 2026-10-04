'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BarChart3,
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
import { canAccessPage } from '@/lib/access-control';

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
    key: 'rcm',
    title: 'Dynamic RCM',
    description: 'Kelola keterkaitan proses, risiko, dan kontrol.',
    href: '/rcm',
    icon: FileSpreadsheet,
    accent: 'from-sky-400 via-blue-500 to-blue-700',
    iconTone: 'text-blue-600',
    glow: 'bg-cyan-300/35'
  },
  {
    key: 'toe',
    title: 'ToE Workpaper',
    description: 'Uji efektivitas kontrol dan dokumentasikan evidence.',
    href: '/toe',
    icon: Cpu,
    accent: 'from-emerald-400 via-teal-500 to-emerald-700',
    iconTone: 'text-emerald-600',
    glow: 'bg-emerald-300/30'
  },
  {
    key: 'csa',
    title: 'CSA Assessment',
    description: 'Lakukan control self-assessment secara terstruktur.',
    href: '/rcsa',
    icon: ClipboardCheck,
    accent: 'from-violet-400 via-purple-500 to-indigo-700',
    iconTone: 'text-violet-600',
    glow: 'bg-fuchsia-300/25'
  },
  {
    key: 'analytics',
    title: 'Reports & Analytics',
    description: 'Pantau assurance, remediation, dan status kontrol.',
    href: '/reports',
    icon: BarChart3,
    accent: 'from-amber-400 via-orange-500 to-orange-600',
    iconTone: 'text-orange-600',
    glow: 'bg-yellow-300/30'
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
  const { currentUser } = useRole();
  const [data, setData] = useState<{ metrics: typeof emptyMetrics; executiveQandA: NonNullable<DashboardPayload['executiveQandA']>; recentAuditLogs: NonNullable<DashboardPayload['recentAuditLogs']>; }>({
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

  const visibleQuickActions = useMemo(
    () => quickActions.filter(item => canAccessPage(currentUser.role, item.href)),
    [currentUser.role]
  );

  const visibleModules = useMemo(
    () => modules.filter(item => canAccessPage(currentUser.role, item.href)),
    [currentUser.role]
  );

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

  const visibleKeyMetrics = useMemo(
    () => keyMetrics.filter(item => canAccessPage(currentUser.role, item.href)),
    [currentUser.role, keyMetrics]
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
    <div className="w-full min-w-0 max-w-full space-y-6 overflow-x-hidden sm:space-y-7">
      <section className="relative overflow-hidden rounded-[28px] border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-blue-100/70 shadow-[0_20px_60px_-30px_rgba(2,132,199,0.45)]">
        <div className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full bg-sky-300/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-1/4 h-64 w-64 rounded-full bg-blue-400/15 blur-3xl" />

        <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.45fr_0.75fr] lg:p-9">
          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-slate-600">
                <Shield className="h-3.5 w-3.5 text-brand-600" />
                {currentUser.roleTitle}
              </div>
            </div>

            <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-brand-600">Total ARC Command Center</p>
            <h1 className="max-w-3xl text-[28px] font-black leading-[1.08] tracking-tight text-slate-950 sm:text-[32px] lg:text-[38px] xl:text-[40px]">
              Assurance, Risk & Control
              <span className="block text-brand-700">dalam satu pandangan yang lebih jelas.</span>
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600 sm:text-[15px]">
              Pantau proses, risiko, kontrol, pengujian, remediation, dan continuous monitoring dari satu dashboard yang menggunakan data persisten pada sistem.
            </p>

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

          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}.</span>
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

        <div className="grid gap-4 md:grid-cols-2">
          {visibleQuickActions.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative min-h-[190px] overflow-hidden rounded-[26px] border border-white/20 bg-gradient-to-br ${item.accent} p-5 text-white shadow-[0_18px_42px_-22px_rgba(15,23,42,0.55)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-20px_rgba(15,23,42,0.5)] focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 sm:min-h-[205px] sm:p-6`}
              >
                <div className={`pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full ${item.glow} blur-2xl transition duration-500 group-hover:scale-110`} />
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(255,255,255,0.26),transparent_42%)]" />
                <div className="pointer-events-none absolute -bottom-20 -right-16 h-52 w-72 rotate-[-12deg] rounded-[48%] border border-white/15 bg-white/[0.07]" />
                <div className="pointer-events-none absolute -bottom-28 right-12 h-52 w-72 rotate-[-16deg] rounded-[48%] border border-white/10 bg-white/[0.05]" />

                <div className="relative z-20 flex items-start justify-between gap-3">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-white/95 shadow-lg shadow-black/10 ring-1 ring-white/70 ${item.iconTone}`}>
                    <Icon className="h-6 w-6" strokeWidth={2.2} />
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-md shadow-black/10 transition duration-300 group-hover:translate-x-1 group-hover:bg-white">
                    <ArrowRight className="h-5 w-5" strokeWidth={2.4} />
                  </div>
                </div>

                <div className="pointer-events-none absolute right-6 top-[60px] z-10 hidden h-[105px] w-[150px] sm:block">
                  {item.key === 'rcm' && (
                    <>
                      <div className="absolute right-2 top-2 h-[82px] w-[108px] rotate-[-5deg] rounded-2xl border border-white/35 bg-white/20 shadow-xl backdrop-blur-sm" />
                      <div className="absolute right-8 top-0 flex h-[88px] w-[92px] rotate-[4deg] flex-col justify-center rounded-2xl border border-white/50 bg-white/85 p-4 text-blue-500 shadow-xl">
                        <FileSpreadsheet className="h-9 w-9" />
                        <div className="mt-2 h-2 w-12 rounded-full bg-blue-200" />
                        <div className="mt-1 h-2 w-9 rounded-full bg-blue-100" />
                      </div>
                      <div className="absolute bottom-0 right-0 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/60 bg-blue-600/90 text-white shadow-xl">
                        <Shield className="h-7 w-7" />
                      </div>
                    </>
                  )}
                  {item.key === 'toe' && (
                    <>
                      <div className="absolute right-0 top-3 h-[78px] w-[110px] rotate-[5deg] rounded-2xl border border-white/30 bg-white/15 backdrop-blur-sm" />
                      <div className="absolute right-6 top-0 h-[88px] w-[108px] rotate-[-3deg] rounded-2xl border border-white/45 bg-white/30 shadow-xl backdrop-blur-md" />
                      <div className="absolute right-10 top-5 flex h-[78px] w-[92px] flex-col justify-center rounded-2xl bg-white/90 p-4 text-emerald-600 shadow-xl">
                        <ClipboardCheck className="h-8 w-8" />
                        <div className="mt-2 h-2 w-11 rounded-full bg-emerald-200" />
                        <div className="mt-1 h-2 w-8 rounded-full bg-emerald-100" />
                      </div>
                    </>
                  )}
                  {item.key === 'csa' && (
                    <>
                      <div className="absolute bottom-0 right-3 h-[72px] w-[126px] rounded-[50%] border border-white/20 bg-white/10" />
                      <div className="absolute right-8 top-0 flex h-[96px] w-[92px] rotate-[7deg] flex-col items-center justify-center rounded-[20px] border border-white/55 bg-white/90 text-violet-600 shadow-xl">
                        <ClipboardCheck className="h-10 w-10" />
                        <div className="mt-2 grid grid-cols-3 gap-1">
                          <span className="h-2 w-2 rounded-sm bg-violet-300" />
                          <span className="h-2 w-7 rounded-full bg-violet-200" />
                          <span className="h-2 w-2 rounded-sm bg-violet-300" />
                        </div>
                      </div>
                    </>
                  )}
                  {item.key === 'analytics' && (
                    <>
                      <div className="absolute right-0 top-4 h-[82px] w-[118px] rotate-[6deg] rounded-2xl border border-white/30 bg-white/18 backdrop-blur-sm" />
                      <div className="absolute right-7 top-0 flex h-[96px] w-[110px] rotate-[-4deg] items-end gap-2 rounded-2xl border border-white/60 bg-white/90 p-4 text-orange-500 shadow-xl">
                        <span className="h-8 w-4 rounded-t bg-orange-200" />
                        <span className="h-12 w-4 rounded-t bg-orange-300" />
                        <span className="h-16 w-4 rounded-t bg-orange-400" />
                        <span className="mb-1 ml-auto h-11 w-11 rounded-full border-[7px] border-orange-200 border-r-orange-500" />
                      </div>
                    </>
                  )}
                </div>

                <div className="relative z-20 mt-8 max-w-[72%] sm:mt-9 sm:max-w-[58%]">
                  <div className="text-[20px] font-black leading-tight tracking-tight sm:text-[22px]">{item.title}</div>
                  <p className="mt-2 text-[13px] leading-5 text-white/85 sm:text-sm">{item.description}</p>
                </div>
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
          {visibleKeyMetrics.map((item) => {
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

      <section className="grid w-full min-w-0 max-w-full grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-black text-slate-950 sm:text-lg">Core Modules</h2>
              <p className="mt-0.5 max-w-full text-[11px] leading-4 text-slate-500 sm:text-xs">Seluruh capability utama Total ARC dalam satu area.</p>
            </div>
            <Network className="h-5 w-5 shrink-0 text-brand-600" />
          </div>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:grid-cols-3 sm:gap-2.5">
            {visibleModules.map((module) => {
              const Icon = module.icon;
              return (
                <Link
                  key={module.href}
                  href={module.href}
                  className="group min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 transition hover:border-brand-200 hover:bg-brand-50/60 sm:p-3"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-brand-700 shadow-sm ring-1 ring-slate-200 transition group-hover:ring-brand-200">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="mt-2 min-w-0 break-words text-[10px] font-bold leading-4 text-slate-700 group-hover:text-brand-800 sm:text-[11px]">{module.label}</div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-black text-slate-950 sm:text-lg">Recent Activity</h2>
              <p className="mt-0.5 max-w-full text-[11px] leading-4 text-slate-500 sm:text-xs">Aktivitas terbaru dari audit trail yang tersimpan.</p>
            </div>
            <Activity className="h-5 w-5 shrink-0 text-brand-600" />
          </div>

          <div className="min-w-0 space-y-1">
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
                <div key={log.id} className="flex min-w-0 items-start gap-2.5 rounded-xl px-1 py-2.5 transition hover:bg-slate-50 sm:gap-3 sm:px-2">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                    <Activity className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="min-w-0 break-words text-[11px] font-bold leading-4 text-slate-800 sm:text-xs">{log.action} · {log.entityType}</div>
                    <div className="mt-0.5 min-w-0 break-words text-[10px] leading-4 text-slate-500 sm:text-[11px]">{log.reason || 'Tidak ada catatan alasan tambahan.'}</div>
                    <div className="mt-1 text-[10px] leading-4 text-slate-400">{new Date(log.timestamp).toLocaleString('id-ID')}</div>
                  </div>
                  <ChevronRight className="mt-2 hidden h-4 w-4 shrink-0 text-slate-300 sm:block" />
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <TraceabilityFlow currentStep="Dashboard" />

      <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-sky-100 text-brand-700 ring-1 ring-brand-100">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-brand-700">
                Board & Management View
              </div>
              <h2 className="text-xl font-black leading-tight tracking-tight text-slate-950 sm:text-2xl">
                Executive Assurance Intelligence
              </h2>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500 sm:text-sm sm:leading-6">
                Ringkasan assurance yang jelas dan non-teknis untuk membantu Board & Management memahami kondisi risiko, kontrol, pengujian, remediation, dan sign-off.
              </p>
            </div>
          </div>

          {canAccessPage(currentUser.role, '/certification') ? (
            <Link
              href="/certification"
              className="group inline-flex w-full items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-brand-600 to-sky-500 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-sky-100 transition hover:from-brand-700 hover:to-sky-600 lg:w-auto lg:min-w-[250px]"
            >
              <span className="flex items-center gap-2">
                <BadgeCheck className="h-5 w-5" />
                View Sign-Off Attestation
              </span>
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
          ) : canAccessPage(currentUser.role, '/reports') ? (
            <Link
              href="/reports"
              className="group inline-flex w-full items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-brand-600 to-sky-500 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-sky-100 transition hover:from-brand-700 hover:to-sky-600 lg:w-auto lg:min-w-[250px]"
            >
              <span className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                View Assurance Analytics
              </span>
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
          ) : null}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/50 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900">Executive Assurance Signals</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">Dihitung dari record aktif pada database.</p>
            </div>
            {canAccessPage(currentUser.role, '/reports') && (
              <Link href="/reports" className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 hover:text-brand-800">
                Open analytics <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>

          {data.executiveQandA.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5 text-center text-xs text-slate-500">
              Belum ada assurance indicators yang dapat dihitung dari record saat ini.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {data.executiveQandA.map((item, index) => (
                <div key={`${item.question}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs font-black leading-5 text-slate-900">{item.question}</div>
                    <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-black text-brand-700 ring-1 ring-brand-100">
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-slate-600">{item.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
