'use client';

import React from 'react';
import {
  Target,
  GitBranch,
  Layers,
  AlertTriangle,
  ShieldCheck,
  FileCheck2,
  ClipboardList,
  FlaskConical,
  AlertCircle,
  Wrench,
  CheckCheck,
  Activity
} from 'lucide-react';
import Link from 'next/link';

interface TraceabilityStep {
  name: string;
  code: string;
  icon: React.ElementType;
  href: string;
  status: 'passed' | 'warning' | 'active' | 'default';
  description?: string;
}

export function TraceabilityFlow({ currentStep }: { currentStep?: string }) {
  const steps: TraceabilityStep[] = [
    { name: 'Objective', code: 'OBJ-P2P', icon: Target, href: '/processes', status: 'passed' },
    { name: 'Process', code: 'PRC-P2P-001', icon: GitBranch, href: '/processes', status: 'passed' },
    { name: 'Activity', code: 'ACT-P2P-004', icon: Layers, href: '/processes', status: 'passed' },
    { name: 'Risk', code: 'RSK-P2P-001', icon: AlertTriangle, href: '/risks', status: 'warning', description: 'Critical Inherent Risk' },
    { name: 'Control', code: 'CTRL-P2P-001', icon: ShieldCheck, href: '/controls', status: 'passed', description: 'Dual Authorization' },
    { name: 'RCM', code: 'RCM-MAP', icon: FileCheck2, href: '/rcm', status: 'passed' },
    { name: 'CSA', code: 'CSA-2026', icon: ClipboardList, href: '/rcsa', status: 'passed' },
    { name: 'ToE Test', code: 'TOE-P2P-001', icon: FlaskConical, href: '/toe', status: 'warning', description: '2/25 Exceptions' },
    { name: 'Deficiency', code: 'DEF-2026-001', icon: AlertCircle, href: '/remediation', status: 'warning' },
    { name: 'MAP Action', code: 'MAP-2026-001', icon: Wrench, href: '/remediation', status: 'passed', description: '100% Remediated' },
    { name: 'Retest', code: 'RET-2026-001', icon: CheckCheck, href: '/remediation', status: 'passed', description: '10/10 Passed' },
    { name: 'CCM Monitor', code: 'CCM-RULE-001', icon: Activity, href: '/ccm', status: 'passed', description: 'Real-time Healthy' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm my-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse"></span>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            End-to-End Single Source of Truth Traceability Chain
          </h4>
        </div>
        <span className="text-xs text-slate-500 font-medium">Section 136 Scenario (Procure to Pay)</span>
      </div>

      <div className="flex items-center space-x-2 min-w-[950px] py-2">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isCurrent = currentStep?.toLowerCase() === step.name.toLowerCase();

          return (
            <React.Fragment key={step.name}>
              <Link
                href={step.href}
                className={`group flex flex-col items-center p-2 rounded-lg transition-all border text-center flex-1 ${
                  isCurrent
                    ? 'bg-brand-50 border-brand-500 ring-2 ring-brand-200'
                    : step.status === 'warning'
                    ? 'bg-amber-50/60 border-amber-200 hover:border-amber-300'
                    : 'bg-slate-50/80 border-slate-200 hover:bg-white hover:border-slate-300'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center mb-1 text-xs transition-colors ${
                    step.status === 'warning'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-brand-100 text-brand-700 group-hover:bg-brand-600 group-hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-bold text-slate-800 leading-tight">
                  {step.name}
                </span>
                <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                  {step.code}
                </span>
                {step.description && (
                  <span className="text-[9px] text-brand-700 bg-brand-50 rounded px-1 mt-1 border border-brand-200 truncate max-w-[80px]">
                    {step.description}
                  </span>
                )}
              </Link>

              {idx < steps.length - 1 && (
                <div className="text-slate-300 flex-shrink-0 font-bold text-xs select-none">
                  →
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
