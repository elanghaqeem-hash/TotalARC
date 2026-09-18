'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  AlertTriangle,
  FileCheck,
  CheckCircle2,
  Clock,
  Wrench,
  Shield,
  Layers,
  ArrowRight,
  GitPullRequest,
  CheckCheck,
  ChevronRight,
  FileText,
  UserCheck
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';

export default function RemediationWorkspacePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'map' | 'root_cause' | 'retest' | 'deficiency'>('map');

  useEffect(() => {
    fetch('/api/assure/remediation')
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  const deficiency = data?.deficiencies?.[0];
  const rootCause = deficiency?.rootCause;
  const issue = data?.issues?.[0];
  const map = data?.maps?.[0];
  const retest = data?.retests?.[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-emerald-600 uppercase tracking-wider">
            <Wrench className="w-4 h-4" />
            <span>Remediation & Action Plan Workspace (ASSURE)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Deficiency, Root Cause & MAP Lifecycle
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Section 72–81 & 136: Traceable resolution from Exception &rarr; Deficiency &rarr; 5-Why &rarr; MAP &rarr; Independent Retest &rarr; Formal Closure.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <span className="inline-flex items-center space-x-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold px-3 py-1.5 rounded-xl">
            <CheckCheck className="w-4 h-4 text-emerald-600" />
            <span>Issue Status: Closed</span>
          </span>
        </div>
      </div>

      <TraceabilityFlow currentStep="MAP Action" />

      {/* Workspace Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 bg-white px-4 py-2 rounded-xl shadow-sm text-xs font-semibold">
        <button
          onClick={() => setActiveTab('map')}
          className={`px-3.5 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
            activeTab === 'map'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>Management Action Plan (MAP-2026-001)</span>
        </button>

        <button
          onClick={() => setActiveTab('root_cause')}
          className={`px-3.5 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
            activeTab === 'root_cause'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <GitPullRequest className="w-3.5 h-3.5" />
          <span>5-Why Root Cause Analysis</span>
        </button>

        <button
          onClick={() => setActiveTab('retest')}
          className={`px-3.5 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
            activeTab === 'retest'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span>Independent Retesting (RET-2026-001)</span>
        </button>

        <button
          onClick={() => setActiveTab('deficiency')}
          className={`px-3.5 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
            activeTab === 'deficiency'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Deficiency Details (DEF-2026-001)</span>
        </button>
      </div>

      {/* TAB 1: MANAGEMENT ACTION PLAN */}
      {activeTab === 'map' && map && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-2">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-xs font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                    {map.mapId}
                  </span>
                  <span className="text-xs text-slate-500">Issue: {map.issue?.issueId}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Status: {map.status}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 mt-1">
                  Agreed Action: {map.agreedAction}
                </h2>
              </div>

              <div className="text-right text-xs text-slate-500">
                <div>Owner: <strong>{map.actionOwner}</strong></div>
                <div>Executive Approver: <strong>{map.approverName}</strong></div>
              </div>
            </div>

            {/* Governance Details & Immutable Date (Section 79) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400">Original Due Date</span>
                <div className="font-bold text-slate-900 mt-0.5 font-mono">
                  {formatDate(map.originalDueDate)}
                </div>
                <span className="text-[9px] text-emerald-600 font-medium">Immutable (Section 79)</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400">Extension Count</span>
                <div className="font-bold text-slate-900 mt-0.5">{map.extensionCount} Extensions</div>
                <span className="text-[9px] text-slate-500">Completed without extension</span>
              </div>

              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <span className="text-[10px] font-bold uppercase text-emerald-700">Remediation Progress</span>
                <div className="text-2xl font-black text-emerald-800 mt-0.5">{map.progressPercent}%</div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400">Completion Date</span>
                <div className="font-bold text-slate-900 mt-0.5 font-mono">
                  {formatDate(map.completedAt)}
                </div>
                <span className="text-[9px] text-emerald-600 font-medium">Delivered ahead of schedule</span>
              </div>
            </div>

            {/* Recommendation Narrative */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <span className="text-slate-400 font-bold uppercase text-[10px]">
                Assurance Recommendation:
              </span>
              <p className="text-slate-700 font-medium leading-relaxed">
                {map.recommendation}
              </p>
            </div>
          </div>

          {/* Remediation Milestones (Section 80) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  MAP Implementation Milestones & Evidence (Section 80)
                </h3>
                <p className="text-xs text-slate-500">
                  Trackable milestone roadmap with supporting audit documentation
                </p>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                3 of 3 Completed
              </span>
            </div>

            <div className="space-y-3">
              {map.milestones?.map((m: any, idx: number) => (
                <div
                  key={m.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{m.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Owner: {m.owner} • Target: {formatDate(m.dueDate)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <span className="font-mono text-[11px] text-brand-600 bg-brand-50 px-2 py-1 rounded border border-brand-200 flex items-center space-x-1">
                      <FileText className="w-3.5 h-3.5" />
                      <span>{m.evidenceDoc}</span>
                    </span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      100%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ROOT CAUSE ANALYSIS (5-WHY) */}
      {activeTab === 'root_cause' && rootCause && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <span className="text-xs font-bold text-brand-600 uppercase tracking-wider">
              Root Cause Methodology (Section 75)
            </span>
            <h2 className="text-lg font-bold text-slate-900 mt-1">
              Five-Why (5-Why) Investigation for Disbursement Bypass
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Category: <strong className="text-slate-800">{rootCause.category} & Governance</strong>
            </p>
          </div>

          <div className="space-y-3">
            {[
              { num: 1, text: rootCause.why1 },
              { num: 2, text: rootCause.why2 },
              { num: 3, text: rootCause.why3 },
              { num: 4, text: rootCause.why4 },
              { num: 5, text: rootCause.why5 }
            ].map(w => (
              <div
                key={w.num}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-start space-x-3 text-xs"
              >
                <span className="w-6 h-6 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center flex-shrink-0 text-[11px]">
                  W{w.num}
                </span>
                <p className="text-slate-800 leading-relaxed font-medium pt-0.5">
                  {w.text}
                </p>
              </div>
            ))}
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
              Final Root Cause Statement (Section 75)
            </span>
            <p className="text-amber-950 font-bold leading-relaxed text-sm">
              &ldquo;{rootCause.rootCauseStatement}&rdquo;
            </p>
          </div>
        </div>
      )}

      {/* TAB 3: INDEPENDENT RETESTING */}
      {activeTab === 'retest' && retest && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                  {retest.retestId}
                </span>
                <span className="text-xs text-slate-500">Date: {formatDate(retest.retestedAt)}</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-1">
                Post-Remediation Independent Retesting (Section 81)
              </h2>
            </div>

            <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-3 py-1 rounded-lg">
              Result: {retest.result}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Sample Tested</span>
              <div className="text-3xl font-black text-slate-900 mt-1">{retest.sampleCount}</div>
              <span className="text-slate-500 text-[10px]">Post-August 2026 runs</span>
            </div>

            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
              <span className="text-emerald-600 font-bold uppercase text-[10px]">Passed Samples</span>
              <div className="text-3xl font-black text-emerald-800 mt-1">{retest.passedCount}</div>
              <span className="text-emerald-700 text-[10px] font-bold">100% Dual Approval Pass</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Failed Samples</span>
              <div className="text-3xl font-black text-slate-400 mt-1">{retest.failedCount}</div>
              <span className="text-slate-400 text-[10px]">Zero exceptions found</span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
            <span className="text-slate-400 font-bold uppercase text-[10px]">
              Independent Tester Conclusion Notes
            </span>
            <p className="text-slate-800 font-medium leading-relaxed">
              {retest.conclusionNotes}
            </p>
            <div className="pt-2 border-t border-slate-200 flex justify-between text-slate-500 text-[11px]">
              <span>Tester: <strong>{retest.testerName}</strong></span>
              <span>Reviewer Sign-off: <strong>{retest.reviewerName}</strong></span>
            </div>
          </div>

          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <CheckCheck className="w-4 h-4 text-emerald-600" />
              <span className="text-emerald-900 font-bold">
                Section 81 Requirement Met: Independent validation & retest successfully completed before issue closure.
              </span>
            </div>
            <span className="px-3 py-1 bg-emerald-600 text-white font-bold rounded-lg shadow-sm">
              Formally Closed
            </span>
          </div>
        </div>
      )}

      {/* TAB 4: DEFICIENCY DETAILS */}
      {activeTab === 'deficiency' && deficiency && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">
              Deficiency Assessment (Section 73 & 74)
            </span>
            <h2 className="text-lg font-bold text-slate-900 mt-1">{deficiency.title}</h2>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                {deficiency.classification}
              </span>
              <span className="text-xs text-slate-500">
                Human Approved by: <strong>{deficiency.approvedBy}</strong>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Financial Exposure</span>
              <div className="text-lg font-bold text-slate-900 font-mono">
                {formatCurrency(deficiency.financialImpact)}
              </div>
              <p className="text-slate-500 text-[11px]">Combined face value of the two sample exceptions.</p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Regulatory Impact</span>
              <p className="text-slate-800 font-medium text-[11px] leading-relaxed">
                {deficiency.regulatoryImpact}
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
            <span className="text-slate-400 font-bold uppercase text-[10px]">Compensating Control Review</span>
            <p className="text-slate-700 font-medium leading-relaxed">
              {deficiency.compensatingControls}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
