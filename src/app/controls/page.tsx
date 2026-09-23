'use client';

import React, { useState, useEffect, useRef } from 'react';
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
import { DataLoadingState } from '@/components/common/DataLoadingState';

export default function ControlsPage() {
  const [controls, setControls] = useState<any[]>([]);
  const [processes, setProcesses] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [selectedControl, setSelectedControl] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [newControlModal, setNewControlModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [controlLoading, setControlLoading] = useState(true);
  const [controlLoadError, setControlLoadError] = useState('');
  const control360Ref = useRef<HTMLDivElement | null>(null);
  const [creatingRelatedRisk, setCreatingRelatedRisk] = useState(false);
  const [riskSaving, setRiskSaving] = useState(false);
  const [riskSaveError, setRiskSaveError] = useState('');
  const [riskDraft, setRiskDraft] = useState({
    name: '',
    category: 'Financial Reporting',
    ownerName: '',
    cause: '',
    event: '',
    impact: '',
    inherentLikelihood: 0,
    inherentImpact: 0
  });

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
    setControlLoading(true);
    setControlLoadError('');
    fetch('/api/controls')
      .then(res => {
        if (!res.ok) throw new Error('Unable to load controls.');
        return res.json();
      })
      .then(controlData => {
        const nextControls = Array.isArray(controlData.controls) ? controlData.controls : [];
        const nextProcesses = Array.isArray(controlData.processes) ? controlData.processes : [];
        const nextRisks = Array.isArray(controlData.risks) ? controlData.risks : [];

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
      .catch(error => {
        console.error(error);
        setControlLoadError(
          error instanceof Error ? error.message : 'Unable to load control data.'
        );
      })
      .finally(() => {
        setControlLoading(false);
      });
  };

  useEffect(() => {
    loadControls();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');

    if (!formData.riskId) {
      setSaveError('Select or create a Related Risk before saving the Control Master so the RCM risk-control mapping is persisted.');
      setSaving(false);
      return;
    }

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
      setCreatingRelatedRisk(false);
      setRiskSaveError('');
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

  const openControl360 = (control: any) => {
    setSelectedControl(control);

    window.requestAnimationFrame(() => {
      control360Ref.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  };

  const handleCreateRelatedRisk = async () => {
    if (!formData.processId) {
      setRiskSaveError('Select a Business Process before creating a Related Risk.');
      return;
    }

    setRiskSaving(true);
    setRiskSaveError('');

    try {
      const response = await fetch('/api/risks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processId: formData.processId,
          name: riskDraft.name,
          category: riskDraft.category,
          ownerName: riskDraft.ownerName,
          cause: riskDraft.cause,
          event: riskDraft.event,
          impact: riskDraft.impact,
          inherentLikelihood: riskDraft.inherentLikelihood,
          inherentImpact: riskDraft.inherentImpact
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to create related risk.');

      setRisks(current =>
        [...current, payload].sort((a, b) => String(a.riskId).localeCompare(String(b.riskId)))
      );
      setFormData(current => ({ ...current, riskId: payload.id }));
      setRiskDraft({
        name: '',
        category: 'Financial Reporting',
        ownerName: '',
        cause: '',
        event: '',
        impact: '',
        inherentLikelihood: 0,
        inherentImpact: 0
      });
      setCreatingRelatedRisk(false);
    } catch (error) {
      setRiskSaveError(
        error instanceof Error ? error.message : 'Unable to create related risk.'
      );
    } finally {
      setRiskSaving(false);
    }
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-6 overflow-x-hidden">
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
          {controlLoading ? 'Loading Enterprise Controls...' : `Showing ${filtered.length} Enterprise Controls`}
        </div>
      </div>

      {controlLoadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          <strong className="font-black">Control data unavailable.</strong>{' '}
          {controlLoadError} Please retry after the database/API connection is available.
        </div>
      )}

      {/* Split View: Left List, Right Control 360 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left List (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          {controlLoading ? (
            <DataLoadingState label="Loading controls..." variant="list" rows={3} />
          ) : (
            filtered.map(c => {
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
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      openControl360(c);
                    }}
                    aria-label={`Open Control 360 for ${c.controlId}`}
                    className="inline-flex min-h-9 items-center space-x-1 rounded-lg px-2 font-bold text-brand-600 transition hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 active:scale-[0.98]"
                  >
                    <span>Control 360°</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
          )}
        </div>

        {/* Right Detail: Control 360 (7 cols) */}
        <div ref={control360Ref} className="scroll-mt-24 lg:col-span-7">
          {controlLoading ? (
            <DataLoadingState label="Loading control profile..." variant="profile" className="min-h-[220px]" />
          ) : selectedControl ? (
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

              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Related Risk Mapping
                </h3>
                {selectedControl.risks?.length > 0 ? (
                  <div className="space-y-2">
                    {selectedControl.risks.map((mapping: any) => (
                      <div
                        key={mapping.id || mapping.riskId}
                        className="rounded-xl border border-brand-100 bg-brand-50/40 p-3.5 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md border border-brand-200 bg-white px-2 py-0.5 font-mono text-[10px] font-black text-brand-700">
                            {mapping.risk?.riskId || 'Risk'}
                          </span>
                          <span className="font-bold text-slate-900">
                            {mapping.risk?.name || 'Related risk'}
                          </span>
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500">
                          Persisted in ControlRiskMapping · {mapping.risk?.category || 'Category not recorded'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
                    No related risk is mapped to this control. This control is not yet a complete RCM relationship.
                  </div>
                )}
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[26px] bg-white shadow-2xl animate-in zoom-in-95 duration-100 sm:max-h-[92vh] sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4 py-4 sm:px-6">
              <h3 className="font-bold text-base text-slate-900">Register Control Master</h3>
              <button
                onClick={() => setNewControlModal(false)}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleCreate}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4 text-xs sm:px-6 sm:py-5"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              {saveError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700">
                  {saveError}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">Control ID</label>
                  <input
                    type="text"
                    placeholder="Auto-generated if blank"
                    value={formData.controlId}
                    onChange={e => setFormData({ ...formData, controlId: e.target.value })}
                    className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">Frequency *</label>
                  <select
                    required
                    value={formData.frequency}
                    onChange={e => setFormData({ ...formData, frequency: e.target.value })}
                    className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
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
                <label className="block text-slate-700 font-bold mb-1.5">Business Process *</label>
                <select
                  required
                  value={formData.processId}
                  onChange={e => {
                    setFormData({ ...formData, processId: e.target.value, riskId: '' });
                    setCreatingRelatedRisk(false);
                    setRiskSaveError('');
                  }}
                  className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
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

              <div className="space-y-2">
                <label className="block text-slate-700 font-bold">
                  Related Risk <span className="text-rose-600">*</span>
                </label>
                <select
                  required
                  value={formData.riskId}
                  onChange={e => setFormData({ ...formData, riskId: e.target.value })}
                  className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                >
                  <option value="" disabled>
                    {availableRisks.length > 0
                      ? 'Select a related risk'
                      : 'No risk registered for this process'}
                  </option>
                  {availableRisks.map(risk => (
                    <option key={risk.id} value={risk.id}>
                      {risk.riskId} — {risk.name}
                    </option>
                  ))}
                </select>

                <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-700">
                      Risk mapping is required for a new Control Master.
                    </p>
                    <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                      Saving the control will persist the ControlRiskMapping record and make it available in RCM.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingRelatedRisk(current => !current);
                      setRiskSaveError('');
                    }}
                    className="h-9 shrink-0 rounded-lg border border-brand-200 bg-white px-3 text-[10px] font-black text-brand-700 transition hover:bg-brand-50"
                  >
                    {creatingRelatedRisk ? 'Close Risk Form' : 'Create Related Risk'}
                  </button>
                </div>

                {creatingRelatedRisk && (
                  <div className="space-y-3 rounded-2xl border border-brand-200 bg-brand-50/40 p-3.5">
                    <div>
                      <div className="text-[11px] font-black text-slate-900">Quick Related Risk</div>
                      <div className="mt-0.5 text-[10px] leading-4 text-slate-500">
                        The risk is registered against the selected Business Process and automatically selected for this control.
                      </div>
                    </div>

                    {riskSaveError && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[10px] text-rose-700">
                        {riskSaveError}
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[10px] font-bold text-slate-600">Risk Name *</label>
                        <input
                          type="text"
                          value={riskDraft.name}
                          onChange={e => setRiskDraft({ ...riskDraft, name: e.target.value })}
                          placeholder="Describe the risk event"
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-bold text-slate-600">Risk Category *</label>
                        <select
                          value={riskDraft.category}
                          onChange={e => setRiskDraft({ ...riskDraft, category: e.target.value })}
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                        >
                          <option value="Financial Reporting">Financial Reporting</option>
                          <option value="Operational">Operational</option>
                          <option value="Compliance">Compliance</option>
                          <option value="Technology">Technology</option>
                          <option value="Cybersecurity">Cybersecurity</option>
                          <option value="Strategic">Strategic</option>
                          <option value="Fraud">Fraud</option>
                          <option value="Third Party">Third Party</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-slate-600">Risk Owner *</label>
                      <input
                        type="text"
                        value={riskDraft.ownerName}
                        onChange={e => setRiskDraft({ ...riskDraft, ownerName: e.target.value })}
                        placeholder="Accountable risk owner"
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-slate-600">Cause *</label>
                      <textarea
                        rows={2}
                        value={riskDraft.cause}
                        onChange={e => setRiskDraft({ ...riskDraft, cause: e.target.value })}
                        placeholder="Primary cause or condition"
                        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs leading-4 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-slate-600">Risk Event *</label>
                      <textarea
                        rows={2}
                        value={riskDraft.event}
                        onChange={e => setRiskDraft({ ...riskDraft, event: e.target.value })}
                        placeholder="What could go wrong?"
                        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs leading-4 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-slate-600">Impact *</label>
                      <textarea
                        rows={2}
                        value={riskDraft.impact}
                        onChange={e => setRiskDraft({ ...riskDraft, impact: e.target.value })}
                        placeholder="Potential consequence"
                        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs leading-4 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[10px] font-bold text-slate-600">Likelihood</label>
                        <select
                          value={riskDraft.inherentLikelihood}
                          onChange={e => setRiskDraft({ ...riskDraft, inherentLikelihood: Number(e.target.value) })}
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-brand-400"
                        >
                          <option value={0}>Not Assessed</option>
                          {[1, 2, 3, 4, 5].map(value => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-bold text-slate-600">Impact Rating</label>
                        <select
                          value={riskDraft.inherentImpact}
                          onChange={e => setRiskDraft({ ...riskDraft, inherentImpact: Number(e.target.value) })}
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-brand-400"
                        >
                          <option value={0}>Not Assessed</option>
                          {[1, 2, 3, 4, 5].map(value => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={
                        riskSaving ||
                        !riskDraft.name.trim() ||
                        !riskDraft.ownerName.trim() ||
                        !riskDraft.cause.trim() ||
                        !riskDraft.event.trim() ||
                        !riskDraft.impact.trim()
                      }
                      onClick={handleCreateRelatedRisk}
                      className="h-10 w-full rounded-xl bg-brand-600 px-4 text-xs font-black text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {riskSaving ? 'Creating Related Risk…' : 'Create & Select Related Risk'}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1.5">Control Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Daily Bank Statement Reconciliation"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1.5">Control Description *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Describe control activities, criteria, and execution mechanism..."
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="min-h-[112px] w-full min-w-0 resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-5 text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1.5">Control Objective *</label>
                <input
                  type="text"
                  required
                  placeholder="State the specific risk/control objective"
                  value={formData.objective}
                  onChange={e => setFormData({ ...formData, objective: e.target.value })}
                  className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1.5">Control Owner *</label>
                <input
                  type="text"
                  required
                  placeholder="Enter accountable control owner"
                  value={formData.controlOwner}
                  onChange={e => setFormData({ ...formData, controlOwner: e.target.value })}
                  className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">Type</label>
                  <select
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                    className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                  >
                    <option value="Preventive">Preventive</option>
                    <option value="Detective">Detective</option>
                    <option value="Corrective">Corrective</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">Nature</label>
                  <select
                    value={formData.nature}
                    onChange={e => setFormData({ ...formData, nature: e.target.value })}
                    className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                  >
                    <option value="Manual">Manual</option>
                    <option value="IT Dependent Manual">IT Dependent Manual</option>
                    <option value="Automated">Automated</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
                <label className="flex min-w-0 cursor-pointer items-center gap-2.5 font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.isKeyControl}
                    onChange={e => setFormData({ ...formData, isKeyControl: e.target.checked })}
                    className="h-5 w-5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>Is Key Control?</span>
                </label>

                <label className="flex min-w-0 cursor-pointer items-center gap-2.5 font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.isIcofrKey}
                    onChange={e => setFormData({ ...formData, isIcofrKey: e.target.checked })}
                    className="h-5 w-5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>ICOFR Key Control</span>
                </label>
              </div>

              <div className="sticky bottom-0 -mx-4 mt-5 flex flex-col-reverse gap-2 border-t border-slate-100 bg-white/95 px-4 pb-1 pt-3 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-end sm:px-6">
                <button
                  type="button"
                  onClick={() => setNewControlModal(false)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 sm:w-auto"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || processes.length === 0}
                  className="h-11 w-full rounded-xl bg-brand-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
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
