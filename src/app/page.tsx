'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRole } from '@/context/RoleContext';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';
import {
  Shield,
  Layers,
  AlertTriangle,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Activity,
  ArrowRight,
  ChevronRight,
  TrendingUp,
  Cpu,
  BadgeCheck,
  Building2,
  Sparkles,
  AlertCircle
} from 'lucide-react';

export default function DashboardPage() {
  const { currentUser, institutionName } = useRole();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const metrics = data?.metrics || {
    totalProcesses: 7,
    criticalProcesses: 4,
    totalRisks: 2,
    criticalRisks: 1,
    highRisks: 1,
    totalControls: 2,
    keyControls: 2,
    failedToEs: 1,
    totalExceptions: 2,
    openIssues: 0,
    closedIssues: 1,
    overdueMAP: 0,
    completedMAP: 1,
    ccmHealthy: 1,
    totalRetests: 1
  };

  const executiveQandA = data?.executiveQandA || [
    {
      question: 'Are our key risks controlled?',
      status: 'Adequate',
      summary: '100% of identified High & Critical Risks are mapped to at least one Preventive or Detective Key Control.',
      badge: 'Controlled'
    },
    {
      question: 'Are our critical controls working?',
      status: 'Effective Post-Remediation',
      summary: 'CTRL-P2P-001 operating exception (2/25 samples) remediated via MAP-2026-001 and passed independent retest (10/10). Current CCM status is Healthy.',
      badge: 'Verified'
    },
    {
      question: 'Where are control weaknesses concentrated?',
      status: 'Finance & Accounts Payable',
      summary: 'ERP Authorization matrix sync following organizational changes was identified as the primary root cause.',
      badge: 'Remediated'
    },
    {
      question: 'Which remediation actions are overdue?',
      status: 'None Overdue',
      summary: 'All agreed Management Action Plans (MAP-2026-001) are 100% completed on time without requiring extensions.',
      badge: '0 Overdue'
    }
  ];

  return (
    <div className="space-y-6">
      {/* INSTITUTION & ROLE BANNER */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs text-brand-600 font-bold uppercase tracking-wider">
            <Building2 className="w-4 h-4" />
            <span>{institutionName}</span>
            <span>•</span>
            <span className="text-slate-500">Technology → IT Services</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Total Assurance, Risk & Control Command Center
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Logged in as <span className="font-bold text-slate-800">{currentUser.name}</span> ({currentUser.roleTitle}). Showing holistic enterprise governance metrics.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/rcm"
            className="inline-flex items-center space-x-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm shadow-brand-500/20 transition-all hover:scale-[1.02]"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Open Dynamic RCM</span>
          </Link>
          <Link
            href="/toe"
            className="inline-flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl border border-slate-200 transition-colors"
          >
            <Cpu className="w-4 h-4 text-brand-600" />
            <span>ToE Workpaper</span>
          </Link>
        </div>
      </div>

      {/* END-TO-END TRACEABILITY STEPPER */}
      <TraceabilityFlow currentStep="Dashboard" />

      {/* EXECUTIVE ASSURANCE Q&A SECTION (Section 106 & 154) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-brand-600" />
              <span>Executive Assurance Intelligence</span>
            </h2>
            <p className="text-xs text-slate-500">
              Clear, non-technical answers for the Board & Management (Section 106 & 154)
            </p>
          </div>
          <Link
            href="/certification"
            className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center space-x-1"
          >
            <span>View Sign-Off Attestation</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {executiveQandA.map((item: any, idx: number) => (
            <div
              key={idx}
              className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-brand-300 transition-all space-y-2 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    Question #{idx + 1}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {item.badge}
                  </span>
                </div>
                <h3 className="font-bold text-xs text-slate-900 leading-snug">
                  {item.question}
                </h3>
                <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                  {item.summary}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="font-semibold text-emerald-700 flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>{item.status}</span>
                </span>
                <span className="text-slate-400 text-[10px]">Traceable</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CORE METRIC GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Link
          href="/processes"
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-brand-400 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">Processes</span>
            <Layers className="w-4 h-4 text-brand-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-slate-900">{metrics.totalProcesses}</div>
          <div className="text-[10px] text-emerald-600 font-medium mt-1">
            {metrics.criticalProcesses} Critical (100% Mapped)
          </div>
        </Link>

        <Link
          href="/risks"
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-brand-400 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">Risks</span>
            <AlertTriangle className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-slate-900">{metrics.totalRisks}</div>
          <div className="text-[10px] text-rose-600 font-medium mt-1">
            {metrics.criticalRisks} Critical / {metrics.highRisks} High
          </div>
        </Link>

        <Link
          href="/controls"
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-brand-400 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">Controls</span>
            <Shield className="w-4 h-4 text-brand-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-slate-900">{metrics.totalControls}</div>
          <div className="text-[10px] text-brand-600 font-medium mt-1">
            {metrics.keyControls} Key Controls (Single Library)
          </div>
        </Link>

        <Link
          href="/toe"
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-brand-400 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">ToE Testing</span>
            <Cpu className="w-4 h-4 text-sky-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-slate-900">{metrics.totalExceptions} Excp</div>
          <div className="text-[10px] text-amber-600 font-medium mt-1">
            23/25 Passed (Remediated)
          </div>
        </Link>

        <Link
          href="/remediation"
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-brand-400 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">MAP & Retests</span>
            <BadgeCheck className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-slate-900">{metrics.totalRetests} Retest</div>
          <div className="text-[10px] text-emerald-600 font-medium mt-1">
            10/10 Passed (Issue Closed)
          </div>
        </Link>

        <Link
          href="/ccm"
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-brand-400 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">CCM Status</span>
            <Activity className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-emerald-600">Healthy</div>
          <div className="text-[10px] text-slate-500 font-medium mt-1">
            Real-time Scan Active
          </div>
        </Link>
      </div>

      {/* TWO COLUMNS: SCENARIO SHOWCASE & AUDIT LOG */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Procure to Pay Scenario Card (Section 136) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 text-xs font-bold border border-brand-200">
                  Demo Showcase
                </span>
                <span className="text-xs font-mono text-slate-400">Section 136</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-1">
                End-to-End Procure to Pay Assurance Lifecycle
              </h3>
            </div>
            <Link
              href="/processes"
              className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center space-x-1"
            >
              <span>Explore Process</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                Business Process
              </span>
              <div className="font-bold text-slate-900 text-sm">Procure to Pay (PRC-P2P-001)</div>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Objective: Ensure payments are valid, complete, accurate and appropriately authorized.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-rose-50/70 border border-rose-200 space-y-1">
              <span className="text-rose-500 font-bold uppercase tracking-wider text-[10px]">
                Identified Risk
              </span>
              <div className="font-bold text-rose-900 text-sm">Unauthorized Payment (RSK-P2P-001)</div>
              <p className="text-rose-700 text-[11px] leading-relaxed">
                Cause: Incomplete approval workflow. Inherent Score: 16 (Critical).
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-sky-50/70 border border-sky-200 space-y-1">
              <span className="text-sky-600 font-bold uppercase tracking-wider text-[10px]">
                Key Control
              </span>
              <div className="font-bold text-sky-900 text-sm">Dual Authorization (CTRL-P2P-001)</div>
              <p className="text-sky-700 text-[11px] leading-relaxed">
                Payments &gt; IDR 100M require dual signatory sign-off in SAP S/4HANA ERP.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-emerald-50/70 border border-emerald-200 space-y-1">
              <span className="text-emerald-600 font-bold uppercase tracking-wider text-[10px]">
                Assurance Status
              </span>
              <div className="font-bold text-emerald-900 text-sm">Retested & Closed (RET-2026-001)</div>
              <p className="text-emerald-700 text-[11px] leading-relaxed">
                2 exceptions remediated via MAP-2026-001. 10/10 samples passed independent retest.
              </p>
            </div>
          </div>

          <div className="p-3 bg-slate-100 rounded-lg flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium">
              Want to see the live 25-sample audit workpaper with the 2 failed exceptions?
            </span>
            <Link
              href="/toe"
              className="font-bold text-brand-600 hover:text-brand-700 underline"
            >
              Open ToE Testing Grid →
            </Link>
          </div>
        </div>

        {/* Right Column: Immutable Audit Trail (Section 126) */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Immutable Audit Trail
              </h3>
              <p className="text-[10px] text-slate-500">
                Field-level governance logging (Section 126)
              </p>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          </div>

          <div className="space-y-3">
            {data?.recentAuditLogs?.map((log: any) => (
              <div key={log.id} className="text-xs space-y-1 border-l-2 border-brand-400 pl-3 py-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">{log.userName}</span>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 rounded">
                    {log.action}
                  </span>
                </div>
                <p className="text-slate-600 text-[11px]">{log.reason}</p>
                <div className="text-[10px] text-slate-400">
                  {new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} • {log.entityType}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
