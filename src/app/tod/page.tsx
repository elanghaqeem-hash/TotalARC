'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Workflow,
  CheckCircle2,
  Shield,
  Layers,
  ArrowRight,
  FileCheck2,
  UserCheck,
  AlertTriangle
} from 'lucide-react';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';

export default function ToDPage() {
  const tod = {
    testId: 'TOD-P2P-001',
    controlId: 'CTRL-P2P-001',
    process: 'Procure to Pay (PRC-P2P-001)',
    tester: 'Kevin Sanjaya (Internal Control Specialist)',
    reviewer: 'Dian Sastrowardoyo (Assurance Lead)',
    period: '2026-Annual',
    objective: 'Evaluate whether the design of dual electronic authorization adequately mitigates the risk of unauthorized disbursements above IDR 100M.',
    criteria: [
      { name: 'Control Objective Alignment', status: true, note: 'Directly aligns with payment validity and authority limit policy.' },
      { name: 'Risk Coverage', status: true, note: 'Covers RSK-P2P-001 unauthorized release risk completely.' },
      { name: 'Precision & Threshold Clarity', status: true, note: 'Clear dollar threshold (> IDR 100M) hardcoded in ERP routing table.' },
      { name: 'Segregation of Duties (SoD)', status: true, note: 'Payment proposer cannot self-approve; dual tier signatories enforced.' },
      { name: 'Evidence Sufficiency', status: true, note: 'Immutable SAP digital sign-off log with timestamp and user ID.' }
    ],
    conclusion: 'Effective Design',
    walkthrough: {
      date: '2026-05-14',
      participants: 'Kevin Sanjaya (Tester), Rizky Ananda (AP Manager), Fajar Nugroho (SAP Basis)',
      transactionRef: 'TRX-WT-2026-004',
      systems: 'SAP S/4HANA Workflow Engine & Host-to-Host Banking API',
      observations: 'Walkthrough confirmed that SAP workflow routes batches > IDR 100M to secondary signatory queue as designed.'
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-sky-600 uppercase tracking-wider">
            <Workflow className="w-4 h-4" />
            <span>Test of Design & Walkthrough (ASSURE)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Total ARC ToD Workspace
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Section 64 & 65: Evaluate whether control design appropriately addresses target risk through walkthrough documentation and design criteria.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/toe"
            className="inline-flex items-center space-x-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm shadow-brand-500/20 transition-all"
          >
            <span>Proceed to ToE Testing →</span>
          </Link>
        </div>
      </div>

      <TraceabilityFlow currentStep="ToE Test" />

      {/* ToD WORKPAPER */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs font-bold text-sky-800 bg-sky-100 px-2 py-0.5 rounded">
                {tod.testId}
              </span>
              <span className="text-xs text-slate-500 font-semibold">{tod.process}</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1">
              Test of Design: Dual Authorization on Disbursements &gt; IDR 100M ({tod.controlId})
            </h2>
          </div>

          <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-3 py-1 rounded-lg">
            Rating: {tod.conclusion}
          </span>
        </div>

        {/* Design Criteria Evaluation Checklist (Section 64) */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Design Criteria Evaluation (Section 64)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {tod.criteria.map((c, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-start space-x-3"
              >
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900">{c.name}</div>
                  <p className="text-[11px] text-slate-600 mt-0.5">{c.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Walkthrough Documentation (Section 65) */}
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Walkthrough Documentation (Section 65)
            </h3>
            <span className="text-xs font-semibold text-slate-500">
              Date: <strong>{tod.walkthrough.date}</strong>
            </span>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
            <div>
              <span className="text-slate-400 font-medium">Participants:</span>
              <div className="font-bold text-slate-800 mt-0.5">{tod.walkthrough.participants}</div>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Sample Transaction Inspected:</span>
              <div className="font-mono text-brand-700 font-bold mt-0.5">{tod.walkthrough.transactionRef}</div>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Systems Inspected:</span>
              <div className="text-slate-800 font-medium mt-0.5">{tod.walkthrough.systems}</div>
            </div>
            <div className="pt-2 border-t border-slate-200">
              <span className="text-slate-400 font-medium">Tester Observation:</span>
              <p className="text-slate-800 leading-relaxed font-medium mt-0.5">
                {tod.walkthrough.observations}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
