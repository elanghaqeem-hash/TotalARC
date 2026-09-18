'use client';

import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';

export default function RCSAPage() {
  const { data, loading, error } = useAssuranceData();
  const campaigns = data?.campaigns || [];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-sky-600 uppercase"><ClipboardCheck className="w-4 h-4" />RCSA & CSA</div>
        <h1 className="text-2xl font-black text-slate-900 mt-1">Assessment Campaign Workspace</h1>
        <p className="text-xs text-slate-500 mt-1">Campaign and control self-assessment results are shown only when recorded.</p>
      </div>
      {error && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}
      {loading ? <div className="text-xs text-slate-500">Loading…</div> : campaigns.length === 0 ? "<div className=\"p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl\"><div className=\"font-bold text-slate-700\">No records available</div><p className=\"text-xs text-slate-500 mt-1\">This module will populate only from persisted database records.</p></div>" : (
        <div className="space-y-4">
          {campaigns.map((campaign:any) => (
            <div key={campaign.id} className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2"><div><div className="text-[10px] uppercase font-bold text-brand-600">{campaign.type} · {campaign.period}</div><h2 className="font-bold text-slate-900">{campaign.name}</h2><div className="text-[11px] text-slate-500">{new Date(campaign.startDate).toLocaleDateString('id-ID')} – {new Date(campaign.dueDate).toLocaleDateString('id-ID')} · Owner: {campaign.ownerName}</div></div><span className="text-xs font-bold px-2.5 py-1 rounded bg-slate-100">{campaign.status}</span></div>
              <div className="mt-4 space-y-2">{(campaign.csaResponses || []).length === 0 ? <div className="text-xs text-slate-400">No CSA responses recorded.</div> : campaign.csaResponses.map((response:any) => <div key={response.id} className="p-3 rounded-xl border border-slate-200 text-xs"><div className="flex justify-between gap-2"><span className="font-bold">{response.control?.controlId} · {response.control?.name}</span><span className="font-bold">{response.csaConclusion}</span></div><div className="text-[11px] text-slate-500">{response.control?.process?.name || 'No process'} · Assessor: {response.assessorName}</div></div>)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
