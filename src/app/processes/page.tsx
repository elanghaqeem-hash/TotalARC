'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Layers,
  Plus,
  Search,
  Filter,
  ArrowRight,
  Shield,
  AlertTriangle,
  FileSpreadsheet,
  Sparkles,
  CheckCircle2,
  GitBranch,
  Target,
  Clock,
  X
} from 'lucide-react';
import { AIChatDrawer } from '@/components/common/AIChatDrawer';
import { useRole } from '@/context/RoleContext';

export default function ProcessesPage() {
  const { currentUser } = useRole();
  const canManageProcesses = currentUser?.role === 'Admin' || currentUser?.role === 'ProcessOwner';
  const [processes, setProcesses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [legalEntities, setLegalEntities] = useState<any[]>([]);
  const [organizationUnits, setOrganizationUnits] = useState<any[]>([]);
  const [organizationUsers, setOrganizationUsers] = useState<any[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedOrgUnit, setSelectedOrgUnit] = useState('ALL');
  const [formError, setFormError] = useState('');
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [newProcessModal, setNewProcessModal] = useState(false);

  // New process form state
  const [formData, setFormData] = useState({
    processId: '',
    name: '',
    categoryId: '',
    legalEntityId: '',
    orgUnitId: '',
    ownerUserId: '',
    ownerName: '',
    ownerEmail: '',
    criticality: 'Critical',
    classification: 'Core',
    isIcofrRelevant: true,
    description: ''
  });

  const loadProcesses = () => {
    fetch('/api/processes')
      .then(res => res.json())
      .then(data => {
        const nextProcesses = Array.isArray(data.processes) ? data.processes : [];
        const nextCategories = Array.isArray(data.categories) ? data.categories : [];
        const nextEntities = Array.isArray(data.organization?.legalEntities) ? data.organization.legalEntities : [];
        const nextUnits = Array.isArray(data.organization?.organizationUnits) ? data.organization.organizationUnits : [];
        const nextUsers = Array.isArray(data.organization?.users) ? data.organization.users : [];

        setProcesses(nextProcesses);
        setCategories(nextCategories);
        setLegalEntities(nextEntities);
        setOrganizationUnits(nextUnits);
        setOrganizationUsers(nextUsers);

        if (nextProcesses.length > 0 && !selectedProcess) {
          setSelectedProcess(nextProcesses[0]);
        }

        setFormData(prev => {
          const currentUnit = nextUnits.find((unit: any) => unit.id === prev.orgUnitId && unit.status === 'Active');
          const defaultUnit = currentUnit || nextUnits.find((unit: any) => unit.status === 'Active') || null;
          return {
            ...prev,
            categoryId:
              prev.categoryId && nextCategories.some((category: any) => category.id === prev.categoryId)
                ? prev.categoryId
                : nextCategories[0]?.id || '',
            orgUnitId: defaultUnit?.id || '',
            legalEntityId: defaultUnit?.legalEntityId || prev.legalEntityId || ''
          };
        });
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadProcesses();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    try {
      const res = await fetch('/api/processes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Unable to register business process.');
      }

      setNewProcessModal(false);
      setSelectedProcess(payload);
      setFormData(prev => ({
        ...prev,
        processId: '',
        name: '',
        ownerUserId: '',
        ownerName: '',
        ownerEmail: '',
        description: ''
      }));
      loadProcesses();
    } catch (createError) {
      setFormError(createError instanceof Error ? createError.message : 'Unable to register business process.');
    }
  };

  const filtered = processes.filter(p => {
    const matchCat = selectedCategory === 'ALL' || p.categoryId === selectedCategory;
    const matchOrg = selectedOrgUnit === 'ALL' || p.orgUnitId === selectedOrgUnit;
    const term = search.toLowerCase();
    const matchSearch =
      p.name.toLowerCase().includes(term) ||
      p.processId.toLowerCase().includes(term) ||
      String(p.ownerName || '').toLowerCase().includes(term) ||
      String(p.orgUnit?.name || '').toLowerCase().includes(term);
    return matchCat && matchOrg && matchSearch;
  });

  const activeUnits = organizationUnits.filter(unit => unit.status === 'Active');
  const activeUsers = organizationUsers.filter(user => user.active);
  const unitsForEntity = formData.legalEntityId
    ? activeUnits.filter(unit => !unit.legalEntityId || unit.legalEntityId === formData.legalEntityId)
    : activeUnits;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-brand-600 uppercase tracking-wider">
            <Layers className="w-4 h-4" />
            <span>Process Architecture & BPM (MANAGE)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Enterprise Business Process Register
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Levels 0–5 Hierarchical Process Model. Single source of truth connecting activities, risks, and controls.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setAiDrawerOpen(true)}
            className="inline-flex items-center space-x-2 bg-gradient-to-r from-brand-600 to-sky-600 hover:from-brand-700 hover:to-sky-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm shadow-brand-500/20 transition-all hover:scale-[1.02]"
          >
            <Sparkles className="w-4 h-4 text-sky-200" />
            <span>AI Process Analysis</span>
          </button>

          {canManageProcesses && (
            <button
              onClick={() => {
                setFormError('');
                setNewProcessModal(true);
              }}
              className="inline-flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Register Process</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by Process ID, Name, or Owner..."
            className="w-full text-xs pl-9 pr-4 py-2 rounded-lg bg-slate-100 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedOrgUnit}
            onChange={e => setSelectedOrgUnit(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="ALL">All Organization Units</option>
            {activeUnits.map(unit => (
              <option key={unit.id} value={unit.id}>
                {unit.code} · {unit.name}
              </option>
            ))}
          </select>
          <div className="flex items-center space-x-2 overflow-x-auto">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedCategory === 'ALL'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Categories ({processes.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* Split View: List on Left, Process 360 on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left List: 5 cols */}
        <div className="lg:col-span-5 space-y-3">
          {filtered.map(proc => {
            const isSelected = selectedProcess?.id === proc.id;
            return (
              <div
                key={proc.id}
                onClick={() => setSelectedProcess(proc)}
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
                        {proc.processId}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          proc.criticality === 'Critical'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {proc.criticality}
                      </span>
                      {proc.isIcofrRelevant && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                          ICOFR
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 mt-1.5">
                      {proc.name}
                    </h3>
                  </div>

                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {proc.status}
                  </span>
                </div>

                <p className="text-xs text-slate-500 mt-2 line-clamp-2">
                  {proc.description}
                </p>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                  <div className="min-w-0">
                    <div>Owner: <strong>{proc.ownerName}</strong></div>
                    <div className="truncate text-[10px] text-slate-400">
                      {proc.orgUnit?.name || 'Organization unit not assigned'}
                    </div>
                  </div>
                  <span className="text-brand-600 font-bold flex items-center space-x-1 shrink-0">
                    <span>Inspect 360°</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Detail: Process 360 (7 cols) */}
        <div className="lg:col-span-7">
          {selectedProcess ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
              {/* Process Title & Metadata */}
              <div className="border-b border-slate-100 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-sm font-bold text-brand-700 bg-brand-50 px-2.5 py-1 rounded border border-brand-200">
                      {selectedProcess.processId}
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">
                      Level {selectedProcess.level} Business Process
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Link
                      href="/rcm"
                      className="text-xs font-bold text-brand-600 hover:text-brand-700 bg-brand-50 px-3 py-1.5 rounded-lg border border-brand-200 flex items-center space-x-1"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>View in RCM</span>
                    </Link>
                  </div>
                </div>

                <h2 className="text-xl font-black text-slate-900 mt-2">
                  {selectedProcess.name}
                </h2>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {selectedProcess.description}
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                    <div className="text-[9px] font-bold uppercase text-slate-400">Legal Entity</div>
                    <div className="mt-1 text-[11px] font-bold text-slate-700">{selectedProcess.legalEntity?.name || 'Not assigned'}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                    <div className="text-[9px] font-bold uppercase text-slate-400">Organization Unit</div>
                    <div className="mt-1 text-[11px] font-bold text-slate-700">{selectedProcess.orgUnit?.name || 'Not assigned'}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                    <div className="text-[9px] font-bold uppercase text-slate-400">Process Owner</div>
                    <div className="mt-1 text-[11px] font-bold text-slate-700">{selectedProcess.ownerName}</div>
                    <div className="text-[9px] text-slate-400">{selectedProcess.ownerEmail || ''}</div>
                  </div>
                </div>
              </div>

              {/* Objectives & Strategic KPIs (Section 22) */}
              {selectedProcess.objectives?.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                    <Target className="w-3.5 h-3.5 text-brand-600" />
                    <span>Process Objectives & Target Metrics (Section 22)</span>
                  </h3>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                    <div>
                      <span className="text-slate-500 font-medium">Core Objective:</span>
                      <p className="text-slate-800 font-semibold mt-0.5">
                        {selectedProcess.objectives[0].objective}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-[11px]">
                      <div>
                        <span className="text-slate-400 font-medium">Target KPI:</span>
                        <div className="font-bold text-slate-700">
                          {selectedProcess.objectives[0].kpi || 'Not provided'}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Key Risk Indicator (KRI):</span>
                        <div className="font-bold text-rose-700">
                          {selectedProcess.objectives[0].kri || 'Not provided'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SIPOC Builder (Section 24) */}
              {selectedProcess.sipoc && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    SIPOC Model (Section 24)
                  </h3>
                  <div className="grid grid-cols-5 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Supplier</div>
                      <div className="text-[11px] font-medium text-slate-800 mt-1">{selectedProcess.sipoc.suppliers}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Input</div>
                      <div className="text-[11px] font-medium text-slate-800 mt-1">{selectedProcess.sipoc.inputs}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-brand-50 border border-brand-200">
                      <div className="text-[10px] font-bold text-brand-700 uppercase">Process</div>
                      <div className="text-[11px] font-medium text-brand-900 mt-1">{selectedProcess.sipoc.processSteps}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Output</div>
                      <div className="text-[11px] font-medium text-slate-800 mt-1">{selectedProcess.sipoc.outputs}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Customer</div>
                      <div className="text-[11px] font-medium text-slate-800 mt-1">{selectedProcess.sipoc.customers}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Activity Register (Section 26) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Activity Register ({selectedProcess.activities?.length || 0} Steps)
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">BPMN-Compatible Data</span>
                </div>

                <div className="space-y-2">
                  {selectedProcess.activities?.map((act: any) => (
                    <div
                      key={act.id}
                      className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-slate-50 text-xs flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center">
                          {act.orderIndex}
                        </span>
                        <div>
                          <div className="font-bold text-slate-900">{act.name}</div>
                          <div className="text-[11px] text-slate-500">
                            Performer: {act.performer} • System: {act.systemUsed}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          act.nature === 'Automated'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {act.nature}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-xs">
              Select a process from the register to inspect its 360° profile.
            </div>
          )}
        </div>
      </div>

      {/* Register New Process Modal */}
      {newProcessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900">Register Business Process</h3>
              <button
                onClick={() => setNewProcessModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              {formError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Process Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Treasury Cash Concentration"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Process ID</label>
                  <input
                    type="text"
                    placeholder="PRC-TREAS-002"
                    value={formData.processId}
                    onChange={e => setFormData({ ...formData, processId: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Category *</label>
                  <select
                    value={formData.categoryId}
                    onChange={e => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Legal Entity</label>
                  <select
                    value={formData.legalEntityId}
                    onChange={e => {
                      const legalEntityId = e.target.value;
                      const currentUnit = organizationUnits.find(unit => unit.id === formData.orgUnitId);
                      setFormData({
                        ...formData,
                        legalEntityId,
                        orgUnitId: currentUnit && (!legalEntityId || !currentUnit.legalEntityId || currentUnit.legalEntityId === legalEntityId)
                          ? formData.orgUnitId
                          : ''
                      });
                    }}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="">Not assigned</option>
                    {legalEntities.filter(entity => entity.status === 'Active').map(entity => (
                      <option key={entity.id} value={entity.id}>{entity.code} · {entity.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Organization Unit {activeUnits.length > 0 ? '*' : ''}
                  </label>
                  <select
                    required={activeUnits.length > 0}
                    value={formData.orgUnitId}
                    onChange={e => {
                      const unit = organizationUnits.find(item => item.id === e.target.value);
                      setFormData({
                        ...formData,
                        orgUnitId: e.target.value,
                        legalEntityId: unit?.legalEntityId || formData.legalEntityId
                      });
                    }}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="">Select organization unit</option>
                    {unitsForEntity.map(unit => (
                      <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Process Owner *</label>
                  {activeUsers.length > 0 ? (
                    <select
                      required
                      value={formData.ownerUserId}
                      onChange={e => {
                        const user = organizationUsers.find(item => item.id === e.target.value);
                        setFormData({
                          ...formData,
                          ownerUserId: e.target.value,
                          ownerName: user?.name || '',
                          ownerEmail: user?.email || ''
                        });
                      }}
                      className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    >
                      <option value="">Select process owner</option>
                      {activeUsers.map(user => (
                        <option key={user.id} value={user.id}>{user.name} · {user.role}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      placeholder="Enter process owner name"
                      value={formData.ownerName}
                      onChange={e => setFormData({ ...formData, ownerName: e.target.value })}
                      className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Criticality</label>
                  <select
                    value={formData.criticality}
                    onChange={e => setFormData({ ...formData, criticality: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Description</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Summarize process purpose, boundaries, and scope..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setNewProcessModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold shadow-sm"
                >
                  Save Process Master
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Process Analysis Drawer */}
      <AIChatDrawer isOpen={aiDrawerOpen} onClose={() => setAiDrawerOpen(false)} />
    </div>
  );
}
