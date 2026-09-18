'use client';

import React, { useState } from 'react';
import { Sparkles, X, AlertCircle, CheckCircle2, ShieldAlert, Cpu, ArrowRight } from 'lucide-react';

interface Finding {
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
}

export function AIChatDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [activeTab, setActiveTab] = useState<'audit' | 'suggest_risk' | 'root_cause'>('audit');

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processName: 'Procure to Pay' })
      });
      const data = await res.json();
      setFindings(data.findings || []);
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAction = (id: string, action: 'Accept' | 'Reject') => {
    setFindings(prev => prev.map(f => (f.id === id ? { ...f, status: action === 'Accept' ? 'Accepted by Human' : 'Rejected' } : f)));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-brand-900 via-brand-800 to-navy-900 text-white">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-brand-500/20 text-brand-300 border border-brand-400/30">
              <Sparkles className="w-5 h-5 text-sky-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-white">Total ARC AI Assistant</h3>
                <span className="text-[10px] bg-brand-400/20 text-sky-200 px-2 py-0.5 rounded-full border border-sky-300/30">
                  v2.4
                </span>
              </div>
              <p className="text-xs text-brand-200">
                Cognitive Process, Risk & Control Quality Advisory
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-brand-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Governance Notice */}
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-start space-x-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900">
            <strong>AI Governance Notice (Section 114):</strong> AI never autonomously approves processes, overrides tester ratings, or closes issues. All suggestions strictly require human review.
          </p>
        </div>

        {/* Action Bar */}
        <div className="px-6 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'audit'
                  ? 'bg-white text-brand-700 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Process & Control Gap Scan
            </button>
            <button
              onClick={() => setActiveTab('suggest_risk')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'suggest_risk'
                  ? 'bg-white text-brand-700 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Risk & KRI Synthesizer
            </button>
          </div>

          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="flex items-center space-x-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg shadow-sm disabled:opacity-50 transition-all"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>{analyzing ? 'Scanning...' : 'Run AI Scan'}</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {findings.length === 0 && !analyzing && (
            <div className="text-center py-12 px-4">
              <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-3">
                <Sparkles className="w-6 h-6" />
              </div>
              <h4 className="font-semibold text-slate-800 text-sm">Ready for Analysis</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Click &quot;Run AI Scan&quot; to inspect Procure to Pay activities, approval thresholds, system integrations, and segregation of duties.
              </p>
              <button
                onClick={runAnalysis}
                className="mt-4 inline-flex items-center space-x-2 text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 border border-brand-200 px-4 py-2 rounded-lg transition-colors"
              >
                <span>Analyze Procure to Pay Now</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {analyzing && (
            <div className="space-y-4 py-8">
              <div className="animate-pulse flex space-x-4">
                <div className="flex-1 space-y-3 py-1">
                  <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                  <div className="space-y-2">
                    <div className="h-3 bg-slate-100 rounded"></div>
                    <div className="h-3 bg-slate-100 rounded w-5/6"></div>
                  </div>
                </div>
              </div>
              <p className="text-center text-xs text-slate-500 font-medium">
                Evaluating BPM activities, ERP delegation tables, and control placements...
              </p>
            </div>
          )}

          {findings.map(finding => (
            <div
              key={finding.id}
              className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-slate-300 transition-all space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        finding.severity === 'Critical'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {finding.severity}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {finding.type}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-900 mt-1">
                    {finding.title}
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  {finding.id}
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                {finding.description}
              </p>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1 text-xs">
                <div className="text-slate-500 font-medium">Recommendation:</div>
                <div className="text-slate-800 font-medium">{finding.recommendation}</div>
              </div>

              {/* Mandatory Prompt Tagline Banner */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                <span className="inline-flex items-center space-x-1.5 text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>{finding.disclaimer}</span>
                </span>

                {finding.status === 'Pending Review' ? (
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => handleAction(finding.id, 'Reject')}
                      className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleAction(finding.id, 'Accept')}
                      className="px-3 py-1 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition-colors"
                    >
                      Accept
                    </button>
                  </div>
                ) : (
                  <span className="text-xs font-semibold text-emerald-700 flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{finding.status}</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
