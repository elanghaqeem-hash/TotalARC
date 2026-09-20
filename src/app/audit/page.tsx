'use client';

import React, { useEffect, useState } from 'react';
import { ClipboardCheck, Search } from 'lucide-react';
import { jsonRead } from '@/lib/client-read';
import { EMPTY_PAGINATION, RegisterPager, type PaginationMeta } from '@/components/common/RegisterPager';

export default function AuditTrailPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async (targetPage = page) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        pageSize: '50'
      });
      if (search.trim()) params.set('search', search.trim());

      const data = await jsonRead<any>(
        '/api/audit?' + params.toString(),
        { dedupe: false }
      );
      setRows(Array.isArray(data.auditLogs) ? data.auditLogs : []);
      setPagination(data.pagination || EMPTY_PAGINATION);
      setPage(targetPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audit Trail unavailable');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold uppercase text-brand-600">
          <ClipboardCheck className="h-4 w-4" />
          Audit Trail
        </div>
        <h1 className="mt-1 text-2xl font-black text-slate-900">
          Enterprise Change & Activity Log
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Authenticated mutation and analysis events are read directly from the persistent AuditLog register.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search actor, action, entity, record ID, or reason..."
            className="w-full rounded-lg border border-slate-200 bg-slate-100 py-2 pl-9 pr-4 text-xs outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
          {error}
        </div>
      )}

      <RegisterPager
        pagination={pagination}
        loading={loading}
        onPageChange={nextPage => void load(nextPage)}
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-3 text-left">Timestamp</th>
                <th className="p-3 text-left">Actor</th>
                <th className="p-3 text-left">Role</th>
                <th className="p-3 text-left">Action</th>
                <th className="p-3 text-left">Entity</th>
                <th className="p-3 text-left">Record</th>
                <th className="p-3 text-left">Reason</th>
                <th className="p-3 text-left">IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-400">
                    {loading ? 'Loading audit records…' : 'No audit records found.'}
                  </td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr key={row.id} className="border-t border-slate-100 align-top">
                    <td className="p-3 whitespace-nowrap">
                      {row.timestamp ? new Date(row.timestamp).toLocaleString('id-ID') : '—'}
                    </td>
                    <td className="p-3 font-semibold text-slate-800">{row.userName || '—'}</td>
                    <td className="p-3">{row.userRole || '—'}</td>
                    <td className="p-3 font-bold text-brand-700">{row.action || '—'}</td>
                    <td className="p-3">{row.entityType || '—'}</td>
                    <td className="p-3 font-mono text-[11px]">{row.recordId || '—'}</td>
                    <td className="p-3 max-w-[320px] whitespace-normal text-slate-600">{row.reason || '—'}</td>
                    <td className="p-3 font-mono text-[11px]">{row.ipAddress || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
