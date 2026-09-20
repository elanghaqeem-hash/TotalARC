'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Cpu, ShieldCheck } from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';

function tone(value: string) {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('attention') || normalized.includes('ineffective') || normalized.includes('exception')) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  if (normalized.includes('partial')) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (normalized.includes('effective') || normalized.includes('healthy')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

export default function HealthPage() {
  const { data, loading, error, refresh } = useAssuranceData(['health']);
  const controls = data?.controls || [];

  const summary = useMemo(() => {
    const attention = controls.filter((control: any) =>
      ['Attention Required', 'Ineffective'].includes(String(control.computedHealth || control.overallHealth))
    ).length;
    const effective = controls.filter((control: any) =>
      String(control.computedHealth || control.overallHealth) === 'Effective'
    ).length;
    const monitored = controls.filter((control: any) => (control.monitoringRules || []).length > 0).length;
    const openIssues = controls.reduce(
      (sum: number, control: any) =>
        sum +
        (control.issues || []).filter(
          (issue: any) => !['Closed', 'Completed', 'Cancelled'].includes(String(issue.status))
        ).length,
      0
    );
    return { attention, effective, monitored, openIssues };
  }, [controls]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase">
              <Activity className="w-4 h-4" />Control Health
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Control Health Cockpit</h1>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              Health uses persisted Control Master, RCSA/CSA, ToD, ToE, issue/remediation, and CCM records. No synthetic health data is inserted.
            </p>
          </div>
          <button onClick={() => refresh()} className="text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 hover:bg-slate-50">
            Refresh database view
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Effective', summary.effective, CheckCircle2],
          ['Attention', summary.attention, AlertTriangle],
          ['CCM Monitored', summary.monitored, Cpu],
          ['Open Issues', summary.openIssues, ShieldCheck]
        ].map(([label, value, Icon]: any) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide font-bold text-slate-400">{label}</span>
              <Icon className="w-4 h-4 text-brand-600" />
            </div>
            <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3 flex gap-2 overflow-x-auto">
        {[
          ['/controls', 'Control Master'],
          ['/rcsa', 'RCSA & CSA'],
          ['/tod', 'ToD'],
          ['/toe', 'ToE'],
          ['/ccm', 'CCM'],
          ['/remediation', 'Remediation']
        ].map(([href, label]) => (
          <Link key={href} href={href} className="whitespace-nowrap text-xs font-bold rounded-lg bg-slate-50 px-3 py-2 text-slate-600 hover:text-brand-700">
            {label}
          </Link>
        ))}
      </div>

      {error && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}
      {loading ? (
        <div className="text-xs text-slate-500">Loading integrated control evidence…</div>
      ) : controls.length === 0 ? (
        <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl">
          <div className="font-bold text-slate-700">No controls registered</div>
          <p className="text-xs text-slate-500 mt-1">Register controls first; testing, assessment, monitoring, and issue evidence will then roll into this cockpit.</p>
          <Link href="/controls" className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-brand-700">
            Open Control Master <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {controls.map((control:any) => {
            const latestRun = control.monitoringRules?.flatMap((rule:any)=>rule.runs || [])[0];
            const health = control.computedHealth || control.overallHealth || 'Not Assessed';
            return (
              <div key={control.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-bold text-brand-600">{control.controlId}</div>
                    <div className="font-bold text-slate-900">{control.name}</div>
                    <div className="text-[11px] text-slate-500">{control.process?.name || 'No process linked'}</div>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 h-fit rounded-full border ${tone(health)}`}>
                    {health}
                  </span>
                </div>

                <div className="mt-2 text-[10px] text-slate-400">Health basis: {control.healthBasis || 'Control Master'}</div>

                <div className="grid grid-cols-2 gap-2 mt-4 text-[11px]">
                  <div className="p-2 bg-slate-50 rounded">Design: <strong>{control.designAssessment}</strong></div>
                  <div className="p-2 bg-slate-50 rounded">Operating: <strong>{control.operatingStatus}</strong></div>
                  <Link href="/tod" className="p-2 bg-slate-50 rounded hover:bg-brand-50">ToD: <strong>{control.todTests?.length || 0}</strong></Link>
                  <Link href="/toe" className="p-2 bg-slate-50 rounded hover:bg-brand-50">ToE: <strong>{control.toeTests?.length || 0}</strong></Link>
                  <Link href="/remediation" className="p-2 bg-slate-50 rounded hover:bg-brand-50">Issues: <strong>{control.issues?.length || 0}</strong></Link>
                  <Link href="/ccm" className="p-2 bg-slate-50 rounded hover:bg-brand-50">Latest CCM: <strong>{latestRun?.status || 'Not Run'}</strong></Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
