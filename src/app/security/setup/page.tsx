'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';

export default function SecuritySetupPage() {
  const [status, setStatus] = useState<any>(null);
  const [form, setForm] = useState({
    bootstrapToken: '',
    institutionId: '',
    email: '',
    name: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/status', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Security status unavailable.');
      setStatus(body);
      setForm(current => ({
        ...current,
        institutionId: current.institutionId || body.institutions?.[0]?.id || ''
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Security status unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const bootstrap = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Administrator bootstrap failed.');
      setMessage(body.message || 'Administrator created. You can sign in now.');
      setForm(current => ({ ...current, bootstrapToken: '', password: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Administrator bootstrap failed.');
    } finally {
      setSaving(false);
    }
  };

  const checklist = status
    ? [
        ['AUTH_SESSION_SECRET', status.secretReady, 'At least 32 characters; store only as a Cloudflare secret.'],
        ['AUTH_BOOTSTRAP_TOKEN', status.bootstrapReady, 'One-time bootstrap secret; remove/rotate after first administrator exists.'],
        ['First administrator', status.userCount > 0, 'Created through this page using the bootstrap token.'],
        ['AUTH_ENFORCE=true', status.enforce, 'Enable only after the administrator can sign in successfully.']
      ]
    : [];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-brand-600">
                <ShieldCheck className="h-4 w-4" /> Authentication Security Setup
              </div>
              <h1 className="mt-2 text-3xl font-black text-slate-900">Secure first-admin bootstrap</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Configure secrets outside the application, create the first platform SuperAdmin once, test sign-in, then turn enforcement on.
                Total ARC does not ship with a default username or password.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>

          {error && (
            <div className="mt-5 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          {message && (
            <div className="mt-5 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {message}
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {checklist.map(([label, ready, detail]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-black text-slate-800">{label}</div>
                {ready ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}
              </div>
              <div className="mt-2 text-[10px] leading-4 text-slate-500">{String(detail)}</div>
              <div className={`mt-3 text-[9px] font-black uppercase tracking-wide ${ready ? 'text-emerald-700' : 'text-amber-700'}`}>
                {ready ? 'Ready' : 'Required'}
              </div>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-slate-700" />
              <h2 className="text-sm font-black text-slate-900">Cloudflare secret prerequisites</h2>
            </div>
            <div className="mt-4 space-y-3 text-xs leading-5 text-slate-600">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="font-black text-slate-800">AUTH_SESSION_SECRET</div>
                <div className="mt-1 text-[10px]">Use a long random value of at least 32 characters. It signs session tokens and must never be committed to GitHub.</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="font-black text-slate-800">AUTH_BOOTSTRAP_TOKEN</div>
                <div className="mt-1 text-[10px]">Use a separate random value for first-admin creation. Rotate or remove it after bootstrap.</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="font-black text-slate-800">AUTH_ENFORCE</div>
                <div className="mt-1 text-[10px]">
                  Keep staged/off until the first administrator can sign in. Then set it to <strong>true</strong> to protect application pages and APIs through middleware.
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-[10px] leading-4 text-cyan-900">
              Passwords are hashed with PBKDF2-SHA-256 and per-user random salts. Plaintext passwords are not retrievable from the system.
            </div>
          </section>

          <form onSubmit={bootstrap} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-brand-600" />
              <div>
                <h2 className="text-sm font-black text-slate-900">Create first platform SuperAdmin</h2>
                <p className="text-[10px] text-slate-500">Available only while the user table is empty.</p>
              </div>
            </div>

            {status?.userCount > 0 ? (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-700">
                A user already exists, so bootstrap is permanently closed by application logic. Use <Link href="/login" className="font-black underline">Sign in</Link> and User Administration for subsequent accounts.
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Institution *
                  <select
                    required
                    value={form.institutionId}
                    onChange={event => setForm({ ...form, institutionId: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="">Select institution</option>
                    {(status?.institutions || []).map((item: any) => (
                      <option key={item.id} value={item.id}>{item.name || item.legalName}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700">
                  SuperAdmin name *
                  <input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  SuperAdmin email *
                  <input type="email" required value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Bootstrap token *
                  <input type="password" autoComplete="off" required value={form.bootstrapToken} onChange={event => setForm({ ...form, bootstrapToken: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Initial SuperAdmin password *
                  <div className="mt-1 flex gap-2">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={form.password}
                      onChange={event => setForm({ ...form, password: event.target.value })}
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                    />
                    <button type="button" onClick={() => setShowPassword(value => !value)} className="rounded-xl border border-slate-200 px-3 text-[10px] font-bold text-slate-600">
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <span className="mt-1 block text-[9px] font-normal text-slate-400">12–128 characters with uppercase, lowercase, number and symbol. Common/default passwords are rejected.</span>
                </label>
                <div className="sm:col-span-2 flex justify-end">
                  <button
                    disabled={saving || !status?.bootstrapAllowed}
                    className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40"
                  >
                    {saving ? 'Creating…' : 'Create First SuperAdmin'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="text-center text-xs text-slate-500">
          <Link href="/login" className="font-black text-brand-700">Back to sign in</Link>
        </div>
      </div>
    </main>
  );
}
