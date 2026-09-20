'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serviceReady, setServiceReady] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth/login', { cache: 'no-store' })
      .then(response => setServiceReady(response.ok))
      .catch(() => setServiceReady(false));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Sign-in failed.');
      if (body.mustChangePassword) {
        window.location.assign('/profile?password=required');
      } else {
        window.location.assign('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:flex lg:items-center lg:justify-center">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl lg:grid-cols-[0.92fr_1.08fr]">
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-7 text-white sm:p-10">
          <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl" />
          <div className="relative">
            <img src="/brand/total-arc-logo.svg" alt="Total ARC" className="h-14 w-auto brightness-0 invert" />
            <div className="mt-12 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-sky-200">
              <ShieldCheck className="h-4 w-4" /> Secure Access
            </div>
            <h1 className="mt-4 max-w-md text-3xl font-black leading-tight tracking-tight sm:text-4xl">
              Total Assurance, Risk & Control
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">
              Access is controlled by institution, organizational unit, role, permission and segregation-of-duty rules.
            </p>

            <div className="mt-8 space-y-3 text-xs text-slate-300">
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                <span>HTTP-only secure session, password policy, failed-login lockout and session expiry.</span>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                <span>Role-based menu access and unit-scoped responsibility assignment.</span>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                <span>Multi-institution tenant switching with dedicated database and folder namespace.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center bg-white p-6 sm:p-10 lg:p-12">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-7">
              <div className="text-[10px] font-black uppercase tracking-[0.15em] text-brand-600">Authentication</div>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Sign in to Total ARC</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Use your institution-issued username or registered email address.
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                {error}
              </div>
            )}

            {serviceReady === false && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                Authentication service is initializing. Retry shortly.
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <label className="block text-xs font-bold text-slate-700">
                Username / Email
                <input
                  autoComplete="username"
                  required
                  value={identifier}
                  onChange={event => setIdentifier(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm font-medium outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-50"
                  placeholder="username or email"
                />
              </label>

              <label className="block text-xs font-bold text-slate-700">
                Password
                <div className="relative mt-1.5">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-3 pr-11 text-sm font-medium outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-50"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-700"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              <button
                disabled={loading || serviceReady === false}
                className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-sky-100 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Validating credentials…' : 'Secure Sign In'}
              </button>
            </form>

            <div className="mt-6 rounded-xl bg-slate-50 p-3 text-[10px] leading-5 text-slate-500">
              Repeated failed sign-in attempts trigger temporary account lockout. Passwords are stored as salted PBKDF2 hashes and are never displayed after initial provisioning.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
