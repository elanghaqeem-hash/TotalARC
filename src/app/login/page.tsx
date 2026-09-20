'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  ShieldCheck
} from 'lucide-react';
import { useRole } from '@/context/RoleContext';

export default function LoginPage() {
  const router = useRouter();
  const { refreshSession } = useRole();
  const [status, setStatus] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [returnTo, setReturnTo] = useState('/');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('returnTo');
    if (requested && requested.startsWith('/') && !requested.startsWith('//')) setReturnTo(requested);

    fetch('/api/auth/status', { cache: 'no-store' })
      .then(res => res.json())
      .then(body => setStatus(body))
      .catch(() => setStatus(null));
  }, []);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Sign-in failed.');

      await refreshSession();
      const destination = body.mustChangePassword ? '/profile?forcePasswordChange=1' : returnTo;
      router.replace(destination);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl lg:grid-cols-[0.95fr_1.05fr]">
        <section className="hidden bg-gradient-to-br from-slate-950 via-slate-900 to-brand-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <img src="/brand/total-arc-logo.svg" alt="Total ARC" className="h-14 w-auto brightness-0 invert" />
            <div className="mt-12 max-w-md">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Secure Access</div>
              <h1 className="mt-3 text-4xl font-black leading-tight">Total Assurance, Risk & Control.</h1>
              <p className="mt-4 text-sm leading-6 text-slate-300">
                Institution-scoped sessions, controlled roles, security event logging and protected access to sensitive assurance evidence.
              </p>
            </div>
          </div>
          <div className="space-y-3 text-xs text-slate-300">
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan-300" /> Signed HttpOnly session cookies</div>
            <div className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-cyan-300" /> Password hashing, lockout and session revocation</div>
            <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-cyan-300" /> No default or retrievable plaintext passwords</div>
          </div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md">
            <img src="/brand/total-arc-logo.svg" alt="Total ARC" className="mb-8 h-12 w-auto lg:hidden" />
            <div className="text-xs font-black uppercase tracking-[0.14em] text-brand-600">Sign in</div>
            <h2 className="mt-2 text-3xl font-black text-slate-900">Access Total ARC</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Use the credential created by your institution administrator.
            </p>

            {status && !status.secretReady && (
              <div className="mt-5 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <div>
                  Authentication secret is not configured yet. Complete <Link href="/security/setup" className="font-black underline">security setup</Link> first.
                </div>
              </div>
            )}

            {status && status.secretReady && (
              <div className="mt-5 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Session signing is configured. Enforcement is currently <strong>{status.enforce ? 'ON' : 'STAGED / OFF'}</strong>.
              </div>
            )}

            {error && (
              <div className="mt-5 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            <form onSubmit={signIn} className="mt-6 space-y-4">
              <label className="block text-xs font-bold text-slate-700">
                Email
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-3 font-normal outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                />
              </label>

              <label className="block text-xs font-bold text-slate-700">
                Password
                <div className="relative mt-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-3 pr-11 font-normal outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              <button
                disabled={loading || !email || !password || status?.secretReady === false}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="mt-6 border-t border-slate-200 pt-5 text-[10px] leading-4 text-slate-500">
              Repeated failed sign-ins trigger temporary account lockout. Passwords are never displayed, retrievable, or stored in plaintext.
              {status?.userCount === 0 && (
                <> No administrator exists yet. <Link href="/security/setup" className="font-black text-brand-700">Bootstrap the first administrator</Link>.</>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
