'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Activity,
  Shield,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  Cpu,
  BadgeCheck,
  Layers,
  ArrowRight,
  TrendingUp,
  FileSpreadsheet
} from 'lucide-react';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';

export default function ControlHealthPage() {
  const [controls, setControls] = useState<any[]>([]);
  const [selectedControl, setSelectedControl] = useState<any>(null);

  useEffect(() => {
    fetch('/api/controls')
      .then(res => res.json())
      .then(d => {
        setControls(d.controls || []);
        if (d.controls?.length > 0) setSelectedControl(d.controls[0]);
      })
      .catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-emerald-600 uppercase tracking-wider">
            <Activity className="w-4 h-4" />
            <span>Control Health Cockpit (MONITOR)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Transparent Multi-Factor Control Health
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Section 90 Principle: Transparent status derived from Design, Operating Effectiveness, CSA, CCM, Open Issues, MAP, and Certification. Avoid opaque black-box scores.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/certification"
            className="inline-flex items-center space-x-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm shadow-brand-500/20 transition-all"
          >
            <BadgeCheck className="w-4 h-4" />
            <span>Management Attestation →</span>
          </Link>
        </div>
      </div>

      <TraceabilityFlow currentStep="CCM Monitor" />

      {/* Control Health Breakdown for CTRL-P2P-001 */}
      {selectedControl && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-2">
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-xs font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                  {selectedControl.controlId}
                </span>
                <span className="text-xs text-slate-500 font-semibold">
                  Owner: {selectedControl.controlOwner}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-1">{selectedControl.name}</h2>
            </div>

            <span className="inline-flex items-center space-x-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold px-4 py-2 rounded-xl">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Overall Status: Healthy</span>
            </span>
          </div>

          {/* Transparent 7-Factor Assessment Matrix (Section 90) */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              7-Factor Health Breakdown (Section 90)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-700">1. Design Assessment</span>
                <div className="text-sm font-bold text-slate-900">Effective Design</div>
                <p className="text-[11px] text-slate-600">Dual approval workflow adequately configured.</p>
              </div>

              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-700">2. Operating Effectiveness</span>
                <div className="text-sm font-bold text-slate-900">Remediated & Retested</div>
                <p className="text-[11px] text-slate-600">Historical 2 exceptions cleared via 10/10 retest.</p>
              </div>

              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-700">3. Control Self-Assessment</span>
                <div className="text-sm font-bold text-slate-900">Effective (CSA-2026)</div>
                <p className="text-[11px] text-slate-600">Annual self-assessment completed by owner.</p>
              </div>

              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-700">4. Continuous Monitoring</span>
                <div className="text-sm font-bold text-slate-900">Active (0 Exception)</div>
                <p className="text-[11px] text-slate-600">Real-time ERP scan healthy across 120 batches.</p>
              </div>

              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-700">5. Open Issues</span>
                <div className="text-sm font-bold text-slate-900">0 Open Issues</div>
                <p className="text-[11px] text-slate-600">ISS-2026-001 formally closed post-retest.</p>
              </div>

              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-700">6. Overdue MAPs</span>
                <div className="text-sm font-bold text-slate-900">0 Overdue Actions</div>
                <p className="text-[11px] text-slate-600">MAP-2026-001 completed 100% on time.</p>
              </div>

              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-700">7. Owner Certification</span>
                <div className="text-sm font-bold text-slate-900">Certified by Owner</div>
                <p className="text-[11px] text-slate-600">Formal declaration executed for 2026 period.</p>
              </div>

              <div className="p-3.5 rounded-xl border border-brand-200 bg-brand-50/50 space-y-1">
                <span className="text-[10px] uppercase font-bold text-brand-700">Holistic Conclusion</span>
                <div className="text-sm font-bold text-brand-900">Healthy & Reliable</div>
                <p className="text-[11px] text-brand-800">Zero active assurance roadblocks.</p>
              </div>
            </div>
          </div>

          {/* Rationale Statement */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Transparent Health Rationale (Section 90):
            </span>
            <p className="text-slate-800 leading-relaxed font-medium">
              {selectedControl.healthRationale}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
