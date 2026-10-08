'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileArchive,
  FileCheck2,
  FileSpreadsheet,
  GitBranch,
  Layers3,
  Link2,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Scale,
  X
} from 'lucide-react';

type Policy = {
  id: string;
  documentCode: string;
  documentType: string;
  title: string;
  status: string;
  version: string;
};

type ClusterRow = {
  sourceType: string;
  sourceId: string;
  sourceTitle: string;
  cluster: string;
  documentType: string | null;
  confidence: string;
  reason: string | null;
  policyDocumentId: string | null;
  updatedAt: string;
};

type Relationship = {
  id: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: string;
  rationale: string | null;
  effectiveDate: string | null;
  status: string;
};

type Regulation = {
  id: string;
  regulator: string;
  regulationCode: string;
  title: string;
  status: string;
};

type StructureResponse = {
  canManage: boolean;
  clusters: {
    counts: Record<string, number>;
    rows: ClusterRow[];
  };
  relationships: Relationship[];
  regulations: Regulation[];
};

const CLUSTER_LABELS: Record<string, string> = {
  INTERNAL_RULE: 'Ketentuan Internal',
  WORKPAPER_EVIDENCE: 'Kertas Kerja / Evidence',
  PROCESS_RCM: 'BPM / RCM / Risk Artifact',
  REGULATORY_EXTERNAL: 'Regulasi Eksternal',
  FORM_TEMPLATE: 'Form / Template',
  OTHER: 'Dokumen Lainnya'
};

const RELATION_LABELS: Record<string, string> = {
  PARENT_OF: 'Induk dari',
  IMPLEMENTS: 'Mengimplementasikan',
  REFERENCES: 'Merujuk',
  DERIVED_FROM: 'Turunan dari',
  SUPERSEDES: 'Menggantikan',
  AMENDS: 'Mengubah',
  REVOKES: 'Mencabut',
  RELATED_TO: 'Terkait dengan',
  IMPACTED_BY: 'Terdampak oleh'
};

const HIERARCHY_LEVELS = [
  {
    level: 1,
    label: 'Level 1 · Kebijakan / Ketentuan Direksi',
    types: ['Kebijakan', 'Peraturan Direksi', 'Keputusan', 'Surat Edaran']
  },
  {
    level: 2,
    label: 'Level 2 · Pedoman / BPP / Piagam / Standar',
    types: ['Buku Pedoman Perusahaan', 'Pedoman', 'Piagam', 'Standar']
  },
  {
    level: 3,
    label: 'Level 3 · SOP / Prosedur',
    types: ['SOP', 'Prosedur']
  },
  {
    level: 4,
    label: 'Level 4 · Juknis / Instruksi Kerja',
    types: ['Petunjuk Teknis', 'Instruksi Kerja']
  },
  {
    level: 5,
    label: 'Level 5 · Ketentuan Internal Lain',
    types: ['Ketentuan Internal']
  }
];

function clusterIcon(cluster: string) {
  if (cluster === 'INTERNAL_RULE') return FileCheck2;
  if (cluster === 'WORKPAPER_EVIDENCE') return FileSpreadsheet;
  if (cluster === 'PROCESS_RCM') return GitBranch;
  if (cluster === 'REGULATORY_EXTERNAL') return Scale;
  if (cluster === 'FORM_TEMPLATE') return FileArchive;
  return Layers3;
}

export function PolicyHierarchyWorkspace({
  policies,
  canManage,
  onChanged
}: {
  policies: Policy[];
  canManage: boolean;
  onChanged?: () => Promise<void> | void;
}) {
  const [data, setData] = useState<StructureResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [clusterFilter, setClusterFilter] = useState('ALL');
  const [showRelationForm, setShowRelationForm] = useState(false);
  const [form, setForm] = useState({
    sourceType: 'INTERNAL',
    sourceId: '',
    targetType: 'INTERNAL',
    targetId: '',
    relationType: 'PARENT_OF',
    rationale: '',
    effectiveDate: ''
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/policy-library?mode=structure', {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Hierarki ketentuan gagal dimuat.');
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hierarki ketentuan gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const policyById = useMemo(
    () => new Map(policies.map(item => [item.id, item])),
    [policies]
  );

  const regulationById = useMemo(
    () => new Map((data?.regulations || []).map(item => [item.id, item])),
    [data?.regulations]
  );

  const entityOptions = useCallback((type: string) => {
    if (type === 'EXTERNAL') {
      return (data?.regulations || []).map(item => ({
        id: item.id,
        label: item.regulator + ' · ' + item.regulationCode + ' — ' + item.title
      }));
    }
    return policies.map(item => ({
      id: item.id,
      label: item.documentCode + ' · ' + item.documentType + ' — ' + item.title
    }));
  }, [data?.regulations, policies]);

  const entityLabel = useCallback((type: string, id: string) => {
    if (type === 'EXTERNAL') {
      const item = regulationById.get(id);
      return item
        ? item.regulator + ' · ' + item.regulationCode + ' — ' + item.title
        : id;
    }
    const item = policyById.get(id);
    return item
      ? item.documentCode + ' · ' + item.title
      : id;
  }, [policyById, regulationById]);

  const filteredClusters = useMemo(() => {
    const rows = data?.clusters.rows || [];
    if (clusterFilter === 'ALL') return rows;
    return rows.filter(item => item.cluster === clusterFilter);
  }, [clusterFilter, data?.clusters.rows]);

  async function submitRelation(event: FormEvent) {
    event.preventDefault();
    if (!form.sourceId || !form.targetId) return;
    setWorking(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/policy-library/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'CREATE_RELATION',
          ...form
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Relasi ketentuan gagal disimpan.');
      setNotice('Relasi ketentuan berhasil disimpan.');
      setShowRelationForm(false);
      setForm(current => ({
        ...current,
        sourceId: '',
        targetId: '',
        rationale: '',
        effectiveDate: ''
      }));
      await load();
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Relasi ketentuan gagal disimpan.');
    } finally {
      setWorking(false);
    }
  }

  const internalRelations = (data?.relationships || []).filter(
    item => item.sourceType === 'INTERNAL' && item.targetType === 'INTERNAL'
  );
  const externalRelations = (data?.relationships || []).filter(
    item => item.sourceType === 'EXTERNAL' || item.targetType === 'EXTERNAL'
  );

  return (
    <div className="space-y-5 p-4 md:p-5">
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-black text-slate-950">
              <Network className="h-5 w-5 text-indigo-600" />
              Hierarki Ketentuan & Cluster Dokumen
            </h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
              Memisahkan ketentuan formal dari kertas kerja/evidence, BPM/RCM, form/template,
              dan regulasi eksternal. Hierarki menunjukkan tingkat ketentuan dan hubungan
              antar-dokumen yang sudah divalidasi.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
            >
              <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />
              Refresh
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => setShowRelationForm(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white"
              >
                <Plus className="h-4 w-4" />
                Tambah Relasi
              </button>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-slate-950">Cluster Dokumen</h3>
            <p className="mt-1 text-xs text-slate-500">
              Kertas Kerja Walkthrough dan evidence pengujian tidak lagi dihitung sebagai SOP.
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          {Object.entries(CLUSTER_LABELS).map(([key, label]) => {
            const Icon = clusterIcon(key);
            const count = Number(data?.clusters.counts?.[key] || 0);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setClusterFilter(clusterFilter === key ? 'ALL' : key)}
                className={
                  'rounded-xl border p-3 text-left transition ' +
                  (clusterFilter === key
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50')
                }
              >
                <Icon className="h-5 w-5 text-slate-500" />
                <div className="mt-2 text-xl font-black text-slate-950">{count}</div>
                <div className="mt-1 text-[11px] font-black uppercase tracking-[0.05em] text-slate-500">
                  {label}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-3 max-h-[420px] overflow-y-auto rounded-2xl border border-slate-200 bg-white">
          {(filteredClusters || []).slice(0, 200).map(item => (
            <div key={item.sourceType + ':' + item.sourceId} className="border-b border-slate-100 p-3 last:border-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="break-words text-sm font-bold text-slate-900">{item.sourceTitle}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{item.reason || '—'}</div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">
                    {CLUSTER_LABELS[item.cluster] || item.cluster}
                  </span>
                  {item.documentType && (
                    <span className="rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-black text-indigo-700">
                      {item.documentType}
                    </span>
                  )}
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
                    {item.confidence}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {!filteredClusters.length && (
            <div className="p-8 text-center text-sm text-slate-500">
              Belum ada hasil klasifikasi untuk cluster ini. Jalankan sinkronisasi registry.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Layers3 className="h-5 w-5 text-indigo-600" />
          <h3 className="font-black text-slate-950">Hierarki Ketentuan Internal</h3>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Regulasi eksternal berada di atas hierarki internal; hubungan formal ditentukan melalui relasi,
          bukan hanya urutan jenis dokumen.
        </p>

        <div className="mt-4 grid gap-3">
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
            <div className="text-xs font-black uppercase tracking-[0.06em] text-violet-700">
              Level 0 · Regulasi Eksternal
            </div>
            <div className="mt-1 text-sm font-bold text-violet-950">
              {data?.regulations.length || 0} regulasi pada Regulatory Watch
            </div>
          </div>

          {HIERARCHY_LEVELS.map(group => {
            const items = policies.filter(item => group.types.includes(item.documentType));
            return (
              <div key={group.level} className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-black uppercase tracking-[0.06em] text-slate-500">{group.label}</div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {items.slice(0, 100).map(item => (
                    <div key={item.id} className="rounded-lg bg-slate-50 p-2.5">
                      <div className="text-[10px] font-black uppercase tracking-[0.05em] text-indigo-600">
                        {item.documentCode} · {item.documentType}
                      </div>
                      <div className="mt-1 text-sm font-bold leading-5 text-slate-900">{item.title}</div>
                    </div>
                  ))}
                  {!items.length && (
                    <div className="text-sm text-slate-400">Belum ada ketentuan pada level ini.</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 font-black text-slate-950">
            <GitBranch className="h-5 w-5 text-indigo-600" />
            Hubungan Antar Ketentuan
          </h3>
          <div className="mt-3 grid gap-2">
            {internalRelations.slice(0, 200).map(item => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-bold text-slate-800">{entityLabel(item.sourceType, item.sourceId)}</div>
                <div className="my-2 flex items-center gap-2 text-[11px] font-black text-indigo-700">
                  <ArrowRight className="h-3.5 w-3.5" />
                  {RELATION_LABELS[item.relationType] || item.relationType}
                </div>
                <div className="text-xs font-bold text-slate-800">{entityLabel(item.targetType, item.targetId)}</div>
                {item.rationale && <div className="mt-2 text-xs leading-5 text-slate-500">{item.rationale}</div>}
              </div>
            ))}
            {!internalRelations.length && (
              <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">
                Belum ada relasi internal↔internal.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 font-black text-slate-950">
            <Link2 className="h-5 w-5 text-violet-600" />
            Hubungan Regulasi Eksternal ↔ Ketentuan Internal
          </h3>
          <div className="mt-3 grid gap-2">
            {externalRelations.slice(0, 200).map(item => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-bold text-slate-800">{entityLabel(item.sourceType, item.sourceId)}</div>
                <div className="my-2 flex items-center gap-2 text-[11px] font-black text-violet-700">
                  <ArrowRight className="h-3.5 w-3.5" />
                  {RELATION_LABELS[item.relationType] || item.relationType}
                </div>
                <div className="text-xs font-bold text-slate-800">{entityLabel(item.targetType, item.targetId)}</div>
                {item.rationale && <div className="mt-2 text-xs leading-5 text-slate-500">{item.rationale}</div>}
              </div>
            ))}
            {!externalRelations.length && (
              <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">
                Belum ada relasi eksternal↔internal.
              </div>
            )}
          </div>
        </div>
      </section>

      {showRelationForm && canManage && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/55 backdrop-blur-sm md:items-center md:p-6">
          <form onSubmit={submitRelation} className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl md:max-w-3xl md:rounded-3xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-lg font-black text-slate-950">Tambah Hubungan Ketentuan</div>
                <div className="mt-1 text-sm text-slate-500">
                  Pilih sumber, tujuan, dan makna hubungan. Relasi disimpan sebagai audit trail.
                </div>
              </div>
              <button type="button" onClick={() => setShowRelationForm(false)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="text-sm font-bold text-slate-700">
                Jenis Sumber
                <select
                  value={form.sourceType}
                  onChange={event => setForm({ ...form, sourceType: event.target.value, sourceId: '' })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                >
                  <option value="INTERNAL">Ketentuan Internal</option>
                  <option value="EXTERNAL">Regulasi Eksternal</option>
                </select>
              </label>

              <label className="text-sm font-bold text-slate-700">
                Sumber *
                <select
                  required
                  value={form.sourceId}
                  onChange={event => setForm({ ...form, sourceId: event.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                >
                  <option value="">Pilih sumber</option>
                  {entityOptions(form.sourceType).map(item => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-bold text-slate-700">
                Jenis Tujuan
                <select
                  value={form.targetType}
                  onChange={event => setForm({ ...form, targetType: event.target.value, targetId: '' })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                >
                  <option value="INTERNAL">Ketentuan Internal</option>
                  <option value="EXTERNAL">Regulasi Eksternal</option>
                </select>
              </label>

              <label className="text-sm font-bold text-slate-700">
                Tujuan *
                <select
                  required
                  value={form.targetId}
                  onChange={event => setForm({ ...form, targetId: event.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                >
                  <option value="">Pilih tujuan</option>
                  {entityOptions(form.targetType).map(item => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-bold text-slate-700">
                Jenis Hubungan
                <select
                  value={form.relationType}
                  onChange={event => setForm({ ...form, relationType: event.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                >
                  {Object.entries(RELATION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-bold text-slate-700">
                Tanggal Efektif
                <input
                  type="date"
                  value={form.effectiveDate}
                  onChange={event => setForm({ ...form, effectiveDate: event.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                />
              </label>

              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Rasional / Dasar Hubungan
                <textarea
                  rows={3}
                  value={form.rationale}
                  onChange={event => setForm({ ...form, rationale: event.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  placeholder="Contoh: SOP ini merupakan turunan operasional dari Kebijakan Manajemen Risiko."
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setShowRelationForm(false)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700"
              >
                Batal
              </button>
              <button
                disabled={working}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
              >
                {working && <Loader2 className="h-4 w-4 animate-spin" />}
                Simpan Relasi
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
