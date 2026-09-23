'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Grid3X3,
  List,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';
import { DataLoadingState } from '@/components/common/DataLoadingState';

type CalendarEvent = {
  id: string;
  date: string;
  startDate?: string | null;
  dueDate?: string | null;
  type: string;
  title: string;
  status: string;
  owner: string;
  reviewer?: string | null;
  priority?: string | null;
  link: string;
  source: string;
  sourceId?: string | null;
  editable?: boolean;
  notes?: string | null;
};

const EVENT_TYPES = [
  'RCSA',
  'CSA',
  'ICOFR Testing',
  'ToD',
  'ToE',
  'Remediation / MAP',
  'Retest',
  'Certification',
  'Audit',
  'Compliance',
  'BCM',
  'Task',
  'Other'
];

const STATUS_OPTIONS = ['Planned', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
const PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'];

function dateKey(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '';
  return value.trim().slice(0, 10);
}

function asDate(value: string) {
  const key = dateKey(value);
  if (!key) return null;
  const parsed = new Date(key + 'T00:00:00');
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthTitle(date: Date) {
  return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

function displayDate(value: string) {
  const parsed = asDate(value);
  return parsed
    ? parsed.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Date not available';
}

function isCompletedStatus(status: unknown) {
  const normalized = String(status || '').trim().toLowerCase();
  return [
    'completed',
    'closed',
    'done',
    'signed',
    'approved',
    'pass',
    'passed',
    'effective'
  ].includes(normalized);
}

function isCancelledStatus(status: unknown) {
  return String(status || '').trim().toLowerCase() === 'cancelled';
}

function statusClasses(status: string, overdue = false) {
  if (overdue) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (isCompletedStatus(status)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (isCancelledStatus(status)) return 'border-slate-200 bg-slate-100 text-slate-500';
  if (String(status).toLowerCase().includes('progress')) {
    return 'border-sky-200 bg-sky-50 text-sky-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function priorityClasses(priority?: string | null) {
  switch (priority) {
    case 'Critical':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'High':
      return 'border-orange-200 bg-orange-50 text-orange-700';
    case 'Low':
      return 'border-slate-200 bg-slate-50 text-slate-600';
    default:
      return 'border-sky-200 bg-sky-50 text-sky-700';
  }
}

function sourceLinkForType(type: string) {
  const value = type.toLowerCase();
  if (value.includes('rcsa') || value === 'csa') return '/rcsa';
  if (value.includes('icofr')) return '/icofr/testing-plan';
  if (value === 'tod') return '/tod';
  if (value === 'toe') return '/toe';
  if (value.includes('map') || value.includes('remediation') || value.includes('retest')) return '/remediation';
  if (value.includes('certification')) return '/certification';
  if (value.includes('task')) return '/tasks';
  return '/calendar';
}

function emptyForm() {
  const today = todayKey();
  return {
    id: '',
    title: '',
    type: 'ICOFR Testing',
    startDate: today,
    dueDate: today,
    ownerName: '',
    reviewerName: '',
    priority: 'Medium',
    status: 'Planned',
    link: '/icofr/testing-plan',
    notes: ''
  };
}

export default function CalendarPage() {
  const { data, loading, error, refresh } = useAssuranceData(['calendar']);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'agenda' | 'month'>('agenda');
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const events = useMemo<CalendarEvent[]>(() => {
    if (!data) return [];
    const rows: CalendarEvent[] = [];

    for (const item of data.campaigns || []) {
      const date = dateKey(item.dueDate);
      if (!date) continue;
      rows.push({
        id: 'campaign-' + item.id,
        date,
        startDate: dateKey(item.startDate) || null,
        dueDate: date,
        type: item.type || 'RCSA',
        title: item.name,
        status: item.status || 'Planned',
        owner: item.ownerName || 'Unassigned',
        reviewer: item.reviewerName || null,
        priority: 'High',
        link: '/rcsa',
        source: 'RCSA / CSA Campaign',
        sourceId: item.id,
        editable: false
      });
    }

    for (const item of data.testingPlanItems || []) {
      const date = dateKey(item.dueDate);
      if (!date) continue;
      rows.push({
        id: 'plan-' + item.id,
        date,
        startDate: dateKey(item.plannedStartDate) || null,
        dueDate: date,
        type: 'ICOFR Testing',
        title:
          (item.control?.controlCode || 'Control') +
          ' · ' +
          (item.control?.name || item.testType || 'Testing'),
        status: item.derivedExecutionStatus || item.status || 'Planned',
        owner: item.testerName || 'Unassigned',
        reviewer: item.reviewerName || null,
        priority: item.priority || (item.control?.keyControl ? 'High' : 'Medium'),
        link:
          item.testType === 'ToD'
            ? '/tod'
            : item.testType === 'ToE'
              ? '/toe'
              : '/icofr/testing-plan',
        source: 'ICOFR Testing Plan',
        sourceId: item.id,
        editable: false
      });
    }

    for (const item of data.toeTests || []) {
      const date = dateKey(item.testedAt);
      if (!date) continue;
      rows.push({
        id: 'toe-' + item.id,
        date,
        dueDate: date,
        type: 'ToE',
        title: item.testId || item.control?.name || 'Test of Effectiveness',
        status: item.status || item.finalConclusion || 'Recorded',
        owner: item.testerName || 'Unassigned',
        reviewer: item.reviewerName || null,
        priority: item.control?.isKeyControl ? 'High' : 'Medium',
        link: '/toe',
        source: 'ToE',
        sourceId: item.id,
        editable: false
      });
    }

    for (const item of data.actionPlans || []) {
      const date = dateKey(item.revisedDueDate || item.originalDueDate);
      if (!date) continue;
      rows.push({
        id: 'map-' + item.id,
        date,
        dueDate: date,
        type: 'Remediation / MAP',
        title:
          (item.mapId || 'MAP') +
          (item.issue?.title ? ' · ' + item.issue.title : ''),
        status: item.status || 'Draft',
        owner: item.actionOwner || 'Unassigned',
        reviewer: item.approverName || null,
        priority:
          String(item.issue?.severity || '').toLowerCase() === 'critical' ? 'Critical' : 'High',
        link: '/remediation',
        source: 'Management Action Plan',
        sourceId: item.id,
        editable: false
      });
    }

    for (const item of data.retests || []) {
      const date = dateKey(item.retestedAt);
      if (!date) continue;
      rows.push({
        id: 'retest-' + item.id,
        date,
        dueDate: date,
        type: 'Retest',
        title: item.retestId || 'Retest',
        status: item.result || 'Recorded',
        owner: item.testerName || 'Unassigned',
        reviewer: item.reviewerName || null,
        priority: 'High',
        link: '/remediation',
        source: 'Retest',
        sourceId: item.id,
        editable: false
      });
    }

    for (const item of data.attestations || []) {
      const date = dateKey(item.signedAt || item.updatedAt || item.createdAt);
      if (!date) continue;
      rows.push({
        id: 'att-' + item.id,
        date,
        dueDate: date,
        type: 'Certification',
        title: item.period || 'Certification / Attestation',
        status: item.status || item.overallOpinion || 'Recorded',
        owner: [item.cfoName, item.ceoName].filter(Boolean).join(' / ') || 'Not specified',
        priority: 'High',
        link: '/certification',
        source: 'Certification',
        sourceId: item.id,
        editable: false
      });
    }

    for (const item of data.tasks || []) {
      const date = dateKey(item.dueDate);
      if (!date) continue;
      rows.push({
        id: 'task-' + item.id,
        date,
        dueDate: date,
        type: item.type || 'Task',
        title: item.title || 'Assurance Task',
        status: item.status || 'Open',
        owner: item.user?.name || item.assigneeName || 'Unassigned',
        priority: item.priority || 'Medium',
        link: item.link || '/tasks',
        source: 'Assurance Task',
        sourceId: item.id,
        editable: false
      });
    }

    for (const item of data.calendarEvents || []) {
      const date = dateKey(item.dueDate);
      if (!date) continue;
      rows.push({
        id: 'manual-' + item.id,
        date,
        startDate: dateKey(item.startDate) || null,
        dueDate: date,
        type: item.type || 'Other',
        title: item.title,
        status: item.status || 'Planned',
        owner: item.ownerName || 'Unassigned',
        reviewer: item.reviewerName || null,
        priority: item.priority || 'Medium',
        link: item.link || sourceLinkForType(item.type || ''),
        source: 'Manual Assurance Schedule',
        sourceId: item.id,
        editable: true,
        notes: item.notes || null
      });
    }

    const unique = new Map<string, CalendarEvent>();
    for (const row of rows) unique.set(row.id, row);

    return Array.from(unique.values()).sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      return a.title.localeCompare(b.title);
    });
  }, [data]);

  const today = todayKey();
  const plus30 = useMemo(() => {
    const parsed = asDate(today) || new Date();
    parsed.setDate(parsed.getDate() + 30);
    return dateKey(parsed.toISOString());
  }, [today]);

  const metrics = useMemo(() => {
    const total = events.length;
    const overdue = events.filter(
      event =>
        event.date < today &&
        !isCompletedStatus(event.status) &&
        !isCancelledStatus(event.status)
    ).length;
    const upcoming = events.filter(
      event =>
        event.date >= today &&
        event.date <= plus30 &&
        !isCompletedStatus(event.status) &&
        !isCancelledStatus(event.status)
    ).length;
    const completed = events.filter(event => isCompletedStatus(event.status)).length;
    return { total, overdue, upcoming, completed };
  }, [events, plus30, today]);

  const types = useMemo(
    () => ['ALL', ...Array.from(new Set(events.map(event => event.type))).sort()],
    [events]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter(event => {
      if (typeFilter !== 'ALL' && event.type !== typeFilter) return false;
      if (statusFilter === 'OVERDUE') {
        if (
          !(
            event.date < today &&
            !isCompletedStatus(event.status) &&
            !isCancelledStatus(event.status)
          )
        ) return false;
      } else if (statusFilter === 'UPCOMING') {
        if (
          !(
            event.date >= today &&
            event.date <= plus30 &&
            !isCompletedStatus(event.status) &&
            !isCancelledStatus(event.status)
          )
        ) return false;
      } else if (statusFilter === 'COMPLETED') {
        if (!isCompletedStatus(event.status)) return false;
      } else if (statusFilter !== 'ALL' && event.status !== statusFilter) {
        return false;
      }
      if (selectedDate && event.date !== selectedDate) return false;
      if (!term) return true;
      return [
        event.title,
        event.type,
        event.status,
        event.owner,
        event.reviewer,
        event.source,
        event.notes
      ]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(term));
    });
  }, [events, typeFilter, statusFilter, search, selectedDate, today, plus30]);

  const groupedAgenda = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>();
    for (const event of filtered) {
      const current = groups.get(event.date);
      if (current) current.push(event);
      else groups.set(event.date, [event]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const monthCells = useMemo(() => {
    const first = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
    const mondayIndex = (first.getDay() + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - mondayIndex);
    return Array.from({ length: 42 }).map((_, index) => {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      const key = [
        day.getFullYear(),
        String(day.getMonth() + 1).padStart(2, '0'),
        String(day.getDate()).padStart(2, '0')
      ].join('-');
      const dayEvents = events.filter(event => event.date === key);
      return {
        key,
        date: day,
        inMonth: day.getMonth() === monthAnchor.getMonth(),
        events: dayEvents
      };
    });
  }, [monthAnchor, events]);

  const openCreate = () => {
    setActionError('');
    setActionMessage('');
    setForm(emptyForm());
    setEditing({});
  };

  const openEdit = (event: CalendarEvent) => {
    if (!event.editable || !event.sourceId) return;
    setActionError('');
    setActionMessage('');
    setForm({
      id: event.sourceId,
      title: event.title,
      type: event.type,
      startDate: event.startDate || event.date,
      dueDate: event.dueDate || event.date,
      ownerName: event.owner,
      reviewerName: event.reviewer || '',
      priority: event.priority || 'Medium',
      status: event.status || 'Planned',
      link: event.link || sourceLinkForType(event.type),
      notes: event.notes || ''
    });
    setEditing(event);
  };

  const saveEvent = async () => {
    setSaving(true);
    setActionError('');
    setActionMessage('');

    try {
      const response = await fetch('/api/assurance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'SAVE_CALENDAR_EVENT',
          ...form
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save assurance schedule event.');

      setEditing(null);
      setActionMessage(
        form.id ? 'Assurance schedule event updated.' : 'Assurance schedule event created.'
      );
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to save assurance schedule event.');
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async () => {
    if (!form.id) return;
    setSaving(true);
    setActionError('');
    setActionMessage('');

    try {
      const response = await fetch('/api/assurance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'DELETE_CALENDAR_EVENT',
          id: form.id
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to delete assurance schedule event.');

      setEditing(null);
      setActionMessage('Assurance schedule event deleted.');
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to delete assurance schedule event.');
    } finally {
      setSaving(false);
    }
  };

  const changeForm = (field: string, value: string) => {
    setForm(current => ({
      ...current,
      [field]: value,
      ...(field === 'type' && !current.id ? { link: sourceLinkForType(value) } : {})
    }));
  };

  return (
    <div className="space-y-5 pb-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600">
              <CalendarIcon className="h-4 w-4" />
              Assurance Calendar
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
              Enterprise Assurance Schedule
            </h1>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-500">
              Integrated schedule for RCSA/CSA, ICOFR testing, ToD/ToE, remediation, retest,
              certification, and assurance tasks. Source-derived events remain controlled in their
              originating module; additional coordination events can be maintained here.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refresh()}
              disabled={loading}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-brand-200 hover:text-brand-700 disabled:opacity-50"
              title="Refresh calendar"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Schedule Event
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Scheduled Records', value: metrics.total, icon: CalendarIcon, tone: 'text-brand-700 bg-brand-50 border-brand-100' },
          { label: 'Next 30 Days', value: metrics.upcoming, icon: Clock3, tone: 'text-sky-700 bg-sky-50 border-sky-100' },
          { label: 'Overdue', value: metrics.overdue, icon: AlertTriangle, tone: 'text-rose-700 bg-rose-50 border-rose-100' },
          { label: 'Completed', value: metrics.completed, icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-50 border-emerald-100' }
        ].map(metric => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className={`rounded-2xl border p-4 ${metric.tone}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wide">{metric.label}</span>
                <Icon className="h-4 w-4" />
              </div>
              <div className="mt-2 text-2xl font-black">{loading ? '…' : metric.value}</div>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search schedule, owner, source, or status..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs outline-none transition focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('agenda')}
              className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold ${
                viewMode === 'agenda'
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <List className="h-4 w-4" /> List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold ${
                viewMode === 'month'
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <Grid3X3 className="h-4 w-4" /> Month
            </button>
          </div>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {types.map(type => (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(type)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                typeFilter === type
                  ? 'bg-brand-600 text-white'
                  : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {type === 'ALL' ? 'All Events' : type}
            </button>
          ))}
        </div>

        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {[
            ['ALL', 'All Status'],
            ['UPCOMING', 'Next 30 Days'],
            ['OVERDUE', 'Overdue'],
            ['COMPLETED', 'Completed'],
            ['Planned', 'Planned'],
            ['In Progress', 'In Progress']
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={`whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[10px] font-bold ${
                statusFilter === value
                  ? 'border-slate-800 bg-slate-800 text-white'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}

          {selectedDate && (
            <button
              type="button"
              onClick={() => setSelectedDate('')}
              className="whitespace-nowrap rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold text-amber-700"
            >
              {displayDate(selectedDate)} ×
            </button>
          )}
        </div>
      </section>

      {(error || actionError || actionMessage) && (
        <div className="space-y-2">
          {error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              {error}
            </div>
          )}
          {actionError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {actionError}
            </div>
          )}
          {actionMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
              {actionMessage}
            </div>
          )}
        </div>
      )}

      {loading && !data ? (
        <DataLoadingState label="Loading assurance schedule..." variant="list" rows={4} />
      ) : viewMode === 'month' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() =>
                setMonthAnchor(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))
              }
              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setMonthAnchor(new Date(now.getFullYear(), now.getMonth(), 1));
                setSelectedDate(today);
              }}
              className="text-sm font-black capitalize text-slate-900"
            >
              {monthTitle(monthAnchor)}
            </button>

            <button
              type="button"
              onClick={() =>
                setMonthAnchor(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))
              }
              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 border-l border-t border-slate-200 text-center text-[9px] font-black uppercase tracking-wide text-slate-400 sm:text-[10px]">
            {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(day => (
              <div key={day} className="border-b border-r border-slate-200 bg-slate-50 px-1 py-2">
                {day}
              </div>
            ))}

            {monthCells.map(cell => {
              const active = selectedDate === cell.key;
              const isToday = cell.key === today;
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDate(active ? '' : cell.key)}
                  className={`min-h-[72px] border-b border-r border-slate-200 p-1.5 text-left align-top transition sm:min-h-[100px] sm:p-2 ${
                    active ? 'bg-brand-50 ring-2 ring-inset ring-brand-300' : 'bg-white hover:bg-slate-50'
                  } ${cell.inMonth ? '' : 'opacity-35'}`}
                >
                  <div
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${
                      isToday ? 'bg-brand-600 text-white' : 'text-slate-600'
                    }`}
                  >
                    {cell.date.getDate()}
                  </div>

                  <div className="mt-1 space-y-1">
                    {cell.events.slice(0, 3).map(event => (
                      <div
                        key={event.id}
                        className="truncate rounded bg-slate-100 px-1.5 py-1 text-[8px] font-bold text-slate-600 sm:text-[9px]"
                        title={event.title}
                      >
                        {event.title}
                      </div>
                    ))}
                    {cell.events.length > 3 && (
                      <div className="text-[8px] font-bold text-brand-700">
                        +{cell.events.length - 3} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedDate && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              Showing events for <strong>{displayDate(selectedDate)}</strong>. Switch to List view for full details.
            </div>
          )}
        </section>
      ) : groupedAgenda.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
          <CalendarIcon className="mx-auto h-9 w-9 text-slate-300" />
          <div className="mt-4 text-lg font-black text-slate-700">No scheduled records</div>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-500">
            No persisted schedule matches the current filters. Create a coordination event here, or
            create campaign, testing, remediation, certification, or task records in the originating module.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white"
            >
              <Plus className="h-4 w-4" /> Schedule Event
            </button>
            <Link
              href="/icofr/testing-plan"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600"
            >
              Open Testing Plan
            </Link>
            <Link
              href="/rcsa"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600"
            >
              Open RCSA
            </Link>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          {groupedAgenda.map(([date, dayEvents]) => (
            <section key={date} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Schedule Date
                  </div>
                  <div className="text-sm font-black text-slate-900">{displayDate(date)}</div>
                </div>
                <div className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
                  {dayEvents.length} event{dayEvents.length === 1 ? '' : 's'}
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {dayEvents.map(event => {
                  const overdue =
                    event.date < today &&
                    !isCompletedStatus(event.status) &&
                    !isCancelledStatus(event.status);

                  return (
                    <div key={event.id} className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-brand-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-brand-700">
                              {event.type}
                            </span>
                            <span className={`rounded-md border px-2 py-1 text-[9px] font-bold ${statusClasses(event.status, overdue)}`}>
                              {overdue ? 'Overdue' : event.status}
                            </span>
                            {event.priority && (
                              <span className={`rounded-md border px-2 py-1 text-[9px] font-bold ${priorityClasses(event.priority)}`}>
                                {event.priority}
                              </span>
                            )}
                          </div>

                          <h3 className="mt-2 text-sm font-black text-slate-900">{event.title}</h3>
                          <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
                            Owner: <strong className="text-slate-700">{event.owner}</strong>
                            {event.reviewer ? <> · Reviewer: <strong className="text-slate-700">{event.reviewer}</strong></> : null}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">
                            Source: {event.source}
                            {event.startDate && event.startDate !== event.date
                              ? ` · ${displayDate(event.startDate)} → ${displayDate(event.date)}`
                              : ''}
                          </div>
                          {event.notes && (
                            <p className="mt-2 line-clamp-2 text-[11px] text-slate-500">{event.notes}</p>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {event.editable && (
                            <button
                              type="button"
                              onClick={() => openEdit(event)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-bold text-sky-700"
                            >
                              <Pencil className="h-3.5 w-3.5" /> Update
                            </button>
                          )}
                          <Link
                            href={event.link || '/calendar'}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                          >
                            Open →
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4">
          <div className="max-h-[95vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-brand-700">
                  Assurance Calendar
                </div>
                <h2 className="mt-1 text-lg font-black text-slate-900">
                  {form.id ? 'Update Schedule Event' : 'Schedule New Event'}
                </h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  Manual coordination events are stored in D1 and recorded in the audit trail.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={saving}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                aria-label="Close schedule editor"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-4 sm:p-6">
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Event Title *
                <input
                  value={form.title}
                  onChange={event => changeForm('title', event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-slate-800 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                  placeholder="e.g. Q4 Key Control ToE Review"
                />
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Event Type *
                  <select
                    value={form.type}
                    onChange={event => changeForm('type', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-slate-800 outline-none"
                  >
                    {EVENT_TYPES.map(type => <option key={type}>{type}</option>)}
                  </select>
                </label>

                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Priority
                  <select
                    value={form.priority}
                    onChange={event => changeForm('priority', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-slate-800 outline-none"
                  >
                    {PRIORITY_OPTIONS.map(priority => <option key={priority}>{priority}</option>)}
                  </select>
                </label>

                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Start Date *
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={event => changeForm('startDate', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-slate-800 outline-none"
                  />
                </label>

                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Due Date *
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={event => changeForm('dueDate', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-slate-800 outline-none"
                  />
                </label>

                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Owner *
                  <input
                    value={form.ownerName}
                    onChange={event => changeForm('ownerName', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-slate-800 outline-none"
                    placeholder="Responsible owner"
                  />
                </label>

                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Reviewer
                  <input
                    value={form.reviewerName}
                    onChange={event => changeForm('reviewerName', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-slate-800 outline-none"
                    placeholder="Reviewer / approver"
                  />
                </label>

                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Status
                  <select
                    value={form.status}
                    onChange={event => changeForm('status', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-slate-800 outline-none"
                  >
                    {STATUS_OPTIONS.map(status => <option key={status}>{status}</option>)}
                  </select>
                </label>

                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Internal Link
                  <input
                    value={form.link}
                    onChange={event => changeForm('link', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-slate-800 outline-none"
                    placeholder="/icofr/testing-plan"
                  />
                </label>
              </div>

              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Notes
                <textarea
                  value={form.notes}
                  onChange={event => changeForm('notes', event.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-slate-800 outline-none"
                  placeholder="Scope, dependency, evidence, or coordination notes"
                />
              </label>

              {actionError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {actionError}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-4 sm:flex-row sm:justify-between sm:px-6">
              <div>
                {form.id && (
                  <button
                    type="button"
                    onClick={deleteEvent}
                    disabled={saving}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 sm:w-auto"
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                )}
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEvent}
                  disabled={
                    saving ||
                    !form.title.trim() ||
                    !form.type ||
                    !form.startDate ||
                    !form.dueDate ||
                    !form.ownerName.trim()
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-700 disabled:bg-slate-300"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save Event'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
