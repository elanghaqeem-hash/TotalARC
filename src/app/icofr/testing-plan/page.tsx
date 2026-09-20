'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Workflow
} from 'lucide-react';

const emptyCycle = {
  id: '',
  scopeId: '',
  cycleName: '',
  fiscalYear: '',
  reportingPeriod: '',
  startDate: '',
  endDate: '',
  testingStrategy: '',
  defaultTester: '',
  defaultReviewer: '',
  status: 'Planning',
  notes: ''
};

const emptyPlan = {
  id: '',
  cycleId: '',
  controlDomainId: '',
  testType: 'Both',
  testingPhase: '',
  plannedStartDate: '',
  dueDate: '',
  testerName: '',
  reviewerName: '',
  populationSize: '',
  populationSource: '',
  samplingMethod: '',
  plannedSampleSize: '',
  carryForward: false,
  rollForward: false,
  relianceStrategy: '',
  priority: 'Medium',
  status: 'Planned',
  notes: ''
};

const emptyBulk = {
  cycleId: '',
  testType: 'Both',
  testingPhase: '',
  plannedStartDate: '',
  dueDate: '',
  testerName: '',
  reviewerName: '',
  carryForward: false,
  rollForward: false,
  relianceStrategy: '',
  priority: 'Medium',
  notes: ''
};

function statusTone(status: string) {
  if (status === 'Completed' || status === 'Approved') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (status === 'In Progress' || status === 'Active') {
    return 'border-sky-200 bg-sky-50 text-sky-700';
  }
  if (status === 'On Hold' || status === 'Deferred') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function executionTone(value: string) {
  if (value === 'Effective' || value === 'Pass') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (value === 'Ineffective' || value === 'Fail') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  if (value === 'Partially Effective') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function IcofrTestingPlanPage() {
  const [data, setData] = useState<any>(null);
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [cycleForm, setCycleForm] = useState(emptyCycle);
  const [planForm, setPlanForm] = useState(emptyPlan);
  const [bulkForm, setBulkForm] = useState(emptyBulk);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/icofr/testing-plan', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Testing plan data unavailable.');
      setData(payload);

      const firstCycleId = payload.cycles?.[0]?.id || '';
      setSelectedCycleId(current =>
        current && payload.cycles?.some((item: any) => item.id === current)
          ? current
          : firstCycleId
      );

      setCycleForm(current => ({
        ...current,
        scopeId: current.scopeId || payload.scopes?.[0]?.id || ''
      }));

      setPlanForm(current => ({
        ...current,
        cycleId: current.cycleId || firstCycleId,
        controlDomainId: current.controlDomainId || payload.controls?.[0]?.id || ''
      }));

      setBulkForm(current => ({
        ...current,
        cycleId: current.cycleId || firstCycleId
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Testing plan data unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedCycle = useMemo(
    () => data?.cycles?.find((item: any) => item.id === selectedCycleId) || null,
    [data, selectedCycleId]
  );

  const filteredItems = useMemo(() => {
    const rows = (data?.planItems || []).filter(
      (item: any) => !selectedCycleId || item.cycleId === selectedCycleId
    );
    if (!query.trim()) return rows;
    const needle = query.trim().toLowerCase();
    return rows.filter((item: any) => {
      const text = [
        item.control?.category,
        item.control?.controlCode,
        item.control?.name,
        item.testType,
        item.testingPhase,
        item.testerName,
        item.reviewerName,
        item.derivedExecutionStatus
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return text.includes(needle);
    });
  }, [data, selectedCycleId, query]);

  const resetCycle = () => {
    setCycleForm({
      ...emptyCycle,
      scopeId: data?.scopes?.[0]?.id || ''
    });
    setError('');
    setMessage('');
  };

  const editCycle = (cycle: any) => {
    setCycleForm({
      id: cycle.id || '',
      scopeId: cycle.scopeId || '',
      cycleName: cycle.cycleName || '',
      fiscalYear: String(cycle.fiscalYear || ''),
      reportingPeriod: cycle.reportingPeriod || '',
      startDate: cycle.startDate || '',
      endDate: cycle.endDate || '',
      testingStrategy: cycle.testingStrategy || '',
      defaultTester: cycle.defaultTester || '',
      defaultReviewer: cycle.defaultReviewer || '',
      status: cycle.status || 'Planning',
      notes: cycle.notes || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetPlan = (cycleId?: string) => {
    const cycle = data?.cycles?.find((item: any) => item.id === (cycleId || selectedCycleId));
    setPlanForm({
      ...emptyPlan,
      cycleId: cycle?.id || '',
      controlDomainId: data?.controls?.[0]?.id || '',
      plannedStartDate: cycle?.startDate || '',
      dueDate: cycle?.endDate || '',
      testerName: cycle?.defaultTester || '',
      reviewerName: cycle?.defaultReviewer || ''
    });
    setError('');
    setMessage('');
  };

  const editPlan = (item: any) => {
    setSelectedCycleId(item.cycleId);
    setPlanForm({
      id: item.id || '',
      cycleId: item.cycleId || '',
      controlDomainId: item.controlDomainId || '',
      testType: item.testType || 'Both',
      testingPhase: item.testingPhase || '',
      plannedStartDate: item.plannedStartDate || '',
      dueDate: item.dueDate || '',
      testerName: item.testerName || '',
      reviewerName: item.reviewerName || '',
      populationSize:
        item.populationSize === null || item.populationSize === undefined
          ? ''
          : String(item.populationSize),
      populationSource: item.populationSource || '',
      samplingMethod: item.samplingMethod || '',
      plannedSampleSize:
        item.plannedSampleSize === null || item.plannedSampleSize === undefined
          ? ''
          : String(item.plannedSampleSize),
      carryForward: Boolean(item.carryForward),
      rollForward: Boolean(item.rollForward),
      relianceStrategy: item.relianceStrategy || '',
      priority: item.priority || 'Medium',
      status: item.status || 'Planned',
      notes: item.notes || ''
    });
    document.getElementById('plan-item-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const saveCycle = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/icofr/testing-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'SAVE_CYCLE',
          ...cycleForm,
          fiscalYear: Number(cycleForm.fiscalYear)
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save testing cycle.');

      setMessage(cycleForm.id ? 'Testing cycle updated in Cloudflare D1.' : 'Testing cycle saved in Cloudflare D1.');
      setCycleForm(current => ({ ...current, id: payload.id }));
      setSelectedCycleId(payload.id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save testing cycle.');
    } finally {
      setSaving(false);
    }
  };

  const savePlan = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/icofr/testing-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'SAVE_PLAN_ITEM',
          ...planForm
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save testing plan item.');

      setMessage(planForm.id ? 'Testing plan item updated in Cloudflare D1.' : 'Testing plan item saved in Cloudflare D1.');
      setPlanForm(current => ({ ...current, id: payload.id }));
      setSelectedCycleId(payload.cycleId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save testing plan item.');
    } finally {
      setSaving(false);
    }
  };

  const generateKeyControls = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/icofr/testing-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'GENERATE_KEY_CONTROLS',
          ...bulkForm
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to generate testing plan.');

      setMessage(
        `Generated ${payload.created} plan item(s) from ${payload.eligibleKeyControls} eligible key control(s); ${payload.skippedExisting} existing item(s) skipped.`
      );
      setSelectedCycleId(bulkForm.cycleId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate testing plan.');
    } finally {
      setSaving(false);
    }
  };

  const launchExecution = async (item: any, type: 'TOD' | 'TOE') => {
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/icofr/testing-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: type === 'TOD' ? 'LAUNCH_TOD' : 'LAUNCH_TOE',
          planItemId: item.id
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to launch testing workpaper.');

      setMessage(
        type === 'TOD'
          ? 'Test of Design workpaper created and linked to the testing plan.'
          : 'ToE workpaper created and linked to the testing plan.'
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to launch testing workpaper.');
    } finally {
      setSaving(false);
    }
  };

  const removePlan = async (item: any) => {
    if (!window.confirm('Remove this testing plan item?')) return;
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/icofr/testing-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'REMOVE_PLAN_ITEM', id: item.id })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to remove plan item.');

      setMessage('Testing plan item removed.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove plan item.');
    } finally {
      setSaving(false);
    }
  };

  const cycleForPlan = data?.cycles?.find((item: any) => item.id === planForm.cycleId) || null;
  const cycleForBulk = data?.cycles?.find((item: any) => item.id === bulkForm.cycleId) || null;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-sky-600">
              <CalendarDays className="h-4 w-4" /> ICOFR Testing Planning
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Annual Testing Cycle & Execution Plan</h1>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
              Build period-specific ICOFR testing cycles, assign key controls, testers and reviewers, plan interim/roll-forward/year-end work,
              and launch database-backed ToD or ToE workpapers without recreating control data.
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex self-start items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold">
          <Link href="/icofr/scoping" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600 hover:border-brand-300">Scoping & Materiality</Link>
          <Link href="/icofr/traceability" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600 hover:border-brand-300">Traceability</Link>
          <Link href="/tod" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600 hover:border-brand-300">ToD Workspace</Link>
          <Link href="/toe" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600 hover:border-brand-300">ToE Workspace</Link>
          <Link href="/icofr/coverage" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600 hover:border-brand-300">Coverage & Gaps</Link>
          <Link href="/icofr/smart-testing" className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-700 hover:border-indigo-300">Smart Testing Strategy</Link>
          <Link href="/icofr/sampling-evidence" className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700 hover:border-sky-300">Sampling & Evidence</Link>
          <Link href="/certification" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600 hover:border-brand-300">Certification</Link>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {!loading && !data?.institution ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">
          Register an institution before creating an ICOFR testing cycle.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            {[
              ['Cycles', data?.metrics?.cycles || 0],
              ['Plan Items', data?.metrics?.totalPlanItems || 0],
              ['Key Controls', data?.metrics?.keyControls || 0],
              ['In Progress', data?.metrics?.inProgress || 0],
              ['Completed', data?.metrics?.completed || 0],
              ['Overdue', data?.metrics?.overdue || 0],
              ['ToE Launched', data?.metrics?.toeLaunched || 0]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                <div className="mt-1 text-xl font-black text-slate-900">{value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <form onSubmit={saveCycle} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black text-slate-900">1. Testing Cycle Form</h2>
                  <p className="text-[10px] text-slate-500">Active form persisted to Cloudflare D1.</p>
                </div>
                {cycleForm.id && (
                  <button type="button" onClick={resetCycle} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-bold text-slate-600">
                    <Plus className="h-3 w-3" /> New cycle
                  </button>
                )}
              </div>

              {(data?.scopes || []).length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Create an ICOFR scope before creating a testing cycle.{' '}
                  <Link href="/icofr/scoping" className="font-bold underline">Open Scoping & Materiality</Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                    ICOFR scope *
                    <select
                      required
                      value={cycleForm.scopeId}
                      onChange={e => {
                        const scope = data?.scopes?.find((item: any) => item.id === e.target.value);
                        setCycleForm({
                          ...cycleForm,
                          scopeId: e.target.value,
                          fiscalYear: scope ? String(scope.fiscalYear || '') : cycleForm.fiscalYear,
                          reportingPeriod: scope?.reportingPeriod || cycleForm.reportingPeriod
                        });
                      }}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    >
                      <option value="">Select scope</option>
                      {(data?.scopes || []).map((scope: any) => (
                        <option key={scope.id} value={scope.id}>
                          {scope.scopeName} · FY{scope.fiscalYear} · {scope.reportingPeriod} · {scope.status}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                    Cycle name *
                    <input
                      required
                      value={cycleForm.cycleName}
                      onChange={e => setCycleForm({ ...cycleForm, cycleName: e.target.value })}
                      placeholder="e.g. FY2027 ICOFR Annual Testing Cycle"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Fiscal year *
                    <input
                      required
                      inputMode="numeric"
                      value={cycleForm.fiscalYear}
                      onChange={e => setCycleForm({ ...cycleForm, fiscalYear: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Reporting period *
                    <input
                      required
                      value={cycleForm.reportingPeriod}
                      onChange={e => setCycleForm({ ...cycleForm, reportingPeriod: e.target.value })}
                      placeholder="Annual / Q4 / Interim"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Cycle start *
                    <input
                      type="date"
                      required
                      value={cycleForm.startDate}
                      onChange={e => setCycleForm({ ...cycleForm, startDate: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Cycle end *
                    <input
                      type="date"
                      required
                      value={cycleForm.endDate}
                      onChange={e => setCycleForm({ ...cycleForm, endDate: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                    Testing strategy *
                    <select
                      required
                      value={cycleForm.testingStrategy}
                      onChange={e => setCycleForm({ ...cycleForm, testingStrategy: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    >
                      <option value="">Select strategy</option>
                      <option>Annual Year-End</option>
                      <option>Interim + Roll-Forward</option>
                      <option>Quarterly Rotation</option>
                      <option>Continuous / Staggered</option>
                      <option>Risk-Based Rotation</option>
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Default tester
                    <input
                      value={cycleForm.defaultTester}
                      onChange={e => setCycleForm({ ...cycleForm, defaultTester: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Default reviewer
                    <input
                      value={cycleForm.defaultReviewer}
                      onChange={e => setCycleForm({ ...cycleForm, defaultReviewer: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Status
                    <select
                      value={cycleForm.status}
                      onChange={e => setCycleForm({ ...cycleForm, status: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    >
                      <option>Planning</option>
                      <option>Active</option>
                      <option>On Hold</option>
                      <option>Completed</option>
                      <option>Closed</option>
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Notes
                    <textarea
                      rows={2}
                      value={cycleForm.notes}
                      onChange={e => setCycleForm({ ...cycleForm, notes: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <button
                  disabled={saving || !(data?.scopes || []).length}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {cycleForm.id ? 'Update cycle' : 'Save cycle'}
                </button>
              </div>
            </form>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-sm font-black text-slate-900">Saved Testing Cycles</h2>
                <p className="text-[10px] text-slate-500">Select a cycle to manage its control-level testing plan.</p>
              </div>

              {(data?.cycles || []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                  No ICOFR testing cycle has been registered.
                </div>
              ) : (
                <div className="space-y-2">
                  {(data?.cycles || []).map((cycle: any) => (
                    <div
                      key={cycle.id}
                      className={`rounded-xl border p-3 ${selectedCycleId === cycle.id ? 'border-brand-300 bg-brand-50/50' : 'border-slate-200'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCycleId(cycle.id);
                            resetPlan(cycle.id);
                            setBulkForm({
                              ...emptyBulk,
                              cycleId: cycle.id,
                              plannedStartDate: cycle.startDate || '',
                              dueDate: cycle.endDate || '',
                              testerName: cycle.defaultTester || '',
                              reviewerName: cycle.defaultReviewer || ''
                            });
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="text-xs font-black text-slate-900">{cycle.cycleName}</div>
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            FY{cycle.fiscalYear} · {cycle.reportingPeriod} · {cycle.testingStrategy}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[9px]">
                            <span className={`rounded-full border px-2 py-0.5 font-bold ${statusTone(cycle.status)}`}>{cycle.status}</span>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-bold text-slate-600">{cycle.metrics?.total || 0} controls</span>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-bold text-slate-600">
                              {cycle.metrics?.completionPercent === null ? 'No progress' : `${cycle.metrics?.completionPercent}% complete`}
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => editCycle(cycle)}
                          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-brand-300 hover:text-brand-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <form id="plan-item-form" onSubmit={savePlan} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black text-slate-900">2. Control Testing Plan Form</h2>
                  <p className="text-[10px] text-slate-500">Create or update one control-level annual testing assignment.</p>
                </div>
                {planForm.id && (
                  <button type="button" onClick={() => resetPlan(planForm.cycleId)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-bold text-slate-600">
                    <Plus className="h-3 w-3" /> New item
                  </button>
                )}
              </div>

              {(data?.cycles || []).length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Save a testing cycle first.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-700">
                    Testing cycle *
                    <select
                      required
                      value={planForm.cycleId}
                      onChange={e => {
                        const cycle = data?.cycles?.find((item: any) => item.id === e.target.value);
                        setPlanForm({
                          ...planForm,
                          cycleId: e.target.value,
                          plannedStartDate: cycle?.startDate || '',
                          dueDate: cycle?.endDate || '',
                          testerName: cycle?.defaultTester || planForm.testerName,
                          reviewerName: cycle?.defaultReviewer || planForm.reviewerName
                        });
                      }}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    >
                      <option value="">Select cycle</option>
                      {(data?.cycles || []).map((cycle: any) => (
                        <option key={cycle.id} value={cycle.id}>{cycle.cycleName}</option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    ICOFR control *
                    <select
                      required
                      value={planForm.controlDomainId}
                      onChange={e => setPlanForm({ ...planForm, controlDomainId: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    >
                      <option value="">Select control</option>
                      {(data?.controls || []).map((control: any) => (
                        <option key={control.id} value={control.id}>
                          {control.category} · {control.controlCode} · {control.name}{control.keyControl ? ' · Key' : ''}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Test type *
                    <select
                      required
                      value={planForm.testType}
                      onChange={e => setPlanForm({ ...planForm, testType: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    >
                      <option>ToD</option>
                      <option>ToE</option>
                      <option>Both</option>
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Testing phase *
                    <select
                      required
                      value={planForm.testingPhase}
                      onChange={e => setPlanForm({ ...planForm, testingPhase: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    >
                      <option value="">Select phase</option>
                      <option>Interim</option>
                      <option>Roll-Forward</option>
                      <option>Year-End</option>
                      <option>Q1</option>
                      <option>Q2</option>
                      <option>Q3</option>
                      <option>Q4</option>
                      <option>Continuous</option>
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Planned start *
                    <input
                      type="date"
                      min={cycleForPlan?.startDate || undefined}
                      max={cycleForPlan?.endDate || undefined}
                      required
                      value={planForm.plannedStartDate}
                      onChange={e => setPlanForm({ ...planForm, plannedStartDate: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Due date *
                    <input
                      type="date"
                      min={cycleForPlan?.startDate || undefined}
                      max={cycleForPlan?.endDate || undefined}
                      required
                      value={planForm.dueDate}
                      onChange={e => setPlanForm({ ...planForm, dueDate: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Tester *
                    <input
                      required
                      value={planForm.testerName}
                      onChange={e => setPlanForm({ ...planForm, testerName: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Reviewer
                    <input
                      value={planForm.reviewerName}
                      onChange={e => setPlanForm({ ...planForm, reviewerName: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Population size
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={planForm.populationSize}
                      onChange={e => setPlanForm({ ...planForm, populationSize: e.target.value })}
                      placeholder="Required before ToE launch"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Planned sample size
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={planForm.plannedSampleSize}
                      onChange={e => setPlanForm({ ...planForm, plannedSampleSize: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                    Population source
                    <input
                      value={planForm.populationSource}
                      onChange={e => setPlanForm({ ...planForm, populationSource: e.target.value })}
                      placeholder="Actual source system/report/file; required before ToE launch"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Sampling method
                    <select
                      value={planForm.samplingMethod}
                      onChange={e => setPlanForm({ ...planForm, samplingMethod: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    >
                      <option value="">Select when ToE applies</option>
                      <option>Random</option>
                      <option>Systematic</option>
                      <option>Judgmental</option>
                      <option>Risk-Based</option>
                      <option>Full Population</option>
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Reliance strategy
                    <select
                      value={planForm.relianceStrategy}
                      onChange={e => setPlanForm({ ...planForm, relianceStrategy: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    >
                      <option value="">Not specified</option>
                      <option>Management Testing</option>
                      <option>Internal Audit Reliance</option>
                      <option>External Audit Reliance</option>
                      <option>Combined Assurance</option>
                      <option>No Reliance</option>
                    </select>
                  </label>

                  <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 text-xs font-bold text-slate-700">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={planForm.carryForward}
                        onChange={e => setPlanForm({ ...planForm, carryForward: e.target.checked })}
                      />
                      Carry-forward eligible
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={planForm.rollForward}
                        onChange={e => setPlanForm({ ...planForm, rollForward: e.target.checked })}
                      />
                      Roll-forward required
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs font-bold text-slate-700">
                      Priority
                      <select
                        value={planForm.priority}
                        onChange={e => setPlanForm({ ...planForm, priority: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      >
                        <option>Critical</option>
                        <option>High</option>
                        <option>Medium</option>
                        <option>Low</option>
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Status
                      <select
                        value={planForm.status}
                        onChange={e => setPlanForm({ ...planForm, status: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      >
                        <option>Planned</option>
                        <option>In Progress</option>
                        <option>On Hold</option>
                        <option>Deferred</option>
                        <option>Completed</option>
                      </select>
                    </label>
                  </div>

                  <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                    Notes
                    <textarea
                      rows={2}
                      value={planForm.notes}
                      onChange={e => setPlanForm({ ...planForm, notes: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <button
                  disabled={saving || !(data?.cycles || []).length}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {planForm.id ? 'Update plan item' : 'Save plan item'}
                </button>
              </div>
            </form>

            <form onSubmit={generateKeyControls} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-sm font-black text-slate-900">3. Bulk Plan Key Controls</h2>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">
                  Creates plan rows only for controls already designated as Key ICOFR Controls. Test type, phase, dates and assignees are explicitly selected here.
                </p>
              </div>

              {(data?.cycles || []).length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Save a testing cycle first.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                    Testing cycle *
                    <select
                      required
                      value={bulkForm.cycleId}
                      onChange={e => {
                        const cycle = data?.cycles?.find((item: any) => item.id === e.target.value);
                        setBulkForm({
                          ...bulkForm,
                          cycleId: e.target.value,
                          plannedStartDate: cycle?.startDate || '',
                          dueDate: cycle?.endDate || '',
                          testerName: cycle?.defaultTester || bulkForm.testerName,
                          reviewerName: cycle?.defaultReviewer || bulkForm.reviewerName
                        });
                      }}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    >
                      <option value="">Select cycle</option>
                      {(data?.cycles || []).map((cycle: any) => (
                        <option key={cycle.id} value={cycle.id}>{cycle.cycleName}</option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Test type *
                    <select
                      required
                      value={bulkForm.testType}
                      onChange={e => setBulkForm({ ...bulkForm, testType: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    >
                      <option>ToD</option>
                      <option>ToE</option>
                      <option>Both</option>
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Phase *
                    <select
                      required
                      value={bulkForm.testingPhase}
                      onChange={e => setBulkForm({ ...bulkForm, testingPhase: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    >
                      <option value="">Select phase</option>
                      <option>Interim</option>
                      <option>Roll-Forward</option>
                      <option>Year-End</option>
                      <option>Q1</option>
                      <option>Q2</option>
                      <option>Q3</option>
                      <option>Q4</option>
                      <option>Continuous</option>
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Planned start *
                    <input
                      type="date"
                      required
                      min={cycleForBulk?.startDate || undefined}
                      max={cycleForBulk?.endDate || undefined}
                      value={bulkForm.plannedStartDate}
                      onChange={e => setBulkForm({ ...bulkForm, plannedStartDate: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Due date *
                    <input
                      type="date"
                      required
                      min={cycleForBulk?.startDate || undefined}
                      max={cycleForBulk?.endDate || undefined}
                      value={bulkForm.dueDate}
                      onChange={e => setBulkForm({ ...bulkForm, dueDate: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Tester *
                    <input
                      required
                      value={bulkForm.testerName}
                      onChange={e => setBulkForm({ ...bulkForm, testerName: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Reviewer
                    <input
                      value={bulkForm.reviewerName}
                      onChange={e => setBulkForm({ ...bulkForm, reviewerName: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                    Reliance strategy
                    <select
                      value={bulkForm.relianceStrategy}
                      onChange={e => setBulkForm({ ...bulkForm, relianceStrategy: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    >
                      <option value="">Not specified</option>
                      <option>Management Testing</option>
                      <option>Internal Audit Reliance</option>
                      <option>External Audit Reliance</option>
                      <option>Combined Assurance</option>
                      <option>No Reliance</option>
                    </select>
                  </label>

                  <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 text-xs font-bold text-slate-700">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={bulkForm.carryForward}
                        onChange={e => setBulkForm({ ...bulkForm, carryForward: e.target.checked })}
                      />
                      Carry-forward eligible
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={bulkForm.rollForward}
                        onChange={e => setBulkForm({ ...bulkForm, rollForward: e.target.checked })}
                      />
                      Roll-forward required
                    </label>
                  </div>

                  <label className="text-xs font-bold text-slate-700">
                    Priority
                    <select
                      value={bulkForm.priority}
                      onChange={e => setBulkForm({ ...bulkForm, priority: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    >
                      <option>Critical</option>
                      <option>High</option>
                      <option>Medium</option>
                      <option>Low</option>
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                    Notes
                    <textarea
                      rows={2}
                      value={bulkForm.notes}
                      onChange={e => setBulkForm({ ...bulkForm, notes: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[10px] leading-4 text-sky-800">
                Bulk planning does not create ToD or ToE results. It only creates planned assignments for existing key controls. Execution workpapers are launched separately from the plan register.
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  disabled={saving || !(data?.cycles || []).length || !(data?.metrics?.keyControls || 0)}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  Add eligible key controls
                </button>
              </div>
            </form>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-sm font-black text-slate-900">Testing Plan Register</h2>
                <p className="mt-1 text-[10px] text-slate-500">
                  {selectedCycle
                    ? `${selectedCycle.cycleName} · ${selectedCycle.startDate} to ${selectedCycle.endDate}`
                    : 'Select a testing cycle.'}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={selectedCycleId}
                  onChange={e => setSelectedCycleId(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
                >
                  <option value="">All cycles</option>
                  {(data?.cycles || []).map((cycle: any) => (
                    <option key={cycle.id} value={cycle.id}>{cycle.cycleName}</option>
                  ))}
                </select>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search control, tester, phase…"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>
            </div>

            {loading ? (
              <div className="py-10 text-center text-xs text-slate-500">Loading testing plan…</div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-xs text-slate-500">
                No testing plan items match the current view.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[1500px] w-full text-[10px]">
                  <thead className="bg-slate-100 text-slate-500">
                    <tr>
                      <th className="p-2.5 text-left">Control</th>
                      <th className="p-2.5 text-left">Plan</th>
                      <th className="p-2.5 text-left">Schedule</th>
                      <th className="p-2.5 text-left">Assignment</th>
                      <th className="p-2.5 text-left">Population / Sample</th>
                      <th className="p-2.5 text-left">ToD</th>
                      <th className="p-2.5 text-left">ToE</th>
                      <th className="p-2.5 text-left">Status</th>
                      <th className="p-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item: any) => {
                      const canTod = ['ToD', 'Both'].includes(item.testType);
                      const canToe = ['ToE', 'Both'].includes(item.testType);
                      return (
                        <tr key={item.id} className="border-b border-slate-100 align-top">
                          <td className="p-2.5">
                            <div className="flex flex-wrap gap-1">
                              <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 font-bold text-sky-700">{item.control?.category}</span>
                              {item.control?.keyControl && (
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">Key</span>
                              )}
                            </div>
                            <div className="mt-1 font-mono font-black text-slate-700">{item.control?.controlCode}</div>
                            <div className="mt-0.5 max-w-[220px] font-semibold text-slate-700">{item.control?.name}</div>
                            <div className="mt-1 text-[9px] text-slate-400">
                              {item.control?.sourceControlId ? 'Control Master linked' : 'No Control Master link'}
                            </div>
                          </td>
                          <td className="p-2.5">
                            <div className="font-bold text-slate-800">{item.testType}</div>
                            <div className="mt-0.5 text-slate-500">{item.testingPhase}</div>
                            <div className="mt-1 text-[9px] text-slate-400">{item.priority} priority</div>
                            {(item.carryForward || item.rollForward) && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {item.carryForward && <span className="rounded bg-slate-100 px-1.5 py-0.5">Carry-forward</span>}
                                {item.rollForward && <span className="rounded bg-slate-100 px-1.5 py-0.5">Roll-forward</span>}
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-600">
                            <div>{item.plannedStartDate}</div>
                            <div className="mt-0.5 font-bold">Due {item.dueDate}</div>
                          </td>
                          <td className="p-2.5">
                            <div className="font-semibold text-slate-700">{item.testerName}</div>
                            <div className="mt-0.5 text-slate-500">{item.reviewerName || 'No reviewer'}</div>
                            <div className="mt-1 text-[9px] text-slate-400">{item.relianceStrategy || 'No reliance strategy'}</div>
                          </td>
                          <td className="p-2.5 text-slate-600">
                            <div>Population: {item.populationSize ?? '—'}</div>
                            <div className="mt-0.5">Planned sample: {item.plannedSampleSize ?? '—'}</div>
                            <div className="mt-0.5 max-w-[180px] truncate text-[9px] text-slate-400">
                              {item.populationSource || 'Population source not set'}
                            </div>
                          </td>
                          <td className="p-2.5">
                            {item.tod ? (
                              <>
                                <div className="font-mono font-bold text-slate-700">{item.tod.testId}</div>
                                <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 font-bold ${executionTone(item.tod.conclusion)}`}>{item.tod.conclusion}</span>
                              </>
                            ) : canTod ? (
                              <button
                                type="button"
                                onClick={() => launchExecution(item, 'TOD')}
                                disabled={saving}
                                className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 font-bold text-sky-700 disabled:opacity-50"
                              >
                                <PlayCircle className="h-3 w-3" /> Launch ToD
                              </button>
                            ) : (
                              <span className="text-slate-400">Not planned</span>
                            )}
                          </td>
                          <td className="p-2.5">
                            {item.toe ? (
                              <>
                                <div className="font-mono font-bold text-slate-700">{item.toe.testId}</div>
                                <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 font-bold ${executionTone(item.toe.finalConclusion)}`}>{item.toe.finalConclusion}</span>
                              </>
                            ) : canToe ? (
                              <button
                                type="button"
                                onClick={() => launchExecution(item, 'TOE')}
                                disabled={saving}
                                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1.5 font-bold text-indigo-700 disabled:opacity-50"
                              >
                                <FlaskConical className="h-3 w-3" /> Launch ToE
                              </button>
                            ) : (
                              <span className="text-slate-400">Not planned</span>
                            )}
                          </td>
                          <td className="p-2.5">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 font-bold ${statusTone(item.derivedExecutionStatus)}`}>
                              {item.derivedExecutionStatus}
                            </span>
                          </td>
                          <td className="p-2.5 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => editPlan(item)}
                                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-brand-300 hover:text-brand-700"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removePlan(item)}
                                disabled={Boolean(item.todAssessmentId || item.toeTestId)}
                                title={item.todAssessmentId || item.toeTestId ? 'Cannot delete after workpaper launch' : 'Remove plan item'}
                                className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:border-rose-200 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Link href="/tod" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-300">
              <Workflow className="h-4 w-4 text-brand-600" />
              <div className="mt-2 text-xs font-black text-slate-900">Continue ToD execution</div>
              <div className="mt-1 text-[10px] leading-4 text-slate-500">Review launched design workpapers and complete design criteria.</div>
            </Link>
            <Link href="/toe" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-300">
              <FlaskConical className="h-4 w-4 text-brand-600" />
              <div className="mt-2 text-xs font-black text-slate-900">Continue ToE execution</div>
              <div className="mt-1 text-[10px] leading-4 text-slate-500">Add actual samples, evidence, results and exceptions to launched ToE workpapers.</div>
            </Link>
            <Link href="/icofr/coverage" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-300">
              <CheckCircle2 className="h-4 w-4 text-brand-600" />
              <div className="mt-2 text-xs font-black text-slate-900">Review coverage & gaps</div>
              <div className="mt-1 text-[10px] leading-4 text-slate-500">Validate whether key controls have the required ToD/ToE coverage and remediation actions.</div>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
