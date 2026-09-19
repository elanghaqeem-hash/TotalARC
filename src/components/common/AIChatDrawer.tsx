'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Ban,
  Check,
  CheckCircle2,
  Cpu,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X
} from 'lucide-react';

type Finding = {
  id: string;
  category: string;
  description: string;
  recommendation?: string | null;
  suggestedRisk?: string | null;
  suggestedControl?: string | null;
  provider?: string | null;
  model: string;
  requestId?: string | null;
  redactions?: number;
  fallbackUsed?: boolean;
  status: string;
};

type ProcessOption = {
  id: string;
  processId: string;
  name: string;
};

type ProviderStatus = {
  provider: string;
  configured: boolean;
  model: string;
  role: string;
};

type AiMeta = {
  requestId: string;
  provider: string;
  model: string;
  attemptedProviders: string[];
  fallbackUsed: boolean;
  redactions: number;
  durationMs: number;
};

type GatewayStatus = {
  defaultSensitivity?: string;
  externalSensitiveFallbackEnabled?: boolean;
  externalRedactionEnabled?: boolean;
  providers?: ProviderStatus[];
};

export function AIChatDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [processes, setProcesses] = useState<ProcessOption[]>([]);
  const [processId, setProcessId] = useState('');
  const [mode, setMode] = useState('control_gap');
  const [findings, setFindings] = useState<Finding[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>({});
  const [aiMeta, setAiMeta] = useState<AiMeta | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  const configuredProviders = useMemo(
    () => providers.filter(provider => provider.configured),
    [providers]
  );

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setLoadingContext(true);
    setError('');

    Promise.all([
      fetch('/api/processes', { cache: 'no-store' }).then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Unable to load registered processes');
        return data;
      }),
      fetch('/api/ai/status', { cache: 'no-store' }).then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Unable to load AI gateway status');
        return data;
      })
    ])
      .then(([processData, statusData]) => {
        if (cancelled) return;

        const rows = Array.isArray(processData.processes) ? processData.processes : [];
        setProcesses(rows);
        setProcessId(current =>
          current && rows.some((row: ProcessOption) => row.id === current)
            ? current
            : rows[0]?.id || ''
        );

        const nextProviders = Array.isArray(statusData.providers) ? statusData.providers : [];
        setProviders(nextProviders);
        setGatewayStatus({
          defaultSensitivity: statusData.defaultSensitivity,
          externalSensitiveFallbackEnabled: statusData.externalSensitiveFallbackEnabled === true,
          externalRedactionEnabled: statusData.externalRedactionEnabled !== false,
          providers: nextProviders
        });
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load AI context');
      })
      .finally(() => {
        if (!cancelled) setLoadingContext(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const runAnalysis = async () => {
    if (!processId || configuredProviders.length === 0) return;

    setAnalyzing(true);
    setError('');
    setFindings([]);
    setAiMeta(null);

    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processId, mode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI analysis failed');

      setFindings(Array.isArray(data.findings) ? data.findings : []);
      setAiMeta(data.ai || null);
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
      setFindings(rows =>
        rows.map(row => row.id === id ? { ...row, status: data.status } : row)
      );
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
            <div className="p-2 rounded-lg bg-sky-500/15 border border-sky-400/20">
              <Sparkles className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h3 className="font-bold">Total ARC AI Assistant</h3>
              <p className="text-[11px] text-slate-300">
                Governed provider routing · tenant-scoped evidence · human review
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" aria-label="Close AI assistant">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 border-b border-slate-200 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  AI Gateway
                </div>
                <div className="text-xs text-slate-700 mt-1">
                  {loadingContext
                    ? 'Checking provider configuration…'
                    : configuredProviders.length
                      ? `${configuredProviders.length} eligible provider(s) available`
                      : 'No eligible provider is configured'}
                </div>
              </div>
              <span className={
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border ' +
                (configuredProviders.length
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200')
              }>
                {configuredProviders.length
                  ? <CheckCircle2 className="w-3.5 h-3.5" />
                  : <AlertCircle className="w-3.5 h-3.5" />}
                {configuredProviders.length ? 'Ready' : 'Fail closed'}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {providers.map(provider => (
                <div key={provider.provider} className="rounded-lg border border-slate-200 bg-white p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase text-slate-700">{provider.provider}</span>
                    <span className={
                      'w-2 h-2 rounded-full ' +
                      (provider.configured ? 'bg-emerald-500' : 'bg-slate-300')
                    } />
                  </div>
                  <div className="text-[9px] text-slate-500 mt-1 truncate">
                    {provider.configured ? provider.model : 'Not configured'}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 text-[10px] leading-relaxed text-slate-500">
              Default sensitivity: <strong>{gatewayStatus.defaultSensitivity || 'confidential'}</strong>.
              {' '}External sensitive fallback: <strong>{gatewayStatus.externalSensitiveFallbackEnabled ? 'enabled by policy' : 'disabled'}</strong>.
              {' '}External redaction: <strong>{gatewayStatus.externalRedactionEnabled === false ? 'disabled' : 'enabled'}</strong>.
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-slate-700">
              Business Process
              <select
                value={processId}
                onChange={e => setProcessId(e.target.value)}
                disabled={loadingContext}
                className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white disabled:bg-slate-100"
              >
                {processes.length === 0 && <option value="">No registered process</option>}
                {processes.map(p => (
                  <option key={p.id} value={p.id}>{p.processId} — {p.name}</option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-700">
              Analysis Mode
              <select
                value={mode}
                onChange={e => setMode(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
              >
                <option value="control_gap">Control gap review</option>
                <option value="risk_suggestion">Risk suggestion</option>
                <option value="root_cause">Root-cause support</option>
              </select>
            </label>
          </div>

          <button
            disabled={analyzing || loadingContext || !processId || configuredProviders.length === 0}
            onClick={runAnalysis}
            className="w-full inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg py-2.5"
          >
            {analyzing
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <Cpu className="w-4 h-4" />}
            {analyzing ? 'Analyzing registered evidence…' : 'Run governed evidence analysis'}
          </button>

          <div className="flex gap-2 text-[10px] text-slate-600 bg-sky-50 rounded-lg p-2.5 border border-sky-200">
            <ShieldCheck className="w-4 h-4 text-sky-700 shrink-0" />
            <span>
              Confidential analysis stays on Cloudflare Workers AI by default. External fallback requires an explicit server policy; external-bound content is redacted when redaction is enabled. Accepting a suggestion records human review only—it does not create or alter a risk, control, test conclusion, MAP, or certification.
            </span>
          </div>

          {error && (
            <div className="flex gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {aiMeta && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] text-slate-600">
              <div className="flex items-center justify-between gap-3">
                <span>
                  Provider: <strong className="text-slate-800">{aiMeta.provider}</strong>
                  {' · '}
                  {aiMeta.model}
                </span>
                <span>{aiMeta.durationMs} ms</span>
              </div>
              <div className="mt-1">
                Request: <span className="font-mono">{aiMeta.requestId}</span>
                {' · '}Redactions: {aiMeta.redactions}
                {' · '}Fallback: {aiMeta.fallbackUsed ? 'Yes' : 'No'}
              </div>
              {aiMeta.attemptedProviders?.length > 0 && (
                <div className="mt-1">
                  Attempted: {aiMeta.attemptedProviders.join(' → ')}
                </div>
              )}
            </div>
          )}

          {!analyzing && !error && findings.length === 0 && (
            <div className="text-center text-xs text-slate-400 py-10">
              {configuredProviders.length === 0
                ? 'AI analysis is unavailable until an eligible provider is configured.'
                : 'No AI suggestions loaded. Select a registered process and run analysis.'}
            </div>
          )}

          {findings.map(item => (
            <article key={item.id} className="border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">{item.category}</span>
                <span className="text-[10px] rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                  {item.status}
                </span>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed">{item.description}</p>

              {item.recommendation && (
                <div className="text-[11px] text-slate-600">
                  <strong>Recommendation:</strong> {item.recommendation}
                </div>
              )}
              {item.suggestedRisk && (
                <div className="text-[11px] text-slate-600">
                  <strong>Suggested risk:</strong> {item.suggestedRisk}
                </div>
              )}
              {item.suggestedControl && (
                <div className="text-[11px] text-slate-600">
                  <strong>Suggested control:</strong> {item.suggestedControl}
                </div>
              )}

              {(item.provider || item.requestId) && (
                <div className="text-[9px] text-slate-400 font-mono border-t border-slate-100 pt-2">
                  {item.provider || 'provider'} · {item.model}
                  {item.requestId ? ' · ' + item.requestId : ''}
                  {typeof item.redactions === 'number' ? ' · redactions=' + item.redactions : ''}
                  {item.fallbackUsed ? ' · fallback' : ''}
                </div>
              )}

              {item.status === 'Pending Review' && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => review(item.id, 'Accept')}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />Accept suggestion
                  </button>
                  <button
                    onClick={() => review(item.id, 'Reject')}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5"
                  >
                    <Ban className="w-3.5 h-3.5" />Reject
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
