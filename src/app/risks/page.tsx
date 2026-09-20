'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Plus,
  Search,
  Filter,
  ArrowRight,
  Shield,
  Layers,
  Sparkles,
  CheckCircle2,
  TrendingDown,
  X,
  FileSpreadsheet
} from 'lucide-react';
import { getRiskBadgeClasses } from '@/lib/utils';
import { jsonTransaction } from '@/lib/client-transaction';
import { jsonRead } from '@/lib/client-read';
import { EMPTY_PAGINATION, RegisterPager, type PaginationMeta } from '@/components/common/RegisterPager';

export default function RisksPage() {
  const [risks, setRisks] = useState<any[]>([]);
  const [processes, setProcesses] = useState<any[]>([]);
  const [organizationUnits, setOrganizationUnits] = useState<any[]>([]);
  const [selectedRisk, setSelectedRisk] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [selectedOrgUnit, setSelectedOrgUnit] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'register' | 'inherent_heatmap' | 'residual_heatmap'>('register');
  const [newRiskModal, setNewRiskModal] = useState(false);
  const [heatmapRisks, setHeatmapRisks] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const [pageLoading, setPageLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    riskId: '',
    name: '',
    cause: '',
    event: '',
    impact: '',
    category: 'Operational',
    processId: '',
    ownerName: '',
    inherentLikelihood: 0,
    inherentImpact: 0
  });

  const loadReferenceData = async () => {
    try {
      const [processData, heatmapData] = await Promise.all([
        jsonRead<any>('/api/processes?mode=options', { dedupe: false }),
        jsonRead<any>('/api/risks?mode=options', { dedupe: false })
      ]);

      const nextProcesses = Array.isArray(processData.processes) ? processData.processes : [];
      const nextOrganizationUnits = Array.isArray(processData.organization?.organizationUnits)
        ? processData.organization.organizationUnits
        : [];

      setProcesses(nextProcesses);
      setOrganizationUnits(nextOrganizationUnits);
      setHeatmapRisks(Array.isArray(heatmapData.risks) ? heatmapData.risks : []);

      setFormData(prev => ({
        ...prev,
        processId:
          prev.processId && nextProcesses.some((process: any) => process.id === prev.processId)
            ? prev.processId
            : nextProcesses[0]?.id || ''
      }));
    } catch (error) {
      console.error(error);
    }
  };

  const loadRisks = async (targetPage = page) => {
    setPageLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        pageSize: '50'
      });
      if (search.trim()) params.set('search', search.trim());
      if (selectedOrgUnit !== 'ALL') params.set('orgUnitId', selectedOrgUnit);

      const riskData = await jsonRead<any>(
        '/api/risks?' + params.toString(),
        { dedupe: false }
      );
      const nextRisks = Array.isArray(riskData.risks) ? riskData.risks : [];
      setRisks(nextRisks);
      setPagination(riskData.pagination || EMPTY_PAGINATION);
      setPage(targetPage);
      setSelectedRisk(current =>
        current && nextRisks.some((item: any) => item.id === current.id)
          ? current
          : nextRisks[0] || null
      );
    } catch (error) {
      console.error(error);
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    void loadReferenceData();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRisks(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, selectedOrgUnit]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await jsonTransaction('/api/risks', formData);
      setNewRiskModal(false);
      await Promise.all([loadRisks(page), loadReferenceData()]);
    } catch (e) {
      console.error(e);
    }
  };

  const processById = new Map(processes.map(process => [process.id, process]));
  const unitById = new Map(organizationUnits.map(unit => [unit.id, unit]));
  const selectedRiskProcess = selectedRisk ? processById.get(selectedRisk.processId) : null;

  const filtered = risks;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-amber-600 uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4" />
            <span>Risk Universe (MANAGE)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Enterprise Risk Register & Heatmaps
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Structured Cause → Event → Impact risk articulation. Interactive 5x5 Likelihood × Impact matrices.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setNewRiskModal(true)}
            className="inline-flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Identify New Risk</span>
          </button>
        </div>
      </div>

      {/* View Switcher & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by Risk ID, Category, or Title..."
            className="w-full text-xs pl-9 pr-4 py-2 rounded-lg bg-slate-100 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>

        <select
          value={selectedOrgUnit}
          onChange={e => setSelectedOrgUnit(e.target.value)}
          className="text-xs px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="ALL">All Organization Units</option>
          {organizationUnits.filter(unit => unit.status === 'Active').map(unit => (
            <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>
          ))}
        </select>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('register')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'register'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Risk Register ({pagination.total})
          </button>
          <button
            onClick={() => setActiveTab('inherent_heatmap')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'inherent_heatmap'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            5×5 Inherent Heatmap
          </button>
          <button
            onClick={() => setActiveTab('residual_heatmap')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'residual_heatmap'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            5×5 Residual Heatmap
          </button>
        </div>
      </div>

      {activeTab === 'register' && (
        <RegisterPager
          pagination={pagination}
          loading={pageLoading}
          onPageChange={nextPage => void loadRisks(nextPage)}
        />
      )}

      {/* Main Content Area */}
      {activeTab === 'register' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Risk List (5 cols) */}
          <div className="lg:col-span-5 space-y-3">
            {filtered.map(r => {
              const isSelected = selectedRisk?.id === r.id;
              const badge = getRiskBadgeClasses(r.inherentRating);
              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedRisk(r)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-50/50 border-amber-500 shadow-md ring-1 ring-amber-400'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                          {r.riskId}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {r.category}
                        </span>
                      </div>
                      <h3 className="font-bold text-sm text-slate-900 mt-1.5">
                        {r.name}
                      </h3>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}
                    >
                      Score: {r.inherentScore} ({r.inherentRating})
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">
                    {r.description}
                  </p>

                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      Process: <strong>{r.process?.name || 'Unassigned'}</strong>
                      {processById.get(r.processId)?.orgUnit?.name ? ` · ${processById.get(r.processId)?.orgUnit?.name}` : ''}
                    </span>
                    <span className="text-emerald-700 font-semibold flex items-center space-x-1">
                      <TrendingDown className="w-3.5 h-3.5" />
                      <span>Residual: {r.residualScore} ({r.residualRating})</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Risk 360 View (7 cols) */}
          <div className="lg:col-span-7">
            {selectedRisk ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-sm font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
                        {selectedRisk.riskId}
                      </span>
                      <span className="text-xs text-slate-500 font-semibold">
                        Category: {selectedRisk.category}
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
                    {selectedRisk.name}
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                      Process: <strong className="text-slate-700">{selectedRiskProcess?.name || selectedRisk.process?.name || 'Unassigned'}</strong>
                    </span>
                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                      Organization Unit: <strong className="text-slate-700">{selectedRiskProcess?.orgUnit?.name || 'Not assigned'}</strong>
                    </span>
                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                      Legal Entity: <strong className="text-slate-700">{selectedRiskProcess?.legalEntity?.name || 'Not assigned'}</strong>
                    </span>
                  </div>
                </div>

                {/* Structured Cause - Event - Impact (Section 29) */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Cause → Event → Impact Syntax (Section 29)
                  </h3>

                  <div className="space-y-2 text-xs">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-slate-500 font-bold uppercase text-[10px]">Due to Cause:</span>
                      <p className="text-slate-800 font-medium mt-0.5">{selectedRisk.cause}</p>
                    </div>

                    <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-200">
                      <span className="text-amber-700 font-bold uppercase text-[10px]">There is a Risk that (Event):</span>
                      <p className="text-amber-900 font-medium mt-0.5">{selectedRisk.event}</p>
                    </div>

                    <div className="p-3 bg-rose-50/60 rounded-lg border border-rose-200">
                      <span className="text-rose-700 font-bold uppercase text-[10px]">Resulting in (Impact):</span>
                      <p className="text-rose-900 font-medium mt-0.5">{selectedRisk.impact}</p>
                    </div>
                  </div>
                </div>

                {/* Inherent vs Residual Score Grid (Section 31 & 37) */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-rose-50/80 border border-rose-200 text-center space-y-1">
                    <span className="text-[10px] uppercase font-bold text-rose-600 tracking-wider">
                      Inherent Risk
                    </span>
                    <div className="text-3xl font-black text-rose-800">{selectedRisk.inherentScore}</div>
                    <div className="text-xs font-bold text-rose-700">{selectedRisk.inherentRating} Rating</div>
                    <div className="text-[10px] text-rose-600">
                      Likelihood {selectedRisk.inherentLikelihood} × Impact {selectedRisk.inherentImpact}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 text-center space-y-1">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">
                      Residual Risk (Post-Control)
                    </span>
                    <div className="text-3xl font-black text-emerald-800">{selectedRisk.residualScore}</div>
                    <div className="text-xs font-bold text-emerald-700">{selectedRisk.residualRating} Rating</div>
                    <div className="text-[10px] text-emerald-600">
                      Treatment: {selectedRisk.riskTreatment}
                    </div>
                  </div>
                </div>

                {/* Mitigating Controls in Library */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Linked Mitigating Controls (Single Control Library)
                  </h3>
                  {selectedRisk.controls?.length > 0 ? (
                    selectedRisk.controls.map((m: any) => (
                      <div
                        key={m.id}
                        className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center space-x-2.5">
                          <Shield className="w-4 h-4 text-brand-600" />
                          <div>
                            <div className="font-bold text-slate-900">{m.control?.controlId}: {m.control?.name}</div>
                            <div className="text-[11px] text-slate-500">
                              Type: {m.control?.type} • Nature: {m.control?.nature}
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {m.control?.overallHealth || 'Not Assessed'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>Warning: No active control mapped to this risk. Control gap identified.</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-xs">
                Select a risk from the register to inspect its 360° profile.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 5x5 Heatmap Matrix */
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                5×5 {activeTab === 'inherent_heatmap' ? 'Inherent' : 'Residual'} Risk Matrix
              </h2>
              <p className="text-xs text-slate-500">
                Likelihood (Vertical Axis, 1–5) × Impact (Horizontal Axis, 1–5). Click on cells to inspect mapped risks.
              </p>
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300"></span>
              <span className="text-slate-500 text-[11px]">Low (1-4)</span>
              <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300"></span>
              <span className="text-slate-500 text-[11px]">Medium (5-9)</span>
              <span className="w-3 h-3 rounded bg-rose-100 border border-rose-300"></span>
              <span className="text-slate-500 text-[11px]">High (10-14)</span>
              <span className="w-3 h-3 rounded bg-red-200 border border-red-400"></span>
              <span className="text-slate-500 text-[11px]">Critical (15-25)</span>
            </div>
          </div>

          <div className="max-w-xl mx-auto py-4">
            <div className="grid grid-cols-5 gap-2">
              {[5, 4, 3, 2, 1].map(l =>
                [1, 2, 3, 4, 5].map(i => {
                  const score = l * i;
                  let bg = 'bg-emerald-50 border-emerald-200 text-emerald-800';
                  if (score >= 15) bg = 'bg-red-100 border-red-300 text-red-900 font-black';
                  else if (score >= 10) bg = 'bg-rose-100 border-rose-200 text-rose-800 font-bold';
                  else if (score >= 5) bg = 'bg-amber-50 border-amber-200 text-amber-800';


                  return (
                    <div
                      key={`${l}-${i}`}
                      className={`h-20 rounded-xl border p-2 flex flex-col justify-between transition-all hover:scale-105 cursor-pointer shadow-sm ${bg}`}
                    >
                      <div className="flex justify-between text-[10px] opacity-70">
                        <span>L{l}</span>
                        <span>I{i}</span>
                      </div>
                      <div className="text-center font-extrabold text-sm">{score}</div>
                      <div className="text-center text-[9px] opacity-60">
                        {heatmapRisks.filter((risk: any) => {
                          const likelihood = activeTab === 'inherent_heatmap' ? risk.inherentLikelihood : risk.residualLikelihood;
                          const impact = activeTab === 'inherent_heatmap' ? risk.inherentImpact : risk.residualImpact;
                          return likelihood === l && impact === i;
                        }).length} risk(s)
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex justify-between text-xs font-bold text-slate-500 mt-3 px-2">
              <span>Impact 1 (Insignificant)</span>
              <span>Impact 5 (Catastrophic)</span>
            </div>
          </div>
        </div>
      )}

      {/* Identify New Risk Modal */}
      {newRiskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900">Identify New Risk Master</h3>
              <button
                onClick={() => setNewRiskModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Risk ID</label>
                  <input
                    type="text"
                    placeholder="Auto-generated if blank"
                    value={formData.riskId}
                    onChange={e => setFormData({ ...formData, riskId: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Risk Category *</label>
                  <select
                    required
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="Operational">Operational</option>
                    <option value="Financial Reporting">Financial Reporting</option>
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
                <label className="block text-slate-700 font-bold mb-1">Business Process *</label>
                <select
                  required
                  value={formData.processId}
                  onChange={e => setFormData({ ...formData, processId: e.target.value })}
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
                <label className="block text-slate-700 font-bold mb-1">Risk Owner *</label>
                <input
                  type="text"
                  required
                  placeholder="Enter accountable risk owner"
                  value={formData.ownerName}
                  onChange={e => setFormData({ ...formData, ownerName: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Risk Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Unreconciled FX Hedging Settlement"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Due to Cause: *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Manual trade ticket entry without automated feed validation"
                  value={formData.cause}
                  onChange={e => setFormData({ ...formData, cause: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">There is a Risk that (Event): *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Discrepant currency rates are executed"
                  value={formData.event}
                  onChange={e => setFormData({ ...formData, event: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Resulting in (Impact): *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Direct forex variance loss and inaccurate quarterly revaluation"
                  value={formData.impact}
                  onChange={e => setFormData({ ...formData, impact: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Inherent Likelihood (1-5)</label>
                  <select
                    value={formData.inherentLikelihood}
                    onChange={e => setFormData({ ...formData, inherentLikelihood: parseInt(e.target.value) })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value={0} disabled>Select level</option>
                    {[1, 2, 3, 4, 5].map(v => (
                      <option key={v} value={v}>Level {v}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Inherent Impact (1-5)</label>
                  <select
                    value={formData.inherentImpact}
                    onChange={e => setFormData({ ...formData, inherentImpact: parseInt(e.target.value) })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value={0} disabled>Select level</option>
                    {[1, 2, 3, 4, 5].map(v => (
                      <option key={v} value={v}>Level {v}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setNewRiskModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processes.length === 0}
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Risk Master
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
