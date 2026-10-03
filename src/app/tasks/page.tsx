'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckSquare,
  Clock3,
  Filter,
  ListChecks,
  RefreshCcw,
  Search,
  ShieldCheck
} from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';

const CLOSED_STATUSES = ['Completed', 'Closed', 'Accepted', 'Cancelled'];

function localDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isOpenStatus(status: unknown) {
  return !CLOSED_STATUSES.includes(String(status || ''));
}

function isOverdue(task: any) {
  if (!task?.dueDate || !isOpenStatus(task.status)) return false;
  return String(task.dueDate).slice(0, 10) < localDateKey();
}

function priorityLabel(value: unknown) {
  const labels: Record<string, string> = {
    Low: 'Rendah',
    Medium: 'Sedang',
    High: 'Tinggi',
    Critical: 'Kritis'
  };
  return labels[String(value || '')] || String(value || 'Sedang');
}

function statusLabel(value: unknown) {
  const labels: Record<string, string> = {
    Open: 'Terbuka',
    Planned: 'Direncanakan',
    Assigned: 'Ditugaskan',
    'Not Started': 'Belum Dimulai',
    'In Progress': 'Sedang Berjalan',
    Pending: 'Menunggu',
    Submitted: 'Diajukan',
    'Under Review': 'Dalam Reviu',
    Accepted: 'Diterima',
    Completed: 'Selesai',
    Closed: 'Ditutup',
    Cancelled: 'Dibatalkan',
    Draft: 'Draft',
    Overdue: 'Lewat Jatuh Tempo'
  };
  return labels[String(value || '')] || String(value || 'Terbuka');
}

function typeLabel(value: unknown) {
  const raw = String(value || 'Tugas Assurance');
  if (raw === 'Remediation MAP') return 'Remediasi MAP';
  if (raw === 'Workpaper Review') return 'Reviu Kertas Kerja';
  if (raw === 'External Audit PBC') return 'PBC Audit Eksternal';
  if (raw === 'RCSA') return 'RCSA';
  if (raw === 'CSA') return 'CSA';
  return raw
    .replace('ICOFR Testing', 'Pengujian ICOFR')
    .replace('Testing', 'Pengujian');
}

function priorityTone(value: unknown) {
  const priority = String(value || 'Medium');
  if (priority === 'Critical') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (priority === 'High') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (priority === 'Low') return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-sky-200 bg-sky-50 text-sky-700';
}

function formatDueDate(value: unknown) {
  if (!value) return 'Tanpa batas waktu';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

export default function TasksPage() {
  const { data, loading, error, refresh } = useAssuranceData(['tasks']);
  const tasks = data?.tasks || [];
  const [filter, setFilter] = useState('OPEN');
  const [query, setQuery] = useState('');

  const openCount = useMemo(
    () => tasks.filter((task: any) => isOpenStatus(task.status)).length,
    [tasks]
  );

  const overdueCount = useMemo(
    () => tasks.filter((task: any) => isOverdue(task)).length,
    [tasks]
  );

  const criticalCount = useMemo(
    () =>
      tasks.filter(
        (task: any) =>
          isOpenStatus(task.status) &&
          ['Critical', 'High'].includes(String(task.priority || ''))
      ).length,
    [tasks]
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return tasks
      .filter((task: any) => {
        if (filter === 'OVERDUE' && !isOverdue(task)) return false;
        if (filter === 'OPEN' && !isOpenStatus(task.status)) return false;

        if (!normalizedQuery) return true;
        const searchable = [
          task.title,
          task.type,
          task.status,
          task.priority,
          task.user?.name
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchable.includes(normalizedQuery);
      })
      .sort((a: any, b: any) => {
        const aOverdue = isOverdue(a) ? 1 : 0;
        const bOverdue = isOverdue(b) ? 1 : 0;
        if (aOverdue !== bOverdue) return bOverdue - aOverdue;

        const aDate = a.dueDate ? String(a.dueDate) : '9999-12-31';
        const bDate = b.dueDate ? String(b.dueDate) : '9999-12-31';
        return aDate.localeCompare(bDate);
      });
  }, [tasks, filter, query]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-600 sm:text-xs">
              <CheckSquare className="h-4 w-4" />
              Pusat Tugas
            </div>
            <h1 className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">
              Tugas Assurance & Eskalasi
            </h1>
            <p className="mt-1 max-w-4xl text-[11px] leading-5 text-slate-500 sm:text-xs">
              Mengonsolidasikan tugas persisten dari RCSA/CSA, rencana pengujian ICOFR,
              remediasi MAP, reviu kertas kerja, dan permintaan PBC audit eksternal.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-600 shadow-sm hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            title="Muat ulang data tugas"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Muat Ulang</span>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-[9px] font-bold text-slate-500">
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
            <ShieldCheck className="h-3 w-3" />
            Data operasional tersimpan
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
            Institusi aktif: {data?.institution?.shortName || data?.institution?.name || '—'}
          </span>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {[
          {
            label: 'Total Tugas',
            value: tasks.length,
            className: 'border-slate-200 bg-white text-slate-900'
          },
          {
            label: 'Terbuka',
            value: openCount,
            className: 'border-sky-200 bg-sky-50/50 text-sky-800'
          },
          {
            label: 'Lewat Jatuh Tempo',
            value: overdueCount,
            className: 'border-rose-200 bg-rose-50 text-rose-800'
          },
          {
            label: 'Prioritas Tinggi',
            value: criticalCount,
            className: 'border-amber-200 bg-amber-50 text-amber-800'
          }
        ].map(item => (
          <div
            key={item.label}
            className={`rounded-xl border p-3.5 shadow-sm sm:p-4 ${item.className}`}
          >
            <div className="text-[9px] font-black uppercase tracking-wide opacity-70 sm:text-[10px]">
              {item.label}
            </div>
            <div className="mt-1 text-xl font-black sm:text-2xl">{item.value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
            <Filter className="h-4 w-4 shrink-0 text-slate-400" />
            {[
              ['OPEN', 'Tugas Terbuka'],
              ['OVERDUE', 'Lewat Jatuh Tempo'],
              ['ALL', 'Semua Tugas']
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-[10px] font-black transition sm:text-xs ${
                  filter === value
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="relative block min-w-0 flex-1 lg:ml-auto lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Cari tugas, PIC, status, atau sumber..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-[11px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-black">Sebagian data tugas mungkin belum lengkap.</div>
            <div className="text-[10px]">{error}</div>
          </div>
        </div>
      )}

      {loading ? (
        <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {[1, 2, 3].map(item => (
            <div key={item} className="animate-pulse rounded-xl border border-slate-100 p-4">
              <div className="h-2.5 w-24 rounded bg-slate-200" />
              <div className="mt-3 h-3.5 w-2/3 rounded bg-slate-200" />
              <div className="mt-2 h-2.5 w-1/2 rounded bg-slate-100" />
            </div>
          ))}
        </section>
      ) : filtered.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center shadow-sm sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <ListChecks className="h-6 w-6" />
          </div>
          <h2 className="mt-3 text-sm font-black text-slate-800">
            {query ? 'Tidak ada tugas yang cocok dengan pencarian' : 'Belum ada tugas pada tampilan ini'}
          </h2>
          <p className="mx-auto mt-1 max-w-xl text-[10px] leading-5 text-slate-500 sm:text-[11px]">
            Total ARC hanya menampilkan tugas yang berasal dari workflow assurance aktual.
            Sistem tidak membuat data dummy untuk mengisi daftar ini.
          </p>

          {!query && tasks.length === 0 && (
            <div className="mx-auto mt-5 grid max-w-3xl grid-cols-1 gap-2 text-left sm:grid-cols-2">
              {[
                ['/rcsa', 'RCSA / CSA', 'Kelola assignment dan respons assessment.'],
                ['/icofr/testing-plan', 'Rencana Pengujian ICOFR', 'Tetapkan item ToD/ToE dan PIC pengujian.'],
                ['/remediation', 'Remediasi & MAP', 'Kelola tindakan perbaikan dan jatuh tempo.'],
                ['/icofr/workpaper-review', 'Reviu Kertas Kerja', 'Kelola tugas reviewer dan keputusan reviu.']
              ].map(([href, title, description]) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 transition hover:border-brand-200 hover:bg-brand-50"
                >
                  <div>
                    <div className="text-[10px] font-black text-slate-800">{title}</div>
                    <div className="mt-0.5 text-[9px] leading-4 text-slate-500">{description}</div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition group-hover:text-brand-600" />
                </Link>
              ))}
            </div>
          )}

          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black text-slate-600"
            >
              Hapus Pencarian
            </button>
          )}
        </section>
      ) : (
        <section className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
              {filtered.length} tugas ditampilkan
            </div>
            <div className="hidden text-[9px] text-slate-400 sm:block">
              Urutan: jatuh tempo terdekat
            </div>
          </div>

          {filtered.map((task: any) => {
            const overdue = isOverdue(task);
            const owner = task.user?.name || 'Belum ditugaskan';

            return (
              <article
                key={task.id}
                className={`rounded-xl border p-3.5 transition sm:p-4 ${
                  overdue
                    ? 'border-rose-200 bg-rose-50/40'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-cyan-700">
                        {typeLabel(task.type)}
                      </span>
                      {overdue && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[8px] font-black text-rose-700">
                          <AlertTriangle className="h-3 w-3" />
                          Lewat Jatuh Tempo
                        </span>
                      )}
                    </div>

                    <h3 className="mt-2 text-[12px] font-black leading-5 text-slate-900 sm:text-sm">
                      {task.title}
                    </h3>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-slate-500 sm:text-[10px]">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3 w-3" />
                        {task.dueDate ? `Batas waktu ${formatDueDate(task.dueDate)}` : 'Tanpa batas waktu'}
                      </span>
                      <span>PIC: <strong className="font-bold text-slate-600">{owner}</strong></span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <span className={`rounded-lg border px-2.5 py-1 text-[9px] font-black ${priorityTone(task.priority)}`}>
                      {priorityLabel(task.priority)}
                    </span>
                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-black text-slate-600">
                      {statusLabel(task.status)}
                    </span>
                    {task.link && (
                      <Link
                        href={task.link}
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-[9px] font-black text-white shadow-sm hover:bg-brand-700"
                      >
                        Buka Sumber
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
