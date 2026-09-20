'use client';

import React, { useMemo, useState } from 'react';
import { BadgeCheck, Plus, Save, X } from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';
import { useRole } from '@/context/RoleContext';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100';

export default function CertificationPage() {
  const { data, loading, error, reload } = useAssuranceData();
  const { currentUser } = useRole();
  const certifications = data?.certifications || [];
  const attestations = data?.attestations || [];
  const controls = data?.controls || [];
  const units = data?.institution?.organizationUnits || [];
  const [mode, setMode] = useState<'certification' | 'attestation' | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const canCertify = Boolean(
    currentUser && ['Admin', 'ControlOwner', 'Reviewer', 'Executive'].includes(currentUser.role)
  );
  const canAttest = Boolean(
    currentUser && ['Admin', 'Reviewer', 'Executive'].includes(currentUser.role)
  );

  const controlOptions = useMemo(
    () =>
      controls.map((control: any) => ({
        id: control.id,
        label: `${control.controlId} · ${control.name} · ${control.process?.name || 'No process'}`
      })),
    [controls]
  );

  const setField = (key: string, value: any) =>
    setForm(current => ({ ...current, [key]: value }));

  const open = (nextMode: 'certification' | 'attestation') => {
    setMessage('');
    setMode(nextMode);
    setForm(
      nextMode === 'certification'
        ? {
            actionType: 'CREATE_CERTIFICATION',
            controlId: '',
            period: '',
            declarationText: '',
            certifierName: currentUser?.name || '',
            certifierRole: currentUser?.role || '',
            status: 'Pending'
          }
        : {
            actionType: 'CREATE_ATTESTATION',
            orgUnitId: units.length === 1 ? units[0].id : '',
            period: '',
            scopeSummary: '',
            cfoSignOff: false,
            cfoName: '',
            croSignOff: false,
            croName: '',
            overallOpinion: ''
          }
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const selectedUnit = units.find((unit: any) => unit.id === form.orgUnitId);
      const response = await fetch('/api/assure/certification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          legalEntityId: selectedUnit?.legalEntityId || null
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to save certification record.');
      }
      await reload();
      setMode(null);
      setMessage(
        mode === 'certification'
          ? 'Control certification saved.'
          : 'Management attestation saved.'
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save certification record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase">
              <BadgeCheck className="w-4 h-4" />Certification & Attestation
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Management Assurance Sign-Off</h1>
            <p className="text-xs text-slate-500 mt-1">
              Only actual declarations persisted in D1 are displayed. Sign-off remains attributable to the authenticated user and organization scope.
            </p>
          </div>
          {(canCertify || canAttest) && (
            <div className="flex flex-wrap gap-2">
              {canCertify && (
                <button
                  type="button"
                  onClick={() => open('certification')}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white"
                >
                  <Plus className="h-4 w-4" /> Control Certification
                </button>
              )}
              {canAttest && (
                <button
                  type="button"
                  onClick={() => open('attestation')}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700"
                >
                  <Plus className="h-4 w-4" /> Management Attestation
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <TraceabilityFlow currentStep="CCM Monitor" />

      {message && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          {message}
        </div>
      )}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
          {error}
        </div>
      )}

      {mode && (
        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">
                {mode === 'certification' ? 'Control owner declaration' : 'Management sign-off'}
              </div>
              <h2 className="text-base font-black text-slate-900">
                {mode === 'certification' ? 'Create Control Certification' : 'Create Management Attestation'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setMode(null)}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {mode === 'certification' ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="text-xs font-bold text-slate-700 md:col-span-2 xl:col-span-3">
                Control *
                <select
                  className={inputClass}
                  value={form.controlId || ''}
                  onChange={e => setField('controlId', e.target.value)}
                  required
                >
                  <option value="">Select control</option>
                  {controlOptions.map((control: any) => (
                    <option key={control.id} value={control.id}>{control.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">
                Period *
                <input
                  className={inputClass}
                  value={form.period || ''}
                  onChange={e => setField('period', e.target.value)}
                  placeholder="2026 Q4"
                  required
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Certifier *
                <input
                  className={inputClass + ' bg-slate-50'}
                  value={currentUser?.name || ''}
                  disabled
                  required
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Status
                <select
                  className={inputClass}
                  value={form.status || 'Pending'}
                  onChange={e => setField('status', e.target.value)}
                >
                  <option>Pending</option>
                  <option>Certified</option>
                  <option>Certified with Exception</option>
                  <option>Not Certified</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700 md:col-span-2 xl:col-span-3">
                Declaration *
                <textarea
                  className={inputClass}
                  rows={4}
                  value={form.declarationText || ''}
                  onChange={e => setField('declarationText', e.target.value)}
                  placeholder="Record the factual certification declaration."
                  required
                />
              </label>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="text-xs font-bold text-slate-700">
                Organization Unit
                <select
                  className={inputClass}
                  value={form.orgUnitId || ''}
                  onChange={e => setField('orgUnitId', e.target.value)}
                >
                  <option value="">Enterprise scope</option>
                  {units.map((unit: any) => (
                    <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">
                Period *
                <input
                  className={inputClass}
                  value={form.period || ''}
                  onChange={e => setField('period', e.target.value)}
                  placeholder="2026 Q4"
                  required
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Overall Opinion
                <select
                  className={inputClass}
                  value={form.overallOpinion || ''}
                  onChange={e => setField('overallOpinion', e.target.value)}
                >
                  <option value="">Not recorded</option>
                  <option>Effective</option>
                  <option>Effective with Exceptions</option>
                  <option>Partially Effective</option>
                  <option>Ineffective</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700 md:col-span-2 xl:col-span-3">
                Scope Summary *
                <textarea
                  className={inputClass}
                  rows={4}
                  value={form.scopeSummary || ''}
                  onChange={e => setField('scopeSummary', e.target.value)}
                  required
                />
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(form.cfoSignOff)}
                  onChange={e => setField('cfoSignOff', e.target.checked)}
                />
                CFO sign-off recorded
              </label>
              <label className="text-xs font-bold text-slate-700">
                CFO Name
                <input
                  className={inputClass}
                  value={form.cfoName || ''}
                  onChange={e => setField('cfoName', e.target.value)}
                  disabled={!form.cfoSignOff}
                />
              </label>
              <div />
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(form.croSignOff)}
                  onChange={e => setField('croSignOff', e.target.checked)}
                />
                CRO sign-off recorded
              </label>
              <label className="text-xs font-bold text-slate-700">
                CRO Name
                <input
                  className={inputClass}
                  value={form.croName || ''}
                  onChange={e => setField('croName', e.target.value)}
                  disabled={!form.croSignOff}
                />
              </label>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-xs text-slate-500">Loading…</div>
      ) : certifications.length === 0 && attestations.length === 0 ? (
        <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl">
          <div className="font-bold text-slate-700">No certification or attestation records</div>
          <p className="text-xs text-slate-500 mt-1">
            Create an attributable declaration when the relevant assurance work is ready for sign-off.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="font-bold text-slate-900 mb-3">Control certifications ({certifications.length})</h2>
            <div className="space-y-3">
              {certifications.length === 0 && (
                <div className="text-xs text-slate-400">No control certifications in your organization scope.</div>
              )}
              {certifications.map((cert: any) => (
                <div key={cert.id} className="p-3 border border-slate-200 rounded-xl text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="font-bold">{cert.control?.controlId} · {cert.control?.name}</span>
                    <span className="font-bold">{cert.status}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {cert.period} · {cert.control?.process?.name || 'No process'} · {cert.certifierName} ({cert.certifierRole})
                  </div>
                  <p className="text-slate-600 mt-2">{cert.declarationText}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="font-bold text-slate-900 mb-3">Management attestations ({attestations.length})</h2>
            <div className="space-y-3">
              {attestations.length === 0 && (
                <div className="text-xs text-slate-400">No management attestations in your organization scope.</div>
              )}
              {attestations.map((att: any) => (
                <div key={att.id} className="p-3 border border-slate-200 rounded-xl text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="font-bold">{att.period}</span>
                    <span className="font-bold">{att.overallOpinion || 'Opinion not recorded'}</span>
                  </div>
                  <p className="text-slate-600 mt-2">{att.scopeSummary}</p>
                  <div className="text-[11px] text-slate-500 mt-2">
                    CFO: {att.cfoSignOff ? `Signed by ${att.cfoName || 'named signatory'}` : 'Not signed'} · CRO: {att.croSignOff ? `Signed by ${att.croName || 'named signatory'}` : 'Not signed'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
