'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ClipboardCheck,
  CheckCircle2,
  Shield,
  Layers,
  AlertTriangle,
  ArrowRight,
  FileCheck2,
  HelpCircle,
  Clock,
  Sparkles
} from 'lucide-react';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';

export default function RCSAPage() {
  const [activeTab, setActiveTab] = useState<'campaign' | 'questionnaire'>('questionnaire');

  const [questions, setQuestions] = useState({
    wasPerformed: true,
    frequencyMet: true,
    evidenceAttached: true,
    exceptionsFound: false,
    processChanged: false,
    controlChanged: false,
    csaConclusion: 'Effective',
    notes: 'Control performed per policy for all payment runs. Digital SAP approval logs archived in workflow repository.'
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-sky-600 uppercase tracking-wider">
            <ClipboardCheck className="w-4 h-4" />
            <span>Risk & Control Self Assessment (ASSURE)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            RCSA Campaigns & Control Self-Assessment (CSA)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Section 50 Principle: RCSA uses existing Process, Risk, Control, and RCM master data. Zero duplicate data entry.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-xs font-bold text-brand-700 bg-brand-50 border border-brand-200 px-3 py-1.5 rounded-xl">
            Campaign: FY2026-Q3
          </span>
        </div>
      </div>

      <TraceabilityFlow currentStep="CSA" />

      {/* CSA QUESTIONNAIRE ENGINE (Section 53 & 55) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                CTRL-P2P-001
              </span>
              <span className="text-xs text-slate-500 font-semibold">
                Procure to Pay (PRC-P2P-001)
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1">
              Control Self-Assessment: Dual Authorization on Disbursements &gt; IDR 100M
            </h2>
          </div>

          <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
            Owner Assessment: {questions.csaConclusion}
          </span>
        </div>

        {/* Questionnaire Form */}
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900">1. Was the control performed?</span>
                <p className="text-slate-500 text-[11px] mt-0.5">Executed consistently during the period.</p>
              </div>
              <span className="font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                Yes
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900">2. Was required frequency met?</span>
                <p className="text-slate-500 text-[11px] mt-0.5">Enforced per transaction prior to release.</p>
              </div>
              <span className="font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                Yes
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900">3. Was audit evidence available?</span>
                <p className="text-slate-500 text-[11px] mt-0.5">SAP digital sign-off and banking logs.</p>
              </div>
              <span className="font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                Yes
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900">4. Were exceptions self-identified?</span>
                <p className="text-slate-500 text-[11px] mt-0.5">Deviations noted by control owner.</p>
              </div>
              <span className="font-bold text-slate-700 bg-slate-200 px-3 py-1 rounded-full">
                No
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900">5. Has process or control changed?</span>
                <p className="text-slate-500 text-[11px] mt-0.5">Organizational or system amendments.</p>
              </div>
              <span className="font-bold text-slate-700 bg-slate-200 px-3 py-1 rounded-full">
                No
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900">6. Final Self-Assessment Rating</span>
                <p className="text-slate-500 text-[11px] mt-0.5">Owner conclusion on effectiveness.</p>
              </div>
              <span className="font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                Effective
              </span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <span className="text-[10px] font-bold uppercase text-slate-400">
              Assessor Commentary & Audit Reference
            </span>
            <p className="text-slate-800 font-medium leading-relaxed">
              {questions.notes}
            </p>
            <div className="pt-2 border-t border-slate-200 flex justify-between text-slate-500 text-[11px]">
              <span>Assessor: <strong>Rizky Ananda (Control Owner)</strong></span>
              <span>Reviewer Challenge: <strong>Dian Sastrowardoyo (Assurance Lead)</strong></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
