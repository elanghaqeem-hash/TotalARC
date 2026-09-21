'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  FileSearch,
  Filter,
  RefreshCcw,
  Search,
  ShieldAlert,
  TableProperties
} from 'lucide-react';

type SummaryResponse = {
  summary?: {
    totals?: Record<string, number>;
    byType?: Array<Record<string, any>>;
    batches?: Array<Record<string, any>>;
  };
  sourceCoverage?: Array<Record<string, any>>;
  governance?: {
    reconciliationSummary?: Array<Record<string, any>>;
    reconciliation?: Array<Record<string, any>>;
    mappingSummary?: Array<Record<string, any>>;
    operationalSummary?: Array<Record<string, any>>;
    conflicts?: Array<Record<string, any>>;
    sourceIssues?: Array<Record<string, any>>;
    operationalExceptions?: Array<Record<string, any>>;
  };
};

type RecordsResponse = {
  records?: Array<Record<string, any>>;
  total?: number;
  page?: number;
  pageSize?: number;
};

const qualityOptions = ['', 'COMPLETE', 'PARTIAL', 'INCOMPLETE', 'UNIDENTIFIED_FORMAT', 'NOT_EVALUATED'];
const mappingOptions = ['', 'NEEDS_MAPPING', 'NEEDS_REVIEW', 'NEEDS_APPROVAL', 'REFERENCE_ONLY', 'MAPPED', 'NOT_EVALUATED'];

function badgeClass(value: string) {
  if (['COMPLETE', 'MAPPED', 'NORMALIZED'].includes(value)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (['PARTIAL', 'NEEDS_REVIEW', 'NEEDS_APPROVAL', 'REFERENCE_ONLY'].includes(value)) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (['INCOMPLETE', 'UNIDENTIFIED_FORMAT', 'NOT_NORMALIZED'].includes(value)) return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function humanBytes(value: unknown) {
  const bytes = number(value);
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

export default function DataIntegrationHubPage() {
  const [summary, setSummary] = useState<SummaryResponse>({});
  const [records, setRecords] = useState<RecordsResponse>({});
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'records' | 'sources' | 'governance' | 'exceptions'>('records');
  const [page, setPage] = useState(1);
  const [recordType, setRecordType] = useState('');
  const [quality, setQuality] = useState('');
  const [mapping, setMapping] = useState('');
  const [sourceRole, setSourceRole] = useState('');
  const [query, setQuery] = useState('');
  const [queryDraft, setQueryDraft] = useState('');

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const response = await fetch('/api/admin/data-hub?view=summary', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Data hub summary unavailable.');
      setSummary(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Data hub summary unavailable.');
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const loadRecords = useCallback(async () => {
    setLoadingRecords(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '50' });
      if (recordType) params.set('recordType', recordType);
      if (quality) params.set('quality', quality);
      if (mapping) params.set('mapping', mapping);
      if (sourceRole) params.set('sourceRole', sourceRole);
      if (query) params.set('q', query);
      const response = await fetch('/api/admin/data-hub?' + params.toString(), { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Structured source records unavailable.');
      setRecords(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Structured source records unavailable.');
    } finally {
      setLoadingRecords(false);
    }
  }, [mapping, page, quality, query, recordType, sourceRole]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);
  useEffect(() => { void loadRecords(); }, [loadRecords]);

  const totals = summary.summary?.totals || {};
  const byType = summary.summary?.byType || [];
  const sources = summary.sourceCoverage || [];
  const recordTypes = useMemo(() => byType.map(item => String(item.recordType || '')).filter(Boolean), [byType]);
  const sourceExceptions = useMemo(() => sources.filter(source => (source.issues || []).length > 0), [sources]);
  const governance = summary.governance || {};
  const reconciliation = governance.reconciliation || [];
  const reconciliationSummary = governance.reconciliationSummary || [];
  const mappingSummary = governance.mappingSummary || [];
  const operationalSummary = governance.operationalSummary || [];
  const conflicts = governance.conflicts || [];
  const sourceIssues = governance.sourceIssues || [];
  const operationalExceptions = governance.operationalExceptions || [];
  const totalPages = Math.max(1, Math.ceil(number(records.total) / 50));

  const applyQuickFilter = (next: { quality?: string; mapping?: string }) => {
    setQuality(next.quality || '');
    setMapping(next.mapping || '');
    setPage(1);
    setTab('records');
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-sky-600">
              <Database className="h-4 w-4" /> Manage · Source Integration
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Data Integration Hub</h1>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
              Menampilkan seluruh structured source data, provenance, completeness, mapping readiness, dan source exception tanpa mengisi data yang tidak tersedia di sumber.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setError(''); void loadSummary(); void loadRecords(); }}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600 hover:border-brand-300 hover:text-brand-700"
          >
            <RefreshCcw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
          {error}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        {[
          ['Structured records', totals.structuredRecords, 'persistent staging'],
          ['Source documents', totals.sourceDocuments, 'raw/indexed source'],
          ['Normalized sources', totals.normalizedSourceDocuments, 'with structured rows'],
          ['Incomplete', totals.incompleteRecords, 'required fields missing'],
          ['Unidentified', totals.unidentifiedRecords, 'format not yet mapped'],
          ['Action required', totals.actionRequiredRecords, 'mapping/review/approval']
        ].map(([label, value, note]) => (
          <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
            <div className="mt-1 text-2xl font-black text-slate-900">{loadingSummary ? '—' : number(value)}</div>
            <div className="mt-1 text-[10px] text-slate-500">{note}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            ['records', 'All Structured Data'],
            ['sources', 'Source Coverage'],
            ['governance', 'Reconciliation & Mapping'],
            ['exceptions', 'Exceptions']
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value as typeof tab)}
              className={'rounded-xl px-3 py-2.5 text-[11px] font-black transition ' + (tab === value ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50')}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {tab === 'records' && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="text-[10px] font-bold uppercase text-slate-500">
                Record type
                <select value={recordType} onChange={e => { setRecordType(e.target.value); setPage(1); }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-normal normal-case">
                  <option value="">All types</option>
                  {recordTypes.map(type => <option key={type}>{type}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase text-slate-500">
                Completeness
                <select value={quality} onChange={e => { setQuality(e.target.value); setPage(1); }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-normal normal-case">
                  {qualityOptions.map(value => <option key={value} value={value}>{value || 'All quality states'}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase text-slate-500">
                Mapping status
                <select value={mapping} onChange={e => { setMapping(e.target.value); setPage(1); }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-normal normal-case">
                  {mappingOptions.map(value => <option key={value} value={value}>{value || 'All mapping states'}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase text-slate-500">
                Source role
                <select value={sourceRole} onChange={e => { setSourceRole(e.target.value); setPage(1); }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-normal normal-case">
                  <option value="">All source roles</option>
                  <option>BASELINE</option>
                  <option>UPDATE</option>
                </select>
              </label>
              <form
                onSubmit={event => { event.preventDefault(); setQuery(queryDraft.trim()); setPage(1); }}
                className="flex items-end gap-2"
              >
                <label className="min-w-0 flex-1 text-[10px] font-bold uppercase text-slate-500">
                  Search
                  <input value={queryDraft} onChange={e => setQueryDraft(e.target.value)} placeholder="key, title, source…" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-normal normal-case" />
                </label>
                <button className="mb-0.5 rounded-xl bg-slate-900 p-2.5 text-white" aria-label="Search">
                  <Search className="h-4 w-4" />
                </button>
              </form>
            </div>
          </section>

          <section className="space-y-3">
            {loadingRecords ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500">Loading structured records…</div>
            ) : (records.records || []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">No records match the current filter.</div>
            ) : (records.records || []).map(record => (
              <article key={record.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] font-black text-brand-700">{record.recordKey}</span>
                      <span className={'rounded-full border px-2 py-0.5 text-[9px] font-black ' + badgeClass(String(record.completenessStatus))}>{record.completenessStatus}</span>
                      <span className={'rounded-full border px-2 py-0.5 text-[9px] font-black ' + badgeClass(String(record.mappingStatus))}>{record.mappingStatus}</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-500">{record.sourceRole} · P{record.precedencePriority}</span>
                    </div>
                    <div className="mt-1 text-sm font-black text-slate-900">{record.recordTitle || record.recordType}</div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {record.recordType} · {record.normalizationBatch} · Source: {record.sourceTitle}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600">{number(record.completenessScore)}%</span>
                    {record.targetHref && (
                      <Link href={record.targetHref} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:text-brand-700">
                        {record.targetModule || 'Target'} <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>

                {Array.isArray(record.missingFields) && record.missingFields.length > 0 && (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[10px] text-rose-700">
                    Missing required fields: {record.missingFields.join(', ')}
                  </div>
                )}

                <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50">
                  <summary className="cursor-pointer px-3 py-2 text-[10px] font-black text-slate-600">Show full structured payload</summary>
                  <pre className="max-h-[420px] overflow-auto border-t border-slate-200 p-3 text-[10px] leading-5 text-slate-700">{JSON.stringify(record.payload, null, 2)}</pre>
                </details>
              </article>
            ))}
          </section>

          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3">
            <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />Previous</button>
            <div className="text-[10px] font-bold text-slate-500">Page {page} of {totalPages} · {number(records.total)} records</div>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold disabled:opacity-40">Next<ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </>
      )}

      {tab === 'sources' && (
        <section className="space-y-3">
          {sources.map(source => (
            <article key={source.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={'rounded-full border px-2 py-0.5 text-[9px] font-black ' + badgeClass(source.normalizationStatus)}>{source.normalizationStatus}</span>
                    <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[9px] font-bold">{source.sourceRole || 'UNSPECIFIED'} · P{source.precedencePriority}</span>
                    {source.module && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-bold text-sky-700">{source.module}</span>}
                  </div>
                  <div className="mt-1 break-words text-sm font-black text-slate-900">{source.title}</div>
                  <div className="mt-1 text-[10px] text-slate-500">{source.sourceAccount || 'Unknown source account'} · {source.sourceKind}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                  <div className="rounded-lg bg-slate-50 px-2 py-2"><b className="block text-slate-900">{number(source.structuredRecords)}</b>records</div>
                  <div className="rounded-lg bg-slate-50 px-2 py-2"><b className="block text-slate-900">{humanBytes(source.rawSizeBytes)}</b>raw</div>
                  <div className="rounded-lg bg-slate-50 px-2 py-2"><b className="block text-slate-900">{number(source.textLength)}</b>chars</div>
                </div>
              </div>
              {(source.issues || []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(source.issues || []).map((issue: string) => <span key={issue} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-700">{issue}</span>)}
                </div>
              )}
              {source.higherPrecedenceSource && (
                <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[10px] text-sky-800">
                  Higher precedence source available: <b>{source.higherPrecedenceSource.title}</b> ({source.higherPrecedenceSource.sourceRole}, P{source.higherPrecedenceSource.precedencePriority})
                </div>
              )}
              {source.potentiallyMoreCompleteSource && (
                <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-[10px] text-indigo-800">
                  Potentially more complete source: <b>{source.potentiallyMoreCompleteSource.title}</b>. Listed for review; no automatic overwrite is performed.
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {tab === 'governance' && (
        <div className="space-y-5">
          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[10px] font-bold uppercase text-slate-400">Reconciliation rows</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{reconciliationSummary.reduce((sum, item) => sum + number(item.records), 0)}</div>
              <div className="mt-1 text-[10px] text-slate-500">Aura baseline vs Seraya update classification</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[10px] font-bold uppercase text-slate-400">Operational links</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{operationalSummary.reduce((sum, item) => sum + number(item.records), 0)}</div>
              <div className="mt-1 text-[10px] text-slate-500">source-backed links to Total ARC modules</div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-[10px] font-bold uppercase text-amber-700">Governance exceptions</div>
              <div className="mt-1 text-2xl font-black text-amber-900">{operationalExceptions.length}</div>
              <div className="mt-1 text-[10px] text-amber-700">review/config/policy items shown below</div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black text-slate-900">Source precedence reconciliation</h2>
            <p className="mt-1 text-[10px] text-slate-500">No fuzzy candidate is promoted automatically. Exact links may choose UPDATE as effective; unmatched UPDATE sources stay independent until structured normalization.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-[10px]">
                <thead className="text-slate-400"><tr><th className="px-2 py-2">Status</th><th className="px-2 py-2">Method</th><th className="px-2 py-2">Confidence</th><th className="px-2 py-2">Baseline</th><th className="px-2 py-2">Update</th><th className="px-2 py-2">Module</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {reconciliation.map(item => (
                    <tr key={item.id}>
                      <td className="px-2 py-2"><span className={'rounded-full border px-2 py-0.5 font-bold ' + badgeClass(String(item.status))}>{item.status}</span></td>
                      <td className="px-2 py-2 text-slate-600">{item.matchMethod}</td>
                      <td className="px-2 py-2">{Math.round(number(item.confidence) * 100)}%</td>
                      <td className="max-w-[260px] px-2 py-2 text-slate-700">{item.baselineTitle || '—'}</td>
                      <td className="max-w-[260px] px-2 py-2 font-semibold text-slate-900">{item.updateTitle || '—'}</td>
                      <td className="px-2 py-2">{item.module || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {conflicts.length > 0 && (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-rose-600" />
                <h2 className="text-sm font-black text-rose-900">Open source-data conflicts</h2>
              </div>
              <p className="mt-1 text-[10px] text-rose-700">
                Conflicting source values are displayed together. Total ARC does not choose a winner until the review/approval decision is recorded.
              </p>
              <div className="mt-4 space-y-2">
                {conflicts.map(item => (
                  <div key={item.id} className="rounded-xl border border-rose-200 bg-white p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-black text-rose-800">{item.conflictStatus}</span>
                      <span className="font-mono text-[10px] font-black text-slate-700">{item.conflictGroup} · {item.parameterKey}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3 text-[10px]">
                      <div className="rounded-lg bg-slate-50 p-2"><b className="block text-slate-500">Baseline</b>{item.baselineValue ?? '—'}<div className="text-[9px] text-slate-400">{item.baselineStatus || ''}</div></div>
                      <div className="rounded-lg bg-sky-50 p-2"><b className="block text-sky-700">Seraya update</b>{item.updateValue ?? '—'}<div className="text-[9px] text-sky-600">{item.updateStatus || ''}</div></div>
                      <div className="rounded-lg bg-indigo-50 p-2"><b className="block text-indigo-700">Other update source</b>{item.otherUpdateValue ?? '—'}<div className="text-[9px] text-indigo-600">{item.otherUpdateStatus || ''}</div></div>
                    </div>
                    <div className="mt-2 text-[10px] leading-4 text-rose-800">{item.reason}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-slate-900">Mapping queue</h2>
              <div className="mt-3 space-y-2">
                {mappingSummary.map((item, index) => (
                  <div key={item.queueStatus + ':' + item.targetModule + ':' + index} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                    <div><div className="text-[10px] font-black text-slate-800">{item.queueStatus}</div><div className="text-[9px] text-slate-500">{item.targetModule || 'Unidentified'}</div></div>
                    <div className="text-sm font-black text-slate-900">{number(item.records)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-slate-900">Operational-link policy</h2>
              <div className="mt-3 space-y-2">
                {operationalSummary.map((item, index) => (
                  <div key={item.linkStatus + ':' + item.targetModule + ':' + index} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                    <div><div className="text-[10px] font-black text-slate-800">{item.linkStatus}</div><div className="text-[9px] text-slate-500">{item.targetModule}</div></div>
                    <div className="text-sm font-black text-slate-900">{number(item.records)}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-sm font-black text-amber-900">Items that must not be auto-promoted</h2>
            <div className="mt-3 space-y-2">
              {operationalExceptions.slice(0, 100).map(item => (
                <div key={item.id} className="rounded-xl border border-amber-200 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-800">{item.linkStatus}</span>
                    <span className="text-[9px] font-bold text-slate-500">{item.targetModule}</span>
                    <span className="text-[9px] text-slate-400">{item.recordType}</span>
                  </div>
                  <div className="mt-1 text-xs font-black text-slate-900">{item.recordTitle || item.recordKey}</div>
                  <div className="mt-1 text-[10px] text-slate-500">Source: {item.sourceTitle}</div>
                  <div className="mt-2 text-[10px] leading-4 text-amber-800">{item.decisionBasis}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'exceptions' && (
        <div className="space-y-5">
          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <button onClick={() => applyQuickFilter({ quality: 'INCOMPLETE' })} className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left">
              <ShieldAlert className="h-5 w-5 text-rose-600" />
              <div className="mt-2 text-sm font-black text-rose-900">Incomplete data</div>
              <div className="mt-1 text-[10px] text-rose-700">{number(totals.incompleteRecords)} records have required fields missing.</div>
            </button>
            <button onClick={() => applyQuickFilter({ quality: 'UNIDENTIFIED_FORMAT' })} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left">
              <FileSearch className="h-5 w-5 text-amber-600" />
              <div className="mt-2 text-sm font-black text-amber-900">Unidentified format</div>
              <div className="mt-1 text-[10px] text-amber-700">{number(totals.unidentifiedRecords)} records need a database format decision.</div>
            </button>
            <button onClick={() => applyQuickFilter({ mapping: 'NEEDS_REVIEW' })} className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-left">
              <Filter className="h-5 w-5 text-sky-600" />
              <div className="mt-2 text-sm font-black text-sky-900">Review / mapping queue</div>
              <div className="mt-1 text-[10px] text-sky-700">{number(totals.actionRequiredRecords)} records require mapping, review, or approval.</div>
            </button>
          </section>

          <section className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-600" />
              <h2 className="text-sm font-black text-slate-900">Open source data issues</h2>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              Anomali yang berasal dari dokumen sumber—nilai tidak direkayasa atau dikoreksi otomatis. HIGH ditampilkan lebih dahulu.
            </p>
            <div className="mt-4 space-y-2">
              {sourceIssues.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-700">
                  <CheckCircle2 className="mr-2 inline h-4 w-4" />No open source-data issues.
                </div>
              ) : sourceIssues.map(issue => (
                <div key={issue.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={'rounded-full border px-2 py-0.5 text-[9px] font-black ' + (String(issue.severity) === 'HIGH' ? 'border-rose-200 bg-rose-50 text-rose-700' : String(issue.severity) === 'MEDIUM' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600')}>{issue.severity}</span>
                    <span className="font-mono text-[9px] font-black text-slate-700">{issue.issueType}</span>
                    {issue.sourceRecordKey && <span className="text-[9px] text-slate-400">{issue.sourceRecordKey}</span>}
                  </div>
                  <div className="mt-1 text-xs font-black text-slate-900">{issue.sourceTitle}</div>
                  <div className="mt-1 text-[10px] leading-4 text-slate-600">{issue.description}</div>
                  {(issue.observedValue || issue.expectedContext) && (
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 text-[10px]">
                      {issue.observedValue && <div className="rounded-lg bg-rose-50 p-2"><b className="block text-rose-700">Observed</b>{issue.observedValue}</div>}
                      {issue.expectedContext && <div className="rounded-lg bg-sky-50 p-2"><b className="block text-sky-700">Expected / context</b>{issue.expectedContext}</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h2 className="text-sm font-black text-slate-900">Source exceptions & update candidates</h2>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              Source with no structured rows, missing raw/indexed representation, higher-precedence counterpart, or a potentially more complete counterpart.
            </p>
            <div className="mt-4 space-y-2">
              {sourceExceptions.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-700"><CheckCircle2 className="mr-2 inline h-4 w-4" />No source-level exceptions detected.</div>
              ) : sourceExceptions.map(source => (
                <div key={source.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs font-black text-slate-900">{source.title}</div>
                  <div className="mt-1 text-[10px] text-slate-500">{source.sourceRole || 'UNSPECIFIED'} · P{source.precedencePriority} · {number(source.structuredRecords)} structured rows</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(source.issues || []).map((issue: string) => <span key={issue} className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-700">{issue}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><TableProperties className="h-4 w-4 text-slate-500" /><h2 className="text-sm font-black text-slate-900">Completeness by record type</h2></div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-[10px]">
                <thead className="text-slate-400"><tr><th className="px-2 py-2">Record type</th><th className="px-2 py-2">Total</th><th className="px-2 py-2">Complete</th><th className="px-2 py-2">Partial</th><th className="px-2 py-2">Incomplete</th><th className="px-2 py-2">Unidentified</th><th className="px-2 py-2">Action</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {byType.map(item => (
                    <tr key={item.recordType}>
                      <td className="px-2 py-2 font-bold text-slate-800">{item.recordType}</td>
                      <td className="px-2 py-2">{number(item.records)}</td>
                      <td className="px-2 py-2 text-emerald-700">{number(item.completeRecords)}</td>
                      <td className="px-2 py-2 text-amber-700">{number(item.partialRecords)}</td>
                      <td className="px-2 py-2 text-rose-700">{number(item.incompleteRecords)}</td>
                      <td className="px-2 py-2 text-rose-700">{number(item.unidentifiedRecords)}</td>
                      <td className="px-2 py-2">{number(item.actionRequired)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
