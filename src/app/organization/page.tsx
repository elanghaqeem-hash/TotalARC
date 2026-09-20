'use client';

import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Download,
  Layers,
  MapPin,
  Network,
  Pencil,
  Plus,
  Search,
  Upload,
  User,
  Users,
  X
} from 'lucide-react';
import { useRole } from '@/context/RoleContext';
import { jsonTransaction } from '@/lib/client-transaction';
import { jsonRead } from '@/lib/client-read';

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
  shortName?: string | null;
  entityType: string;
  parentEntityId?: string | null;
  parentEntityName?: string | null;
  country: string;
  currency: string;
  registrationNumber?: string | null;
  taxId?: string | null;
  status: string;
  effectiveDate?: string | null;
  processCount?: number;
};

type OrganizationUnit = {
  id: string;
  code: string;
  name: string;
  type: string;
  legalEntityId?: string | null;
  legalEntityName?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  headUserId?: string | null;
  headName?: string | null;
  headEmail?: string | null;
  headUserName?: string | null;
  headUserEmail?: string | null;
  costCenter?: string | null;
  location?: string | null;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  status: string;
  processCount?: number;
  positionCount?: number;
  childUnitCount?: number;
};

type OrganizationPosition = {
  id: string;
  code: string;
  title: string;
  positionLevel?: string | null;
  orgUnitId: string;
  unitName?: string | null;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  assignedUserEmail?: string | null;
  status: string;
};

type OrganizationUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string | null;
  orgUnitId?: string | null;
  orgUnitName?: string | null;
  orgAccessScope?: 'ALL' | 'UNIT_AND_CHILDREN' | 'UNIT_ONLY' | null;
  active: boolean;
};

type OrganizationData = {
  institution: Institution;
  legalEntities: LegalEntity[];
  organizationUnits: OrganizationUnit[];
  positions: OrganizationPosition[];
  users: OrganizationUser[];
  storage: string;
};

type ModalMode = 'entity' | 'unit' | 'position' | 'user-scope' | 'import' | null;
type Tab = 'structure' | 'entities' | 'units' | 'positions' | 'users';

const UNIT_TYPES = [
  'Directorate',
  'Division',
  'Department',
  'Section',
  'Unit',
  'Team',
  'Regional Office',
  'Branch',
  'Sub Branch',
  'Committee',
  'Function',
  'Other'
];

const emptyForm: Record<string, string> = {
  id: '',
  code: '',
  name: '',
  shortName: '',
  entityType: 'Legal Entity',
  parentEntityId: '',
  country: 'Indonesia',
  currency: 'IDR',
  registrationNumber: '',
  taxId: '',
  status: 'Active',
  effectiveDate: '',
  type: 'Division',
  legalEntityId: '',
  parentId: '',
  headUserId: '',
  headName: '',
  headEmail: '',
  costCenter: '',
  location: '',
  effectiveFrom: '',
  effectiveUntil: '',
  title: '',
  positionLevel: '',
  orgUnitId: '',
  assignedUserId: '',
  orgAccessScope: 'ALL'
};

function inputClass() {
  return 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100';
}

function badgeClass(status: string) {
  return status === 'Active'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-slate-100 text-slate-600 border-slate-200';
}

function csvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function UnitTreeNode({
  unit,
  units,
  selectedId,
  expanded,
  onToggle,
  onSelect
}: {
  unit: OrganizationUnit;
  units: OrganizationUnit[];
  selectedId: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const children = units
    .filter(item => item.parentId === unit.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const isExpanded = expanded.has(unit.id);

  return (
    <div>
      <div
        className={[
          'group flex items-center gap-2 rounded-xl px-2 py-2 transition',
          selectedId === unit.id
            ? 'bg-brand-50 ring-1 ring-brand-200'
            : 'hover:bg-slate-50'
        ].join(' ')}
      >
        <button
          type="button"
          onClick={() => onToggle(unit.id)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white"
          aria-label={isExpanded ? 'Collapse unit' : 'Expand unit'}
        >
          {children.length ? (
            isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
          )}
        </button>
        <button type="button" onClick={() => onSelect(unit.id)} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-bold text-slate-900">
            {unit.name}
          </div>
          <div className="truncate text-[11px] text-slate-500">
            {unit.code} · {unit.type} · {unit.processCount || 0} processes
          </div>
        </button>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass(unit.status)}`}>
          {unit.status}
        </span>
      </div>
      {isExpanded && children.length > 0 && (
        <div className="ml-5 border-l border-slate-200 pl-3">
          {children.map(child => (
            <UnitTreeNode
              key={child.id}
              unit={child}
              units={units}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChartNode({
  unit,
  units,
  onSelect
}: {
  unit: OrganizationUnit;
  units: OrganizationUnit[];
  onSelect: (id: string) => void;
}) {
  const children = units
    .filter(item => item.parentId === unit.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => onSelect(unit.id)}
        className="min-w-[190px] max-w-[240px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm transition hover:border-brand-300 hover:shadow-md"
      >
        <div className="text-xs font-black text-slate-900">{unit.name}</div>
        <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
          {unit.type} · {unit.code}
        </div>
        <div className="mt-2 truncate text-[10px] text-slate-500">
          {unit.headUserName || unit.headName || 'Head not assigned'}
        </div>
      </button>
      {children.length > 0 && (
        <>
          <div className="h-5 w-px bg-slate-300" />
          <div className="flex max-w-full flex-wrap justify-center gap-5 border-t border-slate-300 pt-5">
            {children.map(child => (
              <ChartNode key={child.id} unit={child} units={units} onSelect={onSelect} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function OrganizationPage() {
  const { currentUser } = useRole();
  const isAdmin = currentUser?.role === 'Admin';

  const [data, setData] = useState<OrganizationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('structure');
  const [chartView, setChartView] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalMode>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [importRows, setImportRows] = useState<Array<Record<string, string>>>([]);
  const [importFileName, setImportFileName] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      const payload = await jsonRead<OrganizationData & { error?: string }>('/api/organization', { dedupe: false });
      setData(payload);
      setExpanded(new Set(payload.organizationUnits.filter(item => !item.parentId).map(item => item.id)));
      setSelectedUnitId(current => current || payload.organizationUnits[0]?.id || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load organization structure.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredUnits = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    if (!term) return data.organizationUnits;
    return data.organizationUnits.filter(unit =>
      [unit.code, unit.name, unit.type, unit.headUserName, unit.headName, unit.location]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(term))
    );
  }, [data, search]);

  const rootUnits = useMemo(() => {
    if (!data) return [];
    return data.organizationUnits
      .filter(unit => !unit.parentId || !data.organizationUnits.some(parent => parent.id === unit.parentId))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const selectedUnit = data?.organizationUnits.find(unit => unit.id === selectedUnitId) || null;

  const toggleExpanded = (id: string) => {
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreate = (mode: Exclude<ModalMode, null | 'import'>) => {
    setEditing(false);
    const selected = data?.organizationUnits.find(unit => unit.id === selectedUnitId) || null;
    setForm({
      ...emptyForm,
      country: data?.institution.country || 'Indonesia',
      legalEntityId:
        selected?.legalEntityId
        || (data?.legalEntities.length === 1 ? data.legalEntities[0].id : ''),
      parentId: mode === 'unit' ? selectedUnitId || '' : '',
      orgUnitId: mode === 'position' ? selectedUnitId || '' : ''
    });
    setModal(mode);
    setError('');
    setNotice('');
  };

  const openEditEntity = (entity: LegalEntity) => {
    setEditing(true);
    setForm({
      ...emptyForm,
      id: entity.id,
      code: entity.code,
      name: entity.name,
      shortName: entity.shortName || '',
      entityType: entity.entityType,
      parentEntityId: entity.parentEntityId || '',
      country: entity.country,
      currency: entity.currency,
      registrationNumber: entity.registrationNumber || '',
      taxId: entity.taxId || '',
      status: entity.status,
      effectiveDate: entity.effectiveDate || ''
    });
    setModal('entity');
  };

  const openEditUnit = (unit: OrganizationUnit) => {
    setEditing(true);
    setForm({
      ...emptyForm,
      id: unit.id,
      code: unit.code,
      name: unit.name,
      type: unit.type,
      legalEntityId: unit.legalEntityId || '',
      parentId: unit.parentId || '',
      headUserId: unit.headUserId || '',
      headName: unit.headName || '',
      headEmail: unit.headEmail || '',
      costCenter: unit.costCenter || '',
      location: unit.location || '',
      effectiveFrom: unit.effectiveFrom || '',
      effectiveUntil: unit.effectiveUntil || '',
      status: unit.status
    });
    setModal('unit');
  };

  const openEditPosition = (position: OrganizationPosition) => {
    setEditing(true);
    setForm({
      ...emptyForm,
      id: position.id,
      code: position.code,
      title: position.title,
      positionLevel: position.positionLevel || '',
      orgUnitId: position.orgUnitId,
      assignedUserId: position.assignedUserId || '',
      status: position.status
    });
    setModal('position');
  };

  const openEditUserScope = (user: OrganizationUser) => {
    setEditing(true);
    setForm({
      ...emptyForm,
      id: user.id,
      name: user.name,
      orgUnitId: user.orgUnitId || '',
      orgAccessScope: user.orgAccessScope || 'ALL'
    });
    setModal('user-scope');
  };

  const mutate = async (method: 'POST' | 'PATCH', body: Record<string, unknown>) =>
    jsonTransaction<{ error?: string; importedCount?: number }>(
      '/api/organization',
      body,
      method
    );

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!modal || modal === 'import') return;

    setSaving(true);
    setError('');
    setNotice('');

    try {
      if (modal === 'entity') {
        await mutate(editing ? 'PATCH' : 'POST', {
          ...form,
          action: editing ? 'update-legal-entity' : 'create-legal-entity'
        });
      }

      if (modal === 'unit') {
        await mutate(editing ? 'PATCH' : 'POST', {
          ...form,
          action: editing ? 'update-unit' : 'create-unit'
        });
      }

      if (modal === 'position') {
        await mutate(editing ? 'PATCH' : 'POST', {
          ...form,
          action: editing ? 'update-position' : 'create-position'
        });
      }

      if (modal === 'user-scope') {
        await jsonTransaction(
          '/api/auth/users',
          {
            id: form.id,
            orgUnitId: form.orgAccessScope === 'ALL' ? null : form.orgUnitId || null,
            orgAccessScope: form.orgAccessScope
          },
          'PATCH'
        );
      }

      setModal(null);
      setNotice(editing ? 'Organization record updated.' : 'Organization record created.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save organization record.');
    } finally {
      setSaving(false);
    }
  };

  const handleCsv = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) {
      setImportRows([]);
      setImportFileName(file.name);
      return;
    }

    const headers = csvLine(lines[0]);
    const rows = lines.slice(1).map(line => {
      const values = csvLine(line);
      return headers.reduce<Record<string, string>>((record, header, index) => {
        record[header.trim()] = values[index] || '';
        return record;
      }, {});
    });

    setImportRows(rows);
    setImportFileName(file.name);
  };

  const importCsv = async () => {
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const result = await mutate('POST', {
        action: 'import-units',
        rows: importRows
      });
      setModal(null);
      setImportRows([]);
      setImportFileName('');
      setNotice(`${result.importedCount || 0} organization units imported.`);
      await load();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Unable to import organization structure.');
    } finally {
      setSaving(false);
    }
  };

  const downloadTemplate = () => {
    const csv = [
      'unitCode,unitName,unitType,parentUnitCode,entityCode,headName,costCenter,location,effectiveFrom,status',
      'DIV-RISK,Divisi Manajemen Risiko,Division,,BANK-KALBAR,,,,,Active',
      'DEP-OR,Departemen Risiko Operasional,Department,DIV-RISK,BANK-KALBAR,,,,,Active'
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'total-arc-organization-import-template.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  };

  const updateField = (field: string, value: string) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Loading organization master…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error || 'Organization data is not available.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand-600">
              <Building2 className="h-4 w-4" />
              Organization
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">
              Institution & Organization Structure
            </h1>
            <p className="mt-1 max-w-3xl text-xs text-slate-500">
              Enterprise organization master for legal entities, hierarchical units, positions, user assignments, process ownership, and access scope.
            </p>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => openCreate('entity')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                <Plus className="h-4 w-4" /> Legal Entity
              </button>
              <button type="button" onClick={() => openCreate('unit')} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700">
                <Plus className="h-4 w-4" /> Organization Unit
              </button>
              <button type="button" onClick={() => openCreate('position')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                <User className="h-4 w-4" /> Position
              </button>
              <button type="button" onClick={() => setModal('import')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                <Upload className="h-4 w-4" /> Import
              </button>
            </div>
          )}
        </div>
      </section>

      {(error || notice) && (
        <div className={[
          'rounded-xl border px-4 py-3 text-xs',
          error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        ].join(' ')}>
          {error || notice}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Institution</div>
        <div className="mt-1 text-xl font-black text-slate-900">{data.institution.name}</div>
        <div className="mt-1 text-xs text-slate-500">
          {data.institution.legalName} · {data.institution.institutionType} · {data.institution.country}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: 'Legal Entities', value: data.legalEntities.length, icon: Building2 },
          { label: 'Organization Units', value: data.organizationUnits.length, icon: Layers },
          { label: 'Positions', value: data.positions.length, icon: User },
          { label: 'Users', value: data.users.length, icon: Users }
        ].map(metric => (
          <div key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{metric.label}</div>
              <metric.icon className="h-4 w-4 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-slate-900">{metric.value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-1">
            {([
              ['structure', 'Structure'],
              ['entities', 'Legal Entities'],
              ['units', 'Units'],
              ['positions', 'Positions'],
              ['users', 'Users']
            ] as Array<[Tab, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={[
                  'rounded-lg px-3 py-2 text-xs font-bold transition',
                  tab === value
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(tab === 'structure' || tab === 'units') && (
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search organization…"
                  className="w-64 rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-brand-400"
                />
              </div>
            )}
            {tab === 'structure' && (
              <button
                type="button"
                onClick={() => setChartView(value => !value)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <Network className="h-4 w-4" />
                {chartView ? 'Tree View' : 'Org Chart'}
              </button>
            )}
          </div>
        </div>

        {tab === 'structure' && (
          chartView ? (
            <div className="overflow-auto p-6">
              {rootUnits.length ? (
                <div className="flex min-w-max flex-wrap justify-center gap-8">
                  {rootUnits.map(unit => (
                    <ChartNode key={unit.id} unit={unit} units={data.organizationUnits} onSelect={setSelectedUnitId} />
                  ))}
                </div>
              ) : (
                <div className="py-16 text-center text-sm text-slate-500">
                  No organization units have been registered.
                </div>
              )}
            </div>
          ) : (
            <div className="grid min-h-[460px] grid-cols-1 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="border-b border-slate-200 p-4 xl:border-b-0 xl:border-r">
                {rootUnits.length ? (
                  <div className="space-y-1">
                    {rootUnits.map(unit => (
                      <UnitTreeNode
                        key={unit.id}
                        unit={unit}
                        units={search ? filteredUnits : data.organizationUnits}
                        selectedId={selectedUnitId}
                        expanded={expanded}
                        onToggle={toggleExpanded}
                        onSelect={setSelectedUnitId}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="py-16 text-center">
                    <Layers className="mx-auto h-8 w-8 text-slate-300" />
                    <div className="mt-3 text-sm font-bold text-slate-700">No organization units</div>
                    <p className="mt-1 text-xs text-slate-500">Create a unit or import the organization hierarchy.</p>
                  </div>
                )}
              </div>
              <div className="p-5">
                {selectedUnit ? (
                  <div className="space-y-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{selectedUnit.type}</div>
                        <h2 className="mt-1 text-lg font-black text-slate-900">{selectedUnit.name}</h2>
                        <div className="mt-1 text-xs text-slate-500">{selectedUnit.code}</div>
                      </div>
                      {isAdmin && (
                        <button type="button" onClick={() => openEditUnit(selectedUnit)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-[10px] font-bold uppercase text-slate-400">Legal Entity</div>
                        <div className="mt-1 text-xs font-bold text-slate-700">{selectedUnit.legalEntityName || 'Not assigned'}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-[10px] font-bold uppercase text-slate-400">Parent Unit</div>
                        <div className="mt-1 text-xs font-bold text-slate-700">{selectedUnit.parentName || 'Top level'}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400"><User className="h-3 w-3" /> Unit Head</div>
                        <div className="mt-1 text-xs font-bold text-slate-700">{selectedUnit.headUserName || selectedUnit.headName || 'Not assigned'}</div>
                        <div className="text-[10px] text-slate-500">{selectedUnit.headUserEmail || selectedUnit.headEmail || ''}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400"><MapPin className="h-3 w-3" /> Location</div>
                        <div className="mt-1 text-xs font-bold text-slate-700">{selectedUnit.location || 'Not specified'}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-[10px] font-bold uppercase text-slate-400">Linked Processes</div>
                        <div className="mt-1 text-lg font-black text-slate-900">{selectedUnit.processCount || 0}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-[10px] font-bold uppercase text-slate-400">Child Units</div>
                        <div className="mt-1 text-lg font-black text-slate-900">{selectedUnit.childUnitCount || 0}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-[10px] font-bold uppercase text-slate-400">Positions</div>
                        <div className="mt-1 text-lg font-black text-slate-900">{selectedUnit.positionCount || 0}</div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      Cost center: <span className="font-bold text-slate-700">{selectedUnit.costCenter || 'Not specified'}</span>
                    </div>
                    <div className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${badgeClass(selectedUnit.status)}`}>
                      {selectedUnit.status}
                    </div>
                  </div>
                ) : (
                  <div className="py-16 text-center text-xs text-slate-500">Select an organization unit to view details.</div>
                )}
              </div>
            </div>
          )
        )}

        {tab === 'entities' && (
          <div className="divide-y divide-slate-100">
            {data.legalEntities.length ? data.legalEntities.map(entity => (
              <div key={entity.id} className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="text-sm font-black text-slate-900">{entity.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{entity.code} · {entity.entityType} · {entity.country} · {entity.currency}</div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    {entity.processCount || 0} linked processes{entity.parentEntityName ? ` · Parent: ${entity.parentEntityName}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${badgeClass(entity.status)}`}>{entity.status}</span>
                  {isAdmin && (
                    <button type="button" onClick={() => openEditEntity(entity)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )) : <div className="p-10 text-center text-xs text-slate-500">No legal entities registered.</div>}
          </div>
        )}

        {tab === 'units' && (
          <div className="divide-y divide-slate-100">
            {filteredUnits.length ? filteredUnits.map(unit => (
              <div key={unit.id} className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="text-sm font-black text-slate-900">{unit.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{unit.code} · {unit.type} · {unit.legalEntityName || 'No legal entity'}</div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    Head: {unit.headUserName || unit.headName || 'Not assigned'} · Parent: {unit.parentName || 'Top level'} · {unit.processCount || 0} processes · {unit.positionCount || 0} positions
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${badgeClass(unit.status)}`}>{unit.status}</span>
                  {isAdmin && (
                    <button type="button" onClick={() => openEditUnit(unit)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )) : <div className="p-10 text-center text-xs text-slate-500">No organization units match the current filter.</div>}
          </div>
        )}

        {tab === 'positions' && (
          <div className="divide-y divide-slate-100">
            {data.positions.length ? data.positions.map(position => (
              <div key={position.id} className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="text-sm font-black text-slate-900">{position.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{position.code} · {position.unitName || 'Unit not found'}{position.positionLevel ? ` · ${position.positionLevel}` : ''}</div>
                  <div className="mt-1 text-[10px] text-slate-400">Assigned user: {position.assignedUserName || 'Vacant'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${badgeClass(position.status)}`}>{position.status}</span>
                  {isAdmin && (
                    <button type="button" onClick={() => openEditPosition(position)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )) : <div className="p-10 text-center text-xs text-slate-500">No positions registered.</div>}
          </div>
        )}

        {tab === 'users' && (
          <div className="divide-y divide-slate-100">
            {data.users.length ? data.users.map(user => (
              <div key={user.id} className="flex flex-col gap-2 p-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="text-sm font-black text-slate-900">{user.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{user.email} · {user.role}</div>
                  <div className="mt-1 text-[10px] text-slate-400">{user.department || 'No department label'}</div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    Access: {user.orgAccessScope || 'ALL'}
                    {user.orgUnitName ? ` · ${user.orgUnitName}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-fit rounded-full border px-2 py-1 text-[10px] font-bold ${badgeClass(user.active ? 'Active' : 'Inactive')}`}>
                    {user.active ? 'Active' : 'Inactive'}
                  </span>
                  {isAdmin && (
                    <button type="button" onClick={() => openEditUserScope(user)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Edit organization access">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )) : <div className="p-10 text-center text-xs text-slate-500">No provisioned users are bound to this institution.</div>}
          </div>
        )}
      </section>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <div className="text-sm font-black text-slate-900">
                  {modal === 'entity' && `${editing ? 'Edit' : 'Add'} Legal Entity`}
                  {modal === 'unit' && `${editing ? 'Edit' : 'Add'} Organization Unit`}
                  {modal === 'position' && `${editing ? 'Edit' : 'Add'} Position`}
                  {modal === 'user-scope' && 'Edit User Organization Access'}
                  {modal === 'import' && 'Import Organization Structure'}
                </div>
                <div className="mt-1 text-[10px] text-slate-500">Changes are stored in the tenant-scoped Cloudflare D1 organization master and audited.</div>
              </div>
              <button type="button" onClick={() => setModal(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            {modal === 'import' ? (
              <div className="space-y-5 p-5">
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
                  <div className="text-xs font-bold text-slate-700">CSV columns</div>
                  <div className="mt-2 break-words font-mono text-[10px] text-slate-500">
                    unitCode, unitName, unitType, parentUnitCode, entityCode, headName, costCenter, location, effectiveFrom, status
                  </div>
                  <button type="button" onClick={downloadTemplate} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                    <Download className="h-4 w-4" /> Download template
                  </button>
                </div>
                <input type="file" accept=".csv,text/csv" onChange={event => void handleCsv(event.target.files?.[0] || null)} className="block w-full text-xs text-slate-600" />
                {importFileName && (
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                    {importFileName} · {importRows.length} rows ready
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setModal(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">Cancel</button>
                  <button type="button" disabled={!importRows.length || saving} onClick={() => void importCsv()} className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                    {saving ? 'Importing…' : 'Import units'}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={save} className="space-y-5 p-5">
                {modal === 'entity' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700">Entity Code *<input required value={form.code} onChange={event => updateField('code', event.target.value)} className={`mt-1 ${inputClass()}`} /></label>
                    <label className="text-xs font-bold text-slate-700">Legal Entity Name *<input required value={form.name} onChange={event => updateField('name', event.target.value)} className={`mt-1 ${inputClass()}`} /></label>
                    <label className="text-xs font-bold text-slate-700">Short Name<input value={form.shortName} onChange={event => updateField('shortName', event.target.value)} className={`mt-1 ${inputClass()}`} /></label>
                    <label className="text-xs font-bold text-slate-700">Entity Type<input value={form.entityType} onChange={event => updateField('entityType', event.target.value)} className={`mt-1 ${inputClass()}`} /></label>
                    <label className="text-xs font-bold text-slate-700">Parent Entity<select value={form.parentEntityId} onChange={event => updateField('parentEntityId', event.target.value)} className={`mt-1 ${inputClass()}`}><option value="">None</option>{data.legalEntities.filter(item => item.id !== form.id).map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
                    <label className="text-xs font-bold text-slate-700">Country<input value={form.country} onChange={event => updateField('country', event.target.value)} className={`mt-1 ${inputClass()}`} /></label>
                    <label className="text-xs font-bold text-slate-700">Currency<input value={form.currency} onChange={event => updateField('currency', event.target.value)} className={`mt-1 ${inputClass()}`} /></label>
                    <label className="text-xs font-bold text-slate-700">Registration Number<input value={form.registrationNumber} onChange={event => updateField('registrationNumber', event.target.value)} className={`mt-1 ${inputClass()}`} /></label>
                    <label className="text-xs font-bold text-slate-700">Effective Date<input type="date" value={form.effectiveDate} onChange={event => updateField('effectiveDate', event.target.value)} className={`mt-1 ${inputClass()}`} /></label>
                    <label className="text-xs font-bold text-slate-700">Status<select value={form.status} onChange={event => updateField('status', event.target.value)} className={`mt-1 ${inputClass()}`}><option>Active</option><option>Inactive</option></select></label>
                  </div>
                )}

                {modal === 'unit' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700">Unit Code *<input required value={form.code} onChange={event => updateField('code', event.target.value)} className={`mt-1 ${inputClass()}`} /></label>
                    <label className="text-xs font-bold text-slate-700">Unit Name *<input required value={form.name} onChange={event => updateField('name', event.target.value)} className={`mt-1 ${inputClass()}`} /></label>
                    <label className="text-xs font-bold text-slate-700">Unit Type *<select required value={form.type} onChange={event => updateField('type', event.target.value)} className={`mt-1 ${inputClass()}`}>{UNIT_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
                    <label className="text-xs font-bold text-slate-700">Legal Entity<select value={form.legalEntityId} onChange={event => updateField('legalEntityId', event.target.value)} className={`mt-1 ${inputClass()}`}><option value="">Not assigned</option>{data.legalEntities.map(entity => <option key={entity.id} value={entity.id}>{entity.code} · {entity.name}</option>)}</select></label>
                    <label className="text-xs font-bold text-slate-700">Parent Unit<select value={form.parentId} onChange={event => updateField('parentId', event.target.value)} className={`mt-1 ${inputClass()}`}><option value="">Top level</option>{data.organizationUnits.filter(item => item.id !== form.id).map(unit => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}</select></label>
                    <label className="text-xs font-bold text-slate-700">Unit Head<select value={form.headUserId} onChange={event => {
                      const user = data.users.find(item => item.id === event.target.value);
                      setForm(current => ({
                        ...current,
                        headUserId: event.target.value,
                        headName: user?.name || '',
                        headEmail: user?.email || ''
                      }));
                    }} className={`mt-1 ${inputClass()}`}><option value="">Not assigned</option>{data.users.filter(user => user.active).map(user => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}</select></label>
                    <label className="text-xs font-bold text-slate-700">Cost Center<input value={form.costCenter} onChange={event => updateField('costCenter', event.target.value)} className={`mt-1 ${inputClass()}`} /></label>
                    <label className="text-xs font-bold text-slate-700">Location<input value={form.location} onChange={event => updateField('location', event.target.value)} className={`mt-1 ${inputClass()}`} /></label>
                    <label className="text-xs font-bold text-slate-700">Effective From<input type="date" value={form.effectiveFrom} onChange={event => updateField('effectiveFrom', event.target.value)} className={`mt-1 ${inputClass()}`} /></label>
                    <label className="text-xs font-bold text-slate-700">Effective Until<input type="date" value={form.effectiveUntil} onChange={event => updateField('effectiveUntil', event.target.value)} className={`mt-1 ${inputClass()}`} /></label>
                    <label className="text-xs font-bold text-slate-700">Status<select value={form.status} onChange={event => updateField('status', event.target.value)} className={`mt-1 ${inputClass()}`}><option>Active</option><option>Inactive</option></select></label>
                  </div>
                )}

                {modal === 'user-scope' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2 rounded-xl bg-slate-50 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">User</div>
                      <div className="mt-1 text-sm font-black text-slate-900">{form.name}</div>
                    </div>
                    <label className="text-xs font-bold text-slate-700">
                      Access Scope *
                      <select
                        value={form.orgAccessScope}
                        onChange={event => {
                          const value = event.target.value;
                          setForm(current => ({
                            ...current,
                            orgAccessScope: value,
                            orgUnitId: value === 'ALL' ? '' : current.orgUnitId
                          }));
                        }}
                        className={`mt-1 ${inputClass()}`}
                      >
                        <option value="ALL">All organization units</option>
                        <option value="UNIT_AND_CHILDREN">Selected unit + child units</option>
                        <option value="UNIT_ONLY">Selected unit only</option>
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Organization Unit
                      <select
                        value={form.orgUnitId}
                        onChange={event => updateField('orgUnitId', event.target.value)}
                        disabled={form.orgAccessScope === 'ALL'}
                        required={form.orgAccessScope !== 'ALL'}
                        className={`mt-1 ${inputClass()} disabled:bg-slate-100 disabled:text-slate-400`}
                      >
                        <option value="">Select unit</option>
                        {data.organizationUnits
                          .filter(unit => unit.status === 'Active')
                          .map(unit => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}
                      </select>
                    </label>
                    <div className="sm:col-span-2 rounded-xl border border-sky-100 bg-sky-50 p-3 text-[11px] leading-5 text-sky-800">
                      This scope is enforced server-side for BPM, Risk Register, Control Library, and RCM. UNIT_AND_CHILDREN includes all descendants of the selected unit.
                    </div>
                  </div>
                )}

                {modal === 'position' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700">Position Code *<input required value={form.code} onChange={event => updateField('code', event.target.value)} className={`mt-1 ${inputClass()}`} /></label>
                    <label className="text-xs font-bold text-slate-700">Position Title *<input required value={form.title} onChange={event => updateField('title', event.target.value)} className={`mt-1 ${inputClass()}`} /></label>
                    <label className="text-xs font-bold text-slate-700">Organization Unit *<select required value={form.orgUnitId} onChange={event => updateField('orgUnitId', event.target.value)} className={`mt-1 ${inputClass()}`}><option value="">Select unit</option>{data.organizationUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}</select></label>
                    <label className="text-xs font-bold text-slate-700">Position Level<input value={form.positionLevel} onChange={event => updateField('positionLevel', event.target.value)} className={`mt-1 ${inputClass()}`} placeholder="e.g. Head, Manager, Officer" /></label>
                    <label className="text-xs font-bold text-slate-700">Assigned User<select value={form.assignedUserId} onChange={event => updateField('assignedUserId', event.target.value)} className={`mt-1 ${inputClass()}`}><option value="">Vacant</option>{data.users.filter(user => user.active).map(user => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}</select></label>
                    <label className="text-xs font-bold text-slate-700">Status<select value={form.status} onChange={event => updateField('status', event.target.value)} className={`mt-1 ${inputClass()}`}><option>Active</option><option>Inactive</option></select></label>
                  </div>
                )}

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <button type="button" onClick={() => setModal(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">Cancel</button>
                  <button type="submit" disabled={saving} className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                    {saving ? 'Saving…' : editing ? 'Save changes' : 'Create record'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
