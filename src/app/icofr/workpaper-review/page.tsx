'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  FileCheck,
  FileSearch,
  MessageSquareWarning,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Trash2
} from 'lucide-react';

const emptyReview = {
  id: '',
  workpaperType: 'ToD',
  workpaperId: '',
  preparedBy: '',
  reviewerName: '',
  scopeObjectiveComplete: false,
  proceduresComplete: false,
  evidenceIndexed: false,
  exceptionsEvaluated: false,
  crossReferencesComplete: false,
  conclusionSupported: false,
  preparerConclusion: 'Not Assessed',
  preparerNotes: ''
};

const emptyEvidence = {
  id: '',
  reviewId: '',
  evidenceRef: '',
  evidenceType: '',
  description: '',
  source: '',
  owner: ''
};

const emptyNote = {
  reviewId: '',
  title: '',
  description: '',
  severity: 'Medium',
  raisedBy: '',
  owner: '',
  dueDate: ''
};

function badge(value: string) {
  if (['Approved', 'Accepted', 'Cleared', 'Effective'].includes(value)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (['Under Review', 'Responded', 'Partially Effective'].includes(value)) {
    return 'border-sky-200 bg-sky-50 text-sky-700';
  }
  if (['Draft', 'Pending', 'Returned', 'Waived'].includes(value)) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  if (['Rejected', 'Ineffective', 'Critical', 'High'].includes(value)) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function WorkpaperReviewPage() {
  const [data, setData] = useState<any>(null);
  const [selectedReviewId, setSelectedReviewId] = useState('');
  const [reviewForm, setReviewForm] = useState(emptyReview);
  const [evidenceForm, setEvidenceForm] = useState(emptyEvidence);
  const [noteForm, setNoteForm] = useState(emptyNote);
  const [decision, setDecision] = useState('Approve');
  const [decisionReviewer, setDecisionReviewer] = useState('');
  const [decisionConclusion, setDecisionConclusion] = useState('Effective');
  const [decisionComments, setDecisionComments] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async (force = false) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/icofr/workpaper-review', {
        cache: force ? 'no-store' : 'default'
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Workpaper review data unavailable.');
      setData(body);

      const reviewId =
        selectedReviewId && body.reviews?.some((item: any) => item.id === selectedReviewId)
          ? selectedReviewId
          : body.reviews?.[0]?.id || '';
      setSelectedReviewId(reviewId);

      setReviewForm(current => ({
        ...current,
        workpaperId:
          current.workpaperId ||
          body.workpapers?.find((item: any) => item.workpaperType === current.workpaperType)?.workpaperId ||
          ''
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workpaper review data unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const post = async (payload: any, success: string) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/icofr/workpaper-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to process workpaper review action.');
      setMessage(success);
      await load(true);
      return body;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process workpaper review action.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const selectedReview = useMemo(
    () => data?.reviews?.find((item: any) => item.id === selectedReviewId) || null,
    [data, selectedReviewId]
  );

  const workpapersForType = useMemo(
    () => (data?.workpapers || []).filter((item: any) => item.workpaperType === reviewForm.workpaperType),
    [data, reviewForm.workpaperType]
  );

  const filteredReviews = useMemo(() => {
    return (data?.reviews || []).filter((item: any) => {
      if (filter === 'ALL') return true;
      return item.status === filter;
    });
  }, [data, filter]);

  const editReview = (item: any) => {
    setSelectedReviewId(item.id);
    setReviewForm({
      id: item.id,
      workpaperType: item.workpaperType,
      workpaperId: item.workpaperId,
      preparedBy: item.preparedBy || '',
      reviewerName: item.reviewerName || '',
      scopeObjectiveComplete: Boolean(item.scopeObjectiveComplete),
      proceduresComplete: Boolean(item.proceduresComplete),
      evidenceIndexed: Boolean(item.evidenceIndexed),
      exceptionsEvaluated: Boolean(item.exceptionsEvaluated),
      crossReferencesComplete: Boolean(item.crossReferencesComplete),
      conclusionSupported: Boolean(item.conclusionSupported),
      preparerConclusion: item.preparerConclusion || 'Not Assessed',
      preparerNotes: item.preparerNotes || ''
    });
    setDecisionReviewer(item.reviewerName || '');
    setDecisionConclusion(
      item.reviewerConclusion && item.reviewerConclusion !== 'Not Assessed'
        ? item.reviewerConclusion
        : item.preparerConclusion && item.preparerConclusion !== 'Not Assessed'
          ? item.preparerConclusion
          : 'Effective'
    );
    setEvidenceForm({ ...emptyEvidence, reviewId: item.id });
    setNoteForm({ ...emptyNote, reviewId: item.id, raisedBy: item.reviewerName || '' });
  };

  const chooseNewReview = (type = 'ToD') => {
    const workpaper = (data?.workpapers || []).find(
      (item: any) => item.workpaperType === type && !item.review
    );
    setReviewForm({
      ...emptyReview,
      workpaperType: type,
      workpaperId: workpaper?.workpaperId || ''
    });
    setSelectedReviewId('');
  };

  const activeWorkpaper = data?.workpapers?.find(
    (item: any) =>
      item.workpaperType === reviewForm.workpaperType &&
      item.workpaperId === reviewForm.workpaperId
  );

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-violet-600">
              <ShieldCheck className="h-4 w-4" /> ICOFR Workpaper Review & Quality Gates
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">
              Prepared-by / Reviewed-by, Review Notes & Supervisory Clearance
            </h1>
            <p className="mt-1 max-w-5xl text-xs leading-5 text-slate-500">
              Govern ToD and ToE workpapers with preparation checklists, evidence indexing, independent evidence review,
              supervisory review notes, response/clearance workflow and deterministic quality gates before final approval.
              Final conclusions remain explicit human decisions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold">
          <Link href="/icofr/testing-plan" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Testing Plan</Link>
          <Link href="/tod" className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">ToD</Link>
          <Link href="/toe" className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">ToE</Link>
          <Link href="/icofr/sampling-evidence" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Sampling & Evidence</Link>
          <Link href="/icofr/deficiencies" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Deficiencies</Link>
          <Link href="/certification" className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">Certification</Link>
        </div>
      </section>

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
          Register an institution and launch ToD/ToE workpapers before using supervisory review.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {[
              ['Workpapers', data?.metrics?.workpapers || 0],
              ['Reviews', data?.metrics?.reviews || 0],
              ['Draft', data?.metrics?.draft || 0],
              ['Under review', data?.metrics?.underReview || 0],
              ['Returned', data?.metrics?.returned || 0],
              ['Approved', data?.metrics?.approved || 0],
              ['Open review notes', data?.metrics?.unresolvedReviewNotes || 0],
              ['Ready for approval', data?.metrics?.readyForApproval || 0]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-[8px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                <div className="mt-1 text-xl font-black text-slate-900">{value}</div>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <form
              onSubmit={async event => {
                event.preventDefault();
                const result = await post(
                  { actionType: 'SAVE_REVIEW', ...reviewForm },
                  reviewForm.id ? 'Workpaper preparation review updated.' : 'Workpaper preparation review created.'
                );
                if (result?.id) {
                  setSelectedReviewId(result.id);
                  setReviewForm(current => ({ ...current, id: result.id }));
                  setEvidenceForm({ ...emptyEvidence, reviewId: result.id });
                  setNoteForm({ ...emptyNote, reviewId: result.id, raisedBy: result.reviewerName || '' });
                }
              }}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-brand-600" />
                  <div>
                    <h2 className="text-sm font-black text-slate-900">1. Workpaper Preparation & Completeness</h2>
                    <p className="text-[10px] text-slate-500">Active form persisted to Cloudflare D1.</p>
                  </div>
                </div>
                {reviewForm.id && (
                  <button type="button" onClick={() => chooseNewReview(reviewForm.workpaperType)} className="text-[10px] font-bold text-slate-500">
                    New review
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">
                  Workpaper type *
                  <select
                    value={reviewForm.workpaperType}
                    disabled={!!reviewForm.id}
                    onChange={event => {
                      const type = event.target.value;
                      const first = (data?.workpapers || []).find((item: any) => item.workpaperType === type && !item.review);
                      setReviewForm({ ...reviewForm, workpaperType: type, workpaperId: first?.workpaperId || '' });
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50"
                  >
                    <option>ToD</option>
                    <option>ToE</option>
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Workpaper *
                  <select
                    required
                    value={reviewForm.workpaperId}
                    disabled={!!reviewForm.id}
                    onChange={event => setReviewForm({ ...reviewForm, workpaperId: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50"
                  >
                    <option value="">Select workpaper</option>
                    {workpapersForType.map((item: any) => (
                      <option key={item.workpaperId} value={item.workpaperId} disabled={Boolean(item.review) && item.review.id !== reviewForm.id}>
                        {item.workpaperRef} · {item.control?.controlCode || item.control?.controlId || 'Control'} · {item.period}
                      </option>
                    ))}
                  </select>
                </label>

                {activeWorkpaper && (
                  <div className="sm:col-span-2 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] text-slate-600 md:grid-cols-4">
                    <div><strong>Control</strong><br />{activeWorkpaper.control?.controlCode || activeWorkpaper.control?.controlId || '—'}</div>
                    <div><strong>Source status</strong><br />{activeWorkpaper.sourceStatus || '—'}</div>
                    <div><strong>Source conclusion</strong><br />{activeWorkpaper.sourceConclusion || '—'}</div>
                    <div><strong>Testing cycle</strong><br />{activeWorkpaper.cycle?.cycleName || 'Not linked'}</div>
                  </div>
                )}

                <label className="text-xs font-bold text-slate-700">
                  Prepared by *
                  <input
                    required
                    value={reviewForm.preparedBy}
                    disabled={selectedReview?.status === 'Approved'}
                    onChange={event => setReviewForm({ ...reviewForm, preparedBy: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Independent reviewer *
                  <input
                    value={reviewForm.reviewerName}
                    disabled={selectedReview?.status === 'Approved'}
                    onChange={event => setReviewForm({ ...reviewForm, reviewerName: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Preparer conclusion *
                  <select
                    value={reviewForm.preparerConclusion}
                    disabled={selectedReview?.status === 'Approved'}
                    onChange={event => setReviewForm({ ...reviewForm, preparerConclusion: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50"
                  >
                    <option>Not Assessed</option>
                    {(data?.conclusions || []).map((item: string) => <option key={item}>{item}</option>)}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Preparer notes / basis
                  <textarea
                    rows={3}
                    value={reviewForm.preparerNotes}
                    disabled={selectedReview?.status === 'Approved'}
                    onChange={event => setReviewForm({ ...reviewForm, preparerNotes: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50"
                  />
                </label>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  ['scopeObjectiveComplete', 'Scope and testing objective are complete'],
                  ['proceduresComplete', 'Testing procedures are complete and documented'],
                  ['evidenceIndexed', 'Evidence is cross-referenced in the evidence index'],
                  ['exceptionsEvaluated', 'Exceptions / deviations have been evaluated'],
                  ['crossReferencesComplete', 'RCM, risk, control and supporting references are complete'],
                  ['conclusionSupported', 'Preparer conclusion is supported by the documented work']
                ].map(([key, label]) => (
                  <label key={key} className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-[11px] font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean((reviewForm as any)[key])}
                      disabled={selectedReview?.status === 'Approved'}
                      onChange={event => setReviewForm({ ...reviewForm, [key]: event.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  disabled={saving || selectedReview?.status === 'Approved'}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-700 disabled:opacity-40"
                >
                  <Save className="h-4 w-4" /> Save draft
                </button>
                {reviewForm.id && selectedReview?.status !== 'Approved' && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void post({ actionType: 'SUBMIT_REVIEW', reviewId: reviewForm.id }, 'Workpaper submitted for independent review.')}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" /> Submit for review
                  </button>
                )}
              </div>
            </form>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black text-slate-900">Workpaper Review Register</h2>
                  <p className="mt-1 text-[10px] text-slate-500">Open a review to manage evidence, review notes and final supervisory decision.</p>
                </div>
                <select value={filter} onChange={event => setFilter(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px]">
                  <option value="ALL">All</option>
                  <option>Draft</option>
                  <option>Under Review</option>
                  <option>Returned</option>
                  <option>Approved</option>
                </select>
              </div>

              {filteredReviews.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                  No review records for this filter.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {filteredReviews.map((item: any) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => editReview(item)}
                      className={`w-full rounded-xl border p-3 text-left ${
                        selectedReviewId === item.id ? 'border-violet-300 bg-violet-50/40' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap gap-1.5">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${badge(item.status)}`}>{item.status}</span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-600">{item.workpaperType}</span>
                          </div>
                          <div className="mt-1 font-mono text-[10px] font-bold text-violet-700">{item.source?.workpaperRef || item.workpaperId}</div>
                          <div className="text-xs font-black text-slate-900">{item.source?.control?.name || 'Workpaper'}</div>
                          <div className="mt-1 text-[9px] text-slate-500">Prepared: {item.preparedBy} · Reviewer: {item.reviewerName || 'Unassigned'}</div>
                        </div>
                        <div className="text-right text-[9px] text-slate-400">
                          <div>{item.qualityGate?.counts?.evidence || 0} evidence</div>
                          <div>{item.qualityGate?.counts?.unresolvedNotes || 0} open notes</div>
                          <div className={item.qualityGate?.passed ? 'font-bold text-emerald-600' : 'font-bold text-amber-600'}>
                            {item.qualityGate?.passed ? 'Gate ready' : 'Gate pending'}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          {selectedReview && (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${badge(selectedReview.status)}`}>{selectedReview.status}</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-600">{selectedReview.workpaperType}</span>
                    </div>
                    <h2 className="mt-1 text-lg font-black text-slate-900">
                      {selectedReview.source?.workpaperRef} · {selectedReview.source?.control?.name || 'Workpaper'}
                    </h2>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {selectedReview.period} · Prepared by {selectedReview.preparedBy} · Reviewer {selectedReview.reviewerName || 'not assigned'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px]">
                    <div className="font-black text-slate-700">Quality gate</div>
                    <div className={selectedReview.qualityGate?.passed ? 'mt-1 font-black text-emerald-700' : 'mt-1 font-black text-amber-700'}>
                      {selectedReview.qualityGate?.passed ? 'READY FOR APPROVAL' : 'REQUIRES ACTION'}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {(selectedReview.qualityGate?.gates || []).map((gate: any) => (
                    <div key={gate.key} className={`rounded-xl border p-3 ${gate.passed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                      <div className="flex items-center gap-2 text-[10px] font-black">
                        {gate.passed ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <AlertCircle className="h-3.5 w-3.5 text-amber-600" />}
                        {gate.label}
                      </div>
                      <div className="mt-1 text-[9px] leading-4 text-slate-600">{gate.detail}</div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <form
                  onSubmit={async event => {
                    event.preventDefault();
                    const result = await post(
                      { actionType: 'SAVE_EVIDENCE', ...evidenceForm, reviewId: selectedReview.id },
                      evidenceForm.id ? 'Evidence-index record updated.' : 'Evidence-index record added.'
                    );
                    if (result) setEvidenceForm({ ...emptyEvidence, reviewId: selectedReview.id });
                  }}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="mb-4 flex items-center gap-2">
                    <FileSearch className="h-4 w-4 text-brand-600" />
                    <div>
                      <h2 className="text-sm font-black text-slate-900">2. Workpaper Evidence Index</h2>
                      <p className="text-[10px] text-slate-500">Reference supporting evidence; do not upload fake/sample evidence.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700">
                      Evidence reference *
                      <input required value={evidenceForm.evidenceRef} onChange={event => setEvidenceForm({ ...evidenceForm, evidenceRef: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Evidence type *
                      <input required value={evidenceForm.evidenceType} onChange={event => setEvidenceForm({ ...evidenceForm, evidenceType: event.target.value })} placeholder="Report / screenshot / approval / configuration / reconciliation" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Description *
                      <textarea required rows={2} value={evidenceForm.description} onChange={event => setEvidenceForm({ ...evidenceForm, description: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Source
                      <input value={evidenceForm.source} onChange={event => setEvidenceForm({ ...evidenceForm, source: event.target.value })} placeholder="System / repository / owner" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Evidence owner *
                      <input required value={evidenceForm.owner} onChange={event => setEvidenceForm({ ...evidenceForm, owner: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button disabled={saving || selectedReview.status === 'Approved'} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">
                      <Save className="h-4 w-4" /> Save evidence
                    </button>
                  </div>

                  <div className="mt-5 space-y-2">
                    {(selectedReview.evidence || []).map((item: any) => (
                      <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-mono text-[10px] font-bold text-brand-700">{item.evidenceRef}</div>
                            <div className="text-[11px] font-bold text-slate-800">{item.evidenceType} · {item.description}</div>
                            <div className="mt-1 text-[9px] text-slate-500">Owner: {item.owner} · Source: {item.source || '—'}</div>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${badge(item.reviewerDecision)}`}>{item.reviewerDecision}</span>
                        </div>
                        {selectedReview.status !== 'Approved' && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {['Accepted', 'Rejected'].map(itemDecision => (
                              <button
                                type="button"
                                key={itemDecision}
                                disabled={saving || !selectedReview.reviewerName}
                                onClick={() => {
                                  const notes =
                                    itemDecision === 'Rejected'
                                      ? window.prompt('Reviewer notes for rejected evidence') || ''
                                      : window.prompt('Reviewer notes (optional)') || '';
                                  void post(
                                    {
                                      actionType: 'REVIEW_EVIDENCE',
                                      evidenceId: item.id,
                                      reviewerDecision: itemDecision,
                                      reviewerName: selectedReview.reviewerName,
                                      reviewerNotes: notes
                                    },
                                    'Evidence review decision saved.'
                                  );
                                }}
                                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[9px] font-bold text-slate-600 disabled:opacity-40"
                              >
                                {itemDecision}
                              </button>
                            ))}
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => {
                                setEvidenceForm({
                                  id: item.id,
                                  reviewId: selectedReview.id,
                                  evidenceRef: item.evidenceRef,
                                  evidenceType: item.evidenceType,
                                  description: item.description,
                                  source: item.source || '',
                                  owner: item.owner
                                });
                              }}
                              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[9px] font-bold text-slate-600"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => window.confirm('Remove this evidence-index record?') && void post({ actionType: 'REMOVE_EVIDENCE', id: item.id }, 'Evidence-index record removed.')}
                              className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-[9px] font-bold text-rose-600"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </form>

                <form
                  onSubmit={async event => {
                    event.preventDefault();
                    const result = await post(
                      { actionType: 'CREATE_REVIEW_NOTE', ...noteForm, reviewId: selectedReview.id },
                      'Supervisory review note created.'
                    );
                    if (result) setNoteForm({ ...emptyNote, reviewId: selectedReview.id, raisedBy: selectedReview.reviewerName || '' });
                  }}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="mb-4 flex items-center gap-2">
                    <MessageSquareWarning className="h-4 w-4 text-amber-600" />
                    <div>
                      <h2 className="text-sm font-black text-slate-900">3. Supervisory Review Notes</h2>
                      <p className="text-[10px] text-slate-500">Open → Responded → Cleared/Waived. Unresolved notes block approval.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Review point title *
                      <input required value={noteForm.title} onChange={event => setNoteForm({ ...noteForm, title: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Review point / required action *
                      <textarea required rows={3} value={noteForm.description} onChange={event => setNoteForm({ ...noteForm, description: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Severity
                      <select value={noteForm.severity} onChange={event => setNoteForm({ ...noteForm, severity: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                        {(data?.noteSeverities || []).map((item: string) => <option key={item}>{item}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Due date
                      <input type="date" value={noteForm.dueDate} onChange={event => setNoteForm({ ...noteForm, dueDate: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Raised by reviewer *
                      <input required value={noteForm.raisedBy} onChange={event => setNoteForm({ ...noteForm, raisedBy: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Assigned owner *
                      <input required value={noteForm.owner} onChange={event => setNoteForm({ ...noteForm, owner: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button disabled={saving || selectedReview.status === 'Approved'} className="rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">
                      Create review note
                    </button>
                  </div>

                  <div className="mt-5 space-y-2">
                    {(selectedReview.notes || []).map((item: any) => (
                      <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-mono text-[10px] font-bold text-amber-700">{item.noteNo}</div>
                            <div className="text-[11px] font-black text-slate-800">{item.title}</div>
                            <div className="mt-1 text-[10px] leading-4 text-slate-600">{item.description}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${badge(item.severity)}`}>{item.severity}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${badge(item.status)}`}>{item.status}</span>
                          </div>
                        </div>
                        <div className="mt-2 text-[9px] text-slate-500">
                          Reviewer: {item.raisedBy} · Owner: {item.owner} · Due: {item.dueDate || '—'}
                        </div>
                        {item.response && <div className="mt-2 rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600"><strong>Response:</strong> {item.response}</div>}
                        {item.clearanceComment && <div className="mt-2 rounded-lg bg-emerald-50 p-2 text-[10px] text-emerald-700"><strong>{item.clearanceDecision}:</strong> {item.clearanceComment}</div>}
                        {selectedReview.status !== 'Approved' && (
                          <div className="mt-2 flex gap-1.5">
                            {item.status === 'Open' && (
                              <button
                                type="button"
                                onClick={() => {
                                  const response = window.prompt('Owner response to review note') || '';
                                  if (!response) return;
                                  void post(
                                    {
                                      actionType: 'RESPOND_REVIEW_NOTE',
                                      noteId: item.id,
                                      response,
                                      responseBy: item.owner
                                    },
                                    'Review-note response saved.'
                                  );
                                }}
                                className="rounded-lg border border-sky-200 px-2.5 py-1.5 text-[9px] font-bold text-sky-700"
                              >
                                Respond
                              </button>
                            )}
                            {item.status === 'Responded' && (
                              <>
                                {['Cleared', 'Waived'].map(clearance => (
                                  <button
                                    type="button"
                                    key={clearance}
                                    onClick={() => {
                                      const comment = window.prompt(`${clearance} comment / basis`) || '';
                                      if (!comment) return;
                                      void post(
                                        {
                                          actionType: 'CLEAR_REVIEW_NOTE',
                                          noteId: item.id,
                                          clearedBy: selectedReview.reviewerName,
                                          clearanceDecision: clearance,
                                          clearanceComment: comment
                                        },
                                        `Review note ${clearance.toLowerCase()}.`
                                      );
                                    }}
                                    className="rounded-lg border border-emerald-200 px-2.5 py-1.5 text-[9px] font-bold text-emerald-700"
                                  >
                                    {clearance}
                                  </button>
                                ))}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </form>
              </div>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-emerald-600" />
                  <div>
                    <h2 className="text-sm font-black text-slate-900">4. Supervisory Decision</h2>
                    <p className="text-[10px] text-slate-500">
                      Approval requires all quality gates. Returning a workpaper requires reviewer comments.
                    </p>
                  </div>
                </div>

                {selectedReview.status === 'Approved' ? (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-700">
                    <strong>Approved.</strong> Reviewer conclusion: {selectedReview.reviewerConclusion}. Reviewed at {selectedReview.reviewedAt ? new Date(selectedReview.reviewedAt).toLocaleString('id-ID') : '—'}.
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                    <label className="text-xs font-bold text-slate-700">
                      Decision *
                      <select value={decision} onChange={event => setDecision(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                        <option>Approve</option>
                        <option>Return</option>
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Reviewer *
                      <input value={decisionReviewer} onChange={event => setDecisionReviewer(event.target.value)} placeholder={selectedReview.reviewerName || 'Assigned reviewer'} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                    {decision === 'Approve' && (
                      <label className="text-xs font-bold text-slate-700">
                        Final reviewer conclusion *
                        <select value={decisionConclusion} onChange={event => setDecisionConclusion(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                          {(data?.conclusions || []).map((item: string) => <option key={item}>{item}</option>)}
                        </select>
                      </label>
                    )}
                    <label className={`text-xs font-bold text-slate-700 ${decision === 'Return' ? 'md:col-span-2' : ''}`}>
                      Reviewer comments {decision === 'Return' ? '*' : ''}
                      <input value={decisionComments} onChange={event => setDecisionComments(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                    <div className="md:col-span-4 flex justify-end">
                      <button
                        type="button"
                        disabled={
                          saving ||
                          !decisionReviewer ||
                          !['Under Review', 'Returned', 'Submitted'].includes(selectedReview.status) ||
                          (decision === 'Approve' && !selectedReview.qualityGate?.passed) ||
                          (decision === 'Return' && !decisionComments)
                        }
                        onClick={() =>
                          void post(
                            {
                              actionType: 'DECIDE_REVIEW',
                              reviewId: selectedReview.id,
                              reviewerName: decisionReviewer,
                              decision,
                              reviewerConclusion: decision === 'Approve' ? decisionConclusion : 'Not Assessed',
                              reviewerComments: decisionComments
                            },
                            decision === 'Approve'
                              ? 'Workpaper passed supervisory quality gates and was approved.'
                              : 'Workpaper returned to preparer for rework.'
                          )
                        }
                        className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-black text-white disabled:opacity-40"
                      >
                        Record {decision}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-black text-slate-900">Unresolved Review Point Dashboard</h2>
                <p className="mt-1 text-[10px] text-slate-500">Cross-workpaper supervisory review points still requiring response or clearance.</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-[900px] w-full text-[10px]">
                    <thead className="bg-slate-100 text-slate-500">
                      <tr>
                        <th className="p-2.5 text-left">Note</th>
                        <th className="p-2.5 text-left">Workpaper</th>
                        <th className="p-2.5 text-left">Title</th>
                        <th className="p-2.5 text-left">Severity</th>
                        <th className="p-2.5 text-left">Owner</th>
                        <th className="p-2.5 text-left">Due</th>
                        <th className="p-2.5 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.openReviewNotes || []).map((item: any) => (
                        <tr key={item.id} className="border-b border-slate-100">
                          <td className="p-2.5 font-mono font-bold text-amber-700">{item.noteNo}</td>
                          <td className="p-2.5">{item.source?.workpaperRef || item.review?.workpaperId}</td>
                          <td className="max-w-[300px] p-2.5 font-bold text-slate-700">{item.title}</td>
                          <td className="p-2.5"><span className={`rounded-full border px-2 py-0.5 font-bold ${badge(item.severity)}`}>{item.severity}</span></td>
                          <td className="p-2.5">{item.owner}</td>
                          <td className="p-2.5">{item.dueDate || '—'}</td>
                          <td className="p-2.5"><span className={`rounded-full border px-2 py-0.5 font-bold ${badge(item.status)}`}>{item.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
