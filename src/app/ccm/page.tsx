'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Activity,
  Cpu,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Shield,
  Layers,
  Database,
  RefreshCw,
  Search,
  Sparkles
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';

export default function CCMPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);

  const loadRules = () => {
    fetch('/api/monitor/ccm')
      .then(res => res.json())
      .then(d => {
        setRules(d.rules || []);
        setLoading(false);
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadRules();
  }, []);

  const triggerRun = async (ruleId: string, simulateFailure = false) => {
    setExecuting(true);
    try {
      await fetch('/api/monitor/ccm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId, simulateFailure })
      });
      loadRules();
    } catch (e) {
      console.error(e);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-emerald-600 uppercase tracking-wider">
            <Activity className="w-4 h-4" />
            <span>Continuous Control Monitoring (MONITOR)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Continuous Control Monitoring (CCM) Cockpit
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Section 85–89 & 136: Automated SQL/API rule execution across ERP & banking feeds. Detects single sign-off or unauthorized threshold breaches in real time.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <span className="inline-flex items-center space-x-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold px-3.5 py-2 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Real-Time Engine Active</span>
          </span>
        </div>
      </div>

      <TraceabilityFlow currentStep="CCM Monitor" />

      {/* Rules & Live Execution Cards */}
      <div className="space-y-6">
        {rules.map(rule => (
          <div
            key={rule.id}
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-2">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-xs font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                    {rule.ruleId}
                  </span>
                  <span className="text-xs text-slate-500">
                    Monitoring: <strong>{rule.control?.controlId}</strong> ({rule.control?.name})
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 mt-1">{rule.name}</h2>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => triggerRun(rule.id, false)}
                  disabled={executing}
                  className="inline-flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm shadow-emerald-500/20 transition-all disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{executing ? 'Scanning...' : 'Run Automated Scan (Pass)'}</span>
                </button>

                <button
                  onClick={() => triggerRun(rule.id, true)}
                  disabled={executing}
                  className="inline-flex items-center space-x-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold px-3 py-2 rounded-xl transition-colors disabled:opacity-50"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Simulate Exception</span>
                </button>
              </div>
            </div>

            {/* Rule Config Details (Section 87) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400">Data Source</span>
                <div className="font-bold text-slate-900 mt-0.5">{rule.dataSource}</div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400">Execution Frequency</span>
                <div className="font-bold text-slate-900 mt-0.5">{rule.frequency}</div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400">Threshold</span>
                <div className="font-bold text-slate-900 mt-0.5">{rule.threshold}</div>
              </div>

              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <span className="text-[10px] font-bold uppercase text-emerald-700">Current Health</span>
                <div className="font-bold text-emerald-800 mt-0.5 flex items-center space-x-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{rule.lastStatus}</span>
                </div>
              </div>
            </div>

            {/* Query / Logic Display */}
            <div className="p-3.5 bg-slate-900 text-slate-200 rounded-xl font-mono text-[11px] space-y-1">
              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                Automated Query Logic (SQL/API Payload):
              </span>
              <div className="text-sky-300 font-bold">{rule.queryLogic}</div>
            </div>

            {/* Run History Log (Section 89) */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Automated Execution Log ({rule.runs?.length || 0} Runs)
              </h3>

              <div className="space-y-2">
                {rule.runs?.map((run: any) => (
                  <div
                    key={run.id}
                    className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                      run.status === 'Healthy'
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-rose-50/70 border-rose-300'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                          run.status === 'Healthy'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {run.status === 'Healthy' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">
                          Scanned {run.populationChecked} transactions • {run.exceptionsFound} Exceptions
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {run.details}
                        </div>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(run.runTimestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
