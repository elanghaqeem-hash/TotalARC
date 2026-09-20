'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  UserX
} from 'lucide-react';

export default function SecurityAdministrationPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [eventFilter, setEventFilter] = useState('ALL');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/security', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Security administration data unavailable.');
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Security administration data unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const events = useMemo(() => {
    const allEvents = data?.events || [];
    if (eventFilter === 'ALL') return allEvents;
    return allEvents.filter((item: any) => item.eventType === eventFilter);
  }, [data, eventFilter]);

  const eventTypes = useMemo(
    () => Array.from(new Set((data?.events || []).map((item: any) => String(item.eventType)))),
    [data]
  );

  const revoke = async (sessionId: string) => {
    if (!window.confirm('Revoke this active session immediately?')) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'REVOKE_SESSION', sessionId })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Session revocation failed.');
      setMessage('Session revoked.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Session revocation failed.');
    } finally {
      setSaving(false);
    }
  };

  const runtime = data?.runtime || {};
  const readiness = runtime.readiness || {};

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-700">
              <LockKeyhole className="h-4 w-4" /> Security Administration
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Authentication posture, sessions & security events</h1>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
              Monitor authentication readiness, failed sign-ins, account events and active sessions. Session revocation is persisted in Cloudflare D1.
            </p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-40">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </section>

      {error && <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      {message && <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{message}</div>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {[
          ['Enforcement', runtime.enforce ? 'ON' : 'STAGED'],
          ['Session secret', runtime.secretReady ? 'READY' : 'MISSING'],
          ['Users', runtime.userCount || 0],
          ['Active users', runtime.activeUsers || 0],
          ['Active sessions', data?.metrics?.activeSessions || 0],
          ['Locked users', data?.metrics?.lockedUsers || 0],
          ['Suspended', data?.metrics?.suspendedUsers || 0],
          ['Failed login events', data?.metrics?.recentFailedLogins || 0]
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="text-[8px] font-black uppercase tracking-wide text-slate-400">{label}</div>
            <div className="mt-1 text-lg font-black text-slate-900">{value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-900">Authentication Readiness</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Session signing secret', readiness.sessionSecret, 'AUTH_SESSION_SECRET is configured outside GitHub.'],
            ['Bootstrap secret', readiness.bootstrapSecret, 'AUTH_BOOTSTRAP_TOKEN is configured for controlled first-admin setup.'],
            ['First administrator', readiness.firstAdmin, 'At least one named user exists.'],
            ['Middleware enforcement', readiness.enforcement, 'AUTH_ENFORCE is true and protected routes require a signed session.']
          ].map(([label, ready, detail]) => (
            <div key={String(label)} className={`rounded-xl border p-3 ${ready ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-center gap-2 text-[10px] font-black text-slate-800">
                {ready ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}
                {label}
              </div>
              <div className="mt-1 text-[9px] leading-4 text-slate-600">{detail}</div>
            </div>
          ))}
        </div>
        {!runtime.enforce && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            Authentication infrastructure is staged but not enforcing every application route until AUTH_ENFORCE is enabled in Cloudflare. Enable only after secret configuration and first-admin sign-in are verified.
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand-600" />
            <div>
              <h2 className="text-sm font-black text-slate-900">Active Sessions</h2>
              <p className="text-[10px] text-slate-500">Revoke sessions after role changes, suspicious activity, or offboarding.</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {(data?.activeSessions || []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">No active sessions.</div>
            ) : (
              (data?.activeSessions || []).map((item: any) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-black text-slate-800">{item.name}</div>
                      <div className="truncate text-[9px] text-slate-500">{item.email} · {item.role} · {item.institutionShortName}</div>
                      <div className="mt-1 text-[9px] text-slate-400">
                        Last seen {item.lastSeenAt ? new Date(item.lastSeenAt).toLocaleString('id-ID') : '—'} · Expires {item.expiresAt ? new Date(item.expiresAt).toLocaleString('id-ID') : '—'}
                      </div>
                      <div className="mt-1 truncate text-[8px] text-slate-400">{item.ipAddress || 'IP unavailable'} · {item.userAgent || 'User agent unavailable'}</div>
                    </div>
                    <button type="button" disabled={saving} onClick={() => void revoke(item.id)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[9px] font-bold text-rose-600 disabled:opacity-40">
                      <UserX className="h-3 w-3" /> Revoke
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900">Security Event Log</h2>
              <p className="mt-1 text-[10px] text-slate-500">Recent login, password, bootstrap, session and account events.</p>
            </div>
            <select value={eventFilter} onChange={event => setEventFilter(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px]">
              <option value="ALL">All events</option>
              {eventTypes.map((item: any) => <option key={String(item)} value={String(item)}>{String(item)}</option>)}
            </select>
          </div>

          <div className="mt-4 max-h-[620px] space-y-2 overflow-y-auto pr-1">
            {events.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">No security events for this filter.</div>
            ) : (
              events.map((item: any) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[8px] font-black text-slate-600">{item.eventType}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black ${item.outcome === 'SUCCESS' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : item.outcome === 'FAILED' || item.outcome === 'DENIED' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{item.outcome}</span>
                      </div>
                      <div className="mt-1 text-[10px] font-bold text-slate-700">{item.email || item.userId || 'System event'}</div>
                      <div className="mt-1 text-[8px] text-slate-400">{item.ipAddress || 'IP unavailable'} · {item.userAgent || 'User agent unavailable'}</div>
                    </div>
                    <div className="shrink-0 text-right text-[8px] text-slate-400">{item.createdAt ? new Date(item.createdAt).toLocaleString('id-ID') : '—'}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-[10px] leading-4 text-cyan-900">
        <div className="flex items-start gap-2">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
          Session revocation is checked by authenticated administrative and profile endpoints. Middleware validates signed claims on every protected request; complete immediate revocation across all legacy domain APIs will be strengthened further as each API is migrated to database-backed session context.
        </div>
      </section>
    </div>
  );
}
