'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  Cpu,
  FileCheck,
  FileSpreadsheet,
  Link2,
  RefreshCcw,
  Shield,
  Target,
  Workflow
} from 'lucide-react';

const modules = [
  { href: '/icofr/scoping', title: 'Scoping & Materiality', detail: 'Reporting perimeter, OM, PM, clearly-trivial/SAD and component materiality.', icon: Target, countKey: 'scopes' },
  { href: '/icofr/accounts', title: 'Accounts, Disclosures & Assertions', detail: 'Significant accounts/disclosures, relevant assertions, risk factors and process references.', icon: FileSpreadsheet, countKey: 'financialItems' },
  { href: '/icofr/traceability', title: 'End-to-End Traceability Matrix', detail: 'Connect account/disclosure → assertion → risk → control → IPE/EUC → ToD → ToE → deficiency → MAP.', icon: Link2, metricKey: 'traceability' },
  { href: '/icofr/coverage', title: 'Coverage & Gap Analytics', detail: 'Measure real ICOFR coverage, detect missing relationships/tests, map ITAC dependencies and manage database-backed gap actions.', icon: BarChart3, metricKey: 'coverage' },
  { href: '/icofr/elc', title: 'Entity-Level Controls (ELC)', detail: 'Governance, control environment, monitoring, fraud risk and period-end reporting controls.', icon: Shield, countKey: 'elc' },
  { href: '/icofr/plc', title: 'Process-Level Controls (PLC)', detail: 'Transaction-cycle and process controls linked to financial reporting risks and assertions.', icon: FileCheck, countKey: 'plc' },
  { href: '/icofr/itgc', title: 'IT General Controls (ITGC)', detail: 'Logical access, change management, operations, backup, SDLC and other IT general controls.', icon: Cpu, countKey: 'itgc' },
  { href: '/icofr/itac', title: 'IT Application Controls (ITAC)', detail: 'Automated validations, calculations, configurations, interfaces and system-enforced controls.', icon: Workflow, countKey: 'itac' },
  { href: '/icofr/information', title: 'IPE & EUC Register', detail: 'Information Produced by the Entity and End-User Computing reliability controls.', icon: FileSpreadsheet, countKey: 'informationArtifacts' },
  { href: '/icofr/testing-plan', title: 'Testing Plan & Annual Cycle', detail: 'Create period-specific testing cycles, assign controls/testers, plan interim or roll-forward work and launch ToD/ToE workpapers.', icon: CalendarDays, countKey: 'testingPlanItems' },
  { href: '/tod', title: 'Walkthrough & Test of Design', detail: 'Confirm process understanding and assess whether control design addresses the identified risk.', icon: Workflow },
  { href: '/toe', title: 'Test of Operating Effectiveness', detail: 'Evidence-based operating effectiveness testing and sample evaluation.', icon: Cpu },
  { href: '/icofr/deficiencies', title: 'Deficiency Evaluation', detail: 'Evaluate control deficiencies, significant deficiencies and material weaknesses.', icon: AlertTriangle, countKey: 'deficiencies' },
  { href: '/remediation', title: 'Remediation & MAP', detail: 'Management action plans, ownership, due dates and retesting follow-up.', icon: BadgeCheck },
  { href: '/certification', title: 'Certification & Year-End Close', detail: 'Entity/unit sub-certification, readiness gates, management representation, evidence pack and CFO/CEO sign-off.', icon: BadgeCheck, countKey: 'attestations' },
  { href: '/icofr/reporting', title: 'Executive Reporting & Audit Reliance', detail: 'Board/Audit Committee reporting, deficiency aging, external-auditor reliance and PBC/evidence request tracking.', icon: BarChart3, countKey: 'pbcRequests' }
];

export default function ICOFRPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/icofr/hub', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'ICOFR program data unavailable.');
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ICOFR program data unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const scope = data?.latestScope;
  const summary = useMemo(() => {
    const counts = data?.counts || {};
    return {
      controls: counts.controls || 0,
      keyControls: counts.keyControls || 0,
      financialItems: counts.financialItems || 0,
      planItems: counts.testingPlanItems || 0
    };
  }, [data]);

  const moduleValue = (module: any) => {
    if (module.countKey) return data?.counts?.[module.countKey] ?? 0;
    if (module.metricKey === 'traceability') {
      return data?.traceabilityMetrics?.completeChains ?? data?.traceabilityMetrics?.complete ?? 0;
    }
    if (module.metricKey === 'coverage') {
      return data?.coverageMetrics?.coveragePercent ?? data?.coverageMetrics?.coverage ?? 0;
    }
    return null;
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-sky-600">
              <FileCheck className="h-4 w-4" /> ICOFR Program
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">ICOFR Program Hub</h1>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
              Live program hub from persistent ICOFR scoping, accounts/assertions, control domains, testing, deficiency, remediation, certification and reporting records.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-brand-700"
            title="Refresh ICOFR program data"
          >
            <RefreshCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[10px] uppercase font-bold text-slate-400">ICOFR controls</div>
          <div className="text-2xl font-black text-slate-900">{loading ? '—' : summary.controls}</div>
          <div className="text-[10px] text-slate-500">{summary.keyControls} key controls</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[10px] uppercase font-bold text-slate-400">Accounts / disclosures</div>
          <div className="text-2xl font-black text-slate-900">{loading ? '—' : summary.financialItems}</div>
          <div className="text-[10px] text-slate-500">persistent financial items</div>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
          <div className="text-[10px] uppercase font-bold text-sky-600">Testing plan items</div>
          <div className="text-2xl font-black text-sky-900">{loading ? '—' : summary.planItems}</div>
          <div className="text-[10px] text-sky-700">ToD / ToE annual cycle</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-[10px] uppercase font-bold text-amber-700">Current scope</div>
          <div className="text-lg font-black text-amber-900">{scope ? scope.fiscalYear || scope.period || 'Recorded' : 'Not set'}</div>
          <div className="text-[10px] text-amber-700">{scope?.status || 'Create scope to begin'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map(module => {
          const Icon = module.icon;
          const value = moduleValue(module);
          return (
            <Link
              key={module.href}
              href={module.href}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition group-hover:bg-brand-50 group-hover:text-brand-700">
                  <Icon className="h-4 w-4" />
                </div>
                {value !== null && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
                    {module.metricKey === 'coverage' ? `${value}%` : value}
                  </span>
                )}
              </div>
              <div className="mt-3 text-sm font-black text-slate-900">{module.title}</div>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">{module.detail}</p>
            </Link>
          );
        })}
      </div>

      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-[11px] leading-5 text-sky-900">
        ICOFR domains remain separately accountable, while process, risk, control, testing, remediation and certification records are connected through persistent IDs so the same evidence can flow across Total ARC without recreating master data.
      </div>
    </div>
  );
}
