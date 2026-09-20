'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Database, Plus, X } from 'lucide-react';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';
import { jsonTransaction } from '@/lib/client-transaction';
import { jsonRead } from '@/lib/client-read';

const EMPTY_FORM = {
  ruleId: '',
  controlId: '',
  name: '',
  description: '',
  dataSource: '',
  queryLogic: '',
  frequency: 'Daily',
  threshold: '0 exceptions'
};

export default function CCMPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [controls, setControls] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadData = async () => {
    setError('');
    try {
      const [ruleData, controlData] = await Promise.all([
        jsonRead<any>('/api/monitor/ccm', { dedupe: false }),
        jsonRead<any>('/api/controls', { dedupe: false })
      ]);

      const nextRules = Array.isArray(ruleData.rules) ? ruleData.rules : [];
      const nextControls = Array.isArray(controlData.controls) ? controlData.controls : [];

      setRules(nextRules);
      setControls(nextControls);
      setForm(current => ({
        ...current,
        controlId:
          current.controlId && nextControls.some((control: any) => control.id === current.controlId)
            ? current.controlId
            : nextControls[0]?.id || ''
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CCM data unavailable');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const createRule = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      await jsonTransaction('/api/monitor/ccm', {
        actionType: 'CREATE_RULE',
        ...form
      });

      setCreateOpen(false);
      setForm({
        ...EMPTY_FORM,
        controlId: controls[0]?.id || ''
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create monitoring rule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase">
            <Activity className="w-4 h-4" />
            Continuous Control Monitoring
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">CCM Cockpit</h1>
          <p className="text-xs text-slate-500 mt-1">
            Monitoring rules and execution history are persisted in Cloudflare D1. No simulated runs are generated.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          disabled={controls.length === 0}
          className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          Configure Rule
        </button>
      </div>

      <TraceabilityFlow currentStep="CCM Monitor" />

      {controls.length === 0 && !error && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
          Register a real control first. A monitoring rule cannot exist without a persisted control.
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
          {error}
        </div>
      )}

      {rules.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center">
          <Database className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <div className="font-bold text-slate-700">No monitoring rules configured</div>
          <p className="text-xs text-slate-500 mt-1">
            Configure a persisted rule and connect a real execution source before monitoring results appear.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => (
            <div key={rule.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-xs text-brand-700 font-bold">{rule.ruleId}</div>
                  <h2 className="font-bold text-slate-900">{rule.name}</h2>
                  <div className="text-xs text-slate-500">
                    {rule.control?.controlId || 'Control unavailable'} · {rule.control?.name || 'Control unavailable'}
                  </div>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-700">
                  {rule.lastStatus || 'Not Run'}
                </span>
              </div>

              <p className="text-xs text-slate-600">{rule.description}</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[10px] uppercase text-slate-400 font-bold">Data source</div>
                  <div className="font-semibold">{rule.dataSource || 'Not configured'}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[10px] uppercase text-slate-400 font-bold">Frequency</div>
                  <div className="font-semibold">{rule.frequency || 'Not configured'}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[10px] uppercase text-slate-400 font-bold">Threshold</div>
                  <div className="font-semibold">{rule.threshold || 'Not configured'}</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-slate-700 mb-2">
                  Execution history ({rule.runs?.length || 0})
                </div>
                {!rule.runs || rule.runs.length === 0 ? (
                  <div className="text-xs text-slate-400">
                    No actual execution results have been ingested.
                  </div>
                ) : (
                  rule.runs.map((run: any) => (
                    <div
                      key={run.id}
                      className="p-3 border-t border-slate-100 text-xs flex flex-col md:flex-row md:items-center justify-between gap-2"
                    >
                      <div>
                        <span className="font-bold">{run.status}</span> · population {run.populationChecked} · exceptions {run.exceptionsFound}
                        <div className="text-[11px] text-slate-500">
                          {run.details || 'No execution detail recorded'}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(run.runTimestamp).toLocaleString('id-ID')}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">Configure CCM Rule</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Define a real monitoring rule. This action creates configuration only; it does not create execution results.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={createRule} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Control *</label>
                <select
                  required
                  value={form.controlId}
                  onChange={event => setForm({ ...form, controlId: event.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                >
                  {controls.map(control => (
                    <option key={control.id} value={control.id}>
                      {control.controlId} — {control.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Rule ID</label>
                  <input
                    value={form.ruleId}
                    onChange={event => setForm({ ...form, ruleId: event.target.value })}
                    placeholder="Auto-generated if blank"
                    className="w-full p-2.5 rounded-lg border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Frequency *</label>
                  <select
                    required
                    value={form.frequency}
                    onChange={event => setForm({ ...form, frequency: event.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200"
                  >
                    <option value="Real Time">Real Time</option>
                    <option value="Hourly">Hourly</option>
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Rule Name *</label>
                <input
                  required
                  value={form.name}
                  onChange={event => setForm({ ...form, name: event.target.value })}
                  placeholder="Enter monitoring rule name"
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description *</label>
                <textarea
                  required
                  rows={2}
                  value={form.description}
                  onChange={event => setForm({ ...form, description: event.target.value })}
                  placeholder="Describe the control condition that is continuously monitored"
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Data Source *</label>
                  <input
                    required
                    value={form.dataSource}
                    onChange={event => setForm({ ...form, dataSource: event.target.value })}
                    placeholder="ERP, API, DWH, SIEM, file feed..."
                    className="w-full p-2.5 rounded-lg border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Threshold *</label>
                  <input
                    required
                    value={form.threshold}
                    onChange={event => setForm({ ...form, threshold: event.target.value })}
                    placeholder="e.g. 0 exceptions"
                    className="w-full p-2.5 rounded-lg border border-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Query / Detection Logic *</label>
                <textarea
                  required
                  rows={4}
                  value={form.queryLogic}
                  onChange={event => setForm({ ...form, queryLogic: event.target.value })}
                  placeholder="Document the actual detection logic or query executed by the connected monitoring source"
                  className="w-full p-2.5 rounded-lg border border-slate-200 font-mono text-[11px]"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.controlId}
                  className="px-5 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save CCM Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
