'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  BadgeCheck,
  Building2,
  Calculator,
  CheckCircle2,
  FileSpreadsheet,
  Landmark,
  Pencil,
  Save,
  Scale,
  Target,
  Workflow
} from 'lucide-react';

type Candidate = {
  id: string;
  code?: string;
  processId?: string;
  name: string;
  type?: string;
  level?: number;
  criticality?: string;
};

type ScopeItem = {
  id?: string;
  itemType: string;
  sourceId?: string | null;
  code?: string | null;
  name: string;
  inScope?: boolean;
};

type ScopeParameter = {
  id: string;
  parameterCode: string;
  label: string;
  numericValue?: number | null;
  percentValue?: number | null;
  formula?: string | null;
  basis?: string | null;
  status: string;
  sourceNote?: string | null;
};

type PopulationSummary = {
  id: string;
  populationType: string;
  assessedCount?: number | null;
  significantCount?: number | null;
  quantitativeSignificantCount?: number | null;
  qualitativeOnlyCount?: number | null;
  notSignificantCount?: number | null;
  sourceStatus: string;
  sourceNote?: string | null;
};

type ScopeRecord = {
  id: string;
  scopeName: string;
  fiscalYear: number;
  reportingPeriod: string;
  currency: string;
  consolidationBasis: string;
  accountingFramework?: string | null;
  benchmarkType: string;
  benchmarkAmount: number;
  overallMaterialityPercent: number;
  overallMaterialityAmount: number;
  performanceMaterialityPercent: number;
  performanceMaterialityAmount: number;
  clearlyTrivialPercent?: number | null;
  clearlyTrivialAmount?: number | null;
  componentMaterialityAmount?: number | null;
  scopeApproach: string;
  quantitativeCriteria?: string | null;
  qualitativeCriteria?: string | null;
  exclusions?: string | null;
  status: string;
  preparedBy: string;
  reviewedBy?: string | null;
  approvedBy?: string | null;
  notes?: string | null;
  items: ScopeItem[];
  parameters?: ScopeParameter[];
  populationSummaries?: PopulationSummary[];
  updatedAt?: string;
};

type ScopingData = {
  institution: { id: string; name: string; legalName: string; shortName: string } | null;
  scopes: ScopeRecord[];
  candidates: {
    legalEntities: Candidate[];
    organizationUnits: Candidate[];
    businessProcesses: Candidate[];
  };
};

const emptyForm = {
  id: '',
  scopeName: '',
  fiscalYear: '',
  reportingPeriod: '',
  currency: '',
  consolidationBasis: '',
  accountingFramework: '',
  benchmarkType: '',
  benchmarkAmount: '',
  overallMaterialityPercent: '',
  overallMaterialityAmount: '',
  performanceMaterialityPercent: '',
  performanceMaterialityAmount: '',
  clearlyTrivialPercent: '',
  clearlyTrivialAmount: '',
  componentMaterialityAmount: '',
  scopeApproach: '',
  quantitativeCriteria: '',
  qualitativeCriteria: '',
  exclusions: '',
  status: 'Draft',
  preparedBy: '',
  reviewedBy: '',
  approvedBy: '',
  notes: ''
};

function numberOrZero(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(amount: number, currency: string) {
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: currency || 'IDR',
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(amount);
  }
}

export default function IcofrScopingPage() {
  const [data, setData] = useState<ScopingData | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedLegalEntities, setSelectedLegalEntities] = useState<string[]>([]);
  const [selectedOrgUnits, setSelectedOrgUnits] = useState<string[]>([]);
  const [selectedProcesses, setSelectedProcesses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    let active = true;

    fetch('/api/icofr/scoping', { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'ICOFR scoping data unavailable.');
        return payload as ScopingData;
      })
      .then(payload => {
        if (!active) return;
        setData(payload);
        setError('');
      })
      .catch(err => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'ICOFR scoping data unavailable.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const benchmarkAmount = numberOrZero(form.benchmarkAmount);
  const omPercent = numberOrZero(form.overallMaterialityPercent);
  const omAmount = numberOrZero(form.overallMaterialityAmount);
  const pmPercent = numberOrZero(form.performanceMaterialityPercent);
  const trivialPercent = numberOrZero(form.clearlyTrivialPercent);

  const calculatedOm = useMemo(
    () => benchmarkAmount * (omPercent / 100),
    [benchmarkAmount, omPercent]
  );

  const calculatedPm = useMemo(
    () => omAmount * (pmPercent / 100),
    [omAmount, pmPercent]
  );

  const pmAmount = numberOrZero(form.performanceMaterialityAmount);

  const calculatedTrivial = useMemo(
    () => pmAmount * (trivialPercent / 100),
    [pmAmount, trivialPercent]
  );

  const toggleSelection = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter(current =>
      current.includes(value)
        ? current.filter(item => item !== value)
        : [...current, value]
    );
  };

  const resetForm = () => {
    setForm(emptyForm);
    setSelectedLegalEntities([]);
    setSelectedOrgUnits([]);
    setSelectedProcesses([]);
    setSaveMessage('');
    setError('');
  };

  const loadScopeForEditing = (scope: ScopeRecord) => {
    setForm({
      id: scope.id,
      scopeName: scope.scopeName || '',
      fiscalYear: String(scope.fiscalYear || ''),
      reportingPeriod: scope.reportingPeriod || '',
      currency: scope.currency || '',
      consolidationBasis: scope.consolidationBasis || '',
      accountingFramework: scope.accountingFramework || '',
      benchmarkType: scope.benchmarkType || '',
      benchmarkAmount: String(scope.benchmarkAmount ?? ''),
      overallMaterialityPercent: String(scope.overallMaterialityPercent ?? ''),
      overallMaterialityAmount: String(scope.overallMaterialityAmount ?? ''),
      performanceMaterialityPercent: String(scope.performanceMaterialityPercent ?? ''),
      performanceMaterialityAmount: String(scope.performanceMaterialityAmount ?? ''),
      clearlyTrivialPercent:
        scope.clearlyTrivialPercent === null || scope.clearlyTrivialPercent === undefined
          ? ''
          : String(scope.clearlyTrivialPercent),
      clearlyTrivialAmount:
        scope.clearlyTrivialAmount === null || scope.clearlyTrivialAmount === undefined
          ? ''
          : String(scope.clearlyTrivialAmount),
      componentMaterialityAmount:
        scope.componentMaterialityAmount === null ||
        scope.componentMaterialityAmount === undefined
          ? ''
          : String(scope.componentMaterialityAmount),
      scopeApproach: scope.scopeApproach || '',
      quantitativeCriteria: scope.quantitativeCriteria || '',
      qualitativeCriteria: scope.qualitativeCriteria || '',
      exclusions: scope.exclusions || '',
      status: scope.status || 'Draft',
      preparedBy: scope.preparedBy || '',
      reviewedBy: scope.reviewedBy || '',
      approvedBy: scope.approvedBy || '',
      notes: scope.notes || ''
    });

    setSelectedLegalEntities(
      scope.items
        .filter(item => item.itemType === 'Legal Entity' && item.sourceId)
        .map(item => String(item.sourceId))
    );
    setSelectedOrgUnits(
      scope.items
        .filter(item => item.itemType === 'Organization Unit' && item.sourceId)
        .map(item => String(item.sourceId))
    );
    setSelectedProcesses(
      scope.items
        .filter(item => item.itemType === 'Business Process' && item.sourceId)
        .map(item => String(item.sourceId))
    );

    setSaveMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const buildScopeItems = () => {
    if (!data) return [];

    const legalEntities = data.candidates.legalEntities
      .filter(item => selectedLegalEntities.includes(item.id))
      .map(item => ({
        itemType: 'Legal Entity',
        sourceId: item.id,
        code: item.code || '',
        name: item.name
      }));

    const orgUnits = data.candidates.organizationUnits
      .filter(item => selectedOrgUnits.includes(item.id))
      .map(item => ({
        itemType: 'Organization Unit',
        sourceId: item.id,
        code: item.code || '',
        name: item.name
      }));

    const processes = data.candidates.businessProcesses
      .filter(item => selectedProcesses.includes(item.id))
      .map(item => ({
        itemType: 'Business Process',
        sourceId: item.id,
        code: item.processId || '',
        name: item.name
      }));

    return [...legalEntities, ...orgUnits, ...processes];
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaveMessage('');

    try {
      const response = await fetch('/api/icofr/scoping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          items: buildScopeItems()
        })
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to save ICOFR scope.');

      setData(current => {
        if (!current) return current;
        const exists = current.scopes.some(scope => scope.id === payload.id);
        const scopes = exists
          ? current.scopes.map(scope => (scope.id === payload.id ? payload : scope))
          : [payload, ...current.scopes];
        return { ...current, scopes };
      });

      setForm(current => ({ ...current, id: payload.id }));
      setSaveMessage(
        form.id
          ? 'ICOFR scope updated in Cloudflare D1.'
          : 'ICOFR scope saved in Cloudflare D1.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save ICOFR scope.');
    } finally {
      setSaving(false);
    }
  };

  const currentCoverageCount =
    selectedLegalEntities.length + selectedOrgUnits.length + selectedProcesses.length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-sky-600">
              <Target className="h-4 w-4" />
              ICOFR Scoping
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">
              ICOFR Scoping & Materiality
            </h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              Define the reporting perimeter, materiality thresholds, in-scope entities,
              organization units and business processes before assertions and control testing.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-[10px] font-bold">
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">
              OM · Overall Materiality
            </span>
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-700">
              PM · Performance Materiality
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
              SAD / Clearly Trivial
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {saveMessage && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{saveMessage}</span>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-500">
          Loading ICOFR scoping data…
        </div>
      ) : !data?.institution ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Building2 className="mx-auto h-8 w-8 text-slate-400" />
          <div className="mt-3 font-bold text-slate-800">Institution profile is required first</div>
          <p className="mt-1 text-xs text-slate-500">
            ICOFR scope must be tied to a registered institution.
          </p>
          <Link
            href="/onboarding"
            className="mt-4 inline-flex rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700"
          >
            Open Institution Onboarding
          </Link>
        </div>
      ) : (
        <>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-brand-600" />
                  <div>
                    <h2 className="text-sm font-black text-slate-900">1. Reporting perimeter</h2>
                    <p className="text-[10px] text-slate-500">
                      Define the ICOFR period and reporting basis.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                    Scope name *
                    <input
                      required
                      value={form.scopeName}
                      onChange={event => setForm({ ...form, scopeName: event.target.value })}
                      placeholder="e.g. FY2026 Annual ICOFR Scope"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Fiscal year *
                    <input
                      required
                      inputMode="numeric"
                      value={form.fiscalYear}
                      onChange={event => setForm({ ...form, fiscalYear: event.target.value })}
                      placeholder="YYYY"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Reporting period *
                    <select
                      required
                      value={form.reportingPeriod}
                      onChange={event => setForm({ ...form, reportingPeriod: event.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    >
                      <option value="">Select period</option>
                      <option value="Annual">Annual</option>
                      <option value="Q1">Q1</option>
                      <option value="Q2">Q2</option>
                      <option value="Q3">Q3</option>
                      <option value="Q4">Q4</option>
                      <option value="Interim">Interim</option>
                      <option value="Special Purpose">Special Purpose</option>
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Currency *
                    <input
                      required
                      value={form.currency}
                      onChange={event =>
                        setForm({ ...form, currency: event.target.value.toUpperCase() })
                      }
                      placeholder="IDR"
                      maxLength={3}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal uppercase outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Consolidation basis *
                    <select
                      required
                      value={form.consolidationBasis}
                      onChange={event =>
                        setForm({ ...form, consolidationBasis: event.target.value })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    >
                      <option value="">Select basis</option>
                      <option value="Consolidated">Consolidated</option>
                      <option value="Standalone">Standalone</option>
                      <option value="Group + Components">Group + Components</option>
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                    Accounting / reporting framework
                    <input
                      value={form.accountingFramework}
                      onChange={event =>
                        setForm({ ...form, accountingFramework: event.target.value })
                      }
                      placeholder="e.g. PSAK / IFRS / regulatory reporting basis"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Scale className="h-4 w-4 text-brand-600" />
                  <div>
                    <h2 className="text-sm font-black text-slate-900">2. Materiality</h2>
                    <p className="text-[10px] text-slate-500">
                      Set OM, PM and supporting thresholds. No default percentages are imposed.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-700">
                    Benchmark *
                    <select
                      required
                      value={form.benchmarkType}
                      onChange={event =>
                        setForm({ ...form, benchmarkType: event.target.value })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    >
                      <option value="">Select benchmark</option>
                      <option value="Profit Before Tax">Profit Before Tax</option>
                      <option value="Revenue">Revenue</option>
                      <option value="Total Assets">Total Assets</option>
                      <option value="Equity">Equity</option>
                      <option value="Operating Expenses">Operating Expenses</option>
                      <option value="Custom">Custom</option>
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Benchmark amount *
                    <input
                      required
                      type="number"
                      min="0"
                      step="any"
                      value={form.benchmarkAmount}
                      onChange={event =>
                        setForm({ ...form, benchmarkAmount: event.target.value })
                      }
                      placeholder="0"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    OM % of benchmark *
                    <input
                      required
                      type="number"
                      min="0"
                      step="any"
                      value={form.overallMaterialityPercent}
                      onChange={event =>
                        setForm({
                          ...form,
                          overallMaterialityPercent: event.target.value
                        })
                      }
                      placeholder="0"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Overall Materiality (OM) *
                    <div className="mt-1 flex gap-2">
                      <input
                        required
                        type="number"
                        min="0"
                        step="any"
                        value={form.overallMaterialityAmount}
                        onChange={event =>
                          setForm({
                            ...form,
                            overallMaterialityAmount: event.target.value
                          })
                        }
                        placeholder="0"
                        className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                      />
                      <button
                        type="button"
                        title="Use benchmark × OM percentage"
                        onClick={() =>
                          setForm({
                            ...form,
                            overallMaterialityAmount: String(calculatedOm || '')
                          })
                        }
                        className="rounded-xl border border-slate-200 px-3 text-slate-500 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                      >
                        <Calculator className="h-4 w-4" />
                      </button>
                    </div>
                    <span className="mt-1 block text-[9px] font-medium text-slate-400">
                      Calculated: {formatAmount(calculatedOm, form.currency)}
                    </span>
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    PM % of OM *
                    <input
                      required
                      type="number"
                      min="0"
                      step="any"
                      value={form.performanceMaterialityPercent}
                      onChange={event =>
                        setForm({
                          ...form,
                          performanceMaterialityPercent: event.target.value
                        })
                      }
                      placeholder="0"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Performance Materiality (PM) *
                    <div className="mt-1 flex gap-2">
                      <input
                        required
                        type="number"
                        min="0"
                        step="any"
                        value={form.performanceMaterialityAmount}
                        onChange={event =>
                          setForm({
                            ...form,
                            performanceMaterialityAmount: event.target.value
                          })
                        }
                        placeholder="0"
                        className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                      />
                      <button
                        type="button"
                        title="Use OM × PM percentage"
                        onClick={() =>
                          setForm({
                            ...form,
                            performanceMaterialityAmount: String(calculatedPm || '')
                          })
                        }
                        className="rounded-xl border border-slate-200 px-3 text-slate-500 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                      >
                        <Calculator className="h-4 w-4" />
                      </button>
                    </div>
                    <span className="mt-1 block text-[9px] font-medium text-slate-400">
                      Calculated: {formatAmount(calculatedPm, form.currency)}
                    </span>
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Clearly trivial / SAD % of PM
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={form.clearlyTrivialPercent}
                      onChange={event =>
                        setForm({ ...form, clearlyTrivialPercent: event.target.value })
                      }
                      placeholder="0"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Clearly trivial / SAD amount
                    <div className="mt-1 flex gap-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={form.clearlyTrivialAmount}
                        onChange={event =>
                          setForm({ ...form, clearlyTrivialAmount: event.target.value })
                        }
                        placeholder="0"
                        className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                      />
                      <button
                        type="button"
                        title="Use PM × clearly trivial percentage"
                        onClick={() =>
                          setForm({
                            ...form,
                            clearlyTrivialAmount: String(calculatedTrivial || '')
                          })
                        }
                        className="rounded-xl border border-slate-200 px-3 text-slate-500 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                      >
                        <Calculator className="h-4 w-4" />
                      </button>
                    </div>
                    <span className="mt-1 block text-[9px] font-medium text-slate-400">
                      Calculated: {formatAmount(calculatedTrivial, form.currency)}
                    </span>
                  </label>

                  <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                    Component materiality amount
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={form.componentMaterialityAmount}
                      onChange={event =>
                        setForm({
                          ...form,
                          componentMaterialityAmount: event.target.value
                        })
                      }
                      placeholder="Optional for group / component scoping"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </label>
                </div>
              </section>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-brand-600" />
                  <div>
                    <h2 className="text-sm font-black text-slate-900">3. In-scope coverage</h2>
                    <p className="text-[10px] text-slate-500">
                      Select persisted organization and process records that are included in this ICOFR cycle.
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                  {currentCoverageCount} selected
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                {[
                  {
                    title: 'Legal entities',
                    icon: Landmark,
                    rows: data.candidates.legalEntities,
                    selected: selectedLegalEntities,
                    setter: setSelectedLegalEntities,
                    empty: 'No legal entities registered yet.'
                  },
                  {
                    title: 'Organization units',
                    icon: Building2,
                    rows: data.candidates.organizationUnits,
                    selected: selectedOrgUnits,
                    setter: setSelectedOrgUnits,
                    empty: 'No organization units registered yet.'
                  },
                  {
                    title: 'Business processes',
                    icon: FileSpreadsheet,
                    rows: data.candidates.businessProcesses,
                    selected: selectedProcesses,
                    setter: setSelectedProcesses,
                    empty: 'No business processes registered yet.'
                  }
                ].map(group => {
                  const Icon = group.icon;
                  return (
                    <div key={group.title} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                      <div className="mb-2 flex items-center gap-2 text-xs font-black text-slate-800">
                        <Icon className="h-3.5 w-3.5 text-slate-500" />
                        {group.title}
                      </div>

                      <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                        {group.rows.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center text-[10px] text-slate-400">
                            {group.empty}
                          </div>
                        ) : (
                          group.rows.map(row => {
                            const checked = group.selected.includes(row.id);
                            const code = row.processId || row.code;
                            return (
                              <label
                                key={row.id}
                                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition ${
                                  checked
                                    ? 'border-brand-300 bg-brand-50'
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    toggleSelection(
                                      row.id,
                                      group.setter as React.Dispatch<
                                        React.SetStateAction<string[]>
                                      >
                                    )
                                  }
                                  className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                />
                                <span className="min-w-0">
                                  <span className="block truncate text-[11px] font-bold text-slate-800">
                                    {code ? `${code} · ` : ''}
                                    {row.name}
                                  </span>
                                  {(row.type || row.criticality) && (
                                    <span className="mt-0.5 block text-[9px] text-slate-400">
                                      {[row.type, row.criticality].filter(Boolean).join(' · ')}
                                    </span>
                                  )}
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Target className="h-4 w-4 text-brand-600" />
                  <div>
                    <h2 className="text-sm font-black text-slate-900">4. Scoping criteria</h2>
                    <p className="text-[10px] text-slate-500">
                      Document both quantitative and qualitative inclusion logic.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-700">
                    Scope approach *
                    <select
                      required
                      value={form.scopeApproach}
                      onChange={event =>
                        setForm({ ...form, scopeApproach: event.target.value })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    >
                      <option value="">Select approach</option>
                      <option value="Risk-based">Risk-based</option>
                      <option value="Materiality + Risk-based">Materiality + Risk-based</option>
                      <option value="Full Scope">Full Scope</option>
                      <option value="Top-down">Top-down</option>
                      <option value="Top-down risk-based">Top-down risk-based</option>
                    </select>
                  </label>

                  <label className="block text-xs font-bold text-slate-700">
                    Quantitative criteria
                    <textarea
                      rows={3}
                      value={form.quantitativeCriteria}
                      onChange={event =>
                        setForm({ ...form, quantitativeCriteria: event.target.value })
                      }
                      placeholder="Document thresholds for significant accounts, balances, locations or components."
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </label>

                  <label className="block text-xs font-bold text-slate-700">
                    Qualitative criteria
                    <textarea
                      rows={4}
                      value={form.qualitativeCriteria}
                      onChange={event =>
                        setForm({ ...form, qualitativeCriteria: event.target.value })
                      }
                      placeholder="Fraud susceptibility, complex estimates, related parties, unusual transactions, regulatory sensitivity, volatility, judgment, disclosure significance, IT dependency, etc."
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </label>

                  <label className="block text-xs font-bold text-slate-700">
                    Explicit exclusions / out-of-scope rationale
                    <textarea
                      rows={3}
                      value={form.exclusions}
                      onChange={event =>
                        setForm({ ...form, exclusions: event.target.value })
                      }
                      placeholder="Document deliberate exclusions and management rationale."
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-brand-600" />
                  <div>
                    <h2 className="text-sm font-black text-slate-900">5. Governance & approval</h2>
                    <p className="text-[10px] text-slate-500">
                      Assign accountable people and lifecycle status.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-700">
                    Status *
                    <select
                      required
                      value={form.status}
                      onChange={event => setForm({ ...form, status: event.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    >
                      <option value="Draft">Draft</option>
                      <option value="Under Review">Under Review</option>
                      <option value="Approved">Approved</option>
                      <option value="Superseded">Superseded</option>
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Prepared by *
                    <input
                      required
                      value={form.preparedBy}
                      onChange={event => setForm({ ...form, preparedBy: event.target.value })}
                      placeholder="Name / role"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Reviewed by
                    <input
                      value={form.reviewedBy}
                      onChange={event => setForm({ ...form, reviewedBy: event.target.value })}
                      placeholder="Name / role"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    Approved by
                    <input
                      value={form.approvedBy}
                      onChange={event => setForm({ ...form, approvedBy: event.target.value })}
                      placeholder="Name / role"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                    Notes / materiality rationale
                    <textarea
                      rows={5}
                      value={form.notes}
                      onChange={event => setForm({ ...form, notes: event.target.value })}
                      placeholder="Document benchmark selection, percentage rationale, rounding, significant qualitative judgments, and approval notes."
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </label>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                    <div className="text-[9px] font-black uppercase text-sky-600">OM</div>
                    <div className="mt-1 truncate text-xs font-black text-slate-900">
                      {form.overallMaterialityAmount
                        ? formatAmount(omAmount, form.currency)
                        : 'Not set'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                    <div className="text-[9px] font-black uppercase text-indigo-600">PM</div>
                    <div className="mt-1 truncate text-xs font-black text-slate-900">
                      {form.performanceMaterialityAmount
                        ? formatAmount(
                            numberOrZero(form.performanceMaterialityAmount),
                            form.currency
                          )
                        : 'Not set'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[9px] font-black uppercase text-slate-500">Coverage</div>
                    <div className="mt-1 text-xs font-black text-slate-900">
                      {currentCoverageCount} items
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="sticky bottom-[66px] z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl shadow-slate-900/5 backdrop-blur lg:bottom-3">
              <div className="text-[10px] text-slate-500">
                {form.id
                  ? 'Editing an existing ICOFR scope record.'
                  : 'Create a new period-specific ICOFR scope record.'}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  New scope
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2 text-xs font-black text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving…' : form.id ? 'Update ICOFR Scope' : 'Save ICOFR Scope'}
                </button>
              </div>
            </div>
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-slate-900">Saved ICOFR scopes</h2>
                <p className="text-[10px] text-slate-500">
                  Period-specific materiality and perimeter decisions persisted in Cloudflare D1.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                {data.scopes.length} record{data.scopes.length === 1 ? '' : 's'}
              </span>
            </div>

            {data.scopes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                No ICOFR scope has been saved yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {data.scopes.map(scope => (
                  <div
                    key={scope.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-slate-900">
                          {scope.scopeName}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          FY{scope.fiscalYear} · {scope.reportingPeriod} · {scope.consolidationBasis}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold text-slate-600">
                        {scope.status}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-white p-2.5">
                        <div className="text-[9px] font-black uppercase text-slate-400">OM</div>
                        <div className="mt-0.5 truncate text-[11px] font-bold text-slate-800">
                          {formatAmount(scope.overallMaterialityAmount, scope.currency)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-white p-2.5">
                        <div className="text-[9px] font-black uppercase text-slate-400">PM</div>
                        <div className="mt-0.5 truncate text-[11px] font-bold text-slate-800">
                          {formatAmount(scope.performanceMaterialityAmount, scope.currency)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-white p-2.5">
                        <div className="text-[9px] font-black uppercase text-slate-400">Coverage</div>
                        <div className="mt-0.5 text-[11px] font-bold text-slate-800">
                          {scope.items?.length || 0} items
                        </div>
                      </div>
                    </div>

                    {scope.parameters && scope.parameters.length > 0 && (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                        <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                          Source-governed parameters
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          {scope.parameters.slice(0, 6).map(parameter => (
                            <div key={parameter.id} className="flex items-start justify-between gap-2 text-[10px]">
                              <span className="text-slate-500">{parameter.label}</span>
                              <span className="text-right font-bold text-slate-800">
                                {parameter.numericValue !== null && parameter.numericValue !== undefined
                                  ? formatAmount(parameter.numericValue, scope.currency)
                                  : parameter.percentValue !== null && parameter.percentValue !== undefined
                                    ? `${parameter.percentValue}%`
                                    : parameter.status}
                              </span>
                            </div>
                          ))}
                        </div>
                        {scope.parameters.some(parameter => parameter.status.includes('RECONCILIATION')) && (
                          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[9px] leading-4 text-amber-800">
                            Source reconciliation required: the memorandum values are preserved as written and are not silently recalculated.
                          </div>
                        )}
                      </div>
                    )}

                    {scope.populationSummaries && scope.populationSummaries.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {scope.populationSummaries.map(pop => (
                          <span
                            key={pop.id}
                            className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold text-slate-600"
                          >
                            {pop.populationType}: {pop.significantCount ?? '—'} / {pop.assessedCount ?? '—'} significant
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                      <span className="text-[10px] text-slate-500">
                        Prepared by {scope.preparedBy}
                      </span>
                      <button
                        type="button"
                        onClick={() => loadScopeForEditing(scope)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-700 hover:border-brand-300 hover:text-brand-700"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
