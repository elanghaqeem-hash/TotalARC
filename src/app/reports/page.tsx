'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  X
} from 'lucide-react';
import { useRole } from '@/context/RoleContext';
import { jsonRead } from '@/lib/client-read';
import { aiJsonTransaction, jsonTransaction } from '@/lib/client-transaction';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100';

type ReportTemplate = {
  code: string;
  name: string;
  institutionScope: string;
  regulationReferences: string[];
  effectiveFrom: string;
  verifiedAsOf: string;
  sourceUrls: string[];
  officialAnnexRequired: boolean;
  submissionNote: string;
  sections: Array<{
    key: string;
    title: string;
    guidance: string;
    regulatoryReference: string;
  }>;
};

type ReportSection = {
  id: string;
  reportId: string;
  sectionKey: string;
  orderIndex: number;
  title: string;
  guidance: string;
  regulatoryReference: string;
  content?: string | null;
  analysisSummary?: string | null;
  keyFindings?: string | null;
  rootCause?: string | null;
  impactAnalysis?: string | null;
  recommendation?: string | null;
  managementResponse?: string | null;
  actionPlan?: string | null;
  ownerName?: string | null;
  targetDate?: string | null;
  rating?: string | null;
  evidenceReference?: string | null;
  reviewStatus: string;
};

type RegulatoryReport = {
  id: string;
  institutionId: string;
  legalEntityId?: string | null;
  orgUnitId?: string | null;
  templateCode: string;
  title: string;
  period: string;
  reportingDate: string;
  language: string;
  reportOwner: string;
  reviewerName?: string | null;
  status: string;
  overallRating?: string | null;
  executiveSummary?: string | null;
  conclusion?: string | null;
  aiAnalysis?: {
    overallAnalysis?: string | null;
    evidenceGaps?: string[];
    requestId?: string;
  } | null;
  aiProvider?: string | null;
  aiModel?: string | null;
  aiGeneratedAt?: string | null;
  updatedAt: string;
  sections?: ReportSection[];
};

type WorkspacePayload = {
  templates: ReportTemplate[];
  reports: RegulatoryReport[];
  sourceCounts?: Record<string, number>;
  organization?: {
    legalEntities?: Array<{ id: string; code: string; name: string }>;
    organizationUnits?: Array<{
      id: string;
      code: string;
      name: string;
      legalEntityId?: string | null;
    }>;
  };
};

const sourceCards = [
  { key: 'toeWorkpapers', title: 'ToE workpapers', href: '/toe' },
  { key: 'issuesRemediation', title: 'Issues & remediation', href: '/remediation' },
  { key: 'controlCertifications', title: 'Control certifications', href: '/certification' },
  { key: 'managementAttestations', title: 'Management attestations', href: '/certification' },
  { key: 'rcsaCampaigns', title: 'RCSA / CSA campaigns', href: '/rcsa' },
  { key: 'icofrFinancialAccounts', title: 'ICOFR financial accounts', href: '/icofr' }
] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const { currentUser } = useRole();
  const [workspace, setWorkspace] = useState<WorkspacePayload>({
    templates: [],
    reports: [],
    sourceCounts: {}
  });
  const [selectedReport, setSelectedReport] = useState<RegulatoryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [createForm, setCreateForm] = useState({
    templateCode: '',
    title: '',
    period: '',
    reportingDate: today(),
    orgUnitId: '',
    legalEntityId: '',
    reportOwner: '',
    reviewerName: ''
  });

  const canWrite = Boolean(
    currentUser
      && ['Admin', 'Reviewer', 'Executive', 'Auditor'].includes(currentUser.role)
  );

  const selectedTemplate = useMemo(
    () => workspace.templates.find(item => item.code === selectedReport?.templateCode) || null,
    [workspace.templates, selectedReport?.templateCode]
  );

  const loadWorkspace = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await jsonRead<WorkspacePayload>('/api/reports', { dedupe: false });
      setWorkspace(payload);
      setCreateForm(current => ({
        ...current,
        templateCode:
          current.templateCode || payload.templates?.[0]?.code || '',
        reportOwner:
          current.reportOwner || currentUser?.name || ''
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report workspace unavailable.');
    } finally {
      setLoading(false);
    }
  };

  const loadReport = async (reportId: string) => {
    setDetailLoading(true);
    setError('');
    try {
      const payload = await jsonRead<{ report: RegulatoryReport }>(
        '/api/reports?id=' + encodeURIComponent(reportId),
        { dedupe: false }
      );
      setSelectedReport(payload.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report detail unavailable.');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, [currentUser?.id]);

  const createReport = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const selectedUnit = workspace.organization?.organizationUnits?.find(
        unit => unit.id === createForm.orgUnitId
      );

      const report = await jsonTransaction<RegulatoryReport>('/api/reports', {
        actionType: 'CREATE_REPORT',
        ...createForm,
        legalEntityId:
          selectedUnit?.legalEntityId || createForm.legalEntityId || null
      });

      await loadWorkspace();
      setSelectedReport(report);
      setShowCreate(false);
      setMessage('OJK-aligned report workspace created.');
      setCreateForm(current => ({
        ...current,
        title: '',
        period: '',
        reportingDate: today(),
        orgUnitId: '',
        legalEntityId: '',
        reviewerName: ''
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create report.');
    } finally {
      setSaving(false);
    }
  };

  const updateReportField = (key: keyof RegulatoryReport, value: string) => {
    setSelectedReport(current =>
      current ? { ...current, [key]: value } : current
    );
  };

  const updateSectionField = (
    sectionId: string,
    key: keyof ReportSection,
    value: string
  ) => {
    setSelectedReport(current => {
      if (!current?.sections) return current;
      return {
        ...current,
        sections: current.sections.map(section =>
          section.id === sectionId
            ? { ...section, [key]: value }
            : section
        )
      };
    });
  };

  const saveReportHeader = async () => {
    if (!selectedReport) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const updated = await jsonTransaction<RegulatoryReport>('/api/reports', {
        actionType: 'UPDATE_REPORT',
        reportId: selectedReport.id,
        title: selectedReport.title,
        period: selectedReport.period,
        reportingDate: selectedReport.reportingDate,
        reportOwner: selectedReport.reportOwner,
        reviewerName: selectedReport.reviewerName || null,
        status: selectedReport.status,
        overallRating: selectedReport.overallRating || null,
        executiveSummary: selectedReport.executiveSummary || null,
        conclusion: selectedReport.conclusion || null
      });
      setSelectedReport(updated);
      await loadWorkspace();
      setMessage('Report header and conclusion saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save report.');
    } finally {
      setSaving(false);
    }
  };

  const saveSection = async (section: ReportSection) => {
    if (!selectedReport) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await jsonTransaction('/api/reports', {
        actionType: 'UPDATE_SECTION',
        reportId: selectedReport.id,
        sectionId: section.id,
        content: section.content || null,
        analysisSummary: section.analysisSummary || null,
        keyFindings: section.keyFindings || null,
        rootCause: section.rootCause || null,
        impactAnalysis: section.impactAnalysis || null,
        recommendation: section.recommendation || null,
        managementResponse: section.managementResponse || null,
        actionPlan: section.actionPlan || null,
        ownerName: section.ownerName || null,
        targetDate: section.targetDate || null,
        rating: section.rating || null,
        evidenceReference: section.evidenceReference || null,
        reviewStatus: section.reviewStatus
      });
      await loadReport(selectedReport.id);
      setMessage('Analysis section saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save report section.');
    } finally {
      setSaving(false);
    }
  };

  const generateAiDraft = async () => {
    if (!selectedReport) return;
    setAiLoading(true);
    setMessage('');
    setError('');

    try {
      const payload = await aiJsonTransaction<{
        report: RegulatoryReport;
        disclaimer: string;
      }>('/api/reports/ai', {
        reportId: selectedReport.id,
        applyToContent: true
      });
      setSelectedReport(payload.report);
      await loadWorkspace();
      setMessage('AI analysis generated and inserted as an editable draft. Human review is required.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate AI analysis.');
    } finally {
      setAiLoading(false);
    }
  };

  const templateFor = (report: RegulatoryReport) =>
    workspace.templates.find(template => template.code === report.templateCode);

  return (
    <div className="w-full max-w-full space-y-5 overflow-x-hidden sm:space-y-6">
      <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-emerald-600 sm:text-xs">
              <Download className="h-4 w-4" />
              Workpapers, Analysis & Regulatory Reporting
            </div>
            <h1 className="mt-2 text-2xl font-black leading-tight text-slate-950 sm:text-3xl">
              Report & OJK Analysis Center
            </h1>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500 sm:text-sm">
              Susun analisis berbasis record Total ARC, gunakan AI untuk membuat draft yang dapat diedit,
              dan bangun laporan dengan template regulasi OJK yang terversi.
            </p>
          </div>

          {canWrite && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white shadow-sm"
            >
              <Plus className="h-4 w-4" />
              New OJK Report
            </button>
          )}
        </div>
      </section>

      {message && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {message}
        </div>
      )}

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadWorkspace()}
            className="inline-flex shrink-0 items-center gap-1 font-bold"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      )}

      <section>
        <div className="mb-3">
          <h2 className="text-base font-black text-slate-950 sm:text-lg">Persistent Report Sources</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Counts are queried directly from scoped database records, without loading the complete workpaper payload.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map(item => (
              <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
            {sourceCards.map(source => (
              <Link
                key={source.key}
                href={source.href}
                className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-brand-200 sm:p-5"
              >
                <div className="text-[11px] font-bold leading-4 text-slate-800 sm:text-sm">
                  {source.title}
                </div>
                <div className="mt-2 text-2xl font-black text-brand-600 sm:text-3xl">
                  {workspace.sourceCounts?.[source.key] || 0}
                </div>
                <div className="text-[10px] text-slate-500 sm:text-[11px]">persisted record(s)</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-950 sm:text-lg">OJK Template Library</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Regulation metadata is versioned so the report records which basis was used.
            </p>
          </div>
          <ShieldCheck className="h-5 w-5 shrink-0 text-brand-600" />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {workspace.templates.map(template => (
            <div key={template.code} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-wide text-brand-600">
                    {template.code}
                  </div>
                  <div className="mt-1 text-sm font-black leading-5 text-slate-900">
                    {template.name}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">{template.institutionScope}</div>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
                  {template.sections.length} sections
                </span>
              </div>

              <div className="mt-3 space-y-1 text-[10px] leading-4 text-slate-600">
                {template.regulationReferences.map(reference => (
                  <div key={reference}>• {reference}</div>
                ))}
              </div>

              {template.officialAnnexRequired && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">
                  Official OJK Excel/annex remains mandatory for numeric publication format.
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {template.sourceUrls.map((url, index) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-700"
                  >
                    OJK source {index + 1}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
                <span className="ml-auto text-[9px] text-slate-400">
                  verified {template.verifiedAsOf}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[0.36fr_0.64fr]">
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-black text-slate-950">Saved Reports</h2>
              <p className="text-[11px] text-slate-500">{workspace.reports.length} report workspace(s)</p>
            </div>
            <FileText className="h-5 w-5 text-brand-600" />
          </div>

          <div className="space-y-2">
            {workspace.reports.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs text-slate-500">
                No regulatory report workspace yet.
              </div>
            ) : (
              workspace.reports.map(report => {
                const template = templateFor(report);
                const active = selectedReport?.id === report.id;
                return (
                  <button
                    key={report.id}
                    type="button"
                    onClick={() => void loadReport(report.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      active
                        ? 'border-brand-300 bg-brand-50'
                        : 'border-slate-200 bg-white hover:border-brand-200'
                    }`}
                  >
                    <div className="text-[10px] font-black uppercase text-brand-600">
                      {template?.code || report.templateCode}
                    </div>
                    <div className="mt-0.5 text-xs font-bold leading-4 text-slate-900">
                      {report.title}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-slate-500">
                      <span>{report.period}</span>
                      <span>•</span>
                      <span>{report.status}</span>
                      {report.aiGeneratedAt && (
                        <>
                          <span>•</span>
                          <span>AI draft available</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          {!selectedReport ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <FileCheck2 className="h-8 w-8 text-slate-300" />
              <div className="mt-3 text-sm font-bold text-slate-700">Select or create a report</div>
              <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">
                The editor contains standard analysis fields, OJK references, AI drafting, human review status, and export.
              </p>
            </div>
          ) : detailLoading ? (
            <div className="min-h-[300px] animate-pulse rounded-xl bg-slate-100" />
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-wide text-brand-600">
                    {selectedTemplate?.code || selectedReport.templateCode}
                  </div>
                  <h2 className="mt-1 text-lg font-black leading-tight text-slate-950 sm:text-xl">
                    {selectedReport.title}
                  </h2>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {selectedTemplate?.regulationReferences.join(' · ')}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => void generateAiDraft()}
                      disabled={aiLoading}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-sky-500 px-3 py-2 text-[11px] font-black text-white disabled:opacity-50"
                    >
                      {aiLoading ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {aiLoading ? 'Analyzing…' : 'Generate AI Analysis'}
                    </button>
                  )}
                  <a
                    href={`/api/reports/export?id=${encodeURIComponent(selectedReport.id)}&format=doc`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Word
                  </a>
                  <a
                    href={`/api/reports/export?id=${encodeURIComponent(selectedReport.id)}&format=html`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Preview / Print PDF
                  </a>
                </div>
              </div>

              {selectedTemplate?.officialAnnexRequired && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">
                  <strong>Official annex required.</strong> This workspace does not replace the OJK Excel/annex for numeric publication reporting. Financial figures must be reconciled to the official source and OJK format before submission/publication.
                </div>
              )}

              {selectedReport.aiGeneratedAt && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                  <div className="flex items-center gap-2 text-[11px] font-black text-sky-800">
                    <Bot className="h-4 w-4" />
                    AI Draft — Human Review Required
                  </div>
                  <div className="mt-1 text-[10px] leading-4 text-sky-700">
                    {selectedReport.aiProvider} / {selectedReport.aiModel} · generated{' '}
                    {new Date(selectedReport.aiGeneratedAt).toLocaleString('id-ID')}
                  </div>
                  {selectedReport.aiAnalysis?.overallAnalysis && (
                    <p className="mt-2 text-xs leading-5 text-slate-700">
                      {selectedReport.aiAnalysis.overallAnalysis}
                    </p>
                  )}
                  {(selectedReport.aiAnalysis?.evidenceGaps?.length || 0) > 0 && (
                    <div className="mt-2 text-[10px] leading-4 text-slate-600">
                      <strong>Evidence gaps:</strong>{' '}
                      {selectedReport.aiAnalysis?.evidenceGaps?.join(' · ')}
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs font-bold text-slate-700 md:col-span-2">
                  Report Title
                  <input
                    className={inputClass}
                    value={selectedReport.title}
                    onChange={event => updateReportField('title', event.target.value)}
                    disabled={!canWrite}
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Period
                  <input
                    className={inputClass}
                    value={selectedReport.period}
                    onChange={event => updateReportField('period', event.target.value)}
                    disabled={!canWrite}
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Reporting Date
                  <input
                    type="date"
                    className={inputClass}
                    value={selectedReport.reportingDate}
                    onChange={event => updateReportField('reportingDate', event.target.value)}
                    disabled={!canWrite}
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Report Owner
                  <input
                    className={inputClass}
                    value={selectedReport.reportOwner}
                    onChange={event => updateReportField('reportOwner', event.target.value)}
                    disabled={!canWrite}
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Reviewer
                  <input
                    className={inputClass}
                    value={selectedReport.reviewerName || ''}
                    onChange={event => updateReportField('reviewerName', event.target.value)}
                    disabled={!canWrite}
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Status
                  <select
                    className={inputClass}
                    value={selectedReport.status}
                    onChange={event => updateReportField('status', event.target.value)}
                    disabled={!canWrite}
                  >
                    <option>Draft</option>
                    <option>In Review</option>
                    <option>Approved</option>
                    <option>Final</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Overall Rating / Conclusion Level
                  <input
                    className={inputClass}
                    value={selectedReport.overallRating || ''}
                    onChange={event => updateReportField('overallRating', event.target.value)}
                    placeholder="Human-reviewed rating"
                    disabled={!canWrite}
                  />
                </label>
                <label className="text-xs font-bold text-slate-700 md:col-span-2">
                  Executive Summary
                  <textarea
                    className={inputClass}
                    rows={5}
                    value={selectedReport.executiveSummary || ''}
                    onChange={event => updateReportField('executiveSummary', event.target.value)}
                    disabled={!canWrite}
                  />
                </label>
                <label className="text-xs font-bold text-slate-700 md:col-span-2">
                  Overall Conclusion
                  <textarea
                    className={inputClass}
                    rows={4}
                    value={selectedReport.conclusion || ''}
                    onChange={event => updateReportField('conclusion', event.target.value)}
                    disabled={!canWrite}
                  />
                </label>
              </div>

              {canWrite && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveReportHeader()}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    Save Report Header
                  </button>
                </div>
              )}

              <div className="border-t border-slate-100 pt-4">
                <div className="mb-3">
                  <h3 className="text-sm font-black text-slate-900">Standard Analysis Sections</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Every section supports editable narrative, findings, root cause, impact, recommendation, management response, action plan, rating, and evidence reference.
                  </p>
                </div>

                <div className="space-y-2.5">
                  {(selectedReport.sections || []).map((section, index) => (
                    <details
                      key={section.id}
                      className="group rounded-2xl border border-slate-200 bg-slate-50/50"
                      open={index === 0}
                    >
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <div className="text-[10px] font-black uppercase text-brand-600">
                            Section {index + 1} · {section.reviewStatus}
                          </div>
                          <div className="mt-1 text-xs font-black leading-4 text-slate-900 sm:text-sm">
                            {section.title}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-500">
                            {section.regulatoryReference}
                          </div>
                        </div>
                        <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
                      </summary>

                      <div className="border-t border-slate-200 bg-white p-4">
                        <div className="mb-4 rounded-xl bg-slate-50 p-3 text-[10px] leading-4 text-slate-600">
                          <strong>Guidance:</strong> {section.guidance}
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          {[
                            ['content', 'Narasi / Content', 5],
                            ['analysisSummary', 'Analisis', 4],
                            ['keyFindings', 'Temuan Utama', 4],
                            ['rootCause', 'Root Cause', 3],
                            ['impactAnalysis', 'Analisis Dampak', 3],
                            ['recommendation', 'Rekomendasi', 3],
                            ['managementResponse', 'Tanggapan Manajemen', 3],
                            ['actionPlan', 'Action Plan', 3],
                            ['evidenceReference', 'Evidence Reference / Traceability', 3]
                          ].map(([key, label, rows]) => (
                            <label
                              key={String(key)}
                              className={`text-xs font-bold text-slate-700 ${
                                key === 'content' || key === 'analysisSummary'
                                  ? 'md:col-span-2'
                                  : ''
                              }`}
                            >
                              {label}
                              <textarea
                                className={inputClass}
                                rows={Number(rows)}
                                value={String(section[key as keyof ReportSection] || '')}
                                onChange={event =>
                                  updateSectionField(
                                    section.id,
                                    key as keyof ReportSection,
                                    event.target.value
                                  )
                                }
                                disabled={!canWrite}
                              />
                            </label>
                          ))}

                          <label className="text-xs font-bold text-slate-700">
                            PIC / Owner
                            <input
                              className={inputClass}
                              value={section.ownerName || ''}
                              onChange={event => updateSectionField(section.id, 'ownerName', event.target.value)}
                              disabled={!canWrite}
                            />
                          </label>
                          <label className="text-xs font-bold text-slate-700">
                            Target Date
                            <input
                              type="date"
                              className={inputClass}
                              value={section.targetDate || ''}
                              onChange={event => updateSectionField(section.id, 'targetDate', event.target.value)}
                              disabled={!canWrite}
                            />
                          </label>
                          <label className="text-xs font-bold text-slate-700">
                            Rating / Assessment
                            <input
                              className={inputClass}
                              value={section.rating || ''}
                              onChange={event => updateSectionField(section.id, 'rating', event.target.value)}
                              placeholder="Human-reviewed assessment"
                              disabled={!canWrite}
                            />
                          </label>
                          <label className="text-xs font-bold text-slate-700">
                            Review Status
                            <select
                              className={inputClass}
                              value={section.reviewStatus}
                              onChange={event => updateSectionField(section.id, 'reviewStatus', event.target.value)}
                              disabled={!canWrite}
                            >
                              <option>Draft</option>
                              <option>AI Draft — Human Review Required</option>
                              <option>Reviewed</option>
                              <option>Approved</option>
                              <option>Needs Update</option>
                            </select>
                          </label>
                        </div>

                        {canWrite && (
                          <div className="mt-4 flex justify-end">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void saveSection(section)}
                              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 disabled:opacity-50"
                            >
                              <Save className="h-3.5 w-3.5" />
                              Save Section
                            </button>
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <form
            onSubmit={createReport}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:rounded-[28px] sm:p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wide text-brand-600">
                  Regulatory Report Builder
                </div>
                <h2 className="mt-1 text-xl font-black text-slate-950">Create OJK Report Workspace</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-xs font-bold text-slate-700 md:col-span-2">
                OJK Template *
                <select
                  className={inputClass}
                  value={createForm.templateCode}
                  onChange={event =>
                    setCreateForm(current => ({ ...current, templateCode: event.target.value }))
                  }
                  required
                >
                  <option value="">Select template</option>
                  {workspace.templates.map(template => (
                    <option key={template.code} value={template.code}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700 md:col-span-2">
                Custom Report Title
                <input
                  className={inputClass}
                  value={createForm.title}
                  onChange={event => setCreateForm(current => ({ ...current, title: event.target.value }))}
                  placeholder="Leave blank to use template title"
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Period *
                <input
                  className={inputClass}
                  value={createForm.period}
                  onChange={event => setCreateForm(current => ({ ...current, period: event.target.value }))}
                  placeholder="2026 / 2026 Q4 / Dec 2026"
                  required
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Reporting Date *
                <input
                  type="date"
                  className={inputClass}
                  value={createForm.reportingDate}
                  onChange={event => setCreateForm(current => ({ ...current, reportingDate: event.target.value }))}
                  required
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Organization Unit
                <select
                  className={inputClass}
                  value={createForm.orgUnitId}
                  onChange={event => {
                    const unit = workspace.organization?.organizationUnits?.find(
                      item => item.id === event.target.value
                    );
                    setCreateForm(current => ({
                      ...current,
                      orgUnitId: event.target.value,
                      legalEntityId: unit?.legalEntityId || current.legalEntityId
                    }));
                  }}
                >
                  <option value="">Enterprise scope</option>
                  {workspace.organization?.organizationUnits?.map(unit => (
                    <option key={unit.id} value={unit.id}>
                      {unit.code} · {unit.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">
                Legal Entity
                <select
                  className={inputClass}
                  value={createForm.legalEntityId}
                  onChange={event => setCreateForm(current => ({ ...current, legalEntityId: event.target.value }))}
                >
                  <option value="">Use institution / unit context</option>
                  {workspace.organization?.legalEntities?.map(entity => (
                    <option key={entity.id} value={entity.id}>
                      {entity.code} · {entity.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">
                Report Owner *
                <input
                  className={inputClass}
                  value={createForm.reportOwner}
                  onChange={event => setCreateForm(current => ({ ...current, reportOwner: event.target.value }))}
                  required
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Reviewer
                <input
                  className={inputClass}
                  value={createForm.reviewerName}
                  onChange={event => setCreateForm(current => ({ ...current, reviewerName: event.target.value }))}
                />
              </label>
            </div>

            <div className="mt-5 rounded-xl border border-sky-100 bg-sky-50 p-3 text-[10px] leading-4 text-sky-800">
              AI can draft analysis from persisted Total ARC records after creation. The AI draft is editable and is always marked for human review before approval/finalization.
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {saving ? 'Creating…' : 'Create Report'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
