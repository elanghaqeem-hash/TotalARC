'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileSpreadsheet,
  Download,
  Search,
  Filter,
  Layers,
  AlertTriangle,
  Shield,
  BadgeCheck,
  ChevronDown,
  ArrowUpDown,
  FileCheck2,
  Cpu,
  Eye,
  SlidersHorizontal
} from 'lucide-react';
import { getRiskBadgeClasses, getHealthBadgeClasses } from '@/lib/utils';

export default function RCMWorkspacePage() {
  const [rcmRows, setRcmRows] = useState<any[]>([]);
  const [organizationUnits, setOrganizationUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [selectedOrgUnit, setSelectedOrgUnit] = useState('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  useEffect(() => {
    fetch('/api/rcm')
      .then(res => res.json())
      .then(d => {
        setRcmRows(d.rcm || []);
        setOrganizationUnits(
          Array.isArray(d.organization?.organizationUnits)
            ? d.organization.organizationUnits
            : []
        );
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const unitById = new Map(organizationUnits.map(unit => [unit.id, unit]));

  const filtered = rcmRows.filter(row => {
    const unitName = unitById.get(row.orgUnitId)?.name || '';
    const matchSearch =
      row.processName?.toLowerCase().includes(search.toLowerCase()) ||
      row.riskName?.toLowerCase().includes(search.toLowerCase()) ||
      row.controlName?.toLowerCase().includes(search.toLowerCase()) ||
      row.controlId?.toLowerCase().includes(search.toLowerCase()) ||
      unitName.toLowerCase().includes(search.toLowerCase());
    const matchOrg = selectedOrgUnit === 'ALL' || row.orgUnitId === selectedOrgUnit;
    const baseMatch = matchSearch && matchOrg;

    if (filterType === 'KEY_ONLY') return baseMatch && row.isKeyControl;
    if (filterType === 'ICOFR_ONLY') return baseMatch && row.isIcofrKey;
    if (filterType === 'ISSUES_ONLY') return baseMatch && row.issueId;
    return baseMatch;
  });

  // Client CSV Export
  const exportToCSV = () => {
    const headers = [
      'Row',
      'Process ID',
      'Process Name',
      'Process Objective',
      'Risk ID',
      'Risk Name',
      'Risk Cause',
      'Risk Impact',
      'Inherent Score',
      'Control ID',
      'Control Name',
      'Control Owner',
      'Control Type',
      'Control Nature',
      'Frequency',
      'Key Control',
      'ToE Conclusion',
      'Residual Score',
      'Issue ID',
      'MAP Status'
    ];

    const rows = filtered.map(r => [
      r.rowNumber,
      `"${r.processId}"`,
      `"${r.processName}"`,
      `"${r.processObjective?.replace(/"/g, '""')}"`,
      `"${r.riskId}"`,
      `"${r.riskName?.replace(/"/g, '""')}"`,
      `"${r.riskCause?.replace(/"/g, '""')}"`,
      `"${r.riskImpact?.replace(/"/g, '""')}"`,
      `"${r.inherentScore} (${r.inherentRating})"`,
      `"${r.controlId}"`,
      `"${r.controlName?.replace(/"/g, '""')}"`,
      `"${r.controlOwner}"`,
      `"${r.controlType}"`,
      `"${r.controlNature}"`,
      `"${r.controlFrequency}"`,
      r.isKeyControl ? 'Yes' : 'No',
      `"${r.toeConclusion}"`,
      `"${r.residualScore} (${r.residualRating})"`,
      r.issueId || 'None',
      r.mapStatus || 'None'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Total_ARC_RCM_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-brand-600 uppercase tracking-wider">
            <FileSpreadsheet className="w-4 h-4" />
            <span>Dynamic RCM Workspace (MANAGE)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Enterprise Risk Control Matrix (RCM)
          </h1>
        </div>

        <div className="flex items-center space-x-3">
          {/* Switch View */}
          <div className="hidden sm:flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Spreadsheet Grid
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                viewMode === 'cards' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Card View (Mobile-First)
            </button>
          </div>

          <button
            onClick={exportToCSV}
            className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm shadow-emerald-500/20 transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Export RCM (CSV/Excel)</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
        <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.72fr)] 2xl:items-stretch">
          <div className="grid min-w-0 gap-2">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search process, risk, control, organization unit, or control ID"
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <select
              value={selectedOrgUnit}
              onChange={e => setSelectedOrgUnit(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600 outline-none transition focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
            >
              <option value="ALL">All Organization Units</option>
              {organizationUnits.filter(unit => unit.status === 'Active').map(unit => (
                <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 2xl:hidden">
              <Filter className="h-3.5 w-3.5" />
              Filter view
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {[
                {
                  key: 'ALL',
                  label: 'All Mappings',
                  count: rcmRows.length,
                  icon: Layers
                },
                {
                  key: 'KEY_ONLY',
                  label: 'Key Controls',
                  count: rcmRows.filter(row => row.isKeyControl).length,
                  icon: Shield
                },
                {
                  key: 'ICOFR_ONLY',
                  label: 'ICOFR Scope',
                  count: rcmRows.filter(row => row.isIcofrKey).length,
                  icon: FileCheck2
                },
                {
                  key: 'ISSUES_ONLY',
                  label: 'Remediation / MAP',
                  count: rcmRows.filter(row => row.issueId).length,
                  icon: BadgeCheck
                }
              ].map(option => {
                const Icon = option.icon;
                const active = filterType === option.key;

                return (
                  <button
                    key={option.key}
                    type="button"
                    title={option.label}
                    onClick={() => setFilterType(option.key)}
                    aria-pressed={active}
                    className={`group flex min-h-[58px] min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all ${
                      active
                        ? 'border-brand-600 bg-brand-600 text-white shadow-md shadow-sky-100'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-brand-200 hover:bg-brand-50/60 hover:text-brand-800'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        active
                          ? 'bg-white/15 text-white'
                          : 'bg-white text-slate-500 ring-1 ring-slate-200 group-hover:text-brand-700'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block whitespace-normal break-words text-[10px] font-bold leading-4 sm:text-[11px]">
                        {option.label}
                      </span>
                      <span className={`mt-0.5 block text-[9px] leading-3 ${active ? 'text-white/75' : 'text-slate-400'}`}>
                        {option.count} record{option.count === 1 ? '' : 's'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[10px] text-slate-500">
          <span>
            Showing <strong className="text-slate-700">{filtered.length}</strong> of <strong className="text-slate-700">{rcmRows.length}</strong> mappings
          </span>
          {(search || filterType !== 'ALL' || selectedOrgUnit !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFilterType('ALL');
                setSelectedOrgUnit('ALL');
              }}
              className="font-bold text-brand-700 transition hover:text-brand-800"
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      {/* SPREADSHEET GRID VIEW (Desktop) */}
      {viewMode === 'table' ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[750px] relative">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100/90 sticky top-0 z-20 border-b border-slate-200 text-[11px] font-bold text-slate-700 tracking-wider uppercase">
                <tr>
                  <th className="py-3 px-3 w-12 text-center border-r border-slate-200">#</th>
                  <th className="py-3 px-4 min-w-[140px] border-r border-slate-200 bg-slate-100">Process (L2)</th>
                  <th className="py-3 px-4 min-w-[180px] border-r border-slate-200">Process Objective</th>
                  <th className="py-3 px-4 min-w-[200px] border-r border-slate-200 bg-amber-50/50">Risk (Event & Impact)</th>
                  <th className="py-3 px-3 min-w-[100px] text-center border-r border-slate-200">Inherent</th>
                  <th className="py-3 px-4 min-w-[220px] border-r border-slate-200 bg-sky-50/50">Control Master</th>
                  <th className="py-3 px-3 min-w-[100px] border-r border-slate-200">Type & Nature</th>
                  <th className="py-3 px-3 min-w-[110px] text-center border-r border-slate-200">ToE Testing</th>
                  <th className="py-3 px-3 min-w-[90px] text-center border-r border-slate-200">Residual</th>
                  <th className="py-3 px-4 min-w-[200px] bg-emerald-50/50">Remediation / MAP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {filtered.map(row => {
                  const riskBadge = getRiskBadgeClasses(row.inherentRating);
                  const resBadge = getRiskBadgeClasses(row.residualRating);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 text-center font-mono text-slate-400 border-r border-slate-200">
                        {row.rowNumber}
                      </td>

                      {/* Process */}
                      <td className="py-3 px-4 border-r border-slate-200">
                        <div className="font-bold text-slate-900">{row.processName}</div>
                        <div className="text-[10px] font-mono text-brand-600">{row.processId}</div>
                        <div className="mt-1 text-[10px] text-slate-400">
                          {unitById.get(row.orgUnitId)?.name || 'Organization unit not assigned'}
                        </div>
                      </td>

                      {/* Objective */}
                      <td className="py-3 px-4 border-r border-slate-200 text-slate-600 leading-relaxed text-[11px]">
                        {row.processObjective}
                      </td>

                      {/* Risk */}
                      <td className="py-3 px-4 border-r border-slate-200 bg-amber-50/20">
                        <div className="font-bold text-slate-900">{row.riskName}</div>
                        <div className="text-[10px] font-mono text-amber-700">{row.riskId}</div>
                        <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          {row.riskEvent}
                        </div>
                      </td>

                      {/* Inherent Score */}
                      <td className="py-3 px-3 text-center border-r border-slate-200">
                        <span
                          className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${riskBadge.bg} ${riskBadge.text} ${riskBadge.border}`}
                        >
                          {row.inherentScore} ({row.inherentRating})
                        </span>
                      </td>

                      {/* Control */}
                      <td className="py-3 px-4 border-r border-slate-200 bg-sky-50/20">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-[10px] font-bold text-brand-700 bg-brand-100/70 px-1.5 py-0.5 rounded">
                            {row.controlId}
                          </span>
                          {row.isKeyControl && (
                            <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1 rounded border border-indigo-200">
                              KEY
                            </span>
                          )}
                        </div>
                        <div className="font-bold text-slate-900 mt-1">{row.controlName}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">Owner: {row.controlOwner}</div>
                      </td>

                      {/* Type & Nature */}
                      <td className="py-3 px-3 border-r border-slate-200 text-[11px]">
                        <div className="font-semibold text-slate-700">{row.controlType}</div>
                        <div className="text-slate-500 text-[10px]">{row.controlNature}</div>
                        <div className="text-slate-400 text-[10px]">{row.controlFrequency}</div>
                      </td>

                      {/* ToE Testing */}
                      <td className="py-3 px-3 text-center border-r border-slate-200">
                        <Link
                          href="/toe"
                          className="inline-block text-[10px] font-bold px-2 py-1 rounded border bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 transition-colors"
                        >
                          {row.toeConclusion}
                          <div className="text-[9px] font-mono text-slate-500">{row.toePassRatio}</div>
                        </Link>
                      </td>

                      {/* Residual Score */}
                      <td className="py-3 px-3 text-center border-r border-slate-200">
                        <span
                          className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${resBadge.bg} ${resBadge.text} ${resBadge.border}`}
                        >
                          {row.residualScore} ({row.residualRating})
                        </span>
                      </td>

                      {/* Remediation / MAP */}
                      <td className="py-3 px-4 bg-emerald-50/20 text-xs">
                        {row.mapId ? (
                          <div className="space-y-1">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 rounded">
                                {row.mapId}
                              </span>
                              <span className="text-[10px] font-bold text-emerald-700">
                                {row.mapProgress}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-700 line-clamp-1 font-medium">
                              {row.mapAgreedAction}
                            </div>
                            <div className="text-[10px] text-emerald-600 font-bold flex items-center space-x-1">
                              <span>Retest: {row.retestResult || 'Not Retested'}</span>
                              <span>• {row.issueStatus || 'Status not recorded'}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">No open issues</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CARD VIEW (Section 10 & 39 Mobile Architecture) */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(row => (
            <div
              key={row.id}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 hover:border-slate-300 transition-all"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div>
                  <span className="font-mono text-xs font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                    {row.processId}
                  </span>
                  <h3 className="font-bold text-sm text-slate-900 mt-1">{row.processName}</h3>
                  <div className="mt-1 text-[10px] text-slate-400">
                    {unitById.get(row.orgUnitId)?.name || 'Organization unit not assigned'}
                  </div>
                </div>
                <span className="text-xs font-bold text-slate-400 font-mono">#{row.rowNumber}</span>
              </div>

              {/* Risk Segment */}
              <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold text-amber-800">{row.riskId}</span>
                  <span className="text-[10px] font-bold text-rose-700">Inherent: {row.inherentScore}</span>
                </div>
                <div className="font-bold text-slate-900">{row.riskName}</div>
                <div className="text-slate-600 text-[11px]">{row.riskImpact}</div>
              </div>

              {/* Control Segment */}
              <div className="p-3 bg-sky-50/50 rounded-lg border border-sky-200 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold text-sky-800">{row.controlId}</span>
                  {row.isKeyControl && (
                    <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                      KEY CONTROL
                    </span>
                  )}
                </div>
                <div className="font-bold text-slate-900">{row.controlName}</div>
                <div className="text-slate-600 text-[11px]">Owner: {row.controlOwner} • {row.controlType}</div>
              </div>

              {/* Assurance & Testing Footer */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 text-[10px]">Testing:</span>
                  <div className="font-bold text-amber-700">{row.toeConclusion}</div>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px]">Remediation:</span>
                  <div className="font-bold text-emerald-700">{row.mapStatus || 'No MAP'}</div>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px]">Residual:</span>
                  <div className="font-bold text-emerald-700">{row.residualScore} ({row.residualRating})</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
