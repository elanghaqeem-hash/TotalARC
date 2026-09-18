'use client';

import React from 'react';
import Link from 'next/link';
import {
  Target, GitBranch, Layers, AlertTriangle, ShieldCheck, FileCheck2,
  ClipboardList, FlaskConical, AlertCircle, Wrench, CheckCheck, Activity
} from 'lucide-react';

type TraceabilityStep = {
  name:string;
  label:string;
  icon:React.ElementType;
  href:string;
};

export function TraceabilityFlow({ currentStep }: { currentStep?: string }) {
  const steps:TraceabilityStep[] = [
    { name:'Objective', label:'Objective', icon:Target, href:'/processes' },
    { name:'Process', label:'Process', icon:GitBranch, href:'/processes' },
    { name:'Activity', label:'Activity', icon:Layers, href:'/processes' },
    { name:'Risk', label:'Risk', icon:AlertTriangle, href:'/risks' },
    { name:'Control', label:'Control', icon:ShieldCheck, href:'/controls' },
    { name:'RCM', label:'RCM', icon:FileCheck2, href:'/rcm' },
    { name:'CSA', label:'CSA/RCSA', icon:ClipboardList, href:'/rcsa' },
    { name:'ToD', label:'ToD', icon:FileCheck2, href:'/tod' },
    { name:'ToE Test', label:'ToE', icon:FlaskConical, href:'/toe' },
    { name:'Deficiency', label:'Deficiency', icon:AlertCircle, href:'/remediation' },
    { name:'MAP Action', label:'MAP', icon:Wrench, href:'/remediation' },
    { name:'Retest', label:'Retest', icon:CheckCheck, href:'/remediation' },
    { name:'CCM Monitor', label:'CCM', icon:Activity, href:'/ccm' }
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm my-4 overflow-x-auto">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-brand-500"></span>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">End-to-End Traceability Model</h4>
        </div>
        <span className="text-[10px] text-slate-400">Navigation only — statuses come from database evidence</span>
      </div>
      <div className="flex items-center gap-2 min-w-[1050px] py-2">
        {steps.map((step,index)=>{
          const Icon=step.icon;
          const active=currentStep?.toLowerCase()===step.name.toLowerCase();
          return <React.Fragment key={step.name}>
            <Link href={step.href} className={active?'flex-1 p-2 rounded-lg border text-center bg-brand-50 border-brand-500 ring-2 ring-brand-100':'flex-1 p-2 rounded-lg border text-center bg-slate-50 border-slate-200 hover:bg-white hover:border-slate-300'}>
              <div className={active?'w-7 h-7 mx-auto rounded-full flex items-center justify-center bg-brand-600 text-white':'w-7 h-7 mx-auto rounded-full flex items-center justify-center bg-brand-100 text-brand-700'}><Icon className="w-3.5 h-3.5"/></div>
              <div className="text-[10px] font-bold text-slate-800 mt-1">{step.label}</div>
            </Link>
            {index<steps.length-1&&<span className="text-slate-300 text-xs">→</span>}
          </React.Fragment>;
        })}
      </div>
    </div>
  );
}
