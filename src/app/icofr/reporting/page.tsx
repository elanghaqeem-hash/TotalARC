'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FileBarChart,
  Link2,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck
} from 'lucide-react';

const emptyReport = {
  id: '',
  scopeId: '',
  testingCycleId: '',
  attestationId: '',
  period: '',
  audience: 'Audit Committee',
  reportTitle: '',
  executiveSummary: '',
  keyControlConclusion: '',
  deficiencySummary: '',
  remediationSummary: '',
  auditRelianceSummary: '',
  decisionsRequired: '',
  preparedBy: '',
  reviewerName: '',
  status: 'Draft'
};

const emptyReliance = {
  id: '',
  period: '',
  auditorName: '',
  scopeId: '',
  controlDomainId: '',
  relianceArea: '',
  plannedReliance: 'Planned Reliance',
  relianceConclusion: 'Not Assessed',
  workpaperReference: '',
  auditorReference: '',
  owner: '',
  reviewerName: '',
  dueDate: '',
  status: 'Planning',
  notes: ''
};

const emptyPbc = {
  id: '',
  period: '',
  requestNo: '',
  auditorName: '',
  category: 'Control Testing',
  description: '',
  relatedType: '',
  relatedId: '',
  owner: '',
  reviewerName: '',
  requestDate: '',
  dueDate: '',
  priority: 'Medium',
  status: 'Open',
  evidenceReference: '',
  responseNotes: ''
};

function statusTone(status: string) {
  if (['Issued', 'Accepted', 'Accepted for Reliance', 'Closed', 'Complete'].includes(status)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (['Submitted', 'In Review', 'Under Review', 'In Progress'].includes(status)) {
    return 'border-sky-200 bg-sky-50 text-sky-700';
  }
  if (['Rejected', 'Overdue', 'No Reliance'].includes(status)) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function IcofrExecutiveReportingPage() {
  const [data, setData] = useState<any>(null);
  const [reportForm, setReportForm] = useState(emptyReport);
  const [relianceForm, setRelianceForm] = useState(emptyReliance);
  const [pbcForm, setPbcForm] = useState(emptyPbc);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/icofr/reporting', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Executive reporting data unavailable.');
      setData(payload);

      const scopeId = payload.scopes?.[0]?.id || '';
      const cycleId = payload.cycles?.find((item: any) => item.scopeId === scopeId)?.id || '';
      const attestationId = payload.attestations?.find((item: any) => !scopeId || item.scopeId === scopeId)?.id || '';
      const controlId = payload.controls?.[0]?.id || '';

      setReportForm(current => ({
        ...current,
        scopeId: current.scopeId || scopeId,
        testingCycleId: current.testingCycleId || cycleId,
        attestationId: current.attestationId || attestationId
      }));

      setRelianceForm(current => ({
        ...current,
        scopeId: current.scopeId || scopeId,
        controlDomainId: current.controlDomainId || controlId
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Executive reporting data unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const reportCycles = useMemo(
    () => (data?.cycles || []).filter((item: any) => !reportForm.scopeId || item.scopeId === reportForm.scopeId),
    [data, reportForm.scopeId]
  );

  const reportAttestations = useMemo(
    () => (data?.attestations || []).filter((item: any) => !reportForm.scopeId || item.scopeId === reportForm.scopeId),
    [data, reportForm.scopeId]
  );

  const relatedOptions = useMemo(
    () => (data?.selectors?.relatedOptions || []).filter((item: any) => !pbcForm.relatedType || item.type === pbcForm.relatedType),
    [data, pbcForm.relatedType]
  );

  const save = async (actionType: string, form: any, setter: (value: any) => void, success: string) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/icofr/reporting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType, ...form })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save record.');
      setter({ ...form, id: payload.id });
      setMessage(success);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save record.');
    } finally {
      setSaving(false);
    }
  };

  const editReport = (item: any) => {
    setReportForm({
      id: item.id || '',
      scopeId: item.scopeId || '',
      testingCycleId: item.testingCycleId || '',
      attestationId: item.attestationId || '',
      period: item.period || '',
      audience: item.audience || 'Audit Committee',
      reportTitle: item.reportTitle || '',
      executiveSummary: item.executiveSummary || '',
      keyControlConclusion: item.keyControlConclusion || '',
      deficiencySummary: item.deficiencySummary || '',
      remediationSummary: item.remediationSummary || '',
      auditRelianceSummary: item.auditRelianceSummary || '',
      decisionsRequired: item.decisionsRequired || '',
      preparedBy: item.preparedBy || '',
      reviewerName: item.reviewerName || '',
      status: item.status || 'Draft'
    });
    document.getElementById('report-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const editReliance = (item: any) => {
    setRelianceForm({
      id: item.id || '',
      period: item.period || '',
      auditorName: item.auditorName || '',
      scopeId: item.scopeId || '',
      controlDomainId: item.controlDomainId || '',
      relianceArea: item.relianceArea || '',
      plannedReliance: item.plannedReliance || 'Planned Reliance',
      relianceConclusion: item.relianceConclusion || 'Not Assessed',
      workpaperReference: item.workpaperReference || '',
      auditorReference: item.auditorReference || '',
      owner: item.owner || '',
      reviewerName: item.reviewerName || '',
      dueDate: item.dueDate || '',
      status: item.status || 'Planning',
      notes: item.notes || ''
    });
    document.getElementById('reliance-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const editPbc = (item: any) => {
    setPbcForm({
      id: item.id || '',
      period: item.period || '',
      requestNo: item.requestNo || '',
      auditorName: item.auditorName || '',
      category: item.category || 'Control Testing',
      description: item.description || '',
      relatedType: item.relatedType || '',
      relatedId: item.relatedId || '',
      owner: item.owner || '',
      reviewerName: item.reviewerName || '',
      requestDate: item.requestDate || '',
      dueDate: item.dueDate || '',
      priority: item.priority || 'Medium',
      status: item.status || 'Open',
      evidenceReference: item.evidenceReference || '',
      responseNotes: item.responseNotes || ''
    });
    document.getElementById('pbc-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const metrics = data?.metrics || {};
  const aging = data?.deficiencyAging || {};

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-sky-600">
              <FileBarChart className="h-4 w-4" /> ICOFR Executive Reporting
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Board Reporting & External Audit Reliance</h1>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
              Executive reporting, deficiency aging, external-auditor reliance and PBC requests are driven by persisted ICOFR testing,
              remediation and certification records. Forms below write directly to Cloudflare D1.
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex self-start items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold">
          <Link href="/icofr/testing-plan" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Testing Plan</Link>
          <Link href="/tod" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">ToD</Link>
          <Link href="/toe" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">ToE</Link>
          <Link href="/icofr/deficiencies" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Deficiencies</Link>
          <Link href="/remediation" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">MAP</Link>
          <Link href="/certification" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Certification</Link>
          <Link href="/tasks" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Task Center</Link>
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
          Register an institution before using ICOFR executive reporting.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            {[
              ['Key Controls', metrics.keyControls || 0],
              ['ToD Concluded', metrics.keyControlsWithTod || 0],
              ['ToE Concluded', metrics.keyControlsWithToe || 0],
              ['Unresolved Significant', metrics.unresolvedSignificantDeficiencies || 0],
              ['Overdue MAP', metrics.overdueMaps || 0],
              ['Overdue PBC', metrics.overduePbc || 0]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                <div className="mt-1 text-xl font-black text-slate-900">{value}</div>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-brand-600" />
                <h2 className="text-sm font-black text-slate-900">Deficiency Aging</h2>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                {[
                  ['0–30', aging.zeroTo30 || 0],
                  ['31–60', aging.thirtyOneTo60 || 0],
                  ['61–90', aging.sixtyOneTo90 || 0],
                  ['90+', aging.over90 || 0]
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-slate-200 p-3">
                    <div className="text-lg font-black text-slate-900">{value}</div>
                    <div className="text-[9px] font-bold text-slate-400">{label} days</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[10px] leading-4 text-slate-500">
                Aging is calculated from actual control-deficiency creation dates for records not resolved through a closed Issue.
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-600" />
                <h2 className="text-sm font-black text-slate-900">Audit & Close Snapshot</h2>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-[10px]">
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-400">Signed attestations</div><div className="mt-1 text-lg font-black">{metrics.signedAttestations || 0}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-400">Issued report packs</div><div className="mt-1 text-lg font-black">{metrics.issuedReportPacks || 0}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-400">Reliance mappings</div><div className="mt-1 text-lg font-black">{metrics.relianceMappings || 0}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-400">Accepted reliance</div><div className="mt-1 text-lg font-black">{metrics.acceptedReliance || 0}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-400">Open PBC</div><div className="mt-1 text-lg font-black">{metrics.openPbc || 0}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-400">Open MAP</div><div className="mt-1 text-lg font-black">{metrics.openMaps || 0}</div></div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <form id="report-form" onSubmit={e => { e.preventDefault(); save('SAVE_REPORT_PACK', reportForm, setReportForm, reportForm.id ? 'Executive report pack updated.' : 'Executive report pack saved.'); }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <FileBarChart className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">1. Executive Report Pack Form</h2>
                  <p className="text-[10px] text-slate-500">For Board, Audit Committee, management, regulator or external-auditor reporting.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">
                  Period *
                  <input required value={reportForm.period} onChange={e => setReportForm({ ...reportForm, period: e.target.value })} placeholder="FY2027" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Audience *
                  <select value={reportForm.audience} onChange={e => setReportForm({ ...reportForm, audience: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                    <option>Board of Directors</option><option>Audit Committee</option><option>Senior Management</option><option>External Auditor</option><option>Regulator</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700">
                  ICOFR scope
                  <select value={reportForm.scopeId} onChange={e => {
                    const scopeId = e.target.value;
                    setReportForm({ ...reportForm, scopeId, testingCycleId: '', attestationId: '' });
                  }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                    <option value="">No specific scope</option>
                    {(data?.scopes || []).map((item: any) => <option key={item.id} value={item.id}>{item.scopeName} · FY{item.fiscalYear}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Testing cycle
                  <select value={reportForm.testingCycleId} onChange={e => setReportForm({ ...reportForm, testingCycleId: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                    <option value="">No cycle linked</option>
                    {reportCycles.map((item: any) => <option key={item.id} value={item.id}>{item.cycleName}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Management attestation
                  <select value={reportForm.attestationId} onChange={e => setReportForm({ ...reportForm, attestationId: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                    <option value="">No attestation linked</option>
                    {reportAttestations.map((item: any) => <option key={item.id} value={item.id}>{item.period} · {item.overallConclusion}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Report title *
                  <input required value={reportForm.reportTitle} onChange={e => setReportForm({ ...reportForm, reportTitle: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>
                {[
                  ['executiveSummary', 'Executive summary *'],
                  ['keyControlConclusion', 'Key control conclusion'],
                  ['deficiencySummary', 'Deficiency summary'],
                  ['remediationSummary', 'Remediation summary'],
                  ['auditRelianceSummary', 'External-audit reliance summary'],
                  ['decisionsRequired', 'Decisions / escalation required']
                ].map(([key, label]) => (
                  <label key={key} className="text-xs font-bold text-slate-700 sm:col-span-2">
                    {label}
                    <textarea required={key === 'executiveSummary'} rows={key === 'executiveSummary' ? 4 : 2} value={(reportForm as any)[key]} onChange={e => setReportForm({ ...reportForm, [key]: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5" />
                  </label>
                ))}
                <label className="text-xs font-bold text-slate-700">
                  Prepared by *
                  <input required value={reportForm.preparedBy} onChange={e => setReportForm({ ...reportForm, preparedBy: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Reviewer
                  <input value={reportForm.reviewerName} onChange={e => setReportForm({ ...reportForm, reviewerName: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Status
                  <select value={reportForm.status} onChange={e => setReportForm({ ...reportForm, status: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                    <option>Draft</option><option>Under Review</option><option>Approved</option><option>Issued</option><option>Archived</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 flex justify-end">
                <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />{reportForm.id ? 'Update report pack' : 'Save report pack'}</button>
              </div>
            </form>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-slate-900">Executive Report Pack Register</h2>
              <div className="mt-4 space-y-2">
                {(data?.reportPacks || []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">No executive report packs registered.</div>
                ) : (data?.reportPacks || []).map((item: any) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div><div className="flex gap-2"><span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${statusTone(item.status)}`}>{item.status}</span><span className="text-[9px] text-slate-400">{item.period} · {item.audience}</span></div><div className="mt-1 text-xs font-black">{item.reportTitle}</div><div className="mt-1 text-[10px] text-slate-500">{item.preparedBy}{item.reviewerName ? ` · Reviewer: ${item.reviewerName}` : ''}</div></div>
                      <button type="button" onClick={() => editReport(item)} className="rounded-lg border border-slate-200 p-2 text-slate-500"><Pencil className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <form id="reliance-form" onSubmit={e => { e.preventDefault(); save('SAVE_RELIANCE', relianceForm, setRelianceForm, relianceForm.id ? 'Audit reliance mapping updated.' : 'Audit reliance mapping saved.'); }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-brand-600" />
                <div><h2 className="text-sm font-black text-slate-900">2. External Audit Reliance Mapping</h2><p className="text-[10px] text-slate-500">Links external-auditor reliance directly to an ICOFR control and its actual ToD/ToE evidence.</p></div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">Period *<input required value={relianceForm.period} onChange={e => setRelianceForm({ ...relianceForm, period: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">External auditor *<input required value={relianceForm.auditorName} onChange={e => setRelianceForm({ ...relianceForm, auditorName: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">ICOFR control *<select required value={relianceForm.controlDomainId} onChange={e => setRelianceForm({ ...relianceForm, controlDomainId: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><option value="">Select control</option>{(data?.controls || []).map((item: any) => <option key={item.id} value={item.id}>{item.category} · {item.controlCode} · {item.name}</option>)}</select></label>
                <label className="text-xs font-bold text-slate-700">Reliance area *<select required value={relianceForm.relianceArea} onChange={e => setRelianceForm({ ...relianceForm, relianceArea: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><option value="">Select</option><option>Control Design</option><option>Operating Effectiveness</option><option>ITGC</option><option>ITAC</option><option>IPE / EUC</option><option>Management Review Control</option></select></label>
                <label className="text-xs font-bold text-slate-700">Planned reliance *<select value={relianceForm.plannedReliance} onChange={e => setRelianceForm({ ...relianceForm, plannedReliance: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><option>Planned Reliance</option><option>Potential Reliance</option><option>No Reliance</option><option>To Be Determined</option></select></label>
                <label className="text-xs font-bold text-slate-700">Reliance conclusion<select value={relianceForm.relianceConclusion} onChange={e => setRelianceForm({ ...relianceForm, relianceConclusion: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><option>Not Assessed</option><option>Rely</option><option>Partial Reliance</option><option>No Reliance</option></select></label>
                <label className="text-xs font-bold text-slate-700">Status<select value={relianceForm.status} onChange={e => setRelianceForm({ ...relianceForm, status: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><option>Planning</option><option>Evidence Requested</option><option>Under Review</option><option>Accepted for Reliance</option><option>No Reliance</option><option>Closed</option></select></label>
                <label className="text-xs font-bold text-slate-700">Owner *<input required value={relianceForm.owner} onChange={e => setRelianceForm({ ...relianceForm, owner: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Reviewer<input value={relianceForm.reviewerName} onChange={e => setRelianceForm({ ...relianceForm, reviewerName: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Due date<input type="date" value={relianceForm.dueDate} onChange={e => setRelianceForm({ ...relianceForm, dueDate: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Workpaper reference<input value={relianceForm.workpaperReference} onChange={e => setRelianceForm({ ...relianceForm, workpaperReference: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Auditor reference<input value={relianceForm.auditorReference} onChange={e => setRelianceForm({ ...relianceForm, auditorReference: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">Notes<textarea rows={2} value={relianceForm.notes} onChange={e => setRelianceForm({ ...relianceForm, notes: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              </div>
              <div className="mt-4 flex justify-end"><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />{relianceForm.id ? 'Update reliance' : 'Save reliance'}</button></div>
            </form>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-slate-900">External Audit Reliance Register</h2>
              <div className="mt-4 space-y-2">
                {(data?.relianceMappings || []).length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">No reliance mappings registered.</div> :
                  (data?.relianceMappings || []).map((item: any) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${statusTone(item.status)}`}>{item.status}</span><span className="text-[9px] text-slate-400">{item.period} · {item.auditorName}</span></div><div className="mt-1 text-xs font-black">{item.control?.category} · {item.control?.controlCode} · {item.control?.name}</div><div className="mt-1 text-[10px] text-slate-500">{item.relianceArea} · {item.plannedReliance} · {item.relianceConclusion}</div><div className="mt-1 text-[9px] text-slate-400">ToD: {item.tod?.conclusion || 'Not available'} · ToE: {item.toe?.finalConclusion || 'Not available'}</div></div>
                        <button type="button" onClick={() => editReliance(item)} className="rounded-lg border border-slate-200 p-2 text-slate-500"><Pencil className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <form id="pbc-form" onSubmit={e => { e.preventDefault(); save('SAVE_PBC', pbcForm, setPbcForm, pbcForm.id ? 'PBC request updated.' : 'PBC request saved and exposed to Task Center.'); }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2"><ClipboardList className="h-4 w-4 text-brand-600" /><div><h2 className="text-sm font-black text-slate-900">3. PBC / Evidence Request Tracker</h2><p className="text-[10px] text-slate-500">Open requests flow into Task Center with owner, priority, due date and direct source link.</p></div></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">Period *<input required value={pbcForm.period} onChange={e => setPbcForm({ ...pbcForm, period: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Request No. *<input required value={pbcForm.requestNo} onChange={e => setPbcForm({ ...pbcForm, requestNo: e.target.value.toUpperCase() })} placeholder="PBC-001" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal uppercase" /></label>
                <label className="text-xs font-bold text-slate-700">External auditor *<input required value={pbcForm.auditorName} onChange={e => setPbcForm({ ...pbcForm, auditorName: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Category *<select value={pbcForm.category} onChange={e => setPbcForm({ ...pbcForm, category: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><option>Control Testing</option><option>Scoping</option><option>Account / Assertion</option><option>ITGC / ITAC</option><option>IPE / EUC</option><option>Deficiency / MAP</option><option>Certification</option><option>Other</option></select></label>
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">Request description *<textarea required rows={3} value={pbcForm.description} onChange={e => setPbcForm({ ...pbcForm, description: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5" /></label>
                <label className="text-xs font-bold text-slate-700">Related record type<select value={pbcForm.relatedType} onChange={e => setPbcForm({ ...pbcForm, relatedType: e.target.value, relatedId: '' })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><option value="">None / Other</option><option>ICOFR Control</option><option>ToD</option><option>ToE</option><option>Deficiency</option><option>MAP</option><option>Attestation</option><option>Evidence Pack</option></select></label>
                <label className="text-xs font-bold text-slate-700">Related record<select value={pbcForm.relatedId} onChange={e => setPbcForm({ ...pbcForm, relatedId: e.target.value })} disabled={!pbcForm.relatedType} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50"><option value="">Select</option>{relatedOptions.map((item: any) => <option key={item.type + item.id} value={item.id}>{item.label}</option>)}</select></label>
                <label className="text-xs font-bold text-slate-700">Owner *<input required value={pbcForm.owner} onChange={e => setPbcForm({ ...pbcForm, owner: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Reviewer<input value={pbcForm.reviewerName} onChange={e => setPbcForm({ ...pbcForm, reviewerName: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Request date *<input type="date" required value={pbcForm.requestDate} onChange={e => setPbcForm({ ...pbcForm, requestDate: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Due date *<input type="date" required value={pbcForm.dueDate} onChange={e => setPbcForm({ ...pbcForm, dueDate: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Priority<select value={pbcForm.priority} onChange={e => setPbcForm({ ...pbcForm, priority: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label>
                <label className="text-xs font-bold text-slate-700">Status<select value={pbcForm.status} onChange={e => setPbcForm({ ...pbcForm, status: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><option>Open</option><option>In Progress</option><option>Submitted</option><option>Accepted</option><option>Closed</option><option>Cancelled</option></select></label>
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">Evidence reference<input value={pbcForm.evidenceReference} onChange={e => setPbcForm({ ...pbcForm, evidenceReference: e.target.value })} placeholder="Repository/path/reference ID; required before Submitted/Accepted/Closed" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">Response notes<textarea rows={2} value={pbcForm.responseNotes} onChange={e => setPbcForm({ ...pbcForm, responseNotes: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              </div>
              <div className="mt-4 flex justify-end"><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />{pbcForm.id ? 'Update PBC request' : 'Save PBC request'}</button></div>
            </form>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-slate-900">PBC Request Register</h2>
              <div className="mt-4 space-y-2">
                {(data?.pbcRequests || []).length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">No PBC requests registered.</div> :
                  (data?.pbcRequests || []).map((item: any) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${statusTone(item.status)}`}>{item.status}</span><span className="text-[9px] text-slate-400">{item.requestNo} · {item.period}</span></div><div className="mt-1 text-xs font-black">{item.description}</div><div className="mt-1 text-[10px] text-slate-500">Owner: {item.owner} · Due: {item.dueDate} · {item.priority}</div>{item.evidenceReference && <div className="mt-1 font-mono text-[9px] text-slate-400">{item.evidenceReference}</div>}</div>
                        <button type="button" onClick={() => editPbc(item)} className="rounded-lg border border-slate-200 p-2 text-slate-500"><Pencil className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
