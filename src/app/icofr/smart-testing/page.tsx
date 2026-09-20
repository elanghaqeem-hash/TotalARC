'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  FileCheck,
  Filter,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles
} from 'lucide-react';

const emptyRun = {
  cycleId: '',
  rollForwardId: '',
  policyName: 'Total ARC Evidence-Based Testing Strategy',
  scopeMode: 'Key Controls Only',
  defaultPlannedStartDate: '',
  defaultDueDate: '',
  defaultTester: '',
  defaultReviewer: '',
  preparedBy: '',
  notes: ''
};

const emptyReview = {
  decisionId: '',
  reviewerDecision: 'Accept Recommendation',
  overrideStrategy: '',
  reviewerName: '',
  reviewerNotes: ''
};

function badge(value: string) {
  if (['Applied', 'Approved', 'Accept Recommendation', 'Prior-Evidence Reliance Candidate'].includes(value)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (['Draft', 'Pending', 'Roll-Forward Test', 'Rotational Test', 'Defer'].includes(value)) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  if (['Critical', 'Full Retest', 'Override'].includes(value)) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function SmartTestingPage() {
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState(emptyRun);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [selectedDecision, setSelectedDecision] = useState<any>(null);
  const [reviewForm, setReviewForm] = useState(emptyReview);
  const [approver, setApprover] = useState('');
  const [query, setQuery] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('ALL');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async (force = false) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/icofr/smart-testing', { cache: force ? 'no-store' : 'default' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Smart testing strategy unavailable.');
      setData(body);
      if (!selectedRunId && body.runs?.[0]?.id) setSelectedRunId(body.runs[0].id);
      if (!form.cycleId && body.cycles?.[0]) applyCycle(body.cycles[0], body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smart testing strategy unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const applyCycle = (cycle: any, source = data) => {
    if (!cycle) return;
    const linkedRollForward = source?.rollForwards?.find(
      (item: any) =>
        item.targetTestingCycleId === cycle.id ||
        (!item.targetTestingCycleId && item.targetScopeId === cycle.scopeId)
    );
    setForm(current => ({
      ...current,
      cycleId: cycle.id,
      rollForwardId: linkedRollForward?.id || '',
      defaultPlannedStartDate: cycle.startDate || '',
      defaultDueDate: cycle.endDate || '',
      defaultTester: current.defaultTester || cycle.defaultTester || '',
      defaultReviewer: current.defaultReviewer || cycle.defaultReviewer || ''
    }));
  };

  const post = async (payload: any, success: string) => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/icofr/smart-testing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to process smart-testing action.');
      setMessage(success);
      await load(true);
      return body;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process smart-testing action.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const selectedRun = useMemo(
    () => data?.runs?.find((item: any) => item.id === selectedRunId) || null,
    [data, selectedRunId]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (selectedRun?.decisions || []).filter((item: any) => {
      const effective = item.overrideStrategy || item.proposedStrategy;
      if (strategyFilter !== 'ALL' && effective !== strategyFilter) return false;
      if (pendingOnly && item.reviewerDecision !== 'Pending') return false;
      if (
        needle &&
        ![
          item.control?.controlCode,
          item.control?.name,
          item.control?.category,
          item.riskRating,
          item.proposedStrategy,
          item.reviewerDecision,
          item.itgcDependencyStatus
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
  }, [selectedRun, strategyFilter, pendingOnly, query]);

  const chooseDecision = (item: any) => {
    setSelectedDecision(item);
    setReviewForm({
      decisionId: item.id,
      reviewerDecision:
        item.reviewerDecision === 'Pending' ? 'Accept Recommendation' : item.reviewerDecision,
      overrideStrategy: item.overrideStrategy || '',
      reviewerName: item.reviewerName || '',
      reviewerNotes: item.reviewerNotes || ''
    });
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-indigo-600">
              <BrainCircuit className="h-4 w-4" /> ICOFR Smart Testing Strategy
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">
              Evidence-Based Reliance & Testing Strategy
            </h1>
            <p className="mt-1 max-w-5xl text-xs leading-5 text-slate-500">
              Build transparent testing recommendations from persisted control attributes, prior ToE results,
              exceptions and deficiencies, linked financial-reporting risk, roll-forward changes, and ITAC-to-ITGC
              dependencies. Recommendations remain advisory until independently reviewed and approved.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-50"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold">
          <Link href="/icofr/roll-forward" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Roll-Forward</Link>
          <Link href="/icofr/testing-plan" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Testing Plan</Link>
          <Link href="/icofr/sampling-evidence" className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">Sampling & Evidence</Link>
          <Link href="/icofr/coverage" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Coverage & ITGC Dependencies</Link>
          <Link href="/toe" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">ToE Evidence</Link>
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
          Register an institution and create an ICOFR testing cycle first.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {[
              ['Runs', data?.metrics?.runs || 0],
              ['Draft', data?.metrics?.draftRuns || 0],
              ['Approved', data?.metrics?.approvedRuns || 0],
              ['Applied', data?.metrics?.appliedRuns || 0],
              ['Pending review', data?.metrics?.pendingReviews || 0],
              ['Full retest', data?.metrics?.fullRetest || 0],
              ['Roll-forward', data?.metrics?.rollForward || 0],
              ['Prior evidence', data?.metrics?.priorEvidence || 0]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-[8px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                <div className="mt-1 text-xl font-black text-slate-900">{value}</div>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <form
              onSubmit={async event => {
                event.preventDefault();
                const result = await post(
                  { actionType: 'GENERATE_STRATEGY', ...form },
                  'Evidence-based testing strategy generated for independent review.'
                );
                if (result?.id) setSelectedRunId(result.id);
              }}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">1. Generate Strategy Run</h2>
                  <p className="text-[10px] text-slate-500">
                    No testing-plan record is changed at this stage.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Target testing cycle *
                  <select
                    required
                    value={form.cycleId}
                    onChange={event => {
                      const cycle = data?.cycles?.find((item: any) => item.id === event.target.value);
                      applyCycle(cycle);
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="">Select cycle</option>
                    {(data?.cycles || []).map((item: any) => (
                      <option key={item.id} value={item.id}>
                        FY{item.fiscalYear} · {item.reportingPeriod} · {item.cycleName} · {item.scopeName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Related roll-forward
                  <select
                    value={form.rollForwardId}
                    onChange={event => setForm({ ...form, rollForwardId: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="">No roll-forward context</option>
                    {(data?.rollForwards || [])
                      .filter(
                        (item: any) =>
                          !form.cycleId ||
                          item.targetTestingCycleId === form.cycleId ||
                          data?.cycles?.find((c: any) => c.id === form.cycleId)?.scopeId === item.targetScopeId
                      )
                      .map((item: any) => (
                        <option key={item.id} value={item.id}>{item.rollForwardName} · {item.status}</option>
                      ))}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Control population *
                  <select
                    value={form.scopeMode}
                    onChange={event => setForm({ ...form, scopeMode: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option>Key Controls Only</option>
                    <option>All Active ICOFR Controls</option>
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Policy / methodology name *
                  <input
                    required
                    value={form.policyName}
                    onChange={event => setForm({ ...form, policyName: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Default planned start *
                  <input
                    type="date"
                    required
                    value={form.defaultPlannedStartDate}
                    onChange={event => setForm({ ...form, defaultPlannedStartDate: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Default due date *
                  <input
                    type="date"
                    required
                    value={form.defaultDueDate}
                    onChange={event => setForm({ ...form, defaultDueDate: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Default tester *
                  <input
                    required
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
                  Planning notes
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={event => setForm({ ...form, notes: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>
              </div>

              <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[10px] leading-5 text-sky-800">
                Strategy recommendations are deterministic planning aids, not automatic assurance conclusions. Prior-period
                evidence is never copied into a current-period ToE and cannot bypass reviewer approval.
              </div>

              <div className="mt-4 flex justify-end">
                <button disabled={saving || !data?.cycles?.length} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
                  <Sparkles className="h-4 w-4" /> Generate strategy
                </button>
              </div>
            </form>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">Strategy Run Register</h2>
                  <p className="text-[10px] text-slate-500">Select a run for reviewer decisions and plan integration.</p>
                </div>
              </div>

              {(data?.runs || []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                  No strategy run has been generated.
                </div>
              ) : (
                <div className="space-y-3">
                  {(data?.runs || []).map((item: any) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedRunId(item.id);
                        setSelectedDecision(null);
                      }}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        selectedRunId === item.id ? 'border-brand-300 bg-brand-50/40' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap gap-1.5">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${badge(item.status)}`}>
                              {item.status}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-600">
                              FY{item.cycle?.fiscalYear} · {item.cycle?.reportingPeriod}
                            </span>
                          </div>
                          <div className="mt-1 text-xs font-black text-slate-900">{item.policyName}</div>
                          <div className="mt-1 text-[10px] text-slate-500">
                            {item.cycle?.cycleName || 'Cycle'} · {item.summary?.total || 0} controls
                          </div>
                        </div>
                        <div className="text-right text-[9px] text-slate-400">
                          <div>{item.summary?.fullRetest || 0} full</div>
                          <div>{item.summary?.pendingReview || 0} pending</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          {selectedRun && (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${badge(selectedRun.status)}`}>
                        {selectedRun.status}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-600">
                        {selectedRun.scopeMode}
                      </span>
                    </div>
                    <h2 className="mt-1 text-lg font-black text-slate-900">{selectedRun.policyName}</h2>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {selectedRun.cycle?.cycleName} · Prepared by {selectedRun.preparedBy}
                    </p>
                  </div>
                  <Link
                    href="/icofr/testing-plan"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600"
                  >
                    <FileCheck className="h-3.5 w-3.5" /> Open Testing Plan
                  </Link>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-7">
                  {[
                    ['Controls', selectedRun.summary?.total || 0],
                    ['Full retest', selectedRun.summary?.fullRetest || 0],
                    ['Roll-forward', selectedRun.summary?.rollForward || 0],
                    ['Rotational', selectedRun.summary?.rotational || 0],
                    ['Prior evidence', selectedRun.summary?.priorEvidence || 0],
                    ['Pending review', selectedRun.summary?.pendingReview || 0],
                    ['Critical', selectedRun.summary?.critical || 0]
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
                    <h2 className="text-sm font-black text-slate-900">2. Control-by-Control Testing Recommendation</h2>
                    <p className="text-[10px] text-slate-500">
                      Review the evidence basis before accepting or overriding a recommendation.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="Search controls"
                        className="w-52 rounded-xl border border-slate-200 py-2 pl-8 pr-3 text-[10px]"
                      />
                    </label>
                    <select value={strategyFilter} onChange={event => setStrategyFilter(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-[10px]">
                      <option value="ALL">All strategies</option>
                      {(data?.strategies || []).map((item: string) => <option key={item}>{item}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => setPendingOnly(!pendingOnly)}
                      className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-[10px] font-bold ${pendingOnly ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'}`}
                    >
                      <Filter className="h-3.5 w-3.5" /> Pending only
                    </button>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-[1250px] w-full text-[10px]">
                    <thead className="bg-slate-100 text-slate-500">
                      <tr>
                        <th className="p-2.5 text-left">Control</th>
                        <th className="p-2.5 text-left">Risk</th>
                        <th className="p-2.5 text-left">Prior ToE</th>
                        <th className="p-2.5 text-left">Exceptions / Deficiencies</th>
                        <th className="p-2.5 text-left">ITGC dependency</th>
                        <th className="p-2.5 text-left">Roll-forward</th>
                        <th className="p-2.5 text-left">Recommendation</th>
                        <th className="p-2.5 text-left">Review</th>
                        <th className="p-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((item: any) => (
                        <tr key={item.id} className="border-b border-slate-100 align-top">
                          <td className="p-2.5">
                            <div className="font-mono font-bold text-brand-700">{item.control?.controlCode}</div>
                            <div className="mt-0.5 max-w-[230px] font-bold text-slate-700">{item.control?.name}</div>
                            <div className="mt-0.5 text-[9px] text-slate-400">{item.control?.category} · {item.control?.frequency} · {item.control?.nature}</div>
                          </td>
                          <td className="p-2.5 font-bold text-slate-600">{item.riskRating || 'Not linked'}</td>
                          <td className="p-2.5">
                            <div className="font-bold text-slate-700">{item.priorToeConclusion || 'No prior ToE'}</div>
                            <div className="text-[9px] text-slate-400">{item.priorToeTestId || '—'}</div>
                          </td>
                          <td className="p-2.5 text-slate-600">
                            {item.priorExceptionCount} exception(s)<br />
                            {item.priorDeficiencyCount} deficiency(ies)
                            {Number(item.significantDeficiencyCount || 0) > 0 && <div className="font-black text-rose-600">{item.significantDeficiencyCount} significant/MW</div>}
                          </td>
                          <td className="max-w-[180px] p-2.5 text-slate-600">{item.itgcDependencyStatus}</td>
                          <td className="p-2.5 text-slate-600">
                            <div>{item.rollForwardChangeFlag || 'No linked assessment'}</div>
                            <div className="text-[9px] text-slate-400">{item.rollForwardDecision || ''}</div>
                          </td>
                          <td className="p-2.5">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${badge(item.proposedStrategy)}`}>
                              {item.proposedStrategy}
                            </span>
                            <div className="mt-1 text-[9px] font-bold text-slate-500">{item.priority} · {item.proposedTestType}</div>
                          </td>
                          <td className="p-2.5">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${badge(item.reviewerDecision)}`}>
                              {item.reviewerDecision}
                            </span>
                            {item.overrideStrategy && <div className="mt-1 text-[9px] text-slate-500">Override: {item.overrideStrategy}</div>}
                          </td>
                          <td className="p-2.5 text-right">
                            <button
                              type="button"
                              disabled={['Approved', 'Applied'].includes(selectedRun.status)}
                              onClick={() => chooseDecision(item)}
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
              </section>

              {selectedDecision && !['Approved', 'Applied'].includes(selectedRun.status) && (
                <form
                  onSubmit={async event => {
                    event.preventDefault();
                    const result = await post(
                      { actionType: 'REVIEW_DECISION', ...reviewForm },
                      'Testing-strategy review decision saved.'
                    );
                    if (result) setSelectedDecision(null);
                  }}
                  className="rounded-2xl border border-brand-200 bg-brand-50/30 p-5 shadow-sm"
                >
                  <h2 className="text-sm font-black text-slate-900">
                    Review {selectedDecision.control?.controlCode} · {selectedDecision.control?.name}
                  </h2>
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Evidence basis</div>
                    <div className="mt-2 space-y-1 text-[10px] leading-5 text-slate-600">
                      {(selectedDecision.factors?.factors || []).map((factor: string) => <div key={factor}>• {factor}</div>)}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700">
                      Review decision *
                      <select
                        value={reviewForm.reviewerDecision}
                        onChange={event => setReviewForm({ ...reviewForm, reviewerDecision: event.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"
                      >
                        <option>Accept Recommendation</option>
                        <option>Override</option>
                        <option>Defer</option>
                      </select>
                    </label>
                    {reviewForm.reviewerDecision === 'Override' && (
                      <label className="text-xs font-bold text-slate-700">
                        Override strategy *
                        <select
                          required
                          value={reviewForm.overrideStrategy}
                          onChange={event => setReviewForm({ ...reviewForm, overrideStrategy: event.target.value })}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"
                        >
                          <option value="">Select</option>
                          {(data?.strategies || []).map((item: string) => <option key={item}>{item}</option>)}
                        </select>
                      </label>
                    )}
                    <label className="text-xs font-bold text-slate-700">
                      Independent reviewer *
                      <input
                        required
                        value={reviewForm.reviewerName}
                        onChange={event => setReviewForm({ ...reviewForm, reviewerName: event.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-700 md:col-span-2">
                      Reviewer notes {['Override', 'Defer'].includes(reviewForm.reviewerDecision) ? '*' : ''}
                      <textarea
                        required={['Override', 'Defer'].includes(reviewForm.reviewerDecision)}
                        rows={3}
                        value={reviewForm.reviewerNotes}
                        onChange={event => setReviewForm({ ...reviewForm, reviewerNotes: event.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
                      <Save className="h-4 w-4" /> Save review
                    </button>
                  </div>
                </form>
              )}

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-brand-600" />
                      <h2 className="text-sm font-black text-slate-900">3. Approve & Apply to Testing Plan</h2>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">
                      Approval is blocked while any recommendation is Pending or Deferred. Applying an approved run creates or updates actual D1-backed Testing Plan items.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedRun.status === 'Draft' && (
                      <>
                        <input
                          value={approver}
                          onChange={event => setApprover(event.target.value)}
                          placeholder="Independent approver"
                          className="rounded-xl border border-slate-200 px-3 py-2 text-[10px]"
                        />
                        <button
                          type="button"
                          disabled={saving || !approver || Number(selectedRun.summary?.pendingReview || 0) > 0 || Number(selectedRun.summary?.deferred || 0) > 0}
                          onClick={() =>
                            void post(
                              { actionType: 'APPROVE_RUN', runId: selectedRun.id, approvedBy: approver },
                              'Testing-strategy run approved.'
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40"
                        >
                          <CheckCircle2 className="h-4 w-4" /> Approve strategy
                        </button>
                      </>
                    )}
                    {selectedRun.status === 'Approved' && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void post(
                            { actionType: 'APPLY_RUN', runId: selectedRun.id },
                            'Approved strategies applied to the ICOFR Testing Plan.'
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                      >
                        <FileCheck className="h-4 w-4" /> Apply to Testing Plan
                      </button>
                    )}
                    {selectedRun.status === 'Applied' && (
                      <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-black text-emerald-700">
                        Strategy applied
                      </span>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
