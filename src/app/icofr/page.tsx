'use client';

import React, { useState } from 'react';
import { FileCheck, Plus, Save, X } from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';
import { useRole } from '@/context/RoleContext';

const ASSERTIONS = [
  'Existence / Occurrence',
  'Completeness',
  'Accuracy',
  'Valuation / Allocation',
  'Rights & Obligations',
  'Presentation & Disclosure'
];

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100';

export default function ICOFRPage() {
  const { data, loading, error, reload } = useAssuranceData(['icofr', 'organization']);
  const { currentUser } = useRole();
  const accounts = data?.financialAccounts || [];
  const ipe = data?.ipeRegisters || [];
  const units = data?.institution?.organizationUnits || [];
  const [mode, setMode] = useState<'account' | 'ipe' | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const canWrite = Boolean(
    currentUser && ['Admin', 'Reviewer', 'ProcessOwner', 'ControlOwner'].includes(currentUser.role)
  );

  const setField = (key: string, value: any) =>
    setForm(current => ({ ...current, [key]: value }));

  const open = (nextMode: 'account' | 'ipe') => {
    setMode(nextMode);
    setMessage('');
    setForm(
      nextMode === 'account'
        ? {
            actionType: 'CREATE_ACCOUNT',
            orgUnitId: units.length === 1 ? units[0].id : '',
            accountCode: '',
            accountName: '',
            financialStatement: 'Balance Sheet',
            balanceAmount: 0,
            isSignificant: false,
            scopingRationale: '',
            fraudExposure: 'Not Assessed',
            complexity: 'Not Assessed',
            assertions: ASSERTIONS.map(assertion => ({ assertion, isInScope: false }))
          }
        : {
            actionType: 'CREATE_IPE',
            orgUnitId: units.length === 1 ? units[0].id : '',
            reportName: '',
            systemSource: '',
            reportOwner: currentUser?.name || '',
            parameters: '',
            logicSummary: '',
            completenessTested: false,
            accuracyTested: false,
            evidenceDoc: ''
          }
    );
  };

  const toggleAssertion = (index: number, checked: boolean) => {
    const assertions = [...(form.assertions || [])];
    assertions[index] = { ...assertions[index], isInScope: checked };
    setField('assertions', assertions);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const selectedUnit = units.find((unit: any) => unit.id === form.orgUnitId);
      const response = await fetch('/api/assure/icofr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          legalEntityId: selectedUnit?.legalEntityId || null
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save ICOFR record.');
      await reload();
      setMode(null);
      setMessage(mode === 'account' ? 'Financial account scope saved.' : 'IPE register entry saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save ICOFR record.');
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
              <FileCheck className="w-4 h-4" />ICOFR
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Financial Reporting Scope & Assertions</h1>
            <p className="text-xs text-slate-500 mt-1">
              Significant accounts, assertions, and IPE records are stored in D1 and assigned to organization units.
            </p>
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => open('account')} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">
                <Plus className="h-4 w-4" /> Financial Account
              </button>
              <button onClick={() => open('ipe')} className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700">
                <Plus className="h-4 w-4" /> IPE
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
                {mode === 'account' ? 'Financial reporting scope' : 'Information Produced by Entity'}
              </div>
              <h2 className="text-base font-black text-slate-900">
                {mode === 'account' ? 'Register Financial Account' : 'Register IPE'}
              </h2>
            </div>
            <button type="button" onClick={() => setMode(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"><X className="h-4 w-4" /></button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-xs font-bold text-slate-700">Organization Unit *
              <select className={inputClass} value={form.orgUnitId || ''} onChange={e => setField('orgUnitId', e.target.value)} required>
                <option value="">Select unit</option>
                {units.map((unit: any) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}
              </select>
            </label>

            {mode === 'account' ? (
              <>
                <label className="text-xs font-bold text-slate-700">Account Code *
                  <input className={inputClass} value={form.accountCode || ''} onChange={e => setField('accountCode', e.target.value)} required />
                </label>
                <label className="text-xs font-bold text-slate-700">Account Name *
                  <input className={inputClass} value={form.accountName || ''} onChange={e => setField('accountName', e.target.value)} required />
                </label>
                <label className="text-xs font-bold text-slate-700">Financial Statement *
                  <select className={inputClass} value={form.financialStatement} onChange={e => setField('financialStatement', e.target.value)}>
                    <option>Balance Sheet</option><option>Income Statement</option><option>Cash Flow</option><option>Equity</option><option>Notes / Disclosure</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700">Balance Amount
                  <input type="number" step="any" className={inputClass} value={form.balanceAmount} onChange={e => setField('balanceAmount', Number(e.target.value))} />
                </label>
                <label className="text-xs font-bold text-slate-700">Fraud Exposure
                  <select className={inputClass} value={form.fraudExposure} onChange={e => setField('fraudExposure', e.target.value)}>
                    <option>Not Assessed</option><option>Low</option><option>Medium</option><option>High</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700">Complexity
                  <select className={inputClass} value={form.complexity} onChange={e => setField('complexity', e.target.value)}>
                    <option>Not Assessed</option><option>Low</option><option>Medium</option><option>High</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-700">
                  <input type="checkbox" checked={Boolean(form.isSignificant)} onChange={e => setField('isSignificant', e.target.checked)} />
                  Significant account
                </label>
                <label className="text-xs font-bold text-slate-700 md:col-span-2">Scoping Rationale
                  <textarea className={inputClass} rows={3} value={form.scopingRationale || ''} onChange={e => setField('scopingRationale', e.target.value)} />
                </label>
                <div className="md:col-span-2 xl:col-span-3">
                  <div className="mb-2 text-xs font-bold text-slate-700">Financial Assertions</div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {(form.assertions || []).map((item: any, index: number) => (
                      <label key={item.assertion} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-700">
                        <input type="checkbox" checked={Boolean(item.isInScope)} onChange={e => toggleAssertion(index, e.target.checked)} />
                        {item.assertion}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <label className="text-xs font-bold text-slate-700">Report Name *
                  <input className={inputClass} value={form.reportName || ''} onChange={e => setField('reportName', e.target.value)} required />
                </label>
                <label className="text-xs font-bold text-slate-700">System Source *
                  <input className={inputClass} value={form.systemSource || ''} onChange={e => setField('systemSource', e.target.value)} required />
                </label>
                <label className="text-xs font-bold text-slate-700">Report Owner *
                  <input className={inputClass} value={form.reportOwner || ''} onChange={e => setField('reportOwner', e.target.value)} required />
                </label>
                <label className="text-xs font-bold text-slate-700 md:col-span-2">Parameters
                  <textarea className={inputClass} rows={3} value={form.parameters || ''} onChange={e => setField('parameters', e.target.value)} />
                </label>
                <label className="text-xs font-bold text-slate-700 md:col-span-2">Logic Summary
                  <textarea className={inputClass} rows={3} value={form.logicSummary || ''} onChange={e => setField('logicSummary', e.target.value)} />
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-700">
                  <input type="checkbox" checked={Boolean(form.completenessTested)} onChange={e => setField('completenessTested', e.target.checked)} />
                  Completeness tested
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-700">
                  <input type="checkbox" checked={Boolean(form.accuracyTested)} onChange={e => setField('accuracyTested', e.target.checked)} />
                  Accuracy tested
                </label>
                <label className="text-xs font-bold text-slate-700 md:col-span-2">Evidence Reference
                  <input className={inputClass} value={form.evidenceDoc || ''} onChange={e => setField('evidenceDoc', e.target.value)} />
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
      ) : accounts.length === 0 && ipe.length === 0 ? (
        <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl">
          <div className="font-bold text-slate-700">No ICOFR records available</div>
          <p className="text-xs text-slate-500 mt-1">Register financial accounts and IPE directly into the persistent database.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="font-bold text-slate-900 mb-3">Financial accounts ({accounts.length})</h2>
            <div className="space-y-3">
              {accounts.length === 0 && <div className="text-xs text-slate-400">No financial accounts in your organization scope.</div>}
              {accounts.map((account: any) => (
                <div key={account.id} className="p-3 border border-slate-200 rounded-xl text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="font-bold">{account.accountCode} · {account.accountName}</span>
                    <span>{account.isSignificant ? 'Significant' : 'Not significant'}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">{account.financialStatement} · Fraud exposure: {account.fraudExposure} · Complexity: {account.complexity}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(account.assertions || []).map((a: any) => (
                      <span key={a.id} className="text-[10px] px-2 py-0.5 rounded bg-slate-100">{a.assertion}: {a.isInScope ? 'In scope' : 'Out of scope'}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="font-bold text-slate-900 mb-3">IPE Register ({ipe.length})</h2>
            <div className="space-y-3">
              {ipe.length === 0 && <div className="text-xs text-slate-400">No IPE records in your organization scope.</div>}
              {ipe.map((item: any) => (
                <div key={item.id} className="p-3 border border-slate-200 rounded-xl text-xs">
                  <div className="font-bold">{item.reportName}</div>
                  <div className="text-[11px] text-slate-500">{item.systemSource} · Owner: {item.reportOwner}</div>
                  <div className="mt-2 text-[10px]">Completeness tested: {item.completenessTested ? 'Yes' : 'No'} · Accuracy tested: {item.accuracyTested ? 'Yes' : 'No'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
