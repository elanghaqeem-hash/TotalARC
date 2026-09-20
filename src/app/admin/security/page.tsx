'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  UserX
} from 'lucide-react';

export default function SecurityAdministrationPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/security', {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Security administration data tidak tersedia.');
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Security administration data tidak tersedia.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const eventTypes = useMemo(
    () => Array.from(new Set((data?.events || []).map((item: any) => String(item.eventType)))),
    [data]
  );

  const events = useMemo(() => {
    const rows = data?.events || [];
    return filter === 'ALL' ? rows : rows.filter((item: any) => item.eventType === filter);
  }, [data, filter]);

  const revoke = async (sessionId: string) => {
    if (!window.confirm('Cabut sesi aktif ini sekarang? Pengguna harus login kembali.')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/security', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'REVOKE_SESSION', sessionId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Session tidak dapat dicabut.');
      setMessage('Session berhasil dicabut.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Session tidak dapat dicabut.');
    } finally {
      setBusy(false);
    }
  };

  const metrics = data?.metrics || {};
  const passwordPolicy = data?.passwordPolicy || {};
  const sessionPolicy = data?.sessionPolicy || {};

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-brand-600">
              <LockKeyhole className="h-4 w-4" />
              Security Administration
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Authentication Sessions & Security Events</h1>
            <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-500">
              Monitor sesi aktif, lockout, login failure, perubahan password, dan pencabutan sesi. Data keamanan disimpan di Cloudflare D1 dan dibatasi ke institusi administrator.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </section>

      {error && (
        <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {message && (
        <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {message}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Active Sessions', metrics.activeSessions || 0, Clock3],
          ['Locked Users', metrics.lockedUsers || 0, LockKeyhole],
          ['Disabled Users', metrics.disabledUsers || 0, UserX],
          ['Failed Login Events', metrics.failedLoginEvents || 0, AlertCircle]
        ].map(([label, value, Icon]: any) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div>
              <Icon className="h-4 w-4 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-black text-slate-900">Password Governance</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-[10px]">
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-slate-400">Length</span><strong>{passwordPolicy.minimumLength || 12}–{passwordPolicy.maximumLength || 128}</strong></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-slate-400">History</span><strong>{passwordPolicy.historyDepth || 5} passwords</strong></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-slate-400">Complexity</span><strong>{passwordPolicy.complexityRequired ? 'Required' : '—'}</strong></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-slate-400">Default/common password</span><strong>Rejected</strong></div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-black text-slate-900">Session Governance</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-[10px]">
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-slate-400">Absolute lifetime</span><strong>{sessionPolicy.absoluteMinutes || 60} minutes</strong></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-slate-400">Server revocation</span><strong>{sessionPolicy.serverSideRevocation ? 'Enabled' : '—'}</strong></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-slate-400">Activity checkpoint</span><strong>{sessionPolicy.activityTouchMinutes || 5} minutes</strong></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-slate-400">Role/password reset</span><strong>Revokes sessions</strong></div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-sm font-black text-slate-900">Active Session Register</h2>
          <p className="mt-1 text-[10px] text-slate-500">Revoke a session after suspected misuse, offboarding, or access changes.</p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[900px] w-full text-[10px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-2.5 text-left">User</th>
                <th className="p-2.5 text-left">Role</th>
                <th className="p-2.5 text-left">Issued</th>
                <th className="p-2.5 text-left">Last Seen</th>
                <th className="p-2.5 text-left">Expires</th>
                <th className="p-2.5 text-left">IP / Client</th>
                <th className="p-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {(data?.activeSessions || []).map((item: any) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="p-2.5"><div className="font-black text-slate-800">{item.name}</div><div className="text-slate-400">{item.email}</div></td>
                  <td className="p-2.5 font-bold text-brand-700">{item.role}</td>
                  <td className="p-2.5">{item.issuedAt ? new Date(item.issuedAt).toLocaleString('id-ID') : '—'}</td>
                  <td className="p-2.5">{item.lastSeenAt ? new Date(item.lastSeenAt).toLocaleString('id-ID') : '—'}</td>
                  <td className="p-2.5">{item.expiresAt ? new Date(item.expiresAt).toLocaleString('id-ID') : '—'}</td>
                  <td className="max-w-[260px] p-2.5"><div>{item.ipAddress || 'IP unavailable'}</div><div className="truncate text-slate-400">{item.userAgent || 'Client unavailable'}</div></td>
                  <td className="p-2.5 text-right">
                    <button type="button" disabled={busy} onClick={() => void revoke(item.id)} className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 font-black text-rose-700 disabled:opacity-40">
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && (data?.activeSessions || []).length === 0 && (
            <div className="border-t border-slate-100 p-8 text-center text-xs text-slate-500">No active sessions.</div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-black text-slate-900">Security Event Log</h2>
            <p className="mt-1 text-[10px] text-slate-500">Latest 250 institution-scoped authentication and account events.</p>
          </div>
          <select value={filter} onChange={event => setFilter(event.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-[10px]">
            <option value="ALL">All event types</option>
            {eventTypes.map(item => <option key={String(item)} value={String(item)}>{String(item)}</option>)}
          </select>
        </div>

        <div className="mt-4 max-h-[620px] space-y-2 overflow-y-auto pr-1">
          {events.map((item: any) => (
            <div key={item.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-black text-slate-600">{item.eventType}</span>
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[8px] font-black text-brand-700">{item.role || 'N/A'}</span>
                  </div>
                  <div className="mt-1 truncate text-[10px] font-bold text-slate-700">{item.email || item.userId || 'System event'}</div>
                  {item.detail && <div className="mt-1 text-[9px] leading-4 text-slate-500">{item.detail}</div>}
                  <div className="mt-1 text-[8px] text-slate-400">{item.ipAddress || 'IP unavailable'} · {item.userAgent || 'Client unavailable'}</div>
                </div>
                <div className="shrink-0 text-[8px] text-slate-400">{item.createdAt ? new Date(item.createdAt).toLocaleString('id-ID') : '—'}</div>
              </div>
            </div>
          ))}
          {!loading && events.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">No events for this filter.</div>
          )}
        </div>
      </section>
    </div>
  );
}
