'use client';

import React, { useEffect, useState } from 'react';
import { Sparkles, X, ShieldCheck, AlertCircle, Check, Ban } from 'lucide-react';

type Finding = {
  id: string;
  category: string;
  description: string;
  recommendation?: string | null;
  suggestedRisk?: string | null;
  suggestedControl?: string | null;
  status: string;
};

type ProcessOption = { id: string; processId: string; name: string };

export function AIChatDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [processes, setProcesses] = useState<ProcessOption[]>([]);
  const [processId, setProcessId] = useState('');
  const [mode, setMode] = useState('control_gap');
  const [findings, setFindings] = useState<Finding[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/processes', { cache: 'no-store' })
      .then(async res => {
        if (!res.ok) throw new Error('Unable to load processes');
        return res.json();
      })
      .then(data => {
        const rows = data.processes || [];
        setProcesses(rows);
        if (!processId && rows[0]) setProcessId(rows[0].id);
      })
      .catch(err => setError(err.message));
  }, [isOpen, processId]);

  const runAnalysis = async () => {
    if (!processId) return;
    setAnalyzing(true);
    setError('');
    setFindings([]);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processId, mode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI analysis failed');
      setFindings(data.findings || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const review = async (id: string, decision: 'Accept' | 'Reject') => {
    setError('');
    try {
      const res = await fetch('/api/ai/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Review action failed');
      setFindings(rows => rows.map(row => row.id === id ? { ...row, status: data.status } : row));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review action failed');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm">
      <div className="w-full max-w-xl h-full bg-white shadow-2xl flex flex-col border-l border-slate-200">
        <div className="px-5 py-4 bg-slate-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-500/15 border border-sky-400/20"><Sparkles className="w-5 h-5 text-sky-300" /></div>
            <div>
              <h3 className="font-bold">Total ARC AI Assistant</h3>
              <p className="text-[11px] text-slate-300">Evidence-grounded analysis with human approval</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" aria-label="Close AI assistant"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 border-b border-slate-200 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-slate-700">
              Business Process
              <select value={processId} onChange={e => setProcessId(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white">
                {processes.length === 0 && <option value="">No registered process</option>}
                {processes.map(p => <option key={p.id} value={p.id}>{p.processId} — {p.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Analysis Mode
              <select value={mode} onChange={e => setMode(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white">
                <option value="control_gap">Control gap review</option>
                <option value="risk_suggestion">Risk suggestion</option>
                <option value="root_cause">Root-cause support</option>
              </select>
            </label>
          </div>
          <button disabled={analyzing || !processId} onClick={runAnalysis} className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg py-2.5">
            {analyzing ? 'Analyzing registered evidence…' : 'Run evidence-grounded analysis'}
          </button>
          <div className="flex gap-2 text-[10px] text-slate-500 bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>External AI processing is disabled unless explicitly enabled in server configuration. No synthetic finding is returned when the provider is unavailable.</span>
          </div>
          {error && <div className="flex gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {!analyzing && !error && findings.length === 0 && (
            <div className="text-center text-xs text-slate-400 py-10">No AI suggestions loaded. Select a registered process and run analysis.</div>
          )}
          {findings.map(item => (
            <article key={item.id} className="border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">{item.category}</span>
                <span className="text-[10px] rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{item.status}</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">{item.description}</p>
              {item.recommendation && <div className="text-[11px] text-slate-600"><strong>Recommendation:</strong> {item.recommendation}</div>}
              {item.suggestedRisk && <div className="text-[11px] text-slate-600"><strong>Suggested risk:</strong> {item.suggestedRisk}</div>}
              {item.suggestedControl && <div className="text-[11px] text-slate-600"><strong>Suggested control:</strong> {item.suggestedControl}</div>}
              {item.status === 'Pending Review' && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => review(item.id, 'Accept')} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5"><Check className="w-3.5 h-3.5" />Accept</button>
                  <button onClick={() => review(item.id, 'Reject')} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5"><Ban className="w-3.5 h-3.5" />Reject</button>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
