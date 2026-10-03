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
  certificationRef: '',
  scopeId: '',
  testingCycleId: '',
  period: '',
  certificationType: 'Year-End',
  certificationDate: new Date().toISOString().slice(0, 10),
  subjectType: 'Organization Unit',
  subjectId: '',
  certifierName: '',
  certifierRole: '',
  certifierEmail: '',
  declarationText: '',
  scopeComplete: false,
  controlsPerformed: false,
  evidenceComplete: false,
  changesDisclosed: false,
  deficienciesDisclosed: false,
  fraudDisclosed: false,
  remediationAccurate: false,
  judgmentsDisclosed: false,
  subsequentEventsDisclosed: false,
  managementOverrideDisclosed: false,
  materialChangeDetails: '',
  deficiencyDetails: '',
  fraudDetails: '',
  remediationDetails: '',
  judgmentDetails: '',
  subsequentEventDetails: '',
  managementOverrideDetails: '',
  evidenceReference: '',
  exceptionRationale: '',
  additionalComments: '',
  conclusion: 'Not Concluded',
  status: 'Draft',
  reviewerName: '',
  reviewerRole: '',
  reviewerEmail: '',
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

function displayStatus(value: string) {
  const labels: Record<string, string> = {
    Draft: 'Draft',
    Submitted: 'Diajukan',
    'Under Review': 'Dalam Reviu',
    Approved: 'Disetujui',
    Rejected: 'Ditolak',
    'Returned for Revision': 'Dikembalikan untuk Revisi',
    'Ready for Sign-Off': 'Siap untuk Persetujuan',
    Blocked: 'Diblokir',
    Complete: 'Lengkap',
    Archived: 'Diarsipkan',
    Signed: 'Ditandatangani',
    Final: 'Final',
    Closed: 'Ditutup'
  };
  return labels[value] || value;
}

function displayConclusion(value: string) {
  const labels: Record<string, string> = {
    'Not Concluded': 'Belum Disimpulkan',
    Effective: 'Efektif',
    'Effective with Exceptions': 'Efektif dengan Pengecualian',
    'Effective with Disclosed Exceptions': 'Efektif dengan Pengecualian yang Diungkapkan',
    Ineffective: 'Tidak Efektif'
  };
  return labels[value] || value;
}

function displaySubjectType(value: string) {
  if (value === 'Legal Entity') return 'Entitas Hukum';
  if (value === 'Organization Unit') return 'Unit Organisasi';
  return value;
}

function statusTone(status: string) {
  if (['Approved', 'Signed', 'Final', 'Closed'].includes(status)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (['Submitted', 'Under Review', 'Awaiting Persetujuan CEO', 'Awaiting Persetujuan CFO'].includes(status)) {
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
      if (!response.ok) throw new Error(payload.error || 'Data sertifikasi tidak tersedia.');
      setData(payload);

      const scopeId = payload.scopes?.[0]?.id || '';
      const cycleId = payload.cycles?.find((item: any) => item.scopeId === scopeId)?.id || '';
      const subjectId = payload.organizationUnits?.[0]?.id || payload.legalEntities?.[0]?.id || '';
      const subjectType = payload.organizationUnits?.length ? 'Organization Unit' : 'Legal Entity';
      const attestationId = payload.attestations?.[0]?.id || '';

      const defaultSubject =
        subjectType === 'Organization Unit'
          ? payload.organizationUnits?.find((item: any) => item.id === subjectId)
          : payload.legalEntities?.find((item: any) => item.id === subjectId);

      setSubCertForm(current => ({
        ...current,
        scopeId: current.scopeId || scopeId,
        testingCycleId: current.testingCycleId || cycleId,
        subjectType: current.subjectId ? current.subjectType : subjectType,
        subjectId: current.subjectId || subjectId,
        certificationDate: current.certificationDate || new Date().toISOString().slice(0, 10),
        certifierName:
          current.certifierName ||
          (defaultSubject?.headName ? String(defaultSubject.headName) : ''),
        certifierEmail:
          current.certifierEmail ||
          (defaultSubject?.headEmail ? String(defaultSubject.headEmail) : '')
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
      setError(err instanceof Error ? err.message : 'Data sertifikasi tidak tersedia.');
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

  const selectedSubject = useMemo(
    () => subjects.find((item: any) => item.id === subCertForm.subjectId) || null,
    [subjects, subCertForm.subjectId]
  );

  const selectedScope = useMemo(
    () => data?.scopes?.find((item: any) => item.id === subCertForm.scopeId) || null,
    [data, subCertForm.scopeId]
  );

  const selectedCycle = useMemo(
    () => data?.cycles?.find((item: any) => item.id === subCertForm.testingCycleId) || null,
    [data, subCertForm.testingCycleId]
  );

  const subjectContext = useMemo(
    () =>
      data?.subjectContext?.[
        `${subCertForm.subjectType}:${subCertForm.subjectId}`
      ] || null,
    [data, subCertForm.subjectType, subCertForm.subjectId]
  );

  const selectSubject = (type: string, subjectId: string) => {
    const list =
      type === 'Legal Entity'
        ? data?.legalEntities || []
        : data?.organizationUnits || [];
    const subject = list.find((item: any) => item.id === subjectId) || null;

    setSubCertForm(current => ({
      ...current,
      subjectType: type,
      subjectId,
      certifierName: subject?.headName ? String(subject.headName) : '',
      certifierEmail: subject?.headEmail ? String(subject.headEmail) : '',
      certifierRole: ''
    }));
  };


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
      if (!response.ok) throw new Error(payload.error || 'Sub-sertifikasi tidak dapat disimpan.');
      setMessage(subCertForm.id ? 'Sub-sertifikasi berhasil diperbarui di Cloudflare D1.' : 'Sub-sertifikasi berhasil disimpan di Cloudflare D1.');
      setSubCertForm(current => ({ ...current, id: payload.id }));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sub-sertifikasi tidak dapat disimpan.');
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
      if (!response.ok) throw new Error(payload.error || 'Atestasi manajemen tidak dapat disimpan.');
      setMessage(attestationForm.id ? 'Atestasi manajemen berhasil diperbarui di Cloudflare D1.' : 'Atestasi manajemen berhasil disimpan di Cloudflare D1.');
      setAttestationForm(current => ({ ...current, id: payload.id }));
      setSelectedAttestationId(payload.id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Atestasi manajemen tidak dapat disimpan.');
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
      if (!response.ok) throw new Error(payload.error || 'Paket evidence tidak dapat disimpan.');
      setMessage(evidenceForm.id ? 'Paket evidence berhasil diperbarui di Cloudflare D1.' : 'Paket evidence berhasil disimpan di Cloudflare D1.');
      setEvidenceForm(current => ({ ...current, id: payload.id }));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Paket evidence tidak dapat disimpan.');
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
      if (!response.ok) throw new Error(payload.error || 'Persetujuan eksekutif tidak dapat dicatat.');
      setMessage(`${signoffRole} persetujuan berhasil dicatat beserta snapshot kesiapan dan audit trail.`);
      setSignatoryName('');
      setDeclarationConfirmed(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Persetujuan eksekutif tidak dapat dicatat.');
    } finally {
      setSaving(false);
    }
  };

  const editSubCert = (item: any) => {
    setSubCertForm({
      id: item.id || '',
      certificationRef: item.certificationRef || '',
      scopeId: item.scopeId || '',
      testingCycleId: item.testingCycleId || '',
      period: item.period || '',
      certificationType: item.certificationType || 'Year-End',
      certificationDate: item.certificationDate || new Date().toISOString().slice(0, 10),
      subjectType: item.subjectType || 'Organization Unit',
      subjectId: item.subjectId || '',
      certifierName: item.certifierName || '',
      certifierRole: item.certifierRole || '',
      certifierEmail: item.certifierEmail || '',
      declarationText: item.declarationText || '',
      scopeComplete: Boolean(item.scopeComplete),
      controlsPerformed: Boolean(item.controlsPerformed),
      evidenceComplete: Boolean(item.evidenceComplete),
      changesDisclosed: Boolean(item.changesDisclosed),
      deficienciesDisclosed: Boolean(item.deficienciesDisclosed),
      fraudDisclosed: Boolean(item.fraudDisclosed),
      remediationAccurate: Boolean(item.remediationAccurate),
      judgmentsDisclosed: Boolean(item.judgmentsDisclosed),
      subsequentEventsDisclosed: Boolean(item.subsequentEventsDisclosed),
      managementOverrideDisclosed: Boolean(item.managementOverrideDisclosed),
      materialChangeDetails: item.materialChangeDetails || '',
      deficiencyDetails: item.deficiencyDetails || '',
      fraudDetails: item.fraudDetails || '',
      remediationDetails: item.remediationDetails || '',
      judgmentDetails: item.judgmentDetails || '',
      subsequentEventDetails: item.subsequentEventDetails || '',
      managementOverrideDetails: item.managementOverrideDetails || '',
      evidenceReference: item.evidenceReference || '',
      exceptionRationale: item.exceptionRationale || '',
      additionalComments: item.additionalComments || '',
      conclusion: item.conclusion || 'Not Concluded',
      status: item.status || 'Draft',
      reviewerName: item.reviewerName || '',
      reviewerRole: item.reviewerRole || '',
      reviewerEmail: item.reviewerEmail || '',
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
              <BadgeCheck className="h-4 w-4" /> Sertifikasi ICOFR & Penutupan Akhir Tahun
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Sertifikasi Manajemen, Kesiapan & Persetujuan</h1>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
              Catat sub-sertifikasi entitas/unit, representasi manajemen, pemeriksaan kesiapan akhir tahun,
              referensi paket evidence, serta persetujuan CFO/CEO yang terdokumentasi. Kesimpulan efektivitas dan persetujuan eksekutif tidak ditetapkan secara otomatis.
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
          <Link href="/icofr/testing-plan" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Rencana Pengujian</Link>
          <Link href="/tod" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">ToD</Link>
          <Link href="/toe" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">ToE</Link>
          <Link href="/icofr/workpaper-review" className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-violet-700">Reviu Kertas Kerja</Link>
          <Link href="/evidence" className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-700">Repositori Evidence</Link>
          <Link href="/remediation" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Remediasi</Link>
          <Link href="/icofr/coverage" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Cakupan & Kesenjangan</Link>
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
          Daftarkan institusi terlebih dahulu sebelum menggunakan modul sertifikasi ICOFR.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <form id="subcert-form" onSubmit={saveSubCertification} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">1. Sub-Sertifikasi Entitas / Unit</h2>
                  <p className="text-[10px] text-slate-500">Form aktif disimpan ke Cloudflare D1.</p>
                </div>
              </div>

              <div className="space-y-4">
                <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
                  <div className="mb-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-brand-600">
                      A. Perimeter Sertifikasi
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">
                      Hubungkan deklarasi dengan scope ICOFR yang telah disetujui, siklus pengujian, periode pelaporan, serta entitas/unit yang bertanggung jawab.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Referensi sertifikasi
                      <input
                        readOnly
                        value={subCertForm.certificationRef || 'Dibuat otomatis setelah penyimpanan pertama'}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 font-mono text-[11px] font-normal text-slate-500"
                      />
                    </label>

                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Scope ICOFR *
                      <select
                        required
                        value={subCertForm.scopeId}
                        onChange={e => {
                          const scopeId = e.target.value;
                          const scope = data?.scopes?.find((item: any) => item.id === scopeId);
                          const cycleId = data?.cycles?.find((item: any) => item.scopeId === scopeId)?.id || '';
                          setSubCertForm({
                            ...subCertForm,
                            scopeId,
                            testingCycleId: cycleId,
                            period:
                              subCertForm.period ||
                              (scope?.fiscalYear ? `FY${scope.fiscalYear}` : '')
                          });
                        }}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"
                      >
                        <option value="">Pilih scope</option>
                        {(data?.scopes || []).map((item: any) => (
                          <option key={item.id} value={item.id}>
                            {item.scopeName} · FY{item.fiscalYear} · {displayStatus(item.status)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs font-bold text-slate-700">
                      Siklus pengujian
                      <select
                        value={subCertForm.testingCycleId}
                        onChange={e => setSubCertForm({ ...subCertForm, testingCycleId: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"
                      >
                        <option value="">Belum ada siklus yang terhubung</option>
                        {subCertCycles.map((item: any) => (
                          <option key={item.id} value={item.id}>{item.cycleName}</option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs font-bold text-slate-700">
                      Periode *
                      <input
                        required
                        value={subCertForm.period}
                        onChange={e => setSubCertForm({ ...subCertForm, period: e.target.value })}
                        placeholder="mis. FY2027 / 2027 Q4"
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"
                      />
                    </label>

                    <label className="text-xs font-bold text-slate-700">
                      Jenis sertifikasi *
                      <select
                        value={subCertForm.certificationType}
                        onChange={e => setSubCertForm({ ...subCertForm, certificationType: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"
                      >
                        <option value="Quarterly">Triwulanan</option>
                        <option value="Semi-Annual">Semesteran</option>
                        <option value="Year-End">Akhir Tahun</option>
                        <option value="Ad Hoc">Ad Hoc</option>
                      </select>
                    </label>

                    <label className="text-xs font-bold text-slate-700">
                      Tanggal sertifikasi *
                      <input
                        type="date"
                        required
                        value={subCertForm.certificationDate}
                        onChange={e => setSubCertForm({ ...subCertForm, certificationDate: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"
                      />
                    </label>

                    <label className="text-xs font-bold text-slate-700">
                      Tingkat sertifikasi *
                      <select
                        value={subCertForm.subjectType}
                        onChange={e => {
                          const type = e.target.value;
                          const list =
                            type === 'Legal Entity'
                              ? data?.legalEntities || []
                              : data?.organizationUnits || [];
                          selectSubject(type, list[0]?.id || '');
                        }}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"
                      >
                        <option value="Legal Entity">Entitas Hukum</option>
                        <option value="Organization Unit">Unit Organisasi</option>
                      </select>
                    </label>

                    <label className="text-xs font-bold text-slate-700">
                      Entitas / unit *
                      <select
                        required
                        value={subCertForm.subjectId}
                        onChange={e => selectSubject(subCertForm.subjectType, e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"
                      >
                        <option value="">Pilih entitas / unit</option>
                        {subjects.map((item: any) => (
                          <option key={item.id} value={item.id}>
                            {item.code} · {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {selectedSubject && (
                    <div className="mt-3 rounded-xl border border-sky-100 bg-white p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-wide text-sky-700">
                            Konteks subjek terhubung
                          </div>
                          <div className="mt-1 text-xs font-black text-slate-900">
                            {selectedSubject.code} · {selectedSubject.name}
                          </div>
                          <div className="mt-1 text-[10px] leading-4 text-slate-500">
                            {selectedSubject.type || displaySubjectType(subCertForm.subjectType)}
                            {selectedSubject.headName ? ` · Head: ${selectedSubject.headName}` : ''}
                            {selectedSubject.headEmail ? ` · ${selectedSubject.headEmail}` : ''}
                          </div>
                        </div>
                        <div className="text-right text-[9px] leading-4 text-slate-400">
                          {selectedScope ? `Scope: ${displayStatus(selectedScope.status)}` : 'Scope belum dipilih'}
                          <br />
                          {selectedCycle ? `Cycle: ${selectedCycle.cycleName}` : 'Siklus belum terhubung'}
                        </div>
                      </div>

                      {subjectContext && (
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {[
                            ['Proses', subjectContext.processCount],
                            ['Kontrol kunci ICOFR', subjectContext.icofrKeyControlCount],
                            ['ToD selesai', `${subjectContext.todCompleted}/${subjectContext.todCount}`],
                            ['ToE selesai', `${subjectContext.toeCompleted}/${subjectContext.toeCount}`],
                            ['Isu H/C terbuka', subjectContext.openHighCriticalIssues],
                            ['MAP lewat jatuh tempo', subjectContext.overdueActionPlans]
                          ].map(([label, value]) => (
                            <div key={String(label)} className="rounded-xl bg-slate-50 px-3 py-2">
                              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
                              <div className="mt-0.5 text-sm font-black text-slate-800">{String(value ?? 0)}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-slate-200 p-3.5">
                  <div className="mb-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-brand-600">
                      B. Pemberi Sertifikasi & Deklarasi
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">
                      Identifikasi pejabat manajemen yang bertanggung jawab sebagai pemberi sertifikasi dan catat pernyataan sertifikasi yang telah disetujui.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700">
                      Nama pemberi sertifikasi *
                      <input
                        required
                        value={subCertForm.certifierName}
                        onChange={e => setSubCertForm({ ...subCertForm, certifierName: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      />
                    </label>

                    <label className="text-xs font-bold text-slate-700">
                      Jabatan pemberi sertifikasi *
                      <input
                        required
                        value={subCertForm.certifierRole}
                        onChange={e => setSubCertForm({ ...subCertForm, certifierRole: e.target.value })}
                        placeholder="mis. Kepala Divisi / CFO Entitas"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      />
                    </label>

                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Email pemberi sertifikasi *
                      <input
                        type="email"
                        required
                        value={subCertForm.certifierEmail}
                        onChange={e => setSubCertForm({ ...subCertForm, certifierEmail: e.target.value })}
                        placeholder="name@company.com"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      />
                    </label>

                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Deklarasi sertifikasi *
                      <textarea
                        required
                        rows={4}
                        value={subCertForm.declarationText}
                        onChange={e => setSubCertForm({ ...subCertForm, declarationText: e.target.value })}
                        placeholder="Masukkan pernyataan sertifikasi manajemen yang benar-benar telah disetujui untuk periode ini. Jangan menggunakan kesimpulan asumsi atau simulasi."
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5"
                      />
                    </label>

                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Referensi evidence / kertas kerja
                      <textarea
                        rows={2}
                        value={subCertForm.evidenceReference}
                        onChange={e => setSubCertForm({ ...subCertForm, evidenceReference: e.target.value })}
                        placeholder="Cantumkan referensi RCM, kertas kerja ToD/ToE, register isu, paket evidence, rekonsiliasi, atau ID dokumen pendukung. Wajib sebelum Diajukan/Disetujui."
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5"
                      />
                    </label>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 p-3.5">
                  <div className="mb-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-brand-600">
                      C. Representasi Manajemen
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">
                      Seluruh representasi berikut harus dikonfirmasi sebelum data dapat diajukan atau disetujui.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {[
                      ['scopeComplete', 'Scope ICOFR untuk entitas/unit ini telah lengkap dan disajikan secara tepat'],
                      ['controlsPerformed', 'Kontrol kunci telah dilaksanakan sebagaimana direpresentasikan'],
                      ['evidenceComplete', 'Evidence pendukung lengkap, akurat, dan tersedia untuk direviu'],
                      ['changesDisclosed', 'Perubahan material pada proses, sistem, dan kontrol telah diungkapkan'],
                      ['deficienciesDisclosed', 'Defisiensi kontrol dan pengecualian yang diketahui telah diungkapkan'],
                      ['fraudDisclosed', 'Fraud atau dugaan fraud yang diketahui dan memengaruhi pelaporan keuangan telah diungkapkan'],
                      ['remediationAccurate', 'Status remediasi dan tindakan manajemen telah dilaporkan secara akurat'],
                      ['judgmentsDisclosed', 'Pertimbangan akuntansi signifikan, estimasi, dan penyesuaian manual telah diungkapkan'],
                      ['subsequentEventsDisclosed', 'Peristiwa setelah tanggal pelaporan yang relevan telah diungkapkan'],
                      ['managementOverrideDisclosed', 'Override manajemen atau override kontrol yang diketahui telah diungkapkan']
                    ].map(([key, label]) => (
                      <label
                        key={key}
                        className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 text-[10px] font-bold leading-4 text-slate-700"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0"
                          checked={Boolean((subCertForm as any)[key])}
                          onChange={e =>
                            setSubCertForm({
                              ...subCertForm,
                              [key]: e.target.checked
                            })
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 p-3.5">
                  <div className="mb-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-brand-600">
                      D. Pengungkapan, Pengecualian & Narasi Pendukung
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">
                      Gunakan bagian ini untuk mendokumentasikan fakta yang mendasari representasi. Nyatakan “Tidak ada yang teridentifikasi” hanya apabila memang merupakan kesimpulan aktual.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {[
                      ['materialChangeDetails', 'Perubahan material proses / sistem / kontrol', 'Jelaskan perubahan material, tanggal efektif, dan dampaknya terhadap kontrol.'],
                      ['deficiencyDetails', 'Defisiensi kontrol / pengecualian', 'Cantumkan defisiensi yang relevan, klasifikasi, penanggung jawab, dan status terkini.'],
                      ['fraudDetails', 'Pengungkapan fraud / dugaan fraud', 'Catat fraud yang benar-benar diungkapkan atau nyatakan hasil reviu yang terdokumentasi.'],
                      ['remediationDetails', 'Status remediasi', 'Ringkas tindakan yang masih terbuka, terlambat, atau telah selesai yang relevan dengan sertifikasi ini.'],
                      ['judgmentDetails', 'Pertimbangan / estimasi signifikan', 'Catat pertimbangan material, estimasi, penyesuaian manual, atau transaksi tidak biasa yang telah direviu.'],
                      ['subsequentEventDetails', 'Peristiwa setelah periode pelaporan', 'Catat peristiwa relevan setelah batas pelaporan sampai dengan tanggal sertifikasi.'],
                      ['managementOverrideDetails', 'Hal terkait override manajemen', 'Catat override yang teridentifikasi, kontrol kompensasi, dan eskalasi bila relevan.'],
                      ['additionalComments', 'Komentar tambahan', 'Tambahkan fakta, keterbatasan, dependensi, atau referensi silang lainnya.']
                    ].map(([key, label, placeholder]) => (
                      <label key={key} className="text-xs font-bold text-slate-700">
                        {label}
                        <textarea
                          rows={3}
                          value={String((subCertForm as any)[key] || '')}
                          onChange={e =>
                            setSubCertForm({
                              ...subCertForm,
                              [key]: e.target.value
                            })
                          }
                          placeholder={placeholder}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5"
                        />
                      </label>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 p-3.5">
                  <div className="mb-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-brand-600">
                      E. Kesimpulan & Alur Kerja
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">
                      Pemberi sertifikasi menetapkan kesimpulan. Total ARC tidak menyimpulkan efektivitas secara otomatis.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700">
                      Kesimpulan unit *
                      <select
                        value={subCertForm.conclusion}
                        onChange={e => setSubCertForm({ ...subCertForm, conclusion: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      >
                        <option value="Not Concluded">Belum Disimpulkan</option>
                        <option value="Effective">Efektif</option>
                        <option value="Effective with Exceptions">Efektif dengan Pengecualian</option>
                        <option value="Ineffective">Tidak Efektif</option>
                      </select>
                    </label>

                    <label className="text-xs font-bold text-slate-700">
                      Status alur kerja
                      <select
                        value={subCertForm.status}
                        onChange={e => setSubCertForm({ ...subCertForm, status: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      >
                        <option value="Draft">Draft</option>
                        <option value="Submitted">Diajukan</option>
                        <option value="Under Review">Dalam Reviu</option>
                        <option value="Approved">Disetujui</option>
                        <option value="Rejected">Ditolak</option>
                      </select>
                    </label>

                    {['Effective with Exceptions', 'Ineffective'].includes(subCertForm.conclusion) && (
                      <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                        Alasan pengecualian / kesimpulan *
                        <textarea
                          required
                          rows={3}
                          value={subCertForm.exceptionRationale}
                          onChange={e => setSubCertForm({ ...subCertForm, exceptionRationale: e.target.value })}
                          placeholder="Jelaskan pengecualian, dampak, kontrol kompensasi, eskalasi, dan dasar atas kesimpulan yang dipilih."
                          className="mt-1 w-full rounded-xl border border-amber-200 bg-amber-50/40 px-3 py-2.5 font-normal leading-5"
                        />
                      </label>
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 p-3.5">
                  <div className="mb-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-brand-600">
                      F. Reviewer & Persetujuan
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">
                      Status alur kerja Disetujui memerlukan reviewer yang teridentifikasi, jabatan reviewer, dan keputusan Disetujui.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700">
                      Nama reviewer
                      <input
                        value={subCertForm.reviewerName}
                        onChange={e => setSubCertForm({ ...subCertForm, reviewerName: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      />
                    </label>

                    <label className="text-xs font-bold text-slate-700">
                      Jabatan reviewer
                      <input
                        value={subCertForm.reviewerRole}
                        onChange={e => setSubCertForm({ ...subCertForm, reviewerRole: e.target.value })}
                        placeholder="mis. Finance Controller / Reviewer ICOFR"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      />
                    </label>

                    <label className="text-xs font-bold text-slate-700">
                      Email reviewer
                      <input
                        type="email"
                        value={subCertForm.reviewerEmail}
                        onChange={e => setSubCertForm({ ...subCertForm, reviewerEmail: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      />
                    </label>

                    <label className="text-xs font-bold text-slate-700">
                      Keputusan reviewer
                      <select
                        value={subCertForm.reviewerDecision}
                        onChange={e => setSubCertForm({ ...subCertForm, reviewerDecision: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                      >
                        <option value="">Belum direviu</option>
                        <option value="Approved">Disetujui</option>
                        <option value="Returned for Revision">Dikembalikan untuk Revisi</option>
                        <option value="Rejected">Ditolak</option>
                      </select>
                    </label>

                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Komentar reviewer
                      <textarea
                        rows={3}
                        value={subCertForm.reviewerComments}
                        onChange={e => setSubCertForm({ ...subCertForm, reviewerComments: e.target.value })}
                        placeholder="Dokumentasikan catatan reviu, kondisi, tindak lanjut yang diperlukan, atau alasan persetujuan."
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5"
                      />
                    </label>
                  </div>
                </section>
              </div>

              <div className="mt-4 flex justify-end">
                <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
                  <Save className="h-4 w-4" /> {subCertForm.id ? 'Perbarui Sub-Sertifikasi' : 'Simpan Sub-Sertifikasi'}
                </button>
              </div>
            </form>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-slate-900">Register Sub-Sertifikasi</h2>
              <p className="mt-1 text-[10px] text-slate-500">Sertifikasi entitas/unit dirangkum ke dalam tampilan kesiapan atestasi manajemen.</p>

              <div className="mt-4 space-y-2">
                {(data?.subCertifications || []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                    Belum ada sub-sertifikasi yang terdaftar.
                  </div>
                ) : (
                  (data?.subCertifications || []).map((item: any) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${statusTone(item.status)}`}>{displayStatus(item.status)}</span>
                            <span className="text-[9px] font-bold text-slate-400">{item.period}</span>
                          </div>
                          <div className="mt-1 text-xs font-black text-slate-800">
                            {item.subject?.code || displaySubjectType(item.subjectType)} · {item.subject?.name || 'Subjek tidak tersedia'}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-500">
                            {item.certifierName} · {item.certifierRole} · {displayConclusion(item.conclusion)}
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
                  <h2 className="text-sm font-black text-slate-900">2. Atestasi Manajemen</h2>
                  <p className="text-[10px] text-slate-500">Kesimpulan manajemen harus diinput secara eksplisit; Total ARC tidak menetapkannya secara otomatis.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Scope ICOFR *
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
                    <option value="">Pilih scope</option>
                    {(data?.scopes || []).map((item: any) => (
                      <option key={item.id} value={item.id}>{item.scopeName} · FY{item.fiscalYear} · {displayStatus(item.status)}</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Siklus pengujian
                  <select
                    value={attestationForm.testingCycleId}
                    onChange={e => setAttestationForm({ ...attestationForm, testingCycleId: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="">Belum ada siklus yang terhubung</option>
                    {attestationCycles.map((item: any) => <option key={item.id} value={item.id}>{item.cycleName}</option>)}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Periode *
                  <input
                    required
                    value={attestationForm.period}
                    onChange={e => setAttestationForm({ ...attestationForm, period: e.target.value })}
                    placeholder="mis. FY2027"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Ringkasan scope *
                  <textarea
                    required
                    rows={3}
                    value={attestationForm.scopeSummary}
                    onChange={e => setAttestationForm({ ...attestationForm, scopeSummary: e.target.value })}
                    placeholder="Jelaskan perimeter ICOFR aktual yang dicakup dalam atestasi manajemen ini."
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Representasi manajemen *
                  <textarea
                    required
                    rows={4}
                    value={attestationForm.managementRepresentation}
                    onChange={e => setAttestationForm({ ...attestationForm, managementRepresentation: e.target.value })}
                    placeholder="Masukkan pernyataan representasi manajemen yang telah disetujui."
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Pengungkapan defisiensi yang belum terselesaikan
                  <textarea
                    rows={3}
                    value={attestationForm.unresolvedDeficiencyDisclosure}
                    onChange={e => setAttestationForm({ ...attestationForm, unresolvedDeficiencyDisclosure: e.target.value })}
                    placeholder="Ungkapkan defisiensi yang belum terselesaikan atau nyatakan kesimpulan yang terdokumentasi."
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Kesimpulan manajemen keseluruhan *
                  <select
                    value={attestationForm.overallConclusion}
                    onChange={e => setAttestationForm({ ...attestationForm, overallConclusion: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="Not Concluded">Belum Disimpulkan</option>
                    <option value="Effective">Efektif</option>
                    <option value="Effective with Disclosed Exceptions">Efektif dengan Pengecualian yang Diungkapkan</option>
                    <option value="Ineffective">Tidak Efektif</option>
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Status
                  <select
                    value={attestationForm.status}
                    onChange={e => setAttestationForm({ ...attestationForm, status: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Under Review">Dalam Reviu</option>
                    <option value="Ready for Sign-Off">Siap untuk Persetujuan</option>
                    <option value="Blocked">Diblokir</option>
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Disiapkan oleh *
                  <input
                    required
                    value={attestationForm.preparedBy}
                    onChange={e => setAttestationForm({ ...attestationForm, preparedBy: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Direviu oleh
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
                    Dokumentasikan override kesiapan
                  </label>
                  <p className="mt-1 text-[10px] leading-4 text-amber-800">
                    Ini tidak mengubah pemeriksaan kesiapan yang gagal. Fitur ini hanya memungkinkan persetujuan eksekutif apabila manajemen secara eksplisit telah mendokumentasikan dasar untuk melanjutkan.
                  </p>
                  {attestationForm.readinessOverride && (
                    <textarea
                      required
                      rows={2}
                      value={attestationForm.overrideReason}
                      onChange={e => setAttestationForm({ ...attestationForm, overrideReason: e.target.value })}
                      placeholder="Alasan override yang terdokumentasi wajib diisi."
                      className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-xs"
                    />
                  )}
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
                  <Save className="h-4 w-4" /> {attestationForm.id ? 'Perbarui Atestasi' : 'Simpan Atestasi'}
                </button>
              </div>
            </form>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">Pemeriksaan Kesiapan Akhir Tahun</h2>
                  <p className="text-[10px] text-slate-500">Pilih atestasi yang telah disimpan untuk mengevaluasi evidence kesiapan yang tersimpan.</p>
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
                <option value="">Pilih atestasi manajemen</option>
                {(data?.attestations || []).map((item: any) => (
                  <option key={item.id} value={item.id}>{item.period} · {displayConclusion(item.overallConclusion)} · {displayStatus(item.status)}</option>
                ))}
              </select>

              {!selectedAttestation ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                  Simpan atau pilih atestasi untuk melihat status kesiapan.
                </div>
              ) : (
                <>
                  <div className="mt-4 rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-black text-slate-900">{selectedAttestation.period}</div>
                        <div className="mt-0.5 text-[10px] text-slate-500">{displayConclusion(selectedAttestation.overallConclusion)}</div>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-black ${readiness?.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                        {readiness?.ready ? 'SIAP' : 'BELUM SIAP'}
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
                      <strong>Override kesiapan terdokumentasi:</strong> {selectedAttestation.overrideReason || 'Alasan tidak tersedia'}
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
                  <h2 className="text-sm font-black text-slate-900">3. Persetujuan Eksekutif</h2>
                  <p className="text-[10px] text-slate-500">Mencatat persetujuan oleh pejabat yang disebutkan beserta snapshot kesiapan; ini bukan tanda tangan digital kriptografis.</p>
                </div>
              </div>

              {!selectedAttestation ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                  Pilih atestasi manajemen yang telah disimpan terlebih dahulu.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSignoffRole('CFO')}
                      className={`rounded-xl border p-3 text-xs font-black ${signoffRole === 'CFO' ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}
                    >
                      Persetujuan CFO
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignoffRole('CEO')}
                      className={`rounded-xl border p-3 text-xs font-black ${signoffRole === 'CEO' ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}
                    >
                      Persetujuan CEO
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-3 text-[10px]">
                    <div>
                      <div className="font-black text-slate-500">CFO</div>
                      <div className="mt-1 font-bold text-slate-800">
                        {selectedAttestation.cfoSignOff ? `Signed · ${selectedAttestation.cfoName}` : 'Belum ditandatangani'}
                      </div>
                    </div>
                    <div>
                      <div className="font-black text-slate-500">CEO</div>
                      <div className="mt-1 font-bold text-slate-800">
                        {selectedAttestation.ceoSignOff ? `Signed · ${selectedAttestation.ceoName}` : 'Belum ditandatangani'}
                      </div>
                    </div>
                  </div>

                  <label className="block text-xs font-bold text-slate-700">
                    Nama penandatangan {signoffRole} *
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
                    Saya mengonfirmasi bahwa penandatangan yang disebutkan telah meninjau kesimpulan manajemen, hal-hal yang diungkapkan, dan informasi kesiapan untuk atestasi ini.
                  </label>

                  {!readiness?.ready && !selectedAttestation.readinessOverride && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-800">
                      Persetujuan diblokir selama pemeriksaan kesiapan masih belum terselesaikan, kecuali override kesiapan manajemen telah didokumentasikan secara eksplisit pada form atestasi.
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      disabled={saving || !signatoryName || !declarationConfirmed}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                    >
                      <Signature className="h-4 w-4" /> Catat Persetujuan {signoffRole}
                    </button>
                  </div>
                </div>
              )}
            </form>

            <form id="evidence-form" onSubmit={saveEvidencePack} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <FileArchive className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">4. Paket Evidence Akhir Tahun</h2>
                  <p className="text-[10px] text-slate-500">Mencatat referensi repositori/file evidence aktual; Total ARC tidak membuat lampiran fiktif.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Atestasi manajemen *
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
                    <option value="">Pilih</option>
                    {(data?.attestations || []).map((item: any) => (
                      <option key={item.id} value={item.id}>{item.period} · {displayConclusion(item.overallConclusion)}</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Nama paket *
                  <input required value={evidenceForm.packName} onChange={e => setEvidenceForm({ ...evidenceForm, packName: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Periode *
                  <input required value={evidenceForm.period} onChange={e => setEvidenceForm({ ...evidenceForm, period: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Disiapkan oleh *
                  <input required value={evidenceForm.preparedBy} onChange={e => setEvidenceForm({ ...evidenceForm, preparedBy: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Reviewer
                  <input value={evidenceForm.reviewerName} onChange={e => setEvidenceForm({ ...evidenceForm, reviewerName: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>

                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Referensi indeks evidence *
                  <input required value={evidenceForm.evidenceIndexRef} onChange={e => setEvidenceForm({ ...evidenceForm, evidenceIndexRef: e.target.value })} placeholder="ID repositori/path/referensi dokumen" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>

                {[
                  ['testingSummaryRef', 'Referensi ringkasan pengujian'],
                  ['deficiencySummaryRef', 'Referensi ringkasan defisiensi'],
                  ['remediationSummaryRef', 'Referensi ringkasan remediasi'],
                  ['representationRef', 'Referensi representasi manajemen']
                ].map(([key, label]) => (
                  <label key={key} className="text-xs font-bold text-slate-700">
                    {label}
                    <input value={(evidenceForm as any)[key]} onChange={e => setEvidenceForm({ ...evidenceForm, [key]: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                  </label>
                ))}

                <label className="text-xs font-bold text-slate-700">
                  Status
                  <select value={evidenceForm.status} onChange={e => setEvidenceForm({ ...evidenceForm, status: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                    <option value="Draft">Draft</option>
                    <option value="Under Review">Dalam Reviu</option>
                    <option value="Complete">Lengkap</option>
                    <option value="Archived">Diarsipkan</option>
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Catatan
                  <textarea rows={2} value={evidenceForm.notes} onChange={e => setEvidenceForm({ ...evidenceForm, notes: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>
              </div>

              <div className="mt-4 flex justify-end">
                <button disabled={saving || !(data?.attestations || []).length} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
                  <Save className="h-4 w-4" /> {evidenceForm.id ? 'Perbarui Paket Evidence' : 'Simpan Paket Evidence'}
                </button>
              </div>
            </form>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black text-slate-900">Register Atestasi Manajemen & Evidence</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="space-y-2">
                {(data?.attestations || []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">Belum ada atestasi manajemen yang terdaftar.</div>
                ) : (
                  (data?.attestations || []).map((item: any) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" onClick={() => setSelectedAttestationId(item.id)} className="min-w-0 flex-1 text-left">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${statusTone(item.status)}`}>{displayStatus(item.status)}</span>
                            <span className="text-[9px] font-bold text-slate-400">{item.period}</span>
                          </div>
                          <div className="mt-1 text-xs font-black text-slate-800">{displayConclusion(item.overallConclusion)}</div>
                          <div className="mt-1 text-[10px] text-slate-500">
                            CFO {item.cfoSignOff ? 'ditandatangani' : 'menunggu'} · CEO {item.ceoSignOff ? 'ditandatangani' : 'menunggu'}
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
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">Belum ada paket evidence akhir tahun yang terdaftar.</div>
                ) : (
                  (data?.evidencePacks || []).map((item: any) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${statusTone(item.status)}`}>{displayStatus(item.status)}</span>
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
