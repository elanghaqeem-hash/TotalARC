'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRole } from '@/context/RoleContext';
import { Activity, AlertTriangle, BadgeCheck, Building2, Cpu, FileSpreadsheet, Layers, Shield, Sparkles } from 'lucide-react';

type DashboardData = {
  metrics: Record<string, number>;
  executiveQandA: Array<{ question: string; status: string; summary: string; badge: string }>;
  recentAuditLogs: Array<{ id: string; userName: string; action: string; reason?: string | null; timestamp: string; entityType: string }>;
};

export default function DashboardPage() {
  const { currentUser, institutionName } = useRole();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/dashboard', { cache: 'no-store' })
      .then(async res => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Unable to load dashboard');
        setData(body);
      })
      .catch(err => setError(err.message));
  }, []);

  const m = data?.metrics || {};
  const cards = [
    { label: 'Processes', value: m.totalProcesses ?? 0, note: `${m.criticalProcesses ?? 0} critical`, href: '/processes', icon: Layers },
    { label: 'Risks', value: m.totalRisks ?? 0, note: `${m.criticalRisks ?? 0} critical / ${m.highRisks ?? 0} high`, href: '/risks', icon: AlertTriangle },
    { label: 'Controls', value: m.totalControls ?? 0, note: `${m.keyControls ?? 0} key controls`, href: '/controls', icon: Shield },
    { label: 'ToE Samples', value: m.totalSamples ?? 0, note: `${m.passedSamples ?? 0} passed • ${m.totalExceptions ?? 0} exceptions`, href: '/toe', icon: Cpu },
    { label: 'Open Issues', value: m.openIssues ?? 0, note: `${m.overdueMAP ?? 0} overdue MAP`, href: '/remediation', icon: BadgeCheck },
    { label: 'CCM Rules', value: m.ccmTotal ?? 0, note: `${m.ccmHealthy ?? 0} healthy`, href: '/ccm', icon: Activity }
  ];

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-brand-600 font-bold uppercase tracking-wider">
            <Building2 className="w-4 h-4" /><span>{institutionName || 'Institution'}</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">Total Assurance, Risk & Control Command Center</h1>
          <p className="text-xs text-slate-500 mt-1">
            {currentUser ? <>Signed in as <strong className="text-slate-800">{currentUser.name}</strong> ({currentUser.role}). All figures below are calculated from current database records.</> : 'Loading authenticated user…'}
          </p>
        </div>
        <Link href="/rcm" className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl">
          <FileSpreadsheet className="w-4 h-4" />Open RCM
        </Link>
      </section>

      {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</div>}

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-brand-600" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Executive Assurance Intelligence</h2>
            <p className="text-[11px] text-slate-500">Calculated from registered risks, controls, tests, issues and action plans.</p>
          </div>
        </div>
        {data?.executiveQandA?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {data.executiveQandA.map((item, idx) => (
              <article key={idx} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Question {idx + 1}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{item.badge}</span>
                </div>
                <h3 className="font-bold text-xs text-slate-900 mt-2">{item.question}</h3>
                <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">{item.summary}</p>
                <div className="text-[11px] font-semibold text-brand-700 mt-3 pt-2 border-t border-slate-100">{item.status}</div>
              </article>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-dashed border-slate-300 rounded-xl p-6 text-xs text-slate-500">No assurance records are available yet.</div>
        )}
      </section>

      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <Link key={card.label} href={card.href} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-brand-400 transition-colors">
              <div className="flex justify-between items-center text-xs text-slate-500"><span>{card.label}</span><Icon className="w-4 h-4 text-brand-600" /></div>
              <div className="text-2xl font-black text-slate-900 mt-1">{card.value}</div>
              <div className="text-[10px] text-slate-500 mt-1">{card.note}</div>
            </Link>
          );
        })}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">Recent Audit Trail</h2>
        <p className="text-[10px] text-slate-500 mt-0.5">Authenticated actor activity for this institution.</p>
        <div className="mt-4 divide-y divide-slate-100">
          {(data?.recentAuditLogs || []).map(log => (
            <div key={log.id} className="py-3 flex items-start justify-between gap-4 text-xs">
              <div>
                <div className="font-semibold text-slate-800">{log.userName} <span className="text-slate-400 font-normal">• {log.entityType}</span></div>
                <div className="text-[11px] text-slate-500 mt-0.5">{log.reason || log.action}</div>
              </div>
              <div className="text-[10px] text-slate-400 whitespace-nowrap">{new Date(log.timestamp).toLocaleString('id-ID')}</div>
            </div>
          ))}
          {!data?.recentAuditLogs?.length && <div className="py-6 text-xs text-slate-400">No audit events recorded yet.</div>}
        </div>
      </section>
    </div>
  );
}
