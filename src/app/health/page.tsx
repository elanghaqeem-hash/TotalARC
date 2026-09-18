'use client';

import React from 'react';
import { Activity } from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';

export default function HealthPage() {
  const { data, loading, error } = useAssuranceData();
  const controls = data?.controls || [];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm"><div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase"><Activity className="w-4 h-4" />Control Health</div><h1 className="text-2xl font-black text-slate-900 mt-1">Control Health Cockpit</h1><p className="text-xs text-slate-500 mt-1">Health is never inferred from empty evidence; stored assessment, testing, issue, monitoring, and certification records are presented transparently.</p></div>
      {error && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}
      {loading ? <div className="text-xs text-slate-500">Loading…</div> : controls.length === 0 ? (<div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl"><div className="font-bold text-slate-700">No records available</div><p className="text-xs text-slate-500 mt-1">This module will populate only from persisted database records.</p></div>) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {controls.map((control:any) => {
            const latestRun = control.monitoringRules?.flatMap((r:any)=>r.runs || [])[0];
            return <div key={control.id} className="bg-white border border-slate-200 rounded-2xl p-5"><div className="flex justify-between gap-3"><div><div className="font-mono text-xs font-bold text-brand-600">{control.controlId}</div><div className="font-bold text-slate-900">{control.name}</div><div className="text-[11px] text-slate-500">{control.process?.name || 'No process linked'}</div></div><span className="text-xs font-bold px-2 py-1 h-fit rounded bg-slate-100">{control.overallHealth}</span></div><div className="grid grid-cols-2 gap-2 mt-4 text-[11px]"><div className="p-2 bg-slate-50 rounded">Design: <strong>{control.designAssessment}</strong></div><div className="p-2 bg-slate-50 rounded">Operating: <strong>{control.operatingStatus}</strong></div><div className="p-2 bg-slate-50 rounded">ToD: <strong>{control.todTests?.length || 0}</strong></div><div className="p-2 bg-slate-50 rounded">ToE: <strong>{control.toeTests?.length || 0}</strong></div><div className="p-2 bg-slate-50 rounded">Issues: <strong>{control.issues?.length || 0}</strong></div><div className="p-2 bg-slate-50 rounded">Latest CCM: <strong>{latestRun?.status || 'Not Run'}</strong></div><div className="p-2 bg-slate-50 rounded col-span-2">Certification records: <strong>{control.certifications?.length || 0}</strong></div></div></div>;
          })}
        </div>
      )}
    </div>
  );
}
