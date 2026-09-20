'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [configurationRequired, setConfigurationRequired] = useState(false);
  const [nextPath, setNextPath] = useState('/');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(safeNextPath(params.get('next')));
    setConfigurationRequired(params.get('configuration') === 'required');
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Login tidak dapat diproses.');
      }

      window.location.assign(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login tidak dapat diproses.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_38%),linear-gradient(180deg,#f8fbff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_90px_-44px_rgba(15,23,42,0.45)] lg:grid-cols-[1.05fr_0.95fr]">
          <section className="hidden min-h-[620px] flex-col justify-between bg-slate-950 p-10 text-white lg:flex">
            <div>
              <img
                src="/brand/total-arc-logo.svg"
                alt="Total ARC"
                className="h-16 w-auto max-w-[210px] rounded-xl bg-white px-3 py-2 object-contain"
              />
              <div className="mt-12 max-w-lg">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-sky-200">
                  <ShieldCheck className="h-4 w-4" />
                  Secure Role-Based Access
                </div>
                <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight">
                  Satu identitas pengguna.
                  <span className="block text-sky-300">Satu role yang ditetapkan.</span>
                </h1>
                <p className="mt-5 text-sm leading-7 text-slate-300">
                  Hak akses menu, fungsi, dan data Total ARC mengikuti role akun yang diberikan administrator.
                  Pengguna tidak dapat mengganti role dari dalam sesi aplikasi.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-[11px] text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="font-black text-white">Session</div>
                <div className="mt-1 leading-5">HTTP-only signed session</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="font-black text-white">RBAC</div>
                <div className="mt-1 leading-5">Role-specific navigation & API access</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="font-black text-white">Protection</div>
                <div className="mt-1 leading-5">Lockout after repeated failures</div>
              </div>
            </div>
          </section>

          <section className="flex min-h-[620px] items-center p-5 sm:p-8 lg:p-10">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8 lg:hidden">
                <img
                  src="/brand/total-arc-logo.svg"
                  alt="Total ARC"
                  className="h-14 w-auto max-w-[180px] object-contain"
                />
              </div>

              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-brand-600">
                Total ARC Secure Access
              </div>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Sign in</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Gunakan credential akun yang diberikan administrator institusi Anda.
              </p>

              {configurationRequired && (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                  Authentication deployment belum lengkap. Administrator sistem perlu mengatur secret authentication pada environment.
                </div>
              )}

              {error && (
                <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-700">
                  {error}
                </div>
              )}

              <form onSubmit={submit} className="mt-7 space-y-5">
                <label className="block">
                  <span className="mb-2 block text-xs font-black text-slate-700">Email</span>
                  <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3 shadow-sm focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-50">
                    <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                    <input
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                      placeholder="nama@perusahaan.co.id"
                      className="h-12 min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-black text-slate-700">Password</span>
                  <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3 shadow-sm focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-50">
                    <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                      className="h-12 min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-slate-900 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(current => !current)}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-sky-500 px-4 text-sm font-black text-white shadow-lg shadow-sky-100 transition hover:from-brand-700 hover:to-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  )}
                  {submitting ? 'Signing in…' : 'Sign in to Total ARC'}
                </button>
              </form>

              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-500">
                Role tidak dipilih pada halaman ini. Role melekat pada akun dan menentukan menu serta tindakan yang tersedia setelah login.
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
