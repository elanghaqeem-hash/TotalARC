'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileCheck,
  Filter,
  History,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck
} from 'lucide-react';

const emptyCreate = {
  sourceCloseId: '',
  sourceSnapshotVersion: '',
  rollForwardName: '',
  targetScopeName: '',
  targetFiscalYear: '',
  targetReportingPeriod: '',
  preparedBy: '',
  changeAssessmentSummary: '',
  createTestingCycle: false,
  cycleName: '',
  cycleStartDate: '',
  cycleEndDate: '',
  testingStrategy: '',
  defaultTester: '',
  defaultReviewer: ''
};

const emptyReview = {
  itemId: '',
  decision: 'Carry Forward',
  reviewedBy: '',
  reviewerNotes: ''
};

const emptyFinalize = {
  reviewerName: '',
  materialityConfirmed: false,
  scopeConfirmed: false,
  deficiencyFollowUpConfirmed: false
};

function tone(value: string) {
  if (value === 'Unchanged' || value === 'Finalized' || value === 'Carry Forward') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (value === 'Changed' || value === 'Revalidate' || value === 'Pending') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  if (value === 'Missing / Retired' || value === 'Replace' || value === 'Exclude') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function IcofrRollForwardPage() {
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState(emptyCreate);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [reviewForm, setReviewForm] = useState(emptyReview);
  const [finalizeForm, setFinalizeForm] = useState(emptyFinalize);
  const [domainFilter, setDomainFilter] = useState('ALL');
  const [changeFilter, setChangeFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/icofr/roll-forward', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Roll-forward data unavailable.');
      setData(body);
      if (!selectedRunId && body.rollForwards?.[0]?.id) setSelectedRunId(body.rollForwards[0].id);
      if (!form.sourceCloseId && body.sourceCloses?.[0]?.id) {
        applySourceClose(body.sourceCloses[0], body);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Roll-forward data unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const applySourceClose = (close: any, sourceData = data) => {
    if (!close) return;
    const fiscalYear = Number(close.scope?.fiscalYear || 0);
    const targetYear = fiscalYear > 0 ? fiscalYear + 1 : '';
    const reportingPeriod = close.scope?.reportingPeriod || close.period || '';
    const latestVersion = close.versions?.[0] || close.snapshotVersion || '';
    const baseName = close.scope?.scopeName || 'ICOFR Scope';

    setForm(current => ({
      ...current,
      sourceCloseId: close.id,
      sourceSnapshotVersion: String(latestVersion),
      targetFiscalYear: String(targetYear),
      targetReportingPeriod: reportingPeriod,
      rollForwardName: targetYear ? `FY${targetYear} ICOFR Roll-Forward` : current.rollForwardName,
      targetScopeName: targetYear ? `${baseName} - FY${targetYear}` : current.targetScopeName,
      cycleName: targetYear ? `FY${targetYear} ICOFR Testing Cycle` : current.cycleName
    }));
  };

  const post = async (payload: any, successMessage: string) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/icofr/roll-forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to process roll-forward action.');
      setMessage(successMessage);
      await load();
      return body;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process roll-forward action.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const selectedRun = useMemo(
    () => data?.rollForwards?.find((item: any) => item.id === selectedRunId) || null,
    [data, selectedRunId]
  );

  const domains = useMemo(
    () =>
      Array.from(
        new Set((selectedRun?.items || []).map((item: any) => String(item.domain)))
      ).sort(),
    [selectedRun]
  );

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (selectedRun?.items || []).filter((item: any) => {
      if (domainFilter !== 'ALL' && item.domain !== domainFilter) return false;
      if (changeFilter !== 'ALL' && item.changeFlag !== changeFilter) return false;
      if (pendingOnly && item.decision !== 'Pending' && !item.requiresRevalidation) return false;
      if (
        needle &&
        ![
          item.sourceCode,
          item.sourceName,
          item.domain,
          item.changedFields,
          item.recommendation,
          item.decision
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)
      ) {
        return false;
      }
      return true;
    });
  }, [selectedRun, domainFilter, changeFilter, pendingOnly, query]);

  const chooseItem = (item: any) => {
    setSelectedItem(item);
    setReviewForm({
      itemId: item.id,
      decision: item.decision === 'Pending' ? 'Carry Forward' : item.decision,
      reviewedBy: item.reviewedBy || '',
      reviewerNotes: item.reviewerNotes || ''
    });
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-indigo-600">
              <History className="h-4 w-4" /> ICOFR Roll-Forward & New Period Setup
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">
              Carry Forward the Prior Closed Period Without Rebuilding the Program
            </h1>
            <p className="mt-1 max-w-5xl text-xs leading-5 text-slate-500">
              Start a new fiscal period from an immutable closed-period snapshot. Total ARC copies the prior scope as a draft baseline,
              reuses current master records, flags year-over-year changes, carries open deficiency/MAP follow-up, and requires explicit
              revalidation before the roll-forward can be finalized.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-50"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold">
          <Link href="/icofr/period-close" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
            Period Close & Archive
          </Link>
          <Link href="/icofr/scoping" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
            Scoping & Materiality
          </Link>
          <Link href="/icofr/traceability" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
            Traceability
          </Link>
          <Link href="/icofr/testing-plan" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
            Testing Plan
          </Link>
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

      {!loading && !data?.institution ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">
          Register an institution and complete at least one ICOFR period before using roll-forward.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {[
              ['Roll-forward runs', data?.metrics?.rollForwardRuns || 0],
              ['Finalized', data?.metrics?.finalizedRuns || 0],
              ['Draft', data?.metrics?.draftRuns || 0],
              ['Changed items', data?.metrics?.changedItems || 0],
              ['Pending decisions', data?.metrics?.pendingDecisions || 0],
              ['Prior deficiencies', data?.metrics?.priorDeficiencies || 0]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                <div className="mt-1 text-xl font-black text-slate-900">{value}</div>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <form
              onSubmit={async event => {
                event.preventDefault();
                const result = await post(
                  {
                    actionType: 'CREATE_ROLL_FORWARD',
                    ...form,
                    sourceSnapshotVersion: Number(form.sourceSnapshotVersion),
                    targetFiscalYear: Number(form.targetFiscalYear)
                  },
                  'New ICOFR period baseline created from the selected immutable snapshot.'
                );
                if (result?.id) {
                  setSelectedRunId(result.id);
                  setForm(emptyCreate);
                }
              }}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">1. Create New Period Baseline</h2>
                  <p className="text-[10px] text-slate-500">
                    Source data comes only from a persisted closed-period snapshot. Prior testing results are never copied as current-period evidence.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Source closed period *
                  <select
                    required
                    value={form.sourceCloseId}
                    onChange={event => {
                      const close = data?.sourceCloses?.find((item: any) => item.id === event.target.value);
                      applySourceClose(close);
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="">Select closed period</option>
                    {(data?.sourceCloses || []).map((item: any) => (
                      <option key={item.id} value={item.id}>
                        {item.period} · {item.scope?.scopeName || 'ICOFR scope'} · latest v{item.versions?.[0] || item.snapshotVersion}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Source snapshot version *
                  <select
                    required
                    value={form.sourceSnapshotVersion}
                    onChange={event => setForm({ ...form, sourceSnapshotVersion: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="">Select version</option>
                    {(
                      data?.sourceCloses?.find((item: any) => item.id === form.sourceCloseId)?.versions || []
                    ).map((version: number) => (
                      <option key={version} value={version}>Snapshot v{version}</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Target fiscal year *
                  <input
                    type="number"
                    required
                    min={2000}
                    max={2200}
                    value={form.targetFiscalYear}
                    onChange={event => setForm({ ...form, targetFiscalYear: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Target reporting period *
                  <input
                    required
                    value={form.targetReportingPeriod}
                    onChange={event => setForm({ ...form, targetReportingPeriod: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Roll-forward name *
                  <input
                    required
                    value={form.rollForwardName}
                    onChange={event => setForm({ ...form, rollForwardName: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  New-period ICOFR scope name *
                  <input
                    required
                    value={form.targetScopeName}
                    onChange={event => setForm({ ...form, targetScopeName: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Prepared by *
                  <input
                    required
                    value={form.preparedBy}
                    onChange={event => setForm({ ...form, preparedBy: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Current-period change assessment summary
                  <textarea
                    rows={3}
                    value={form.changeAssessmentSummary}
                    onChange={event => setForm({ ...form, changeAssessmentSummary: event.target.value })}
                    placeholder="Document known changes in organization, products, processes, systems, accounting standards, regulatory requirements or financial reporting risks."
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5"
                  />
                </label>

                <label className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[11px] font-bold text-sky-800">
                  <input
                    type="checkbox"
                    checked={form.createTestingCycle}
                    onChange={event => setForm({ ...form, createTestingCycle: event.target.checked })}
                  />
                  Also create a blank target-period Testing Cycle. Prior-period ToD/ToE evidence is not copied.
                </label>

                {form.createTestingCycle && (
                  <>
                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Cycle name *
                      <input
                        required
                        value={form.cycleName}
                        onChange={event => setForm({ ...form, cycleName: event.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Cycle start *
                      <input
                        type="date"
                        required
                        value={form.cycleStartDate}
                        onChange={event => setForm({ ...form, cycleStartDate: event.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Cycle end *
                      <input
                        type="date"
                        required
                        value={form.cycleEndDate}
                        onChange={event => setForm({ ...form, cycleEndDate: event.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Testing strategy *
                      <textarea
                        required
                        rows={2}
                        value={form.testingStrategy}
                        onChange={event => setForm({ ...form, testingStrategy: event.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Default tester
                      <input
                        value={form.defaultTester}
                        onChange={event => setForm({ ...form, defaultTester: event.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Default reviewer
                      <input
                        value={form.defaultReviewer}
                        onChange={event => setForm({ ...form, defaultReviewer: event.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      />
                    </label>
                  </>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-5 text-amber-800">
                Prior-period materiality values are copied only as a starting baseline. The target scope remains <strong>Draft</strong> and
                cannot complete roll-forward until materiality, scope, changes and prior-period deficiency follow-up are explicitly reviewed.
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  disabled={saving || !data?.sourceCloses?.length}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                >
                  <ArrowRight className="h-4 w-4" /> Create new-period baseline
                </button>
              </div>
            </form>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">Roll-Forward Register</h2>
                  <p className="text-[10px] text-slate-500">Select a run to review year-over-year changes and carry-forward decisions.</p>
                </div>
              </div>

              {(data?.rollForwards || []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                  No roll-forward run has been created.
                </div>
              ) : (
                <div className="space-y-3">
                  {(data?.rollForwards || []).map((item: any) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedRunId(item.id);
                        setSelectedItem(null);
                      }}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        selectedRunId === item.id
                          ? 'border-brand-300 bg-brand-50/40'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap gap-1.5">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${tone(item.status)}`}>
                              {item.status}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-600">
                              FY{item.targetFiscalYear} · {item.targetReportingPeriod}
                            </span>
                          </div>
                          <div className="mt-1 text-xs font-black text-slate-900">{item.rollForwardName}</div>
                          <div className="mt-1 text-[10px] text-slate-500">
                            {item.targetScope?.scopeName || 'Target scope'} · {item.summary?.totalItems || 0} review items
                          </div>
                        </div>
                        <div className="text-right text-[9px] text-slate-400">
                          <div>{item.summary?.changed || 0} changed</div>
                          <div>{item.summary?.pendingDecisions || 0} pending</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </section>

          {selectedRun && (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${tone(selectedRun.status)}`}>
                        {selectedRun.status}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-600">
                        FY{selectedRun.targetFiscalYear} · {selectedRun.targetReportingPeriod}
                      </span>
                    </div>
                    <h2 className="mt-1 text-lg font-black text-slate-900">{selectedRun.rollForwardName}</h2>
                    <p className="mt-1 text-[10px] text-slate-500">
                      New scope: {selectedRun.targetScope?.scopeName || '—'} · Prepared by {selectedRun.preparedBy}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/icofr/scoping"
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600"
                    >
                      <FileCheck className="h-3.5 w-3.5" /> Review target scope
                    </Link>
                    {selectedRun.targetCycle && (
                      <Link
                        href="/icofr/testing-plan"
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600"
                      >
                        <CalendarDays className="h-3.5 w-3.5" /> Testing cycle
                      </Link>
                    )}
                    <button
                      type="button"
                      disabled={saving || selectedRun.status === 'Finalized'}
                      onClick={() =>
                        void post(
                          { actionType: 'REFRESH_DELTAS', rollForwardId: selectedRun.id },
                          'Year-over-year deltas refreshed against current Total ARC master records.'
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-[10px] font-bold text-brand-700 disabled:opacity-50"
                    >
                      <RefreshCcw className="h-3.5 w-3.5" /> Refresh deltas
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-7">
                  {[
                    ['Review items', selectedRun.summary?.totalItems || 0],
                    ['Unchanged', selectedRun.summary?.unchanged || 0],
                    ['Changed', selectedRun.summary?.changed || 0],
                    ['Missing / retired', selectedRun.summary?.missingOrRetired || 0],
                    ['Pending', selectedRun.summary?.pendingDecisions || 0],
                    ['Revalidate', selectedRun.summary?.revalidationRequired || 0],
                    ['Open MAP', selectedRun.summary?.openMaps || 0]
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-[8px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                      <div className="mt-1 text-lg font-black text-slate-900">{value}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-sm font-black text-slate-900">2. Year-over-Year Change Assessment</h2>
                    <p className="text-[10px] text-slate-500">
                      Every carried item retains its prior snapshot payload and current-register comparison. Changed or missing records must be resolved explicitly.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <label className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="Search review items"
                        className="w-52 rounded-xl border border-slate-200 py-2 pl-8 pr-3 text-[10px]"
                      />
                    </label>
                    <select
                      value={domainFilter}
                      onChange={event => setDomainFilter(event.target.value)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-[10px]"
                    >
                      <option value="ALL">All domains</option>
                      {domains.map((domain: any) => <option key={domain} value={domain}>{domain}</option>)}
                    </select>
                    <select
                      value={changeFilter}
                      onChange={event => setChangeFilter(event.target.value)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-[10px]"
                    >
                      <option value="ALL">All deltas</option>
                      <option value="Unchanged">Unchanged</option>
                      <option value="Changed">Changed</option>
                      <option value="Missing / Retired">Missing / Retired</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setPendingOnly(!pendingOnly)}
                      className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-[10px] font-bold ${
                        pendingOnly ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      <Filter className="h-3.5 w-3.5" /> Pending only
                    </button>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-[1150px] w-full text-[10px]">
                    <thead className="bg-slate-100 text-slate-500">
                      <tr>
                        <th className="p-2.5 text-left">Domain</th>
                        <th className="p-2.5 text-left">Code / Item</th>
                        <th className="p-2.5 text-left">YoY delta</th>
                        <th className="p-2.5 text-left">Changed fields</th>
                        <th className="p-2.5 text-left">System recommendation</th>
                        <th className="p-2.5 text-left">Decision</th>
                        <th className="p-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((item: any) => (
                        <tr key={item.id} className="border-b border-slate-100 align-top">
                          <td className="p-2.5 font-black text-slate-600">{item.domain}</td>
                          <td className="p-2.5">
                            <div className="font-mono font-bold text-brand-700">{item.sourceCode}</div>
                            <div className="mt-0.5 max-w-[240px] text-slate-700">{item.sourceName}</div>
                          </td>
                          <td className="p-2.5">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${tone(item.changeFlag)}`}>
                              {item.changeFlag}
                            </span>
                          </td>
                          <td className="max-w-[280px] p-2.5 text-slate-500">
                            {item.changedFieldsList?.length ? item.changedFieldsList.slice(0, 8).join(', ') : 'No field-level change detected'}
                          </td>
                          <td className="p-2.5 text-slate-600">{item.recommendation}</td>
                          <td className="p-2.5">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${tone(item.decision)}`}>
                              {item.decision}
                            </span>
                            {item.requiresRevalidation && (
                              <div className="mt-1 text-[9px] font-bold text-amber-600">Revalidation open</div>
                            )}
                          </td>
                          <td className="p-2.5 text-right">
                            <button
                              type="button"
                              disabled={selectedRun.status === 'Finalized'}
                              onClick={() => chooseItem(item)}
                              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[9px] font-bold text-slate-600 disabled:opacity-40"
                            >
                              Review
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {filteredItems.length === 0 && (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                    No roll-forward items match the current filters.
                  </div>
                )}
              </section>

              {selectedItem && selectedRun.status !== 'Finalized' && (
                <form
                  onSubmit={async event => {
                    event.preventDefault();
                    const result = await post(
                      { actionType: 'REVIEW_ITEM', ...reviewForm },
                      'Roll-forward decision saved.'
                    );
                    if (result) setSelectedItem(null);
                  }}
                  className="rounded-2xl border border-brand-200 bg-brand-50/30 p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-black text-slate-900">Review: {selectedItem.sourceCode}</h2>
                      <p className="mt-1 text-[10px] text-slate-500">{selectedItem.domain} · {selectedItem.sourceName}</p>
                    </div>
                    <button type="button" onClick={() => setSelectedItem(null)} className="text-[10px] font-bold text-slate-500">Close</button>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <label className="text-xs font-bold text-slate-700">
                      Decision *
                      <select
                        required
                        value={reviewForm.decision}
                        onChange={event => setReviewForm({ ...reviewForm, decision: event.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"
                      >
                        <option>Carry Forward</option>
                        <option>Revalidate</option>
                        <option>Replace</option>
                        <option>Exclude</option>
                        <option>Carry Forward Follow-up</option>
                        <option>Resolved / Closed</option>
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Reviewed by *
                      <input
                        required
                        value={reviewForm.reviewedBy}
                        onChange={event => setReviewForm({ ...reviewForm, reviewedBy: event.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-700 md:col-span-3">
                      Reviewer notes {['Revalidate', 'Replace', 'Exclude'].includes(reviewForm.decision) ? '*' : ''}
                      <textarea
                        required={['Revalidate', 'Replace', 'Exclude'].includes(reviewForm.decision)}
                        rows={3}
                        value={reviewForm.reviewerNotes}
                        onChange={event => setReviewForm({ ...reviewForm, reviewerNotes: event.target.value })}
                        placeholder="Document the current-period rationale, change assessment and any follow-up required."
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal leading-5"
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
                      <Save className="h-4 w-4" /> Save decision
                    </button>
                  </div>
                </form>
              )}

              <form
                onSubmit={event => {
                  event.preventDefault();
                  void post(
                    {
                      actionType: 'FINALIZE_ROLL_FORWARD',
                      rollForwardId: selectedRun.id,
                      ...finalizeForm
                    },
                    'ICOFR roll-forward finalized. Target scope moved to Under Review for current-period approval.'
                  );
                }}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="mb-4 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-brand-600" />
                  <div>
                    <h2 className="text-sm font-black text-slate-900">3. Independent Final Review</h2>
                    <p className="text-[10px] text-slate-500">
                      Finalization is blocked while any decision remains Pending or Revalidate. The final reviewer must be different from the preparer.
                    </p>
                  </div>
                </div>

                {selectedRun.status === 'Finalized' ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
                    <div className="font-black">Roll-forward finalized</div>
                    <div className="mt-1">
                      Reviewer: {selectedRun.reviewerName || selectedRun.finalizedBy || 'Recorded'} · {selectedRun.finalizedAt || ''}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700 lg:col-span-2">
                      Independent reviewer *
                      <input
                        required
                        value={finalizeForm.reviewerName}
                        onChange={event => setFinalizeForm({ ...finalizeForm, reviewerName: event.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      />
                    </label>

                    {[
                      ['materialityConfirmed', 'Current-period materiality and benchmark have been reassessed and documented.'],
                      ['scopeConfirmed', 'Scope, accounts/assertions, controls, IPE/EUC and traceability have been reviewed for current-period changes.'],
                      ['deficiencyFollowUpConfirmed', 'Prior-period deficiencies and open MAP have been assessed for closure or current-period follow-up.']
                    ].map(([key, label]) => (
                      <label key={key} className="lg:col-span-2 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-bold text-slate-700">
                        <input
                          type="checkbox"
                          checked={(finalizeForm as any)[key]}
                          onChange={event => setFinalizeForm({ ...finalizeForm, [key]: event.target.checked })}
                        />
                        {label}
                      </label>
                    ))}

                    <div className="lg:col-span-2 flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                      <div className="text-[10px] text-slate-500">
                        Remaining: <strong>{selectedRun.summary?.pendingDecisions || 0}</strong> pending decisions and{' '}
                        <strong>{selectedRun.summary?.revalidationRequired || 0}</strong> revalidation items.
                      </div>
                      <button
                        disabled={
                          saving ||
                          Number(selectedRun.summary?.pendingDecisions || 0) > 0 ||
                          Number(selectedRun.summary?.revalidationRequired || 0) > 0
                        }
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Finalize roll-forward
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </>
          )}
        </>
      )}
    </div>
  );
}
