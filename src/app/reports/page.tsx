'use client';

import React from 'react';
import Link from 'next/link';
import {
  Download,
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  Printer,
  Shield,
  Layers,
  ArrowRight
} from 'lucide-react';

export default function ReportsPage() {
  const reports = [
    { title: 'Dynamic Risk Control Matrix (RCM)', desc: 'Complete multi-dimensional matrix containing process, risk, control, ToE testing, and MAP remediation.', format: 'CSV / Excel', href: '/rcm' },
    { title: 'ToE Testing Workpaper (TOE-P2P-001)', desc: '25-sample audit testing workpaper with attributes checklist, failure logs, and tester sign-off.', format: 'Interactive Grid', href: '/toe' },
    { title: 'Deficiency & MAP Remediation Dossier', desc: 'Control deficiency DEF-2026-001, 5-Why root cause analysis, milestones, and passed retest record.', format: 'Audit Dossier', href: '/remediation' },
    { title: 'Executive Management Attestation Statement', desc: 'Formal CFO and CRO signed statement on internal control over financial reporting for FY2026.', format: 'Attestation Document', href: '/certification' },
    { title: 'Continuous Control Monitoring (CCM) Log', desc: 'Real-time automated transaction query logs, rule thresholds, and healthy execution certificates.', format: 'Real-time Log', href: '/ccm' },
    { title: 'Process Architecture & SIPOC Register', desc: 'Levels 0–5 enterprise process hierarchy, SIPOC models, and activity-level performers.', format: 'BPM Register', href: '/processes' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-emerald-600 uppercase tracking-wider">
            <Download className="w-4 h-4" />
            <span>Reporting & Workpapers (MONITOR)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Assurance Workpapers & Export Center
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Sections 117–119: Generate audit-ready workpapers, RCM workbooks, deficiency reports, and executive assurance summaries.
          </p>
        </div>
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map((r, idx) => (
          <div
            key={idx}
            className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3 hover:border-brand-400 hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">
                  Report #{idx + 1}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200">
                  {r.format}
                </span>
              </div>
              <h3 className="font-bold text-sm text-slate-900 mt-1">{r.title}</h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{r.desc}</p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-emerald-700 text-xs font-semibold flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Audit Ready</span>
              </span>
              <Link
                href={r.href}
                className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center space-x-1"
              >
                <span>Open Workpaper</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
