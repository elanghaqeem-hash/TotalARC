'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LockKeyhole, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [status, setStatus] = useState<{ enforced?: boolean; configured?: boolean; userCount?: number }>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/auth/status', { cache: 'no-store' })
      .then(res => res.json())
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to sign in.');

      const next = searchParams.get('next');
      window.location.assign(next && next.startsWith('/') ? next : '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-600">Total ARC</div>
            <h1 className="text-xl font-black text-slate-950">Secure Sign In</h1>
          </div>
        </div>

        <p className="mt-4 text-xs leading-5 text-slate-500">
          Authentication uses server-side D1 accounts and opaque sessions. Browser role switching is not used as an authorization boundary.
        </p>

        {status.enforced === false && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">
            Authentication enforcement is currently staged off. Sign-in can be tested before the global security gate is enabled.
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-xs font-bold text-slate-700">
            Email
            <input
              required
              type="email"
              autoComplete="username"
              value={form.email}
              onChange={event => setForm({ ...form, email: event.target.value })}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <label className="block text-xs font-bold text-slate-700">
            Password
            <input
              required
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={event => setForm({ ...form, password: event.target.value })}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-black text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            <LockKeyhole className="h-4 w-4" />
            {saving ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {Number(status.userCount || 0) === 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4 text-center text-[11px] text-slate-500">
            Initial administrator not created yet.{' '}
            <Link href="/setup/admin" className="font-bold text-brand-700 hover:text-brand-800">
              Secure administrator setup
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
