'use client';

import React from 'react';
import { BadgeCheck } from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';

export default function CertificationPage() {
  const { data, loading, error } = useAssuranceData();
  const certifications = data?.certifications || [];
  const attestations = data?.attestations || [];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm"><div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase"><BadgeCheck className="w-4 h-4" />Certification & Attestation</div><h1 className="text-2xl font-black text-slate-900 mt-1">Management Assurance Sign-Off</h1><p className="text-xs text-slate-500 mt-1">No certification or executive sign-off is presumed. Only actual declarations are displayed.</p></div>
      <TraceabilityFlow currentStep="CCM Monitor" />
      {error && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}
      {loading ? <div className="text-xs text-slate-500">Loading…</div> : certifications.length === 0 && attestations.length === 0 ? (<div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl"><div className="font-bold text-slate-700">No records available</div><p className="text-xs text-slate-500 mt-1">This module will populate only from persisted database records.</p></div>) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5"><h2 className="font-bold text-slate-900 mb-3">Control certifications ({certifications.length})</h2><div className="space-y-3">{certifications.map((cert:any) => <div key={cert.id} className="p-3 border border-slate-200 rounded-xl text-xs"><div className="flex justify-between gap-2"><span className="font-bold">{cert.control?.controlId} · {cert.control?.name}</span><span className="font-bold">{cert.status}</span></div><div className="text-[11px] text-slate-500">{cert.period} · {cert.certifierName} ({cert.certifierRole})</div><p className="text-slate-600 mt-2">{cert.declarationText}</p></div>)}</div></div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5"><h2 className="font-bold text-slate-900 mb-3">Management attestations ({attestations.length})</h2><div className="space-y-3">{attestations.map((att:any) => <div key={att.id} className="p-3 border border-slate-200 rounded-xl text-xs"><div className="flex justify-between gap-2"><span className="font-bold">{att.period}</span><span className="font-bold">{att.overallOpinion || 'Opinion not recorded'}</span></div><p className="text-slate-600 mt-2">{att.scopeSummary}</p><div className="text-[11px] text-slate-500 mt-2">CFO: {att.cfoSignOff ? `Signed by ${att.cfoName || 'named signatory'}` : 'Not signed'} · CRO: {att.croSignOff ? `Signed by ${att.croName || 'named signatory'}` : 'Not signed'}</div></div>)}</div></div>
        </div>
      )}
    </div>
  );
}
