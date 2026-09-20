'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  FileCheck,
  FileSearch,
  Filter,
  Link2,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2
} from 'lucide-react';

const emptyPlan = {
  id: '',
  planItemId: '',
  selectionMethod: 'Reproducible Random',
  targetSampleSize: '',
  selectionSeed: '',
  overrideRationale: '',
  attributesToTest: '',
  populationCompletenessConfirmed: false,
  populationCompletenessBasis: '',
  preparedBy: '',
  reviewerName: '',
  notes: ''
};

const emptyCandidate = {
  id: '',
  samplingPlanId: '',
  transactionRef: '',
  transactionDate: '',
  amount: '',
  stratum: '',
  sourceRowRef: '',
  attributesTested: ''
};

const emptyEvidence = {
  candidateId: '',
  evidenceStatus: 'Received',
  evidenceReference: '',
  evidenceType: '',
  evidenceOwner: '',
  evidenceReviewerDecision: 'Pending',
  evidenceReviewerName: '',
  evidenceReviewerNotes: ''
};

const emptyRequest = {
  id: '',
  samplingPlanId: '',
  candidateId: '',
  requestNo: '',
  requestType: 'Internal Evidence Request',
  auditorName: '',
  description: '',
  owner: '',
  reviewerName: '',
  requestDate: '',
  dueDate: '',
  priority: 'Medium',
  status: 'Open',
  evidenceReference: '',
  responseNotes: ''
};

const emptyResult = {
  candidateId: '',
  result: 'Pass',
  failureReason: '',
  raiseException: false,
  severity: 'High',
  exceptionDescription: ''
};

function tone(value: string) {
  if (['Completed', 'Complete', 'Accepted', 'Pass'].includes(value)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (['Approved', 'Selected', 'In Progress', 'Received'].includes(value)) {
    return 'border-sky-200 bg-sky-50 text-sky-700';
  }
  if (['Incomplete', 'Requested', 'Pending', 'Draft'].includes(value)) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  if (['Rejected', 'Fail', 'Missing'].includes(value)) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function SamplingEvidencePage() {
  const [data, setData] = useState<any>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [planForm, setPlanForm] = useState(emptyPlan);
  const [candidateForm, setCandidateForm] = useState(emptyCandidate);
  const [evidenceForm, setEvidenceForm] = useState(emptyEvidence);
  const [requestForm, setRequestForm] = useState(emptyRequest);
  const [resultForm, setResultForm] = useState(emptyResult);
  const [approveReviewer, setApproveReviewer] = useState('');
  const [approveBasis, setApproveBasis] = useState('');
  const [approveConfirmed, setApproveConfirmed] = useState(false);
  const [completedBy, setCompletedBy] = useState('');
  const [query, setQuery] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async (force = false) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/icofr/sampling-evidence', { cache: force ? 'no-store' : 'default' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Sampling/evidence data unavailable.');
      setData(body);

      const currentPlanId =
        selectedPlanId && body.samplingPlans?.some((item: any) => item.id === selectedPlanId)
          ? selectedPlanId
          : body.samplingPlans?.[0]?.id || '';
      setSelectedPlanId(currentPlanId);

      setPlanForm(current => ({
        ...current,
        planItemId: current.planItemId || body.eligiblePlanItems?.[0]?.id || ''
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sampling/evidence data unavailable.');
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
      const response = await fetch('/api/icofr/sampling-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to process sampling/evidence action.');
      setMessage(success);
      await load(true);
      return body;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process sampling/evidence action.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const selectedPlan = useMemo(
    () => data?.samplingPlans?.find((item: any) => item.id === selectedPlanId) || null,
    [data, selectedPlanId]
  );

  const filteredCandidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (selectedPlan?.candidates || []).filter((item: any) => {
      if (selectedOnly && !item.selected) return false;
      if (
        needle &&
        ![
          item.transactionRef,
          item.sourceRowRef,
          item.stratum,
          item.evidenceReference,
          item.evidenceStatus,
          item.toeSample?.result
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)
      ) {
        return false;
      }
      return true;
    });
  }, [selectedPlan, query, selectedOnly]);

  const selectCandidateForEvidence = (candidate: any) => {
    setEvidenceForm({
      candidateId: candidate.id,
      evidenceStatus: candidate.evidenceStatus || 'Received',
      evidenceReference: candidate.evidenceReference || '',
      evidenceType: candidate.evidenceType || '',
      evidenceOwner: candidate.evidenceOwner || '',
      evidenceReviewerDecision: candidate.evidenceReviewerDecision || 'Pending',
      evidenceReviewerName: candidate.evidenceReviewerName || '',
      evidenceReviewerNotes: candidate.evidenceReviewerNotes || ''
    });
  };

  const selectCandidateForResult = (candidate: any) => {
    setResultForm({
      candidateId: candidate.id,
      result: candidate.toeSample?.result && candidate.toeSample.result !== 'Not Tested'
        ? candidate.toeSample.result
        : 'Pass',
      failureReason: candidate.toeSample?.failureReason || '',
      raiseException: false,
      severity: 'High',
      exceptionDescription: ''
    });
  };

  const planItem = data?.eligiblePlanItems?.find((item: any) => item.id === planForm.planItemId);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-indigo-600">
              <FileSearch className="h-4 w-4" /> ICOFR Intelligent Sampling & Evidence
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">
              Sampling Plan, Evidence Completeness & ToE Linkage
            </h1>
            <p className="mt-1 max-w-5xl text-xs leading-5 text-slate-500">
              Build a transparent sampling plan from persisted control frequency, population, risk and approved testing strategy;
              register the candidate population; execute reproducible sample selection; manage internal/PBC evidence requests;
              perform evidence reviewer sign-off; and synchronize selected samples into the existing ToE and exception workflow.
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
          <Link href="/icofr/smart-testing" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Smart Testing Strategy</Link>
          <Link href="/icofr/testing-plan" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Testing Plan</Link>
          <Link href="/toe" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">ToE Workpapers</Link>
          <Link href="/evidence" className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-700">Evidence Repository</Link>
          <Link href="/icofr/reporting" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">External Audit / PBC</Link>
          <Link href="/icofr/deficiencies" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Deficiencies</Link>
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
          Register an institution and launch ToE from an ICOFR Testing Plan before using sampling management.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {[
              ['Plans', data?.metrics?.plans || 0],
              ['Draft', data?.metrics?.draft || 0],
              ['Approved', data?.metrics?.approved || 0],
              ['Selected', data?.metrics?.selected || 0],
              ['In progress', data?.metrics?.inProgress || 0],
              ['Completed', data?.metrics?.completed || 0],
              ['Selected samples', data?.metrics?.selectedSamples || 0],
              ['Evidence complete', data?.metrics?.evidenceComplete || 0]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-[8px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                <div className="mt-1 text-xl font-black text-slate-900">{value}</div>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <form
              onSubmit={async event => {
                event.preventDefault();
                const result = await post(
                  {
                    actionType: 'SAVE_PLAN',
                    ...planForm,
                    targetSampleSize:
                      planForm.targetSampleSize === '' ? null : Number(planForm.targetSampleSize)
                  },
                  planForm.id ? 'Sampling plan updated.' : 'Sampling plan created from live Testing Plan and ToE data.'
                );
                if (result?.id) {
                  setSelectedPlanId(result.id);
                  setPlanForm(emptyPlan);
                }
              }}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">1. Sampling Plan</h2>
                  <p className="text-[10px] text-slate-500">
                    Recommendation is a planning aid; reviewer approval remains mandatory.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Launched ToE Testing Plan item *
                  <select
                    required
                    value={planForm.planItemId}
                    onChange={event => setPlanForm({ ...planForm, planItemId: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="">Select</option>
                    {(data?.eligiblePlanItems || []).map((item: any) => (
                      <option key={item.id} value={item.id}>
                        {item.control?.controlCode} · {item.control?.name} · {item.cycle?.cycleName}
                      </option>
                    ))}
                  </select>
                </label>

                {planItem && (
                  <div className="sm:col-span-2 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] text-slate-600 md:grid-cols-4">
                    <div><strong>Population:</strong><br />{planItem.toe?.populationSize ?? planItem.populationSize ?? '—'}</div>
                    <div><strong>Frequency:</strong><br />{planItem.control?.frequency || '—'}</div>
                    <div><strong>Phase:</strong><br />{planItem.testingPhase || '—'}</div>
                    <div><strong>ToE:</strong><br />{planItem.toe?.testId || planItem.toeTestId}</div>
                  </div>
                )}

                <label className="text-xs font-bold text-slate-700">
                  Selection method *
                  <select
                    value={planForm.selectionMethod}
                    onChange={event => setPlanForm({ ...planForm, selectionMethod: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    {(data?.methods || []).map((item: string) => <option key={item}>{item}</option>)}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Target sample size
                  <input
                    type="number"
                    min={1}
                    value={planForm.targetSampleSize}
                    onChange={event => setPlanForm({ ...planForm, targetSampleSize: event.target.value })}
                    placeholder="Blank = system recommendation"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Reproducibility seed
                  <input
                    value={planForm.selectionSeed}
                    onChange={event => setPlanForm({ ...planForm, selectionSeed: event.target.value })}
                    placeholder="Blank = generated and persisted"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Prepared by *
                  <input
                    required
                    value={planForm.preparedBy}
                    onChange={event => setPlanForm({ ...planForm, preparedBy: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Attributes to test
                  <textarea
                    rows={2}
                    value={planForm.attributesToTest}
                    onChange={event => setPlanForm({ ...planForm, attributesToTest: event.target.value })}
                    placeholder="Approval evidence, segregation, authorization, accuracy, timeliness, configuration, etc."
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Override rationale
                  <textarea
                    rows={2}
                    value={planForm.overrideRationale}
                    onChange={event => setPlanForm({ ...planForm, overrideRationale: event.target.value })}
                    placeholder="Required only if the target sample size differs from the calculated recommendation."
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Planning notes
                  <textarea
                    rows={2}
                    value={planForm.notes}
                    onChange={event => setPlanForm({ ...planForm, notes: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>
              </div>

              <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[10px] leading-5 text-sky-800">
                Recommendation logic uses persisted control frequency, population, linked risk rating and approved testing phase/reliance strategy.
                It is deliberately transparent and can be overridden only with documented rationale.
              </div>

              <div className="mt-4 flex justify-end">
                <button disabled={saving || !data?.eligiblePlanItems?.length} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
                  <Save className="h-4 w-4" /> Save sampling plan
                </button>
              </div>
            </form>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-slate-900">Sampling Plan Register</h2>
              <p className="mt-1 text-[10px] text-slate-500">Select a plan to manage population, evidence and ToE synchronization.</p>

              {(data?.samplingPlans || []).length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                  No sampling plan has been created.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {(data?.samplingPlans || []).map((item: any) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => {
                        setSelectedPlanId(item.id);
                        setCandidateForm({ ...emptyCandidate, samplingPlanId: item.id });
                        setRequestForm({ ...emptyRequest, samplingPlanId: item.id });
                      }}
                      className={`w-full rounded-xl border p-3 text-left ${
                        selectedPlanId === item.id ? 'border-brand-300 bg-brand-50/40' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${tone(item.status)}`}>{item.status}</span>
                          <div className="mt-1 font-mono text-[10px] font-bold text-brand-700">{item.control?.controlCode}</div>
                          <div className="text-xs font-black text-slate-900">{item.control?.name}</div>
                          <div className="mt-1 text-[9px] text-slate-500">
                            Population {item.populationSize} · Recommended {item.recommendedSampleSize} · Target {item.targetSampleSize}
                          </div>
                        </div>
                        <div className="text-right text-[9px] text-slate-400">
                          <div>{item.summary?.selected || 0} selected</div>
                          <div>{item.summary?.evidenceComplete || 0} evidence complete</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          {selectedPlan && (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${tone(selectedPlan.status)}`}>{selectedPlan.status}</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-600">{selectedPlan.selectionMethod}</span>
                    </div>
                    <h2 className="mt-1 text-lg font-black text-slate-900">
                      {selectedPlan.control?.controlCode} · {selectedPlan.control?.name}
                    </h2>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {selectedPlan.period} · Population {selectedPlan.populationSize} · Recommended {selectedPlan.recommendedSampleSize} · Approved target {selectedPlan.targetSampleSize}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[9px] sm:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 p-2"><strong>{selectedPlan.summary?.candidates || 0}</strong><br />candidates</div>
                    <div className="rounded-lg border border-slate-200 p-2"><strong>{selectedPlan.summary?.selected || 0}</strong><br />selected</div>
                    <div className="rounded-lg border border-slate-200 p-2"><strong>{selectedPlan.summary?.linkedToToe || 0}</strong><br />ToE linked</div>
                    <div className="rounded-lg border border-slate-200 p-2"><strong>{selectedPlan.summary?.failed || 0}</strong><br />failed</div>
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <form
                  onSubmit={async event => {
                    event.preventDefault();
                    const result = await post(
                      {
                        actionType: 'SAVE_CANDIDATE',
                        ...candidateForm,
                        samplingPlanId: selectedPlan.id,
                        amount: candidateForm.amount === '' ? null : Number(candidateForm.amount)
                      },
                      candidateForm.id ? 'Population candidate updated.' : 'Population candidate registered.'
                    );
                    if (result) setCandidateForm({ ...emptyCandidate, samplingPlanId: selectedPlan.id });
                  }}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-black text-slate-900">2. Candidate Population Register</h2>
                      <p className="text-[10px] text-slate-500">Register factual population references used for approved sample selection.</p>
                    </div>
                    {candidateForm.id && (
                      <button type="button" onClick={() => setCandidateForm({ ...emptyCandidate, samplingPlanId: selectedPlan.id })} className="text-[10px] font-bold text-slate-500">
                        New
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700">
                      Transaction / population ref *
                      <input required value={candidateForm.transactionRef} onChange={event => setCandidateForm({ ...candidateForm, transactionRef: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Date *
                      <input type="date" required value={candidateForm.transactionDate} onChange={event => setCandidateForm({ ...candidateForm, transactionDate: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Amount
                      <input type="number" step="any" value={candidateForm.amount} onChange={event => setCandidateForm({ ...candidateForm, amount: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Stratum
                      <input value={candidateForm.stratum} onChange={event => setCandidateForm({ ...candidateForm, stratum: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Source row / file ref
                      <input value={candidateForm.sourceRowRef} onChange={event => setCandidateForm({ ...candidateForm, sourceRowRef: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Attributes to test
                      <input value={candidateForm.attributesTested} onChange={event => setCandidateForm({ ...candidateForm, attributesTested: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button disabled={saving || selectedPlan.status === 'Completed'} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
                      <Plus className="h-4 w-4" /> Save candidate
                    </button>
                  </div>
                </form>

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-brand-600" />
                    <div>
                      <h2 className="text-sm font-black text-slate-900">3. Independent Approval & Selection</h2>
                      <p className="text-[10px] text-slate-500">Confirm population completeness before selection.</p>
                    </div>
                  </div>

                  {selectedPlan.status === 'Draft' ? (
                    <div className="space-y-3">
                      <label className="block text-xs font-bold text-slate-700">
                        Independent reviewer *
                        <input value={approveReviewer} onChange={event => setApproveReviewer(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                      </label>
                      <label className="block text-xs font-bold text-slate-700">
                        Population completeness basis *
                        <textarea rows={3} value={approveBasis} onChange={event => setApproveBasis(event.target.value)} placeholder="Reconciled to system report total, report parameters/date range, completeness checks, duplicate checks, etc." className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                      </label>
                      <label className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[11px] font-bold text-sky-800">
                        <input type="checkbox" checked={approveConfirmed} onChange={event => setApproveConfirmed(event.target.checked)} />
                        I confirm the registered candidate population is sufficiently complete for the selected method and approved target sample.
                      </label>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={saving || !approveReviewer || !approveBasis || !approveConfirmed}
                          onClick={() =>
                            void post(
                              {
                                actionType: 'APPROVE_PLAN',
                                samplingPlanId: selectedPlan.id,
                                reviewerName: approveReviewer,
                                populationCompletenessConfirmed: approveConfirmed,
                                populationCompletenessBasis: approveBasis
                              },
                              'Sampling plan and population completeness approved.'
                            )
                          }
                          className="rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40"
                        >
                          Approve plan
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] text-slate-600">
                        <strong>Reviewer:</strong> {selectedPlan.reviewerName || '—'}<br />
                        <strong>Completeness basis:</strong> {selectedPlan.populationCompletenessBasis || '—'}
                      </div>
                      {selectedPlan.status === 'Approved' && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void post({ actionType: 'SELECT_SAMPLES', samplingPlanId: selectedPlan.id }, 'Approved sample selection executed and persisted.')}
                          className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                        >
                          Execute {selectedPlan.selectionMethod} selection
                        </button>
                      )}
                      {['Selected', 'In Progress'].includes(selectedPlan.status) && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void post({ actionType: 'SYNC_TO_TOE', samplingPlanId: selectedPlan.id }, 'Selected samples synchronized to ToE workpaper.')}
                          className="w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-xs font-black text-brand-700 disabled:opacity-50"
                        >
                          Sync selected samples to ToE
                        </button>
                      )}
                    </div>
                  )}
                </section>
              </div>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-sm font-black text-slate-900">4. Population, Selection & Evidence Status</h2>
                    <p className="mt-1 text-[10px] text-slate-500">Selected candidates retain the approved selection reason and their linked ToE sample result.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search candidate" className="w-52 rounded-xl border border-slate-200 py-2 pl-8 pr-3 text-[10px]" />
                    </label>
                    <button type="button" onClick={() => setSelectedOnly(!selectedOnly)} className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-[10px] font-bold ${selectedOnly ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}>
                      <Filter className="h-3.5 w-3.5" /> Selected only
                    </button>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-[1250px] w-full text-[10px]">
                    <thead className="bg-slate-100 text-slate-500">
                      <tr>
                        <th className="p-2.5 text-left">Selected</th>
                        <th className="p-2.5 text-left">Reference</th>
                        <th className="p-2.5 text-left">Date / Amount</th>
                        <th className="p-2.5 text-left">Selection basis</th>
                        <th className="p-2.5 text-left">Evidence</th>
                        <th className="p-2.5 text-left">Evidence review</th>
                        <th className="p-2.5 text-left">ToE result</th>
                        <th className="p-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCandidates.map((item: any) => (
                        <tr key={item.id} className="border-b border-slate-100 align-top">
                          <td className="p-2.5">
                            {selectedPlan.selectionMethod === 'Manual / Judgmental' && selectedPlan.status === 'Draft' ? (
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={event =>
                                  void post(
                                    {
                                      actionType: 'SET_MANUAL_SELECTION',
                                      candidateId: item.id,
                                      selected: event.target.checked,
                                      selectionReason: event.target.checked
                                        ? window.prompt('Document judgmental selection reason') || ''
                                        : ''
                                    },
                                    'Manual selection updated.'
                                  )
                                }
                              />
                            ) : (
                              <span className={item.selected ? 'font-black text-emerald-700' : 'text-slate-400'}>
                                {item.selected ? '#' + (item.selectionOrder || '✓') : '—'}
                              </span>
                            )}
                          </td>
                          <td className="p-2.5">
                            <div className="font-mono font-bold text-brand-700">{item.transactionRef}</div>
                            <div className="text-[9px] text-slate-400">{item.stratum || item.sourceRowRef || '—'}</div>
                          </td>
                          <td className="p-2.5 text-slate-600">{item.transactionDate}<br />{item.amount ?? '—'}</td>
                          <td className="max-w-[260px] p-2.5 text-slate-500">{item.selectionReason || 'Not selected'}</td>
                          <td className="p-2.5">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${tone(item.evidenceStatus)}`}>{item.evidenceStatus}</span>
                            <div className="mt-1 max-w-[180px] break-all text-[9px] text-slate-400">{item.evidenceReference || '—'}</div>
                          </td>
                          <td className="p-2.5">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${tone(item.evidenceReviewerDecision)}`}>{item.evidenceReviewerDecision}</span>
                          </td>
                          <td className="p-2.5">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${tone(item.toeSample?.result || 'Not Tested')}`}>{item.toeSample?.result || (item.toeSampleId ? 'Not Tested' : 'Not linked')}</span>
                            {item.exceptionId && <div className="mt-1 text-[9px] font-bold text-rose-600">Exception raised</div>}
                          </td>
                          <td className="p-2.5 text-right">
                            <div className="flex justify-end gap-1">
                              {!item.selected && !item.toeSampleId && selectedPlan.status !== 'Completed' && (
                                <>
                                  <button type="button" onClick={() => setCandidateForm({
                                    id: item.id,
                                    samplingPlanId: selectedPlan.id,
                                    transactionRef: item.transactionRef,
                                    transactionDate: item.transactionDate,
                                    amount: item.amount ?? '',
                                    stratum: item.stratum || '',
                                    sourceRowRef: item.sourceRowRef || '',
                                    attributesTested: item.attributesTested || ''
                                  })} className="rounded-lg border border-slate-200 px-2 py-1 text-[9px] font-bold text-slate-600">Edit</button>
                                  <button type="button" onClick={() => window.confirm('Delete this population candidate?') && void post({ actionType: 'REMOVE_CANDIDATE', id: item.id }, 'Candidate deleted.')} className="rounded-lg border border-rose-200 px-2 py-1 text-[9px] font-bold text-rose-600"><Trash2 className="h-3 w-3" /></button>
                                </>
                              )}
                              {item.selected && (
                                <button type="button" onClick={() => selectCandidateForEvidence(item)} className="rounded-lg border border-sky-200 px-2 py-1 text-[9px] font-bold text-sky-700">Evidence</button>
                              )}
                              {item.toeSampleId && (
                                <button type="button" onClick={() => selectCandidateForResult(item)} className="rounded-lg border border-brand-200 px-2 py-1 text-[9px] font-bold text-brand-700">Result</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <form
                  onSubmit={async event => {
                    event.preventDefault();
                    const result = await post({ actionType: 'UPDATE_EVIDENCE', ...evidenceForm }, 'Evidence status and reviewer sign-off saved.');
                    if (result) setEvidenceForm(emptyEvidence);
                  }}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <h2 className="text-sm font-black text-slate-900">5. Evidence Completeness & Reviewer Sign-Off</h2>
                  {!evidenceForm.candidateId ? (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">Choose Evidence on a selected sample.</div>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="text-xs font-bold text-slate-700">
                        Evidence status *
                        <select value={evidenceForm.evidenceStatus} onChange={event => setEvidenceForm({ ...evidenceForm, evidenceStatus: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                          {(data?.evidenceStatuses || []).map((item: string) => <option key={item}>{item}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-bold text-slate-700">
                        Evidence type
                        <input value={evidenceForm.evidenceType} onChange={event => setEvidenceForm({ ...evidenceForm, evidenceType: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                      </label>
                      <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                        Evidence reference
                        <input value={evidenceForm.evidenceReference} onChange={event => setEvidenceForm({ ...evidenceForm, evidenceReference: event.target.value })} placeholder="DMS path, ticket, report ID, file reference, evidence repository reference" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                      </label>
                      <label className="text-xs font-bold text-slate-700">
                        Evidence owner
                        <input value={evidenceForm.evidenceOwner} onChange={event => setEvidenceForm({ ...evidenceForm, evidenceOwner: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                      </label>
                      <label className="text-xs font-bold text-slate-700">
                        Reviewer decision *
                        <select value={evidenceForm.evidenceReviewerDecision} onChange={event => setEvidenceForm({ ...evidenceForm, evidenceReviewerDecision: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                          {(data?.evidenceReviewDecisions || []).map((item: string) => <option key={item}>{item}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-bold text-slate-700">
                        Evidence reviewer
                        <input value={evidenceForm.evidenceReviewerName} onChange={event => setEvidenceForm({ ...evidenceForm, evidenceReviewerName: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                      </label>
                      <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                        Reviewer notes
                        <textarea rows={2} value={evidenceForm.evidenceReviewerNotes} onChange={event => setEvidenceForm({ ...evidenceForm, evidenceReviewerNotes: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                      </label>
                      <div className="sm:col-span-2 flex justify-end">
                        <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" /> Save evidence review</button>
                      </div>
                    </div>
                  )}
                </form>

                <form
                  onSubmit={async event => {
                    event.preventDefault();
                    const result = await post(
                      requestForm.id
                        ? {
                            actionType: 'UPDATE_EVIDENCE_REQUEST',
                            id: requestForm.id,
                            status: requestForm.status,
                            evidenceReference: requestForm.evidenceReference,
                            responseNotes: requestForm.responseNotes
                          }
                        : { actionType: 'CREATE_EVIDENCE_REQUEST', ...requestForm, samplingPlanId: selectedPlan.id },
                      requestForm.id
                        ? 'Evidence request lifecycle updated and synchronized with PBC when applicable.'
                        : 'Evidence request created and linked to sampling plan.'
                    );
                    if (result) setRequestForm({ ...emptyRequest, samplingPlanId: selectedPlan.id });
                  }}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-black text-slate-900">6. Evidence / External Audit PBC Request</h2>
                    {requestForm.id && (
                      <button
                        type="button"
                        onClick={() => setRequestForm({ ...emptyRequest, samplingPlanId: selectedPlan.id })}
                        className="text-[10px] font-bold text-slate-500"
                      >
                        New request
                      </button>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700">
                      Request type *
                      <select disabled={!!requestForm.id} value={requestForm.requestType} onChange={event => setRequestForm({ ...requestForm, requestType: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                        <option>Internal Evidence Request</option>
                        <option>External Audit PBC</option>
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Request no. *
                      <input disabled={!!requestForm.id} required value={requestForm.requestNo} onChange={event => setRequestForm({ ...requestForm, requestNo: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Related selected sample
                      <select disabled={!!requestForm.id} value={requestForm.candidateId} onChange={event => setRequestForm({ ...requestForm, candidateId: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                        <option value="">Plan-level request</option>
                        {(selectedPlan.candidates || []).filter((item: any) => item.selected).map((item: any) => <option key={item.id} value={item.id}>{item.transactionRef}</option>)}
                      </select>
                    </label>
                    {requestForm.requestType === 'External Audit PBC' && (
                      <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                        Auditor name *
                        <input disabled={!!requestForm.id} required value={requestForm.auditorName} onChange={event => setRequestForm({ ...requestForm, auditorName: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                      </label>
                    )}
                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Description *
                      <textarea disabled={!!requestForm.id} required rows={2} value={requestForm.description} onChange={event => setRequestForm({ ...requestForm, description: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                    </label>
                    <label className="text-xs font-bold text-slate-700">Owner *<input disabled={!!requestForm.id} required value={requestForm.owner} onChange={event => setRequestForm({ ...requestForm, owner: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                    <label className="text-xs font-bold text-slate-700">Reviewer<input disabled={!!requestForm.id} value={requestForm.reviewerName} onChange={event => setRequestForm({ ...requestForm, reviewerName: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                    <label className="text-xs font-bold text-slate-700">Request date *<input disabled={!!requestForm.id} type="date" required value={requestForm.requestDate} onChange={event => setRequestForm({ ...requestForm, requestDate: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                    <label className="text-xs font-bold text-slate-700">Due date *<input disabled={!!requestForm.id} type="date" required value={requestForm.dueDate} onChange={event => setRequestForm({ ...requestForm, dueDate: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
                    {requestForm.id && (
                      <>
                        <label className="text-xs font-bold text-slate-700">
                          Lifecycle status *
                          <select
                            value={requestForm.status}
                            onChange={event => setRequestForm({ ...requestForm, status: event.target.value })}
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                          >
                            <option>Open</option>
                            <option>In Progress</option>
                            <option>Submitted</option>
                            <option>Accepted</option>
                            <option>Closed</option>
                            <option>Cancelled</option>
                          </select>
                        </label>
                        <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                          Evidence reference
                          <input
                            value={requestForm.evidenceReference}
                            onChange={event => setRequestForm({ ...requestForm, evidenceReference: event.target.value })}
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                          />
                        </label>
                        <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                          Response notes
                          <textarea
                            rows={2}
                            value={requestForm.responseNotes}
                            onChange={event => setRequestForm({ ...requestForm, responseNotes: event.target.value })}
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                          />
                        </label>
                      </>
                    )}
                    <div className="sm:col-span-2 flex justify-end">
                      <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
                        <Link2 className="h-4 w-4" /> {requestForm.id ? 'Update request' : 'Create request'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <form
                  onSubmit={async event => {
                    event.preventDefault();
                    const result = await post({ actionType: 'RECORD_SAMPLE_RESULT', ...resultForm }, resultForm.raiseException ? 'ToE result saved and testing exception raised.' : 'ToE sample result saved.');
                    if (result) setResultForm(emptyResult);
                  }}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <h2 className="text-sm font-black text-slate-900">7. Linked ToE Sample Result</h2>
                  {!resultForm.candidateId ? (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">Choose Result on a ToE-linked sample.</div>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="text-xs font-bold text-slate-700">
                        Result *
                        <select value={resultForm.result} onChange={event => setResultForm({ ...resultForm, result: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                          <option>Pass</option><option>Fail</option><option>N/A</option><option>Not Tested</option>
                        </select>
                      </label>
                      {resultForm.result === 'Fail' && (
                        <>
                          <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                            Failure reason *
                            <textarea required rows={2} value={resultForm.failureReason} onChange={event => setResultForm({ ...resultForm, failureReason: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                          </label>
                          <label className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-bold text-rose-800">
                            <input type="checkbox" checked={resultForm.raiseException} onChange={event => setResultForm({ ...resultForm, raiseException: event.target.checked })} />
                            Raise a persisted Testing Exception from this failed sample and connect it to the existing deficiency workflow.
                          </label>
                          {resultForm.raiseException && (
                            <>
                              <label className="text-xs font-bold text-slate-700">
                                Exception severity
                                <select value={resultForm.severity} onChange={event => setResultForm({ ...resultForm, severity: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                                  <option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
                                </select>
                              </label>
                              <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                                Exception description
                                <textarea rows={2} value={resultForm.exceptionDescription} onChange={event => setResultForm({ ...resultForm, exceptionDescription: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                              </label>
                            </>
                          )}
                        </>
                      )}
                      <div className="sm:col-span-2 flex justify-end">
                        <button disabled={saving} className="rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">Save ToE result</button>
                      </div>
                    </div>
                  )}
                </form>

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-black text-slate-900">8. Complete Sampling & Evidence Work</h2>
                  <p className="mt-1 text-[10px] leading-5 text-slate-500">
                    Completion requires the approved target number of selected samples, every selected item linked to ToE, evidence status Complete,
                    evidence reviewer decision Accepted, and a recorded ToE sample result.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-xl border border-slate-200 p-3"><strong>{selectedPlan.summary?.selected || 0}/{selectedPlan.targetSampleSize}</strong><br />selected</div>
                    <div className="rounded-xl border border-slate-200 p-3"><strong>{selectedPlan.summary?.linkedToToe || 0}/{selectedPlan.targetSampleSize}</strong><br />ToE linked</div>
                    <div className="rounded-xl border border-slate-200 p-3"><strong>{selectedPlan.summary?.evidenceComplete || 0}/{selectedPlan.targetSampleSize}</strong><br />evidence accepted</div>
                    <div className="rounded-xl border border-slate-200 p-3"><strong>{selectedPlan.summary?.tested || 0}/{selectedPlan.targetSampleSize}</strong><br />tested</div>
                  </div>
                  {selectedPlan.status === 'In Progress' && (
                    <div className="mt-4 flex gap-2">
                      <input value={completedBy} onChange={event => setCompletedBy(event.target.value)} placeholder="Completed by" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs" />
                      <button
                        type="button"
                        disabled={saving || !completedBy}
                        onClick={() => void post({ actionType: 'COMPLETE_PLAN', samplingPlanId: selectedPlan.id, completedBy }, 'Sampling and evidence work completed.')}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-40"
                      >
                        Complete
                      </button>
                    </div>
                  )}
                  {selectedPlan.status === 'Completed' && (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700">Sampling plan completed and retained in D1.</div>
                  )}
                </section>
              </div>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-black text-slate-900">Evidence Request Register</h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-[900px] w-full text-[10px]">
                    <thead className="bg-slate-100 text-slate-500">
                      <tr><th className="p-2.5 text-left">Request</th><th className="p-2.5 text-left">Type</th><th className="p-2.5 text-left">Description</th><th className="p-2.5 text-left">Owner</th><th className="p-2.5 text-left">Due</th><th className="p-2.5 text-left">Status</th><th className="p-2.5 text-left">PBC link</th><th className="p-2.5 text-right">Action</th></tr>
                    </thead>
                    <tbody>
                      {(selectedPlan.evidenceRequests || []).map((item: any) => (
                        <tr key={item.id} className="border-b border-slate-100">
                          <td className="p-2.5 font-mono font-bold text-brand-700">{item.requestNo}</td>
                          <td className="p-2.5">{item.requestType}</td>
                          <td className="max-w-[320px] p-2.5 text-slate-600">{item.description}</td>
                          <td className="p-2.5">{item.owner}</td>
                          <td className="p-2.5">{item.dueDate}</td>
                          <td className="p-2.5"><span className={`rounded-full border px-2 py-0.5 font-bold ${tone(item.status)}`}>{item.status}</span></td>
                          <td className="p-2.5">{item.pbcRequestId ? <Link href="/icofr/reporting" className="font-bold text-brand-700">External Audit PBC</Link> : 'Internal'}</td>
                          <td className="p-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => setRequestForm({
                                id: item.id,
                                samplingPlanId: selectedPlan.id,
                                candidateId: item.candidateId || '',
                                requestNo: item.requestNo,
                                requestType: item.requestType,
                                auditorName: item.auditorName || '',
                                description: item.description,
                                owner: item.owner,
                                reviewerName: item.reviewerName || '',
                                requestDate: item.requestDate,
                                dueDate: item.dueDate,
                                priority: item.priority || 'Medium',
                                status: item.status || 'Open',
                                evidenceReference: item.evidenceReference || '',
                                responseNotes: item.responseNotes || ''
                              })}
                              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[9px] font-bold text-slate-600"
                            >
                              Update
                            </button>
                          </td>
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
