'use client';

import React, { useEffect, useState } from 'react';
import { Building2, Plus, Users } from 'lucide-react';
import { useRole } from '@/context/RoleContext';

type Unit = { id: string; code: string; name: string; type: string; headName?: string | null; headEmail?: string | null; parent?: { name: string } | null; legalEntity?: { name: string } | null; _count: { children: number; processes: number } };
type Entity = { id: string; code: string; name: string };

export default function OrganizationPage() {
  const { institutionName } = useRole();
  const [units, setUnits] = useState<Unit[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ type: 'Division', code: '', name: '', legalEntityId: '', parentId: '', headName: '', headEmail: '' });

  const load = async () => {
    const res = await fetch('/api/organization', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to load organization structure');
    setUnits(data.units || []); setEntities(data.entities || []);
  };
  useEffect(() => { load().catch(err => setMessage(err.message)); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/organization', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok) return setMessage(data.error || 'Unable to create organization unit');
    setForm({ type: 'Division', code: '', name: '', legalEntityId: '', parentId: '', headName: '', headEmail: '' });
    setShowForm(false); await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><Building2 className="w-5 h-5 text-brand-600" />Organization Structure</h1><p className="text-xs text-slate-500 mt-1">{institutionName} • Legal entities and organization units from database.</p></div>
        <button onClick={() => setShowForm(v => !v)} className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-xs font-bold px-3 py-2 rounded-lg"><Plus className="w-4 h-4" />Add Unit</button>
      </div>
      {message && <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">{message}</div>}
      {showForm && (
        <form onSubmit={create} className="bg-white border border-slate-200 rounded-xl p-5 grid md:grid-cols-2 gap-3 text-xs">
          <label className="font-semibold text-slate-700">Unit type<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option>Directorate</option><option>Division</option><option>Department</option><option>Unit</option><option>Team</option></select></label>
          <label className="font-semibold text-slate-700">Code<input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5" /></label>
          <label className="font-semibold text-slate-700 md:col-span-2">Name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5" /></label>
          <label className="font-semibold text-slate-700">Legal entity<select value={form.legalEntityId} onChange={e => setForm({ ...form, legalEntityId: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option value="">None</option>{entities.map(x => <option key={x.id} value={x.id}>{x.code} — {x.name}</option>)}</select></label>
          <label className="font-semibold text-slate-700">Parent unit<select value={form.parentId} onChange={e => setForm({ ...form, parentId: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option value="">Top level</option>{units.map(x => <option key={x.id} value={x.id}>{x.code} — {x.name}</option>)}</select></label>
          <label className="font-semibold text-slate-700">Head name<input value={form.headName} onChange={e => setForm({ ...form, headName: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5" /></label>
          <label className="font-semibold text-slate-700">Head email<input type="email" value={form.headEmail} onChange={e => setForm({ ...form, headEmail: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5" /></label>
          <button className="md:col-span-2 justify-self-start bg-slate-900 text-white font-bold px-4 py-2.5 rounded-lg">Create Unit</button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {units.map(unit => (
          <article key={unit.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2"><div><div className="text-[10px] font-mono text-slate-400">{unit.code}</div><h3 className="text-sm font-bold text-slate-900">{unit.name}</h3></div><span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{unit.type}</span></div>
            <div className="mt-3 text-[11px] text-slate-500 space-y-1">
              <div>Entity: {unit.legalEntity?.name || 'Not assigned'}</div>
              <div>Parent: {unit.parent?.name || 'Top level'}</div>
              <div className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />Head: {unit.headName || 'Not assigned'}</div>
              <div>{unit._count.processes} linked process(es) • {unit._count.children} child unit(s)</div>
            </div>
          </article>
        ))}
        {!units.length && <div className="md:col-span-2 xl:col-span-3 border border-dashed border-slate-300 rounded-xl p-8 text-xs text-slate-500">No organization unit exists yet. Add the first unit using the button above.</div>}
      </div>
    </div>
  );
}
