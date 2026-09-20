'use client';

import React from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';

export default function ReportsPage() {
  const { data, loading, error } = useAssuranceData();

  const sources = data ? [
    { title: 'ToE workpapers', count: data.toeTests?.length || 0, href: '/toe' },
    { title: 'Issues & remediation', count: data.actionPlans?.length || 0, href: '/remediation' },
    { title: 'Control certifications', count: data.certifications?.length || 0, href: '/certification' },
    { title: 'Management attestations', count: data.attestations?.length || 0, href: '/certification' },
    { title: 'RCSA / CSA campaigns', count: data.campaigns?.length || 0, href: '/rcsa' },
    { title: 'ICOFR financial accounts', count: data.financialAccounts?.length || 0, href: '/icofr' }
  ] : [];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm"><div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase"><Download className="w-4 h-4" />Workpapers & Export</div><h1 className="text-2xl font-black text-slate-900 mt-1">Report Source Center</h1><p className="text-xs text-slate-500 mt-1">Available report sources reflect records currently stored in the database.</p></div>
      <Link href="/icofr/reporting" className="block rounded-2xl border border-sky-200 bg-sky-50 p-5 hover:border-sky-300">
        <div className="text-xs font-black uppercase tracking-wide text-sky-600">ICOFR Executive Reporting</div>
        <div className="mt-1 text-sm font-black text-slate-900">Board / Audit Committee & External Audit Reliance</div>
        <div className="mt-1 text-[11px] text-slate-600">Open the database-backed reporting pack, reliance mapping, deficiency aging and PBC tracker.</div>
      </Link>
      {error && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}
      {loading ? <div className="text-xs text-slate-500">Loading…</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sources.map((source) => <Link key={source.title} href={source.href} className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-brand-300"><div className="text-sm font-bold text-slate-900">{source.title}</div><div className="text-2xl font-black text-brand-600 mt-2">{source.count}</div><div className="text-[11px] text-slate-500">persisted record(s)</div></Link>)}
        </div>
      )}
    </div>
  );
}
