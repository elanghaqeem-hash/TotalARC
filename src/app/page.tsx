'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, BadgeCheck, Building2, Cpu, FileSpreadsheet, Layers, Shield } from 'lucide-react';
import { useRole } from '@/context/RoleContext';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';

const emptyMetrics = {
  totalProcesses: 0, criticalProcesses: 0, totalRisks: 0, criticalRisks: 0, highRisks: 0,
  totalControls: 0, keyControls: 0, failedToEs: 0, totalExceptions: 0, openIssues: 0,
  closedIssues: 0, overdueMAP: 0, completedMAP: 0, ccmHealthy: 0, totalRetests: 0
};

export default function DashboardPage() {
  const { institutionName, currentUser } = useRole();
  const [data, setData] = useState<any>({ metrics: emptyMetrics, executiveQandA: [], recentAuditLogs: [] });
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/dashboard')
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('Dashboard data unavailable')))
      .then((payload) => setData({ metrics: { ...emptyMetrics, ...(payload.metrics || {}) }, executiveQandA: payload.executiveQandA || [], recentAuditLogs: payload.recentAuditLogs || [] }))
      .catch((err) => setError(err.message));
  }, []);

  const metrics = data.metrics;
  const cards = [
    ['Processes', metrics.totalProcesses, `${metrics.criticalProcesses} critical`, '/processes', Layers],
    ['Risks', metrics.totalRisks, `${metrics.criticalRisks} critical / ${metrics.highRisks} high`, '/risks', AlertTriangle],
    ['Controls', metrics.totalControls, `${metrics.keyControls} key controls`, '/controls', Shield],
    ['ToE Exceptions', metrics.totalExceptions, `${metrics.failedToEs} tests with exceptions/ineffective result`, '/toe', Cpu],
    ['Open Issues', metrics.openIssues, `${metrics.closedIssues} closed`, '/remediation', BadgeCheck],
    ['CCM Healthy', metrics.ccmHealthy, 'rules with persisted Healthy status', '/ccm', Activity]
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-brand-600 uppercase"><Building2 className="w-4 h-4" />{institutionName}</div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">Total Assurance, Risk & Control Command Center</h1>
          <p className="text-xs text-slate-500 mt-1">Current view: {currentUser.roleTitle}. All metrics below are derived from persisted database records.</p>
        </div>
        <Link href="/rcm" className="inline-flex items-center gap-2 bg-brand-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl"><FileSpreadsheet className="w-4 h-4" />Open RCM</Link>
      </div>

      <TraceabilityFlow currentStep="Dashboard" />

      {error && <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-700">{error}. No fallback/demo values were substituted.</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map(([label, value, note, href, Icon]: any) => (
          <Link key={label} href={href} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-brand-300">
            <div className="flex items-center justify-between text-xs text-slate-500"><span className="font-semibold">{label}</span><Icon className="w-4 h-4 text-brand-600" /></div>
            <div className="text-2xl font-black text-slate-900 mt-1">{value}</div>
            <div className="text-[10px] text-slate-500 mt-1">{note}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">Executive assurance indicators</h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">Computed from current database records, not predefined narratives.</p>
          <div className="space-y-3">
            {data.executiveQandA.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">No assurance indicators are available yet.</div>
            ) : data.executiveQandA.map((item: any, index: number) => (
              <div key={index} className="p-3 rounded-xl border border-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div><div className="text-xs font-bold text-slate-900">{item.question}</div><p className="text-[11px] text-slate-600 mt-1">{item.summary}</p></div>
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-700 rounded px-2 py-1">{item.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">Recent audit trail</h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">Latest persisted change records.</p>
          <div className="space-y-3">
            {data.recentAuditLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">No audit-log records available.</div>
            ) : data.recentAuditLogs.map((log: any) => (
              <div key={log.id} className="border-l-2 border-brand-400 pl-3 text-xs">
                <div className="font-bold text-slate-800">{log.action} · {log.entityType}</div>
                <div className="text-[11px] text-slate-500">{log.reason || 'No reason recorded'}</div>
                <div className="text-[10px] text-slate-400">{new Date(log.timestamp).toLocaleString('id-ID')}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
