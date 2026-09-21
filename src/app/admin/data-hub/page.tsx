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
  const [tab, setTab] = useState<'records' | 'sources' | 'exceptions'>('records');
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
        <div className="grid grid-cols-3 gap-2">
          {[
            ['records', 'All Structured Data'],
            ['sources', 'Source Coverage'],
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
