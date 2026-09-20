'use client';

import React from 'react';
import Link from 'next/link';
import { BarChart3, Download, RefreshCcw } from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';

export default function ReportsPage() {
  const { data, loading, error, refresh } = useAssuranceData(['tasks', 'remediation']);

  const sources = data ? [
    { title: 'Business processes', count: data.processes?.length || 0, href: '/processes', detail: 'Process Architecture / BPM' },
    { title: 'Risk register', count: data.risks?.length || 0, href: '/risks', detail: 'Enterprise and process risks' },
    { title: 'Control master', count: data.controls?.length || 0, href: '/controls', detail: 'Single Control Library' },
    { title: 'RCSA / CSA campaigns', count: data.campaigns?.length || 0, href: '/rcsa', detail: 'Assessment campaigns and responses' },
    { title: 'ToD workpapers', count: data.todTests?.length || 0, href: '/tod', detail: 'Walkthrough and design assessment' },
    { title: 'ToE workpapers', count: data.toeTests?.length || 0, href: '/toe', detail: 'Operating-effectiveness testing' },
    { title: 'Issues & remediation', count: data.actionPlans?.length || 0, href: '/remediation', detail: 'MAP and retesting' },
    { title: 'CCM rules', count: data.monitoringRules?.length || 0, href: '/ccm', detail: 'Continuous monitoring' },
    { title: 'ICOFR financial items', count: data.financialAccounts?.length || 0, href: '/icofr/accounts', detail: 'Accounts & disclosures' },
    { title: 'IPE / EUC register', count: data.ipeRegisters?.length || 0, href: '/icofr/information', detail: 'Information reliability register' },
    { title: 'ICOFR testing plan', count: data.testingPlanItems?.length || 0, href: '/icofr/testing-plan', detail: 'Annual testing cycle' },
    { title: 'Management attestations', count: data.attestations?.length || 0, href: '/certification', detail: 'Certification and close' }
  ] : [];

  const totalRecords = sources.reduce((sum, source) => sum + source.count, 0);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase">
              <Download className="w-4 h-4" />Workpapers & Analytics
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Report Source Center</h1>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              Report sources are counted from persisted records across connected Total ARC modules, so analytics reflects operational data rather than placeholder values.
            </p>
          </div>
          <button onClick={() => refresh()} className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-brand-700" title="Refresh report sources">
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase text-slate-400">Connected sources</div>
          <div className="text-2xl font-black text-slate-900">{sources.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase text-slate-400">Persisted records</div>
          <div className="text-2xl font-black text-slate-900">{totalRecords}</div>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
          <div className="text-[10px] font-bold uppercase text-sky-600">Open tasks</div>
          <div className="text-2xl font-black text-sky-900">{(data?.tasks || []).filter((task:any)=>!['Completed','Closed','Accepted','Cancelled'].includes(String(task.status))).length}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-[10px] font-bold uppercase text-amber-700">Open MAP</div>
          <div className="text-2xl font-black text-amber-900">{(data?.actionPlans || []).filter((map:any)=>!['Completed','Closed','Cancelled'].includes(String(map.status))).length}</div>
        </div>
      </div>

      <Link href="/icofr/reporting" className="block rounded-2xl border border-sky-200 bg-sky-50 p-5 hover:border-sky-300">
        <div className="text-xs font-black uppercase tracking-wide text-sky-600">ICOFR Executive Reporting</div>
        <div className="mt-1 text-sm font-black text-slate-900">Board / Audit Committee & External Audit Reliance</div>
        <div className="mt-1 text-[11px] text-slate-600">Open the database-backed reporting pack, reliance mapping, deficiency aging and PBC tracker.</div>
      </Link>

      {error && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}
      {loading ? (
        <div className="text-xs text-slate-500">Loading connected report sources…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sources.map((source) => (
            <Link key={source.title} href={source.href} className="group bg-white border border-slate-200 rounded-2xl p-5 hover:border-brand-300 hover:shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-900">{source.title}</div>
                  <div className="text-[11px] text-slate-500 mt-1">{source.detail}</div>
                </div>
                <BarChart3 className="w-4 h-4 text-slate-300 group-hover:text-brand-600" />
              </div>
              <div className="text-2xl font-black text-brand-600 mt-4">{source.count}</div>
              <div className="text-[11px] text-slate-500">persisted record(s)</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
