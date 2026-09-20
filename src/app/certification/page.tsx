'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  FileArchive,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  Signature,
  Users
} from 'lucide-react';

const emptySubCert = {
  id: '',
  scopeId: '',
  testingCycleId: '',
  period: '',
  subjectType: 'Organization Unit',
  subjectId: '',
  certifierName: '',
  certifierRole: '',
  declarationText: '',
  controlsPerformed: false,
  changesDisclosed: false,
  deficienciesDisclosed: false,
  fraudDisclosed: false,
  remediationAccurate: false,
  conclusion: 'Not Concluded',
  status: 'Draft',
  reviewerName: '',
  reviewerDecision: '',
  reviewerComments: ''
};

const emptyAttestation = {
  id: '',
  scopeId: '',
  testingCycleId: '',
  period: '',
  scopeSummary: '',
  managementRepresentation: '',
  unresolvedDeficiencyDisclosure: '',
  overallConclusion: 'Not Concluded',
  preparedBy: '',
  reviewedBy: '',
  readinessOverride: false,
  overrideReason: '',
  status: 'Draft'
};

const emptyEvidence = {
  id: '',
  attestationId: '',
  packName: '',
  period: '',
  preparedBy: '',
  reviewerName: '',
  evidenceIndexRef: '',
  testingSummaryRef: '',
  deficiencySummaryRef: '',
  remediationSummaryRef: '',
  representationRef: '',
  status: 'Draft',
  notes: ''
};

function statusTone(status: string) {
  if (['Approved', 'Signed', 'Final', 'Closed'].includes(status)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (['Submitted', 'Under Review', 'Awaiting CEO Sign-Off', 'Awaiting CFO Sign-Off'].includes(status)) {
    return 'border-sky-200 bg-sky-50 text-sky-700';
  }
  if (['Rejected', 'Blocked'].includes(status)) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function CertificationPage() {
  const [data, setData] = useState<any>(null);
  const [subCertForm, setSubCertForm] = useState(emptySubCert);
  const [attestationForm, setAttestationForm] = useState(emptyAttestation);
  const [evidenceForm, setEvidenceForm] = useState(emptyEvidence);
  const [selectedAttestationId, setSelectedAttestationId] = useState('');
  const [signoffRole, setSignoffRole] = useState<'CFO' | 'CEO'>('CFO');
  const [signatoryName, setSignatoryName] = useState('');
  const [declarationConfirmed, setDeclarationConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/icofr/certification', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Certification data unavailable.');
      setData(payload);

      const scopeId = payload.scopes?.[0]?.id || '';
      const cycleId = payload.cycles?.find((item: any) => item.scopeId === scopeId)?.id || '';
      const subjectId = payload.organizationUnits?.[0]?.id || payload.legalEntities?.[0]?.id || '';
      const subjectType = payload.organizationUnits?.length ? 'Organization Unit' : 'Legal Entity';
      const attestationId = payload.attestations?.[0]?.id || '';

      setSubCertForm(current => ({
        ...current,
        scopeId: current.scopeId || scopeId,
        testingCycleId: current.testingCycleId || cycleId,
        subjectType: current.subjectId ? current.subjectType : subjectType,
        subjectId: current.subjectId || subjectId
      }));

      setAttestationForm(current => ({
        ...current,
        scopeId: current.scopeId || scopeId,
        testingCycleId: current.testingCycleId || cycleId
      }));

      setEvidenceForm(current => ({
        ...current,
        attestationId: current.attestationId || attestationId,
        period:
          current.period ||
          payload.attestations?.find((item: any) => item.id === attestationId)?.period ||
          ''
      }));

      setSelectedAttestationId(current =>
        current && payload.attestations?.some((item: any) => item.id === current)
          ? current
          : attestationId
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Certification data unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const subjects = useMemo(() => {
    if (subCertForm.subjectType === 'Legal Entity') return data?.legalEntities || [];
    return data?.organizationUnits || [];
  }, [data, subCertForm.subjectType]);

  const subCertCycles = useMemo(
    () => (data?.cycles || []).filter((item: any) => !subCertForm.scopeId || item.scopeId === subCertForm.scopeId),
    [data, subCertForm.scopeId]
  );

  const attestationCycles = useMemo(
    () => (data?.cycles || []).filter((item: any) => !attestationForm.scopeId || item.scopeId === attestationForm.scopeId),
    [data, attestationForm.scopeId]
  );

  const selectedAttestation = useMemo(
    () => data?.attestations?.find((item: any) => item.id === selectedAttestationId) || null,
    [data, selectedAttestationId]
  );

  const readiness = selectedAttestationId ? data?.readiness?.[selectedAttestationId] || null : null;

  const saveSubCertification = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/icofr/certification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'SAVE_SUBCERTIFICATION', ...subCertForm })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save sub-certification.');
      setMessage(subCertForm.id ? 'Sub-certification updated in Cloudflare D1.' : 'Sub-certification saved in Cloudflare D1.');
      setSubCertForm(current => ({ ...current, id: payload.id }));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save sub-certification.');
    } finally {
      setSaving(false);
    }
  };

  const saveAttestation = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/icofr/certification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'SAVE_ATTESTATION', ...attestationForm })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save management attestation.');
      setMessage(attestationForm.id ? 'Management attestation updated in Cloudflare D1.' : 'Management attestation saved in Cloudflare D1.');
      setAttestationForm(current => ({ ...current, id: payload.id }));
      setSelectedAttestationId(payload.id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save management attestation.');
    } finally {
      setSaving(false);
    }
  };

  const saveEvidencePack = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/icofr/certification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'SAVE_EVIDENCE_PACK', ...evidenceForm })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save evidence pack.');
      setMessage(evidenceForm.id ? 'Evidence pack updated in Cloudflare D1.' : 'Evidence pack saved in Cloudflare D1.');
      setEvidenceForm(current => ({ ...current, id: payload.id }));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save evidence pack.');
    } finally {
      setSaving(false);
    }
  };

  const signAttestation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedAttestationId) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/icofr/certification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'SIGN_ATTESTATION',
          attestationId: selectedAttestationId,
          role: signoffRole,
          signatoryName,
          declarationConfirmed
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to record executive sign-off.');
      setMessage(`${signoffRole} sign-off recorded with readiness snapshot and audit trail.`);
      setSignatoryName('');
      setDeclarationConfirmed(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record executive sign-off.');
    } finally {
      setSaving(false);
    }
  };

  const editSubCert = (item: any) => {
    setSubCertForm({
      id: item.id || '',
      scopeId: item.scopeId || '',
      testingCycleId: item.testingCycleId || '',
      period: item.period || '',
      subjectType: item.subjectType || 'Organization Unit',
      subjectId: item.subjectId || '',
      certifierName: item.certifierName || '',
      certifierRole: item.certifierRole || '',
      declarationText: item.declarationText || '',
      controlsPerformed: Boolean(item.controlsPerformed),
      changesDisclosed: Boolean(item.changesDisclosed),
      deficienciesDisclosed: Boolean(item.deficienciesDisclosed),
      fraudDisclosed: Boolean(item.fraudDisclosed),
      remediationAccurate: Boolean(item.remediationAccurate),
      conclusion: item.conclusion || 'Not Concluded',
      status: item.status || 'Draft',
      reviewerName: item.reviewerName || '',
      reviewerDecision: item.reviewerDecision || '',
      reviewerComments: item.reviewerComments || ''
    });
    document.getElementById('subcert-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const editAttestation = (item: any) => {
    setAttestationForm({
      id: item.id || '',
      scopeId: item.scopeId || '',
      testingCycleId: item.testingCycleId || '',
      period: item.period || '',
      scopeSummary: item.scopeSummary || '',
      managementRepresentation: item.managementRepresentation || '',
      unresolvedDeficiencyDisclosure: item.unresolvedDeficiencyDisclosure || '',
      overallConclusion: item.overallConclusion || 'Not Concluded',
      preparedBy: item.preparedBy || '',
      reviewedBy: item.reviewedBy || '',
      readinessOverride: Boolean(item.readinessOverride),
      overrideReason: item.overrideReason || '',
      status: item.status || 'Draft'
    });
    setSelectedAttestationId(item.id);
    document.getElementById('attestation-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const editEvidence = (item: any) => {
    setEvidenceForm({
      id: item.id || '',
      attestationId: item.attestationId || '',
      packName: item.packName || '',
      period: item.period || '',
      preparedBy: item.preparedBy || '',
      reviewerName: item.reviewerName || '',
      evidenceIndexRef: item.evidenceIndexRef || '',
      testingSummaryRef: item.testingSummaryRef || '',
      deficiencySummaryRef: item.deficiencySummaryRef || '',
      remediationSummaryRef: item.remediationSummaryRef || '',
      representationRef: item.representationRef || '',
      status: item.status || 'Draft',
      notes: item.notes || ''
    });
    document.getElementById('evidence-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-emerald-600">
              <BadgeCheck className="h-4 w-4" /> ICOFR Certification & Year-End Close
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Management Certification, Readiness & Sign-Off</h1>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
              Capture entity/unit sub-certifications, management representations, year-end readiness gates,
              evidence-pack references and recorded CFO/CEO sign-offs. No effectiveness conclusion or executive sign-off is inferred.
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
          <Link href="/icofr/scoping" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Scoping</Link>
          <Link href="/icofr/testing-plan" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Testing Plan</Link>
          <Link href="/tod" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">ToD</Link>
          <Link href="/toe" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">ToE</Link>
          <Link href="/remediation" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Remediation</Link>
          <Link href="/icofr/coverage" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Coverage & Gaps</Link>
        </div>
      </div>

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
          Register an institution before using ICOFR certification.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <form id="subcert-form" onSubmit={saveSubCertification} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">1. Entity / Unit Sub-Certification</h2>
                  <p className="text-[10px] text-slate-500">Active form persisted to Cloudflare D1.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  ICOFR scope *
                  <select
                    required
                    value={subCertForm.scopeId}
                    onChange={e => {
                      const scopeId = e.target.value;
                      const cycleId = data?.cycles?.find((item: any) => item.scopeId === scopeId)?.id || '';
                      setSubCertForm({ ...subCertForm, scopeId, testingCycleId: cycleId });
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="">Select scope</option>
                    {(data?.scopes || []).map((item: any) => (
                      <option key={item.id} value={item.id}>{item.scopeName} · FY{item.fiscalYear} · {item.status}</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Testing cycle
                  <select
                    value={subCertForm.testingCycleId}
                    onChange={e => setSubCertForm({ ...subCertForm, testingCycleId: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="">No cycle linked</option>
                    {subCertCycles.map((item: any) => <option key={item.id} value={item.id}>{item.cycleName}</option>)}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Period *
                  <input
                    required
                    value={subCertForm.period}
                    onChange={e => setSubCertForm({ ...subCertForm, period: e.target.value })}
                    placeholder="e.g. FY2027"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Certification level *
                  <select
                    value={subCertForm.subjectType}
                    onChange={e => {
                      const type = e.target.value;
                      const list = type === 'Legal Entity' ? data?.legalEntities || [] : data?.organizationUnits || [];
                      setSubCertForm({ ...subCertForm, subjectType: type, subjectId: list[0]?.id || '' });
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option>Legal Entity</option>
                    <option>Organization Unit</option>
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Entity / unit *
                  <select
                    required
                    value={subCertForm.subjectId}
                    onChange={e => setSubCertForm({ ...subCertForm, subjectId: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="">Select</option>
                    {subjects.map((item: any) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Certifier *
                  <input
                    required
                    value={subCertForm.certifierName}
                    onChange={e => setSubCertForm({ ...subCertForm, certifierName: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Certifier role *
                  <input
                    required
                    value={subCertForm.certifierRole}
                    onChange={e => setSubCertForm({ ...subCertForm, certifierRole: e.target.value })}
                    placeholder="e.g. Division Head / Entity CFO"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Certification declaration *
                  <textarea
                    required
                    rows={3}
                    value={subCertForm.declarationText}
                    onChange={e => setSubCertForm({ ...subCertForm, declarationText: e.target.value })}
                    placeholder="Enter the actual certification statement approved for this period."
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5"
                  />
                </label>

                <div className="sm:col-span-2 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
                  {[
                    ['controlsPerformed', 'Key controls performed as represented'],
                    ['changesDisclosed', 'Material process/system/control changes disclosed'],
                    ['deficienciesDisclosed', 'Known control deficiencies disclosed'],
                    ['fraudDisclosed', 'Known fraud or suspected fraud matters disclosed'],
                    ['remediationAccurate', 'Remediation status reported accurately']
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-start gap-2 text-[11px] font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean((subCertForm as any)[key])}
                        onChange={e => setSubCertForm({ ...subCertForm, [key]: e.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                </div>

                <label className="text-xs font-bold text-slate-700">
                  Unit conclusion
                  <select
                    value={subCertForm.conclusion}
                    onChange={e => setSubCertForm({ ...subCertForm, conclusion: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option>Not Concluded</option>
                    <option>Effective</option>
                    <option>Effective with Exceptions</option>
                    <option>Ineffective</option>
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Status
                  <select
                    value={subCertForm.status}
                    onChange={e => setSubCertForm({ ...subCertForm, status: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option>Draft</option>
                    <option>Submitted</option>
                    <option>Under Review</option>
                    <option>Approved</option>
                    <option>Rejected</option>
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Reviewer
                  <input
                    value={subCertForm.reviewerName}
                    onChange={e => setSubCertForm({ ...subCertForm, reviewerName: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Reviewer decision
                  <select
                    value={subCertForm.reviewerDecision}
                    onChange={e => setSubCertForm({ ...subCertForm, reviewerDecision: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="">Not reviewed</option>
                    <option>Approved</option>
                    <option>Returned for Revision</option>
                    <option>Rejected</option>
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Reviewer comments
                  <textarea
                    rows={2}
                    value={subCertForm.reviewerComments}
                    onChange={e => setSubCertForm({ ...subCertForm, reviewerComments: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>
              </div>

              <div className="mt-4 flex justify-end">
                <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
                  <Save className="h-4 w-4" /> {subCertForm.id ? 'Update sub-certification' : 'Save sub-certification'}
                </button>
              </div>
            </form>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-slate-900">Sub-Certification Register</h2>
              <p className="mt-1 text-[10px] text-slate-500">Entity/unit certifications roll up into the management attestation readiness view.</p>

              <div className="mt-4 space-y-2">
                {(data?.subCertifications || []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                    No sub-certifications registered.
                  </div>
                ) : (
                  (data?.subCertifications || []).map((item: any) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${statusTone(item.status)}`}>{item.status}</span>
                            <span className="text-[9px] font-bold text-slate-400">{item.period}</span>
                          </div>
                          <div className="mt-1 text-xs font-black text-slate-800">
                            {item.subject?.code || item.subjectType} · {item.subject?.name || 'Subject not available'}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-500">
                            {item.certifierName} · {item.certifierRole} · {item.conclusion}
                          </div>
                        </div>
                        <button type="button" onClick={() => editSubCert(item)} className="rounded-lg border border-slate-200 p-2 text-slate-500">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <form id="attestation-form" onSubmit={saveAttestation} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">2. Management Attestation</h2>
                  <p className="text-[10px] text-slate-500">Management conclusion is explicitly entered; Total ARC does not infer it.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  ICOFR scope *
                  <select
                    required
                    value={attestationForm.scopeId}
                    onChange={e => {
                      const scopeId = e.target.value;
                      const cycleId = data?.cycles?.find((item: any) => item.scopeId === scopeId)?.id || '';
                      setAttestationForm({ ...attestationForm, scopeId, testingCycleId: cycleId });
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="">Select scope</option>
                    {(data?.scopes || []).map((item: any) => (
                      <option key={item.id} value={item.id}>{item.scopeName} · FY{item.fiscalYear} · {item.status}</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Testing cycle
                  <select
                    value={attestationForm.testingCycleId}
                    onChange={e => setAttestationForm({ ...attestationForm, testingCycleId: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="">No cycle linked</option>
                    {attestationCycles.map((item: any) => <option key={item.id} value={item.id}>{item.cycleName}</option>)}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Period *
                  <input
                    required
                    value={attestationForm.period}
                    onChange={e => setAttestationForm({ ...attestationForm, period: e.target.value })}
                    placeholder="e.g. FY2027"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Scope summary *
                  <textarea
                    required
                    rows={3}
                    value={attestationForm.scopeSummary}
                    onChange={e => setAttestationForm({ ...attestationForm, scopeSummary: e.target.value })}
                    placeholder="Describe the actual ICOFR perimeter covered by this management attestation."
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Management representation *
                  <textarea
                    required
                    rows={4}
                    value={attestationForm.managementRepresentation}
                    onChange={e => setAttestationForm({ ...attestationForm, managementRepresentation: e.target.value })}
                    placeholder="Enter the approved management representation wording."
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Unresolved deficiency disclosure
                  <textarea
                    rows={3}
                    value={attestationForm.unresolvedDeficiencyDisclosure}
                    onChange={e => setAttestationForm({ ...attestationForm, unresolvedDeficiencyDisclosure: e.target.value })}
                    placeholder="Disclose unresolved deficiencies or state the documented conclusion."
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Overall management conclusion *
                  <select
                    value={attestationForm.overallConclusion}
                    onChange={e => setAttestationForm({ ...attestationForm, overallConclusion: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option>Not Concluded</option>
                    <option>Effective</option>
                    <option>Effective with Disclosed Exceptions</option>
                    <option>Ineffective</option>
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Status
                  <select
                    value={attestationForm.status}
                    onChange={e => setAttestationForm({ ...attestationForm, status: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option>Draft</option>
                    <option>Under Review</option>
                    <option>Ready for Sign-Off</option>
                    <option>Blocked</option>
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Prepared by *
                  <input
                    required
                    value={attestationForm.preparedBy}
                    onChange={e => setAttestationForm({ ...attestationForm, preparedBy: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Reviewed by
                  <input
                    value={attestationForm.reviewedBy}
                    onChange={e => setAttestationForm({ ...attestationForm, reviewedBy: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <label className="flex items-start gap-2 text-xs font-bold text-amber-900">
                    <input
                      type="checkbox"
                      checked={attestationForm.readinessOverride}
                      onChange={e => setAttestationForm({ ...attestationForm, readinessOverride: e.target.checked })}
                    />
                    Document readiness override
                  </label>
                  <p className="mt-1 text-[10px] leading-4 text-amber-800">
                    This does not change any failed readiness gate. It only permits executive sign-off when management has explicitly documented the basis for proceeding.
                  </p>
                  {attestationForm.readinessOverride && (
                    <textarea
                      required
                      rows={2}
                      value={attestationForm.overrideReason}
                      onChange={e => setAttestationForm({ ...attestationForm, overrideReason: e.target.value })}
                      placeholder="Required documented override rationale."
                      className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-xs"
                    />
                  )}
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
                  <Save className="h-4 w-4" /> {attestationForm.id ? 'Update attestation' : 'Save attestation'}
                </button>
              </div>
            </form>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">Year-End Readiness Gate</h2>
                  <p className="text-[10px] text-slate-500">Select a saved attestation to evaluate persisted readiness evidence.</p>
                </div>
              </div>

              <select
                value={selectedAttestationId}
                onChange={e => {
                  setSelectedAttestationId(e.target.value);
                  const item = data?.attestations?.find((row: any) => row.id === e.target.value);
                  if (item) {
                    setEvidenceForm(current => ({
                      ...current,
                      attestationId: item.id,
                      period: current.id ? current.period : item.period
                    }));
                  }
                }}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs"
              >
                <option value="">Select management attestation</option>
                {(data?.attestations || []).map((item: any) => (
                  <option key={item.id} value={item.id}>{item.period} · {item.overallConclusion} · {item.status}</option>
                ))}
              </select>

              {!selectedAttestation ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                  Save or select an attestation to view readiness.
                </div>
              ) : (
                <>
                  <div className="mt-4 rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-black text-slate-900">{selectedAttestation.period}</div>
                        <div className="mt-0.5 text-[10px] text-slate-500">{selectedAttestation.overallConclusion}</div>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-black ${readiness?.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                        {readiness?.ready ? 'READY' : 'NOT READY'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {(readiness?.gates || []).map((gate: any) => (
                      <div key={gate.key} className="flex gap-3 rounded-xl border border-slate-200 p-3">
                        {gate.passed ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        )}
                        <div>
                          <div className="text-[11px] font-black text-slate-800">{gate.label}</div>
                          <div className="mt-0.5 text-[10px] leading-4 text-slate-500">{gate.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedAttestation.readinessOverride && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-800">
                      <strong>Readiness override documented:</strong> {selectedAttestation.overrideReason || 'Reason not available'}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <form onSubmit={signAttestation} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Signature className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">3. Executive Sign-Off</h2>
                  <p className="text-[10px] text-slate-500">Records a named sign-off and readiness snapshot; it is not a cryptographic digital signature.</p>
                </div>
              </div>

              {!selectedAttestation ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                  Select a saved management attestation first.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSignoffRole('CFO')}
                      className={`rounded-xl border p-3 text-xs font-black ${signoffRole === 'CFO' ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}
                    >
                      CFO Sign-Off
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignoffRole('CEO')}
                      className={`rounded-xl border p-3 text-xs font-black ${signoffRole === 'CEO' ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}
                    >
                      CEO Sign-Off
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-3 text-[10px]">
                    <div>
                      <div className="font-black text-slate-500">CFO</div>
                      <div className="mt-1 font-bold text-slate-800">
                        {selectedAttestation.cfoSignOff ? `Signed · ${selectedAttestation.cfoName}` : 'Not signed'}
                      </div>
                    </div>
                    <div>
                      <div className="font-black text-slate-500">CEO</div>
                      <div className="mt-1 font-bold text-slate-800">
                        {selectedAttestation.ceoSignOff ? `Signed · ${selectedAttestation.ceoName}` : 'Not signed'}
                      </div>
                    </div>
                  </div>

                  <label className="block text-xs font-bold text-slate-700">
                    {signoffRole} signatory name *
                    <input
                      required
                      value={signatoryName}
                      onChange={e => setSignatoryName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                  </label>

                  <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-[11px] font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={declarationConfirmed}
                      onChange={e => setDeclarationConfirmed(e.target.checked)}
                    />
                    I confirm that the named signatory has reviewed the recorded management conclusion, disclosed matters and readiness information for this attestation.
                  </label>

                  {!readiness?.ready && !selectedAttestation.readinessOverride && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-800">
                      Sign-off is blocked while readiness gates remain unresolved unless an explicit management readiness override is documented in the attestation form.
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      disabled={saving || !signatoryName || !declarationConfirmed}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                    >
                      <Signature className="h-4 w-4" /> Record {signoffRole} sign-off
                    </button>
                  </div>
                </div>
              )}
            </form>

            <form id="evidence-form" onSubmit={saveEvidencePack} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <FileArchive className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">4. Year-End Evidence Pack</h2>
                  <p className="text-[10px] text-slate-500">Registers actual evidence repository/file references; Total ARC does not fabricate attachments.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Management attestation *
                  <select
                    required
                    value={evidenceForm.attestationId}
                    onChange={e => {
                      const item = data?.attestations?.find((row: any) => row.id === e.target.value);
                      setEvidenceForm({
                        ...evidenceForm,
                        attestationId: e.target.value,
                        period: item?.period || evidenceForm.period
                      });
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="">Select</option>
                    {(data?.attestations || []).map((item: any) => (
                      <option key={item.id} value={item.id}>{item.period} · {item.overallConclusion}</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Pack name *
                  <input required value={evidenceForm.packName} onChange={e => setEvidenceForm({ ...evidenceForm, packName: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Period *
                  <input required value={evidenceForm.period} onChange={e => setEvidenceForm({ ...evidenceForm, period: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Prepared by *
                  <input required value={evidenceForm.preparedBy} onChange={e => setEvidenceForm({ ...evidenceForm, preparedBy: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Reviewer
                  <input value={evidenceForm.reviewerName} onChange={e => setEvidenceForm({ ...evidenceForm, reviewerName: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>

                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Evidence index reference *
                  <input required value={evidenceForm.evidenceIndexRef} onChange={e => setEvidenceForm({ ...evidenceForm, evidenceIndexRef: e.target.value })} placeholder="Document repository/path/reference ID" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>

                {[
                  ['testingSummaryRef', 'Testing summary reference'],
                  ['deficiencySummaryRef', 'Deficiency summary reference'],
                  ['remediationSummaryRef', 'Remediation summary reference'],
                  ['representationRef', 'Management representation reference']
                ].map(([key, label]) => (
                  <label key={key} className="text-xs font-bold text-slate-700">
                    {label}
                    <input value={(evidenceForm as any)[key]} onChange={e => setEvidenceForm({ ...evidenceForm, [key]: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                  </label>
                ))}

                <label className="text-xs font-bold text-slate-700">
                  Status
                  <select value={evidenceForm.status} onChange={e => setEvidenceForm({ ...evidenceForm, status: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                    <option>Draft</option>
                    <option>Under Review</option>
                    <option>Complete</option>
                    <option>Archived</option>
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Notes
                  <textarea rows={2} value={evidenceForm.notes} onChange={e => setEvidenceForm({ ...evidenceForm, notes: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>
              </div>

              <div className="mt-4 flex justify-end">
                <button disabled={saving || !(data?.attestations || []).length} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
                  <Save className="h-4 w-4" /> {evidenceForm.id ? 'Update evidence pack' : 'Save evidence pack'}
                </button>
              </div>
            </form>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black text-slate-900">Management Attestation & Evidence Register</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="space-y-2">
                {(data?.attestations || []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">No management attestations registered.</div>
                ) : (
                  (data?.attestations || []).map((item: any) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" onClick={() => setSelectedAttestationId(item.id)} className="min-w-0 flex-1 text-left">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${statusTone(item.status)}`}>{item.status}</span>
                            <span className="text-[9px] font-bold text-slate-400">{item.period}</span>
                          </div>
                          <div className="mt-1 text-xs font-black text-slate-800">{item.overallConclusion}</div>
                          <div className="mt-1 text-[10px] text-slate-500">
                            CFO {item.cfoSignOff ? 'signed' : 'pending'} · CEO {item.ceoSignOff ? 'signed' : 'pending'}
                          </div>
                        </button>
                        <button type="button" onClick={() => editAttestation(item)} className="rounded-lg border border-slate-200 p-2 text-slate-500">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2">
                {(data?.evidencePacks || []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">No year-end evidence packs registered.</div>
                ) : (
                  (data?.evidencePacks || []).map((item: any) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${statusTone(item.status)}`}>{item.status}</span>
                            <span className="text-[9px] font-bold text-slate-400">{item.period}</span>
                          </div>
                          <div className="mt-1 text-xs font-black text-slate-800">{item.packName}</div>
                          <div className="mt-1 font-mono text-[9px] text-slate-500">{item.evidenceIndexRef}</div>
                        </div>
                        <button type="button" onClick={() => editEvidence(item)} className="rounded-lg border border-slate-200 p-2 text-slate-500">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
