'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronRight } from 'lucide-react';

type EventRow = { id: string; title: string; type: string; start: string; end: string; status: string; owner: string; href: string };

export default function CalendarPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/calendar', { cache: 'no-store' })
      .then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Unable to load calendar'); setEvents(data.events || []); })
      .catch(err => setError(err.message));
  }, []);

  const grouped = useMemo(() => {
    return events.reduce<Record<string, EventRow[]>>((acc, event) => {
      const key = new Date(event.start).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      (acc[key] ||= []).push(event);
      return acc;
    }, {});
  }, [events]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><CalendarDays className="w-5 h-5 text-brand-600" />Assurance Calendar</h1>
        <p className="text-xs text-slate-500 mt-1">Timeline derived from campaigns, tasks, ToE tests, MAP due dates and management attestations.</p>
      </div>
      {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</div>}
      {Object.entries(grouped).map(([month, rows]) => (
        <section key={month} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-800">{month}</div>
          <div className="divide-y divide-slate-100">
            {rows.map(event => (
              <Link href={event.href} key={event.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50">
                <div className="w-14 text-center">
                  <div className="text-lg font-black text-slate-900">{new Date(event.start).getDate()}</div>
                  <div className="text-[9px] uppercase text-slate-400">{new Date(event.start).toLocaleDateString('en-US', { weekday: 'short' })}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">{event.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{event.type} • {event.owner || 'Unassigned'}</div>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{event.status}</span>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </Link>
            ))}
          </div>
        </section>
      ))}
      {!events.length && !error && <div className="border border-dashed border-slate-300 rounded-xl p-8 text-xs text-slate-500">No scheduled assurance activity exists yet.</div>}
    </div>
  );
}
