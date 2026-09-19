'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X
} from 'lucide-react';

type ProcessOption = {
  id: string;
  processId: string;
  name: string;
  status?: string;
};

type Finding = {
  id: string;
  type: string;
  severity: string;
  title: string;
  category: string;
  description: string;
  recommendation: string;
  suggestedRisk: string;
  suggestedControl: string;
  disclaimer: string;
  status: string;
};

type AiMeta = {
  requestId: string;
  provider: string;
  model: string;
  fallbackUsed: boolean;
  durationMs: number;
};

type ProviderStatus = {
  provider: string;
  configured: boolean;
  model: string;
  role: string;
};

type ContextError = {
  scope: 'ai' | 'process';
  message: string;
};

export function AIChatDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [processes, setProcesses] = useState<ProcessOption[]>([]);
  const [selectedProcessId, setSelectedProcessId] = useState('');
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [analysisNote, setAnalysisNote] = useState('');
  const [aiMeta, setAiMeta] = useState<AiMeta | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [contextErrors, setContextErrors] = useState<ContextError[]>([]);
  const [analysisError, setAnalysisError] = useState('');

  const configuredProviders = providers.filter(provider => provider.configured);
  const aiStatusUnavailable = contextErrors.some(error => error.scope === 'ai');
  const processDataUnavailable = contextErrors.some(error => error.scope === 'process');

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setLoadingContext(true);
    setContextErrors([]);
    setAnalysisError('');

    Promise.allSettled([
      fetch('/api/ai/status').then(async response => {
        if (!response.ok) throw new Error('AI gateway status request failed.');
        return response.json();
      }),
      fetch('/api/processes').then(async response => {
        if (!response.ok) throw new Error('Registered process request failed.');
        return response.json();
      })
    ])
      .then(([statusResult, processResult]) => {
        if (cancelled) return;

        const nextErrors: ContextError[] = [];

        if (statusResult.status === 'fulfilled') {
          const statusData = statusResult.value;
          const nextProviders = Array.isArray(statusData.providers) ? statusData.providers : [];
          setProviders(nextProviders);
        } else {
          setProviders([]);
          nextErrors.push({
            scope: 'ai',
            message:
              'AI gateway status could not be verified. This does not indicate that registered process data is unavailable.'
          });
        }

        if (processResult.status === 'fulfilled') {
          const processData = processResult.value;
          const nextProcesses = Array.isArray(processData.processes)
            ? processData.processes.map((process: ProcessOption) => ({
                id: process.id,
                processId: process.processId,
                name: process.name,
                status: process.status
              }))
            : [];

          setProcesses(nextProcesses);
          setSelectedProcessId(current =>
            current && nextProcesses.some((process: ProcessOption) => process.id === current)
              ? current
              : nextProcesses[0]?.id || ''
          );
        } else {
          setProcesses([]);
          setSelectedProcessId('');
          nextErrors.push({
            scope: 'process',
            message:
              'Registered process data could not be loaded from the process data API. This is a business-data connectivity issue and does not by itself mean that the AI provider is unavailable.'
          });
        }

        setContextErrors(nextErrors);
      })
      .finally(() => {
        if (!cancelled) setLoadingContext(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const runAnalysis = async () => {
    if (!selectedProcessId) return;

    setAnalyzing(true);
    setAnalysisError('');
    setFindings([]);
    setAnalysisNote('');
    setAiMeta(null);

    try {
      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processId: selectedProcessId,
          sensitivity: 'confidential'
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.error || 'AI analysis failed.');
      }

      setFindings(Array.isArray(data.findings) ? data.findings : []);
      setAnalysisNote(typeof data.analysisNote === 'string' ? data.analysisNote : '');
      setAiMeta(data.ai || null);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'AI analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm">
      <div className="w-full max-w-xl h-full bg-white shadow-2xl flex flex-col border-l border-slate-200">
        <div className="px-6 py-4 bg-slate-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-600/30 border border-brand-400/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-sky-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm">Total ARC AI Assistant</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-200">
                  v3.0
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Persisted-context analysis · multi-provider gateway
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-amber-900">
            AI is advisory only. It cannot approve processes, change risk or test ratings,
            close issues, or create remediation without human action.
          </p>
        </div>

        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                AI Gateway
              </div>
              <div className="text-xs text-slate-700 mt-1">
                {loadingContext
                  ? 'Checking configuration...'
                  : aiStatusUnavailable
                    ? 'Gateway status could not be verified'
                    : configuredProviders.length > 0
                      ? configuredProviders.length + ' provider(s) configured'
                      : 'No provider is currently configured'}
              </div>
            </div>
            <div
              className={
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ' +
                (configuredProviders.length > 0 && !aiStatusUnavailable
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : aiStatusUnavailable
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200')
              }
            >
              {configuredProviders.length > 0 && !aiStatusUnavailable ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5" />
              )}
              <span>
                {configuredProviders.length > 0 && !aiStatusUnavailable
                  ? 'Ready'
                  : aiStatusUnavailable
                    ? 'Status unavailable'
                    : 'Not configured'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
              Registered process
            </label>
            <select
              value={selectedProcessId}
              onChange={event => setSelectedProcessId(event.target.value)}
              disabled={loadingContext || processes.length === 0}
              className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-100"
            >
              {processes.length === 0 ? (
                <option value="">
                  {processDataUnavailable ? 'Process data could not be loaded' : 'No registered process available'}
                </option>
              ) : (
                processes.map(process => (
                  <option key={process.id} value={process.id}>
                    {process.processId} — {process.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            onClick={runAnalysis}
            disabled={
              analyzing ||
              loadingContext ||
              !selectedProcessId ||
              configuredProviders.length === 0
            }
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {analyzing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Cpu className="w-4 h-4" />
            )}
            <span>{analyzing ? 'Analyzing persisted BPM / RCM context...' : 'Run governed AI analysis'}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {contextErrors.map(error => (
            <div
              key={error.scope}
              className={
                'rounded-lg border p-3 text-xs ' +
                (error.scope === 'process'
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-red-200 bg-red-50 text-red-800')
              }
            >
              <strong>
                {error.scope === 'process'
                  ? 'Process data unavailable:'
                  : 'AI gateway status unavailable:'}
              </strong>{' '}
              {error.message}
            </div>
          ))}

          {analysisError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <strong>AI analysis unavailable:</strong> {analysisError}
            </div>
          )}

          {!loadingContext && processes.length === 0 && !processDataUnavailable && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
              <AlertCircle className="w-6 h-6 text-slate-400 mx-auto" />
              <h4 className="text-sm font-bold text-slate-800 mt-2">No process context yet</h4>
              <p className="text-xs text-slate-500 mt-1">
                Register real BPM data first. Total ARC AI does not generate findings from synthetic process data.
              </p>
            </div>
          )}

          {aiMeta && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 flex items-center justify-between gap-3">
              <span>
                Provider: <strong className="text-slate-800">{aiMeta.provider}</strong>
                {' · '}
                {aiMeta.model}
                {aiMeta.fallbackUsed ? ' · fallback used' : ''}
              </span>
              <span>{aiMeta.durationMs} ms</span>
            </div>
          )}

          {analysisNote && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 leading-relaxed">
              {analysisNote}
            </div>
          )}

          {aiMeta && findings.length === 0 && !analysisNote && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              Analysis completed with no evidence-based finding returned.
            </div>
          )}

          {findings.map(finding => (
            <div key={finding.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        'text-[10px] font-bold px-2 py-0.5 rounded-full border ' +
                        (finding.severity === 'Critical'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : finding.severity === 'High'
                            ? 'bg-orange-50 text-orange-700 border-orange-200'
                            : finding.severity === 'Low'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200')
                      }
                    >
                      {finding.severity}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">{finding.type}</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mt-1.5">{finding.title}</h4>
                </div>
                <span className="text-[10px] font-mono text-slate-400">{finding.id}</span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">{finding.description}</p>

              {finding.recommendation && (
                <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Recommendation</div>
                  <p className="text-xs text-slate-800 mt-1 leading-relaxed">{finding.recommendation}</p>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 text-[10px] font-bold text-amber-800 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{finding.disclaimer}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
