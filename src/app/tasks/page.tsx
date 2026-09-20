'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckSquare, Filter, RefreshCcw } from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';

export default function TasksPage() {
  const { data, loading, error, refresh } = useAssuranceData();
  const tasks = data?.tasks || [];
  const [filter, setFilter] = useState('OPEN');

  const filtered = useMemo(() => {
    if (filter === 'ALL') return tasks;
    if (filter === 'OVERDUE') {
      const today = new Date().toISOString().slice(0, 10);
      return tasks.filter((task:any) =>
        task.dueDate &&
        String(task.dueDate).slice(0, 10) < today &&
        !['Completed', 'Closed', 'Accepted', 'Cancelled'].includes(String(task.status))
      );
    }
    return tasks.filter((task:any) =>
      !['Completed', 'Closed', 'Accepted', 'Cancelled'].includes(String(task.status))
    );
  }, [tasks, filter]);

  const overdueCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return tasks.filter((task:any) =>
      task.dueDate &&
      String(task.dueDate).slice(0, 10) < today &&
      !['Completed', 'Closed', 'Accepted', 'Cancelled'].includes(String(task.status))
    ).length;
  }, [tasks]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase">
              <CheckSquare className="w-4 h-4" />Task Center
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Assurance Tasks & Escalations</h1>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              Consolidated from persisted RCSA/CSA assignments, ICOFR testing plans, remediation MAPs, and external-audit PBC requests.
            </p>
          </div>
          <button onClick={() => refresh()} className="h-10 w-10 rounded-xl border border-slate-200 inline-flex items-center justify-center text-slate-500 hover:text-brand-700" title="Refresh tasks">
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white border border-slate-200 p-4">
          <div className="text-[10px] uppercase font-bold text-slate-400">All</div>
          <div className="text-2xl font-black text-slate-900">{tasks.length}</div>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-4">
          <div className="text-[10px] uppercase font-bold text-slate-400">Open</div>
          <div className="text-2xl font-black text-slate-900">{tasks.filter((task:any)=>!['Completed','Closed','Accepted','Cancelled'].includes(String(task.status))).length}</div>
        </div>
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4">
          <div className="text-[10px] uppercase font-bold text-rose-500">Overdue</div>
          <div className="text-2xl font-black text-rose-800">{overdueCount}</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2 overflow-x-auto">
        <Filter className="w-4 h-4 text-slate-400 shrink-0" />
        {[
          ['OPEN','Open Tasks'],
          ['OVERDUE','Overdue'],
          ['ALL','All Tasks']
        ].map(([value,label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${filter===value?'bg-brand-600 text-white':'bg-slate-50 text-slate-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}
      {loading ? (
        <div className="text-xs text-slate-500">Loading persisted tasks…</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl">
          <div className="font-bold text-slate-700">No tasks in this view</div>
          <p className="text-xs text-slate-500 mt-1">Tasks are created from operational assurance workflows rather than dummy records.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          {filtered.map((task:any) => {
            const overdue =
              task.dueDate &&
              String(task.dueDate).slice(0,10) < new Date().toISOString().slice(0,10) &&
              !['Completed','Closed','Accepted','Cancelled'].includes(String(task.status));
            return (
              <div key={task.id} className="p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-[10px] uppercase font-bold text-brand-600">{task.type}</div>
                    {overdue && <span className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full"><AlertTriangle className="w-3 h-3" />Overdue</span>}
                  </div>
                  <div className="font-bold text-sm text-slate-900">{task.title}</div>
                  <div className="text-[11px] text-slate-500">
                    {task.dueDate ? `Due ${new Date(task.dueDate).toLocaleDateString('id-ID')}` : 'No due date'} · Assignee: {task.user?.name || 'Unassigned'}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] px-2 py-1 rounded bg-slate-100 font-bold">{task.priority || 'Medium'}</span>
                  <span className="text-[10px] px-2 py-1 rounded bg-slate-100 font-bold">{task.status}</span>
                  {task.link && <Link href={task.link} className="text-xs font-bold text-brand-600">Open source →</Link>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
