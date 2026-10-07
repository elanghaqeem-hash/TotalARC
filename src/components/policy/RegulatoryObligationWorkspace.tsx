'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Target,
  X
} from 'lucide-react';

type Lookup = Record<string, unknown> & { id: string };

type Obligation = {
  id: string;
  regulationId: string;
  obligationCode: string;
  sourceArticle: string | null;
  requirementText: string;
  requirementType: string;
  applicability: string;
  frequency: string | null;
  ownerUnitId: string | null;
  ownerName: string | null;
  criticality: string;
  effectiveDate: string | null;
  dueDate: string | null;
  reviewDate: string | null;
  status: string;
  complianceStatus: string;
  lastAssessmentDate: string | null;
  nextAssessmentDate: string | null;
  notes: string | null;
};

type ObligationLink = {
  id: string;
  obligationId: string;
  targetType: string;
  targetId: string;
  relationship: string;
  rationale: string | null;
};

type Assessment = {
  id: string;
  obligationId: string;
  complianceStatus: string;
  assessmentDate: string;
  assessedBy: string;
  conclusion: string | null;
  gapSummary: string | null;
  remediationRequired: number;
  actionOwner: string | null;
  dueDate: string | null;
  nextAssessmentDate: string | null;
};

type Universe = {
  canManage: boolean;
  metrics: {
    totalObligations: number;
    activeObligations: number;
    compliant: number;
    partial: number;
    nonCompliant: number;
    notAssessed: number;
    gapObligations: number;
    overdueActions: number;
    completeTraceability: number;
    unmapped: number;
  };
  obligations: Obligation[];
  links: ObligationLink[];
  assessments: Assessment[];
  lookups: {
    regulations: Lookup[];
    policies: Lookup[];
    processes: Lookup[];
    risks: Lookup[];
    controls: Lookup[];
    evidence: Lookup[];
    orgUnits: Lookup[];
  };
};

const TARGET_TYPES = [
  ['INTERNAL_POLICY', 'Ketentuan Internal'],
  ['PROCESS', 'Business Process'],
  ['RISK', 'Risk'],
  ['CONTROL', 'Control'],
  ['EVIDENCE', 'Evidence']
] as const;

const REQUIREMENT_TYPES = [
  'GOVERNANCE',
  'REPORTING',
  'PROCESS',
  'CONTROL',
  'PRUDENTIAL',
  'AML_CFT',
  'CONDUCT',
  'DATA_PRIVACY',
  'IT_CYBER',
  'OTHER'
];

const COMPLIANCE_STATUSES = [
  ['NOT_ASSESSED', 'Belum Dinilai'],
  ['COMPLIANT', 'Compliant'],
  ['PARTIAL', 'Partial'],
  ['NON_COMPLIANT', 'Non-Compliant'],
  ['NOT_APPLICABLE', 'Not Applicable']
] as const;

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

function complianceLabel(status: string) {
  return COMPLIANCE_STATUSES.find(item => item[0] === status)?.[1] || status;
}

function complianceClass(status: string) {
  if (status === 'COMPLIANT') return 'bg-emerald-100 text-emerald-800';
  if (status === 'PARTIAL') return 'bg-amber-100 text-amber-800';
  if (status === 'NON_COMPLIANT') return 'bg-rose-100 text-rose-800';
  if (status === 'NOT_APPLICABLE') return 'bg-slate-100 text-slate-600';
  return 'bg-sky-100 text-sky-700';
}

function lookupLabel(type: string, item: Lookup) {
  if (type === 'INTERNAL_POLICY') {
    return String(item.documentCode || '') + ' — ' + String(item.title || '');
  }
  if (type === 'PROCESS') {
    return String(item.processId || '') + ' — ' + String(item.name || '');
  }
  if (type === 'RISK') {
    return String(item.riskId || '') + ' — ' + String(item.name || '');
  }
  if (type === 'CONTROL') {
    return String(item.controlId || '') + ' — ' + String(item.name || '');
  }
  if (type === 'EVIDENCE') {
    return String(item.evidenceId || '') + ' — ' + String(item.title || '');
  }
  return String(item.name || item.title || item.id);
}

export function RegulatoryObligationWorkspace() {
  const [data, setData] = useState<Universe | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [showAssessment, setShowAssessment] = useState(false);

  const [createForm, setCreateForm] = useState({
    regulationId: '',
    obligationCode: '',
    sourceArticle: '',
    requirementText: '',
    requirementType: 'OTHER',
    applicability: 'Berlaku',
    frequency: '',
    ownerUnitId: '',
    ownerName: '',
    criticality: 'Sedang',
    effectiveDate: '',
    dueDate: '',
    reviewDate: '',
    status: 'Draft',
    notes: ''
  });

  const [linkForm, setLinkForm] = useState({
    targetType: 'INTERNAL_POLICY',
    targetId: '',
    relationship: 'IMPLEMENTED_BY',
    rationale: ''
  });

  const [assessmentForm, setAssessmentForm] = useState({
    complianceStatus: 'COMPLIANT',
    assessmentDate: new Date().toISOString().slice(0, 10),
    conclusion: '',
    gapSummary: '',
    remediationRequired: false,
    actionOwner: '',
    dueDate: '',
    nextAssessmentDate: ''
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/policy-library/obligations', {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Compliance Universe gagal dimuat.');
      setData(payload);
      setSelectedId(current => {
        if (current && payload.obligations?.some((item: Obligation) => item.id === current)) return current;
        return payload.obligations?.[0]?.id || '';
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compliance Universe gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const action = useCallback(async (body: Record<string, unknown>, key: string) => {
    setWorking(key);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/policy-library/obligations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Tindakan tidak dapat diproses.');
      await load();
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tindakan tidak dapat diproses.');
      return null;
    } finally {
      setWorking('');
    }
  }, [load]);

  const regulations = data?.lookups.regulations || [];
  const regulationById = useMemo(
    () => new Map(regulations.map(item => [String(item.id), item])),
    [regulations]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return data?.obligations || [];
    return (data?.obligations || []).filter(item => {
      const regulation = regulationById.get(item.regulationId);
      return [
        item.obligationCode,
        item.sourceArticle,
        item.requirementText,
        item.requirementType,
        item.ownerName,
        regulation?.regulator,
        regulation?.regulationCode,
        regulation?.title
      ].some(value => String(value || '').toLowerCase().includes(needle));
    });
  }, [data?.obligations, regulationById, search]);

  const selected = data?.obligations.find(item => item.id === selectedId) || null;
  const selectedLinks = (data?.links || []).filter(item => item.obligationId === selectedId);
  const selectedAssessments = (data?.assessments || []).filter(item => item.obligationId === selectedId);

  const lookupForType = useCallback((type: string) => {
    if (!data) return [] as Lookup[];
    if (type === 'INTERNAL_POLICY') return data.lookups.policies;
    if (type === 'PROCESS') return data.lookups.processes;
    if (type === 'RISK') return data.lookups.risks;
    if (type === 'CONTROL') return data.lookups.controls;
    if (type === 'EVIDENCE') return data.lookups.evidence;
    return [] as Lookup[];
  }, [data]);

  const targetById = useCallback((type: string, id: string) => {
    return lookupForType(type).find(item => String(item.id) === id);
  }, [lookupForType]);

  const coverage = useMemo(() => {
    const types = new Set(selectedLinks.map(item => item.targetType));
    return TARGET_TYPES.map(item => ({ type: item[0], label: item[1], linked: types.has(item[0]) }));
  }, [selectedLinks]);

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    const result = await action({ action: 'CREATE_OBLIGATION', ...createForm }, 'create');
    if (!result) return;
    setShowCreate(false);
    setNotice('Kewajiban regulasi berhasil ditambahkan ke Compliance Universe.');
    setCreateForm(current => ({
      ...current,
      obligationCode: '',
      sourceArticle: '',
      requirementText: '',
      frequency: '',
      ownerName: '',
      effectiveDate: '',
      dueDate: '',
      reviewDate: '',
      notes: ''
    }));
    if (result.record?.id) setSelectedId(result.record.id);
  }

  async function submitLink(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const result = await action({
      action: 'LINK_TARGET',
      obligationId: selected.id,
      ...linkForm
    }, 'link');
    if (!result) return;
    setShowLink(false);
    setNotice('Relasi traceability berhasil ditambahkan.');
    setLinkForm(current => ({ ...current, targetId: '', rationale: '' }));
  }

  async function submitAssessment(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const isGap =
      assessmentForm.complianceStatus === 'PARTIAL' ||
      assessmentForm.complianceStatus === 'NON_COMPLIANT';
    const result = await action({
      action: 'RECORD_ASSESSMENT',
      obligationId: selected.id,
      ...assessmentForm,
      remediationRequired: assessmentForm.remediationRequired || isGap
    }, 'assessment');
    if (!result) return;
    setShowAssessment(false);
    setNotice('Assessment kepatuhan berhasil dicatat.');
  }

  const metrics = data?.metrics || {
    totalObligations: 0,
    activeObligations: 0,
    compliant: 0,
    partial: 0,
    nonCompliant: 0,
    notAssessed: 0,
    gapObligations: 0,
    overdueActions: 0,
    completeTraceability: 0,
    unmapped: 0
  };

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-4 md:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-black text-slate-950">
              <ClipboardCheck className="h-5 w-5 text-indigo-600" />
              Regulatory Obligation Register / Compliance Universe
            </h2>
            <p className="mt-1 max-w-5xl text-sm leading-6 text-slate-500">
              Traceability kewajiban regulasi dari sumber eksternal sampai implementasi internal,
              business process, risk, control, evidence, PIC, dan status kepatuhan.
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
                onClick={() => setShowCreate(true)}
                disabled={!regulations.length}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Tambah Kewajiban
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Total Obligation', metrics.totalObligations, ClipboardCheck],
            ['Compliant', metrics.compliant, ShieldCheck],
            ['Gap', metrics.gapObligations, ShieldAlert],
            ['Belum Dinilai', metrics.notAssessed, Target],
            ['Traceability Lengkap', metrics.completeTraceability, GitBranch]
          ].map(([label, value, Icon]) => {
            const CardIcon = Icon as typeof ClipboardCheck;
            return (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">{String(label)}</div>
                    <div className="mt-1 text-xl font-black text-slate-950">{String(value)}</div>
                  </div>
                  <CardIcon className="h-5 w-5 text-slate-400" />
                </div>
              </div>
            );
          })}
        </div>

        {(metrics.overdueActions > 0 || metrics.unmapped > 0) && (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {metrics.overdueActions > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">
                {metrics.overdueActions} tindak lanjut gap telah melewati due date.
              </div>
            )}
            {metrics.unmapped > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
                {metrics.unmapped} obligation belum memiliki traceability mapping.
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mx-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800 md:mx-5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div className="mx-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 md:mx-5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}

      <div className="grid gap-5 px-4 pb-5 md:px-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Cari kode kewajiban, pasal, regulasi, owner..."
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-slate-400"
              />
            </div>
          </div>

          <div className="max-h-[720px] divide-y divide-slate-100 overflow-y-auto">
            {filtered.map(item => {
              const regulation = regulationById.get(item.regulationId);
              const count = (data?.links || []).filter(link => link.obligationId === item.id).length;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={'w-full p-4 text-left transition hover:bg-slate-50 ' +
                    (selectedId === item.id ? 'bg-indigo-50/70' : 'bg-white')}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-black text-white">
                      {item.obligationCode}
                    </span>
                    <span className={'rounded-full px-2.5 py-1 text-[11px] font-black ' + complianceClass(item.complianceStatus)}>
                      {complianceLabel(item.complianceStatus)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                      {count} relasi
                    </span>
                  </div>
                  <div className="mt-2 text-xs font-black uppercase tracking-[0.06em] text-indigo-600">
                    {String(regulation?.regulator || '')} · {String(regulation?.regulationCode || '')}
                    {item.sourceArticle ? ' · ' + item.sourceArticle : ''}
                  </div>
                  <div className="mt-2 line-clamp-3 text-sm font-semibold leading-6 text-slate-800">
                    {item.requirementText}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>PIC: <strong className="text-slate-700">{item.ownerName || 'Belum ditetapkan'}</strong></span>
                    <span>Kritis: <strong className="text-slate-700">{item.criticality}</strong></span>
                    <span>Status: <strong className="text-slate-700">{item.status}</strong></span>
                  </div>
                </button>
              );
            })}
            {!filtered.length && (
              <div className="p-10 text-center text-sm text-slate-500">
                Belum ada obligation yang sesuai filter.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white">
          {!selected ? (
            <div className="p-10 text-center">
              <ClipboardCheck className="mx-auto h-9 w-9 text-slate-300" />
              <div className="mt-3 font-bold text-slate-700">Pilih obligation untuk melihat traceability.</div>
            </div>
          ) : (
            <div>
              <div className="border-b border-slate-100 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.08em] text-indigo-600">{selected.obligationCode}</div>
                    <h3 className="mt-1 font-black leading-6 text-slate-950">{selected.requirementText}</h3>
                  </div>
                  {data?.canManage && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setShowLink(true)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                      >
                        + Relasi
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAssessment(true)}
                        className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-500"
                      >
                        Assessment
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3 text-xs">
                    <div className="text-slate-500">Pasal / Klausul</div>
                    <div className="mt-1 font-bold text-slate-800">{selected.sourceArticle || 'Belum diisi'}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-xs">
                    <div className="text-slate-500">Assessment terakhir</div>
                    <div className="mt-1 font-bold text-slate-800">{formatDate(selected.lastAssessmentDate)}</div>
                  </div>
                </div>
              </div>

              <div className="border-b border-slate-100 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-black text-slate-950">Traceability Coverage</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Rantai lengkap: Policy → Process → Risk → Control → Evidence.
                    </div>
                  </div>
                  <div className="text-sm font-black text-slate-700">
                    {coverage.filter(item => item.linked).length}/5
                  </div>
                </div>
                <div className="grid gap-2">
                  {coverage.map(item => (
                    <div key={item.type} className={'flex items-center gap-3 rounded-xl border p-3 ' +
                      (item.linked ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50')}>
                      {item.linked
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        : <div className="h-4 w-4 rounded-full border-2 border-slate-300" />}
                      <div className="text-sm font-bold text-slate-800">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-b border-slate-100 p-4">
                <div className="font-black text-slate-950">Relasi Implementasi</div>
                <div className="mt-3 grid gap-2">
                  {selectedLinks.map(link => {
                    const target = targetById(link.targetType, link.targetId);
                    return (
                      <div key={link.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.08em] text-indigo-600">
                              {link.targetType} · {link.relationship}
                            </div>
                            <div className="mt-1 text-sm font-bold text-slate-900">
                              {target ? lookupLabel(link.targetType, target) : 'Target tidak ditemukan'}
                            </div>
                            {link.rationale && <div className="mt-1 text-xs leading-5 text-slate-500">{link.rationale}</div>}
                          </div>
                          {data?.canManage && (
                            <button
                              type="button"
                              onClick={() => void action({ action: 'UNLINK_TARGET', linkId: link.id }, 'unlink-' + link.id)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              title="Hapus relasi"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!selectedLinks.length && (
                    <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">
                      Belum ada mapping implementasi.
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4">
                <div className="font-black text-slate-950">Riwayat Assessment</div>
                <div className="mt-3 grid gap-2">
                  {selectedAssessments.slice(0, 8).map(item => (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={'rounded-full px-2 py-0.5 text-[11px] font-black ' + complianceClass(item.complianceStatus)}>
                          {complianceLabel(item.complianceStatus)}
                        </span>
                        <span className="text-xs font-bold text-slate-500">{formatDate(item.assessmentDate)}</span>
                      </div>
                      {item.conclusion && <div className="mt-2 text-xs leading-5 text-slate-700">{item.conclusion}</div>}
                      {item.gapSummary && (
                        <div className="mt-2 rounded-lg bg-rose-50 p-2 text-xs leading-5 text-rose-700">
                          Gap: {item.gapSummary}
                        </div>
                      )}
                      {item.actionOwner && (
                        <div className="mt-2 text-xs text-slate-500">
                          PIC tindak lanjut: <strong>{item.actionOwner}</strong>
                          {item.dueDate ? ' · Due ' + formatDate(item.dueDate) : ''}
                        </div>
                      )}
                    </div>
                  ))}
                  {!selectedAssessments.length && (
                    <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">
                      Belum pernah dilakukan assessment.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {showCreate && data?.canManage && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 backdrop-blur-sm md:items-center md:p-6">
          <form onSubmit={submitCreate} className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl md:max-w-4xl md:rounded-3xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-lg font-black text-slate-950">Tambah Regulatory Obligation</div>
                <div className="mt-1 text-sm text-slate-500">Input harus berasal dari regulasi yang sudah divalidasi Tim Kepatuhan.</div>
              </div>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Regulasi Eksternal *
                <select required value={createForm.regulationId} onChange={event => setCreateForm({ ...createForm, regulationId: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  <option value="">Pilih regulasi</option>
                  {regulations.map(item => <option key={String(item.id)} value={String(item.id)}>{String(item.regulator)} · {String(item.regulationCode)} — {String(item.title)}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                Kode Obligation *
                <input required value={createForm.obligationCode} onChange={event => setCreateForm({ ...createForm, obligationCode: event.target.value })} placeholder="OBL-OJK-001" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Pasal / Klausul
                <input value={createForm.sourceArticle} onChange={event => setCreateForm({ ...createForm, sourceArticle: event.target.value })} placeholder="Pasal 12 ayat (3)" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Uraian Kewajiban *
                <textarea required rows={5} value={createForm.requirementText} onChange={event => setCreateForm({ ...createForm, requirementText: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Jenis Kewajiban
                <select value={createForm.requirementType} onChange={event => setCreateForm({ ...createForm, requirementType: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  {REQUIREMENT_TYPES.map(item => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                Criticality
                <select value={createForm.criticality} onChange={event => setCreateForm({ ...createForm, criticality: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  <option>Rendah</option><option>Sedang</option><option>Tinggi</option><option>Kritis</option>
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                Unit Pemilik
                <select value={createForm.ownerUnitId} onChange={event => setCreateForm({ ...createForm, ownerUnitId: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  <option value="">Belum ditetapkan</option>
                  {data.lookups.orgUnits.map(item => <option key={String(item.id)} value={String(item.id)}>{String(item.code)} — {String(item.name)}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                PIC / Owner
                <input value={createForm.ownerName} onChange={event => setCreateForm({ ...createForm, ownerName: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Frekuensi
                <input value={createForm.frequency} onChange={event => setCreateForm({ ...createForm, frequency: event.target.value })} placeholder="Bulanan / Tahunan / Event-driven" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Applicability
                <input value={createForm.applicability} onChange={event => setCreateForm({ ...createForm, applicability: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-sm font-bold text-slate-700">Efektif<input type="date" value={createForm.effectiveDate} onChange={event => setCreateForm({ ...createForm, effectiveDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              <label className="text-sm font-bold text-slate-700">Due Date<input type="date" value={createForm.dueDate} onChange={event => setCreateForm({ ...createForm, dueDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              <label className="text-sm font-bold text-slate-700">Review Date<input type="date" value={createForm.reviewDate} onChange={event => setCreateForm({ ...createForm, reviewDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              <label className="text-sm font-bold text-slate-700">
                Status
                <select value={createForm.status} onChange={event => setCreateForm({ ...createForm, status: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  <option>Draft</option><option>Active</option><option>Retired</option>
                </select>
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Catatan
                <textarea rows={3} value={createForm.notes} onChange={event => setCreateForm({ ...createForm, notes: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Batal</button>
              <button disabled={working === 'create'} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
                {working === 'create' && <Loader2 className="h-4 w-4 animate-spin" />} Simpan Obligation
              </button>
            </div>
          </form>
        </div>
      )}

      {showLink && selected && data?.canManage && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 backdrop-blur-sm md:items-center md:p-6">
          <form onSubmit={submitLink} className="w-full rounded-t-3xl bg-white shadow-2xl md:max-w-2xl md:rounded-3xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div><div className="text-lg font-black text-slate-950">Tambah Traceability Link</div><div className="mt-1 text-sm text-slate-500">{selected.obligationCode}</div></div>
              <button type="button" onClick={() => setShowLink(false)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-4 p-5">
              <label className="text-sm font-bold text-slate-700">
                Jenis Target
                <select value={linkForm.targetType} onChange={event => {
                  const type = event.target.value;
                  const relationship =
                    type === 'INTERNAL_POLICY' ? 'IMPLEMENTED_BY' :
                    type === 'PROCESS' ? 'APPLIES_TO' :
                    type === 'RISK' ? 'DRIVES_RISK' :
                    type === 'CONTROL' ? 'SATISFIED_BY' : 'EVIDENCED_BY';
                  setLinkForm({ ...linkForm, targetType: type, targetId: '', relationship });
                }} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  {TARGET_TYPES.map(item => <option key={item[0]} value={item[0]}>{item[1]}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                Target *
                <select required value={linkForm.targetId} onChange={event => setLinkForm({ ...linkForm, targetId: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  <option value="">Pilih target</option>
                  {lookupForType(linkForm.targetType).map(item => <option key={String(item.id)} value={String(item.id)}>{lookupLabel(linkForm.targetType, item)}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                Jenis Hubungan
                <input value={linkForm.relationship} onChange={event => setLinkForm({ ...linkForm, relationship: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Rasional
                <textarea rows={3} value={linkForm.rationale} onChange={event => setLinkForm({ ...linkForm, rationale: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setShowLink(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Batal</button>
              <button disabled={working === 'link'} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
                {working === 'link' && <Loader2 className="h-4 w-4 animate-spin" />} Simpan Relasi
              </button>
            </div>
          </form>
        </div>
      )}

      {showAssessment && selected && data?.canManage && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 backdrop-blur-sm md:items-center md:p-6">
          <form onSubmit={submitAssessment} className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl md:max-w-3xl md:rounded-3xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div><div className="text-lg font-black text-slate-950">Compliance Assessment</div><div className="mt-1 text-sm text-slate-500">{selected.obligationCode}</div></div>
              <button type="button" onClick={() => setShowAssessment(false)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="text-sm font-bold text-slate-700">
                Status Kepatuhan *
                <select value={assessmentForm.complianceStatus} onChange={event => {
                  const status = event.target.value;
                  setAssessmentForm({ ...assessmentForm, complianceStatus: status, remediationRequired: status === 'PARTIAL' || status === 'NON_COMPLIANT' });
                }} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  {COMPLIANCE_STATUSES.map(item => <option key={item[0]} value={item[0]}>{item[1]}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">Tanggal Assessment<input required type="date" value={assessmentForm.assessmentDate} onChange={event => setAssessmentForm({ ...assessmentForm, assessmentDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">Kesimpulan<textarea rows={3} value={assessmentForm.conclusion} onChange={event => setAssessmentForm({ ...assessmentForm, conclusion: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">Gap / Deficiency<textarea rows={3} value={assessmentForm.gapSummary} onChange={event => setAssessmentForm({ ...assessmentForm, gapSummary: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              <label className="text-sm font-bold text-slate-700">PIC Tindak Lanjut<input required={assessmentForm.complianceStatus === 'PARTIAL' || assessmentForm.complianceStatus === 'NON_COMPLIANT'} value={assessmentForm.actionOwner} onChange={event => setAssessmentForm({ ...assessmentForm, actionOwner: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              <label className="text-sm font-bold text-slate-700">Due Date Tindak Lanjut<input required={assessmentForm.complianceStatus === 'PARTIAL' || assessmentForm.complianceStatus === 'NON_COMPLIANT'} type="date" value={assessmentForm.dueDate} onChange={event => setAssessmentForm({ ...assessmentForm, dueDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">Assessment Berikutnya<input type="date" value={assessmentForm.nextAssessmentDate} onChange={event => setAssessmentForm({ ...assessmentForm, nextAssessmentDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                Status <strong>Partial</strong> dan <strong>Non-Compliant</strong> otomatis dianggap memerlukan tindak lanjut dan wajib memiliki PIC.
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setShowAssessment(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Batal</button>
              <button disabled={working === 'assessment'} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
                {working === 'assessment' && <Loader2 className="h-4 w-4 animate-spin" />} Simpan Assessment
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
