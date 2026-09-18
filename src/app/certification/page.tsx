'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  CheckCircle2,
  FileText,
  Shield,
  Layers,
  ArrowRight,
  UserCheck,
  Lock,
  Building2
} from 'lucide-react';
import { useRole } from '@/context/RoleContext';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';

export default function CertificationPage() {
  const { currentUser, institutionName } = useRole();
  const [attested, setAttested] = useState(true);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-emerald-600 uppercase tracking-wider">
            <BadgeCheck className="w-4 h-4" />
            <span>Management Assurance & Attestation (MONITOR)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Control Certification & Executive Attestation
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Sections 91 & 92: Hierarchical formal sign-off: Control Owner &rarr; Process Owner &rarr; Division Head &rarr; CFO / CRO.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <span className="inline-flex items-center space-x-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold px-3.5 py-2 rounded-xl">
            <Lock className="w-4 h-4 text-emerald-600" />
            <span>Period 2026-Annual Locked</span>
          </span>
        </div>
      </div>

      <TraceabilityFlow currentStep="CCM Monitor" />

      {/* SECTION 1: CONTROL OWNER CERTIFICATION (Section 91) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="text-xs font-bold text-brand-600 uppercase tracking-wider">
              Control Owner Certification (Section 91)
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">
              CTRL-P2P-001: Dual Authorization on Disbursements Exceeding Policy Thresholds
            </h3>
          </div>
          <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
            Certified
          </span>
        </div>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
          <span className="text-slate-400 font-bold uppercase text-[10px]">
            Owner Declaration Text:
          </span>
          <p className="text-slate-800 italic leading-relaxed">
            &ldquo;I hereby certify that CTRL-P2P-001 was operated in accordance with established policies. The operating deficiency DEF-2026-001 identified during interim testing was fully remediated via MAP-2026-001 and successfully retested with 10/10 samples passing. Continuous monitoring rules remain active and healthy.&rdquo;
          </p>
          <div className="pt-2 border-t border-slate-200 flex justify-between text-slate-500 text-[11px]">
            <span>Certifier: <strong>Rizky Ananda (Manager Accounts Payable)</strong></span>
            <span>Date: <strong>01 September 2026</strong></span>
          </div>
        </div>
      </div>

      {/* SECTION 2: EXECUTIVE MANAGEMENT ATTESTATION (Section 92) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
              Executive Management Sign-Off (Section 92)
            </span>
            <h3 className="text-lg font-bold text-slate-900 mt-0.5">
              Annual Management Statement on Internal Control over Financial Reporting
            </h3>
            <p className="text-xs text-slate-500">
              For {institutionName} • Reporting Period: FY2026
            </p>
          </div>

          <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-3 py-1 rounded-lg flex items-center space-x-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Attestation Executed</span>
          </span>
        </div>

        <div className="p-5 bg-gradient-to-br from-slate-50 to-emerald-50/40 border border-slate-200 rounded-xl space-y-3 text-xs leading-relaxed text-slate-800">
          <p className="font-semibold text-slate-900">
            Management Opinion on Internal Control:
          </p>
          <p>
            &ldquo;Based on our evaluation under the COSO Internal Control — Integrated Framework (2013) and Sarbanes-Oxley Section 404 guidelines, Management concludes that the Company maintained <strong>ADEQUATE & EFFECTIVE</strong> Internal Control over Financial Reporting as of September 2026.&rdquo;
          </p>
          <p className="text-slate-600 text-[11px]">
            The single control deficiency identified in the Procure-to-Pay cycle (ERP delegation matrix mismatch) was systematically remediated through formal Management Action Plan MAP-2026-001, independently retested with 100% pass rate, and reinforced with real-time Continuous Control Monitoring. No Material Weaknesses exist.
          </p>
        </div>

        {/* Dual Signatures */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <span className="text-[10px] font-bold uppercase text-slate-400">Chief Financial Officer (CFO)</span>
            <div className="text-base font-bold text-slate-900">Budi Santoso</div>
            <div className="text-[11px] text-emerald-700 font-semibold flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Signed & Digitally Sealed (15 Sep 2026)</span>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <span className="text-[10px] font-bold uppercase text-slate-400">Chief Risk Officer (CRO)</span>
            <div className="text-base font-bold text-slate-900">Dewi Lestari</div>
            <div className="text-[11px] text-emerald-700 font-semibold flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Signed & Digitally Sealed (15 Sep 2026)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
