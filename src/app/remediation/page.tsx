'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Plus,
  RotateCcw,
  X
} from 'lucide-react';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';

type WorkflowType = 'DEFICIENCY' | 'ISSUE' | 'MAP' | 'MILESTONE' | 'RETEST';

const EMPTY_DATA = {
  exceptions: [],
  deficiencies: [],
  issues: [],
  maps: [],
  retests: []
};

export default function RemediationPage() {
  const [data, setData] = useState<any>(EMPTY_DATA);
  const [error, setError] = useState('');
  const [extensionMap, setExtensionMap] = useState<any | null>(null);
  const [workflow, setWorkflow] = useState<{ type: WorkflowType; record: any } | null>(null);
  const [saving, setSaving] = useState(false);

  const [extensionForm, setExtensionForm] = useState({
    newDueDate: '',
    extensionReason: '',
    approverName: ''
  });

  const [deficiencyForm, setDeficiencyForm] = useState({
    title: '',
    description: '',
    classification: 'Control Deficiency',
    financialImpact: '',
    regulatoryImpact: '',
    compensatingControls: '',
    approvedBy: ''
  });

  const [issueForm, setIssueForm] = useState({
    title: '',
    description: '',
    severity: 'High',
    ownerName: '',
    targetDate: ''
  });

  const [mapForm, setMapForm] = useState({
    agreedAction: '',
    recommendation: '',
    actionOwner: '',
    approverName: '',
    originalDueDate: ''
  });

  const [milestoneForm, setMilestoneForm] = useState({
    title: '',
    owner: '',
    dueDate: ''
  });

  const [retestForm, setRetestForm] = useState({
    sampleCount: 0,
    passedCount: 0,
    failedCount: 0,
    testerName: '',
    reviewerName: '',
    conclusionNotes: ''
  });

  const loadData = async () => {
    setError('');
    try {
      const response = await fetch('/api/assure/remediation');
      if (!response.ok) throw new Error('Remediation data unavailable');
      const payload = await response.json();
      setData({
        exceptions: payload.exceptions || [],
        deficiencies: payload.deficiencies || [],
        issues: payload.issues || [],
        maps: payload.maps || [],
        retests: payload.retests || []
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remediation data unavailable');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const postAction = async (body: Record<string, unknown>) => {
    const response = await fetch('/api/assure/remediation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Unable to persist remediation action.');
    }
    return payload;
  };

  const openExtension = (map: any) => {
    setExtensionMap(map);
    setExtensionForm({
      newDueDate: map.revisedDueDate ? String(map.revisedDueDate).slice(0, 10) : '',
      extensionReason: '',
      approverName: map.approverName || ''
    });
    setError('');
  };

  const openDeficiency = (exception: any) => {
    setWorkflow({ type: 'DEFICIENCY', record: exception });
    setDeficiencyForm({
      title: '',
      description: exception.description || '',
      classification: 'Control Deficiency',
      financialImpact: '',
      regulatoryImpact: '',
      compensatingControls: '',
      approvedBy: ''
    });
    setError('');
  };

  const openIssue = (deficiency: any) => {
    setWorkflow({ type: 'ISSUE', record: deficiency });
    setIssueForm({
      title: deficiency.title || '',
      description: deficiency.description || '',
      severity: 'High',
      ownerName: '',
      targetDate: ''
    });
    setError('');
  };

  const openMap = (issue: any) => {
    setWorkflow({ type: 'MAP', record: issue });
    setMapForm({
      agreedAction: '',
      recommendation: '',
      actionOwner: issue.ownerName || '',
      approverName: '',
      originalDueDate: issue.targetDate ? String(issue.targetDate).slice(0, 10) : ''
    });
    setError('');
  };

  const openMilestone = (map: any) => {
    setWorkflow({ type: 'MILESTONE', record: map });
    setMilestoneForm({
      title: '',
      owner: map.actionOwner || '',
      dueDate: map.revisedDueDate
        ? String(map.revisedDueDate).slice(0, 10)
        : String(map.originalDueDate || '').slice(0, 10)
    });
    setError('');
  };

  const openRetest = (map: any) => {
    setWorkflow({ type: 'RETEST', record: map });
    setRetestForm({
      sampleCount: 0,
      passedCount: 0,
      failedCount: 0,
      testerName: '',
      reviewerName: '',
      conclusionNotes: ''
    });
    setError('');
  };

  const submitExtension = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!extensionMap) return;
    setSaving(true);
    setError('');
    try {
      await postAction({
        actionType: 'REQUEST_EXTENSION',
        mapId: extensionMap.id,
        ...extensionForm
      });
      setExtensionMap(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update Management Action Plan.');
    } finally {
      setSaving(false);
    }
  };

  const submitWorkflow = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workflow) return;

    setSaving(true);
    setError('');
    try {
      if (workflow.type === 'DEFICIENCY') {
        await postAction({
          actionType: 'CREATE_DEFICIENCY',
          exceptionId: workflow.record.id,
          ...deficiencyForm
        });
      } else if (workflow.type === 'ISSUE') {
        await postAction({
          actionType: 'CREATE_ISSUE',
          deficiencyId: workflow.record.id,
          ...issueForm
        });
      } else if (workflow.type === 'MAP') {
        await postAction({
          actionType: 'CREATE_MAP',
          issueId: workflow.record.id,
          ...mapForm
        });
      } else if (workflow.type === 'MILESTONE') {
        await postAction({
          actionType: 'CREATE_MILESTONE',
          mapId: workflow.record.id,
          ...milestoneForm
        });
      } else if (workflow.type === 'RETEST') {
        await postAction({
          actionType: 'CREATE_RETEST',
          mapId: workflow.record.id,
          ...retestForm
        });
      }

      setWorkflow(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to persist remediation action.');
    } finally {
      setSaving(false);
    }
  };

  const hasAnyRecord =
    data.exceptions.length > 0 ||
    data.deficiencies.length > 0 ||
    data.issues.length > 0 ||
    data.maps.length > 0 ||
    data.retests.length > 0;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-brand-600 uppercase">
          <BadgeCheck className="w-4 h-4" />
          Remediation & Management Action Plans
        </div>
        <h1 className="text-2xl font-black text-slate-900 mt-1">
          Exception-to-Closure Workspace
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Persisted lifecycle: testing exception → human-approved deficiency → issue → MAP → retest. No issue or closure is inferred automatically.
        </p>
      </div>

      <TraceabilityFlow currentStep="MAP Action" />

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ['Exceptions', data.exceptions.length],
          ['Deficiencies', data.deficiencies.length],
          ['Issues', data.issues.length],
          ['Action plans', data.maps.length],
          ['Retests', data.retests.length]
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-[10px] uppercase font-bold text-slate-400">{label}</div>
            <div className="text-2xl font-black text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      {!hasAnyRecord ? (
        <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl">
          <div className="font-bold text-slate-700">No remediation lifecycle records</div>
          <p className="text-xs text-slate-500 mt-1">
            Start from a persisted failed ToE sample and explicitly raise a testing exception.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h2 className="font-bold text-slate-900">Testing Exceptions</h2>
            </div>
            {data.exceptions.length === 0 ? (
              <div className="text-xs text-slate-400">No testing exceptions recorded.</div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {data.exceptions.map((exception: any) => {
                  const classified = (exception.deficiencies?.length || 0) > 0;
                  return (
                    <div key={exception.id} className="p-4 rounded-xl border border-slate-200 text-xs space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono font-bold text-amber-800">{exception.exceptionNumber}</span>
                        <span className="font-bold">{exception.severity}</span>
                      </div>
                      <div className="font-semibold text-slate-900">{exception.description}</div>
                      <div className="text-[11px] text-slate-500">
                        Sample {exception.sampleRef} · {exception.process?.name || 'Process unavailable'} · {exception.control?.controlId || 'Control unavailable'}
                      </div>
                      {classified ? (
                        <div className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Deficiency classified
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openDeficiency(exception)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-800 font-semibold"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Classify Deficiency
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-4 h-4 text-violet-600" />
              <h2 className="font-bold text-slate-900">Control Deficiencies</h2>
            </div>
            {data.deficiencies.length === 0 ? (
              <div className="text-xs text-slate-400">No human-approved deficiencies recorded.</div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {data.deficiencies.map((deficiency: any) => {
                  const issued = (deficiency.issues?.length || 0) > 0;
                  return (
                    <div key={deficiency.id} className="p-4 rounded-xl border border-slate-200 text-xs space-y-2">
                      <div className="flex justify-between gap-3">
                        <span className="font-mono font-bold text-violet-700">{deficiency.deficiencyId}</span>
                        <span className="font-bold">{deficiency.classification}</span>
                      </div>
                      <div className="font-semibold text-slate-900">{deficiency.title}</div>
                      <div className="text-[11px] text-slate-500">
                        Approved by {deficiency.approvedBy || 'Not recorded'}
                      </div>
                      {issued ? (
                        <div className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Issue opened
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openIssue(deficiency)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 hover:bg-violet-100 text-violet-800 font-semibold"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Open Issue
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <section className="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 className="font-bold text-slate-900 mb-3">Issues</h2>
              {data.issues.length === 0 ? (
                <div className="text-xs text-slate-400">No issues recorded.</div>
              ) : (
                <div className="space-y-3">
                  {data.issues.map((issue: any) => {
                    const hasMap = (issue.actionPlans?.length || 0) > 0;
                    return (
                      <div key={issue.id} className="p-3 rounded-xl border border-slate-200 text-xs space-y-2">
                        <div className="flex justify-between gap-3">
                          <span className="font-mono font-bold">{issue.issueId}</span>
                          <span className="font-bold">{issue.status}</span>
                        </div>
                        <div className="font-semibold text-slate-900">{issue.title}</div>
                        <div className="text-[11px] text-slate-500">
                          {issue.process?.name || 'No process linked'} · {issue.control?.controlId || 'No control linked'} · owner {issue.ownerName}
                        </div>
                        {!hasMap && (
                          <button
                            type="button"
                            onClick={() => openMap(issue)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 border border-brand-200 hover:bg-brand-100 text-brand-800 font-semibold"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Create MAP
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 className="font-bold text-slate-900 mb-3">Management Action Plans</h2>
              {data.maps.length === 0 ? (
                <div className="text-xs text-slate-400">No action plans recorded.</div>
              ) : (
                <div className="space-y-3">
                  {data.maps.map((map: any) => (
                    <div key={map.id} className="p-3 rounded-xl border border-slate-200 text-xs space-y-2">
                      <div className="flex justify-between gap-3">
                        <span className="font-mono font-bold">{map.mapId}</span>
                        <span className="font-bold">{map.status}</span>
                      </div>
                      <div className="text-slate-700">{map.agreedAction}</div>
                      <div className="text-[11px] text-slate-500">
                        Progress {map.progressPercent}% · milestones {map.milestones?.length || 0} · retests {map.retests?.length || 0}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-500 pt-1">
                        <div>
                          Original due:{' '}
                          <strong className="text-slate-700">
                            {new Date(map.originalDueDate).toLocaleDateString('id-ID')}
                          </strong>
                        </div>
                        <div>
                          Revised due:{' '}
                          <strong className="text-slate-700">
                            {map.revisedDueDate
                              ? new Date(map.revisedDueDate).toLocaleDateString('id-ID')
                              : 'Not revised'}
                          </strong>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => openMilestone(map)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Milestone
                        </button>
                        <button
                          type="button"
                          onClick={() => openRetest(map)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 font-semibold text-sky-800"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Record Retest
                        </button>
                        <button
                          type="button"
                          onClick={() => openExtension(map)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700"
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                          Extend Due Date
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {data.retests.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 className="font-bold text-slate-900 mb-3">Retest Records</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {data.retests.map((retest: any) => (
                  <div key={retest.id} className="p-3 rounded-xl border border-slate-200 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono font-bold">{retest.retestId}</span>
                      <span className="font-bold">{retest.result}</span>
                    </div>
                    <div className="mt-1 text-slate-600">
                      {retest.passedCount}/{retest.sampleCount} passed · {retest.failedCount} failed
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Tester {retest.testerName} · Reviewer {retest.reviewerName}
                    </div>
                    <div className="mt-2 text-[10px] text-amber-700">
                      Retest result does not automatically close the MAP or issue.
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {workflow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {workflow.type === 'DEFICIENCY'
                    ? 'Classify Control Deficiency'
                    : workflow.type === 'ISSUE'
                      ? 'Open Issue'
                      : workflow.type === 'MAP'
                        ? 'Create Management Action Plan'
                        : workflow.type === 'MILESTONE'
                          ? 'Add MAP Milestone'
                          : 'Record Retest'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  This is an explicit human workflow action and will be persisted in Cloudflare D1.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWorkflow(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitWorkflow} className="space-y-3 text-xs">
              {workflow.type === 'DEFICIENCY' && (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Deficiency Title *</label>
                    <input
                      required
                      value={deficiencyForm.title}
                      onChange={event => setDeficiencyForm({ ...deficiencyForm, title: event.target.value })}
                      className="w-full p-2.5 rounded-lg border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Description *</label>
                    <textarea
                      required
                      rows={3}
                      value={deficiencyForm.description}
                      onChange={event => setDeficiencyForm({ ...deficiencyForm, description: event.target.value })}
                      className="w-full p-2.5 rounded-lg border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Classification *</label>
                    <select
                      value={deficiencyForm.classification}
                      onChange={event => setDeficiencyForm({ ...deficiencyForm, classification: event.target.value })}
                      className="w-full p-2.5 rounded-lg border border-slate-200"
                    >
                      <option value="Control Deficiency">Control Deficiency</option>
                      <option value="Significant Deficiency">Significant Deficiency</option>
                      <option value="Material Weakness">Material Weakness</option>
                      <option value="Observation">Observation</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Financial Impact</label>
                      <input
                        type="number"
                        step="any"
                        value={deficiencyForm.financialImpact}
                        onChange={event => setDeficiencyForm({ ...deficiencyForm, financialImpact: event.target.value })}
                        className="w-full p-2.5 rounded-lg border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Approved By *</label>
                      <input
                        required
                        value={deficiencyForm.approvedBy}
                        onChange={event => setDeficiencyForm({ ...deficiencyForm, approvedBy: event.target.value })}
                        placeholder="Human approver"
                        className="w-full p-2.5 rounded-lg border border-slate-200"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Regulatory Impact</label>
                    <textarea
                      rows={2}
                      value={deficiencyForm.regulatoryImpact}
                      onChange={event => setDeficiencyForm({ ...deficiencyForm, regulatoryImpact: event.target.value })}
                      className="w-full p-2.5 rounded-lg border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Compensating Controls</label>
                    <textarea
                      rows={2}
                      value={deficiencyForm.compensatingControls}
                      onChange={event => setDeficiencyForm({ ...deficiencyForm, compensatingControls: event.target.value })}
                      className="w-full p-2.5 rounded-lg border border-slate-200"
                    />
                  </div>
                </>
              )}

              {workflow.type === 'ISSUE' && (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Issue Title *</label>
                    <input
                      required
                      value={issueForm.title}
                      onChange={event => setIssueForm({ ...issueForm, title: event.target.value })}
                      className="w-full p-2.5 rounded-lg border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Description *</label>
                    <textarea
                      required
                      rows={3}
                      value={issueForm.description}
                      onChange={event => setIssueForm({ ...issueForm, description: event.target.value })}
                      className="w-full p-2.5 rounded-lg border border-slate-200"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Severity *</label>
                      <select
                        value={issueForm.severity}
                        onChange={event => setIssueForm({ ...issueForm, severity: event.target.value })}
                        className="w-full p-2.5 rounded-lg border border-slate-200"
                      >
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Target Date *</label>
                      <input
                        type="date"
                        required
                        value={issueForm.targetDate}
                        onChange={event => setIssueForm({ ...issueForm, targetDate: event.target.value })}
                        className="w-full p-2.5 rounded-lg border border-slate-200"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Issue Owner *</label>
                    <input
                      required
                      value={issueForm.ownerName}
                      onChange={event => setIssueForm({ ...issueForm, ownerName: event.target.value })}
                      className="w-full p-2.5 rounded-lg border border-slate-200"
                    />
                  </div>
                </>
              )}

              {workflow.type === 'MAP' && (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Agreed Action *</label>
                    <textarea
                      required
                      rows={3}
                      value={mapForm.agreedAction}
                      onChange={event => setMapForm({ ...mapForm, agreedAction: event.target.value })}
                      className="w-full p-2.5 rounded-lg border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Recommendation</label>
                    <textarea
                      rows={2}
                      value={mapForm.recommendation}
                      onChange={event => setMapForm({ ...mapForm, recommendation: event.target.value })}
                      className="w-full p-2.5 rounded-lg border border-slate-200"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Action Owner *</label>
                      <input
                        required
                        value={mapForm.actionOwner}
                        onChange={event => setMapForm({ ...mapForm, actionOwner: event.target.value })}
                        className="w-full p-2.5 rounded-lg border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Approver *</label>
                      <input
                        required
                        value={mapForm.approverName}
                        onChange={event => setMapForm({ ...mapForm, approverName: event.target.value })}
                        className="w-full p-2.5 rounded-lg border border-slate-200"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Original Due Date *</label>
                    <input
                      type="date"
                      required
                      value={mapForm.originalDueDate}
                      onChange={event => setMapForm({ ...mapForm, originalDueDate: event.target.value })}
                      className="w-full p-2.5 rounded-lg border border-slate-200"
                    />
                  </div>
                </>
              )}

              {workflow.type === 'MILESTONE' && (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Milestone *</label>
                    <input
                      required
                      value={milestoneForm.title}
                      onChange={event => setMilestoneForm({ ...milestoneForm, title: event.target.value })}
                      className="w-full p-2.5 rounded-lg border border-slate-200"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Owner *</label>
                      <input
                        required
                        value={milestoneForm.owner}
                        onChange={event => setMilestoneForm({ ...milestoneForm, owner: event.target.value })}
                        className="w-full p-2.5 rounded-lg border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Due Date *</label>
                      <input
                        type="date"
                        required
                        value={milestoneForm.dueDate}
                        onChange={event => setMilestoneForm({ ...milestoneForm, dueDate: event.target.value })}
                        className="w-full p-2.5 rounded-lg border border-slate-200"
                      />
                    </div>
                  </div>
                </>
              )}

              {workflow.type === 'RETEST' && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Samples *</label>
                      <input
                        type="number"
                        min={0}
                        required
                        value={retestForm.sampleCount}
                        onChange={event => setRetestForm({ ...retestForm, sampleCount: Number(event.target.value) })}
                        className="w-full p-2.5 rounded-lg border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Passed *</label>
                      <input
                        type="number"
                        min={0}
                        required
                        value={retestForm.passedCount}
                        onChange={event => setRetestForm({ ...retestForm, passedCount: Number(event.target.value) })}
                        className="w-full p-2.5 rounded-lg border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Failed *</label>
                      <input
                        type="number"
                        min={0}
                        required
                        value={retestForm.failedCount}
                        onChange={event => setRetestForm({ ...retestForm, failedCount: Number(event.target.value) })}
                        className="w-full p-2.5 rounded-lg border border-slate-200"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Tester *</label>
                      <input
                        required
                        value={retestForm.testerName}
                        onChange={event => setRetestForm({ ...retestForm, testerName: event.target.value })}
                        className="w-full p-2.5 rounded-lg border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Reviewer *</label>
                      <input
                        required
                        value={retestForm.reviewerName}
                        onChange={event => setRetestForm({ ...retestForm, reviewerName: event.target.value })}
                        className="w-full p-2.5 rounded-lg border border-slate-200"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Conclusion Notes</label>
                    <textarea
                      rows={3}
                      value={retestForm.conclusionNotes}
                      onChange={event => setRetestForm({ ...retestForm, conclusionNotes: event.target.value })}
                      className="w-full p-2.5 rounded-lg border border-slate-200"
                    />
                  </div>
                  <div className="rounded-lg bg-sky-50 border border-sky-200 p-3 text-[11px] text-sky-800">
                    Retest result is derived only from the entered counts. It does not automatically close the MAP or issue.
                  </div>
                </>
              )}

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setWorkflow(null)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {extensionMap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">MAP Due-Date Extension</h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  {extensionMap.mapId} · original due date remains immutable.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExtensionMap(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs">
              <div className="text-[10px] uppercase font-bold text-slate-400">Original Due Date</div>
              <div className="font-bold text-slate-900 mt-0.5">
                {new Date(extensionMap.originalDueDate).toLocaleDateString('id-ID')}
              </div>
            </div>

            <form onSubmit={submitExtension} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">New Due Date *</label>
                <input
                  type="date"
                  required
                  value={extensionForm.newDueDate}
                  onChange={event =>
                    setExtensionForm({ ...extensionForm, newDueDate: event.target.value })
                  }
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Extension Reason *</label>
                <textarea
                  required
                  rows={3}
                  value={extensionForm.extensionReason}
                  onChange={event =>
                    setExtensionForm({ ...extensionForm, extensionReason: event.target.value })
                  }
                  placeholder="Document the factual reason for the due-date extension"
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Approver Name *</label>
                <input
                  type="text"
                  required
                  value={extensionForm.approverName}
                  onChange={event =>
                    setExtensionForm({ ...extensionForm, approverName: event.target.value })
                  }
                  placeholder="Enter the approving person"
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setExtensionMap(null)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Extension'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
