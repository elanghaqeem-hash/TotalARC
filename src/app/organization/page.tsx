'use client';

import React from 'react';
import { Building2 } from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';

export default function OrganizationPage() {
  const { data, loading, error } = useAssuranceData();
  const institution = data?.institution;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-brand-600 uppercase"><Building2 className="w-4 h-4" />Organization</div>
        <h1 className="text-2xl font-black text-slate-900 mt-1">Institution & Organization Structure</h1>
        <p className="text-xs text-slate-500 mt-1">Legal entities, organization units, and users are loaded from registered institution data.</p>
      </div>
      {error && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}
      {loading ? <div className="text-xs text-slate-500">Loading…</div> : !institution ? "<div className=\"p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl\"><div className=\"font-bold text-slate-700\">No records available</div><p className=\"text-xs text-slate-500 mt-1\">This module will populate only from persisted database records.</p></div>" : (
        <>
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="text-[10px] uppercase font-bold text-slate-400">Institution</div>
            <div className="text-xl font-black text-slate-900">{institution.name}</div>
            <div className="text-xs text-slate-500">{institution.legalName} · {institution.institutionType} · {institution.country}</div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-5"><h2 className="font-bold text-slate-900 mb-3">Legal entities ({institution.legalEntities?.length || 0})</h2><div className="space-y-2">{(institution.legalEntities || []).map((entity:any) => <div key={entity.id} className="p-3 border border-slate-200 rounded-xl text-xs"><div className="font-bold">{entity.code} · {entity.name}</div><div className="text-slate-500">{entity.country}</div></div>)}</div></div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5"><h2 className="font-bold text-slate-900 mb-3">Organization units ({institution.organizationUnits?.length || 0})</h2><div className="space-y-2">{(institution.organizationUnits || []).map((unit:any) => <div key={unit.id} className="p-3 border border-slate-200 rounded-xl text-xs"><div className="font-bold">{unit.code} · {unit.name}</div><div className="text-slate-500">{unit.type} · Head: {unit.headName || 'Not assigned'}</div></div>)}</div></div>
          </div>
        </>
      )}
    </div>
  );
}
