'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, FileCheck, Link2, Workflow } from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';

export default function ToDPage() {
  const { data, loading, error } = useAssuranceData(['tod']);
  const tests = data?.todTests || [];
  const walkthroughs = data?.walkthroughs || [];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-sky-600 uppercase"><Workflow className="w-4 h-4" />Walkthrough & Test of Design</div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">ToD Workspace</h1>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">Design criteria and walkthroughs reflect persisted testing records. New ToD work is launched from the ICOFR Testing Plan or maintained through Traceability.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/icofr/testing-plan" className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2.5 text-xs font-bold text-white"><CalendarDays className="w-4 h-4" />Testing Plan</Link>
            <Link href="/icofr/traceability" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700"><Link2 className="w-4 h-4" />Traceability</Link>
            <Link href="/icofr/workpaper-review" className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs font-bold text-violet-700"><FileCheck className="w-4 h-4" />Workpaper Review</Link>
          </div>
        </div>
      </div>
      <TraceabilityFlow currentStep="Control" />
      {error && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}
      {loading ? <div className="text-xs text-slate-500">Loading…</div> : tests.length === 0 && walkthroughs.length === 0 ? (<div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl"><div className="font-bold text-slate-700">No ToD records yet</div><p className="text-xs text-slate-500 mt-1">Launch a ToD workpaper from the database-backed ICOFR Testing Plan.</p><Link href="/icofr/testing-plan" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-brand-700">Open Testing Plan <ArrowRight className="w-3.5 h-3.5" /></Link></div>) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5"><h2 className="font-bold text-slate-900 mb-3">Test of Design ({tests.length})</h2><div className="space-y-3">{tests.map((test:any) => <div key={test.id} className="p-3 border border-slate-200 rounded-xl text-xs"><div className="flex justify-between gap-2"><span className="font-mono font-bold">{test.testId}</span><span className="font-bold">{test.conclusion}</span></div><div className="font-semibold mt-1">{test.control?.controlId} · {test.control?.name}</div><div className="text-[11px] text-slate-500">{test.process?.name} · {test.period} · Tester: {test.testerName}</div><div className="grid grid-cols-2 gap-1 mt-2 text-[10px] text-slate-600"><span>Objective alignment: {test.objectiveAlignment ? 'Yes':'No'}</span><span>Risk coverage: {test.riskCoverage ? 'Yes':'No'}</span><span>Precision: {test.precisionAdequate ? 'Yes':'No'}</span><span>Evidence: {test.evidenceSufficiency ? 'Yes':'No'}</span></div></div>)}</div></div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5"><h2 className="font-bold text-slate-900 mb-3">Walkthroughs ({walkthroughs.length})</h2><div className="space-y-3">{walkthroughs.map((walk:any) => <div key={walk.id} className="p-3 border border-slate-200 rounded-xl text-xs"><div className="flex justify-between gap-2"><span className="font-mono font-bold">{walk.controlId}</span><span className="font-bold">{walk.conclusion}</span></div><div className="text-[11px] text-slate-500">{new Date(walk.date).toLocaleDateString('id-ID')} · {walk.participants || 'Participants not recorded'}</div><p className="text-slate-600 mt-1">{walk.observations || 'No observations recorded'}</p></div>)}</div></div>
        </div>
      )}
    </div>
  );
}
