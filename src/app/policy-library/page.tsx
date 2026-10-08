'use client';

import { PolicyDocumentAI } from '@/components/policy/PolicyDocumentAI';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PolicyIntelligenceWorkspace } from '@/components/policy/PolicyIntelligenceWorkspace';
import { RegulatoryObligationWorkspace } from '@/components/policy/RegulatoryObligationWorkspace';
import { RegulatoryClauseWorkspace } from '@/components/policy/RegulatoryClauseWorkspace';
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileCheck2,
  FileText,
  Link2,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Search,
  ScanText,
  ShieldAlert,
  UploadCloud,
  X
} from 'lucide-react';

type Metrics = {
  totalPolicies: number;
  activePolicies: number;
  dueForReview: number;
  overdueReview: number;
  totalRegulations: number;
  openRegulatoryActions: number;
  highImpactOpen: number;
};

type Policy = {
  id: string;
  sourceDocumentId: string | null;
  documentCode: string;
  documentType: string;
  title: string;
  ownerUnit: string | null;
  ownerName: string | null;
  status: string;
  version: string;
  issueDate: string | null;
  effectiveDate: string | null;
  lastReviewDate: string | null;
  nextReviewDate: string | null;
  reviewCycleMonths: number;
  expiryDate: string | null;
  scope: string | null;
  summary: string | null;
  updatedAt: string;
};

type Regulation = {
  id: string;
  regulator: string;
  regulationCode: string;
  title: string;
  category: string | null;
  issueDate: string | null;
  effectiveDate: string | null;
  sourceUrl: string | null;
  status: string;
  summary: string | null;
  updatedAt: string;
};

type Impact = {
  id: string;
  policyDocumentId: string;
  regulationId: string;
  impactLevel: string;
  changeRequired: number;
  impactSummary: string | null;
  actionOwner: string | null;
  dueDate: string | null;
  actionStatus: string;
  completedAt: string | null;
  updatedAt: string;
};

type Review = {
  id: string;
  policyDocumentId: string;
  reviewDate: string;
  reviewerName: string;
  outcome: string;
  notes: string | null;
  resultingVersion: string | null;
  nextReviewDate: string | null;
};

type UploadedSource = {
  id: string;
  title: string;
  provider: string;
  sourceKind: string;
  mimeType: string | null;
  sourceCreatedAt: string | null;
  sourceModifiedAt: string | null;
  module: string | null;
  rawSizeBytes: number;
  importedAt: string;
  updatedAt: string;
};

type Registry = {
  metrics: {
    discoveredCandidates: number;
    registeredCandidates: number;
    missingCandidates: number;
    unmappedPolicySources: number;
    totalLinks: number;
    policiesWithLinks: number;
  };
  byPolicy: Record<string, Record<string, number>>;
  byTargetType: Record<string, number>;
  sourcesByPolicy: Record<string, Array<{ sourceType: string; sourceId: string }>>;
  syncRequired: boolean;
  syncVersion: string;
  candidates: Array<{
    sourceType: string;
    sourceId: string;
    title: string;
    documentType: string;
    confidence: string;
    classificationReason: string;
    registered: boolean;
  }>;
  lastSync: {
    id?: string;
    status?: string;
    discoveredCandidates?: number;
    insertedPolicies?: number;
    mappedSources?: number;
    generatedLinks?: number;
    syncVersion?: string;
    actorName?: string;
    startedAt?: string;
    completedAt?: string;
    errorCode?: string | null;
  } | null;
};

type Dashboard = {
  institutionId: string;
  institutionName: string;
  canManage: boolean;
  metrics: Metrics;
  policies: Policy[];
  regulations: Regulation[];
  impacts: Impact[];
  reviews: Review[];
  uploadedSources: UploadedSource[];
  registry: Registry;
};

type TabKey = 'library' | 'relations' | 'regulations' | 'impacts' | 'intelligence' | 'clauses' | 'obligations' | 'uploads';

const DOCUMENT_TYPES = [
  'Kebijakan',
  'SOP',
  'Pedoman',
  'Buku Pedoman Perusahaan',
  'Piagam',
  'Petunjuk Teknis',
  'Peraturan Direksi',
  'Surat Edaran',
  'Keputusan',
  'Prosedur',
  'Instruksi Kerja',
  'Standar',
  'Ketentuan Internal'
];

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

function formatBytes(value: number) {
  if (!value) return '0 KB';
  if (value < 1024 * 1024) return Math.max(1, Math.round(value / 1024)) + ' KB';
  return (value / (1024 * 1024)).toFixed(1) + ' MB';
}

function daysFromToday(value: string | null) {
  if (!value) return null;
  const target = new Date(value + 'T00:00:00');
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function reviewTone(nextReviewDate: string | null) {
  const days = daysFromToday(nextReviewDate);
  if (days === null) return { label: 'Belum dijadwalkan', cls: 'bg-slate-100 text-slate-600' };
  if (days < 0) return { label: 'Lewat ' + Math.abs(days) + ' hari', cls: 'bg-rose-100 text-rose-700' };
  if (days <= 30) return { label: days + ' hari lagi', cls: 'bg-amber-100 text-amber-800' };
  if (days <= 90) return { label: days + ' hari lagi', cls: 'bg-sky-100 text-sky-700' };
  return { label: 'Terjadwal', cls: 'bg-emerald-100 text-emerald-700' };
}

function statusPill(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes('berlaku') || normalized.includes('selesai')) {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (normalized.includes('dicabut') || normalized.includes('kadaluarsa') || normalized.includes('tidak')) {
    return 'bg-rose-100 text-rose-700';
  }
  if (normalized.includes('review') || normalized.includes('proses') || normalized.includes('akan') || normalized.includes('validasi')) {
    return 'bg-amber-100 text-amber-800';
  }
  return 'bg-slate-100 text-slate-700';
}

export default function PolicyLibraryPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [tab, setTab] = useState<TabKey>('library');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [registrySyncing, setRegistrySyncing] = useState(false);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const uploadedSourcesRef = useRef<UploadedSource[]>([]);
  const registryAutoSyncAttempted = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [showRegulationForm, setShowRegulationForm] = useState(false);
  const [showImpactForm, setShowImpactForm] = useState(false);
  const [selectedSource, setSelectedSource] = useState<UploadedSource | null>(null);
  const [reviewTarget, setReviewTarget] = useState<Policy | null>(null);

  const [policyForm, setPolicyForm] = useState({
    documentCode: '',
    documentType: 'SOP',
    title: '',
    ownerUnit: '',
    ownerName: '',
    status: 'Berlaku',
    version: '1.0',
    issueDate: '',
    effectiveDate: '',
    nextReviewDate: '',
    reviewCycleMonths: '12',
    scope: '',
    summary: ''
  });

  const [regulationForm, setRegulationForm] = useState({
    regulator: 'OJK',
    regulationCode: '',
    title: '',
    category: '',
    issueDate: '',
    effectiveDate: '',
    sourceUrl: '',
    status: 'Berlaku',
    summary: ''
  });

  const [impactForm, setImpactForm] = useState({
    policyDocumentId: '',
    regulationId: '',
    impactLevel: 'Sedang',
    changeRequired: true,
    impactSummary: '',
    actionOwner: '',
    dueDate: '',
    actionStatus: 'Belum Ditindaklanjuti'
  });

  const [reviewForm, setReviewForm] = useState({
    reviewDate: new Date().toISOString().slice(0, 10),
    reviewerName: '',
    outcome: 'Tetap Berlaku',
    notes: '',
    resultingVersion: '',
    nextReviewDate: ''
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/policy-library', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Data Policy & Regulatory Library gagal dimuat.');
      setData({
        ...payload,
        uploadedSources: uploadedSourcesRef.current
      });
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === 'AbortError'
          ? 'Policy Library terlalu lama merespons. Silakan coba Refresh.'
          : err instanceof Error
            ? err.message
            : 'Data gagal dimuat.'
      );
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  const loadSources = useCallback(async () => {
    if (sourcesLoading) return;
    setSourcesLoading(true);
    try {
      const response = await fetch('/api/policy-library?mode=sources', {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Daftar file sumber gagal dimuat.');
      const next = Array.isArray(payload.uploadedSources) ? payload.uploadedSources : [];
      uploadedSourcesRef.current = next;
      setData(current => current ? { ...current, uploadedSources: next } : current);
      setSourcesLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Daftar file sumber gagal dimuat.');
    } finally {
      setSourcesLoading(false);
    }
  }, [sourcesLoading]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab !== 'uploads' || sourcesLoaded || sourcesLoading) return;
    void loadSources();
  }, [tab, sourcesLoaded, sourcesLoading, loadSources]);

  const postAction = useCallback(async (body: Record<string, unknown>) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/policy-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Perubahan tidak dapat disimpan.');
      setNotice('Perubahan berhasil disimpan.');
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Perubahan tidak dapat disimpan.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [load]);

  const syncRegistry = useCallback(async (automatic = false) => {
    setRegistrySyncing(true);
    if (!automatic) {
      setError('');
      setNotice('');
    }
    try {
      const response = await fetch('/api/policy-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'SYNC_REGISTRY' })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Sinkronisasi registry ketentuan gagal.');
      const result = payload.result || {};
      setNotice(
        'Sinkronisasi database selesai: ' +
        Number(result.insertedPolicies || 0) + ' ketentuan baru, ' +
        Number(result.mappedSources || 0) + ' sumber terhubung, dan ' +
        Number(result.generatedLinks || 0) + ' relasi aktif.'
      );
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sinkronisasi registry ketentuan gagal.');
      return false;
    } finally {
      setRegistrySyncing(false);
    }
  }, [load]);

  useEffect(() => {
    const missing =
      (data?.registry?.metrics.missingCandidates || 0) +
      (data?.registry?.metrics.unmappedPolicySources || 0);
    const requiresSync = Boolean(data?.registry?.syncRequired) || missing > 0;
    if (!data?.canManage || !requiresSync || registryAutoSyncAttempted.current) return;

    registryAutoSyncAttempted.current = true;
    const timer = window.setTimeout(() => {
      void syncRegistry(true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [
    data?.canManage,
    data?.registry?.syncRequired,
    data?.registry?.metrics.missingCandidates,
    data?.registry?.metrics.unmappedPolicySources,
    syncRegistry
  ]);

  const registeredSourceIds = useMemo(
    () => new Set((data?.policies || []).map(item => item.sourceDocumentId).filter(Boolean)),
    [data?.policies]
  );

  const filteredPolicies = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return data?.policies || [];
    return (data?.policies || []).filter(item =>
      [item.documentCode, item.documentType, item.title, item.ownerUnit, item.ownerName, item.status]
        .some(value => String(value || '').toLowerCase().includes(needle))
    );
  }, [data?.policies, query]);

  const filteredRegulations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return data?.regulations || [];
    return (data?.regulations || []).filter(item =>
      [item.regulator, item.regulationCode, item.title, item.category, item.status]
        .some(value => String(value || '').toLowerCase().includes(needle))
    );
  }, [data?.regulations, query]);

  const filteredSources = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return data?.uploadedSources || [];
    return (data?.uploadedSources || []).filter(item =>
      [item.title, item.provider, item.module, item.mimeType]
        .some(value => String(value || '').toLowerCase().includes(needle))
    );
  }, [data?.uploadedSources, query]);

  const policyById = useMemo(
    () => new Map((data?.policies || []).map(item => [item.id, item])),
    [data?.policies]
  );

  const regulationById = useMemo(
    () => new Map((data?.regulations || []).map(item => [item.id, item])),
    [data?.regulations]
  );

  const relationModules = useCallback((policyId: string) => {
    const counts = data?.registry?.byPolicy?.[policyId] || {};
    return [
      {
        key: 'SOURCE',
        label: 'Sumber',
        href: '/evidence',
        count: Number(counts.SOURCE_DOCUMENT || 0) + Number(counts.EVIDENCE_DOCUMENT || 0)
      },
      {
        key: 'REGULATORY',
        label: 'Regulasi/Obligation',
        href: '/policy-library',
        count: Number(counts.EXTERNAL_REGULATION || 0) + Number(counts.REGULATORY_OBLIGATION || 0)
      },
      {
        key: 'INTERNAL_POLICY',
        label: 'Ketentuan Lain',
        href: '/policy-library',
        count: Number(counts.INTERNAL_POLICY || 0)
      },
      { key: 'BPM', label: 'BPM', href: '/processes', count: Number(counts.PROCESS || 0) },
      { key: 'RISK', label: 'Risk', href: '/risks', count: Number(counts.RISK || 0) },
      {
        key: 'CONTROL_RCM',
        label: 'Control/RCM',
        href: '/rcm',
        count: Number(counts.CONTROL || 0) + Number(counts.RCM || 0)
      },
      { key: 'RCSA', label: 'RCSA/CSA', href: '/rcsa', count: Number(counts.RCSA_SCOPE || 0) },
      {
        key: 'ICOFR',
        label: 'ICOFR/ToD/ToE',
        href: '/icofr',
        count:
          Number(counts.ICOFR_PROCESS || 0) +
          Number(counts.ICOFR_CONTROL || 0) +
          Number(counts.ICOFR_SCOPE || 0) +
          Number(counts.TOD_TEST || 0) +
          Number(counts.TOE_TEST || 0)
      },
      {
        key: 'EVIDENCE',
        label: 'Evidence',
        href: '/evidence',
        count: Number(counts.EVIDENCE || 0)
      },
      {
        key: 'REMEDIATION',
        label: 'Remediation/MAP',
        href: '/remediation',
        count: Number(counts.REMEDIATION_ISSUE || 0) + Number(counts.REMEDIATION_MAP || 0) +
          Number(counts.MAP || 0) + Number(counts.DEFICIENCY || 0)
      },
      {
        key: 'CCM',
        label: 'CCM',
        href: '/ccm',
        count: Number(counts.CCM_RULE || 0) + Number(counts.CCM_EXCEPTION || 0)
      }
    ];
  }, [data?.registry?.byPolicy]);

  const relationCount = useCallback((policyId: string) => {
    return relationModules(policyId).reduce((sum, item) => sum + item.count, 0);
  }, [relationModules]);

  const startSourceRegistration = (source: UploadedSource) => {
    setSelectedSource(source);
    setPolicyForm({
      documentCode: '',
      documentType: 'SOP',
      title: source.title,
      ownerUnit: '',
      ownerName: '',
      status: 'Berlaku',
      version: '1.0',
      issueDate: source.sourceCreatedAt?.slice(0, 10) || '',
      effectiveDate: '',
      nextReviewDate: '',
      reviewCycleMonths: '12',
      scope: '',
      summary: ''
    });
  };

  const submitPolicy = async (event: FormEvent) => {
    event.preventDefault();
    const action = selectedSource ? 'REGISTER_FROM_SOURCE' : 'CREATE_POLICY';
    const ok = await postAction({
      action,
      sourceDocumentId: selectedSource?.id || undefined,
      ...policyForm,
      reviewCycleMonths: Number(policyForm.reviewCycleMonths || 12)
    });
    if (ok) {
      setShowPolicyForm(false);
      setSelectedSource(null);
      setPolicyForm(current => ({
        ...current,
        documentCode: '',
        title: '',
        ownerUnit: '',
        ownerName: '',
        issueDate: '',
        effectiveDate: '',
        nextReviewDate: '',
        scope: '',
        summary: ''
      }));
    }
  };

  const submitRegulation = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await postAction({ action: 'CREATE_REGULATION', ...regulationForm });
    if (ok) {
      setShowRegulationForm(false);
      setRegulationForm(current => ({
        ...current,
        regulationCode: '',
        title: '',
        category: '',
        issueDate: '',
        effectiveDate: '',
        sourceUrl: '',
        summary: ''
      }));
    }
  };

  const submitImpact = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await postAction({ action: 'LINK_IMPACT', ...impactForm });
    if (ok) {
      setShowImpactForm(false);
      setImpactForm(current => ({
        ...current,
        policyDocumentId: '',
        regulationId: '',
        impactSummary: '',
        actionOwner: '',
        dueDate: ''
      }));
    }
  };

  const submitReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!reviewTarget) return;
    const ok = await postAction({
      action: 'RECORD_REVIEW',
      policyDocumentId: reviewTarget.id,
      ...reviewForm
    });
    if (ok) {
      setReviewTarget(null);
      setReviewForm({
        reviewDate: new Date().toISOString().slice(0, 10),
        reviewerName: '',
        outcome: 'Tetap Berlaku',
        notes: '',
        resultingVersion: '',
        nextReviewDate: ''
      });
    }
  };

  const recentRegulations = useMemo(
    () => (data?.regulations || []).filter(item => {
      if (!item.issueDate) return false;
      const days = daysFromToday(item.issueDate);
      return days !== null && days <= 0 && days >= -30;
    }).length,
    [data?.regulations]
  );

  if (loading && !data) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          Memuat Policy & Regulatory Library...
        </div>
      </div>
    );
  }

  const metrics = data?.metrics || {
    totalPolicies: 0,
    activePolicies: 0,
    dueForReview: 0,
    overdueReview: 0,
    totalRegulations: 0,
    openRegulatoryActions: 0,
    highImpactOpen: 0
  };
  const registryMetrics = data?.registry?.metrics || {
    discoveredCandidates: 0,
    registeredCandidates: 0,
    missingCandidates: 0,
    unmappedPolicySources: 0,
    totalLinks: 0,
    policiesWithLinks: 0
  };

  return (
    <div className="space-y-6 pb-12">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-6 py-7 text-white md:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-indigo-200">
                <BookOpenCheck className="h-4 w-4" />
                Policy · SOP · Regulatory Change Management
              </div>
              <h1 className="text-2xl font-black tracking-tight md:text-3xl">
                Policy & Regulatory Library
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Pusat kendali seluruh ketentuan internal Bank, jadwal review, riwayat perubahan,
                regulasi eksternal, analisis dampak, dan tindak lanjut perubahan kebijakan/SOP.
              </p>
              {data?.institutionName && (
                <div className="mt-4 inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100">
                  Institusi aktif: {data.institutionName}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-60"
              >
                <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />
                Refresh
              </button>
              {data?.canManage && (
                <button
                  type="button"
                  onClick={() => void syncRegistry(false)}
                  disabled={registrySyncing}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2.5 text-sm font-black text-cyan-50 hover:bg-cyan-300/15 disabled:opacity-60"
                >
                  {registrySyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                  Sinkronkan Database
                  {registryMetrics.missingCandidates + registryMetrics.unmappedPolicySources > 0
                    ? ' (' + (registryMetrics.missingCandidates + registryMetrics.unmappedPolicySources) + ')'
                    : ''}
                </button>
              )}
              {data?.canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSource(null);
                    setShowPolicyForm(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-900 hover:bg-slate-100"
                >
                  <Plus className="h-4 w-4" />
                  Tambah Ketentuan
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5 md:p-6">
          {[
            {
              label: 'Ketentuan Terdaftar',
              value: metrics.totalPolicies,
              sub: metrics.activePolicies + ' berstatus berlaku',
              icon: FileCheck2
            },
            {
              label: 'Review ≤ 90 Hari',
              value: metrics.dueForReview,
              sub: metrics.overdueReview + ' sudah melewati jadwal',
              icon: CalendarClock
            },
            {
              label: 'Regulasi Dipantau',
              value: metrics.totalRegulations,
              sub: recentRegulations + ' terbit 30 hari terakhir',
              icon: ShieldAlert
            },
            {
              label: 'Tindak Lanjut Regulasi',
              value: metrics.openRegulatoryActions,
              sub: metrics.highImpactOpen + ' berdampak tinggi/kritis',
              icon: ClipboardList
            },
            {
              label: 'Relasi TotalARC',
              value: registryMetrics.totalLinks,
              sub: registryMetrics.policiesWithLinks + ' ketentuan sudah terkoneksi',
              icon: Network
            }
          ].map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{card.label}</div>
                    <div className="mt-2 text-3xl font-black tracking-tight text-slate-950">{card.value}</div>
                    <div className="mt-1 text-xs text-slate-500">{card.sub}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {(registryMetrics.missingCandidates > 0 ||
        registryMetrics.unmappedPolicySources > 0 ||
        registryMetrics.discoveredCandidates > 0) && (
        <section className={
          'flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center md:justify-between ' +
          (data?.registry?.syncRequired ||
            registryMetrics.missingCandidates + registryMetrics.unmappedPolicySources > 0
            ? 'border-sky-200 bg-sky-50'
            : 'border-emerald-200 bg-emerald-50')
        }>
          <div className="flex items-start gap-3">
            <Database className={
              'mt-0.5 h-5 w-5 shrink-0 ' +
              (data?.registry?.syncRequired ||
                registryMetrics.missingCandidates + registryMetrics.unmappedPolicySources > 0
                ? 'text-sky-700'
                : 'text-emerald-700')
            } />
            <div>
              <div className={
                'font-black ' +
                (data?.registry?.syncRequired ||
                  registryMetrics.missingCandidates + registryMetrics.unmappedPolicySources > 0
                  ? 'text-sky-950'
                  : 'text-emerald-950')
              }>
                Registry database TotalARC
              </div>
              <p className={
                'mt-1 text-sm leading-5 ' +
                (data?.registry?.syncRequired ||
                  registryMetrics.missingCandidates + registryMetrics.unmappedPolicySources > 0
                  ? 'text-sky-800'
                  : 'text-emerald-800')
              }>
                {registryMetrics.registeredCandidates} dari {registryMetrics.discoveredCandidates} file SOP/Policy/ketentuan
                yang terdeteksi sudah terdaftar. {data?.registry?.syncRequired
                  ? ' Registry akan dibangun ulang satu kali dengan algoritma relasi terbaru agar semua koneksi lintas modul ikut diperbarui.'
                  : registryMetrics.missingCandidates + registryMetrics.unmappedPolicySources > 0
                    ? (registryMetrics.missingCandidates + registryMetrics.unmappedPolicySources) +
                      ' sumber/ketentuan existing akan disinkronkan tanpa menduplikasi file sumber.'
                    : ' Registry saat ini sudah mencakup seluruh kandidat yang terdeteksi di database.'}
              </p>
            </div>
          </div>
          {data?.canManage &&
            (Boolean(data?.registry?.syncRequired) ||
              registryMetrics.missingCandidates + registryMetrics.unmappedPolicySources > 0) && (
            <button
              type="button"
              onClick={() => void syncRegistry(false)}
              disabled={registrySyncing}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-900 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60"
            >
              {registrySyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sinkronkan Sekarang
            </button>
          )}
        </section>
      )}

      {(metrics.overdueReview > 0 || metrics.highImpactOpen > 0) && (
        <section className="grid gap-3 lg:grid-cols-2">
          {metrics.overdueReview > 0 && (
            <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
              <div>
                <div className="font-black text-rose-900">Review ketentuan terlambat</div>
                <p className="mt-1 text-sm leading-5 text-rose-800">
                  {metrics.overdueReview} ketentuan melewati tanggal review berikutnya. Prioritaskan
                  validasi keberlakuan, perubahan versi, atau pencabutan.
                </p>
              </div>
            </div>
          )}
          {metrics.highImpactOpen > 0 && (
            <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <div className="font-black text-amber-900">Perubahan regulasi perlu tindakan</div>
                <p className="mt-1 text-sm leading-5 text-amber-800">
                  {metrics.highImpactOpen} mapping regulasi masih terbuka dengan dampak tinggi/kritis
                  terhadap ketentuan internal.
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between md:p-5">
          <div className="flex flex-wrap gap-2">
            {[
              ['library', 'Library Ketentuan', FileText],
              ['relations', 'Relasi TotalARC', Network],
              ['regulations', 'Regulatory Watch', ShieldAlert],
              ['impacts', 'Impact & Action', Link2],
              ['intelligence', 'Regulatory Intelligence', ShieldAlert],
              ['clauses', 'Clause Intelligence', ScanText],
              ['obligations', 'Compliance Universe', ClipboardCheck],
              ['uploads', 'File Terunggah', UploadCloud]
            ].map(([key, label, Icon]) => {
              const ItemIcon = Icon as typeof FileText;
              return (
                <button
                  key={String(key)}
                  type="button"
                  onClick={() => setTab(key as TabKey)}
                  className={
                    'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition ' +
                    (tab === key
                      ? 'bg-slate-950 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                  }
                >
                  <ItemIcon className="h-4 w-4" />
                  {String(label)}
                </button>
              );
            })}
          </div>
          <div className="relative w-full lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Cari kode, judul, owner, regulator..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none ring-0 placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>
        </div>

        {tab === 'library' && (
          <div>
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
              <div>
                <h2 className="font-black text-slate-950">Daftar Ketentuan Internal Bank</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Pantau tanggal terbit, versi, pemilik, masa berlaku, dan jadwal review berikutnya.
                </p>
              </div>
              {data?.canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSource(null);
                    setShowPolicyForm(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"
                >
                  <Plus className="h-4 w-4" />
                  Ketentuan Baru
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-left">
                <thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.06em] text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Ketentuan</th>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3">Terbit / Efektif</th>
                    <th className="px-4 py-3">Review</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Relasi</th>
                    <th className="px-4 py-3">Sumber</th>
                    <th className="px-5 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPolicies.map(item => {
                    const tone = reviewTone(item.nextReviewDate);
                    return (
                      <tr key={item.id} className="align-top hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-xl border border-slate-200 bg-white p-2 text-slate-700">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                                {item.documentCode} · {item.documentType} · v{item.version}
                              </div>
                              <div className="mt-1 max-w-md font-bold leading-5 text-slate-950">{item.title}</div>
                              {item.summary && (
                                <div className="mt-1 max-w-md text-xs leading-5 text-slate-500 line-clamp-2">
                                  {item.summary}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          <div className="font-semibold">{item.ownerUnit || '—'}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.ownerName || 'Owner belum diisi'}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          <div>{formatDate(item.issueDate)}</div>
                          <div className="mt-1 text-xs text-slate-500">Efektif {formatDate(item.effectiveDate)}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm font-semibold text-slate-700">{formatDate(item.nextReviewDate)}</div>
                          <span className={'mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ' + tone.cls}>
                            {tone.label}
                          </span>
                          <div className="mt-2 text-xs text-slate-500">
                            Terakhir: {formatDate(item.lastReviewDate)}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={'inline-flex rounded-full px-2.5 py-1 text-xs font-bold ' + statusPill(item.status)}>
                            {item.status}
                          </span>
                        </td>
                                                <td className="px-4 py-4">
                          <span className={'inline-flex rounded-full px-2.5 py-1 text-xs font-black ' +
                            (relationCount(item.id) > 0
                              ? 'bg-indigo-100 text-indigo-700'
                              : 'bg-slate-100 text-slate-500')
                          }>
                            {relationCount(item.id)} relasi
                          </span>
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-500">
                          {(() => {
                            const sources = data?.registry?.sourcesByPolicy?.[item.id] || [];
                            if (sources.some(source => source.sourceType === 'SOURCE_DOCUMENT')) {
                              return 'Source Library terhubung';
                            }
                            if (sources.some(source => source.sourceType === 'EVIDENCE_DOCUMENT')) {
                              return 'Evidence Repository terhubung';
                            }
                            return item.sourceDocumentId ? 'File terunggah terhubung' : 'Metadata/manual';
                          })()}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {data?.canManage ? (
                            <button
                              type="button"
                              onClick={() => {
                                setReviewTarget(item);
                                setReviewForm(current => ({
                                  ...current,
                                  resultingVersion: item.version,
                                  nextReviewDate: item.nextReviewDate || ''
                                }));
                              }}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                            >
                              Catat Review
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">Read-only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredPolicies.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-14 text-center">
                        <FileText className="mx-auto h-8 w-8 text-slate-300" />
                        <div className="mt-3 font-bold text-slate-700">Belum ada ketentuan yang cocok.</div>
                        <div className="mt-1 text-sm text-slate-500">
                          Daftarkan file yang sudah di-upload atau buat metadata ketentuan baru.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'relations' && (
          <div>
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
              <div>
                <h2 className="font-black text-slate-950">Keterkaitan Ketentuan dengan TotalARC</h2>
                <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
                  Relasi dibangun dari koneksi yang sudah ada di database: sumber dokumen, hubungan antar-ketentuan,
                  regulatory obligation, BPM, risk, control/RCM, RCSA/CSA, ICOFR/ToD/ToE, evidence,
                  remediation/MAP, serta CCM. Relasi modul tidak dibuat hanya berdasarkan kemiripan judul.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                {registryMetrics.totalLinks} relasi · {registryMetrics.policiesWithLinks} ketentuan terkoneksi
              </div>
            </div>

            <div className="grid gap-3 p-4 md:p-5">
              {filteredPolicies.map(item => {
                const modules = relationModules(item.id);
                const total = modules.reduce((sum, module) => sum + module.count, 0);
                return (
                  <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="text-xs font-black uppercase tracking-[0.08em] text-indigo-600">
                          {item.documentCode} · {item.documentType}
                        </div>
                        <div className="mt-1 font-black text-slate-950">{item.title}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {modules.map(module => (
                            module.count > 0 && module.href ? (
                              <a
                                key={module.key}
                                href={module.href}
                                className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-200"
                              >
                                {module.label}: {module.count}
                              </a>
                            ) : (
                              <span
                                key={module.key}
                                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-400"
                              >
                                {module.label}: {module.count}
                              </span>
                            )
                          ))}
                        </div>
                      </div>
                      <div className={
                        'shrink-0 rounded-xl px-3 py-2 text-center ' +
                        (total > 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800')
                      }>
                        <div className="text-xl font-black">{total}</div>
                        <div className="text-[10px] font-black uppercase tracking-[0.08em]">Relasi aktif</div>
                      </div>
                    </div>
                  </article>
                );
              })}
              {filteredPolicies.length === 0 && (
                <div className="py-12 text-center">
                  <Network className="mx-auto h-8 w-8 text-slate-300" />
                  <div className="mt-3 font-bold text-slate-700">Belum ada ketentuan untuk ditampilkan.</div>
                  <div className="mt-1 text-sm text-slate-500">
                    Jalankan sinkronisasi database agar SOP, Policy, dan ketentuan existing diregistrasikan.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'regulations' && (
          <div>
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
              <div>
                <h2 className="font-black text-slate-950">Regulatory Watch</h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-500">
                  Register regulasi baru dari OJK, BI, LPS, PPATK, Pemerintah/JDIH, atau regulator lain,
                  kemudian hubungkan dampaknya ke kebijakan/SOP internal.
                </p>
              </div>
              {data?.canManage && (
                <button
                  type="button"
                  onClick={() => setShowRegulationForm(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-bold text-white hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" />
                  Tambah Regulasi
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-left">
                <thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.06em] text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Regulator / Regulasi</th>
                    <th className="px-4 py-3">Terbit</th>
                    <th className="px-4 py-3">Berlaku</th>
                    <th className="px-4 py-3">Kategori</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-5 py-3">Sumber</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRegulations.map(item => (
                    <tr key={item.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-5 py-4">
                        <div className="text-xs font-black uppercase tracking-[0.08em] text-indigo-600">
                          {item.regulator} · {item.regulationCode}
                        </div>
                        <div className="mt-1 max-w-xl font-bold leading-5 text-slate-950">{item.title}</div>
                        {item.summary && (
                          <div className="mt-1 max-w-xl text-xs leading-5 text-slate-500 line-clamp-2">{item.summary}</div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">{formatDate(item.issueDate)}</td>
                      <td className="px-4 py-4 text-sm text-slate-700">{formatDate(item.effectiveDate)}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{item.category || '—'}</td>
                      <td className="px-4 py-4">
                        <span className={'inline-flex rounded-full px-2.5 py-1 text-xs font-bold ' + statusPill(item.status)}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {item.sourceUrl ? (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:underline"
                          >
                            Portal resmi
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">URL belum diisi</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredRegulations.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-14 text-center">
                        <ShieldAlert className="mx-auto h-8 w-8 text-slate-300" />
                        <div className="mt-3 font-bold text-slate-700">Belum ada regulasi pada watchlist.</div>
                        <div className="mt-1 text-sm text-slate-500">
                          Tambahkan regulasi eksternal agar dampaknya dapat ditelusuri ke ketentuan internal.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'impacts' && (
          <div>
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
              <div>
                <h2 className="font-black text-slate-950">Regulatory Impact & Action Tracker</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Satu regulasi dapat memengaruhi beberapa ketentuan internal. Setiap dampak memiliki owner,
                  due date, kebutuhan perubahan, dan status tindak lanjut.
                </p>
              </div>
              {data?.canManage && (
                <button
                  type="button"
                  onClick={() => setShowImpactForm(true)}
                  disabled={!data.policies.length || !data.regulations.length}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Link2 className="h-4 w-4" />
                  Mapping Dampak
                </button>
              )}
            </div>

            <div className="grid gap-3 p-4 md:p-5">
              {(data?.impacts || []).map(item => {
                const policy = policyById.get(item.policyDocumentId);
                const regulation = regulationById.get(item.regulationId);
                return (
                  <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-black text-indigo-700">
                            {regulation?.regulator || 'Regulator'} · {regulation?.regulationCode || '—'}
                          </span>
                          <span className="text-slate-300">→</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
                            {policy?.documentCode || 'Ketentuan'}
                          </span>
                          <span className={'rounded-full px-2.5 py-1 text-xs font-black ' +
                            (item.impactLevel === 'Kritis' || item.impactLevel === 'Tinggi'
                              ? 'bg-rose-100 text-rose-700'
                              : item.impactLevel === 'Sedang'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-700')
                          }>
                            Dampak {item.impactLevel}
                          </span>
                        </div>
                        <div className="mt-3 font-black text-slate-950">{policy?.title || 'Ketentuan tidak ditemukan'}</div>
                        <div className="mt-1 text-sm text-slate-600">
                          {regulation?.title || 'Regulasi tidak ditemukan'}
                        </div>
                        {item.impactSummary && (
                          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">{item.impactSummary}</p>
                        )}
                      </div>
                      <div className="grid min-w-[260px] gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                        <div className="flex justify-between gap-4">
                          <span className="text-slate-500">Perubahan internal</span>
                          <span className="font-black text-slate-800">{item.changeRequired ? 'Diperlukan' : 'Tidak'}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-slate-500">Owner aksi</span>
                          <span className="font-bold text-slate-800">{item.actionOwner || '—'}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-slate-500">Due date</span>
                          <span className="font-bold text-slate-800">{formatDate(item.dueDate)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-slate-500">Status</span>
                          <span className={'rounded-full px-2 py-0.5 font-black ' + statusPill(item.actionStatus)}>
                            {item.actionStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
              {(data?.impacts || []).length === 0 && (
                <div className="py-12 text-center">
                  <Link2 className="mx-auto h-8 w-8 text-slate-300" />
                  <div className="mt-3 font-bold text-slate-700">Belum ada mapping dampak regulasi.</div>
                  <div className="mt-1 text-sm text-slate-500">
                    Daftarkan regulasi dan ketentuan terlebih dahulu, kemudian hubungkan dampaknya.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'intelligence' && data && (
          <PolicyIntelligenceWorkspace
            policies={data.policies}
            regulations={data.regulations}
            canManage={Boolean(data.canManage)}
            onLibraryChanged={load}
          />
        )}

        {tab === 'clauses' && (
          <RegulatoryClauseWorkspace />
        )}

        {tab === 'obligations' && (
          <RegulatoryObligationWorkspace />
        )}

        {tab === 'uploads' && (
          <div>
            <div className="border-b border-slate-100 px-4 py-4 md:px-5">
              <h2 className="font-black text-slate-950">File yang Sudah Di-upload / Di-import</h2>
              <p className="mt-1 max-w-4xl text-sm text-slate-500">
                Library ini membaca file dari Source Library TotalARC. File tidak disalin ulang. Tim Policy/SOP
                cukup melengkapi metadata governance agar file tersebut menjadi ketentuan resmi yang dapat dimonitor.
              </p>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2 md:p-5 xl:grid-cols-3">
              {filteredSources.map(source => {
                const registered = registeredSourceIds.has(source.id);
                return (
                  <article key={source.id} className="flex flex-col rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 font-bold leading-5 text-slate-950">{source.title}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold text-slate-500">
                          <span className="rounded-full bg-slate-100 px-2 py-1">{source.provider}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-1">{source.module || 'SOURCE'}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-1">{formatBytes(source.rawSizeBytes)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
                      <div>
                        <div className="font-bold text-slate-700">Tanggal sumber</div>
                        <div className="mt-1">{formatDate(source.sourceCreatedAt)}</div>
                      </div>
                      <div>
                        <div className="font-bold text-slate-700">Terakhir berubah</div>
                        <div className="mt-1">{formatDate(source.sourceModifiedAt || source.updatedAt)}</div>
                      </div>
                    </div>
                    <div className="mt-auto pt-4">
                      {registered ? (
                        <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" />
                          Sudah terdaftar sebagai ketentuan
                        </div>
                      ) : data?.canManage ? (
                        <button
                          type="button"
                          onClick={() => startSourceRegistration(source)}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-black text-slate-800 hover:bg-slate-50"
                        >
                          <BookOpenCheck className="h-4 w-4" />
                          Jadikan Ketentuan
                        </button>
                      ) : (
                        <div className="text-xs font-semibold text-slate-400">Belum diklasifikasikan</div>
                      )}
                    </div>
                  </article>
                );
              })}
              {filteredSources.length === 0 && (
                <div className="col-span-full py-12 text-center">
                  <UploadCloud className="mx-auto h-8 w-8 text-slate-300" />
                  <div className="mt-3 font-bold text-slate-700">Belum ada file sumber.</div>
                  <div className="mt-1 text-sm text-slate-500">
                    File yang di-upload melalui Source/Data Hub akan muncul di sini.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {(showPolicyForm || selectedSource) && data?.canManage && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm md:items-center md:p-6">
          <form onSubmit={submitPolicy} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl md:max-w-4xl md:rounded-3xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 md:px-6">
              <div>
                <div className="text-lg font-black text-slate-950">
                  {selectedSource ? 'Daftarkan File sebagai Ketentuan' : 'Tambah Ketentuan Internal'}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {selectedSource ? selectedSource.title : 'Lengkapi metadata governance dokumen.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPolicyForm(false);
                  setSelectedSource(null);
                }}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <PolicyDocumentAI key={data.institutionId} kind="policy" onApply={draft => setPolicyForm(current => ({ ...current, ...draft }))} />
            <div className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
              <label className="text-sm font-bold text-slate-700">
                Kode / Nomor Ketentuan *
                <input required value={policyForm.documentCode} onChange={event => setPolicyForm({ ...policyForm, documentCode: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" placeholder="Contoh: DIR/KEP/012/2026" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Jenis Ketentuan *
                <select value={policyForm.documentType} onChange={event => setPolicyForm({ ...policyForm, documentType: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400">
                  {DOCUMENT_TYPES.map(type => <option key={type}>{type}</option>)}
                </select>
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Judul Ketentuan *
                <input required value={policyForm.title} onChange={event => setPolicyForm({ ...policyForm, title: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Unit Pemilik
                <input value={policyForm.ownerUnit} onChange={event => setPolicyForm({ ...policyForm, ownerUnit: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" placeholder="Divisi Kepatuhan / unit terkait" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Policy Owner / PIC
                <input value={policyForm.ownerName} onChange={event => setPolicyForm({ ...policyForm, ownerName: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Versi
                <input value={policyForm.version} onChange={event => setPolicyForm({ ...policyForm, version: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Status
                <select value={policyForm.status} onChange={event => setPolicyForm({ ...policyForm, status: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400">
                  <option>Berlaku</option>
                  <option>Dalam Review</option>
                  <option>Akan Berlaku</option>
                  <option>Dicabut</option>
                  <option>Digantikan</option>
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                Tanggal Terbit
                <input type="date" value={policyForm.issueDate} onChange={event => setPolicyForm({ ...policyForm, issueDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Tanggal Efektif
                <input type="date" value={policyForm.effectiveDate} onChange={event => setPolicyForm({ ...policyForm, effectiveDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Review Berikutnya
                <input type="date" value={policyForm.nextReviewDate} onChange={event => setPolicyForm({ ...policyForm, nextReviewDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Siklus Review (bulan)
                <input type="number" min="1" max="60" value={policyForm.reviewCycleMonths} onChange={event => setPolicyForm({ ...policyForm, reviewCycleMonths: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Ruang Lingkup
                <textarea value={policyForm.scope} onChange={event => setPolicyForm({ ...policyForm, scope: event.target.value })} rows={2} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Ringkasan / Catatan
                <textarea value={policyForm.summary} onChange={event => setPolicyForm({ ...policyForm, summary: event.target.value })} rows={3} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
            </div>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4 md:px-6">
              <button type="button" onClick={() => { setShowPolicyForm(false); setSelectedSource(null); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Batal</button>
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Simpan Ketentuan
              </button>
            </div>
          </form>
        </div>
      )}

      {showRegulationForm && data?.canManage && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm md:items-center md:p-6">
          <form onSubmit={submitRegulation} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl md:max-w-3xl md:rounded-3xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 md:px-6">
              <div>
                <div className="text-lg font-black text-slate-950">Tambah Regulasi Eksternal</div>
                <div className="mt-1 text-sm text-slate-500">Gunakan nomor dan URL sumber resmi regulator/pemerintah.</div>
              </div>
              <button type="button" onClick={() => setShowRegulationForm(false)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <PolicyDocumentAI key={data.institutionId} kind="regulation" onApply={draft => setRegulationForm(current => ({ ...current, ...draft }))} />
            <div className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
              <label className="text-sm font-bold text-slate-700">
                Regulator *
                <input required value={regulationForm.regulator} onChange={event => setRegulationForm({ ...regulationForm, regulator: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" placeholder="OJK / BI / LPS / PPATK / Pemerintah" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Nomor / Kode Regulasi *
                <input required value={regulationForm.regulationCode} onChange={event => setRegulationForm({ ...regulationForm, regulationCode: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Judul Regulasi *
                <input required value={regulationForm.title} onChange={event => setRegulationForm({ ...regulationForm, title: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Kategori
                <input value={regulationForm.category} onChange={event => setRegulationForm({ ...regulationForm, category: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" placeholder="Kepatuhan, Governance, AML, TI..." />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Status
                <select value={regulationForm.status} onChange={event => setRegulationForm({ ...regulationForm, status: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400">
                  <option>Berlaku</option>
                  <option>Akan Berlaku</option>
                  <option>Dicabut</option>
                  <option>Digantikan</option>
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                Tanggal Terbit
                <input type="date" value={regulationForm.issueDate} onChange={event => setRegulationForm({ ...regulationForm, issueDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Tanggal Berlaku
                <input type="date" value={regulationForm.effectiveDate} onChange={event => setRegulationForm({ ...regulationForm, effectiveDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                URL Sumber Resmi
                <input type="url" value={regulationForm.sourceUrl} onChange={event => setRegulationForm({ ...regulationForm, sourceUrl: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" placeholder="https://..." />
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Ringkasan Perubahan / Kewajiban
                <textarea value={regulationForm.summary} onChange={event => setRegulationForm({ ...regulationForm, summary: event.target.value })} rows={4} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 md:px-6">
              <button type="button" onClick={() => setShowRegulationForm(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Batal</button>
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Simpan Regulasi
              </button>
            </div>
          </form>
        </div>
      )}

      {showImpactForm && data?.canManage && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm md:items-center md:p-6">
          <form onSubmit={submitImpact} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl md:max-w-3xl md:rounded-3xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 md:px-6">
              <div>
                <div className="text-lg font-black text-slate-950">Mapping Dampak Regulasi</div>
                <div className="mt-1 text-sm text-slate-500">Hubungkan regulasi baru ke ketentuan internal yang harus direview/diubah.</div>
              </div>
              <button type="button" onClick={() => setShowImpactForm(false)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Regulasi *
                <select required value={impactForm.regulationId} onChange={event => setImpactForm({ ...impactForm, regulationId: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400">
                  <option value="">Pilih regulasi</option>
                  {(data?.regulations || []).map(item => <option key={item.id} value={item.id}>{item.regulator} · {item.regulationCode} — {item.title}</option>)}
                </select>
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Ketentuan Internal *
                <select required value={impactForm.policyDocumentId} onChange={event => setImpactForm({ ...impactForm, policyDocumentId: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400">
                  <option value="">Pilih ketentuan</option>
                  {(data?.policies || []).map(item => <option key={item.id} value={item.id}>{item.documentCode} — {item.title}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                Tingkat Dampak
                <select value={impactForm.impactLevel} onChange={event => setImpactForm({ ...impactForm, impactLevel: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400">
                  <option>Rendah</option>
                  <option>Sedang</option>
                  <option>Tinggi</option>
                  <option>Kritis</option>
                </select>
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-bold text-slate-700">
                <input type="checkbox" checked={impactForm.changeRequired} onChange={event => setImpactForm({ ...impactForm, changeRequired: event.target.checked })} className="h-4 w-4" />
                Perubahan ketentuan internal diperlukan
              </label>
              <label className="text-sm font-bold text-slate-700">
                Action Owner
                <input value={impactForm.actionOwner} onChange={event => setImpactForm({ ...impactForm, actionOwner: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Due Date
                <input type="date" value={impactForm.dueDate} onChange={event => setImpactForm({ ...impactForm, dueDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Status Aksi
                <select value={impactForm.actionStatus} onChange={event => setImpactForm({ ...impactForm, actionStatus: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400">
                  <option>Belum Ditindaklanjuti</option>
                  <option>Dalam Analisis</option>
                  <option>Dalam Revisi</option>
                  <option>Menunggu Persetujuan</option>
                  <option>Selesai</option>
                </select>
              </label>
              <div />
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Analisis Dampak
                <textarea value={impactForm.impactSummary} onChange={event => setImpactForm({ ...impactForm, impactSummary: event.target.value })} rows={4} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" placeholder="Jelaskan pasal/kewajiban baru dan bagian ketentuan internal yang perlu diubah." />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 md:px-6">
              <button type="button" onClick={() => setShowImpactForm(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Batal</button>
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Simpan Mapping
              </button>
            </div>
          </form>
        </div>
      )}

      {reviewTarget && data?.canManage && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm md:items-center md:p-6">
          <form onSubmit={submitReview} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl md:max-w-2xl md:rounded-3xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 md:px-6">
              <div>
                <div className="text-lg font-black text-slate-950">Catat Hasil Review</div>
                <div className="mt-1 text-sm text-slate-500">{reviewTarget.documentCode} · {reviewTarget.title}</div>
              </div>
              <button type="button" onClick={() => setReviewTarget(null)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
              <label className="text-sm font-bold text-slate-700">
                Tanggal Review *
                <input required type="date" value={reviewForm.reviewDate} onChange={event => setReviewForm({ ...reviewForm, reviewDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Reviewer *
                <input required value={reviewForm.reviewerName} onChange={event => setReviewForm({ ...reviewForm, reviewerName: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Hasil Review *
                <select value={reviewForm.outcome} onChange={event => setReviewForm({ ...reviewForm, outcome: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400">
                  <option>Tetap Berlaku</option>
                  <option>Perlu Revisi</option>
                  <option>Diganti</option>
                  <option>Dicabut</option>
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                Versi Hasil Review
                <input value={reviewForm.resultingVersion} onChange={event => setReviewForm({ ...reviewForm, resultingVersion: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Review Berikutnya
                <input type="date" value={reviewForm.nextReviewDate} onChange={event => setReviewForm({ ...reviewForm, nextReviewDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <div />
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Catatan Review
                <textarea value={reviewForm.notes} onChange={event => setReviewForm({ ...reviewForm, notes: event.target.value })} rows={4} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 md:px-6">
              <button type="button" onClick={() => setReviewTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Batal</button>
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Simpan Hasil Review
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
