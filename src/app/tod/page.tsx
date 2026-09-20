'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Save, Workflow, X } from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';
import { useRole } from '@/context/RoleContext';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100';

export default function ToDPage() {
  const { data, loading, error, reload } = useAssuranceData(['tod', 'controls']);
  const { currentUser } = useRole();
  const tests = data?.todTests || [];
  const walkthroughs = data?.walkthroughs || [];
  const controls = data?.controls || [];
  const [mode, setMode] = useState<'test' | 'walkthrough' | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<Record<string, any>>({});

  const canWrite = Boolean(
    currentUser && ['Admin', 'Tester', 'Reviewer'].includes(currentUser.role)
  );

  const controlOptions = useMemo(
    () =>
      controls.map((control: any) => ({
        id: control.id,
        label: `${control.controlId} · ${control.name} · ${control.process?.name || 'No process'}`
      })),
    [controls]
  );

  const open = (nextMode: 'test' | 'walkthrough') => {
    setMessage('');
    setMode(nextMode);
    setForm(
      nextMode === 'test'
        ? {
            actionType: 'CREATE_TEST',
            controlId: '',
            testerName: currentUser?.name || '',
            reviewerName: '',
            period: '',
            testObjective: '',
            objectiveAlignment: false,
            riskCoverage: false,
            precisionAdequate: false,
            segregationDuties: false,
            evidenceSufficiency: false,
            observations: '',
            conclusion: 'Not Assessed',
            status: 'Draft'
          }
        : {
            actionType: 'CREATE_WALKTHROUGH',
            controlId: '',
            date: '',
            participants: currentUser?.name || '',
            transactionRef: '',
            systemsInspected: '',
            observations: '',
            processChanged: false,
            conclusion: 'Not Assessed'
          }
    );
  };

  const setField = (key: string, value: any) =>
    setForm(current => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/assure/tod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save ToD record.');
      await reload();
      setMode(null);
      setMessage(mode === 'test' ? 'Test of Design saved.' : 'Walkthrough saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save ToD record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-sky-600 uppercase">
              <Workflow className="w-4 h-4" />Walkthrough & Test of Design
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">ToD Workspace</h1>
            <p className="text-xs text-slate-500 mt-1">
              Design testing and walkthrough workpapers are persisted in D1 and inherit the control's organization scope.
            </p>
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => open('test')} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">
                <Plus className="h-4 w-4" /> ToD Test
              </button>
              <button onClick={() => open('walkthrough')} className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700">
                <Plus className="h-4 w-4" /> Walkthrough
              </button>
            </div>
          )}
        </div>
      </div>

      <TraceabilityFlow currentStep="Control" />
      {message && <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs text-sky-800">{message}</div>}
      {error && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}

      {mode && (
        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-sky-600">
                {mode === 'test' ? 'Design assessment' : 'Walkthrough evidence'}
              </div>
              <h2 className="text-base font-black text-slate-900">
                {mode === 'test' ? 'Create Test of Design' : 'Record Walkthrough'}
              </h2>
            </div>
            <button type="button" onClick={() => setMode(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"><X className="h-4 w-4" /></button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-xs font-bold text-slate-700 md:col-span-2 xl:col-span-3">Control *
              <select className={inputClass} value={form.controlId || ''} onChange={e => setField('controlId', e.target.value)} required>
                <option value="">Select control</option>
                {controlOptions.map((control: any) => <option key={control.id} value={control.id}>{control.label}</option>)}
              </select>
            </label>

            {mode === 'test' ? (
              <>
                <label className="text-xs font-bold text-slate-700">Tester *
                  <input className={inputClass} value={form.testerName || ''} onChange={e => setField('testerName', e.target.value)} required />
                </label>
                <label className="text-xs font-bold text-slate-700">Reviewer
                  <input className={inputClass} value={form.reviewerName || ''} onChange={e => setField('reviewerName', e.target.value)} />
                </label>
                <label className="text-xs font-bold text-slate-700">Period *
                  <input className={inputClass} value={form.period || ''} onChange={e => setField('period', e.target.value)} placeholder="2026 Q4" required />
                </label>
                <label className="text-xs font-bold text-slate-700 md:col-span-2 xl:col-span-3">Test Objective *
                  <textarea className={inputClass} rows={3} value={form.testObjective || ''} onChange={e => setField('testObjective', e.target.value)} required />
                </label>
                <div className="md:col-span-2 xl:col-span-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                  {[
                    ['objectiveAlignment', 'Objective alignment'],
                    ['riskCoverage', 'Risk coverage'],
                    ['precisionAdequate', 'Precision adequate'],
                    ['segregationDuties', 'Segregation of duties'],
                    ['evidenceSufficiency', 'Evidence sufficient']
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 font-semibold text-slate-700">
                      <input type="checkbox" checked={Boolean(form[key])} onChange={e => setField(key, e.target.checked)} />
                      {label}
                    </label>
                  ))}
                </div>
                <label className="text-xs font-bold text-slate-700">Conclusion
                  <select className={inputClass} value={form.conclusion} onChange={e => setField('conclusion', e.target.value)}>
                    <option>Not Assessed</option><option>Effective Design</option><option>Partially Effective Design</option><option>Ineffective Design</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700">Status
                  <select className={inputClass} value={form.status} onChange={e => setField('status', e.target.value)}>
                    <option>Draft</option><option>Submitted</option><option>Approved</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700 md:col-span-2 xl:col-span-3">Observations
                  <textarea className={inputClass} rows={3} value={form.observations || ''} onChange={e => setField('observations', e.target.value)} />
                </label>
              </>
            ) : (
              <>
                <label className="text-xs font-bold text-slate-700">Date *
                  <input type="date" className={inputClass} value={form.date || ''} onChange={e => setField('date', e.target.value)} required />
                </label>
                <label className="text-xs font-bold text-slate-700">Participants
                  <input className={inputClass} value={form.participants || ''} onChange={e => setField('participants', e.target.value)} />
                </label>
                <label className="text-xs font-bold text-slate-700">Transaction Ref.
                  <input className={inputClass} value={form.transactionRef || ''} onChange={e => setField('transactionRef', e.target.value)} />
                </label>
                <label className="text-xs font-bold text-slate-700 md:col-span-2">Systems Inspected
                  <input className={inputClass} value={form.systemsInspected || ''} onChange={e => setField('systemsInspected', e.target.value)} />
                </label>
                <label className="text-xs font-bold text-slate-700">Conclusion
                  <select className={inputClass} value={form.conclusion} onChange={e => setField('conclusion', e.target.value)}>
                    <option>Not Assessed</option><option>Design Confirmed</option><option>Design Gap Identified</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-700">
                  <input type="checkbox" checked={Boolean(form.processChanged)} onChange={e => setField('processChanged', e.target.checked)} />
                  Process changed since prior walkthrough
                </label>
                <label className="text-xs font-bold text-slate-700 md:col-span-2 xl:col-span-3">Observations
                  <textarea className={inputClass} rows={3} value={form.observations || ''} onChange={e => setField('observations', e.target.value)} />
                </label>
              </>
            )}
          </div>

          <div className="mt-5 flex justify-end">
            <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-xs text-slate-500">Loading…</div>
      ) : tests.length === 0 && walkthroughs.length === 0 ? (
        <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl">
          <div className="font-bold text-slate-700">No ToD or walkthrough records</div>
          <p className="text-xs text-slate-500 mt-1">Create a workpaper to begin design testing for controls in your organization scope.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="font-bold text-slate-900 mb-3">Test of Design ({tests.length})</h2>
            <div className="space-y-3">
              {tests.length === 0 && <div className="text-xs text-slate-400">No ToD tests in scope.</div>}
              {tests.map((test: any) => (
                <div key={test.id} className="p-3 border border-slate-200 rounded-xl text-xs">
                  <div className="flex justify-between gap-2"><span className="font-mono font-bold">{test.testId}</span><span className="font-bold">{test.conclusion}</span></div>
                  <div className="font-semibold mt-1">{test.control?.controlId} · {test.control?.name}</div>
                  <div className="text-[11px] text-slate-500">{test.process?.name} · {test.period} · Tester: {test.testerName}</div>
                  <div className="grid grid-cols-2 gap-1 mt-2 text-[10px] text-slate-600">
                    <span>Objective alignment: {test.objectiveAlignment ? 'Yes' : 'No'}</span>
                    <span>Risk coverage: {test.riskCoverage ? 'Yes' : 'No'}</span>
                    <span>Precision: {test.precisionAdequate ? 'Yes' : 'No'}</span>
                    <span>Evidence: {test.evidenceSufficiency ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="font-bold text-slate-900 mb-3">Walkthroughs ({walkthroughs.length})</h2>
            <div className="space-y-3">
              {walkthroughs.length === 0 && <div className="text-xs text-slate-400">No walkthroughs in scope.</div>}
              {walkthroughs.map((walk: any) => (
                <div key={walk.id} className="p-3 border border-slate-200 rounded-xl text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="font-mono font-bold">{walk.control?.controlId || walk.controlId}</span>
                    <span className="font-bold">{walk.conclusion}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {new Date(walk.date).toLocaleDateString('id-ID')} · {walk.process?.name || 'No process'} · {walk.participants || 'Participants not recorded'}
                  </div>
                  <p className="text-slate-600 mt-1">{walk.observations || 'No observations recorded'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
