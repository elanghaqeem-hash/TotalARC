'use client';

import React, { useMemo, useState } from 'react';
import { ClipboardCheck, Plus, Save, X } from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';
import { useRole } from '@/context/RoleContext';
import { jsonTransaction } from '@/lib/client-transaction';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100';

export default function RCSAPage() {
  const { data, loading, error, reload } = useAssuranceData(['rcsa', 'controls', 'organization']);
  const { currentUser } = useRole();
  const campaigns = data?.campaigns || [];
  const controls = data?.controls || [];
  const units = data?.institution?.organizationUnits || [];
  const [mode, setMode] = useState<'campaign' | 'response' | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<Record<string, any>>({
    type: 'RCSA',
    csaConclusion: 'Not Performed',
    exceptionCount: 0,
    assessorName: ''
  });

  const canWrite = Boolean(
    currentUser && ['Admin', 'Reviewer', 'ProcessOwner', 'ControlOwner'].includes(currentUser.role)
  );

  const controlOptions = useMemo(
    () =>
      controls.map((control: any) => ({
        id: control.id,
        label: `${control.controlId} · ${control.name} · ${control.process?.name || 'No process'}`
      })),
    [controls]
  );

  const open = (nextMode: 'campaign' | 'response') => {
    setMessage('');
    setMode(nextMode);
    setForm(
      nextMode === 'campaign'
        ? {
            actionType: 'CREATE_CAMPAIGN',
            type: 'RCSA',
            name: '',
            period: '',
            startDate: '',
            dueDate: '',
            ownerName: currentUser?.name || '',
            approverName: '',
            orgUnitId: units.length === 1 ? units[0].id : '',
            legalEntityId: ''
          }
        : {
            actionType: 'UPSERT_RESPONSE',
            campaignId: campaigns.length === 1 ? campaigns[0].id : '',
            controlId: '',
            csaConclusion: 'Not Performed',
            assessorName: currentUser?.name || '',
            wasPerformed: false,
            frequencyMet: false,
            evidenceAttached: false,
            exceptionsFound: false,
            exceptionCount: 0,
            processChanged: false,
            controlChanged: false,
            assessorNotes: ''
          }
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await jsonTransaction('/api/assure/rcsa', form);
      await reload();
      setMode(null);
      setMessage(mode === 'campaign' ? 'Assessment campaign saved.' : 'CSA response saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save RCSA record.');
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: string, value: any) =>
    setForm(current => ({ ...current, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-sky-600 uppercase">
              <ClipboardCheck className="w-4 h-4" />RCSA & CSA
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Assessment Campaign Workspace</h1>
            <p className="text-xs text-slate-500 mt-1">
              Campaigns and self-assessment responses are persisted in D1 and filtered by your organization scope.
            </p>
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => open('campaign')} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">
                <Plus className="h-4 w-4" /> Campaign
              </button>
              <button onClick={() => open('response')} className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700">
                <Plus className="h-4 w-4" /> CSA Response
              </button>
            </div>
          )}
        </div>
      </div>

      {message && <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs text-sky-800">{message}</div>}
      {error && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}

      {mode && (
        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-sky-600">
                {mode === 'campaign' ? 'Assessment setup' : 'Control self-assessment'}
              </div>
              <h2 className="text-base font-black text-slate-900">
                {mode === 'campaign' ? 'Create Campaign' : 'Record / Update CSA Response'}
              </h2>
            </div>
            <button type="button" onClick={() => setMode(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"><X className="h-4 w-4" /></button>
          </div>

          {mode === 'campaign' ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="text-xs font-bold text-slate-700">Campaign Name *
                <input className={inputClass} value={form.name || ''} onChange={e => setField('name', e.target.value)} required />
              </label>
              <label className="text-xs font-bold text-slate-700">Type *
                <select className={inputClass} value={form.type} onChange={e => setField('type', e.target.value)}>
                  <option value="RCSA">RCSA</option><option value="CSA">CSA</option><option value="ICOFR">ICOFR</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">Period *
                <input className={inputClass} value={form.period || ''} onChange={e => setField('period', e.target.value)} placeholder="2026 Q4" required />
              </label>
              <label className="text-xs font-bold text-slate-700">Start Date *
                <input type="date" className={inputClass} value={form.startDate || ''} onChange={e => setField('startDate', e.target.value)} required />
              </label>
              <label className="text-xs font-bold text-slate-700">Due Date *
                <input type="date" className={inputClass} value={form.dueDate || ''} onChange={e => setField('dueDate', e.target.value)} required />
              </label>
              <label className="text-xs font-bold text-slate-700">Organization Unit
                <select className={inputClass} value={form.orgUnitId || ''} onChange={e => setField('orgUnitId', e.target.value)}>
                  <option value="">Enterprise / unassigned</option>
                  {units.map((unit: any) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">Owner *
                <input className={inputClass} value={form.ownerName || ''} onChange={e => setField('ownerName', e.target.value)} required />
              </label>
              <label className="text-xs font-bold text-slate-700">Approver
                <input className={inputClass} value={form.approverName || ''} onChange={e => setField('approverName', e.target.value)} />
              </label>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="text-xs font-bold text-slate-700">Campaign *
                <select className={inputClass} value={form.campaignId || ''} onChange={e => setField('campaignId', e.target.value)} required>
                  <option value="">Select campaign</option>
                  {campaigns.map((campaign: any) => <option key={campaign.id} value={campaign.id}>{campaign.name} · {campaign.period}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700 md:col-span-2">Control *
                <select className={inputClass} value={form.controlId || ''} onChange={e => setField('controlId', e.target.value)} required>
                  <option value="">Select control</option>
                  {controlOptions.map((control: any) => <option key={control.id} value={control.id}>{control.label}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">Conclusion *
                <select className={inputClass} value={form.csaConclusion} onChange={e => setField('csaConclusion', e.target.value)}>
                  <option>Not Performed</option><option>Effective</option><option>Partially Effective</option><option>Ineffective</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">Exception Count
                <input type="number" min={0} className={inputClass} value={form.exceptionCount} onChange={e => setField('exceptionCount', Number(e.target.value))} />
              </label>
              <label className="text-xs font-bold text-slate-700">Assessor *
                <input className={inputClass} value={form.assessorName || ''} onChange={e => setField('assessorName', e.target.value)} required />
              </label>
              <div className="md:col-span-2 xl:col-span-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                {[
                  ['wasPerformed', 'Control performed'],
                  ['frequencyMet', 'Frequency met'],
                  ['evidenceAttached', 'Evidence available'],
                  ['exceptionsFound', 'Exceptions found'],
                  ['processChanged', 'Process changed'],
                  ['controlChanged', 'Control changed']
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 font-semibold text-slate-700">
                    <input type="checkbox" checked={Boolean(form[key])} onChange={e => setField(key, e.target.checked)} />
                    {label}
                  </label>
                ))}
              </div>
              <label className="text-xs font-bold text-slate-700 md:col-span-2 xl:col-span-3">Assessor Notes
                <textarea className={inputClass} rows={3} value={form.assessorNotes || ''} onChange={e => setField('assessorNotes', e.target.value)} />
              </label>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-xs text-slate-500">Loading…</div>
      ) : campaigns.length === 0 ? (
        <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl">
          <div className="font-bold text-slate-700">No assessment campaigns recorded</div>
          <p className="text-xs text-slate-500 mt-1">Create a campaign to begin a database-backed RCSA/CSA cycle.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign: any) => (
            <div key={campaign.id} className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] uppercase font-bold text-sky-600">{campaign.type} · {campaign.period}</div>
                  <h2 className="font-bold text-slate-900">{campaign.name}</h2>
                  <div className="text-[11px] text-slate-500">
                    {new Date(campaign.startDate).toLocaleDateString('id-ID')} – {new Date(campaign.dueDate).toLocaleDateString('id-ID')} · Owner: {campaign.ownerName}
                  </div>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded bg-slate-100">{campaign.status}</span>
              </div>
              <div className="mt-4 space-y-2">
                {(campaign.csaResponses || []).length === 0 ? (
                  <div className="text-xs text-slate-400">No CSA responses recorded in your organization scope.</div>
                ) : campaign.csaResponses.map((response: any) => (
                  <div key={response.id} className="p-3 rounded-xl border border-slate-200 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="font-bold">{response.control?.controlId} · {response.control?.name}</span>
                      <span className="font-bold">{response.csaConclusion}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {response.control?.process?.name || 'No process'} · Assessor: {response.assessorName} · Exceptions: {response.exceptionCount || 0}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
