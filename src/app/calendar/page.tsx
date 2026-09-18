'use client';

import React, { useMemo } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';

export default function CalendarPage() {
  const { data, loading, error } = useAssuranceData();

  const events = useMemo(() => {
    if (!data) return [];
    const rows: any[] = [];
    for (const item of data.campaigns || []) rows.push({ id: 'campaign-'+item.id, date: item.dueDate, type: item.type, title: item.name, status: item.status, owner: item.ownerName });
    for (const item of data.toeTests || []) rows.push({ id: 'toe-'+item.id, date: item.testedAt, type: 'ToE', title: item.testId, status: item.status, owner: item.testerName });
    for (const item of data.actionPlans || []) rows.push({ id: 'map-'+item.id, date: item.revisedDueDate || item.originalDueDate, type: 'MAP', title: item.mapId, status: item.status, owner: item.actionOwner });
    for (const item of data.retests || []) rows.push({ id: 'retest-'+item.id, date: item.retestedAt, type: 'Retest', title: item.retestId, status: item.result, owner: item.testerName });
    for (const item of data.certifications || []) rows.push({ id: 'cert-'+item.id, date: item.certifiedAt, type: 'Certification', title: item.control?.controlId || 'Control certification', status: item.status, owner: item.certifierName });
    for (const item of data.attestations || []) rows.push({ id: 'att-'+item.id, date: item.attestedAt, type: 'Attestation', title: item.period, status: item.overallOpinion || 'Recorded', owner: [item.cfoName,item.croName].filter(Boolean).join(' / ') || 'Not specified' });
    return rows.sort((a,b) => new Date(a.date).getTime()-new Date(b.date).getTime());
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase"><CalendarIcon className="w-4 h-4" />Assurance Calendar</div>
        <h1 className="text-2xl font-black text-slate-900 mt-1">Enterprise Assurance Schedule</h1>
        <p className="text-xs text-slate-500 mt-1">Schedule entries are composed from actual campaign, testing, remediation, retest, certification, and attestation records.</p>
      </div>
      {error && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}
      {loading ? <div className="text-xs text-slate-500">Loading…</div> : events.length === 0 ? "<div className=\"p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl\"><div className=\"font-bold text-slate-700\">No records available</div><p className=\"text-xs text-slate-500 mt-1\">This module will populate only from persisted database records.</p></div>" : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {events.map((event) => (
            <div key={event.id} className="p-4 border-b border-slate-100 last:border-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div><div className="text-[10px] font-bold uppercase text-brand-600">{event.type}</div><div className="text-sm font-bold text-slate-900">{event.title}</div><div className="text-[11px] text-slate-500">{new Date(event.date).toLocaleDateString('id-ID')} · Owner: {event.owner || 'Not assigned'}</div></div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-700">{event.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
