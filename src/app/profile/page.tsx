'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, Save, ShieldCheck, UserRound } from 'lucide-react';
import { useRole } from '@/context/RoleContext';

export default function ProfilePage() {
  const { currentUser, refreshSession, logout } = useRole();
  const [name, setName] = useState(currentUser.name || '');
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [required, setRequired] = useState(Boolean(currentUser.mustChangePassword));
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setName(currentUser.name || '');
    setRequired(Boolean(currentUser.mustChangePassword));
    const params = new URLSearchParams(window.location.search);
    if (params.get('password') === 'required') setRequired(true);
  }, [currentUser.name, currentUser.mustChangePassword]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Profile tidak dapat diperbarui.');
      await refreshSession();
      setMessage('Profile berhasil diperbarui.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profile tidak dapat diperbarui.');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('Konfirmasi password baru tidak sama.');
      return;
    }

    setChanging(true);
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'CHANGE_PASSWORD',
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Password tidak dapat diubah.');

      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage('Password berhasil diubah. Seluruh sesi lama telah dicabut; silakan login kembali.');
      window.setTimeout(() => void logout(), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password tidak dapat diubah.');
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-600">My Profile</div>
            <h1 className="mt-1 text-2xl font-black text-slate-950">{currentUser.name}</h1>
            <p className="mt-1 text-xs text-slate-500">
              {currentUser.roleTitle} · {currentUser.institutionName || 'Institution not assigned'}
              {currentUser.department ? ' · ' + currentUser.department : ''}
            </p>
          </div>
        </div>

        {required && (
          <div className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            Password change is mandatory before other protected Total ARC functions can be used. A successful change revokes every active session for this account.
          </div>
        )}
      </section>

      {error && (
        <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {message && (
        <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {message}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={saveProfile} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-brand-600" />
            <div>
              <h2 className="text-sm font-black text-slate-900">Profile Information</h2>
              <p className="text-[10px] text-slate-500">Email, role, institution and organization unit remain administrator-controlled.</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold text-slate-700">Full name</span>
              <input required value={name} onChange={event => setName(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Email</div>
                <div className="mt-1 truncate text-xs font-bold text-slate-700">{currentUser.email}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Role</div>
                <div className="mt-1 text-xs font-bold text-slate-700">{currentUser.roleTitle}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Institution</div>
                <div className="mt-1 text-xs font-bold text-slate-700">{currentUser.institutionName || '—'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Organization unit</div>
                <div className="mt-1 text-xs font-bold text-slate-700">{currentUser.department || '—'}</div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button disabled={saving || !name.trim()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>

        <form onSubmit={changePassword} className={`rounded-2xl border bg-white p-5 shadow-sm ${required ? 'border-amber-300 ring-4 ring-amber-50' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-700" />
            <div>
              <h2 className="text-sm font-black text-slate-900">Change Password</h2>
              <p className="text-[10px] text-slate-500">Password history and session revocation are enforced server-side.</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold text-slate-700">Current password</span>
              <input type="password" autoComplete="current-password" required value={passwordForm.currentPassword} onChange={event => setPasswordForm(current => ({ ...current, currentPassword: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold text-slate-700">New password</span>
              <input type="password" autoComplete="new-password" required value={passwordForm.newPassword} onChange={event => setPasswordForm(current => ({ ...current, newPassword: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold text-slate-700">Confirm new password</span>
              <input type="password" autoComplete="new-password" required value={passwordForm.confirmPassword} onChange={event => setPasswordForm(current => ({ ...current, confirmPassword: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50" />
            </label>

            <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-[10px] leading-4 text-slate-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
              12–128 characters, with uppercase, lowercase, number and symbol. Common/default passwords, email-derived passwords and the last five passwords are rejected.
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button disabled={changing} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">
              <KeyRound className="h-4 w-4" /> {changing ? 'Changing…' : 'Change password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
