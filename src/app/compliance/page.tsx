'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity, AlertTriangle, ArrowRight, BookOpenCheck, CalendarClock,
  CheckCircle2, ClipboardCheck, FileText, Link2, Loader2,
  RefreshCw, ShieldCheck, ShieldAlert, Users
} from 'lucide-react';

type Metrics = {
  totalObligations: number;
  activeObligations: number;
  draftObligations: number;
  compliant: number;
  partial: number;
  nonCompliant: number;
  notAssessed: number;
  notApplicable: number;
  mapped: number;
  unmapped: number;
  ownerMissing: number;
  overdueAssessments: number;
  assessmentsNext30Days: number;
  highRiskGaps: number;
  reportingObligations: number;
  openAssessmentActions: number;
  overdueAssessmentActions: number;
  policies: number;
  regulations: number;
  openPolicyActions: number;
  highImpactPolicyActions: number;
  complianceRate: number | null;
  mappingRate: number | null;
};
type Priority = {
  id: string;
  obligationCode: string;
  requirementText: string;
  criticality: string;
  complianceStatus: string;
  ownerName: string | null;
  dueDate: string | null;
  nextAssessmentDate: string | null;
  regulationCode: string | null;
  regulator: string | null;
};
type Report = {
  institutionId: string;
  institutionName: string;
  generatedAt: string;
  asOfDate: string;
  dataUpdatedAt: string | null;
  metrics: Metrics;
  priorities: Priority[];
  byOwner: Array<{ owner: string; total: number; gaps: number; unassessed: number }>;
  methodology: { source: string; note: string; limitations: string };
};
type Filter = 'all' | 'gaps' | 'unassessed' | 'overdue';

function shortDate(date: string | null) {
  if (!date) return 'Belum dijadwalkan';
  const parsed = new Date(date.length === 10 ? date + 'T00:00:00' : date);
  if (Number.isNaN(parsed.getTime())) return 'Tanggal tidak valid';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric'
  }).format(parsed);
}

const labels: Record<string, string> = {
  COMPLIANT: 'Patuh tercatat',
  PARTIAL: 'Patuh sebagian',
  NON_COMPLIANT: 'Tidak patuh',
  NOT_ASSESSED: 'Belum dinilai',
  NOT_APPLICABLE: 'Tidak berlaku'
};

function statusTone(value: string) {
  if (value === 'NON_COMPLIANT') return 'border-rose-200 bg-rose-50 text-rose-800';
  if (value === 'PARTIAL') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (value === 'COMPLIANT') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

function MetricCard({
  label, value, detail, Icon, alert
}: {
  label: string; value: string | number; detail: string;
  Icon: typeof ShieldCheck; alert?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <div className={'mt-2 text-3xl font-bold tabular-nums tracking-tight ' +
            (alert ? 'text-rose-800' : 'text-slate-900')}>{value}</div>
        </div>
        <div className={'rounded-xl p-2.5 ' +
          (alert ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-800')}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">{detail}</p>
    </div>
  );
}

export default function ComplianceDashboardPage() {
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError('');
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/compliance/dashboard', {
        cache: 'no-store', credentials: 'same-origin', signal: controller.signal
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Data Compliance belum tersedia.');
      if (!payload.metrics || !payload.institutionId) throw new Error('Respons dashboard tidak lengkap.');
      setData(payload as Report);
    } catch (err) {
      if (controller !== activeRequest.current) return;
      setError(err instanceof DOMException && err.name === 'AbortError'
        ? 'Koneksi data melewati 15 detik. Silakan coba kembali.'
        : err instanceof Error ? err.message : 'Dashboard gagal dimuat.');
    } finally {
      window.clearTimeout(timeout);
      if (controller === activeRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => activeRequest.current?.abort();
  }, [load]);

  const priorities = useMemo(() => {
    if (!data) return [];
    if (filter === 'gaps') {
      return data.priorities.filter(item => ['PARTIAL', 'NON_COMPLIANT'].includes(item.complianceStatus));
    }
    if (filter === 'unassessed') {
      return data.priorities.filter(item => item.complianceStatus === 'NOT_ASSESSED');
    }
    if (filter === 'overdue') {
      return data.priorities.filter(item => Boolean(item.nextAssessmentDate && item.nextAssessmentDate < data.asOfDate));
    }
    return data.priorities;
  }, [data, filter]);

  if (loading && !data) {
    return (
      <div className="space-y-4 p-1" role="status" aria-label="Memuat Compliance Dashboard">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-medium text-slate-700">
          <Loader2 className="mr-2 inline-block h-5 w-5 animate-spin" />
          Menyiapkan indikator Compliance dari database institusi aktif...
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0,1,2,3].map(item => <div key={item} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <section className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-6" role="alert">
        <AlertTriangle className="mb-3 h-6 w-6 text-amber-700" />
        <h1 className="text-xl font-bold text-slate-900">Compliance Dashboard belum dapat dibuka</h1>
        <p className="mt-2 text-sm text-slate-600">{error || 'Tidak ada respons dari database.'}</p>
        <button type="button" onClick={() => void load()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">
          <RefreshCw className="h-4 w-4" /> Coba Lagi
        </button>
      </section>
    );
  }

  const m = data.metrics;
  const segments = [
    { label: 'Patuh tercatat', count: m.compliant, cls: 'bg-emerald-600' },
    { label: 'Patuh sebagian', count: m.partial, cls: 'bg-amber-500' },
    { label: 'Tidak patuh', count: m.nonCompliant, cls: 'bg-rose-600' },
    { label: 'Belum dinilai', count: m.notAssessed, cls: 'bg-slate-400' },
    { label: 'Tidak berlaku', count: m.notApplicable, cls: 'bg-slate-200' }
  ];
  const percent = (count: number) => m.activeObligations > 0
    ? Math.min(100, Math.max(0, (count / m.activeObligations) * 100)) : 0;

  return (
    <main className="mx-auto max-w-7xl space-y-5 pb-12">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-sky-800">
              <ShieldCheck className="h-4 w-4" /> COMPLIANCE MANAGEMENT
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">Compliance Dashboard 360</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Status kewajiban regulator, pemetaan proses dan kontrol, serta tindak lanjut Kepatuhan dari data TotalARC.
            </p>
            <p className="mt-2 text-xs font-medium text-slate-500">
              {data.institutionName} · Per {shortDate(data.asOfDate)} · Pembaruan data {shortDate(data.dataUpdatedAt)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" onClick={() => void load()} disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60">
              <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} /> Refresh
            </button>
            <Link href="/compliance/monitoring" className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-bold text-sky-900 hover:bg-sky-100">Monitoring Plan <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/compliance/risk-assessment" className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-bold text-sky-900 hover:bg-sky-100">Risk Assessment <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/compliance/testing" className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-bold text-sky-900 hover:bg-sky-100">Testing & Review <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/policy-library?tab=obligations"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
              Compliance Universe <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {error} Data terakhir yang berhasil dimuat tetap ditampilkan.
        </div>
      )}

      {m.activeObligations === 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900" role="status">
          Belum ada kewajiban berstatus aktif untuk institusi ini. Indikator tidak boleh ditafsirkan sebagai Bank sudah patuh.
          {m.draftObligations > 0 ? ' Terdapat ' + m.draftObligations + ' kewajiban nonaktif/draft yang perlu divalidasi.' : ''}
        </div>
      )}

      <section aria-label="Indikator utama" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Kewajiban aktif" value={m.activeObligations} detail={m.draftObligations + ' ketentuan masih draft/nonaktif'}
          Icon={BookOpenCheck} />
        <MetricCard label="Patuh tercatat" value={m.complianceRate === null ? '—' : m.complianceRate + '%'}
          detail={m.compliant + ' dari ' + (m.activeObligations - m.notApplicable) + ' kewajiban berlaku & dapat dinilai'}
          Icon={ShieldCheck} />
        <MetricCard label="Gap tinggi/kritis" value={m.highRiskGaps}
          detail="Status partial/non-compliant dengan criticality Tinggi/Kritis" Icon={ShieldAlert}
          alert={m.highRiskGaps > 0} />
        <MetricCard label="Aksi terlambat" value={m.overdueAssessmentActions}
          detail={m.openAssessmentActions + ' tindak lanjut assessment yang masih terbuka'}
          Icon={CalendarClock} alert={m.overdueAssessmentActions > 0} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">Distribusi kepatuhan</h2>
            <span className="text-xs font-medium text-slate-500">{m.activeObligations} kewajiban aktif</span>
          </div>
          <div className="mt-5 flex h-4 overflow-hidden rounded-full bg-slate-100" aria-label="Proporsi status kewajiban">
            {segments.map(s => <div key={s.label} className={s.cls} style={{ width: percent(s.count) + '%' }} title={s.label + ': ' + s.count} />)}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">
            {segments.map(s => (
              <div key={s.label} className="flex items-center gap-2 text-xs text-slate-700">
                <span className={'h-2.5 w-2.5 shrink-0 rounded-full ' + s.cls} />
                <span>{s.label}: <strong className="tabular-nums">{s.count}</strong></span>
              </div>
            ))}
          </div>
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
            Persentase berasal dari status assessment yang tersimpan. Belum dinilai bukan patuh, dan status tidak berlaku tidak masuk penyebut rasio patuh.
          </p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-900">Kualitas pemetaan</h2>
          <div className="mt-4 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold tabular-nums">{m.mappingRate === null ? '—' : m.mappingRate + '%'}</span>
            <span className="text-xs text-slate-500">{m.mapped} / {m.activeObligations} punya relasi</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-sky-700" style={{ width: (m.mappingRate || 0) + '%' }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xl font-bold tabular-nums text-slate-900">{m.unmapped}</div>
              <p className="mt-1 text-xs text-slate-500">Belum punya relasi</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xl font-bold tabular-nums text-slate-900">{m.ownerMissing}</div>
              <p className="mt-1 text-xs text-slate-500">Tanpa owner terdaftar</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">Satu hubungan dokumen tidak menjamin rantai BPM–Risk–Control–Evidence lengkap.</p>
        </section>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Sinyal lanjutan">
        <MetricCard label="Review lewat tenggat" value={m.overdueAssessments}
          detail={m.assessmentsNext30Days + ' jatuh tempo 30 hari ke depan'} Icon={CalendarClock}
          alert={m.overdueAssessments > 0} />
        <MetricCard label="Regulasi terdaftar" value={m.regulations}
          detail={m.reportingObligations + ' kewajiban bertipe pelaporan aktif'} Icon={FileText} />
        <MetricCard label="SOP/Policy terdaftar" value={m.policies}
          detail="Jumlah seluruh ketentuan internal dalam Policy Library" Icon={ClipboardCheck} />
        <MetricCard label="Aksi dampak regulasi" value={m.openPolicyActions}
          detail={m.highImpactPolicyActions + ' berdampak tinggi/kritis'} Icon={Activity}
          alert={m.highImpactPolicyActions > 0} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">Daftar perhatian prioritas</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Maksimal 12 kewajiban aktif, diurutkan berdasarkan status dan kritikalitas.</p>
            </div>
            <label className="text-xs font-semibold text-slate-600">
              <span className="sr-only">Filter prioritas</span>
              <select value={filter} onChange={event => setFilter(event.target.value as Filter)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto">
                <option value="all">Semua prioritas</option>
                <option value="gaps">Gap kepatuhan</option>
                <option value="unassessed">Belum dinilai</option>
                <option value="overdue">Assessment terlambat</option>
              </select>
            </label>
          </div>
          <div className="divide-y divide-slate-100">
            {priorities.map(item => (
              <article key={item.id} className="p-4 md:px-5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-sky-800">{item.obligationCode}</span>
                  <span className={'rounded-full border px-2 py-0.5 font-semibold ' + statusTone(item.complianceStatus)}>
                    {labels[item.complianceStatus] || item.complianceStatus}
                  </span>
                  {(item.criticality === 'Tinggi' || item.criticality === 'Kritis') &&
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-800">{item.criticality}</span>}
                </div>
                <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-900">{item.requirementText}</h3>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>{item.regulator || 'Regulator'} · {item.regulationCode || 'Belum ada kode'}</span>
                  <span>Owner: {item.ownerName || 'Belum ditetapkan'}</span>
                  <span>Assessment: {shortDate(item.nextAssessmentDate)}</span>
                </div>
              </article>
            ))}
            {priorities.length === 0 && (
              <p className="p-6 text-sm text-slate-500">
                {m.activeObligations === 0 ? 'Belum ada kewajiban aktif.' : 'Tidak ada item pada filter ini di 12 prioritas teratas.'}
              </p>
            )}
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
            <Link href="/policy-library?tab=obligations" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-800">
              Kelola kewajiban di Compliance Universe <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-sky-800" />
            <h2 className="text-base font-bold text-slate-900">Owner kewajiban</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">8 kelompok owner teratas, berdasarkan gap dan belum dinilai.</p>
          <div className="mt-4 space-y-3">
            {data.byOwner.map((item, i) => (
              <div key={item.owner + i} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 break-words text-sm font-semibold text-slate-800">{item.owner}</div>
                  <div className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">{item.total} kewajiban</div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                  <span className="font-semibold text-rose-700">{item.gaps} gap</span>
                  <span>{item.unassessed} belum dinilai</span>
                </div>
              </div>
            ))}
            {data.byOwner.length === 0 && <p className="py-5 text-sm text-slate-500">Belum ada owner kewajiban aktif.</p>}
          </div>
        </section>
      </div>

      <footer className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-600">
        <p className="flex items-center gap-2 font-bold text-slate-800"><Link2 className="h-4 w-4" /> Transparansi data dan batasan</p>
        <p className="mt-1">{data.methodology.note}</p>
        <p>{data.methodology.limitations}</p>
        <p className="mt-1">Sumber: {data.methodology.source}. Dashboard ini bersifat read-only; perubahan dilakukan melalui modul asal.</p>
      </footer>
    </main>
  );
}
