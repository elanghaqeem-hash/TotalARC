'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Shield,
  ArrowRight,
  Filter
} from 'lucide-react';

export default function CalendarPage() {
  const [viewPeriod, setViewPeriod] = useState<'quarterly' | 'monthly' | 'annual'>('quarterly');

  const events = [
    { title: 'FY2026 Annual RCSA Campaign (Q3)', type: 'RCSA', date: '2026-07-01 to 2026-09-30', status: 'In Progress', owner: 'Dian Sastrowardoyo' },
    { title: 'ToE Testing — Procure to Pay (PRC-P2P-001)', type: 'ToE', date: '2026-08-15', status: 'Completed', owner: 'Kevin Sanjaya' },
    { title: 'MAP-2026-001 Remediation Due Date', type: 'MAP', date: '2026-08-31', status: 'Completed', owner: 'Rizky Ananda' },
    { title: 'Independent Retesting RET-2026-001', type: 'Retest', date: '2026-08-28', status: 'Passed', owner: 'Kevin Sanjaya' },
    { title: 'Control Owner Certification (CTRL-P2P-001)', type: 'Certification', date: '2026-09-01', status: 'Certified', owner: 'Rizky Ananda' },
    { title: 'Executive Management Attestation Sign-off', type: 'Attestation', date: '2026-09-15', status: 'Attested', owner: 'Budi Santoso (CFO)' },
    { title: 'Q4 User Access Management ToE Testing', type: 'ToE', date: '2026-10-15', status: 'Scheduled', owner: 'Kevin Sanjaya' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-emerald-600 uppercase tracking-wider">
            <CalendarIcon className="w-4 h-4" />
            <span>Assurance Calendar (MONITOR)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Enterprise Assurance Schedule & Milestones
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Section 93: Comprehensive schedule across RCSA, CSA, ToD, ToE, Certification, MAP Due Dates, and Retesting.
          </p>
        </div>

        <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setViewPeriod('quarterly')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              viewPeriod === 'quarterly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Quarterly Roadmap
          </button>
          <button
            onClick={() => setViewPeriod('monthly')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              viewPeriod === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Monthly View
          </button>
        </div>
      </div>

      {/* Events List */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-slate-900">FY2026 Assurance Activities Timeline</h2>

        <div className="space-y-3">
          {events.map((ev, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs hover:border-slate-300 transition-all"
            >
              <div className="flex items-center space-x-3">
                <span className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 font-bold flex items-center justify-center text-[10px]">
                  {ev.type}
                </span>
                <div>
                  <div className="font-bold text-slate-900">{ev.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Date: {ev.date} • Owner: {ev.owner}
                  </div>
                </div>
              </div>

              <span
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                  ev.status === 'Completed' || ev.status === 'Passed' || ev.status === 'Attested' || ev.status === 'Certified'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                {ev.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
