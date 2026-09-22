'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  GitBranch,
  Landmark,
  Plus,
  RefreshCw,
  Save,
  UserRound,
  X
} from 'lucide-react';

type Institution = {
  id: string;
  name: string;
  legalName: string;
  institutionType: string;
  country: string;
};

type LegalEntity = {
  id: string;
  code: string;
  name: string;
  country: string;
  taxId?: string | null;
};

type OrganizationUnit = {
  id: string;
  legalEntityId?: string | null;
  parentId?: string | null;
  type: string;
  code: string;
  name: string;
  headName?: string | null;
  headEmail?: string | null;
  status?: string;
};

type HierarchyEvidence = {
  unitId: string;
  sourceStatus: string;
  hierarchyStatus: string;
  sourceReferencesJson: string;
  sourceNote?: string | null;
  asOfDate?: string | null;
};

type OrganizationTemplateNode = {
  id: string;
  templateCode: string;
  nodeCode: string;
  parentNodeCode?: string | null;
  relationshipType: string;
  type: string;
  name: string;
  conditional: number;
  sourceReference: string;
  sortOrder: number;
};

type OrganizationPayload = {
  institution: Institution | null;
  legalEntities: LegalEntity[];
  organizationUnits: OrganizationUnit[];
  hierarchyEvidence?: HierarchyEvidence[];
  organizationTemplates?: OrganizationTemplateNode[];
  storage?: string;
};

const UNIT_TYPES = [
  'Board / Committee',
  'Directorate',
  'Division',
  'Department',
  'Group',
  'Function',
  'Unit',
  'Region',
  'Branch',
  'Office',
  'Team'
];

function OrganizationNode({
  unit,
  units,
  entities,
  depth = 0
}: {
  unit: OrganizationUnit;
  units: OrganizationUnit[];
  entities: LegalEntity[];
  depth?: number;
}) {
  const children = units.filter(item => item.parentId === unit.id);
  const entity = entities.find(item => item.id === unit.legalEntityId);

  return (
    <div className={depth > 0 ? 'ml-4 sm:ml-6 border-l border-slate-200 pl-3 sm:pl-4' : ''}>
      <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wide text-brand-600">
                {unit.type}
              </span>
              <span className="text-[10px] rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-500">
                {unit.code}
              </span>
            </div>
            <div className="mt-1 text-sm font-black text-slate-900">{unit.name}</div>
            <div className="mt-1 text-[11px] text-slate-500">
              {entity ? entity.name : 'Institution level'}
              {' · '}
              Head: {unit.headName || 'Not assigned'}
            </div>
          </div>
          <GitBranch className="h-4 w-4 flex-shrink-0 text-slate-300" />
        </div>
      </div>

      {children.length > 0 && (
        <div className="mt-2 space-y-2">
          {children.map(child => (
            <OrganizationNode
              key={child.id}
              unit={child}
              units={units}
              entities={entities}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrganizationPage() {
  const [data, setData] = useState<OrganizationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formMode, setFormMode] = useState<'legalEntity' | 'organizationUnit' | null>(null);

  const [entityForm, setEntityForm] = useState({
    code: '',
    name: '',
    country: 'Indonesia',
    taxId: ''
  });

  const [unitForm, setUnitForm] = useState({
    code: '',
    name: '',
    type: '',
    legalEntityId: '',
    parentId: '',
    headName: '',
    headEmail: ''
  });

  const loadOrganization = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/organization', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Organization data could not be loaded.');
      }
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Organization data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrganization();
  }, [loadOrganization]);

  const institution = data?.institution || null;
  const legalEntities = data?.legalEntities || [];
  const organizationUnits = data?.organizationUnits || [];
  const hierarchyEvidence = data?.hierarchyEvidence || [];
  const organizationTemplates = data?.organizationTemplates || [];
  const verifiedHierarchyCount = hierarchyEvidence.filter(item =>
    item.hierarchyStatus.startsWith('VERIFIED')
  ).length;
  const pendingHierarchy = hierarchyEvidence.filter(item =>
    item.hierarchyStatus.includes('PENDING')
  );

  const rootUnits = useMemo(() => {
    const knownIds = new Set(organizationUnits.map(unit => unit.id));
    return organizationUnits.filter(unit => !unit.parentId || !knownIds.has(unit.parentId));
  }, [organizationUnits]);

  const closeForm = () => {
    setFormMode(null);
    setError('');
  };

  const submitLegalEntity = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'legalEntity', ...entityForm })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Legal entity could not be saved.');

      const legalEntity = payload.legalEntity as LegalEntity;
      setData(current => current
        ? {
            ...current,
            legalEntities: [...current.legalEntities, legalEntity].sort((a, b) =>
              a.code.localeCompare(b.code) || a.name.localeCompare(b.name)
            )
          }
        : current
      );
      setEntityForm({ code: '', name: '', country: 'Indonesia', taxId: '' });
      setFormMode(null);
      setSuccess('Legal entity saved. The page was updated instantly without reloading.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Legal entity could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const submitOrganizationUnit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'organizationUnit', ...unitForm })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Organization unit could not be saved.');

      const organizationUnit = payload.organizationUnit as OrganizationUnit;
      setData(current => current
        ? {
            ...current,
            organizationUnits: [...current.organizationUnits, organizationUnit]
          }
        : current
      );
      setUnitForm({
        code: '',
        name: '',
        type: '',
        legalEntityId: '',
        parentId: '',
        headName: '',
        headEmail: ''
      });
      setFormMode(null);
      setSuccess('Organization unit saved. The hierarchy was updated instantly without reloading.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Organization unit could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold uppercase text-brand-600">
          <Building2 className="h-4 w-4" />
          Organization
        </div>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
          Institution & Organization Structure
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Build the legal-entity and organization hierarchy that will be inherited by BPM,
          risk, control, assurance, task ownership, and reporting.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-700">
          {success}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading organization master…
        </div>
      ) : !institution ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="font-bold text-slate-700">Institution registration is required first</div>
          <p className="mt-1 text-xs text-slate-500">
            Complete Institution Onboarding before creating the organization structure.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Institution
                </div>
                <div className="text-xl font-black text-slate-900">{institution.name}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {institution.legalName} · {institution.institutionType} · {institution.country}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 px-4 py-2">
                  <div className="text-lg font-black text-slate-900">{legalEntities.length}</div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Legal entities</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-2">
                  <div className="text-lg font-black text-slate-900">{organizationUnits.length}</div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Org units</div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setFormMode('legalEntity');
                  setError('');
                  setSuccess('');
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-xs font-black text-brand-700 hover:bg-brand-100"
              >
                <Landmark className="h-4 w-4" />
                <Plus className="h-3.5 w-3.5" />
                Add Legal Entity
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormMode('organizationUnit');
                  setError('');
                  setSuccess('');
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white hover:bg-brand-700"
              >
                <GitBranch className="h-4 w-4" />
                <Plus className="h-3.5 w-3.5" />
                Add Organization Unit
              </button>
            </div>
          </div>

          {formMode === 'legalEntity' && (
            <form
              onSubmit={submitLegalEntity}
              className="rounded-2xl border border-brand-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                    <Landmark className="h-4 w-4 text-brand-600" />
                    New Legal Entity
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Use this for the company, subsidiary, or separate legal entity represented in Total ARC.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">
                  Entity Code *
                  <input
                    required
                    value={entityForm.code}
                    onChange={event => setEntityForm({ ...entityForm, code: event.target.value })}
                    placeholder="e.g. BK-PARENT"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Legal Entity Name *
                  <input
                    required
                    value={entityForm.name}
                    onChange={event => setEntityForm({ ...entityForm, name: event.target.value })}
                    placeholder="Registered entity name"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Country
                  <input
                    value={entityForm.country}
                    onChange={event => setEntityForm({ ...entityForm, country: event.target.value })}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Tax ID / Registration ID
                  <input
                    value={entityForm.taxId}
                    onChange={event => setEntityForm({ ...entityForm, taxId: event.target.value })}
                    placeholder="Optional"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </label>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                >
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Saving…' : 'Save Legal Entity'}
                </button>
              </div>
            </form>
          )}

          {formMode === 'organizationUnit' && (
            <form
              onSubmit={submitOrganizationUnit}
              className="rounded-2xl border border-brand-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                    <GitBranch className="h-4 w-4 text-brand-600" />
                    New Organization Unit
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Select a parent unit to build the hierarchy. Leave Parent Unit blank for a top-level unit.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">
                  Unit Code *
                  <input
                    required
                    value={unitForm.code}
                    onChange={event => setUnitForm({ ...unitForm, code: event.target.value })}
                    placeholder="e.g. DIR-RISK"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Unit Name *
                  <input
                    required
                    value={unitForm.name}
                    onChange={event => setUnitForm({ ...unitForm, name: event.target.value })}
                    placeholder="e.g. Risk Management Directorate"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Organization Level / Type *
                  <select
                    required
                    value={unitForm.type}
                    onChange={event => setUnitForm({ ...unitForm, type: event.target.value })}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Select level</option>
                    {UNIT_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Legal Entity
                  <select
                    value={unitForm.legalEntityId}
                    onChange={event => setUnitForm({ ...unitForm, legalEntityId: event.target.value })}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Institution level / not specified</option>
                    {legalEntities.map(entity => (
                      <option key={entity.id} value={entity.id}>
                        {entity.code} — {entity.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Parent Unit
                  <select
                    value={unitForm.parentId}
                    onChange={event => setUnitForm({ ...unitForm, parentId: event.target.value })}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">No parent — create top-level unit</option>
                    {organizationUnits.map(unit => (
                      <option key={unit.id} value={unit.id}>
                        {unit.code} — {unit.name} ({unit.type})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Head / Unit Owner
                  <input
                    value={unitForm.headName}
                    onChange={event => setUnitForm({ ...unitForm, headName: event.target.value })}
                    placeholder="Name"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Head Email
                  <input
                    type="email"
                    value={unitForm.headEmail}
                    onChange={event => setUnitForm({ ...unitForm, headEmail: event.target.value })}
                    placeholder="name@company.com"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </label>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                >
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Saving…' : 'Add to Structure'}
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 xl:col-span-1">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-black text-slate-900">Legal Entities</h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Companies or subsidiaries within this institution.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">
                  {legalEntities.length}
                </span>
              </div>

              <div className="mt-4 space-y-2">
                {legalEntities.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center">
                    <Landmark className="mx-auto h-5 w-5 text-slate-300" />
                    <div className="mt-2 text-xs font-bold text-slate-600">No legal entity yet</div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      Add one when the institution contains separate legal entities.
                    </div>
                  </div>
                ) : (
                  legalEntities.map(entity => (
                    <div key={entity.id} className="rounded-xl border border-slate-200 p-3 text-xs">
                      <div className="font-black text-slate-800">
                        {entity.code} · {entity.name}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {entity.country}
                        {entity.taxId ? ` · ID: ${entity.taxId}` : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 xl:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-brand-600" />
                    <h2 className="font-black text-slate-900">Organization Structure</h2>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Parent-child relationships define the organization hierarchy used across Total ARC.
                  </p>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[10px] font-bold text-slate-500">
                  <UserRound className="h-3.5 w-3.5" />
                  {organizationUnits.length} unit(s)
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {rootUnits.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                    <GitBranch className="mx-auto h-7 w-7 text-slate-300" />
                    <h3 className="mt-2 text-sm font-black text-slate-700">
                      Organization hierarchy has not been formed
                    </h3>
                    <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
                      Create the first top-level unit, then add child units by selecting its Parent Unit.
                    </p>
                    <button
                      type="button"
                      onClick={() => setFormMode('organizationUnit')}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-xs font-black text-white"
                    >
                      <Plus className="h-4 w-4" />
                      Create First Unit
                    </button>
                  </div>
                ) : (
                  rootUnits.map(unit => (
                    <OrganizationNode
                      key={unit.id}
                      unit={unit}
                      units={organizationUnits}
                      entities={legalEntities}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          {(hierarchyEvidence.length > 0 || organizationTemplates.length > 0) && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-black text-slate-900">Hierarchy Source Governance</h2>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      Reporting lines are populated only when supported by a formal source.
                      Units may exist while their central parent remains pending confirmation.
                    </p>
                  </div>
                  <div className="flex gap-2 text-[10px] font-black">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                      {verifiedHierarchyCount} verified
                    </span>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                      {pendingHierarchy.length} pending
                    </span>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {pendingHierarchy.length === 0 ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                      All source-managed reporting lines are verified.
                    </div>
                  ) : (
                    pendingHierarchy.slice(0, 12).map(item => {
                      const unit = organizationUnits.find(candidate => candidate.id === item.unitId);
                      return (
                        <div key={item.unitId} className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                          <div className="text-xs font-black text-slate-800">
                            {unit ? `${unit.code} · ${unit.name}` : item.unitId}
                          </div>
                          <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
                            {item.sourceNote || 'Parent relationship is awaiting a source-backed confirmation.'}
                          </div>
                        </div>
                      );
                    })
                  )}
                  {pendingHierarchy.length > 12 && (
                    <div className="text-[11px] font-bold text-slate-400">
                      +{pendingHierarchy.length - 12} additional source-managed unit(s) pending hierarchy confirmation.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div>
                  <h2 className="font-black text-slate-900">Formal Branch Structure Reference</h2>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    Reference hierarchy from the latest available branch SOP. Conditional nodes are
                    not treated as active at every branch unless branch-specific evidence exists.
                  </p>
                </div>

                <div className="mt-4 space-y-2">
                  {organizationTemplates.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">
                      No formal structure template has been loaded.
                    </div>
                  ) : (
                    organizationTemplates.map(node => {
                      const parent = node.parentNodeCode
                        ? organizationTemplates.find(candidate =>
                            candidate.templateCode === node.templateCode &&
                            candidate.nodeCode === node.parentNodeCode
                          )
                        : null;
                      return (
                        <div key={node.id} className="rounded-xl border border-slate-200 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wide text-brand-600">
                              {node.type}
                            </span>
                            <span className="text-xs font-black text-slate-800">{node.name}</span>
                            {Boolean(node.conditional) && (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-700">
                                conditional
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            {parent ? `Parent: ${parent.name}` : 'Template root'}
                            {' · '}
                            {node.relationshipType}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
