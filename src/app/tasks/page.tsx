'use client';

import React from 'react';
import Link from 'next/link';
import { CheckSquare } from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';

export default function TasksPage() {
  const { data, loading, error } = useAssuranceData();
  const tasks = data?.tasks || [];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase"><CheckSquare className="w-4 h-4" />Task Center</div>
        <h1 className="text-2xl font-black text-slate-900 mt-1">Assurance Tasks & Escalations</h1>
        <p className="text-xs text-slate-500 mt-1">Only tasks persisted in the Task table are displayed.</p>
      </div>
      {error && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}
      {loading ? <div className="text-xs text-slate-500">Loading…</div> : tasks.length === 0 ? "<div className=\"p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl\"><div className=\"font-bold text-slate-700\">No records available</div><p className=\"text-xs text-slate-500 mt-1\">This module will populate only from persisted database records.</p></div>" : (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          {tasks.map((task:any) => (
            <div key={task.id} className="p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div><div className="text-[10px] uppercase font-bold text-brand-600">{task.type}</div><div className="font-bold text-sm text-slate-900">{task.title}</div><div className="text-[11px] text-slate-500">Due {new Date(task.dueDate).toLocaleDateString('id-ID')} · Assignee: {task.user?.name || 'Unassigned'}</div></div>
              <div className="flex items-center gap-2"><span className="text-[10px] px-2 py-1 rounded bg-slate-100 font-bold">{task.priority}</span><span className="text-[10px] px-2 py-1 rounded bg-slate-100 font-bold">{task.status}</span>{task.link && <Link href={task.link} className="text-xs font-bold text-brand-600">Open →</Link>}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
