'use client';

import React, { useState } from 'react';
import { Shield, LockKeyhole } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Sign-in failed');
        return;
      }
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.assign(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
    } catch {
      setError('Unable to reach authentication service');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-600 to-cyan-400 flex items-center justify-center shadow-lg">
            <Shield className="w-7 h-7" />
          </div>
          <div>
            <div className="font-black text-2xl tracking-tight">TOTAL <span className="text-sky-400">ARC</span></div>
            <div className="text-xs text-slate-400">Secure Assurance, Risk & Control Platform</div>
          </div>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl p-6 space-y-5 border border-slate-200">
          <div>
            <div className="flex items-center gap-2 text-slate-900 font-bold">
              <LockKeyhole className="w-4 h-4 text-brand-600" />
              Secure sign in
            </div>
            <p className="text-xs text-slate-500 mt-1">Use the account provisioned by your Total ARC administrator.</p>
          </div>

          {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</div>}

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Email</span>
            <input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Password</span>
            <input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </label>

          <button disabled={busy} type="submit" className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold text-sm rounded-lg py-2.5 transition-colors">
            {busy ? 'Validating…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
