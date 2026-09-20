'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Calendar as CalendarIcon, RefreshCcw } from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';

export default function CalendarPage() {
  const { data, loading, error, refresh } = useAssuranceData();
  const [typeFilter, setTypeFilter] = useState('ALL');

  const events = useMemo(() => {
    if (!data) return [];
    const rows: any[] = [];

    for (const item of data.campaigns || []) {
      rows.push({
        id: 'campaign-' + item.id,
        date: item.dueDate,
        type: item.type || 'RCSA',
        title: item.name,
        status: item.status,
        owner: item.ownerName,
        link: '/rcsa'
      });
    }

    for (const item of data.testingPlanItems || []) {
      if (!item.dueDate) continue;
      rows.push({
        id: 'plan-' + item.id,
        date: item.dueDate,
        type: 'ICOFR Testing',
        title: (item.control?.controlCode || 'Control') + ' · ' + (item.control?.name || item.testType || 'Testing'),
        status: item.derivedExecutionStatus || item.status,
        owner: item.testerName || 'Unassigned',
        link: '/icofr/testing-plan'
      });
    }

    for (const item of data.toeTests || []) {
      rows.push({
        id: 'toe-' + item.id,
        date: item.testedAt,
        type: 'ToE',
        title: item.testId,
        status: item.status,
        owner: item.testerName,
        link: '/toe'
      });
    }

    for (const item of data.actionPlans || []) {
      rows.push({
        id: 'map-' + item.id,
        date: item.revisedDueDate || item.originalDueDate,
        type: 'MAP',
        title: item.mapId,
        status: item.status,
        owner: item.actionOwner,
        link: '/remediation'
      });
    }

    for (const item of data.retests || []) {
      rows.push({
        id: 'retest-' + item.id,
        date: item.retestedAt,
        type: 'Retest',
        title: item.retestId,
        status: item.result,
        owner: item.testerName,
        link: '/remediation'
      });
    }

    for (const item of data.attestations || []) {
      rows.push({
        id: 'att-' + item.id,
        date: item.signedAt || item.updatedAt || item.createdAt,
        type: 'Attestation',
        title: item.period,
        status: item.status || item.overallOpinion || 'Recorded',
        owner: [item.cfoName, item.ceoName].filter(Boolean).join(' / ') || 'Not specified',
        link: '/certification'
      });
    }

    for (const item of data.tasks || []) {
      if (!item.dueDate) continue;
      rows.push({
        id: 'task-' + item.id,
        date: item.dueDate,
        type: item.type || 'Task',
        title: item.title,
        status: item.status,
        owner: item.user?.name || 'Unassigned',
        link: item.link || '/tasks'
      });
    }

    return rows
      .filter(item => item.date)
      .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data]);

  const types = useMemo(() => ['ALL', ...Array.from(new Set(events.map(event => event.type)))], [events]);
  const filtered = typeFilter === 'ALL' ? events : events.filter(event => event.type === typeFilter);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase">
              <CalendarIcon className="w-4 h-4" />Assurance Calendar
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Enterprise Assurance Schedule</h1>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              Schedule entries are composed from persisted RCSA/CSA, ICOFR testing plans, ToE, remediation, retest, certification, and task records.
            </p>
          </div>
          <button onClick={() => refresh()} className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-brand-700" title="Refresh calendar">
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3 flex gap-2 overflow-x-auto">
        {types.map(type => (
          <button
            key={type}
            type="button"
            onClick={() => setTypeFilter(type)}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${typeFilter===type?'bg-brand-600 text-white':'bg-slate-50 text-slate-600'}`}
          >
            {type === 'ALL' ? 'All Events' : type}
          </button>
        ))}
      </div>

      {error && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}
      {loading ? (
        <div className="text-xs text-slate-500">Loading persisted schedule…</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl">
          <div className="font-bold text-slate-700">No scheduled records</div>
          <p className="text-xs text-slate-500 mt-1">Create campaign, testing, remediation, certification, or task records to populate the calendar.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {filtered.map((event) => (
            <div key={event.id} className="p-4 border-b border-slate-100 last:border-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase text-brand-600">{event.type}</div>
                <div className="text-sm font-bold text-slate-900">{event.title}</div>
                <div className="text-[11px] text-slate-500">
                  {new Date(event.date).toLocaleDateString('id-ID')} · Owner: {event.owner || 'Not assigned'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-700">{event.status}</span>
                <Link href={event.link || '/tasks'} className="text-xs font-bold text-brand-600">Open →</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
