'use client';

import React from 'react';
import { FileCheck } from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';

export default function ICOFRPage() {
  const { data, loading, error } = useAssuranceData();
  const accounts = data?.financialAccounts || [];
  const ipe = data?.ipeRegisters || [];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm"><div className="flex items-center gap-2 text-xs font-bold text-sky-600 uppercase"><FileCheck className="w-4 h-4" />ICOFR</div><h1 className="text-2xl font-black text-slate-900 mt-1">Financial Reporting Scope & Assertions</h1><p className="text-xs text-slate-500 mt-1">Significant accounts, assertions, and IPE validation status are database-derived.</p></div>
      {error && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}
      {loading ? <div className="text-xs text-slate-500">Loading…</div> : accounts.length === 0 && ipe.length === 0 ? (<div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl"><div className="font-bold text-slate-700">No records available</div><p className="text-xs text-slate-500 mt-1">This module will populate only from persisted database records.</p></div>) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5"><h2 className="font-bold text-slate-900 mb-3">Financial accounts ({accounts.length})</h2><div className="space-y-3">{accounts.map((account:any) => <div key={account.id} className="p-3 border border-slate-200 rounded-xl text-xs"><div className="flex justify-between gap-2"><span className="font-bold">{account.accountCode} · {account.accountName}</span><span>{account.isSignificant ? 'Significant':'Not significant'}</span></div><div className="text-[11px] text-slate-500">{account.financialStatement} · Fraud exposure: {account.fraudExposure} · Complexity: {account.complexity}</div><div className="mt-2 flex flex-wrap gap-1">{(account.assertions || []).map((a:any) => <span key={a.id} className="text-[10px] px-2 py-0.5 rounded bg-slate-100">{a.assertion}: {a.isInScope ? 'In scope':'Out of scope'}</span>)}</div></div>)}</div></div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5"><h2 className="font-bold text-slate-900 mb-3">IPE Register ({ipe.length})</h2><div className="space-y-3">{ipe.map((item:any) => <div key={item.id} className="p-3 border border-slate-200 rounded-xl text-xs"><div className="font-bold">{item.reportName}</div><div className="text-[11px] text-slate-500">{item.systemSource} · Owner: {item.reportOwner}</div><div className="mt-2 text-[10px]">Completeness tested: {item.completenessTested ? 'Yes':'No'} · Accuracy tested: {item.accuracyTested ? 'Yes':'No'}</div></div>)}</div></div>
        </div>
      )}
    </div>
  );
}
