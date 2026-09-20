'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Link2,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2
} from 'lucide-react';

const emptyAction = {
  id: '',
  gapKey: '',
  gapType: '',
  sourceType: '',
  sourceId: '',
  title: '',
  actionPlan: '',
  owner: '',
  reviewer: '',
  dueDate: '',
  priority: 'High',
  status: 'Open',
  notes: ''
};

const emptyDependency = {
  sourceControlId: '',
  dependencyControlId: '',
  dependencyType: 'ITGC Dependency',
  rationale: '',
  status: 'Active'
};

function metricTone(percent: number | null) {
  if (percent === null) return 'border-slate-200 bg-slate-50 text-slate-600';
  if (percent >= 90) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (percent >= 70) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function severityTone(severity: string) {
  if (severity === 'Critical') return 'border-rose-300 bg-rose-100 text-rose-800';
  if (severity === 'High') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (severity === 'Medium') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function IcofrCoveragePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [gapFilter, setGapFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [actionForm, setActionForm] = useState(emptyAction);
  const [dependencyForm, setDependencyForm] = useState(emptyDependency);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/icofr/coverage', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'ICOFR coverage data unavailable.');
      setData(payload);
      setDependencyForm(current => ({
        ...current,
        sourceControlId: current.sourceControlId || payload.selectors?.itac?.[0]?.id || '',
        dependencyControlId: current.dependencyControlId || payload.selectors?.itgc?.[0]?.id || ''
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ICOFR coverage data unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const gaps = useMemo(() => {
    const rows = data?.gaps || [];
    return rows.filter((item: any) => {
      if (gapFilter !== 'ALL' && item.severity !== gapFilter) return false;
      if (!query.trim()) return true;
      const text = [item.gapType, item.title, item.detail, item.sourceType]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return text.includes(query.trim().toLowerCase());
    });
  }, [data, gapFilter, query]);

  const coverageCards = useMemo(() => {
    const metrics = data?.metrics || {};
    return [
      ['FS Item → Assertion', metrics.financialStatementCoverage, '/icofr/accounts'],
      ['Assertion → Risk', metrics.assertionRiskCoverage, '/icofr/traceability'],
      ['Risk → Control', metrics.riskControlCoverage, '/icofr/traceability'],
      ['Key Control → ToD', metrics.todCoverage, '/icofr/traceability'],
      ['Key Control → ToE', metrics.toeCoverage, '/toe'],
      ['ITAC → ITGC', metrics.itacItgcCoverage, '/icofr/coverage'],
      ['Key IPE/EUC Validation', metrics.informationValidationCoverage, '/icofr/information'],
      ['Deficiency → MAP', metrics.remediationCoverage, '/remediation']
    ];
  }, [data]);

  const selectGap = (gap: any) => {
    const existing = gap.action;
    setActionForm(
      existing
        ? {
            id: existing.id || '',
            gapKey: existing.gapKey || gap.gapKey,
            gapType: existing.gapType || gap.gapType,
            sourceType: existing.sourceType || gap.sourceType,
            sourceId: existing.sourceId || gap.sourceId,
            title: existing.title || gap.title,
            actionPlan: existing.actionPlan || '',
            owner: existing.owner || '',
            reviewer: existing.reviewer || '',
            dueDate: existing.dueDate || '',
            priority: existing.priority || gap.severity || 'High',
            status: existing.status || 'Open',
            notes: existing.notes || ''
          }
        : {
            ...emptyAction,
            gapKey: gap.gapKey,
            gapType: gap.gapType,
            sourceType: gap.sourceType,
            sourceId: gap.sourceId,
            title: gap.title,
            priority: gap.severity === 'Critical' ? 'Critical' : gap.severity === 'High' ? 'High' : 'Medium'
          }
    );
    setMessage('');
    setError('');
    document.getElementById('gap-action-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const editAction = (action: any) => {
    setActionForm({
      id: action.id || '',
      gapKey: action.gapKey || '',
      gapType: action.gapType || '',
      sourceType: action.sourceType || '',
      sourceId: action.sourceId || '',
      title: action.title || '',
      actionPlan: action.actionPlan || '',
      owner: action.owner || '',
      reviewer: action.reviewer || '',
      dueDate: action.dueDate || '',
      priority: action.priority || 'Medium',
      status: action.status || 'Open',
      notes: action.notes || ''
    });
    document.getElementById('gap-action-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const saveGapAction = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/icofr/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'SAVE_GAP_ACTION', ...actionForm })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save gap action.');
      setMessage(actionForm.id ? 'Gap action updated in Cloudflare D1.' : 'Gap action saved in Cloudflare D1.');
      setActionForm(current => ({ ...current, id: payload.id }));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save gap action.');
    } finally {
      setSaving(false);
    }
  };

  const saveDependency = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/icofr/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'SAVE_DEPENDENCY', ...dependencyForm })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save ITAC-ITGC dependency.');
      setMessage('ITAC-ITGC dependency saved in Cloudflare D1.');
      setDependencyForm(current => ({ ...emptyDependency, sourceControlId: current.sourceControlId }));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save ITAC-ITGC dependency.');
    } finally {
      setSaving(false);
    }
  };

  const removeDependency = async (id: string) => {
    if (!window.confirm('Remove this ITAC-ITGC dependency?')) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/icofr/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'REMOVE_DEPENDENCY', id })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to remove dependency.');
      setMessage('ITAC-ITGC dependency removed.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove dependency.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-sky-600">
              <BarChart3 className="h-4 w-4" /> ICOFR Coverage & Gap Analytics
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Coverage, Gap & Action Management</h1>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
              Coverage is calculated only from persisted ICOFR and assurance records. Use the active database-backed forms below
              to document ITAC-ITGC dependencies and accountable actions for unresolved gaps.
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex self-start items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh analytics
          </button>
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
          Register an institution before using ICOFR coverage analytics.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {coverageCards.map(([label, metric, href]: any) => (
              <Link
                key={String(label)}
                href={String(href)}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                    <div className="mt-1 text-2xl font-black text-slate-900">
                      {metric?.percent === null || metric?.percent === undefined ? 'N/A' : `${metric.percent}%`}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {metric?.covered || 0} of {metric?.total || 0} covered
                    </div>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${metricTone(metric?.percent ?? null)}`}>
                    {metric?.total ? 'Coverage' : 'No scope'}
                  </span>
                </div>
              </Link>
            ))}
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Open gaps', data?.metrics?.openGaps || 0, 'rose'],
              ['Gaps with actions', data?.metrics?.gapsWithActions || 0, 'sky'],
              ['Open actions', data?.metrics?.openActions || 0, 'amber'],
              ['Overdue actions', data?.metrics?.overdueActions || 0, 'rose']
            ].map(([label, value, tone]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                <div className={`mt-1 text-xl font-black ${tone === 'rose' ? 'text-rose-700' : tone === 'amber' ? 'text-amber-700' : 'text-sky-700'}`}>
                  {value}
                </div>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">ITAC → ITGC Dependency Mapping</h2>
                  <p className="text-[10px] text-slate-500">Active form persisted to Cloudflare D1.</p>
                </div>
              </div>

              {(data?.selectors?.itac?.length || 0) === 0 || (data?.selectors?.itgc?.length || 0) === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Register at least one ITAC and one ITGC before creating dependency mappings.
                  <div className="mt-2 flex gap-3">
                    <Link href="/icofr/itac" className="font-bold underline">Open ITAC</Link>
                    <Link href="/icofr/itgc" className="font-bold underline">Open ITGC</Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={saveDependency} className="space-y-3">
                  <label className="block text-xs font-bold text-slate-700">
                    IT Application Control *
                    <select
                      required
                      value={dependencyForm.sourceControlId}
                      onChange={e => setDependencyForm({ ...dependencyForm, sourceControlId: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    >
                      <option value="">Select ITAC</option>
                      {(data?.selectors?.itac || []).map((item: any) => (
                        <option key={item.id} value={item.id}>{item.controlCode} · {item.name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-xs font-bold text-slate-700">
                    Supporting IT General Control *
                    <select
                      required
                      value={dependencyForm.dependencyControlId}
                      onChange={e => setDependencyForm({ ...dependencyForm, dependencyControlId: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    >
                      <option value="">Select ITGC</option>
                      {(data?.selectors?.itgc || []).map((item: any) => (
                        <option key={item.id} value={item.id}>{item.controlCode} · {item.name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-xs font-bold text-slate-700">
                    Dependency type
                    <select
                      value={dependencyForm.dependencyType}
                      onChange={e => setDependencyForm({ ...dependencyForm, dependencyType: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    >
                      <option>ITGC Dependency</option>
                      <option>Logical Access Dependency</option>
                      <option>Change Management Dependency</option>
                      <option>Computer Operations Dependency</option>
                      <option>Interface / Batch Dependency</option>
                      <option>SDLC Dependency</option>
                    </select>
                  </label>

                  <label className="block text-xs font-bold text-slate-700">
                    Rationale
                    <textarea
                      rows={3}
                      value={dependencyForm.rationale}
                      onChange={e => setDependencyForm({ ...dependencyForm, rationale: e.target.value })}
                      placeholder="Explain why this ITGC supports reliable operation of the selected ITAC."
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5"
                    />
                  </label>

                  <div className="flex justify-end">
                    <button
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      Save dependency
                    </button>
                  </div>
                </form>
              )}

              <div className="mt-5 border-t border-slate-100 pt-4">
                <h3 className="mb-2 text-xs font-black text-slate-700">Saved dependencies</h3>
                {(data?.dependencies || []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-[10px] text-slate-500">
                    No ITAC-ITGC dependencies registered.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(data?.dependencies || []).map((item: any) => (
                      <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-black text-brand-700">
                            {item.sourceControl?.controlCode || 'ITAC'} → {item.dependencyControl?.controlCode || 'ITGC'}
                          </div>
                          <div className="mt-0.5 text-xs font-bold text-slate-800">
                            {item.sourceControl?.name || 'Source control'} → {item.dependencyControl?.name || 'Supporting ITGC'}
                          </div>
                          <div className="mt-1 text-[9px] text-slate-500">{item.dependencyType}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDependency(item.id)}
                          className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                          title="Remove dependency"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section id="gap-action-form" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">Gap Action Form</h2>
                  <p className="text-[10px] text-slate-500">Create or update an accountable action directly against an identified gap.</p>
                </div>
              </div>

              {!actionForm.gapKey ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-7 text-center text-xs text-slate-500">
                  Select <strong>Create action</strong> from a gap below to populate this database-backed form.
                </div>
              ) : (
                <form onSubmit={saveGapAction} className="space-y-3">
                  <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                    <div className="text-[9px] font-black uppercase text-sky-600">{actionForm.gapType}</div>
                    <div className="mt-1 text-xs font-black text-slate-900">{actionForm.title}</div>
                    <div className="mt-1 font-mono text-[9px] text-slate-500">{actionForm.gapKey}</div>
                  </div>

                  <label className="block text-xs font-bold text-slate-700">
                    Action plan *
                    <textarea
                      required
                      rows={3}
                      value={actionForm.actionPlan}
                      onChange={e => setActionForm({ ...actionForm, actionPlan: e.target.value })}
                      placeholder="State the concrete remediation or completion action."
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5"
                    />
                  </label>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700">
                      Owner *
                      <input
                        required
                        value={actionForm.owner}
                        onChange={e => setActionForm({ ...actionForm, owner: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Reviewer
                      <input
                        value={actionForm.reviewer}
                        onChange={e => setActionForm({ ...actionForm, reviewer: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Due date *
                      <input
                        type="date"
                        required
                        value={actionForm.dueDate}
                        onChange={e => setActionForm({ ...actionForm, dueDate: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Priority
                      <select
                        value={actionForm.priority}
                        onChange={e => setActionForm({ ...actionForm, priority: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      >
                        <option>Critical</option>
                        <option>High</option>
                        <option>Medium</option>
                        <option>Low</option>
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Status
                      <select
                        value={actionForm.status}
                        onChange={e => setActionForm({ ...actionForm, status: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      >
                        <option>Open</option>
                        <option>In Progress</option>
                        <option>Pending Review</option>
                        <option>Closed</option>
                        <option>Cancelled</option>
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Notes
                      <textarea
                        rows={2}
                        value={actionForm.notes}
                        onChange={e => setActionForm({ ...actionForm, notes: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      />
                    </label>
                  </div>

                  <div className="flex justify-end">
                    <button
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {actionForm.id ? 'Update gap action' : 'Save gap action'}
                    </button>
                  </div>
                </form>
              )}
            </section>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-sm font-black text-slate-900">Detected ICOFR gaps</h2>
                <p className="mt-1 text-[10px] text-slate-500">
                  Gaps are generated from missing persisted relationships or required testing/validation records, not from simulated data.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search gaps…"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
                <select
                  value={gapFilter}
                  onChange={e => setGapFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
                >
                  <option value="ALL">All severity</option>
                  <option>Critical</option>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="py-10 text-center text-xs text-slate-500">Calculating coverage and gaps…</div>
            ) : gaps.length === 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center text-xs text-emerald-700">
                No gaps match the current filter.
              </div>
            ) : (
              <div className="space-y-2">
                {gaps.map((item: any) => (
                  <div key={item.gapKey} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${severityTone(item.severity)}`}>
                            {item.severity}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-600">
                            {item.gapType}
                          </span>
                          {item.action && (
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[9px] font-bold text-sky-700">
                              Action: {item.action.status}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 text-xs font-black text-slate-900">{item.title}</div>
                        <div className="mt-1 max-w-4xl text-[11px] leading-5 text-slate-600">{item.detail}</div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Link
                          href={item.relatedHref}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:border-brand-300 hover:text-brand-700"
                        >
                          {item.relatedLabel} <ArrowRight className="h-3 w-3" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => selectGap(item)}
                          className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-brand-700"
                        >
                          {item.action ? <Pencil className="h-3 w-3" /> : <Save className="h-3 w-3" />}
                          {item.action ? 'Edit action' : 'Create action'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-slate-900">ICOFR Gap Action Register</h2>
                <p className="mt-1 text-[10px] text-slate-500">Persistent accountable actions created from detected gaps.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                {(data?.actions || []).length} actions
              </span>
            </div>

            {(data?.actions || []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                No gap actions registered.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[1000px] w-full text-[10px]">
                  <thead className="bg-slate-100 text-slate-500">
                    <tr>
                      <th className="p-2.5 text-left">Gap</th>
                      <th className="p-2.5 text-left">Action</th>
                      <th className="p-2.5 text-left">Owner</th>
                      <th className="p-2.5 text-left">Due Date</th>
                      <th className="p-2.5 text-left">Priority</th>
                      <th className="p-2.5 text-left">Status</th>
                      <th className="p-2.5 text-right">Edit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.actions || []).map((item: any) => (
                      <tr key={item.id} className="border-b border-slate-100 align-top">
                        <td className="p-2.5">
                          <div className="font-bold text-slate-800">{item.title}</div>
                          <div className="mt-0.5 text-[9px] text-slate-400">{item.gapType}</div>
                        </td>
                        <td className="max-w-[350px] p-2.5 leading-4 text-slate-600">{item.actionPlan}</td>
                        <td className="p-2.5 font-semibold text-slate-700">{item.owner}</td>
                        <td className="p-2.5 text-slate-600">{item.dueDate}</td>
                        <td className="p-2.5">{item.priority}</td>
                        <td className="p-2.5">{item.status}</td>
                        <td className="p-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => editAction(item)}
                            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-brand-300 hover:text-brand-700"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
