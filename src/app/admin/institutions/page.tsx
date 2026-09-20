'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Database, FolderOpen, Landmark, RefreshCcw } from 'lucide-react';

const blank = {
  name: '',
  legalName: '',
  shortName: '',
  institutionType: 'Bank',
  country: 'Indonesia',
  provinceState: '',
  city: '',
  registeredAddress: '',
  operationalAddress: '',
  website: '',
  generalEmail: '',
  telephone: '',
  registrationNumber: '',
  taxId: '',
  parentCompany: '',
  holdingCompany: '',
  stockExchange: '',
  ticker: '',
  employeeCount: '',
  revenueRange: '',
  businessModel: '',
  operatingModel: ''
};

export default function InstitutionTenantAdminPage() {
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/institutions', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to load institutions.');
      setInstitutions(body.institutions || []);
      setSlots(body.databaseSlots || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load institutions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const availableSlots = useMemo(() => slots.filter(slot => slot.available && slot.binding !== 'DB').length, [slots]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/institutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'CREATE_INSTITUTION', ...form })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to provision institution.');
      setForm(blank);
      setMessage('Institution tenant provisioned with a dedicated D1 binding and institution folder namespace.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to provision institution.');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (institutionId: string, status: 'Active' | 'Suspended') => {
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/institutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'UPDATE_TENANT_STATUS', institutionId, status })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to update tenant status.');
      setMessage('Tenant status updated.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update tenant status.');
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-brand-600">
              <Landmark className="h-4 w-4" /> Multi-Institution Administration
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Institution Tenants & Database Isolation</h1>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
              Each institution receives its own tenant identity, dedicated D1 database binding, and isolated institution folder namespace. Platform administrators control tenant provisioning and status.
            </p>
          </div>
          <button onClick={() => void load()} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-brand-700">
            <RefreshCcw className="h-4 w-4" />
          </button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase text-slate-400">Institutions</div>
          <div className="mt-1 text-2xl font-black text-slate-900">{institutions.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase text-slate-400">Dedicated D1 Slots Free</div>
          <div className="mt-1 text-2xl font-black text-slate-900">{availableSlots}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-[10px] font-bold uppercase text-emerald-700">Active Tenants</div>
          <div className="mt-1 text-2xl font-black text-emerald-900">{institutions.filter(item => item.tenantStatus === 'Active').length}</div>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
          <div className="text-[10px] font-bold uppercase text-sky-700">Isolation Mode</div>
          <div className="mt-1 text-sm font-black text-sky-900">Dedicated D1</div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
      {message && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4" />{message}</div>}

      <form onSubmit={create} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-sm font-black text-slate-900">Provision New Institution</h2>
          <p className="mt-1 text-[10px] text-slate-500">A free dedicated D1 slot is selected automatically. Operational records are not copied between institutions.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-bold text-slate-700">Institution Name *
            <input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-700">Registered Legal Name *
            <input required value={form.legalName} onChange={e=>setForm({...form,legalName:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-700">Short Name *
            <input required value={form.shortName} onChange={e=>setForm({...form,shortName:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-700">Institution Type *
            <select value={form.institutionType} onChange={e=>setForm({...form,institutionType:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
              <option>Bank</option><option>Islamic Bank</option><option>Insurance</option><option>Multifinance</option><option>Securities</option><option>Fintech</option><option>Holding Company</option><option>Corporation</option><option>State-Owned Enterprise</option><option>Other Financial Institution</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">Country
            <input value={form.country} onChange={e=>setForm({...form,country:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-700">Province / State
            <input value={form.provinceState} onChange={e=>setForm({...form,provinceState:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-700">City
            <input value={form.city} onChange={e=>setForm({...form,city:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-700">Registration Number
            <input value={form.registrationNumber} onChange={e=>setForm({...form,registrationNumber:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-700">General Email
            <input type="email" value={form.generalEmail} onChange={e=>setForm({...form,generalEmail:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-700">Telephone
            <input value={form.telephone} onChange={e=>setForm({...form,telephone:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-700">Business Model
            <input value={form.businessModel} onChange={e=>setForm({...form,businessModel:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-700">Operating Model
            <input value={form.operatingModel} onChange={e=>setForm({...form,operatingModel:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-700 md:col-span-2">Registered Address
            <textarea rows={2} value={form.registeredAddress} onChange={e=>setForm({...form,registeredAddress:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-700 md:col-span-2">Operational Address
            <textarea rows={2} value={form.operationalAddress} onChange={e=>setForm({...form,operationalAddress:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
        </div>

        <div className="mt-5 flex justify-end">
          <button disabled={saving || availableSlots===0} className="rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">
            {saving ? 'Provisioning…' : availableSlots===0 ? 'No Dedicated D1 Slot Available' : 'Provision Institution Tenant'}
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-sm font-black text-slate-900">Institution Tenant Register</h2>
          <p className="text-[10px] text-slate-500">Physical database binding and institution-folder namespace are shown for administrative verification.</p>
        </div>
        {loading ? <div className="py-8 text-center text-xs text-slate-500">Loading tenants…</div> : (
          <div className="space-y-3">
            {institutions.map(item=>(
              <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-brand-600" />
                      <div className="text-sm font-black text-slate-900">{item.name}</div>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${item.tenantStatus==='Active'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>{item.tenantStatus}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">{item.legalName} · {item.institutionType} · {item.country}</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg bg-slate-50 p-2.5">
                        <div className="flex items-center gap-1 text-[9px] font-bold uppercase text-slate-400"><Database className="h-3 w-3" />Dedicated Database</div>
                        <div className="mt-1 font-mono text-[11px] font-black text-slate-700">{item.databaseBinding}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2.5">
                        <div className="flex items-center gap-1 text-[9px] font-bold uppercase text-slate-400"><FolderOpen className="h-3 w-3" />Institution Folder</div>
                        <div className="mt-1 break-all font-mono text-[10px] font-black text-slate-700">{item.folderKey}</div>
                      </div>
                    </div>
                  </div>
                  {item.databaseBinding!=='DB' && (
                    <button
                      type="button"
                      onClick={()=>void setStatus(item.id, item.tenantStatus==='Active'?'Suspended':'Active')}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600"
                    >
                      {item.tenantStatus==='Active'?'Suspend Tenant':'Reactivate Tenant'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
