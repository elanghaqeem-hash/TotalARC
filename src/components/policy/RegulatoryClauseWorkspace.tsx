'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  FileDiff,
  FileSearch,
  GitCompareArrows,
  Loader2,
  Plus,
  RefreshCw,
  ScanText,
  ShieldCheck,
  Sparkles,
  X,
  XCircle
} from 'lucide-react';

type Lookup = Record<string, unknown> & { id: string };

type SourceVersion = {
  id: string;
  regulationId: string;
  sourceDocumentId: string;
  versionLabel: string;
  sourceDate: string | null;
  effectiveDate: string | null;
  isCurrent: number;
  linkedBy: string;
  createdAt: string;
  updatedAt: string;
};

type Clause = {
  id: string;
  sourceVersionId: string;
  clauseKey: string;
  clauseTitle: string;
  clauseText: string;
  textHash: string;
  orderIndex: number;
};

type Draft = {
  id: string;
  regulationId: string;
  sourceVersionId: string;
  clauseSnapshotId: string;
  draftCode: string;
  requirementText: string;
  requirementType: string;
  applicability: string;
  frequency: string | null;
  criticality: string;
  rationale: string | null;
  confidence: string;
  status: string;
  acceptedObligationId: string | null;
  aiProvider: string | null;
  aiModel: string | null;
};

type Impact = {
  id: string;
  clauseDraftId: string;
  targetType: string;
  targetId: string;
  impactType: string;
  rationale: string | null;
  confidence: string;
  status: string;
};

type Workspace = {
  canManage: boolean;
  metrics: {
    linkedVersions: number;
    currentVersions: number;
    clauses: number;
    pendingDrafts: number;
    acceptedDrafts: number;
    pendingImpacts: number;
  };
  regulations: Lookup[];
  sources: Lookup[];
  sourceVersions: SourceVersion[];
  snapshots: Clause[];
  drafts: Draft[];
  impacts: Impact[];
  runs: Lookup[];
};

type CompareResult = {
  older?: { id: string; versionLabel: string };
  newer?: { id: string; versionLabel: string };
  metrics: {
    added: number;
    changed: number;
    removed: number;
    unchanged: number;
  };
  changes: Array<{
    clauseKey: string;
    changeType: string;
    before: Clause | null;
    after: Clause | null;
  }>;
};

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? value + 'T00:00:00' : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

function confidenceClass(value: string) {
  if (value === 'HIGH') return 'bg-emerald-100 text-emerald-800';
  if (value === 'MEDIUM') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-600';
}

function changeClass(value: string) {
  if (value === 'ADDED') return 'bg-emerald-100 text-emerald-800';
  if (value === 'CHANGED') return 'bg-amber-100 text-amber-800';
  if (value === 'REMOVED') return 'bg-rose-100 text-rose-800';
  return 'bg-slate-100 text-slate-600';
}

export function RegulatoryClauseWorkspace() {
  const [data, setData] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState<'sources' | 'compare' | 'drafts'>('sources');
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [selectedRegulationId, setSelectedRegulationId] = useState('');
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);

  const [sourceForm, setSourceForm] = useState({
    regulationId: '',
    sourceDocumentId: '',
    versionLabel: '',
    sourceDate: '',
    effectiveDate: '',
    isCurrent: true
  });

  const [compareForm, setCompareForm] = useState({
    regulationId: '',
    olderSourceVersionId: '',
    newerSourceVersionId: ''
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/policy-library/clauses', {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Regulatory Clause Intelligence gagal dimuat.');
      setData(payload);
      setSelectedRegulationId(current => current || payload.regulations?.[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regulatory Clause Intelligence gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(async (body: Record<string, unknown>, key: string) => {
    setWorking(key);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/policy-library/clauses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Tindakan tidak dapat diproses.');
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tindakan tidak dapat diproses.');
      return null;
    } finally {
      setWorking('');
    }
  }, []);

  const regulationById = useMemo(
    () => new Map((data?.regulations || []).map(item => [String(item.id), item])),
    [data?.regulations]
  );
  const sourceById = useMemo(
    () => new Map((data?.sources || []).map(item => [String(item.id), item])),
    [data?.sources]
  );
  const clauseById = useMemo(
    () => new Map((data?.snapshots || []).map(item => [item.id, item])),
    [data?.snapshots]
  );

  const targetMaps = useMemo(() => {
    return {
      INTERNAL_POLICY: new Map<string, Lookup>(),
      PROCESS: new Map<string, Lookup>(),
      CONTROL: new Map<string, Lookup>()
    };
  }, []);

  const selectedVersions = useMemo(
    () => (data?.sourceVersions || []).filter(item => !selectedRegulationId || item.regulationId === selectedRegulationId),
    [data?.sourceVersions, selectedRegulationId]
  );

  const drafts = useMemo(
    () => (data?.drafts || []).filter(item => !selectedRegulationId || item.regulationId === selectedRegulationId),
    [data?.drafts, selectedRegulationId]
  );

  const versionsForCompare = useMemo(
    () => (data?.sourceVersions || []).filter(item => item.regulationId === compareForm.regulationId),
    [data?.sourceVersions, compareForm.regulationId]
  );

  const targetLabel = useCallback((type: string, id: string) => {
    const target = targetMaps[type as keyof typeof targetMaps]?.get(id);
    if (target) return String(target.title || target.name || id);
    return id;
  }, [targetMaps]);

  async function submitSource(event: FormEvent) {
    event.preventDefault();
    const result = await post({
      action: 'LINK_SOURCE_VERSION',
      ...sourceForm
    }, 'link-source');
    if (!result) return;

    setShowLinkForm(false);
    setNotice('Versi dokumen regulasi berhasil dihubungkan.');
    setSelectedRegulationId(sourceForm.regulationId);
    setSourceForm({
      regulationId: '',
      sourceDocumentId: '',
      versionLabel: '',
      sourceDate: '',
      effectiveDate: '',
      isCurrent: true
    });
    await load();
  }

  async function buildSnapshot(version: SourceVersion) {
    const result = await post({
      action: 'BUILD_SNAPSHOT',
      sourceVersionId: version.id
    }, 'snapshot-' + version.id);
    if (!result) return;
    setNotice(result.clauseCount + ' pasal/klausul berhasil dibuat snapshot.');
    await load();
  }

  async function analyze(version: SourceVersion) {
    setWorking('analyze-' + version.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/policy-library/clauses/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          regulationId: version.regulationId,
          sourceVersionId: version.id
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Analisis AI tidak dapat diselesaikan.');
      setNotice(
        'AI membuat ' + Number(payload.draftCount || 0) + ' draft obligation dan ' +
        Number(payload.impactCount || 0) + ' usulan dampak. Semuanya masih menunggu validasi.'
      );
      setMode('drafts');
      setSelectedRegulationId(version.regulationId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analisis AI tidak dapat diselesaikan.');
    } finally {
      setWorking('');
    }
  }

  async function compareVersions(event: FormEvent) {
    event.preventDefault();
    const result = await post({
      action: 'COMPARE_VERSIONS',
      olderSourceVersionId: compareForm.olderSourceVersionId,
      newerSourceVersionId: compareForm.newerSourceVersionId
    }, 'compare');
    if (!result) return;
    setCompareResult(result.result);
    setNotice('Perbandingan versi selesai.');
  }

  async function reviewImpact(impact: Impact, decision: 'APPROVE' | 'REJECT') {
    const result = await post({
      action: 'REVIEW_IMPACT',
      impactId: impact.id,
      decision
    }, 'impact-' + impact.id);
    if (!result) return;
    setNotice(decision === 'APPROVE' ? 'Usulan dampak disetujui.' : 'Usulan dampak ditolak.');
    await load();
  }

  async function reviewDraft(draft: Draft, decision: 'ACCEPT' | 'REJECT') {
    const result = await post({
      action: 'REVIEW_DRAFT',
      draftId: draft.id,
      decision
    }, 'draft-' + draft.id);
    if (!result) return;
    setNotice(
      decision === 'ACCEPT'
        ? 'Draft diterima dan dibuat sebagai obligation Draft di Compliance Universe.'
        : 'Draft obligation ditolak.'
    );
    await load();
  }

  const metrics = data?.metrics || {
    linkedVersions: 0,
    currentVersions: 0,
    clauses: 0,
    pendingDrafts: 0,
    acceptedDrafts: 0,
    pendingImpacts: 0
  };

  return (
    <div>
      <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-4 md:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-black text-slate-950">
              <ScanText className="h-5 w-5 text-indigo-600" />
              Regulatory Clause Intelligence
            </h2>
            <p className="mt-1 max-w-5xl text-sm leading-6 text-slate-500">
              Snapshot pasal berbasis teks sumber, perbandingan versi berbasis hash, dan AI-assisted
              draft obligation. Tidak ada draft yang menjadi kewajiban aktif tanpa validasi Kepatuhan.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
            >
              <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />
              Refresh
            </button>
            {data?.canManage && (
              <button
                type="button"
                onClick={() => setShowLinkForm(true)}
                disabled={!data.regulations.length || !data.sources.length}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Hubungkan Dokumen Regulasi
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          {[
            ['Versi Terhubung', metrics.linkedVersions],
            ['Versi Aktif', metrics.currentVersions],
            ['Pasal Snapshot', metrics.clauses],
            ['Draft Pending', metrics.pendingDrafts],
            ['Draft Diterima', metrics.acceptedDrafts],
            ['Impact Pending', metrics.pendingImpacts]
          ].map(item => (
            <div key={String(item[0])} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">{String(item[0])}</div>
              <div className="mt-1 text-xl font-black text-slate-950">{String(item[1])}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ['sources', 'Sumber & Versi', FileSearch],
            ['compare', 'Perbandingan Pasal', GitCompareArrows],
            ['drafts', 'Draft Obligation AI', Sparkles]
          ].map(([key, label, Icon]) => {
            const ItemIcon = Icon as typeof FileSearch;
            return (
              <button
                key={String(key)}
                type="button"
                onClick={() => setMode(key as typeof mode)}
                className={'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-black ' +
                  (mode === key ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600')}
              >
                <ItemIcon className="h-4 w-4" />
                {String(label)}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="m-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800 md:m-5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div className="m-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 md:m-5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}

      <div className="p-4 md:p-5">
        <label className="mb-4 block text-sm font-bold text-slate-700">
          Fokus Regulasi
          <select
            value={selectedRegulationId}
            onChange={event => setSelectedRegulationId(event.target.value)}
            className="mt-1.5 w-full max-w-4xl rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
          >
            <option value="">Semua regulasi</option>
            {(data?.regulations || []).map(item => (
              <option key={String(item.id)} value={String(item.id)}>
                {String(item.regulator)} · {String(item.regulationCode)} — {String(item.title)}
              </option>
            ))}
          </select>
        </label>

        {mode === 'sources' && (
          <div className="grid gap-4">
            {selectedVersions.map(version => {
              const regulation = regulationById.get(version.regulationId);
              const source = sourceById.get(version.sourceDocumentId);
              const clauseCount = (data?.snapshots || []).filter(item => item.sourceVersionId === version.id).length;
              return (
                <article key={version.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-black text-indigo-700">
                          {String(regulation?.regulator || '')}
                        </span>
                        {version.isCurrent === 1 && (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700">VERSI AKTIF</span>
                        )}
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">
                          {clauseCount} pasal
                        </span>
                      </div>
                      <div className="mt-2 font-black text-slate-950">
                        {String(regulation?.regulationCode || '')} — {version.versionLabel}
                      </div>
                      <div className="mt-1 text-sm text-slate-700">{String(regulation?.title || '')}</div>
                      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                        <div className="font-bold text-slate-800">{String(source?.title || 'Dokumen sumber')}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Text indexed: {Number(source?.textLength || 0).toLocaleString('id-ID')} karakter
                          {' · '}Tanggal sumber: {formatDate(version.sourceDate)}
                          {' · '}Efektif: {formatDate(version.effectiveDate)}
                        </div>
                      </div>
                    </div>
                    {data?.canManage && (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void buildSnapshot(version)}
                          disabled={working === 'snapshot-' + version.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {working === 'snapshot-' + version.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
                          Snapshot Pasal
                        </button>
                        <button
                          type="button"
                          onClick={() => void analyze(version)}
                          disabled={working === 'analyze-' + version.id}
                          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white hover:bg-violet-500 disabled:opacity-50"
                        >
                          {working === 'analyze-' + version.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                          Ekstrak Draft Obligation
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
            {!selectedVersions.length && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
                <FileSearch className="mx-auto h-8 w-8 text-slate-300" />
                <div className="mt-3 font-bold text-slate-700">Belum ada dokumen regulasi yang dihubungkan.</div>
                <div className="mt-1 text-sm text-slate-500">
                  Gunakan file yang sudah memiliki text extraction/OCR dari Source Library.
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'compare' && (
          <div className="space-y-4">
            <form onSubmit={compareVersions} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="text-sm font-bold text-slate-700">
                  Regulasi
                  <select
                    required
                    value={compareForm.regulationId}
                    onChange={event => setCompareForm({
                      regulationId: event.target.value,
                      olderSourceVersionId: '',
                      newerSourceVersionId: ''
                    })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="">Pilih regulasi</option>
                    {(data?.regulations || []).map(item => (
                      <option key={String(item.id)} value={String(item.id)}>
                        {String(item.regulator)} · {String(item.regulationCode)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-bold text-slate-700">
                  Versi Lama
                  <select required value={compareForm.olderSourceVersionId} onChange={event => setCompareForm({ ...compareForm, olderSourceVersionId: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                    <option value="">Pilih versi</option>
                    {versionsForCompare.map(item => <option key={item.id} value={item.id}>{item.versionLabel} · {formatDate(item.sourceDate)}</option>)}
                  </select>
                </label>
                <label className="text-sm font-bold text-slate-700">
                  Versi Baru
                  <select required value={compareForm.newerSourceVersionId} onChange={event => setCompareForm({ ...compareForm, newerSourceVersionId: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                    <option value="">Pilih versi</option>
                    {versionsForCompare.map(item => <option key={item.id} value={item.id}>{item.versionLabel} · {formatDate(item.sourceDate)}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-4 flex justify-end">
                <button disabled={working === 'compare'} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
                  {working === 'compare' ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitCompareArrows className="h-4 w-4" />}
                  Bandingkan Pasal
                </button>
              </div>
            </form>

            {compareResult && (
              <>
                <div className="grid gap-2 sm:grid-cols-4">
                  {[
                    ['Pasal Baru', compareResult.metrics.added, 'ADDED'],
                    ['Berubah', compareResult.metrics.changed, 'CHANGED'],
                    ['Dihapus', compareResult.metrics.removed, 'REMOVED'],
                    ['Tetap', compareResult.metrics.unchanged, 'UNCHANGED']
                  ].map(item => (
                    <div key={String(item[0])} className="rounded-xl border border-slate-200 bg-white p-3">
                      <span className={'rounded-full px-2 py-1 text-[10px] font-black ' + changeClass(String(item[2]))}>{String(item[0])}</span>
                      <div className="mt-2 text-2xl font-black text-slate-950">{String(item[1])}</div>
                    </div>
                  ))}
                </div>
                <div className="grid gap-3">
                  {compareResult.changes.filter(item => item.changeType !== 'UNCHANGED').map(item => (
                    <article key={item.clauseKey} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={'rounded-full px-2.5 py-1 text-xs font-black ' + changeClass(item.changeType)}>{item.changeType}</span>
                        <span className="font-black text-slate-900">{item.after?.clauseTitle || item.before?.clauseTitle || item.clauseKey}</span>
                      </div>
                      <div className="mt-3 grid gap-3 xl:grid-cols-2">
                        <div className="rounded-xl bg-rose-50/50 p-3">
                          <div className="text-[10px] font-black uppercase tracking-[0.08em] text-rose-700">Versi Lama</div>
                          <div className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-slate-700">
                            {item.before?.clauseText || 'Tidak tersedia pada versi lama.'}
                          </div>
                        </div>
                        <div className="rounded-xl bg-emerald-50/50 p-3">
                          <div className="text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">Versi Baru</div>
                          <div className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-slate-700">
                            {item.after?.clauseText || 'Tidak tersedia pada versi baru.'}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {mode === 'drafts' && (
          <div className="grid gap-4">
            {drafts.map(draft => {
              const clause = clauseById.get(draft.clauseSnapshotId);
              const impacts = (data?.impacts || []).filter(item => item.clauseDraftId === draft.id);
              return (
                <article key={draft.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-black text-white">{draft.draftCode}</span>
                        <span className={'rounded-full px-2.5 py-1 text-[11px] font-black ' + confidenceClass(draft.confidence)}>{draft.confidence}</span>
                        <span className={'rounded-full px-2.5 py-1 text-[11px] font-black ' +
                          (draft.status === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                            draft.status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800')}>
                          {draft.status}
                        </span>
                        <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-black text-indigo-700">{draft.requirementType}</span>
                      </div>
                      <div className="mt-2 text-xs font-black uppercase tracking-[0.08em] text-indigo-600">
                        {clause?.clauseTitle || 'Pasal sumber'}
                      </div>
                      <div className="mt-2 text-sm font-bold leading-6 text-slate-950">{draft.requirementText}</div>
                      {draft.rationale && <div className="mt-2 text-xs leading-5 text-slate-500">{draft.rationale}</div>}
                      {clause && (
                        <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <summary className="cursor-pointer text-xs font-black text-slate-700">Lihat teks pasal sumber</summary>
                          <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-slate-600">
                            {clause.clauseText}
                          </div>
                        </details>
                      )}
                    </div>
                    {data?.canManage && draft.status === 'PENDING' && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => void reviewDraft(draft, 'REJECT')}
                          disabled={working === 'draft-' + draft.id}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 disabled:opacity-50"
                        >
                          <X className="h-4 w-4" /> Tolak
                        </button>
                        <button
                          type="button"
                          onClick={() => void reviewDraft(draft, 'ACCEPT')}
                          disabled={working === 'draft-' + draft.id}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                        >
                          {working === 'draft-' + draft.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          Terima Draft
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <div className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-slate-500">Usulan Dampak Internal</div>
                    <div className="grid gap-2">
                      {impacts.map(impact => (
                        <div key={impact.id} className="rounded-xl border border-slate-200 p-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-black text-indigo-700">{impact.targetType}</span>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{impact.impactType}</span>
                                <span className={'rounded-full px-2 py-0.5 text-[10px] font-bold ' + confidenceClass(impact.confidence)}>{impact.confidence}</span>
                                <span className={'rounded-full px-2 py-0.5 text-[10px] font-bold ' +
                                  (impact.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                                    impact.status === 'REJECTED' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800')}>
                                  {impact.status}
                                </span>
                              </div>
                              <div className="mt-1 text-sm font-bold text-slate-800">{targetLabel(impact.targetType, impact.targetId)}</div>
                              {impact.rationale && <div className="mt-1 text-xs leading-5 text-slate-500">{impact.rationale}</div>}
                            </div>
                            {data?.canManage && impact.status === 'PENDING' && (
                              <div className="flex shrink-0 gap-2">
                                <button type="button" onClick={() => void reviewImpact(impact, 'REJECT')} className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"><XCircle className="h-4 w-4" /></button>
                                <button type="button" onClick={() => void reviewImpact(impact, 'APPROVE')} className="rounded-lg border border-emerald-200 p-2 text-emerald-600 hover:bg-emerald-50"><CheckCircle2 className="h-4 w-4" /></button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {!impacts.length && (
                        <div className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                          AI tidak mengusulkan target internal untuk draft ini.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                    <span>AI: {draft.aiProvider || '—'} / {draft.aiModel || '—'}</span>
                    <span>Applicability: {draft.applicability}</span>
                    <span>Criticality: {draft.criticality}</span>
                    <span>Frequency: {draft.frequency || '—'}</span>
                  </div>
                </article>
              );
            })}
            {!drafts.length && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-slate-300" />
                <div className="mt-3 font-bold text-slate-700">Belum ada draft obligation AI.</div>
                <div className="mt-1 text-sm text-slate-500">
                  Hubungkan dokumen regulasi lalu jalankan Ekstrak Draft Obligation.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showLinkForm && data?.canManage && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 backdrop-blur-sm md:items-center md:p-6">
          <form onSubmit={submitSource} className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl md:max-w-3xl md:rounded-3xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-lg font-black text-slate-950">Hubungkan Dokumen Regulasi</div>
                <div className="mt-1 text-sm text-slate-500">
                  Pilih dokumen Source Library yang sudah memiliki text extraction/OCR.
                </div>
              </div>
              <button type="button" onClick={() => setShowLinkForm(false)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Regulasi *
                <select required value={sourceForm.regulationId} onChange={event => setSourceForm({ ...sourceForm, regulationId: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  <option value="">Pilih regulasi</option>
                  {data.regulations.map(item => <option key={String(item.id)} value={String(item.id)}>{String(item.regulator)} · {String(item.regulationCode)} — {String(item.title)}</option>)}
                </select>
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                File Source Library *
                <select required value={sourceForm.sourceDocumentId} onChange={event => setSourceForm({ ...sourceForm, sourceDocumentId: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  <option value="">Pilih file berteks/OCR</option>
                  {data.sources.map(item => <option key={String(item.id)} value={String(item.id)}>{String(item.title)} · {Number(item.textLength || 0).toLocaleString('id-ID')} karakter</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                Label Versi *
                <input required value={sourceForm.versionLabel} onChange={event => setSourceForm({ ...sourceForm, versionLabel: event.target.value })} placeholder="Contoh: POJK 2026 / Revisi 1" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Tanggal Sumber
                <input type="date" value={sourceForm.sourceDate} onChange={event => setSourceForm({ ...sourceForm, sourceDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Tanggal Efektif
                <input type="date" value={sourceForm.effectiveDate} onChange={event => setSourceForm({ ...sourceForm, effectiveDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-bold text-slate-700">
                <input type="checkbox" checked={sourceForm.isCurrent} onChange={event => setSourceForm({ ...sourceForm, isCurrent: event.target.checked })} />
                Jadikan versi aktif
              </label>
              <div className="md:col-span-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-800">
                File tanpa teks terindeks tidak dapat dipilih untuk Clause Intelligence. PDF scan harus melalui OCR terlebih dahulu agar pasal dapat dibandingkan dan dianalisis.
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setShowLinkForm(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Batal</button>
              <button disabled={working === 'link-source'} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
                {working === 'link-source' && <Loader2 className="h-4 w-4 animate-spin" />}
                Hubungkan Versi
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
