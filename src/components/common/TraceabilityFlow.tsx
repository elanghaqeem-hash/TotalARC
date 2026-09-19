'use client';

import React from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  CheckCheck,
  ChevronRight,
  ClipboardCheck,
  FileSearch,
  GitBranch,
  Layers,
  Shield,
  Target,
  Wrench
} from 'lucide-react';

const steps = [
  {
    name: 'Objective',
    description: 'Business goal',
    icon: Target,
    href: '/processes',
    tone: 'sky'
  },
  {
    name: 'Process',
    description: 'Business process',
    icon: GitBranch,
    href: '/processes',
    tone: 'sky'
  },
  {
    name: 'Activity',
    description: 'Control activity',
    icon: Layers,
    href: '/processes',
    tone: 'sky'
  },
  {
    name: 'Risk',
    description: 'Risk exposure',
    icon: AlertTriangle,
    href: '/risks',
    tone: 'amber'
  },
  {
    name: 'Control',
    description: 'Control response',
    icon: Shield,
    href: '/controls',
    tone: 'emerald'
  },
  {
    name: 'CSA',
    description: 'Self assessment',
    icon: ClipboardCheck,
    href: '/rcsa',
    tone: 'violet'
  },
  {
    name: 'ToD',
    description: 'Design testing',
    icon: FileSearch,
    href: '/tod',
    tone: 'indigo'
  },
  {
    name: 'ToE',
    description: 'Effectiveness test',
    icon: CheckCheck,
    href: '/toe',
    tone: 'indigo'
  },
  {
    name: 'Deficiency',
    description: 'Control gap',
    icon: AlertTriangle,
    href: '/remediation',
    tone: 'rose'
  },
  {
    name: 'Action Plan',
    description: 'Remediation',
    icon: Wrench,
    href: '/remediation',
    tone: 'orange'
  },
  {
    name: 'Retest',
    description: 'Independent retest',
    icon: BadgeCheck,
    href: '/remediation',
    tone: 'teal'
  },
  {
    name: 'CCM',
    description: 'Continuous monitor',
    icon: Activity,
    href: '/ccm',
    tone: 'cyan'
  }
] as const;

const toneClasses: Record<string, { icon: string; active: string; hover: string }> = {
  sky: {
    icon: 'bg-sky-100 text-sky-700',
    active: 'border-sky-300 bg-sky-50 ring-sky-100',
    hover: 'hover:border-sky-200 hover:bg-sky-50/60'
  },
  amber: {
    icon: 'bg-amber-100 text-amber-700',
    active: 'border-amber-300 bg-amber-50 ring-amber-100',
    hover: 'hover:border-amber-200 hover:bg-amber-50/60'
  },
  emerald: {
    icon: 'bg-emerald-100 text-emerald-700',
    active: 'border-emerald-300 bg-emerald-50 ring-emerald-100',
    hover: 'hover:border-emerald-200 hover:bg-emerald-50/60'
  },
  violet: {
    icon: 'bg-violet-100 text-violet-700',
    active: 'border-violet-300 bg-violet-50 ring-violet-100',
    hover: 'hover:border-violet-200 hover:bg-violet-50/60'
  },
  indigo: {
    icon: 'bg-indigo-100 text-indigo-700',
    active: 'border-indigo-300 bg-indigo-50 ring-indigo-100',
    hover: 'hover:border-indigo-200 hover:bg-indigo-50/60'
  },
  rose: {
    icon: 'bg-rose-100 text-rose-700',
    active: 'border-rose-300 bg-rose-50 ring-rose-100',
    hover: 'hover:border-rose-200 hover:bg-rose-50/60'
  },
  orange: {
    icon: 'bg-orange-100 text-orange-700',
    active: 'border-orange-300 bg-orange-50 ring-orange-100',
    hover: 'hover:border-orange-200 hover:bg-orange-50/60'
  },
  teal: {
    icon: 'bg-teal-100 text-teal-700',
    active: 'border-teal-300 bg-teal-50 ring-teal-100',
    hover: 'hover:border-teal-200 hover:bg-teal-50/60'
  },
  cyan: {
    icon: 'bg-cyan-100 text-cyan-700',
    active: 'border-cyan-300 bg-cyan-50 ring-cyan-100',
    hover: 'hover:border-cyan-200 hover:bg-cyan-50/60'
  }
};

export function TraceabilityFlow({ currentStep }: { currentStep?: string }) {
  return (
    <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-black tracking-tight text-slate-950 sm:text-lg">Traceability Chain</h3>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">Telusuri alur objective → process → risk → control → testing → remediation secara end-to-end.</p>
          </div>
        </div>
        <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-100">
          <Shield className="h-3.5 w-3.5" />
          Persisted records only
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const active = currentStep?.toLowerCase() === step.name.toLowerCase();
            const tone = toneClasses[step.tone];

            return (
              <Link
                key={step.name}
                href={step.href}
                className={`group relative min-w-0 rounded-2xl border p-3 transition duration-200 ${
                  active
                    ? `${tone.active} ring-2`
                    : `border-slate-200 bg-slate-50/60 ${tone.hover} hover:-translate-y-0.5 hover:shadow-sm`
                }`}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone.icon}`}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Step {index + 1}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                  </div>
                </div>
                <div className="truncate text-xs font-black text-slate-900">{step.name}</div>
                <div className="mt-1 min-h-[30px] text-[10px] leading-4 text-slate-500">{step.description}</div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
