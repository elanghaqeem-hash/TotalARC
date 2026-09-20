import Link from 'next/link';
import { AlertTriangle, BadgeCheck, Cpu, FileCheck, FileSpreadsheet, Shield, Target, Workflow } from 'lucide-react';

const modules = [
  { href: '/icofr/scoping', title: 'Scoping & Materiality', detail: 'Reporting perimeter, OM, PM, clearly-trivial/SAD and component materiality.', icon: Target },
  { href: '/icofr/accounts', title: 'Accounts, Disclosures & Assertions', detail: 'Significant accounts/disclosures, relevant assertions, risk factors and process references.', icon: FileSpreadsheet },
  { href: '/icofr/elc', title: 'Entity-Level Controls (ELC)', detail: 'Governance, control environment, monitoring, fraud risk and period-end reporting controls.', icon: Shield },
  { href: '/icofr/plc', title: 'Process-Level Controls (PLC)', detail: 'Transaction-cycle and process controls linked to financial reporting risks and assertions.', icon: FileCheck },
  { href: '/icofr/itgc', title: 'IT General Controls (ITGC)', detail: 'Logical access, change management, operations, backup, SDLC and other IT general controls.', icon: Cpu },
  { href: '/icofr/itac', title: 'IT Application Controls (ITAC)', detail: 'Automated validations, calculations, configurations, interfaces and system-enforced controls.', icon: Workflow },
  { href: '/icofr/information', title: 'IPE & EUC Register', detail: 'Information Produced by the Entity and End-User Computing reliability controls.', icon: FileSpreadsheet },
  { href: '/tod', title: 'Walkthrough & Test of Design', detail: 'Confirm process understanding and assess whether control design addresses the identified risk.', icon: Workflow },
  { href: '/toe', title: 'Test of Operating Effectiveness', detail: 'Evidence-based operating effectiveness testing and sample evaluation.', icon: Cpu },
  { href: '/icofr/deficiencies', title: 'Deficiency Evaluation', detail: 'Evaluate control deficiencies, significant deficiencies and material weaknesses.', icon: AlertTriangle },
  { href: '/remediation', title: 'Remediation & MAP', detail: 'Management action plans, ownership, due dates and retesting follow-up.', icon: BadgeCheck },
  { href: '/certification', title: 'Certification & Attestation', detail: 'Management certification and control attestation after testing and deficiency evaluation.', icon: BadgeCheck }
];

export default function ICOFRPage() {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-sky-600">
          <FileCheck className="h-4 w-4" /> ICOFR Program
        </div>
        <h1 className="mt-1 text-2xl font-black text-slate-900">ICOFR Program Hub</h1>
        <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
          End-to-end Internal Control over Financial Reporting workspace from scoping and materiality through accounts/assertions, ELC, PLC, ITGC, ITAC, IPE/EUC, testing, deficiency evaluation, remediation and certification.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map(module => {
          const Icon = module.icon;
          return (
            <Link
              key={module.href}
              href={module.href}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition group-hover:bg-brand-50 group-hover:text-brand-700">
                <Icon className="h-4 w-4" />
              </div>
              <div className="mt-3 text-sm font-black text-slate-900">{module.title}</div>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">{module.detail}</p>
            </Link>
          );
        })}
      </div>

      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-[11px] leading-5 text-sky-900">
        Total ARC keeps the ICOFR domains separate for accountability, while the same enterprise control, process, testing and remediation concepts can still be reused across assurance modules to avoid duplicate control registers.
      </div>
    </div>
  );
}
