'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  CheckSquare,
  Clock,
  AlertCircle,
  CheckCircle2,
  Shield,
  Layers,
  ArrowRight,
  UserCheck,
  Flame
} from 'lucide-react';
import { useRole } from '@/context/RoleContext';

export default function TasksPage() {
  const { currentUser } = useRole();

  const tasks = [
    { id: 'TSK-001', title: 'Quarterly Risk & Control Matrix Review (Q3 2026)', type: 'Review', dueDate: '2026-09-30', priority: 'High', status: 'In Progress', link: '/rcm', assignee: 'Maya Indira' },
    { id: 'TSK-002', title: 'Perform ToE Testing on User Access Management (PRC-UAM-001)', type: 'TOE', dueDate: '2026-10-15', priority: 'Medium', status: 'Pending', link: '/toe', assignee: 'Kevin Sanjaya' },
    { id: 'TSK-003', title: 'Complete Control Self-Assessment for Q4 2026 Cycle', type: 'CSA', dueDate: '2026-11-01', priority: 'Medium', status: 'Pending', link: '/rcsa', assignee: 'Rizky Ananda' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-emerald-600 uppercase tracking-wider">
            <CheckSquare className="w-4 h-4" />
            <span>Task Center & SLA Escalation (MONITOR)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Personalized Assurance Tasks & Escalations
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Section 94 & 95: Filtered by active role ({currentUser.roleTitle}). Configured with automated SLA triggers: 30d, 14d, 7d, due today, and overdue.
          </p>
        </div>
      </div>

      {/* Escalation Engine Tiers (Section 95) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
          <Flame className="w-3.5 h-3.5 text-amber-500" />
          <span>Automated Escalation Policy (Section 95)</span>
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="font-bold text-slate-800">14 Days Before</div>
            <div className="text-[10px] text-slate-500">Email reminder to Action Owner</div>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
            <div className="font-bold text-amber-800">3 Days Before</div>
            <div className="text-[10px] text-amber-600">CC Department Head</div>
          </div>
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200">
            <div className="font-bold text-rose-800">Due Today</div>
            <div className="text-[10px] text-rose-600">Urgent In-App Notification</div>
          </div>
          <div className="p-2.5 rounded-lg bg-red-100 border border-red-300">
            <div className="font-bold text-red-900">7 Days Overdue</div>
            <div className="text-[10px] text-red-700">Executive Escalation to CFO/CRO</div>
          </div>
        </div>
      </div>

      {/* Tasks List */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-slate-900">Assigned Tasks ({tasks.length})</h2>

        <div className="space-y-3">
          {tasks.map(t => (
            <div
              key={t.id}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs hover:border-slate-300 transition-all"
            >
              <div className="flex items-center space-x-3">
                <span className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 font-bold flex items-center justify-center text-[10px]">
                  {t.type}
                </span>
                <div>
                  <div className="font-bold text-slate-900">{t.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Assignee: <strong>{t.assignee}</strong> • Due: <strong>{t.dueDate}</strong>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    t.priority === 'High'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {t.priority} Priority
                </span>

                <Link
                  href={t.link}
                  className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg font-bold text-brand-600 transition-colors"
                >
                  Open Task →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
