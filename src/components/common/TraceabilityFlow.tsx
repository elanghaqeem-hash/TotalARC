'use client';

import React from 'react';
import Link from 'next/link';
import {
  Target, GitBranch, Layers, AlertTriangle, ShieldCheck, FileCheck2,
  ClipboardList, FlaskConical, AlertCircle, Wrench, CheckCheck, Activity
} from 'lucide-react';

const steps = [
  ['Objective', Target, '/processes'],
  ['Process', GitBranch, '/processes'],
  ['Activity', Layers, '/processes'],
  ['Risk', AlertTriangle, '/risks'],
  ['Control', ShieldCheck, '/controls'],
  ['RCM', FileCheck2, '/rcm'],
  ['CSA', ClipboardList, '/rcsa'],
  ['ToE Test', FlaskConical, '/toe'],
  ['Deficiency', AlertCircle, '/remediation'],
  ['MAP Action', Wrench, '/remediation'],
  ['Retest', CheckCheck, '/remediation'],
  ['CCM Monitor', Activity, '/ccm']
] as const;

export function TraceabilityFlow({ currentStep }: { currentStep?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm my-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          End-to-End Traceability Navigation
        </h4>
        <span className="text-[10px] text-slate-500">Persisted records only</span>
      </div>
      <div className="flex items-center space-x-2 min-w-[900px] py-2">
        {steps.map(([name, Icon, href], index) => {
          const active = currentStep?.toLowerCase() === name.toLowerCase();
          return (
            <React.Fragment key={name}>
              <Link
                href={href}
                className={`group flex flex-col items-center p-2 rounded-lg border text-center flex-1 transition-all ${
                  active ? 'bg-brand-50 border-brand-500 ring-2 ring-brand-200' : 'bg-slate-50 border-slate-200 hover:bg-white'
                }`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center mb-1 ${
                  active ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-bold text-slate-800">{name}</span>
              </Link>
              {index < steps.length - 1 && <span className="text-slate-300">→</span>}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
