'use client';

import React, { useState } from 'react';
import { KeyRound, Shield } from 'lucide-react';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) return setError('New password confirmation does not match.');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to change password');
      window.location.assign('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to change password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-600 to-cyan-400 flex items-center justify-center">
            <Shield className="w-7 h-7" />
          </div>
          <div>
            <div className="font-black text-2xl">TOTAL <span className="text-sky-400">ARC</span></div>
            <div className="text-xs text-slate-400">Secure credential setup</div>
          </div>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl p-6 shadow-2xl space-y-4">
          <div>
            <div className="flex items-center gap-2 font-bold text-slate-900"><KeyRound className="w-4 h-4 text-brand-600" />Change password</div>
            <p className="text-xs text-slate-500 mt-1">Temporary credentials must be replaced before using Total ARC. Use at least 12 characters.</p>
          </div>
          {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</div>}
          <label className="block text-xs font-semibold text-slate-700">Current password<input required type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
          <label className="block text-xs font-semibold text-slate-700">New password<input required minLength={12} type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
          <label className="block text-xs font-semibold text-slate-700">Confirm new password<input required minLength={12} type="password" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
          <button disabled={busy} className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold text-sm rounded-lg py-2.5">{busy?'Updating…':'Update password'}</button>
        </form>
      </div>
    </div>
  );
}
