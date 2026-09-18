'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Database, PlayCircle, ShieldCheck } from 'lucide-react';

type Rule = {
  id: string;
  ruleId: string;
  name: string;
  dataSource: string;
  queryLogic: string;
  frequency: string;
  threshold: string;
  lastStatus: string;
  control: { controlId: string; name: string; process: { processId: string; name: string } };
  runs: Array<{ id: string; runTimestamp: string; populationChecked: number; exceptionsFound: number; status: string; details?: string | null; exceptions: Array<{ id: string; transactionRef: string; details: string }> }>;
};

export default function CCMPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [selected, setSelected] = useState('');
  const [population, setPopulation] = useState('');
  const [details, setDetails] = useState('');
  const [exceptionLines, setExceptionLines] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch('/api/monitor/ccm', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to load CCM rules');
    setRules(data.rules || []);
    if (!selected && data.rules?.[0]) setSelected(data.rules[0].id);
  };

  useEffect(() => { load().catch(err => setMessage(err.message)); }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const exceptions = exceptionLines.split('\n').map(x => x.trim()).filter(Boolean).map(line => {
        const [transactionRef, ...rest] = line.split('|');
        return { transactionRef: transactionRef.trim(), details: rest.join('|').trim() || 'Exception recorded from verified monitoring source.' };
      });
      const res = await fetch('/api/monitor/ccm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId: selected, populationChecked: Number(population), details, exceptions })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to record CCM execution');
      setPopulation('');
      setDetails('');
      setExceptionLines('');
      setMessage('Verified monitoring execution recorded.');
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to record CCM execution');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-black text-slate-900">Continuous Control Monitoring</h1>
        <p className="text-xs text-slate-500 mt-1">Only verified execution data is stored. Total ARC no longer generates simulated populations or fake failures.</p>
      </div>

      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-600" /><h2 className="text-sm font-bold text-slate-900">Record verified execution</h2></div>
        <div className="grid md:grid-cols-2 gap-3 text-xs">
          <label className="font-semibold text-slate-700">Monitoring rule
            <select required value={selected} onChange={e => setSelected(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white">
              {rules.length === 0 && <option value="">No rule registered</option>}
              {rules.map(r => <option key={r.id} value={r.id}>{r.ruleId} — {r.name}</option>)}
            </select>
          </label>
          <label className="font-semibold text-slate-700">Population checked
            <input required type="number" min="0" value={population} onChange={e => setPopulation(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5" />
          </label>
        </div>
        <label className="block text-xs font-semibold text-slate-700">Execution evidence / source details
          <textarea value={details} onChange={e => setDetails(e.target.value)} rows={3} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5" placeholder="Describe source query, connector run ID, file hash, or evidence reference." />
        </label>
        <label className="block text-xs font-semibold text-slate-700">Exceptions (one per line: transaction/reference | details)
          <textarea value={exceptionLines} onChange={e => setExceptionLines(e.target.value)} rows={4} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 font-mono text-[11px]" placeholder="Leave blank when no verified exception was found." />
        </label>
        <button disabled={busy || !selected} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-lg">
          <PlayCircle className="w-4 h-4" />{busy ? 'Recording…' : 'Record Execution'}
        </button>
        {message && <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5">{message}</div>}
      </form>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {rules.map(rule => (
          <article key={rule.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono text-slate-400">{rule.ruleId}</div>
                <h3 className="text-sm font-bold text-slate-900">{rule.name}</h3>
                <div className="text-[11px] text-slate-500">{rule.control.process.processId} • {rule.control.controlId}</div>
              </div>
              <span className="h-fit text-[10px] px-2 py-1 rounded-full bg-slate-100 text-slate-600">{rule.lastStatus || 'Not Run'}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded-lg bg-slate-50"><Database className="w-3.5 h-3.5 text-brand-600 mb-1" /><strong>Source:</strong> {rule.dataSource}</div>
              <div className="p-2.5 rounded-lg bg-slate-50"><Activity className="w-3.5 h-3.5 text-brand-600 mb-1" /><strong>Frequency:</strong> {rule.frequency}</div>
            </div>
            <div className="text-[11px] text-slate-600"><strong>Rule logic:</strong> {rule.queryLogic}</div>
            <div className="border-t border-slate-100 pt-3 space-y-2">
              {rule.runs.map(run => (
                <div key={run.id} className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-slate-500">{new Date(run.runTimestamp).toLocaleString('id-ID')}</span>
                  <span className="font-semibold text-slate-700">{run.populationChecked} checked • {run.exceptionsFound} exception(s)</span>
                </div>
              ))}
              {rule.runs.length === 0 && <div className="text-xs text-slate-400">No verified execution has been recorded.</div>}
            </div>
          </article>
        ))}
        {rules.length === 0 && <div className="xl:col-span-2 border border-dashed border-slate-300 rounded-xl p-8 text-xs text-slate-500">No monitoring rules are registered. Create rules from the Control Library integration workflow before recording runs.</div>}
      </div>
    </div>
  );
}
