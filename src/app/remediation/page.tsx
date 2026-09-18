'use client';

import React, { useEffect, useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';

export default function RemediationPage() {
  const [data, setData] = useState<any>({ deficiencies: [], issues: [], maps: [], retests: [] });
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/assure/remediation')
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('Remediation data unavailable')))
      .then((payload) => setData({ deficiencies: payload.deficiencies || [], issues: payload.issues || [], maps: payload.maps || [], retests: payload.retests || [] }))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-brand-600 uppercase"><BadgeCheck className="w-4 h-4" />Remediation & Management Action Plans</div>
        <h1 className="text-2xl font-black text-slate-900 mt-1">Issue, MAP & Retest Workspace</h1>
        <p className="text-xs text-slate-500 mt-1">Only persisted deficiencies, issues, action plans, milestones, and retest outcomes are shown.</p>
      </div>
      <TraceabilityFlow currentStep="MAP Action" />
      {error && <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['Deficiencies',data.deficiencies.length],['Issues',data.issues.length],['Action plans',data.maps.length],['Retests',data.retests.length]].map(([label,value]) => (
          <div key={String(label)} className="bg-white border border-slate-200 rounded-xl p-4"><div className="text-[10px] uppercase font-bold text-slate-400">{label}</div><div className="text-2xl font-black text-slate-900">{value}</div></div>
        ))}
      </div>

      {data.maps.length === 0 && data.issues.length === 0 && data.deficiencies.length === 0 ? (
        <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl"><div className="font-bold text-slate-700">No remediation records</div><p className="text-xs text-slate-500 mt-1">No pre-closed issue or completed MAP is injected into an empty database.</p></div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="font-bold text-slate-900 mb-3">Issues</h2>
            <div className="space-y-3">{data.issues.map((issue:any) => <div key={issue.id} className="p-3 rounded-xl border border-slate-200 text-xs"><div className="flex justify-between gap-3"><span className="font-mono font-bold">{issue.issueId}</span><span className="font-bold">{issue.status}</span></div><div className="font-semibold text-slate-900 mt-1">{issue.title}</div><div className="text-[11px] text-slate-500">{issue.process?.name || 'No process linked'} · {issue.control?.controlId || 'No control linked'}</div></div>)}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="font-bold text-slate-900 mb-3">Management Action Plans</h2>
            <div className="space-y-3">{data.maps.map((map:any) => <div key={map.id} className="p-3 rounded-xl border border-slate-200 text-xs"><div className="flex justify-between gap-3"><span className="font-mono font-bold">{map.mapId}</span><span className="font-bold">{map.status}</span></div><div className="text-slate-700 mt-1">{map.agreedAction}</div><div className="text-[11px] text-slate-500 mt-1">Progress {map.progressPercent}% · milestones {map.milestones?.length || 0} · retests {map.retests?.length || 0}</div></div>)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
