'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { KeyRound, ShieldCheck } from 'lucide-react';

export default function AdminBootstrapPage() {
  const [status, setStatus] = useState<{ configured?: boolean; userCount?: number }>({});
  const [form, setForm] = useState({
    bootstrapToken: '',
    name: '',
    email: '',
    password: ''
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadStatus = () =>
    fetch('/api/auth/status', { cache: 'no-store' })
      .then(res => res.json())
      .then(setStatus)
      .catch(() => undefined);

  useEffect(() => {
    void loadStatus();
  }, []);

  const submit = async (event: React.FormEvent) => {
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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to create administrator.');

      setMessage('Administrator created successfully. You can now sign in.');
      setForm({ bootstrapToken: '', name: '', email: '', password: '' });
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create administrator.');
    } finally {
      setSaving(false);
    }
  };

  const closed = Number(status.userCount || 0) > 0;

  return (
    <main className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">One-time setup</div>
            <h1 className="text-xl font-black text-slate-950">Initial Administrator</h1>
          </div>
        </div>

        <p className="mt-4 text-xs leading-5 text-slate-500">
          This page never creates a default account. It requires a server-side bootstrap token and closes permanently after the first user is created.
        </p>

        {!status.configured && !closed && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">
            AUTH_BOOTSTRAP_TOKEN is not configured on the Worker yet. Setup remains fail-closed.
          </div>
        )}

        {closed ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
            Administrator bootstrap is closed because a user already exists.
            <div className="mt-3">
              <Link href="/login" className="font-black text-emerald-900">Go to sign in →</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
            {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{message}</div>}

            <label className="block text-xs font-bold text-slate-700">
              Bootstrap Token
              <input
                required
                type="password"
                autoComplete="off"
                value={form.bootstrapToken}
                onChange={event => setForm({ ...form, bootstrapToken: event.target.value })}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold text-slate-700">
                Administrator Name
                <input
                  required
                  value={form.name}
                  onChange={event => setForm({ ...form, name: event.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Administrator Email
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={event => setForm({ ...form, email: event.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
            </div>

            <label className="block text-xs font-bold text-slate-700">
              Password
              <input
                required
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={event => setForm({ ...form, password: event.target.value })}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
              <span className="mt-1 block text-[10px] font-normal text-slate-500">
                Minimum 12 characters with upper-case, lower-case, number, and special character.
              </span>
            </label>

            <button
              type="submit"
              disabled={saving || !status.configured}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" />
              {saving ? 'Creating…' : 'Create Initial Administrator'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
