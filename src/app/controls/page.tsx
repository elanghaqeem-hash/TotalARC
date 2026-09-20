'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Shield,
  Plus,
  Search,
  Filter,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Cpu,
  X,
  BadgeCheck,
  Activity
} from 'lucide-react';
import { getHealthBadgeClasses } from '@/lib/utils';

export default function ControlsPage() {
  const [controls, setControls] = useState<any[]>([]);
  const [processes, setProcesses] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [selectedControl, setSelectedControl] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [newControlModal, setNewControlModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    controlId: '',
    name: '',
    description: '',
    objective: '',
    processId: '',
    riskId: '',
    controlOwner: '',
    type: 'Preventive',
    nature: 'IT Dependent Manual',
    frequency: 'Per Transaction',
    isKeyControl: false,
    isIcofrKey: false
  });

  const loadControls = () => {
    Promise.all([
      fetch('/api/controls').then(res => {
        if (!res.ok) throw new Error('Unable to load controls.');
        return res.json();
      }),
      fetch('/api/processes').then(res => {
        if (!res.ok) throw new Error('Unable to load processes.');
        return res.json();
      }),
      fetch('/api/risks').then(res => {
        if (!res.ok) throw new Error('Unable to load risks.');
        return res.json();
      })
    ])
      .then(([controlData, processData, riskData]) => {
        const nextControls = Array.isArray(controlData.controls) ? controlData.controls : [];
        const nextProcesses = Array.isArray(processData.processes) ? processData.processes : [];
        const nextRisks = Array.isArray(riskData.risks) ? riskData.risks : [];

        setControls(nextControls);
        setProcesses(nextProcesses);
        setRisks(nextRisks);

        if (nextControls.length > 0 && !selectedControl) {
          setSelectedControl(nextControls[0]);
        }

        setFormData(prev => {
          const nextProcessId =
            prev.processId && nextProcesses.some((process: any) => process.id === prev.processId)
              ? prev.processId
              : nextProcesses[0]?.id || '';
          const riskStillValid = nextRisks.some(
            (risk: any) => risk.id === prev.riskId && risk.processId === nextProcessId
          );

          return {
            ...prev,
            processId: nextProcessId,
            riskId: riskStillValid ? prev.riskId : ''
          };
        });
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadControls();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');

    try {
      const res = await fetch('/api/controls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Unable to save control.');

      setControls(current =>
        [...current, payload].sort((a, b) => String(a.controlId).localeCompare(String(b.controlId)))
      );
      setSelectedControl(payload);
      setFormData({
        controlId: '',
        name: '',
        description: '',
        objective: '',
        processId: formData.processId || processes[0]?.id || '',
        riskId: '',
        controlOwner: '',
        type: 'Preventive',
        nature: 'IT Dependent Manual',
        frequency: 'Per Transaction',
        isKeyControl: false,
        isIcofrKey: false
      });
      setNewControlModal(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save control.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = controls.filter(c => {
    return (
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.controlId.toLowerCase().includes(search.toLowerCase()) ||
      c.type.toLowerCase().includes(search.toLowerCase())
    );
  });

  const availableRisks = risks.filter(risk => risk.processId === formData.processId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-brand-600 uppercase tracking-wider">
            <Shield className="w-4 h-4" />
            <span>Single Control Library (MANAGE)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Enterprise Control Library
          </h1>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setNewControlModal(true)}
            className="inline-flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Register Control</span>
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search Control ID, Name, Type, or Owner..."
            className="w-full text-xs pl-9 pr-4 py-2 rounded-lg bg-slate-100 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>

        <div className="text-xs text-slate-500 font-semibold">
          Showing {filtered.length} Enterprise Controls
        </div>
      </div>

      {/* Split View: Left List, Right Control 360 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left List (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          {filtered.map(c => {
            const isSelected = selectedControl?.id === c.id;
            const health = getHealthBadgeClasses(c.overallHealth);
            return (
              <div
                key={c.id}
                onClick={() => setSelectedControl(c)}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-brand-50/50 border-brand-500 shadow-md ring-1 ring-brand-400'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold text-brand-700 bg-brand-100/70 px-2 py-0.5 rounded">
                        {c.controlId}
                      </span>
                      {c.isKeyControl && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                          Key Control
                        </span>
                      )}
                      {c.isIcofrKey && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                          ICOFR
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 mt-1.5">
                      {c.name}
                    </h3>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center space-x-1 ${health.bg}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`}></span>
                    <span>{c.overallHealth}</span>
                  </span>
                </div>

                <p className="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">
                  {c.description}
                </p>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Type: <strong>{c.type}</strong> ({c.nature})</span>
                  <span className="text-brand-600 font-bold flex items-center space-x-1">
                    <span>Control 360°</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Detail: Control 360 (7 cols) */}
        <div className="lg:col-span-7">
          {selectedControl ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-sm font-bold text-brand-700 bg-brand-50 px-2.5 py-1 rounded border border-brand-200">
                      {selectedControl.controlId}
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">
                      Owner: {selectedControl.controlOwner}
                    </span>
                  </div>
                  <Link
                    href="/rcm"
                    className="text-xs font-bold text-brand-600 hover:text-brand-700 bg-brand-50 px-3 py-1.5 rounded-lg border border-brand-200 flex items-center space-x-1"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>View in RCM</span>
                  </Link>
                </div>

                <h2 className="text-xl font-black text-slate-900 mt-2">
                  {selectedControl.name}
                </h2>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {selectedControl.description}
                </p>
              </div>

              {/* Attributes & Design Matrix (Section 33 & 34) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Control Type</span>
                  <div className="font-bold text-slate-900 mt-0.5">{selectedControl.type}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Nature</span>
                  <div className="font-bold text-slate-900 mt-0.5">{selectedControl.nature}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Frequency</span>
                  <div className="font-bold text-slate-900 mt-0.5">{selectedControl.frequency}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Method</span>
                  <div className="font-bold text-slate-900 mt-0.5">{selectedControl.method}</div>
                </div>
              </div>

              {/* Multi-Domain Framework Mappings (Section 6) */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Cross-Domain Regulatory & Framework Mappings (Section 6)
                </h3>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                  <div>
                    <span className="text-slate-500 font-medium">Frameworks:</span>
                    <div className="font-semibold text-slate-800 mt-0.5">
                      {selectedControl.frameworkMapping || 'COSO Principle 10, SOX 404 Assertions, ISO 27001'}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-200">
                    <span className="text-slate-500 font-medium">Evidence Requirement:</span>
                    <div className="font-mono text-[11px] text-slate-700 mt-0.5">
                      {selectedControl.evidenceRequirement || 'No evidence requirement recorded'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Control Health 360 Evaluation (Section 90 & 107) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                    <Activity className="w-3.5 h-3.5 text-brand-600" />
                    <span>Control Health 360° Assessment</span>
                  </h3>
                  <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    {selectedControl.overallHealth || 'Not Assessed'}
                  </span>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
                  <p className="text-slate-700 leading-relaxed font-medium">
                    {selectedControl.healthRationale || 'No health rationale recorded.'}
                  </p>
                  <div className="pt-2 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-700">
                    <span>Design: <strong>{selectedControl.designAssessment || 'Not Assessed'}</strong></span>
                    <span>ToE records: <strong>{selectedControl.toeTests?.length || 0}</strong></span>
                    <span>CCM: <strong>{selectedControl.monitoringRules?.[0]?.lastStatus || 'Not Run'}</strong></span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-xs">
              Select a control to inspect its 360° profile.
            </div>
          )}
        </div>
      </div>

      {/* Register Control Modal */}
      {newControlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900">Register Control Master</h3>
              <button
                onClick={() => setNewControlModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              {saveError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700">
                  {saveError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Control ID</label>
                  <input
                    type="text"
                    placeholder="Auto-generated if blank"
                    value={formData.controlId}
                    onChange={e => setFormData({ ...formData, controlId: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Frequency *</label>
                  <select
                    required
                    value={formData.frequency}
                    onChange={e => setFormData({ ...formData, frequency: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="Real Time">Real Time</option>
                    <option value="Per Transaction">Per Transaction</option>
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Annual">Annual</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Business Process *</label>
                <select
                  required
                  value={formData.processId}
                  onChange={e =>
                    setFormData({ ...formData, processId: e.target.value, riskId: '' })
                  }
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                >
                  {processes.length === 0 ? (
                    <option value="">Register a business process first</option>
                  ) : (
                    processes.map(process => (
                      <option key={process.id} value={process.id}>
                        {process.processId} — {process.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Related Risk</label>
                <select
                  value={formData.riskId}
                  onChange={e => setFormData({ ...formData, riskId: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                >
                  <option value="">No risk mapping yet</option>
                  {availableRisks.map(risk => (
                    <option key={risk.id} value={risk.id}>
                      {risk.riskId} — {risk.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-slate-500">
                  Select a risk to create the persisted RCM relationship at the same time.
                </p>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Control Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Daily Bank Statement Reconciliation"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Control Description *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Describe control activities, criteria, and execution mechanism..."
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Control Objective *</label>
                <input
                  type="text"
                  required
                  placeholder="State the specific risk/control objective"
                  value={formData.objective}
                  onChange={e => setFormData({ ...formData, objective: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Control Owner *</label>
                <input
                  type="text"
                  required
                  placeholder="Enter accountable control owner"
                  value={formData.controlOwner}
                  onChange={e => setFormData({ ...formData, controlOwner: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Type</label>
                  <select
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="Preventive">Preventive</option>
                    <option value="Detective">Detective</option>
                    <option value="Corrective">Corrective</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Nature</label>
                  <select
                    value={formData.nature}
                    onChange={e => setFormData({ ...formData, nature: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="Manual">Manual</option>
                    <option value="IT Dependent Manual">IT Dependent Manual</option>
                    <option value="Automated">Automated</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center space-x-6 pt-2">
                <label className="flex items-center space-x-2 text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isKeyControl}
                    onChange={e => setFormData({ ...formData, isKeyControl: e.target.checked })}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>Is Key Control?</span>
                </label>

                <label className="flex items-center space-x-2 text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isIcofrKey}
                    onChange={e => setFormData({ ...formData, isIcofrKey: e.target.checked })}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>ICOFR Key Control</span>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setNewControlModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || processes.length === 0}
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : 'Save Control Master'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
