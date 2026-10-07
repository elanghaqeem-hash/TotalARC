'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Globe2,
  Link2,
  Loader2,
  Network,
  Plus,
  Radar,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  X
} from 'lucide-react';

type Policy = {
  id: string;
  documentCode: string;
  documentType: string;
  title: string;
  status: string;
  version: string;
  ownerUnit: string | null;
};

type Regulation = {
  id: string;
  regulator: string;
  regulationCode: string;
  title: string;
  status: string;
};

type WatchSource = {
  id: string;
  regulator: string;
  name: string;
  sourceUrl: string;
  sourceType: string;
  sector: string | null;
  keywordsJson: string | null;
  active: number;
  lastCheckedAt: string | null;
  lastStatus: string | null;
  lastResultCount: number;
  lastError: string | null;
};

type Candidate = {
  id: string;
  sourceId: string;
  regulator: string;
  title: string;
  sourceUrl: string;
  status: string;
  discoveredAt: string;
  lastSeenAt: string;
  aiAnalysisJson: string | null;
  aiAnalyzedAt: string | null;
};

type Relationship = {
  id: string;
  sourceType: 'INTERNAL' | 'EXTERNAL';
  sourceId: string;
  targetType: 'INTERNAL' | 'EXTERNAL';
  targetId: string;
  relationType: string;
  rationale: string | null;
  effectiveDate: string | null;
  status: string;
  updatedAt: string;
};

type IntelligencePayload = {
  canManage: boolean;
  metrics: {
    watchSources: number;
    activeSources: number;
    newCandidates: number;
    analyzedCandidates: number;
    internalRelations: number;
    externalRelations: number;
  };
  sources: WatchSource[];
  candidates: Candidate[];
  relationships: Relationship[];
};

type Props = {
  policies: Policy[];
  regulations: Regulation[];
  canManage: boolean;
  onLibraryChanged?: () => void | Promise<void>;
};

type SectionKey = 'monitor' | 'relations';

const RELATION_TYPES = [
  ['IMPLEMENTS', 'Melaksanakan / Implementasi'],
  ['REFERENCES', 'Merujuk'],
  ['AMENDS', 'Mengubah'],
  ['SUPERSEDES', 'Menggantikan'],
  ['REVOKES', 'Mencabut'],
  ['RELATED_TO', 'Terkait Dengan'],
  ['IMPACTED_BY', 'Terdampak Oleh'],
  ['DERIVED_FROM', 'Bersumber / Diturunkan Dari']
] as const;

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: value.includes('T') ? '2-digit' : undefined,
    minute: value.includes('T') ? '2-digit' : undefined
  }).format(date);
}

function relationLabel(value: string) {
  return RELATION_TYPES.find(item => item[0] === value)?.[1] || value;
}

function parseAiAnalysis(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function candidateCode(title: string) {
  const patterns = [
    /(POJK[-\s/]?\d+[^,;]{0,20}(?:20\d{2}))/i,
    /(SEOJK[-\s/]?\d+[^,;]{0,20}(?:20\d{2}))/i,
    /(PADK[-\s/]?\d+[^,;]{0,20}(?:20\d{2}))/i,
    /(PBI[-\s/]?\d+[^,;]{0,20}(?:20\d{2}))/i,
    /(PADG[-\s/]?\d+[^,;]{0,20}(?:20\d{2}))/i,
    /(PLPS[-\s/]?\d+[^,;]{0,20}(?:20\d{2}))/i,
    /(PMK[-\s/]?\d+[^,;]{0,20}(?:20\d{2}))/i,
    /(Peraturan[^,;]{0,80}Nomor\s+\d+\s+Tahun\s+20\d{2})/i
  ];
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) return match[1].replace(/\s+/g, ' ').trim();
  }
  return '';
}

export function PolicyIntelligenceWorkspace({
  policies,
  regulations,
  canManage,
  onLibraryChanged
}: Props) {
  const [section, setSection] = useState<SectionKey>('monitor');
  const [data, setData] = useState<IntelligencePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [showRelationForm, setShowRelationForm] = useState(false);
  const [registerCandidate, setRegisterCandidate] = useState<Candidate | null>(null);

  const [sourceForm, setSourceForm] = useState({
    regulator: '',
    name: '',
    sourceUrl: '',
    sector: '',
    keywords: ''
  });

  const [relationForm, setRelationForm] = useState({
    sourceType: 'EXTERNAL',
    sourceId: '',
    targetType: 'INTERNAL',
    targetId: '',
    relationType: 'IMPLEMENTS',
    rationale: '',
    effectiveDate: '',
    status: 'Aktif'
  });

  const [registrationForm, setRegistrationForm] = useState({
    regulationCode: '',
    title: '',
    issueDate: '',
    effectiveDate: '',
    category: '',
    summary: ''
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/policy-library/intelligence', {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Regulatory Intelligence gagal dimuat.');
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regulatory Intelligence gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const postAction = useCallback(async (body: Record<string, unknown>, key = 'action') => {
    setWorkingId(key);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/policy-library/intelligence', {
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
      setWorkingId('');
    }
  }, [load]);

  const seedSources = async () => {
    const payload = await postAction({ action: 'SEED_OFFICIAL_SOURCES' }, 'seed');
    if (payload) {
      setNotice(
        payload.created?.length
          ? payload.created.length + ' sumber resmi ditambahkan.'
          : 'Sumber resmi standar sudah tersedia.'
      );
    }
  };

  const scanAll = async () => {
    const payload = await postAction({ action: 'SCAN_ALL' }, 'scan-all');
    if (payload) {
      const results = Array.isArray(payload.results) ? payload.results : [];
      const newItems = results.reduce(
        (total: number, item: Record<string, unknown>) => total + Number(item.newCount || 0),
        0
      );
      const failed = results.filter((item: Record<string, unknown>) => item.ok === false).length;
      setNotice(
        'Pemindaian selesai: ' + newItems + ' kandidat baru' +
        (failed ? ', ' + failed + ' sumber gagal dipindai.' : '.')
      );
    }
  };

  const scanOne = async (source: WatchSource) => {
    const payload = await postAction(
      { action: 'SCAN_SOURCE', sourceId: source.id },
      'scan-' + source.id
    );
    if (payload?.result) {
      setNotice(
        source.name + ': ' + Number(payload.result.newCount || 0) + ' kandidat baru terdeteksi.'
      );
    }
  };

  const analyzeCandidate = async (candidate: Candidate) => {
    setWorkingId('ai-' + candidate.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/policy-library/intelligence/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ candidateId: candidate.id })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Analisis AI tidak dapat diselesaikan.');
      setNotice('Screening AI selesai. Hasil tetap memerlukan validasi Tim Kepatuhan.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analisis AI tidak dapat diselesaikan.');
    } finally {
      setWorkingId('');
    }
  };

  const submitSource = async (event: FormEvent) => {
    event.preventDefault();
    const payload = await postAction({
      action: 'ADD_SOURCE',
      ...sourceForm,
      keywords: sourceForm.keywords
    }, 'add-source');
    if (payload) {
      setShowSourceForm(false);
      setSourceForm({ regulator: '', name: '', sourceUrl: '', sector: '', keywords: '' });
      setNotice('Sumber pantauan berhasil ditambahkan.');
    }
  };

  const submitRelation = async (event: FormEvent) => {
    event.preventDefault();
    const payload = await postAction({
      action: 'CREATE_RELATION',
      ...relationForm
    }, 'add-relation');
    if (payload) {
      setShowRelationForm(false);
      setRelationForm(current => ({
        ...current,
        sourceId: '',
        targetId: '',
        rationale: '',
        effectiveDate: ''
      }));
      setNotice('Relasi ketentuan berhasil disimpan.');
    }
  };

  const beginRegisterCandidate = (candidate: Candidate) => {
    setRegisterCandidate(candidate);
    setRegistrationForm({
      regulationCode: candidateCode(candidate.title),
      title: candidate.title,
      issueDate: '',
      effectiveDate: '',
      category: '',
      summary: ''
    });
  };

  const submitCandidateRegistration = async (event: FormEvent) => {
    event.preventDefault();
    if (!registerCandidate) return;
    setWorkingId('register-' + registerCandidate.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/policy-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'CREATE_REGULATION',
          regulator: registerCandidate.regulator,
          regulationCode: registrationForm.regulationCode,
          title: registrationForm.title,
          category: registrationForm.category,
          issueDate: registrationForm.issueDate,
          effectiveDate: registrationForm.effectiveDate,
          sourceUrl: registerCandidate.sourceUrl,
          status: 'Berlaku',
          summary: registrationForm.summary
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Kandidat belum dapat diregistrasikan.');
      setRegisterCandidate(null);
      setNotice('Kandidat sudah diregistrasikan sebagai regulasi eksternal.');
      await Promise.all([load(), Promise.resolve(onLibraryChanged?.())]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kandidat belum dapat diregistrasikan.');
    } finally {
      setWorkingId('');
    }
  };

  const sourceEntities = useMemo(() => {
    if (relationForm.sourceType === 'INTERNAL') {
      return policies.map(item => ({
        id: item.id,
        label: item.documentCode + ' — ' + item.title
      }));
    }
    return regulations.map(item => ({
      id: item.id,
      label: item.regulator + ' · ' + item.regulationCode + ' — ' + item.title
    }));
  }, [policies, regulations, relationForm.sourceType]);

  const targetEntities = useMemo(() => {
    if (relationForm.targetType === 'INTERNAL') {
      return policies.map(item => ({
        id: item.id,
        label: item.documentCode + ' — ' + item.title
      }));
    }
    return regulations.map(item => ({
      id: item.id,
      label: item.regulator + ' · ' + item.regulationCode + ' — ' + item.title
    }));
  }, [policies, regulations, relationForm.targetType]);

  const policyById = useMemo(
    () => new Map(policies.map(item => [item.id, item])),
    [policies]
  );
  const regulationById = useMemo(
    () => new Map(regulations.map(item => [item.id, item])),
    [regulations]
  );

  const entityLabel = useCallback((type: string, id: string) => {
    if (type === 'INTERNAL') {
      const item = policyById.get(id);
      return item ? item.documentCode + ' — ' + item.title : 'Ketentuan internal tidak ditemukan';
    }
    const item = regulationById.get(id);
    return item
      ? item.regulator + ' · ' + item.regulationCode + ' — ' + item.title
      : 'Regulasi eksternal tidak ditemukan';
  }, [policyById, regulationById]);

  const internalRelations = (data?.relationships || []).filter(
    item => item.sourceType === 'INTERNAL' && item.targetType === 'INTERNAL'
  );
  const externalRelations = (data?.relationships || []).filter(
    item => item.sourceType === 'EXTERNAL' || item.targetType === 'EXTERNAL'
  );

  const metrics = data?.metrics || {
    watchSources: 0,
    activeSources: 0,
    newCandidates: 0,
    analyzedCandidates: 0,
    internalRelations: 0,
    externalRelations: 0
  };

  return (
    <div>
      <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-4 md:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-black text-slate-950">
              <Radar className="h-5 w-5 text-indigo-600" />
              Regulatory Intelligence & Relationship Map
            </h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
              Pantau sumber regulasi resmi, deteksi kandidat perubahan, lakukan screening AI,
              dan bangun hubungan hukum antara regulasi eksternal serta ketentuan internal Bank.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />
              Refresh
            </button>
            {canManage && section === 'monitor' && (
              <button
                type="button"
                onClick={() => void scanAll()}
                disabled={workingId === 'scan-all' || !metrics.activeSources}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-black text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {workingId === 'scan-all'
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <ScanSearch className="h-4 w-4" />}
                Scan Semua Sumber
              </button>
            )}
            {canManage && section === 'relations' && (
              <button
                type="button"
                onClick={() => setShowRelationForm(true)}
                disabled={!policies.length && !regulations.length}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Tambah Relasi
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Sumber aktif', metrics.activeSources + '/' + metrics.watchSources, Globe2],
            ['Kandidat baru', metrics.newCandidates, ScanSearch],
            ['Relasi internal', metrics.internalRelations, GitBranch],
            ['Relasi eksternal', metrics.externalRelations, Network]
          ].map(([label, value, Icon]) => {
            const CardIcon = Icon as typeof Globe2;
            return (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{String(label)}</div>
                    <div className="mt-1 text-xl font-black text-slate-950">{String(value)}</div>
                  </div>
                  <CardIcon className="h-5 w-5 text-slate-400" />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSection('monitor')}
            className={'rounded-xl px-3.5 py-2 text-sm font-black ' +
              (section === 'monitor' ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 border border-slate-200')}
          >
            Monitor Sumber Resmi
          </button>
          <button
            type="button"
            onClick={() => setSection('relations')}
            className={'rounded-xl px-3.5 py-2 text-sm font-black ' +
              (section === 'relations' ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 border border-slate-200')}
          >
            Peta Relasi Ketentuan
          </button>
        </div>
      </div>

      {error && (
        <div className="m-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800 md:m-5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div className="m-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 md:m-5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}

      {section === 'monitor' && (
        <div className="space-y-5 p-4 md:p-5">
          <section className="rounded-2xl border border-slate-200">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="font-black text-slate-950">Sumber Pantauan Regulasi</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Scanner hanya mengambil tautan publik dari portal HTTPS. Hasilnya menjadi kandidat,
                  bukan otomatis dianggap sebagai kewajiban yang sudah tervalidasi.
                </p>
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void seedSources()}
                    disabled={workingId === 'seed'}
                    className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    {workingId === 'seed'
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <ShieldCheck className="h-4 w-4" />}
                    Tambahkan Sumber Resmi Standar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSourceForm(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100"
                  >
                    <Plus className="h-4 w-4" />
                    Sumber Lain
                  </button>
                </div>
              )}
            </div>
            <div className="grid gap-3 p-4 lg:grid-cols-2">
              {(data?.sources || []).map(source => (
                <article key={source.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-black uppercase tracking-[0.08em] text-indigo-600">
                        {source.regulator}
                      </div>
                      <div className="mt-1 font-black text-slate-950">{source.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{source.sector || 'Sektor belum diisi'}</div>
                    </div>
                    <span className={'rounded-full px-2.5 py-1 text-xs font-black ' +
                      (source.lastStatus === 'PASS'
                        ? 'bg-emerald-100 text-emerald-700'
                        : source.lastStatus === 'FAIL'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-slate-100 text-slate-600')
                    }>
                      {source.lastStatus || 'Belum scan'}
                    </span>
                  </div>
                  <a
                    href={source.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex max-w-full items-center gap-1.5 truncate text-xs font-bold text-indigo-700 hover:underline"
                  >
                    {source.sourceUrl}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                    <div>
                      <div className="text-slate-500">Terakhir scan</div>
                      <div className="mt-1 font-bold text-slate-800">{formatDate(source.lastCheckedAt)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Tautan relevan</div>
                      <div className="mt-1 font-bold text-slate-800">{source.lastResultCount}</div>
                    </div>
                  </div>
                  {source.lastError && (
                    <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-700">
                      {source.lastError}
                    </div>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => void scanOne(source)}
                      disabled={workingId === 'scan-' + source.id}
                      className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {workingId === 'scan-' + source.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <ScanSearch className="h-4 w-4" />}
                      Scan Sekarang
                    </button>
                  )}
                </article>
              ))}
              {!data?.sources.length && (
                <div className="col-span-full py-10 text-center">
                  <Globe2 className="mx-auto h-8 w-8 text-slate-300" />
                  <div className="mt-3 font-bold text-slate-700">Belum ada sumber regulasi.</div>
                  <div className="mt-1 text-sm text-slate-500">
                    Tambahkan sumber resmi standar atau portal regulator lain yang relevan.
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200">
            <div className="border-b border-slate-100 p-4">
              <h3 className="font-black text-slate-950">Kandidat Regulasi / Perubahan</h3>
              <p className="mt-1 text-sm text-slate-500">
                Kandidat perlu ditinjau oleh Kepatuhan. AI hanya melakukan screening potensi dampak,
                dan tidak otomatis menetapkan kewajiban atau status kepatuhan.
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {(data?.candidates || []).map(candidate => {
                const analysis = parseAiAnalysis(candidate.aiAnalysisJson);
                const impacts = Array.isArray(analysis?.potentialImpacts)
                  ? analysis?.potentialImpacts as Array<Record<string, unknown>>
                  : [];
                return (
                  <article key={candidate.id} className="p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-black text-indigo-700">
                            {candidate.regulator}
                          </span>
                          <span className={'rounded-full px-2.5 py-1 text-xs font-black ' +
                            (candidate.status === 'BARU'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-700')
                          }>
                            {candidate.status}
                          </span>
                          {candidate.aiAnalyzedAt && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-black text-violet-700">
                              <Bot className="h-3 w-3" />
                              AI screened
                            </span>
                          )}
                        </div>
                        <div className="mt-2 max-w-4xl font-black leading-6 text-slate-950">{candidate.title}</div>
                        <a
                          href={candidate.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:underline"
                        >
                          Buka sumber
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        {analysis && (
                          <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-violet-700">
                              <Sparkles className="h-4 w-4" />
                              Screening AI
                            </div>
                            <p className="mt-2 text-sm leading-6 text-violet-950">
                              {String(analysis.summary || 'Screening selesai.')}
                            </p>
                            {analysis.recommendedAction && (
                              <div className="mt-2 text-xs leading-5 text-violet-800">
                                <span className="font-black">Rekomendasi:</span> {String(analysis.recommendedAction)}
                              </div>
                            )}
                            {impacts.length > 0 && (
                              <div className="mt-3 grid gap-2">
                                {impacts.slice(0, 6).map((impact, index) => {
                                  const policy = policyById.get(String(impact.policyDocumentId || ''));
                                  return (
                                    <div key={index} className="rounded-xl border border-violet-100 bg-white p-3">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-black text-slate-900">
                                          {policy ? policy.documentCode + ' — ' + policy.title : 'Ketentuan internal'}
                                        </span>
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                                          {String(impact.confidence || 'LOW')}
                                        </span>
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                                          {String(impact.impactLevel || 'Sedang')}
                                        </span>
                                      </div>
                                      <div className="mt-1 text-xs leading-5 text-slate-600">
                                        {String(impact.rationale || '')}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {canManage && (
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void analyzeCandidate(candidate)}
                            disabled={workingId === 'ai-' + candidate.id}
                            className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                          >
                            {workingId === 'ai-' + candidate.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Sparkles className="h-4 w-4" />}
                            {candidate.aiAnalyzedAt ? 'Analisis Ulang' : 'Analisis Dampak AI'}
                          </button>
                          <button
                            type="button"
                            onClick={() => beginRegisterCandidate(candidate)}
                            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white hover:bg-slate-800"
                          >
                            <Plus className="h-4 w-4" />
                            Registrasikan
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
              {!data?.candidates.length && (
                <div className="py-12 text-center">
                  <ScanSearch className="mx-auto h-8 w-8 text-slate-300" />
                  <div className="mt-3 font-bold text-slate-700">Belum ada kandidat regulasi.</div>
                  <div className="mt-1 text-sm text-slate-500">
                    Jalankan scan pada satu atau seluruh sumber pantauan.
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {section === 'relations' && (
        <div className="space-y-5 p-4 md:p-5">
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border border-slate-200">
              <div className="border-b border-slate-100 p-4">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5 text-slate-700" />
                  <h3 className="font-black text-slate-950">Relasi Ketentuan Internal Bank</h3>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Menunjukkan hubungan Kebijakan/SOP/Pedoman dengan ketentuan internal lainnya.
                </p>
              </div>
              <div className="grid gap-3 p-4">
                {internalRelations.map(item => (
                  <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-900">
                      {entityLabel(item.sourceType, item.sourceId)}
                    </div>
                    <div className="my-2 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-indigo-600">
                      <ArrowRight className="h-4 w-4" />
                      {relationLabel(item.relationType)}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-900">
                      {entityLabel(item.targetType, item.targetId)}
                    </div>
                    {item.rationale && (
                      <div className="mt-3 text-xs leading-5 text-slate-600">{item.rationale}</div>
                    )}
                  </article>
                ))}
                {!internalRelations.length && (
                  <div className="py-10 text-center text-sm text-slate-500">
                    Belum ada relasi internal↔internal.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-indigo-200 bg-indigo-50/30">
              <div className="border-b border-indigo-100 p-4">
                <div className="flex items-center gap-2">
                  <Network className="h-5 w-5 text-indigo-700" />
                  <h3 className="font-black text-slate-950">Relasi Regulasi Eksternal ↔ Internal Bank</h3>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Menunjukkan dasar hukum, ketentuan yang mengubah/mencabut, dan regulasi yang berdampak
                  pada Kebijakan/SOP Bank.
                </p>
              </div>
              <div className="grid gap-3 p-4">
                {externalRelations.map(item => (
                  <article key={item.id} className="rounded-2xl border border-indigo-200 bg-white p-4">
                    <div className={'rounded-xl border p-3 text-sm font-bold ' +
                      (item.sourceType === 'EXTERNAL'
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-950'
                        : 'border-slate-200 bg-slate-50 text-slate-900')
                    }>
                      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                        {item.sourceType === 'EXTERNAL' ? 'Regulasi eksternal' : 'Ketentuan internal'}
                      </div>
                      {entityLabel(item.sourceType, item.sourceId)}
                    </div>
                    <div className="my-2 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-indigo-700">
                      <ArrowRight className="h-4 w-4" />
                      {relationLabel(item.relationType)}
                    </div>
                    <div className={'rounded-xl border p-3 text-sm font-bold ' +
                      (item.targetType === 'EXTERNAL'
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-950'
                        : 'border-slate-200 bg-slate-50 text-slate-900')
                    }>
                      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                        {item.targetType === 'EXTERNAL' ? 'Regulasi eksternal' : 'Ketentuan internal'}
                      </div>
                      {entityLabel(item.targetType, item.targetId)}
                    </div>
                    {item.rationale && (
                      <div className="mt-3 text-xs leading-5 text-slate-600">{item.rationale}</div>
                    )}
                  </article>
                ))}
                {!externalRelations.length && (
                  <div className="py-10 text-center text-sm text-slate-500">
                    Belum ada relasi regulasi eksternal↔ketentuan internal.
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <Link2 className="mt-0.5 h-5 w-5 text-slate-700" />
              <div>
                <div className="font-black text-slate-950">Cara membaca relationship map</div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Arah panah menunjukkan hubungan dari ketentuan sumber ke ketentuan tujuan. Contoh:
                  POJK baru <strong>MENGUBAH</strong> POJK lama; POJK <strong>MENJADI DASAR</strong>
                  Kebijakan Kredit Bank; SOP Kredit <strong>BERSUMBER</strong> dari Kebijakan Kredit;
                  Surat Edaran internal <strong>MENGUBAH</strong> SOP sebelumnya.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}

      {showSourceForm && canManage && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm md:items-center md:p-6">
          <form onSubmit={submitSource} className="w-full rounded-t-3xl bg-white shadow-2xl md:max-w-2xl md:rounded-3xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-lg font-black text-slate-950">Tambah Sumber Pantauan</div>
                <div className="mt-1 text-sm text-slate-500">Gunakan halaman daftar regulasi resmi berbasis HTTPS.</div>
              </div>
              <button type="button" onClick={() => setShowSourceForm(false)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="text-sm font-bold text-slate-700">
                Regulator *
                <input required value={sourceForm.regulator} onChange={event => setSourceForm({ ...sourceForm, regulator: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Nama Sumber *
                <input required value={sourceForm.name} onChange={event => setSourceForm({ ...sourceForm, name: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                URL Resmi HTTPS *
                <input required type="url" value={sourceForm.sourceUrl} onChange={event => setSourceForm({ ...sourceForm, sourceUrl: event.target.value })} placeholder="https://..." className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Sektor
                <input value={sourceForm.sector} onChange={event => setSourceForm({ ...sourceForm, sector: event.target.value })} placeholder="Perbankan / AML / TI / Pajak..." className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Keyword Tambahan
                <input value={sourceForm.keywords} onChange={event => setSourceForm({ ...sourceForm, keywords: event.target.value })} placeholder="Bank, kredit, pelaporan, risiko" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setShowSourceForm(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Batal</button>
              <button disabled={workingId === 'add-source'} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
                {workingId === 'add-source' && <Loader2 className="h-4 w-4 animate-spin" />}
                Simpan Sumber
              </button>
            </div>
          </form>
        </div>
      )}

      {showRelationForm && canManage && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm md:items-center md:p-6">
          <form onSubmit={submitRelation} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl md:max-w-3xl md:rounded-3xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-lg font-black text-slate-950">Tambah Relasi Ketentuan</div>
                <div className="mt-1 text-sm text-slate-500">
                  Relasi dapat internal↔internal maupun eksternal↔internal.
                </div>
              </div>
              <button type="button" onClick={() => setShowRelationForm(false)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="text-sm font-bold text-slate-700">
                Jenis Sumber *
                <select value={relationForm.sourceType} onChange={event => setRelationForm({ ...relationForm, sourceType: event.target.value, sourceId: '' })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  <option value="EXTERNAL">Regulasi Eksternal</option>
                  <option value="INTERNAL">Ketentuan Internal Bank</option>
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                Jenis Tujuan *
                <select value={relationForm.targetType} onChange={event => setRelationForm({ ...relationForm, targetType: event.target.value, targetId: '' })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  <option value="INTERNAL">Ketentuan Internal Bank</option>
                  <option value="EXTERNAL">Regulasi Eksternal</option>
                </select>
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Ketentuan Sumber *
                <select required value={relationForm.sourceId} onChange={event => setRelationForm({ ...relationForm, sourceId: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  <option value="">Pilih ketentuan sumber</option>
                  {sourceEntities.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Hubungan *
                <select value={relationForm.relationType} onChange={event => setRelationForm({ ...relationForm, relationType: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  {RELATION_TYPES.map(item => <option key={item[0]} value={item[0]}>{item[1]}</option>)}
                </select>
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Ketentuan Tujuan *
                <select required value={relationForm.targetId} onChange={event => setRelationForm({ ...relationForm, targetId: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  <option value="">Pilih ketentuan tujuan</option>
                  {targetEntities.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                Berlaku Sejak
                <input type="date" value={relationForm.effectiveDate} onChange={event => setRelationForm({ ...relationForm, effectiveDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Status
                <select value={relationForm.status} onChange={event => setRelationForm({ ...relationForm, status: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  <option>Aktif</option>
                  <option>Historis</option>
                  <option>Dalam Review</option>
                </select>
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Dasar / Rasional Relasi
                <textarea value={relationForm.rationale} onChange={event => setRelationForm({ ...relationForm, rationale: event.target.value })} rows={4} placeholder="Contoh: Pasal 12 POJK X mewajibkan Bank memperbarui Kebijakan Y..." className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setShowRelationForm(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Batal</button>
              <button disabled={workingId === 'add-relation'} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
                {workingId === 'add-relation' && <Loader2 className="h-4 w-4 animate-spin" />}
                Simpan Relasi
              </button>
            </div>
          </form>
        </div>
      )}

      {registerCandidate && canManage && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm md:items-center md:p-6">
          <form onSubmit={submitCandidateRegistration} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl md:max-w-3xl md:rounded-3xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-lg font-black text-slate-950">Validasi & Registrasikan Regulasi</div>
                <div className="mt-1 text-sm text-slate-500">
                  Lengkapi nomor dan tanggal dari sumber resmi sebelum masuk Regulatory Watch.
                </div>
              </div>
              <button type="button" onClick={() => setRegisterCandidate(null)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="text-sm font-bold text-slate-700">
                Regulator
                <input readOnly value={registerCandidate.regulator} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-normal text-slate-600" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Nomor / Kode Regulasi *
                <input required value={registrationForm.regulationCode} onChange={event => setRegistrationForm({ ...registrationForm, regulationCode: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Judul *
                <textarea required value={registrationForm.title} onChange={event => setRegistrationForm({ ...registrationForm, title: event.target.value })} rows={3} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Tanggal Terbit
                <input type="date" value={registrationForm.issueDate} onChange={event => setRegistrationForm({ ...registrationForm, issueDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Tanggal Berlaku
                <input type="date" value={registrationForm.effectiveDate} onChange={event => setRegistrationForm({ ...registrationForm, effectiveDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Kategori
                <input value={registrationForm.category} onChange={event => setRegistrationForm({ ...registrationForm, category: event.target.value })} placeholder="Perbankan, Kepatuhan, AML, TI..." className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-700">
                Ringkasan Validasi
                <textarea value={registrationForm.summary} onChange={event => setRegistrationForm({ ...registrationForm, summary: event.target.value })} rows={4} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <div className="md:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                TotalARC tidak menganggap kandidat ini sebagai ketentuan yang berlaku sampai Tim Kepatuhan
                memvalidasi nomor, judul, tanggal, dan sumber resminya.
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setRegisterCandidate(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Batal</button>
              <button disabled={workingId === 'register-' + registerCandidate.id} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
                {workingId === 'register-' + registerCandidate.id && <Loader2 className="h-4 w-4 animate-spin" />}
                Validasi & Registrasikan
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
