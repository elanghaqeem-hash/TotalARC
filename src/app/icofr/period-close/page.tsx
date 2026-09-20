'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Download,
  FileLock2,
  History,
  LockKeyhole,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck
} from 'lucide-react';

const emptyClose = {
  scopeId: '',
  testingCycleId: '',
  attestationId: '',
  period: '',
  closeName: '',
  closeReason: '',
  preparedBy: '',
  reviewerName: '',
  approvedBy: '',
  freezeConfirmed: false
};

const emptyReopen = {
  closeId: '',
  requestedBy: '',
  reason: '',
  impactAssessment: '',
  requestedUntil: ''
};

const emptyReview = {
  requestId: '',
  approvedBy: '',
  decision: 'Approved',
  approvalComments: '',
  reopenedUntil: ''
};

function toLocalDateTimeInput(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toIsoFromLocalInput(value: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function statusTone(status: string) {
  if (['Closed', 'Approved'].includes(status)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'Pending') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'Rejected') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function IcofrPeriodClosePage() {
  const [data, setData] = useState<any>(null);
  const [closeForm, setCloseForm] = useState(emptyClose);
  const [reopenForm, setReopenForm] = useState(emptyReopen);
  const [reviewForm, setReviewForm] = useState(emptyReview);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/icofr/period-close', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Period-close data unavailable.');
      setData(payload);

      const scopeId = payload.scopes?.[0]?.id || '';
      const cycle = payload.cycles?.find((item: any) => item.scopeId === scopeId);
      const attestation = payload.attestations?.find(
        (item: any) => item.scopeId === scopeId && item.cfoSignOff && item.ceoSignOff
      );

      setCloseForm(current => ({
        ...current,
        scopeId: current.scopeId || scopeId,
        testingCycleId: current.testingCycleId || cycle?.id || '',
        attestationId: current.attestationId || attestation?.id || '',
        period: current.period || attestation?.period || ''
      }));

      setReopenForm(current => ({
        ...current,
        closeId: current.closeId || payload.closes?.[0]?.id || ''
      }));

      const pending = payload.reopenRequests?.find((item: any) => item.status === 'Pending');
      setReviewForm(current => ({
        ...current,
        requestId: current.requestId || pending?.id || '',
        reopenedUntil: current.reopenedUntil || (pending?.requestedUntil ? toLocalDateTimeInput(pending.requestedUntil) : '')
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Period-close data unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const scopeCycles = useMemo(
    () => (data?.cycles || []).filter((item: any) => !closeForm.scopeId || item.scopeId === closeForm.scopeId),
    [data, closeForm.scopeId]
  );

  const signedAttestations = useMemo(
    () =>
      (data?.attestations || []).filter(
        (item: any) =>
          (!closeForm.scopeId || item.scopeId === closeForm.scopeId) &&
          item.cfoSignOff &&
          item.ceoSignOff
      ),
    [data, closeForm.scopeId]
  );

  const pendingRequests = useMemo(
    () => (data?.reopenRequests || []).filter((item: any) => item.status === 'Pending'),
    [data]
  );

  const submit = async (actionType: string, payload: any, success: string) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/icofr/period-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType, ...payload })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to process period-close action.');
      setMessage(success);
      await loadData();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process period-close action.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const selectedPending = pendingRequests.find((item: any) => item.id === reviewForm.requestId) || null;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-indigo-600">
              <FileLock2 className="h-4 w-4" /> ICOFR Period Close & Archive
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Period Locking, Versioning & Historical Evidence</h1>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
              Freeze a signed ICOFR period into immutable versioned snapshots, control temporary reopening through maker-checker approval,
              and export Board/Audit Committee PDF or external-auditor Excel evidence from the frozen snapshot.
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
          <Link href="/certification" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Certification & Sign-Off</Link>
          <Link href="/icofr/reporting" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Executive Reporting</Link>
          <Link href="/icofr/testing-plan" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Testing Plan</Link>
          <Link href="/tod" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">ToD</Link>
          <Link href="/toe" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">ToE</Link>
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
          Register an institution before using period-close governance.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ['Closed periods', data?.metrics?.closedPeriods || 0],
              ['Locked', data?.metrics?.lockedPeriods || 0],
              ['Temporarily reopened', data?.metrics?.temporarilyReopened || 0],
              ['Pending reopen', data?.metrics?.pendingReopenRequests || 0],
              ['Snapshot versions', data?.metrics?.snapshotVersions || 0]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                <div className="mt-1 text-xl font-black text-slate-900">{value}</div>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <form
              onSubmit={async e => {
                e.preventDefault();
                const result = await submit(
                  'CLOSE_PERIOD',
                  closeForm,
                  'ICOFR period closed and immutable snapshot version created.'
                );
                if (result) setCloseForm(current => ({ ...current, freezeConfirmed: false }));
              }}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-2">
                <LockKeyhole className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">1. Close / Re-Close Period</h2>
                  <p className="text-[10px] text-slate-500">A signed CFO/CEO attestation is mandatory. Re-closing after approved reopening creates a new immutable snapshot version.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  ICOFR scope *
                  <select
                    required
                    value={closeForm.scopeId}
                    onChange={e => {
                      const scopeId = e.target.value;
                      const cycle = data?.cycles?.find((item: any) => item.scopeId === scopeId);
                      const attestation = data?.attestations?.find(
                        (item: any) => item.scopeId === scopeId && item.cfoSignOff && item.ceoSignOff
                      );
                      setCloseForm({
                        ...closeForm,
                        scopeId,
                        testingCycleId: cycle?.id || '',
                        attestationId: attestation?.id || '',
                        period: attestation?.period || ''
                      });
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
                    value={closeForm.testingCycleId}
                    onChange={e => setCloseForm({ ...closeForm, testingCycleId: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="">No cycle linked</option>
                    {scopeCycles.map((item: any) => <option key={item.id} value={item.id}>{item.cycleName}</option>)}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Signed management attestation *
                  <select
                    required
                    value={closeForm.attestationId}
                    onChange={e => {
                      const item = signedAttestations.find((row: any) => row.id === e.target.value);
                      setCloseForm({ ...closeForm, attestationId: e.target.value, period: item?.period || closeForm.period });
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="">Select signed attestation</option>
                    {signedAttestations.map((item: any) => (
                      <option key={item.id} value={item.id}>{item.period} · {item.overallConclusion} · CFO+CEO signed</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Period *
                  <input required value={closeForm.period} onChange={e => setCloseForm({ ...closeForm, period: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Close name *
                  <input required value={closeForm.closeName} onChange={e => setCloseForm({ ...closeForm, closeName: e.target.value })} placeholder="FY2027 ICOFR Final Close" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>

                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Close rationale *
                  <textarea required rows={3} value={closeForm.closeReason} onChange={e => setCloseForm({ ...closeForm, closeReason: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5" />
                </label>

                <label className="text-xs font-bold text-slate-700">Prepared by *<input required value={closeForm.preparedBy} onChange={e => setCloseForm({ ...closeForm, preparedBy: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Reviewer *<input required value={closeForm.reviewerName} onChange={e => setCloseForm({ ...closeForm, reviewerName: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">Approver *<input required value={closeForm.approvedBy} onChange={e => setCloseForm({ ...closeForm, approvedBy: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>

                <label className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-bold text-rose-800">
                  <input type="checkbox" checked={closeForm.freezeConfirmed} onChange={e => setCloseForm({ ...closeForm, freezeConfirmed: e.target.checked })} />
                  I confirm that this close will freeze the ICOFR period-specific scope/testing/certification records and create an immutable historical snapshot. Enterprise master data can continue for future periods without altering this snapshot.
                </label>
              </div>

              <div className="mt-4 flex justify-end">
                <button disabled={saving || !closeForm.freezeConfirmed} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
                  <Archive className="h-4 w-4" /> Close period & snapshot
                </button>
              </div>
            </form>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <History className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">Closed Period Register</h2>
                  <p className="text-[10px] text-slate-500">Each close retains historical snapshot versions and integrity hashes.</p>
                </div>
              </div>

              {(data?.closes || []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">No ICOFR periods have been closed.</div>
              ) : (
                <div className="space-y-3">
                  {(data?.closes || []).map((item: any) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${item.locked ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                              {item.locked ? 'LOCKED' : 'TEMPORARILY REOPENED'}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-600">v{item.snapshotVersion}</span>
                          </div>
                          <div className="mt-1 text-xs font-black text-slate-900">{item.closeName}</div>
                          <div className="mt-1 text-[10px] text-slate-500">{item.period} · {item.scope?.scopeName || 'Scope unavailable'}</div>
                          <div className="mt-1 text-[9px] text-slate-400">Closed {item.closedAt} · Approver: {item.approvedBy}</div>
                          <div className="mt-1 break-all font-mono text-[8px] text-slate-400">SHA-256 {item.latestSnapshotHash}</div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-1.5">
                          <a href={`/api/icofr/period-close/export?closeId=${encodeURIComponent(item.id)}&format=board-pdf`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[9px] font-bold text-slate-600">
                            <Download className="h-3 w-3" /> Board PDF
                          </a>
                          <a href={`/api/icofr/period-close/export?closeId=${encodeURIComponent(item.id)}&format=evidence-excel`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[9px] font-bold text-slate-600">
                            <Download className="h-3 w-3" /> Auditor Excel
                          </a>
                          <a href={`/api/icofr/period-close/export?closeId=${encodeURIComponent(item.id)}&format=snapshot-json`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[9px] font-bold text-slate-600">
                            <Download className="h-3 w-3" /> JSON
                          </a>
                          <button
                            type="button"
                            onClick={() => setReopenForm({ ...emptyReopen, closeId: item.id })}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[9px] font-bold text-amber-700"
                          >
                            <RotateCcw className="h-3 w-3" /> Request reopen
                          </button>
                        </div>
                      </div>

                      {item.versions?.length > 1 && (
                        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                          {item.versions.map((version: number) => (
                            <a
                              key={version}
                              href={`/api/icofr/period-close/export?closeId=${encodeURIComponent(item.id)}&version=${version}&format=snapshot-json`}
                              className="rounded-full border border-slate-200 px-2 py-1 text-[9px] font-bold text-slate-500"
                            >
                              Snapshot v{version}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <form
              onSubmit={e => {
                e.preventDefault();
                submit(
                  'REQUEST_REOPEN',
                  { ...reopenForm, requestedUntil: toIsoFromLocalInput(reopenForm.requestedUntil) },
                  'Controlled reopen request submitted for independent approval.'
                );
              }}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-amber-600" />
                <div><h2 className="text-sm font-black text-slate-900">2. Controlled Reopen Request</h2><p className="text-[10px] text-slate-500">Reopening is time-bound and cannot be self-approved.</p></div>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-700">
                  Closed period *
                  <select required value={reopenForm.closeId} onChange={e => setReopenForm({ ...reopenForm, closeId: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                    <option value="">Select</option>
                    {(data?.closes || []).map((item: any) => <option key={item.id} value={item.id}>{item.period} · {item.closeName} · v{item.snapshotVersion}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-bold text-slate-700">Requested by *<input required value={reopenForm.requestedBy} onChange={e => setReopenForm({ ...reopenForm, requestedBy: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                <label className="block text-xs font-bold text-slate-700">Reason *<textarea required rows={2} value={reopenForm.reason} onChange={e => setReopenForm({ ...reopenForm, reason: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                <label className="block text-xs font-bold text-slate-700">Impact assessment *<textarea required rows={3} value={reopenForm.impactAssessment} onChange={e => setReopenForm({ ...reopenForm, impactAssessment: e.target.value })} placeholder="Describe records affected, financial-reporting impact and required retesting/re-certification." className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5" /></label>
                <label className="block text-xs font-bold text-slate-700">Requested reopen until *<input type="datetime-local" required value={reopenForm.requestedUntil} onChange={e => setReopenForm({ ...reopenForm, requestedUntil: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              </div>

              <div className="mt-4 flex justify-end">
                <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" /> Submit reopen request</button>
              </div>
            </form>

            <form
              onSubmit={e => {
                e.preventDefault();
                submit(
                  'REVIEW_REOPEN',
                  {
                    ...reviewForm,
                    reopenedUntil:
                      reviewForm.decision === 'Approved'
                        ? toIsoFromLocalInput(reviewForm.reopenedUntil)
                        : ''
                  },
                  `Reopen request ${reviewForm.decision.toLowerCase()}.`
                );
              }}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-600" />
                <div><h2 className="text-sm font-black text-slate-900">3. Reopen Approval</h2><p className="text-[10px] text-slate-500">Independent checker approval creates the temporary write window.</p></div>
              </div>

              {pendingRequests.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">No pending reopen requests.</div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-700">
                    Pending request *
                    <select required value={reviewForm.requestId} onChange={e => {
                      const item = pendingRequests.find((row: any) => row.id === e.target.value);
                      setReviewForm({
                        ...reviewForm,
                        requestId: e.target.value,
                        reopenedUntil: item?.requestedUntil ? toLocalDateTimeInput(item.requestedUntil) : ''
                      });
                    }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                      <option value="">Select</option>
                      {pendingRequests.map((item: any) => <option key={item.id} value={item.id}>{item.requestedBy} · until {item.requestedUntil}</option>)}
                    </select>
                  </label>

                  {selectedPending && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] leading-5 text-slate-600">
                      <div><strong>Reason:</strong> {selectedPending.reason}</div>
                      <div><strong>Impact:</strong> {selectedPending.impactAssessment}</div>
                    </div>
                  )}

                  <label className="block text-xs font-bold text-slate-700">Approver *<input required value={reviewForm.approvedBy} onChange={e => setReviewForm({ ...reviewForm, approvedBy: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                  <label className="block text-xs font-bold text-slate-700">Decision<select value={reviewForm.decision} onChange={e => setReviewForm({ ...reviewForm, decision: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><option>Approved</option><option>Rejected</option></select></label>
                  {reviewForm.decision === 'Approved' && <label className="block text-xs font-bold text-slate-700">Approved reopen until *<input type="datetime-local" required value={reviewForm.reopenedUntil} onChange={e => setReviewForm({ ...reviewForm, reopenedUntil: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>}
                  <label className="block text-xs font-bold text-slate-700">Approval comments<textarea rows={2} value={reviewForm.approvalComments} onChange={e => setReviewForm({ ...reviewForm, approvalComments: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>

                  <div className="flex justify-end">
                    <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" /> Record decision</button>
                  </div>
                </div>
              )}
            </form>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <History className="h-4 w-4 text-brand-600" />
              <div><h2 className="text-sm font-black text-slate-900">Snapshot Integrity Register</h2><p className="text-[10px] text-slate-500">Section-level SHA-256 hashes make each historical snapshot independently verifiable.</p></div>
            </div>
            {(data?.snapshots || []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">No immutable snapshot records yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[1000px] w-full text-[10px]">
                  <thead className="bg-slate-100 text-slate-500"><tr><th className="p-2.5 text-left">Close</th><th className="p-2.5 text-left">Version</th><th className="p-2.5 text-left">Section</th><th className="p-2.5 text-left">Records</th><th className="p-2.5 text-left">SHA-256</th><th className="p-2.5 text-left">Created</th></tr></thead>
                  <tbody>
                    {(data?.snapshots || []).map((item: any) => (
                      <tr key={item.id} className="border-b border-slate-100 align-top">
                        <td className="p-2.5 font-mono text-slate-500">{String(item.closeId).slice(0, 12)}…</td>
                        <td className="p-2.5 font-black text-slate-700">v{item.snapshotVersion}</td>
                        <td className="p-2.5 font-bold text-slate-700">{item.snapshotType}</td>
                        <td className="p-2.5 text-slate-600">{item.recordCount}</td>
                        <td className="max-w-[360px] break-all p-2.5 font-mono text-[8px] text-slate-400">{item.contentHash}</td>
                        <td className="p-2.5 text-slate-500">{item.createdAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
