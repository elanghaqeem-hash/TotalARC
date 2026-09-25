'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Link2,
  ListChecks,
  Plus,
  RefreshCcw,
  Save,
  ShieldCheck,
  Target,
  UserRound,
  X
} from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function futureDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function statusClass(status: string) {
  if (status === 'Closed' || status === 'Approved') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Open' || status === 'Submitted' || status === 'In Review') return 'bg-sky-50 text-sky-700 border-sky-200';
  if (status === 'Needs Revision') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

function riskClass(rating: string) {
  if (rating === 'Extreme') return 'bg-rose-100 text-rose-800';
  if (rating === 'High') return 'bg-orange-100 text-orange-800';
  if (rating === 'Medium') return 'bg-amber-100 text-amber-800';
  return 'bg-emerald-100 text-emerald-800';
}

export default function RCSAPage() {
  const { data, loading, error, refresh } = useAssuranceData(['rcsa']);
  const campaigns = data?.campaigns || [];
  const processes = data?.processes || [];
  const risks = data?.risks || [];
  const controls = data?.controls || [];
  const organizationUnits = data?.institution?.organizationUnits || [];

  const [campaignModal, setCampaignModal] = useState(false);
  const [scopeCampaign, setScopeCampaign] = useState<any>(null);
  const [assessmentScope, setAssessmentScope] = useState<any>(null);
  const [reviewContext, setReviewContext] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [unitSearch, setUnitSearch] = useState('');

  const [campaignForm, setCampaignForm] = useState({
    campaignCode: '',
    name: '',
    type: 'RCSA',
    period: String(new Date().getFullYear()),
    frequency: 'Annual',
    startDate: todayDate(),
    dueDate: futureDate(30),
    ownerName: '',
    reviewerName: '',
    approverName: '',
    organizationUnitIds: [] as string[],
    methodology: 'COSO / ISO 31000 aligned',
    ratingScale: '5x5',
    evidenceRequired: true,
    instructions:
      'Assess process risks and control effectiveness based on current-period evidence. Document exceptions, residual risk, and remediation actions where required.',
    status: 'Open',
    processId: '',
    riskId: '',
    controlId: '',
    assessorName: '',
    scopeDueDate: futureDate(30)
  });

  const [scopeForm, setScopeForm] = useState({
    processId: '',
    riskId: '',
    controlId: '',
    assessorName: '',
    dueDate: futureDate(30)
  });

  const [assessmentForm, setAssessmentForm] = useState({
    assessorName: '',
    designEffectiveness: 'Effective',
    operatingEffectiveness: 'Effective',
    evidenceQuality: 'Adequate',
    residualLikelihood: 2,
    residualImpact: 2,
    csaConclusion: 'Effective',
    confidenceLevel: 'Medium',
    controlPerformed: true,
    exceptionIdentified: false,
    evidenceRef: '',
    comments: '',
    actionRequired: false,
    actionOwner: '',
    actionDueDate: futureDate(30)
  });

  const [reviewForm, setReviewForm] = useState({
    reviewerName: '',
    reviewStatus: 'Approved',
    reviewNotes: ''
  });

  const stats = useMemo(() => {
    const allScopes = campaigns.flatMap((campaign: any) => campaign.scopes || []);
    return {
      campaigns: campaigns.length,
      active: campaigns.filter((campaign: any) => campaign.status !== 'Closed').length,
      scopes: allScopes.length,
      actions: allScopes.filter((scope: any) => scope.response?.actionRequired).length
    };
  }, [campaigns]);

  const campaignRisks = risks.filter(
    (risk: any) => String(risk.processId) === String(campaignForm.processId)
  );
  const filteredOrganizationUnits = organizationUnits
    .filter((unit: any) => String(unit.status || 'Active') === 'Active')
    .filter((unit: any) => {
      const query = unitSearch.trim().toLowerCase();
      if (!query) return true;
      return [unit.code, unit.name, unit.type]
        .map(value => String(value || '').toLowerCase())
        .some(value => value.includes(query));
    })
    .sort((a: any, b: any) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'id-ID')
    );

  const campaignControls = controls.filter((control: any) => {
    if (String(control.processId) !== String(campaignForm.processId)) return false;
    if (!campaignForm.riskId) return true;
    return (control.riskIds || []).includes(campaignForm.riskId);
  });

  const scopeRisks = risks.filter(
    (risk: any) => String(risk.processId) === String(scopeForm.processId)
  );
  const scopeControls = controls.filter((control: any) => {
    if (String(control.processId) !== String(scopeForm.processId)) return false;
    if (!scopeForm.riskId) return true;
    return (control.riskIds || []).includes(scopeForm.riskId);
  });

  const postAction = async (payload: Record<string, unknown>) => {
    setSaving(true);
    setActionError('');
    try {
      const res = await fetch('/api/assurance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Unable to save assessment data.');
      await refresh();
      return body;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to save assessment data.');
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const createCampaign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (campaignForm.organizationUnitIds.length === 0) {
      setActionError('Pilih minimal satu Unit Kerja Peserta untuk mengikuti campaign.');
      return;
    }
    try {
      await postAction({ actionType: 'CREATE_CAMPAIGN', ...campaignForm });
      setCampaignModal(false);
      setCampaignForm(prev => ({
        ...prev,
        campaignCode: '',
        name: '',
        organizationUnitIds: [],
        processId: '',
        riskId: '',
        controlId: '',
        assessorName: ''
      }));
    } catch {}
  };

  const addScope = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!scopeCampaign) return;
    try {
      await postAction({
        actionType: 'ADD_SCOPE',
        campaignId: scopeCampaign.id,
        ...scopeForm
      });
      setScopeCampaign(null);
      setScopeForm({
        processId: '',
        riskId: '',
        controlId: '',
        assessorName: '',
        dueDate: scopeCampaign.dueDate || futureDate(30)
      });
    } catch {}
  };

  const openAssessment = (scope: any) => {
    const response = scope.response;
    setAssessmentScope(scope);
    setActionError('');
    setAssessmentForm({
      assessorName: response?.assessorName || scope.assessorName || '',
      designEffectiveness: response?.designEffectiveness || 'Effective',
      operatingEffectiveness: response?.operatingEffectiveness || 'Effective',
      evidenceQuality: response?.evidenceQuality || 'Adequate',
      residualLikelihood: Number(response?.residualLikelihood || scope.risk?.residualLikelihood || 2),
      residualImpact: Number(response?.residualImpact || scope.risk?.residualImpact || 2),
      csaConclusion: response?.csaConclusion || 'Effective',
      confidenceLevel: response?.confidenceLevel || 'Medium',
      controlPerformed: response ? Boolean(response.controlPerformed) : true,
      exceptionIdentified: response ? Boolean(response.exceptionIdentified) : false,
      evidenceRef: response?.evidenceRef || '',
      comments: response?.comments || '',
      actionRequired: response ? Boolean(response.actionRequired) : false,
      actionOwner: response?.actionOwner || '',
      actionDueDate: response?.actionDueDate || futureDate(30)
    });
  };

  const submitAssessment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!assessmentScope) return;
    try {
      await postAction({
        actionType: 'SUBMIT_ASSESSMENT',
        scopeId: assessmentScope.id,
        ...assessmentForm
      });
      setAssessmentScope(null);
    } catch {}
  };

  const openReview = (campaign: any, scope: any) => {
    setReviewContext({ campaign, scope });
    setActionError('');
    setReviewForm({
      reviewerName: scope.response?.reviewerName || campaign.reviewerName || '',
      reviewStatus: scope.response?.reviewStatus === 'Needs Revision' ? 'Needs Revision' : 'Approved',
      reviewNotes: scope.response?.reviewNotes || ''
    });
  };

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reviewContext?.scope?.response?.id) return;
    try {
      await postAction({
        actionType: 'REVIEW_ASSESSMENT',
        responseId: reviewContext.scope.response.id,
        ...reviewForm
      });
      setReviewContext(null);
    } catch {}
  };

  const updateCampaignStatus = async (campaignId: string, status: string) => {
    try {
      await postAction({
        actionType: 'UPDATE_CAMPAIGN_STATUS',
        campaignId,
        status
      });
    } catch {}
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-sky-600 uppercase">
              <ClipboardCheck className="w-4 h-4" />
              RCSA & CSA
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">
              Assessment Campaign Workspace
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">
              Plan, execute, review, and evidence risk & control self-assessments. Approved results
              synchronize residual risk to Risk Master, control effectiveness to Control Master,
              and follow-up actions to Task Center.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => refresh()}
              className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
              title="Refresh from database"
            >
              <RefreshCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setActionError('');
                setCampaignModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
            >
              <Plus className="w-4 h-4" />
              New Campaign
            </button>
          </div>
        </div>
      </div>

      {(error || actionError) && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
          {actionError || error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Campaigns', stats.campaigns, ClipboardCheck],
          ['Active', stats.active, CalendarDays],
          ['Assessment Scope', stats.scopes, ListChecks],
          ['Open Actions', stats.actions, AlertTriangle]
        ].map(([label, value, Icon]: any) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {label}
              </div>
              <Icon className="w-4 h-4 text-brand-600" />
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">{value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto">
          <Link href="/processes" className="whitespace-nowrap text-xs font-bold text-slate-600 hover:text-brand-700 px-3 py-2 rounded-lg bg-slate-50">
            Process Register
          </Link>
          <Link href="/risks" className="whitespace-nowrap text-xs font-bold text-slate-600 hover:text-brand-700 px-3 py-2 rounded-lg bg-slate-50">
            Risk Register
          </Link>
          <Link href="/controls" className="whitespace-nowrap text-xs font-bold text-slate-600 hover:text-brand-700 px-3 py-2 rounded-lg bg-slate-50">
            Control Master
          </Link>
          <Link href="/rcm" className="whitespace-nowrap text-xs font-bold text-slate-600 hover:text-brand-700 px-3 py-2 rounded-lg bg-slate-50">
            RCM
          </Link>
          <Link href="/tasks" className="whitespace-nowrap text-xs font-bold text-slate-600 hover:text-brand-700 px-3 py-2 rounded-lg bg-slate-50">
            Task Center
          </Link>
          <Link href="/remediation" className="whitespace-nowrap text-xs font-bold text-slate-600 hover:text-brand-700 px-3 py-2 rounded-lg bg-slate-50">
            Remediation
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-slate-500">Loading persisted assessment data…</div>
      ) : campaigns.length === 0 ? (
        <div className="p-10 text-center bg-white border border-dashed border-slate-300 rounded-2xl">
          <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="font-bold text-slate-700 mt-3">No assessment campaign recorded</div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl mx-auto">
            Start with a campaign, assign process/risk/control scope, collect evidence-backed
            self-assessment, then route the result for independent review and approval.
          </p>
          <button
            type="button"
            onClick={() => setCampaignModal(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white"
          >
            <Plus className="w-4 h-4" />
            Create First Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {campaigns.map((campaign: any) => (
            <div key={campaign.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] uppercase font-bold text-brand-600">
                        {campaign.campaignCode} · {campaign.type === 'Combined' ? 'Hybrid (RCSA + CSA)' : campaign.type} · {campaign.period}
                      </span>
                      <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${statusClass(campaign.status)}`}>
                        {campaign.status}
                      </span>
                    </div>
                    <h2 className="font-black text-lg text-slate-900 mt-1">{campaign.name}</h2>
                    <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {new Date(campaign.startDate).toLocaleDateString('id-ID')} –{' '}
                        {new Date(campaign.dueDate).toLocaleDateString('id-ID')}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="w-3.5 h-3.5" />
                        Owner: {campaign.ownerName}
                      </span>
                      <span>Reviewer: {campaign.reviewerName}</span>
                      <span>Approver: {campaign.approverName}</span>
                    </div>
                    {(campaign.participatingUnits || []).length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
                          <Building2 className="h-3.5 w-3.5" />
                          Unit peserta:
                        </span>
                        {(campaign.participatingUnits || []).slice(0, 6).map((unit: any) => (
                          <span
                            key={unit.id}
                            className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[9px] font-bold text-sky-700"
                          >
                            {unit.code ? unit.code + ' · ' : ''}{unit.name}
                          </span>
                        ))}
                        {(campaign.participatingUnits || []).length > 6 && (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-500">
                            +{(campaign.participatingUnits || []).length - 6} unit
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {campaign.status === 'Draft' && (
                      <button
                        type="button"
                        onClick={() => updateCampaignStatus(campaign.id, 'Open')}
                        className="text-xs font-bold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-2"
                      >
                        Open Campaign
                      </button>
                    )}
                    {campaign.status !== 'Closed' && (
                      <button
                        type="button"
                        onClick={() => {
                          setScopeCampaign(campaign);
                          setScopeForm({
                            processId: '',
                            riskId: '',
                            controlId: '',
                            assessorName: '',
                            dueDate: campaign.dueDate
                          });
                          setActionError('');
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-bold rounded-lg border border-brand-200 bg-brand-50 text-brand-700 px-3 py-2"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Scope
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Scope</div>
                    <div className="font-black text-slate-900">{campaign.metrics?.total || 0}</div>
                  </div>
                  <div className="rounded-xl bg-sky-50 p-3">
                    <div className="text-[10px] uppercase font-bold text-sky-600">Submitted</div>
                    <div className="font-black text-slate-900">{campaign.metrics?.submitted || 0}</div>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-3">
                    <div className="text-[10px] uppercase font-bold text-emerald-600">Approved</div>
                    <div className="font-black text-slate-900">{campaign.metrics?.approved || 0}</div>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-3">
                    <div className="text-[10px] uppercase font-bold text-amber-700">Actions</div>
                    <div className="font-black text-slate-900">{campaign.metrics?.actions || 0}</div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                    <span>Campaign completion</span>
                    <span>{campaign.metrics?.completionPercent || 0}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-brand-600 rounded-full"
                      style={{ width: `${campaign.metrics?.completionPercent || 0}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-3">
                {(campaign.scopes || []).length === 0 ? (
                  <div className="text-xs text-slate-400 p-6 text-center border border-dashed border-slate-200 rounded-xl">
                    No assessment scope yet. Add a process, risk, and/or control to begin.
                  </div>
                ) : (
                  (campaign.scopes || []).map((scope: any) => (
                    <div key={scope.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[10px] font-bold text-brand-700 bg-brand-50 border border-brand-100 rounded px-2 py-0.5">
                              {scope.process?.processId || 'PROCESS'}
                            </span>
                            {scope.risk && (
                              <span className="text-[10px] font-bold text-orange-700 bg-orange-50 rounded px-2 py-0.5">
                                {scope.risk.riskId}
                              </span>
                            )}
                            {scope.control && (
                              <span className="text-[10px] font-bold text-sky-700 bg-sky-50 rounded px-2 py-0.5">
                                {scope.control.controlId}
                              </span>
                            )}
                            <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${statusClass(scope.status)}`}>
                              {scope.status}
                            </span>
                          </div>
                          <div className="font-bold text-sm text-slate-900 mt-1">
                            {scope.control?.name || scope.risk?.name || scope.process?.name}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1">
                            {scope.process?.name} · Assessor: {scope.assessorName} · Due:{' '}
                            {new Date(scope.dueDate).toLocaleDateString('id-ID')}
                          </div>

                          {scope.response && (
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
                              <span className="font-bold px-2 py-1 rounded bg-slate-100">
                                Conclusion: {scope.response.csaConclusion}
                              </span>
                              <span className={`font-bold px-2 py-1 rounded ${riskClass(scope.response.residualRating)}`}>
                                Residual {scope.response.residualScore} · {scope.response.residualRating}
                              </span>
                              <span className="font-bold px-2 py-1 rounded bg-slate-100">
                                Evidence: {scope.response.evidenceQuality}
                              </span>
                              {scope.response.actionRequired && (
                                <span className="font-bold px-2 py-1 rounded bg-amber-100 text-amber-800">
                                  Action Required
                                </span>
                              )}
                              <span className={`font-bold border px-2 py-1 rounded ${statusClass(scope.response.reviewStatus)}`}>
                                {scope.response.reviewStatus}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          <button
                            type="button"
                            onClick={() => openAssessment(scope)}
                            disabled={campaign.status === 'Closed'}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 text-white px-3 py-2 text-xs font-bold disabled:opacity-40"
                          >
                            <FileCheck2 className="w-3.5 h-3.5" />
                            {scope.response ? 'Update Assessment' : 'Assess'}
                          </button>
                          {scope.response && scope.response.reviewStatus === 'Pending Review' && (
                            <button
                              type="button"
                              onClick={() => openReview(campaign, scope)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-2 text-xs font-bold"
                            >
                              <BadgeCheck className="w-3.5 h-3.5" />
                              Review
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {campaignModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm overflow-y-auto p-4">
          <div className="bg-white rounded-2xl max-w-3xl mx-auto my-4 shadow-2xl">
            <div className="sticky top-0 bg-white rounded-t-2xl border-b border-slate-100 p-5 flex items-center justify-between z-10">
              <div>
                <div className="text-[10px] uppercase font-bold text-brand-600">Best-practice setup</div>
                <h3 className="font-black text-lg text-slate-900">Create RCSA / CSA Campaign</h3>
              </div>
              <button onClick={() => setCampaignModal(false)} className="p-2 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={createCampaign} className="p-5 space-y-5 text-xs">
              <div>
                <div className="font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <Target className="w-4 h-4 text-brand-600" /> Campaign Governance
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    required
                    value={campaignForm.name}
                    onChange={e => setCampaignForm({ ...campaignForm, name: e.target.value })}
                    placeholder="Campaign name *"
                    className="p-2.5 rounded-lg border border-slate-200"
                  />
                  <input
                    value={campaignForm.campaignCode}
                    onChange={e => setCampaignForm({ ...campaignForm, campaignCode: e.target.value })}
                    placeholder="Campaign code (auto if blank)"
                    className="p-2.5 rounded-lg border border-slate-200"
                  />
                  <select value={campaignForm.type} onChange={e => setCampaignForm({ ...campaignForm, type: e.target.value })} className="p-2.5 rounded-lg border border-slate-200">
                    <option value="RCSA">RCSA</option>
                    <option value="CSA">CSA</option>
                    <option value="Combined">Hybrid (RCSA + CSA)</option>
                  </select>
                  <select value={campaignForm.frequency} onChange={e => setCampaignForm({ ...campaignForm, frequency: e.target.value })} className="p-2.5 rounded-lg border border-slate-200">
                    <option>Annual</option><option>Semi-Annual</option><option>Quarterly</option><option>Monthly</option><option>Ad Hoc</option>
                  </select>
                  <input required value={campaignForm.period} onChange={e => setCampaignForm({ ...campaignForm, period: e.target.value })} placeholder="Assessment period *" className="p-2.5 rounded-lg border border-slate-200" />
                  <select value={campaignForm.status} onChange={e => setCampaignForm({ ...campaignForm, status: e.target.value })} className="p-2.5 rounded-lg border border-slate-200">
                    <option>Draft</option><option>Open</option>
                  </select>
                  <label className="space-y-1"><span className="font-bold text-slate-600">Start date *</span><input required type="date" value={campaignForm.startDate} onChange={e => setCampaignForm({ ...campaignForm, startDate: e.target.value })} className="w-full p-2.5 rounded-lg border border-slate-200" /></label>
                  <label className="space-y-1"><span className="font-bold text-slate-600">Due date *</span><input required type="date" value={campaignForm.dueDate} onChange={e => setCampaignForm({ ...campaignForm, dueDate: e.target.value, scopeDueDate: e.target.value })} className="w-full p-2.5 rounded-lg border border-slate-200" /></label>

                  <div className="md:col-span-2 rounded-xl border border-sky-200 bg-sky-50/40 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 font-black text-slate-800">
                          <Building2 className="h-4 w-4 text-sky-600" />
                          Unit Kerja Peserta *
                        </div>
                        <p className="mt-0.5 text-[9px] leading-4 text-slate-500">
                          Pilih satu atau beberapa unit kerja yang terdaftar pada Struktur Organisasi
                          untuk mengikuti campaign {campaignForm.type === 'Combined' ? 'Hybrid' : campaignForm.type}.
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-sky-200 bg-white px-2 py-1 text-[9px] font-black text-sky-700">
                        {campaignForm.organizationUnitIds.length} dipilih
                      </span>
                    </div>

                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <input
                        value={unitSearch}
                        onChange={e => setUnitSearch(e.target.value)}
                        placeholder="Cari kode, nama, atau jenis unit kerja..."
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const visibleIds = filteredOrganizationUnits.map((unit: any) => String(unit.id));
                          const allVisibleSelected =
                            visibleIds.length > 0 &&
                            visibleIds.every((id: string) => campaignForm.organizationUnitIds.includes(id));
                          setCampaignForm(current => ({
                            ...current,
                            organizationUnitIds: allVisibleSelected
                              ? current.organizationUnitIds.filter(id => !visibleIds.includes(id))
                              : Array.from(new Set([...current.organizationUnitIds, ...visibleIds]))
                          }));
                        }}
                        disabled={filteredOrganizationUnits.length === 0}
                        className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-[9px] font-black text-sky-700 disabled:opacity-40"
                      >
                        {filteredOrganizationUnits.length > 0 &&
                        filteredOrganizationUnits.every((unit: any) =>
                          campaignForm.organizationUnitIds.includes(String(unit.id))
                        )
                          ? 'Batalkan semua'
                          : 'Pilih semua'}
                      </button>
                    </div>

                    <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5">
                      {filteredOrganizationUnits.length === 0 ? (
                        <div className="px-2 py-4 text-center text-[9px] text-slate-400">
                          Tidak ada unit kerja aktif yang sesuai.
                        </div>
                      ) : (
                        filteredOrganizationUnits.map((unit: any) => {
                          const unitId = String(unit.id);
                          const checked = campaignForm.organizationUnitIds.includes(unitId);
                          return (
                            <label
                              key={unitId}
                              className={
                                'flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition ' +
                                (checked
                                  ? 'border-sky-200 bg-sky-50'
                                  : 'border-transparent hover:bg-slate-50')
                              }
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setCampaignForm(current => ({
                                    ...current,
                                    organizationUnitIds: checked
                                      ? current.organizationUnitIds.filter(id => id !== unitId)
                                      : [...current.organizationUnitIds, unitId]
                                  }))
                                }
                                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-sky-600"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block text-[10px] font-black text-slate-700">
                                  {unit.code ? unit.code + ' · ' : ''}{unit.name}
                                </span>
                                <span className="mt-0.5 block text-[8px] text-slate-400">
                                  {unit.type || 'Unit Kerja'}
                                  {unit.headName ? ' · Kepala: ' + unit.headName : ''}
                                </span>
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                    <p className="mt-2 text-[8px] leading-3.5 text-slate-400">
                      Hanya unit kerja milik institusi aktif yang dapat didaftarkan pada campaign ini.
                    </p>
                  </div>

                  <input required value={campaignForm.ownerName} onChange={e => setCampaignForm({ ...campaignForm, ownerName: e.target.value })} placeholder="Campaign owner *" className="p-2.5 rounded-lg border border-slate-200" />
                  <input required value={campaignForm.reviewerName} onChange={e => setCampaignForm({ ...campaignForm, reviewerName: e.target.value })} placeholder="Independent reviewer *" className="p-2.5 rounded-lg border border-slate-200" />
                  <input required value={campaignForm.approverName} onChange={e => setCampaignForm({ ...campaignForm, approverName: e.target.value })} placeholder="Approver *" className="p-2.5 rounded-lg border border-slate-200 md:col-span-2" />
                </div>
              </div>

              <div>
                <div className="font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-brand-600" /> Methodology & Evidence
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <select value={campaignForm.methodology} onChange={e => setCampaignForm({ ...campaignForm, methodology: e.target.value })} className="p-2.5 rounded-lg border border-slate-200">
                    <option>COSO / ISO 31000 aligned</option>
                    <option>COSO Internal Control aligned</option>
                    <option>ISO 31000 aligned</option>
                    <option>Internal methodology</option>
                  </select>
                  <select value={campaignForm.ratingScale} onChange={e => setCampaignForm({ ...campaignForm, ratingScale: e.target.value })} className="p-2.5 rounded-lg border border-slate-200">
                    <option>5x5</option><option>4x4</option><option>3x3</option>
                  </select>
                  <label className="md:col-span-2 flex items-center gap-2 rounded-lg border border-slate-200 p-3">
                    <input type="checkbox" checked={campaignForm.evidenceRequired} onChange={e => setCampaignForm({ ...campaignForm, evidenceRequired: e.target.checked })} />
                    <span className="font-bold text-slate-700">Evidence reference mandatory before submission</span>
                  </label>
                  <textarea rows={3} value={campaignForm.instructions} onChange={e => setCampaignForm({ ...campaignForm, instructions: e.target.value })} className="md:col-span-2 p-2.5 rounded-lg border border-slate-200" placeholder="Assessment instructions" />
                </div>
              </div>

              <div>
                <div className="font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-brand-600" /> Initial Scope (optional)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <select
                    value={campaignForm.processId}
                    onChange={e => setCampaignForm({ ...campaignForm, processId: e.target.value, riskId: '', controlId: '' })}
                    className="p-2.5 rounded-lg border border-slate-200 md:col-span-2"
                  >
                    <option value="">Select process</option>
                    {processes.map((process: any) => <option key={process.id} value={process.id}>{process.processId} · {process.name}</option>)}
                  </select>
                  <select value={campaignForm.riskId} onChange={e => setCampaignForm({ ...campaignForm, riskId: e.target.value, controlId: '' })} className="p-2.5 rounded-lg border border-slate-200">
                    <option value="">Risk (optional)</option>
                    {campaignRisks.map((risk: any) => <option key={risk.id} value={risk.id}>{risk.riskId} · {risk.name}</option>)}
                  </select>
                  <select value={campaignForm.controlId} onChange={e => setCampaignForm({ ...campaignForm, controlId: e.target.value })} className="p-2.5 rounded-lg border border-slate-200">
                    <option value="">Control (optional)</option>
                    {campaignControls.map((control: any) => <option key={control.id} value={control.id}>{control.controlId} · {control.name}</option>)}
                  </select>
                  <input value={campaignForm.assessorName} onChange={e => setCampaignForm({ ...campaignForm, assessorName: e.target.value })} placeholder="Assessor / control owner" className="p-2.5 rounded-lg border border-slate-200" />
                  <input type="date" value={campaignForm.scopeDueDate} onChange={e => setCampaignForm({ ...campaignForm, scopeDueDate: e.target.value })} className="p-2.5 rounded-lg border border-slate-200" />
                </div>
              </div>

              {actionError && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700">{actionError}</div>}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setCampaignModal(false)} className="px-4 py-2 rounded-lg text-slate-600 font-bold">Cancel</button>
                <button disabled={saving} type="submit" className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-600 text-white font-bold disabled:opacity-50">
                  <Save className="w-4 h-4" /> {saving ? 'Menyimpan…' : 'Buat Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {scopeCampaign && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl p-5">
            <div className="flex items-center justify-between">
              <div><div className="text-[10px] uppercase font-bold text-brand-600">{scopeCampaign.campaignCode}</div><h3 className="font-black text-lg">Add Assessment Scope</h3></div>
              <button onClick={() => setScopeCampaign(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={addScope} className="mt-4 space-y-3 text-xs">
              <select required value={scopeForm.processId} onChange={e => setScopeForm({ ...scopeForm, processId: e.target.value, riskId: '', controlId: '' })} className="w-full p-2.5 rounded-lg border border-slate-200">
                <option value="">Select process *</option>
                {processes.map((process: any) => <option key={process.id} value={process.id}>{process.processId} · {process.name}</option>)}
              </select>
              <select value={scopeForm.riskId} onChange={e => setScopeForm({ ...scopeForm, riskId: e.target.value, controlId: '' })} className="w-full p-2.5 rounded-lg border border-slate-200">
                <option value="">Risk (optional)</option>
                {scopeRisks.map((risk: any) => <option key={risk.id} value={risk.id}>{risk.riskId} · {risk.name}</option>)}
              </select>
              <select value={scopeForm.controlId} onChange={e => setScopeForm({ ...scopeForm, controlId: e.target.value })} className="w-full p-2.5 rounded-lg border border-slate-200">
                <option value="">Control (optional)</option>
                {scopeControls.map((control: any) => <option key={control.id} value={control.id}>{control.controlId} · {control.name}</option>)}
              </select>
              <input required value={scopeForm.assessorName} onChange={e => setScopeForm({ ...scopeForm, assessorName: e.target.value })} placeholder="Assessor / control owner *" className="w-full p-2.5 rounded-lg border border-slate-200" />
              <label className="block space-y-1"><span className="font-bold text-slate-600">Due date *</span><input required type="date" value={scopeForm.dueDate} onChange={e => setScopeForm({ ...scopeForm, dueDate: e.target.value })} className="w-full p-2.5 rounded-lg border border-slate-200" /></label>
              {actionError && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700">{actionError}</div>}
              <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setScopeCampaign(null)} className="px-4 py-2 font-bold text-slate-600">Cancel</button><button disabled={saving} className="px-4 py-2 rounded-lg bg-brand-600 text-white font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Add Scope'}</button></div>
            </form>
          </div>
        </div>
      )}

      {assessmentScope && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm overflow-y-auto p-4">
          <div className="bg-white rounded-2xl max-w-3xl mx-auto my-4 shadow-2xl">
            <div className="sticky top-0 bg-white rounded-t-2xl border-b border-slate-100 p-5 flex items-center justify-between z-10">
              <div><div className="text-[10px] uppercase font-bold text-brand-600">{assessmentScope.control?.controlId || assessmentScope.risk?.riskId || assessmentScope.process?.processId}</div><h3 className="font-black text-lg">Risk & Control Self-Assessment</h3></div>
              <button onClick={() => setAssessmentScope(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={submitAssessment} className="p-5 space-y-5 text-xs">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <div className="font-bold text-slate-900">{assessmentScope.process?.name}</div>
                {assessmentScope.risk && <div className="text-slate-600 mt-1">Risk: {assessmentScope.risk.riskId} · {assessmentScope.risk.name}</div>}
                {assessmentScope.control && <div className="text-slate-600 mt-1">Control: {assessmentScope.control.controlId} · {assessmentScope.control.name}</div>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input required value={assessmentForm.assessorName} onChange={e => setAssessmentForm({ ...assessmentForm, assessorName: e.target.value })} placeholder="Assessor *" className="p-2.5 rounded-lg border border-slate-200 md:col-span-2" />
                <label className="space-y-1"><span className="font-bold text-slate-600">Design effectiveness *</span><select value={assessmentForm.designEffectiveness} onChange={e => setAssessmentForm({ ...assessmentForm, designEffectiveness: e.target.value })} className="w-full p-2.5 rounded-lg border border-slate-200"><option>Effective</option><option>Partially Effective</option><option>Ineffective</option><option>Not Applicable</option></select></label>
                <label className="space-y-1"><span className="font-bold text-slate-600">Operating effectiveness *</span><select value={assessmentForm.operatingEffectiveness} onChange={e => setAssessmentForm({ ...assessmentForm, operatingEffectiveness: e.target.value })} className="w-full p-2.5 rounded-lg border border-slate-200"><option>Effective</option><option>Partially Effective</option><option>Ineffective</option><option>Not Applicable</option></select></label>
                <label className="space-y-1"><span className="font-bold text-slate-600">Evidence quality *</span><select value={assessmentForm.evidenceQuality} onChange={e => setAssessmentForm({ ...assessmentForm, evidenceQuality: e.target.value })} className="w-full p-2.5 rounded-lg border border-slate-200"><option>Strong</option><option>Adequate</option><option>Limited</option><option>None</option></select></label>
                <label className="space-y-1"><span className="font-bold text-slate-600">Confidence *</span><select value={assessmentForm.confidenceLevel} onChange={e => setAssessmentForm({ ...assessmentForm, confidenceLevel: e.target.value })} className="w-full p-2.5 rounded-lg border border-slate-200"><option>High</option><option>Medium</option><option>Low</option></select></label>
                <label className="space-y-1"><span className="font-bold text-slate-600">Residual likelihood (1–5)</span><input type="number" min={1} max={5} value={assessmentForm.residualLikelihood} onChange={e => setAssessmentForm({ ...assessmentForm, residualLikelihood: Number(e.target.value) })} className="w-full p-2.5 rounded-lg border border-slate-200" /></label>
                <label className="space-y-1"><span className="font-bold text-slate-600">Residual impact (1–5)</span><input type="number" min={1} max={5} value={assessmentForm.residualImpact} onChange={e => setAssessmentForm({ ...assessmentForm, residualImpact: Number(e.target.value) })} className="w-full p-2.5 rounded-lg border border-slate-200" /></label>
                <label className="space-y-1"><span className="font-bold text-slate-600">Overall conclusion *</span><select value={assessmentForm.csaConclusion} onChange={e => setAssessmentForm({ ...assessmentForm, csaConclusion: e.target.value })} className="w-full p-2.5 rounded-lg border border-slate-200"><option>Effective</option><option>Partially Effective</option><option>Ineffective</option><option>Not Applicable</option></select></label>
                <input value={assessmentForm.evidenceRef} onChange={e => setAssessmentForm({ ...assessmentForm, evidenceRef: e.target.value })} placeholder="Evidence reference / document / ticket" className="p-2.5 rounded-lg border border-slate-200" />
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3"><input type="checkbox" checked={assessmentForm.controlPerformed} onChange={e => setAssessmentForm({ ...assessmentForm, controlPerformed: e.target.checked })} /><span className="font-bold">Control performed as prescribed</span></label>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3"><input type="checkbox" checked={assessmentForm.exceptionIdentified} onChange={e => setAssessmentForm({ ...assessmentForm, exceptionIdentified: e.target.checked })} /><span className="font-bold">Exception / deviation identified</span></label>
                <textarea rows={4} value={assessmentForm.comments} onChange={e => setAssessmentForm({ ...assessmentForm, comments: e.target.value })} placeholder="Assessment rationale, evidence summary, observed gaps, and management response" className="md:col-span-2 p-2.5 rounded-lg border border-slate-200" />
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <label className="flex items-center gap-2"><input type="checkbox" checked={assessmentForm.actionRequired} onChange={e => setAssessmentForm({ ...assessmentForm, actionRequired: e.target.checked })} /><span className="font-bold text-amber-900">Remediation / follow-up action required</span></label>
                {assessmentForm.actionRequired && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <input required value={assessmentForm.actionOwner} onChange={e => setAssessmentForm({ ...assessmentForm, actionOwner: e.target.value })} placeholder="Action owner *" className="p-2.5 rounded-lg border border-amber-200 bg-white" />
                    <input required type="date" value={assessmentForm.actionDueDate} onChange={e => setAssessmentForm({ ...assessmentForm, actionDueDate: e.target.value })} className="p-2.5 rounded-lg border border-amber-200 bg-white" />
                  </div>
                )}
              </div>

              {actionError && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700">{actionError}</div>}
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={() => setAssessmentScope(null)} className="px-4 py-2 font-bold text-slate-600">Cancel</button><button disabled={saving} className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-slate-900 text-white font-bold disabled:opacity-50"><CheckCircle2 className="w-4 h-4" />{saving ? 'Submitting…' : 'Submit for Review'}</button></div>
            </form>
          </div>
        </div>
      )}

      {reviewContext && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl p-5">
            <div className="flex items-center justify-between"><div><div className="text-[10px] uppercase font-bold text-emerald-600">Independent review</div><h3 className="font-black text-lg">Review Assessment</h3></div><button onClick={() => setReviewContext(null)}><X className="w-5 h-5 text-slate-400" /></button></div>
            <form onSubmit={submitReview} className="mt-4 space-y-3 text-xs">
              <input required value={reviewForm.reviewerName} onChange={e => setReviewForm({ ...reviewForm, reviewerName: e.target.value })} placeholder="Reviewer *" className="w-full p-2.5 rounded-lg border border-slate-200" />
              <select value={reviewForm.reviewStatus} onChange={e => setReviewForm({ ...reviewForm, reviewStatus: e.target.value })} className="w-full p-2.5 rounded-lg border border-slate-200"><option>Approved</option><option>Needs Revision</option></select>
              <textarea rows={4} value={reviewForm.reviewNotes} onChange={e => setReviewForm({ ...reviewForm, reviewNotes: e.target.value })} placeholder="Reviewer challenge, approval rationale, or revision instructions" className="w-full p-2.5 rounded-lg border border-slate-200" />
              <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-sky-800">
                When approved, residual risk is synchronized to Risk Master and control effectiveness is synchronized to Control Master. Any remediation task remains tracked in Task Center.
              </div>
              {actionError && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700">{actionError}</div>}
              <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setReviewContext(null)} className="px-4 py-2 font-bold text-slate-600">Cancel</button><button disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold disabled:opacity-50"><BadgeCheck className="w-4 h-4" />{saving ? 'Saving…' : 'Save Review'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
