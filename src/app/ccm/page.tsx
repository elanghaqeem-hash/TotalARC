'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Database } from 'lucide-react';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';

export default function CCMPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/monitor/ccm')
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('CCM data unavailable')))
      .then((data) => setRules(data.rules || []))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase"><Activity className="w-4 h-4" />Continuous Control Monitoring</div>
        <h1 className="text-2xl font-black text-slate-900 mt-1">CCM Cockpit</h1>
        <p className="text-xs text-slate-500 mt-1">Monitoring status and execution history are displayed only from persisted results supplied by an actual monitoring integration.</p>
      </div>
      <TraceabilityFlow currentStep="CCM Monitor" />
      {error && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}
      {rules.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center">
          <Database className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <div className="font-bold text-slate-700">No monitoring rules configured</div>
          <p className="text-xs text-slate-500 mt-1">No simulated runs are generated. Configure a rule and connect a real execution source first.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => (
            <div key={rule.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-2">
                <div><div className="font-mono text-xs text-brand-700 font-bold">{rule.ruleId}</div><h2 className="font-bold text-slate-900">{rule.name}</h2><div className="text-xs text-slate-500">{rule.control?.controlId} · {rule.control?.name}</div></div>
                <span className="text-xs font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-700">{rule.lastStatus || 'Not Run'}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200"><div className="text-[10px] uppercase text-slate-400 font-bold">Data source</div><div className="font-semibold">{rule.dataSource || 'Not configured'}</div></div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200"><div className="text-[10px] uppercase text-slate-400 font-bold">Frequency</div><div className="font-semibold">{rule.frequency || 'Not configured'}</div></div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200"><div className="text-[10px] uppercase text-slate-400 font-bold">Threshold</div><div className="font-semibold">{rule.threshold || 'Not configured'}</div></div>
              </div>
              <div>
                <div className="text-xs font-bold text-slate-700 mb-2">Execution history ({rule.runs?.length || 0})</div>
                {(!rule.runs || rule.runs.length === 0) ? <div className="text-xs text-slate-400">No actual execution results have been ingested.</div> :
                  rule.runs.map((run: any) => (
                    <div key={run.id} className="p-3 border-t border-slate-100 text-xs flex flex-col md:flex-row md:items-center justify-between gap-2">
                      <div><span className="font-bold">{run.status}</span> · population {run.populationChecked} · exceptions {run.exceptionsFound}<div className="text-[11px] text-slate-500">{run.details || 'No execution detail recorded'}</div></div>
                      <div className="text-[10px] text-slate-400">{new Date(run.runTimestamp).toLocaleString('id-ID')}</div>
                    </div>
                  ))
                }
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
