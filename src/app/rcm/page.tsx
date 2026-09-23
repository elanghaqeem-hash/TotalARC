'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileSpreadsheet,
  Download,
  Search,
  Filter,
  Layers,
  AlertTriangle,
  Shield,
  BadgeCheck,
  ChevronDown,
  ArrowUpDown,
  FileCheck2,
  Cpu,
  Eye,
  SlidersHorizontal,
  Pencil,
  Save,
  X
} from 'lucide-react';
import { getRiskBadgeClasses, getHealthBadgeClasses } from '@/lib/utils';

let rcmCache: { rows: any[]; governance: any; bpmCoverage: any[] } | null = null;
let rcmRequest: Promise<{ rows: any[]; governance: any; bpmCoverage: any[] }> | null = null;

function fetchRcmRows() {
  if (!rcmRequest) {
    rcmRequest = fetch('/api/rcm', { cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error('RCM data unavailable');
        return res.json();
      })
      .then(payload => {
        const result = {
          rows: Array.isArray(payload.rcm) ? payload.rcm : [],
          governance: payload.governance || null,
          bpmCoverage: Array.isArray(payload.bpmCoverage) ? payload.bpmCoverage : []
        };
        rcmCache = result;
        return result;
      })
      .finally(() => {
        rcmRequest = null;
      });
  }
  return rcmRequest;
}

export default function RCMWorkspacePage() {
  const [rcmRows, setRcmRows] = useState<any[]>(rcmCache?.rows || []);
  const [governance, setGovernance] = useState<any>(rcmCache?.governance || null);
  const [bpmCoverage, setBpmCoverage] = useState<any[]>(rcmCache?.bpmCoverage || []);
  const [loading, setLoading] = useState(rcmCache === null);
  const [actionBusy, setActionBusy] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [editingDraft, setEditingDraft] = useState<any | null>(null);
  const [draftEditForm, setDraftEditForm] = useState({
    processObjective: '',
    riskName: '',
    riskDescription: '',
    riskCause: '',
    riskEvent: '',
    riskImpact: '',
    riskCategory: '',
    riskOwnerName: '',
    controlName: '',
    controlDescription: '',
    controlObjective: '',
    controlOwner: '',
    controlType: 'Preventive',
    controlNature: 'Manual',
    controlMethod: 'Validation',
    controlFrequency: 'Per Transaction',
    evidenceRequirement: '',
    systemDependency: ''
  });
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  useEffect(() => {
    let active = true;

    if (rcmCache !== null) {
      setRcmRows(rcmCache.rows);
      setGovernance(rcmCache.governance);
      setBpmCoverage(rcmCache.bpmCoverage);
      setLoading(false);
    }

    fetchRcmRows()
      .then(result => {
        if (active) {
          setRcmRows(result.rows);
          setGovernance(result.governance);
          setBpmCoverage(result.bpmCoverage);
        }
      })
      .catch(err => {
        console.error(err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const filtered = rcmRows.filter(row => {
    const matchSearch =
      row.processName?.toLowerCase().includes(search.toLowerCase()) ||
      row.riskName?.toLowerCase().includes(search.toLowerCase()) ||
      row.controlName?.toLowerCase().includes(search.toLowerCase()) ||
      row.controlId?.toLowerCase().includes(search.toLowerCase());

    if (filterType === 'KEY_ONLY') return matchSearch && row.isKeyControl;
    if (filterType === 'ICOFR_ONLY') return matchSearch && row.isIcofrKey;
    if (filterType === 'PENDING_MAPPING') {
      return matchSearch && String(row.mappingStatus || '').startsWith('PENDING');
    }
    if (filterType === 'DRAFT_VALIDATION') {
      return matchSearch && row.validationStatus === 'PENDING_USER_VALIDATION';
    }
    if (filterType === 'ISSUES_ONLY') return matchSearch && row.issueId;
    return matchSearch;
  });

  const operationalRows = rcmRows.filter(row => !row.isDraftRcm);
  const uniqueControlCount = new Set(operationalRows.map(row => row.controlId)).size;
  const draftValidationRows = rcmRows.filter(
    row => row.validationStatus === 'PENDING_USER_VALIDATION'
  );
  const buildReadyBpm = bpmCoverage.filter(row => row.generationEligible);
  const mappingReviewBpm = bpmCoverage.filter(
    row => row.coverageStatus === 'MAPPING_REVIEW_REQUIRED'
  );
  const uusDraftCount = new Set(
    rcmRows.filter(row => row.sourceCycle === 'SYH').map(row => row.controlId)
  ).size;
  const itgcCount = new Set(
    rcmRows.filter(row => row.isItgc).map(row => row.controlId)
  ).size;
  const pendingMappingCount = new Set(
    rcmRows
      .filter(row => String(row.mappingStatus || '').startsWith('PENDING'))
      .map(row => row.controlId)
  ).size;
  const ckpnRequirementCount = Array.isArray(governance?.requirements)
    ? governance.requirements.filter((item: any) => item.category === 'CKPN').length
    : 0;
  const reverseRepoRequirementCount = Array.isArray(governance?.requirements)
    ? governance.requirements.filter((item: any) => item.category === 'Reverse Repo').length
    : 0;
  const elcReferenceCount = Array.isArray(governance?.draftReferenceSummary)
    ? governance.draftReferenceSummary
        .filter((item: any) => item.sourceStatus === 'ILLUSTRATIVE_DRAFT')
        .reduce((sum: number, item: any) => sum + Number(item.records || 0), 0)
    : 0;

  const refreshRcmData = async () => {
    const result = await fetchRcmRows();
    setRcmRows(result.rows);
    setGovernance(result.governance);
    setBpmCoverage(result.bpmCoverage);
  };

  const generateMissingRcmDrafts = async () => {
    if (buildReadyBpm.length === 0) return;
    setActionBusy('generate');
    setActionMessage('');

    try {
      const response = await fetch('/api/rcm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'GENERATE_BPM_DRAFTS',
          processIds: buildReadyBpm.map(row => row.id)
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to generate RCM drafts.');

      setActionMessage(
        `${Number(payload.generated || 0)} draft RCM berhasil disusun dari BPM dan menunggu validasi user.`
      );
      await refreshRcmData();
      setFilterType('DRAFT_VALIDATION');
    } catch (error) {
      setActionMessage(
        error instanceof Error ? error.message : 'Unable to generate RCM drafts.'
      );
    } finally {
      setActionBusy('');
    }
  };

  const reviewDraft = async (row: any, decision: 'APPROVE' | 'REJECT') => {
    if (!row.draftReferenceId) return;
    setActionBusy(String(row.draftReferenceId));
    setActionMessage('');

    try {
      const response = await fetch('/api/rcm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftReferenceId: row.draftReferenceId,
          decision
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to review RCM draft.');

      setActionMessage(
        decision === 'APPROVE'
          ? `Draft RCM ${row.controlId} tervalidasi dan dipromosikan menjadi RCM operasional.`
          : `Draft RCM ${row.controlId} ditolak dan tidak digunakan sebagai RCM operasional.`
      );
      await refreshRcmData();
    } catch (error) {
      setActionMessage(
        error instanceof Error ? error.message : 'Unable to review RCM draft.'
      );
    } finally {
      setActionBusy('');
    }
  };


  const openDraftUpdate = (row: any) => {
    setEditingDraft(row);
    setDraftEditForm({
      processObjective: row.processObjective || '',
      riskName: row.riskName || '',
      riskDescription: row.riskDescription || '',
      riskCause: row.riskCause || '',
      riskEvent: row.riskEvent || '',
      riskImpact: row.riskImpact || '',
      riskCategory: row.riskCategory || '',
      riskOwnerName: row.riskOwnerName || row.controlOwner || '',
      controlName: row.controlName || '',
      controlDescription: row.controlDescription || '',
      controlObjective: row.controlObjective || '',
      controlOwner: row.controlOwner || '',
      controlType: row.controlType || 'Preventive',
      controlNature: row.controlNature || 'Manual',
      controlMethod: row.controlMethod || 'Validation',
      controlFrequency: row.controlFrequency || 'Per Transaction',
      evidenceRequirement: row.evidenceRequirement || '',
      systemDependency: row.systemDependency || ''
    });
  };

  const saveDraftUpdate = async () => {
    if (!editingDraft?.draftReferenceId) return;
    setActionBusy(String(editingDraft.draftReferenceId));
    setActionMessage('');

    try {
      const riskUpdates = editingDraft.riskEditable
        ? {
            name: draftEditForm.riskName,
            description: draftEditForm.riskDescription,
            cause: draftEditForm.riskCause,
            event: draftEditForm.riskEvent,
            impact: draftEditForm.riskImpact,
            category: draftEditForm.riskCategory,
            ownerName: draftEditForm.riskOwnerName
          }
        : undefined;

      const response = await fetch('/api/rcm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'UPDATE_DRAFT',
          draftReferenceId: editingDraft.draftReferenceId,
          updates: {
            processObjective: draftEditForm.processObjective,
            ...(riskUpdates ? { risk: riskUpdates } : {}),
            control: {
              name: draftEditForm.controlName,
              description: draftEditForm.controlDescription,
              objective: draftEditForm.controlObjective,
              controlOwner: draftEditForm.controlOwner,
              type: draftEditForm.controlType,
              nature: draftEditForm.controlNature,
              method: draftEditForm.controlMethod,
              frequency: draftEditForm.controlFrequency,
              evidenceRequirement: draftEditForm.evidenceRequirement,
              systemDependency: draftEditForm.systemDependency
            }
          }
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to update RCM draft.');

      setActionMessage(
        `Draft RCM ${editingDraft.controlId} berhasil di-update dan tetap menunggu validasi user.`
      );
      setEditingDraft(null);
      await refreshRcmData();
      setFilterType('DRAFT_VALIDATION');
    } catch (error) {
      setActionMessage(
        error instanceof Error ? error.message : 'Unable to update RCM draft.'
      );
    } finally {
      setActionBusy('');
    }
  };

  // Client CSV Export
  const exportToCSV = () => {
    const headers = [
      'Row',
      'Process ID',
      'Process Name',
      'Process Objective',
      'Risk ID',
      'Risk Name',
      'Risk Cause',
      'Risk Impact',
      'Inherent Likelihood',
      'Inherent Impact',
      'Inherent Score',
      'Inherent Rating',
      'Source Risk Rating',
      'Inherent Assessment Status',
      'Control ID',
      'Control Name',
      'Control Owner',
      'Control Type',
      'Control Nature',
      'Frequency',
      'Key Control',
      'Mapping Status',
      'Validation Status',
      'ToE Conclusion',
      'Residual Score',
      'Issue ID',
      'MAP Status'
    ];

    const rows = filtered.map(r => [
      r.rowNumber,
      `"${r.processId}"`,
      `"${r.processName}"`,
      `"${r.processObjective?.replace(/"/g, '""')}"`,
      `"${r.riskId}"`,
      `"${r.riskName?.replace(/"/g, '""')}"`,
      `"${r.riskCause?.replace(/"/g, '""')}"`,
      `"${r.riskImpact?.replace(/"/g, '""')}"`,
      r.inherentLikelihood || 0,
      r.inherentImpact || 0,
      r.inherentScore || 0,
      `"${r.inherentRating || 'Not Assessed'}"`,
      `"${String(r.inherentSourceRating || '').replace(/"/g, '""')}"`,
      `"${r.inherentAssessmentStatus || ''}"`,
      `"${r.controlId}"`,
      `"${r.controlName?.replace(/"/g, '""')}"`,
      `"${r.controlOwner}"`,
      `"${r.controlType}"`,
      `"${r.controlNature}"`,
      `"${r.controlFrequency}"`,
      r.isKeyControl ? 'Yes' : 'No',
      `"${r.mappingStatus || ''}"`,
      `"${r.validationStatus || ''}"`,
      `"${r.toeConclusion}"`,
      `"${r.residualScore} (${r.residualRating})"`,
      r.issueId || 'None',
      r.mapStatus || 'None'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Total_ARC_RCM_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-brand-600 uppercase tracking-wider">
            <FileSpreadsheet className="w-4 h-4" />
            <span>Dynamic RCM Workspace (MANAGE)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Enterprise Risk Control Matrix (RCM)
          </h1>
        </div>

        <div className="flex items-center space-x-3">
          {/* Switch View */}
          <div className="hidden sm:flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Spreadsheet Grid
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                viewMode === 'cards' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Card View (Mobile-First)
            </button>
          </div>

          <button
            onClick={exportToCSV}
            className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm shadow-emerald-500/20 transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Export RCM (CSV/Excel)</span>
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-brand-700">
              <Shield className="h-3.5 w-3.5" />
              Source & Integrity Governance
            </div>
            <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-slate-500">
              RCM distinguishes operational Draft controls from legacy source values, design requirements,
              and illustrative ELC references. Pending evidence is shown explicitly rather than inferred.
            </p>
          </div>
          <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-black ${
            governance?.latestIntegrity?.status === 'PASS'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
          }`}>
            Integrity {governance?.latestIntegrity?.status || 'Pending'}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {[
            ['Operational Draft', uniqueControlCount, 'ControlMaster'],
            ['Legacy Register', Number(governance?.legacyTotal || 0), 'reconciled source'],
            ['UUS Draft', uusDraftCount, 'walkthrough pending'],
            ['ITGC', itgcCount, '4 domains'],
            ['CKPN / Rev Repo', ckpnRequirementCount + reverseRepoRequirementCount, 'design requirements'],
            ['ELC Reference', elcReferenceCount, 'illustrative only']
          ].map(([label, value, note]) => (
            <div key={String(label)} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div>
              <div className="mt-1 text-xl font-black text-slate-900">{Number(value)}</div>
              <div className="mt-0.5 truncate text-[9px] text-slate-400">{note}</div>
            </div>
          ))}
        </div>

        {pendingMappingCount > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>{pendingMappingCount} control</strong> masih memiliki risk mapping pending.
              Control tetap terlihat untuk cleansing, tetapi belum diperlakukan sebagai RCM lengkap untuk testing.
            </span>
          </div>
        )}
      </section>


      <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-violet-700">
              <FileCheck2 className="h-3.5 w-3.5" />
              BPM → RCM Draft Coverage
            </div>
            <h2 className="mt-1 text-base font-black text-slate-900">
              Susun RCM draft untuk BPM yang belum memiliki RCM
            </h2>
            <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-slate-600">
              Total ARC hanya menyusun draft dari konteks BPM yang tersimpan. Draft tidak masuk Risk/Control
              operasional dan tidak dapat digunakan untuk testing sampai user melakukan validasi.
            </p>
          </div>
          <button
            type="button"
            onClick={generateMissingRcmDrafts}
            disabled={actionBusy !== '' || buildReadyBpm.length === 0}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {actionBusy === 'generate'
              ? 'Menyusun Draft...'
              : `Susun Draft RCM (${buildReadyBpm.length} BPM)`}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['BPM tanpa RCM', bpmCoverage.length],
            ['Siap dibuat draft', buildReadyBpm.length],
            ['Menunggu validasi', draftValidationRows.length],
            ['Perlu mapping review', mappingReviewBpm.length]
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-violet-100 bg-white p-3">
              <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div>
              <div className="mt-1 text-xl font-black text-slate-900">{Number(value)}</div>
            </div>
          ))}
        </div>

        {mappingReviewBpm.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>{mappingReviewBpm.length} BPM</strong> sudah memiliki control tetapi belum memiliki
              risk-control mapping lengkap. Total ARC tidak membuat mapping secara spekulatif dan meminta
              review mapping terlebih dahulu.
            </span>
          </div>
        )}

        {actionMessage && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-700">
            {actionMessage}
          </div>
        )}

        {draftValidationRows.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-black text-slate-900">Validation Queue</h3>
              <span className="rounded-full bg-violet-100 px-2 py-1 text-[9px] font-black text-violet-700">
                {draftValidationRows.length} draft
              </span>
            </div>
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {draftValidationRows.map(row => (
                <div
                  key={row.id}
                  className="rounded-xl border border-violet-100 bg-white p-3 sm:flex sm:items-start sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-violet-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-violet-700">
                        {row.processId}
                      </span>
                      <span className="rounded border border-violet-200 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">
                        DRAFT · USER VALIDATION REQUIRED
                      </span>
                    </div>
                    <div className="mt-1 text-xs font-black text-slate-900">{row.processName}</div>
                    <div className="mt-1 text-[11px] text-slate-600">
                      <strong>Risk:</strong> {row.riskName}
                    </div>
                    <div className="text-[11px] text-slate-600">
                      <strong>Control:</strong> {row.controlName}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400">
                      Owner: {row.controlOwner || 'Pending validation'} · Frequency: {row.controlFrequency}
                    </div>
                  </div>
                  <div className="mt-3 flex shrink-0 flex-wrap gap-2 sm:mt-0">
                    <button
                      type="button"
                      disabled={actionBusy !== ''}
                      onClick={() => openDraftUpdate(row)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Update
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy !== ''}
                      onClick={() => reviewDraft(row, 'REJECT')}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy !== ''}
                      onClick={() => reviewDraft(row, 'APPROVE')}
                      className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Validate & Use
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>


      {editingDraft && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-5xl sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-violet-100 px-2 py-1 font-mono text-[10px] font-bold text-violet-700">
                    {editingDraft.processId}
                  </span>
                  <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-black text-amber-700">
                    DRAFT · NOT YET OPERATIONAL
                  </span>
                </div>
                <h2 className="mt-2 text-base font-black text-slate-900">Update RCM Draft</h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  Perubahan hanya disimpan pada draft. Risk/Control operasional baru berubah setelah Validate & Use.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingDraft(null)}
                disabled={actionBusy !== ''}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                aria-label="Close update draft"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 p-4 sm:p-6">
              <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <h3 className="text-xs font-black text-slate-900">BPM Context</h3>
                <div className="mt-3">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Process Objective
                  </label>
                  <textarea
                    value={draftEditForm.processObjective}
                    onChange={e => setDraftEditForm(current => ({ ...current, processObjective: e.target.value }))}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                  />
                </div>
              </section>

              <section className="rounded-xl border border-amber-200 bg-amber-50/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-black text-slate-900">Risk Draft</h3>
                  {!editingDraft.riskEditable && (
                    <span className="rounded-full border border-amber-200 bg-white px-2 py-1 text-[9px] font-bold text-amber-700">
                      Existing RiskMaster · locked
                    </span>
                  )}
                </div>
                {!editingDraft.riskEditable && (
                  <p className="mt-2 text-[10px] leading-relaxed text-amber-800">
                    Risk ini berasal dari RiskMaster yang sudah ada. Koreksi risk dilakukan melalui modul Risk agar
                    source record tetap konsisten; dari halaman ini Anda tetap dapat meng-update rancangan control.
                  </p>
                )}
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {[
                    ['riskName', 'Risk Name'],
                    ['riskCategory', 'Risk Category'],
                    ['riskOwnerName', 'Risk Owner']
                  ].map(([field, label]) => (
                    <label key={field} className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {label}
                      <input
                        value={(draftEditForm as any)[field]}
                        disabled={!editingDraft.riskEditable}
                        onChange={e => setDraftEditForm(current => ({ ...current, [field]: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-800 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {[
                    ['riskDescription', 'Risk Description'],
                    ['riskCause', 'Cause'],
                    ['riskEvent', 'Risk Event'],
                    ['riskImpact', 'Impact']
                  ].map(([field, label]) => (
                    <label key={field} className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {label}
                      <textarea
                        value={(draftEditForm as any)[field]}
                        disabled={!editingDraft.riskEditable}
                        onChange={e => setDraftEditForm(current => ({ ...current, [field]: e.target.value }))}
                        rows={3}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-800 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-sky-200 bg-sky-50/30 p-4">
                <h3 className="text-xs font-black text-slate-900">Control Draft</h3>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {[
                    ['controlName', 'Control Name'],
                    ['controlOwner', 'Control Owner'],
                    ['controlType', 'Control Type'],
                    ['controlNature', 'Control Nature'],
                    ['controlMethod', 'Control Method'],
                    ['controlFrequency', 'Frequency'],
                    ['systemDependency', 'System Dependency']
                  ].map(([field, label]) => (
                    <label key={field} className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {label}
                      <input
                        value={(draftEditForm as any)[field]}
                        onChange={e => setDraftEditForm(current => ({ ...current, [field]: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-800 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {[
                    ['controlDescription', 'Control Description'],
                    ['controlObjective', 'Control Objective'],
                    ['evidenceRequirement', 'Evidence Requirement']
                  ].map(([field, label]) => (
                    <label key={field} className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {label}
                      <textarea
                        value={(draftEditForm as any)[field]}
                        onChange={e => setDraftEditForm(current => ({ ...current, [field]: e.target.value }))}
                        rows={3}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-800 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                      />
                    </label>
                  ))}
                </div>
              </section>
            </div>

            <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                type="button"
                disabled={actionBusy !== ''}
                onClick={() => setEditingDraft(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy !== ''}
                onClick={saveDraftUpdate}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-sky-800 disabled:bg-slate-300"
              >
                <Save className="h-4 w-4" />
                {actionBusy === String(editingDraft.draftReferenceId) ? 'Saving...' : 'Save Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
        <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.72fr)] 2xl:items-stretch">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search process, risk, control, or control ID"
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 2xl:hidden">
              <Filter className="h-3.5 w-3.5" />
              Filter view
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              {[
                {
                  key: 'ALL',
                  label: 'All Mappings',
                  count: rcmRows.length,
                  icon: Layers
                },
                {
                  key: 'KEY_ONLY',
                  label: 'Key Controls',
                  count: rcmRows.filter(row => row.isKeyControl).length,
                  icon: Shield
                },
                {
                  key: 'ICOFR_ONLY',
                  label: 'ICOFR Scope',
                  count: rcmRows.filter(row => row.isIcofrKey).length,
                  icon: FileCheck2
                },
                {
                  key: 'PENDING_MAPPING',
                  label: 'Risk Mapping Pending',
                  count: pendingMappingCount,
                  icon: AlertTriangle
                },
                {
                  key: 'DRAFT_VALIDATION',
                  label: 'Draft Validation',
                  count: draftValidationRows.length,
                  icon: FileCheck2
                },
                {
                  key: 'ISSUES_ONLY',
                  label: 'Remediation / MAP',
                  count: rcmRows.filter(row => row.issueId).length,
                  icon: BadgeCheck
                }
              ].map(option => {
                const Icon = option.icon;
                const active = filterType === option.key;

                return (
                  <button
                    key={option.key}
                    type="button"
                    title={option.label}
                    onClick={() => setFilterType(option.key)}
                    aria-pressed={active}
                    className={`group flex min-h-[58px] min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all ${
                      active
                        ? 'border-brand-600 bg-brand-600 text-white shadow-md shadow-sky-100'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-brand-200 hover:bg-brand-50/60 hover:text-brand-800'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        active
                          ? 'bg-white/15 text-white'
                          : 'bg-white text-slate-500 ring-1 ring-slate-200 group-hover:text-brand-700'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block whitespace-normal break-words text-[10px] font-bold leading-4 sm:text-[11px]">
                        {option.label}
                      </span>
                      <span className={`mt-0.5 block text-[9px] leading-3 ${active ? 'text-white/75' : 'text-slate-400'}`}>
                        {option.count} record{option.count === 1 ? '' : 's'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[10px] text-slate-500">
          <span>
            Showing <strong className="text-slate-700">{filtered.length}</strong> of <strong className="text-slate-700">{rcmRows.length}</strong> mappings
          </span>
          {(search || filterType !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFilterType('ALL');
              }}
              className="font-bold text-brand-700 transition hover:text-brand-800"
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      {/* SPREADSHEET GRID VIEW (Desktop) */}
      {viewMode === 'table' ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[750px] relative">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100/90 sticky top-0 z-20 border-b border-slate-200 text-[11px] font-bold text-slate-700 tracking-wider uppercase">
                <tr>
                  <th className="py-3 px-3 w-12 text-center border-r border-slate-200">#</th>
                  <th className="py-3 px-4 min-w-[140px] border-r border-slate-200 bg-slate-100">Process (L2)</th>
                  <th className="py-3 px-4 min-w-[180px] border-r border-slate-200">Process Objective</th>
                  <th className="py-3 px-4 min-w-[200px] border-r border-slate-200 bg-amber-50/50">Risk (Event & Impact)</th>
                  <th className="py-3 px-3 min-w-[150px] text-center border-r border-slate-200">Inherent Risk</th>
                  <th className="py-3 px-4 min-w-[220px] border-r border-slate-200 bg-sky-50/50">Control Master</th>
                  <th className="py-3 px-3 min-w-[100px] border-r border-slate-200">Type & Nature</th>
                  <th className="py-3 px-3 min-w-[110px] text-center border-r border-slate-200">ToE Testing</th>
                  <th className="py-3 px-3 min-w-[90px] text-center border-r border-slate-200">Residual</th>
                  <th className="py-3 px-4 min-w-[200px] bg-emerald-50/50">Remediation / MAP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {filtered.map(row => {
                  const riskBadge = getRiskBadgeClasses(row.inherentRating);
                  const resBadge = getRiskBadgeClasses(row.residualRating);
                  const inherentLikelihood = Number(row.inherentLikelihood || 0);
                  const inherentImpact = Number(row.inherentImpact || 0);
                  const hasValidatedInherent =
                    inherentLikelihood >= 1 &&
                    inherentLikelihood <= 5 &&
                    inherentImpact >= 1 &&
                    inherentImpact <= 5 &&
                    Number(row.inherentScore || 0) > 0;
                  const sourceRiskRating = String(row.inherentSourceRating || '').trim();
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 text-center font-mono text-slate-400 border-r border-slate-200">
                        {row.rowNumber}
                      </td>

                      {/* Process */}
                      <td className="py-3 px-4 border-r border-slate-200">
                        <div className="font-bold text-slate-900">{row.processName}</div>
                        <div className="text-[10px] font-mono text-brand-600">{row.processId}</div>
                      </td>

                      {/* Objective */}
                      <td className="py-3 px-4 border-r border-slate-200 text-slate-600 leading-relaxed text-[11px]">
                        {row.processObjective}
                      </td>

                      {/* Risk */}
                      <td className="py-3 px-4 border-r border-slate-200 bg-amber-50/20">
                        <div className="font-bold text-slate-900">{row.riskName}</div>
                        <div className="text-[10px] font-mono text-amber-700">{row.riskId}</div>
                        <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          {row.riskEvent}
                        </div>
                      </td>

                      {/* Inherent Risk */}
                      <td className="py-3 px-3 text-center border-r border-slate-200">
                        {hasValidatedInherent ? (
                          <div className="space-y-1">
                            <span
                              className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${riskBadge.bg} ${riskBadge.text} ${riskBadge.border}`}
                            >
                              {row.inherentScore} ({row.inherentRating})
                            </span>
                            <div className="text-[9px] font-semibold text-slate-500">
                              L{inherentLikelihood} × I{inherentImpact}
                            </div>
                            <div className="text-[9px] font-bold text-emerald-700">Validated 1–5 assessment</div>
                          </div>
                        ) : sourceRiskRating ? (
                          <div className="space-y-1">
                            <span className="inline-block rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                              {sourceRiskRating}
                            </span>
                            <div className="text-[9px] font-black uppercase tracking-wide text-violet-600">
                              Source rating
                            </div>
                            <div className="text-[9px] leading-3 text-slate-500">
                              Likelihood × Impact 1–5 pending validation
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-block rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                              Pending assessment
                            </span>
                            <div className="text-[9px] leading-3 text-slate-500">
                              Validated Likelihood × Impact 1–5 not yet available
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Control */}
                      <td className="py-3 px-4 border-r border-slate-200 bg-sky-50/20">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-[10px] font-bold text-brand-700 bg-brand-100/70 px-1.5 py-0.5 rounded">
                            {row.controlId}
                          </span>
                          {row.isKeyControl && (
                            <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1 rounded border border-indigo-200">
                              KEY
                            </span>
                          )}
                        </div>
                        <div className="font-bold text-slate-900 mt-1">{row.controlName}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                            {row.controlStatus || 'Draft'}
                          </span>
                          {String(row.mappingStatus || '').startsWith('PENDING') && (
                            <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                              Risk mapping pending
                            </span>
                          )}
                          {row.validationStatus && (
                            <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">
                              {String(row.validationStatus).replaceAll('_', ' ')}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">Owner: {row.controlOwner || 'Pending validation'}</div>
                      </td>

                      {/* Type & Nature */}
                      <td className="py-3 px-3 border-r border-slate-200 text-[11px]">
                        <div className="font-semibold text-slate-700">{row.controlType}</div>
                        <div className="text-slate-500 text-[10px]">{row.controlNature}</div>
                        <div className="text-slate-400 text-[10px]">{row.controlFrequency}</div>
                      </td>

                      {/* ToE Testing */}
                      <td className="py-3 px-3 text-center border-r border-slate-200">
                        <Link
                          href="/toe"
                          className="inline-block text-[10px] font-bold px-2 py-1 rounded border bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 transition-colors"
                        >
                          {row.toeConclusion}
                          <div className="text-[9px] font-mono text-slate-500">{row.toePassRatio}</div>
                        </Link>
                      </td>

                      {/* Residual Score */}
                      <td className="py-3 px-3 text-center border-r border-slate-200">
                        <span
                          className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${resBadge.bg} ${resBadge.text} ${resBadge.border}`}
                        >
                          {row.residualScore} ({row.residualRating})
                        </span>
                      </td>

                      {/* Remediation / MAP */}
                      <td className="py-3 px-4 bg-emerald-50/20 text-xs">
                        {row.mapId ? (
                          <div className="space-y-1">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 rounded">
                                {row.mapId}
                              </span>
                              <span className="text-[10px] font-bold text-emerald-700">
                                {row.mapProgress}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-700 line-clamp-1 font-medium">
                              {row.mapAgreedAction}
                            </div>
                            <div className="text-[10px] text-emerald-600 font-bold flex items-center space-x-1">
                              <span>Retest: {row.retestResult || 'Not Retested'}</span>
                              <span>• {row.issueStatus || 'Status not recorded'}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">No open issues</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CARD VIEW (Section 10 & 39 Mobile Architecture) */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(row => {
            const inherentLikelihood = Number(row.inherentLikelihood || 0);
            const inherentImpact = Number(row.inherentImpact || 0);
            const hasValidatedInherent =
              inherentLikelihood >= 1 &&
              inherentLikelihood <= 5 &&
              inherentImpact >= 1 &&
              inherentImpact <= 5 &&
              Number(row.inherentScore || 0) > 0;
            const sourceRiskRating = String(row.inherentSourceRating || '').trim();

            return (
              <div
                key={row.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 hover:border-slate-300 transition-all"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div>
                    <span className="font-mono text-xs font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                      {row.processId}
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 mt-1">{row.processName}</h3>
                  </div>
                  <span className="text-xs font-bold text-slate-400 font-mono">#{row.rowNumber}</span>
                </div>

                {/* Risk Segment */}
                <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-bold text-amber-800">{row.riskId}</span>
                    {hasValidatedInherent ? (
                      <span className="text-right text-[10px] font-bold text-rose-700">
                        Inherent: {row.inherentScore} ({row.inherentRating})
                      </span>
                    ) : sourceRiskRating ? (
                      <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">
                        Source: {sourceRiskRating}
                      </span>
                    ) : (
                      <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                        Inherent pending
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-slate-900">{row.riskName}</div>
                  <div className="text-slate-600 text-[11px]">{row.riskImpact}</div>
                  <div className="pt-1 text-[9px] leading-3 text-slate-500">
                    {hasValidatedInherent
                      ? `Likelihood ${inherentLikelihood} × Impact ${inherentImpact} · validated`
                      : sourceRiskRating
                        ? 'Source rating available · numeric 1–5 assessment pending validation'
                        : 'Likelihood × Impact 1–5 assessment pending validation'}
                  </div>
                </div>

                {/* Control Segment */}
                <div className="p-3 bg-sky-50/50 rounded-lg border border-sky-200 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold text-sky-800">{row.controlId}</span>
                    {row.isKeyControl && (
                      <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                        KEY CONTROL
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-slate-900">{row.controlName}</div>
                  <div className="text-slate-600 text-[11px]">Owner: {row.controlOwner} • {row.controlType}</div>
                </div>

                {/* Assurance & Testing Footer */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px]">Testing:</span>
                    <div className="font-bold text-amber-700">{row.toeConclusion}</div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Remediation:</span>
                    <div className="font-bold text-emerald-700">{row.mapStatus || 'No MAP'}</div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Residual:</span>
                    <div className="font-bold text-emerald-700">{row.residualScore} ({row.residualRating})</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
