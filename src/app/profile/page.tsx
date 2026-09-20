'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Save,
  ShieldCheck,
  UserCircle
} from 'lucide-react';
import { useRole } from '@/context/RoleContext';

export default function ProfilePage() {
  const router = useRouter();
  const { currentUser, authenticated, loading, refreshSession } = useRole();
  const [profile, setProfile] = useState({ name: '', jobTitle: '', phone: '' });
  const [password, setPassword] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setProfile({
      name: currentUser.name || '',
      jobTitle: currentUser.jobTitle || '',
      phone: currentUser.phone || ''
    });
  }, [currentUser.name, currentUser.jobTitle, currentUser.phone]);

  useEffect(() => {
    if (!loading && !authenticated) router.replace('/login?returnTo=/profile');
  }, [loading, authenticated, router]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Profile update failed.');
      setMessage('Profile information updated.');
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profile update failed.');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (password.newPassword !== password.confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'CHANGE_PASSWORD',
          currentPassword: password.currentPassword,
          newPassword: password.newPassword
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Password change failed.');
      setPassword({ currentPassword: '', newPassword: '', confirmPassword: '' });
      await refreshSession();
      router.replace('/login?passwordChanged=1');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed.');
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Checking authenticated profile…</div>;
  }

  if (!authenticated) return null;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <UserCircle className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.12em] text-brand-600">My Profile</div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">{currentUser.name}</h1>
            <p className="mt-1 text-xs text-slate-500">
              {currentUser.roleTitle} · {currentUser.institutionName}
              {currentUser.department ? ' · ' + currentUser.department : ''}
            </p>
          </div>
        </div>

        {currentUser.mustChangePassword && (
          <div className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Password change is required before other protected modules can be used. Changing the password revokes all active sessions, including this one.
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <form onSubmit={saveProfile} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-brand-600" />
            <div>
              <h2 className="text-sm font-black text-slate-900">Profile Information</h2>
              <p className="text-[10px] text-slate-500">Email, role, institution and unit assignment are administrator-controlled.</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700 sm:col-span-2">
              Full name *
              <input required value={profile.name} onChange={event => setProfile({ ...profile, name: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Email
              <input readOnly value={currentUser.email} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-normal text-slate-500" />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Role
              <input readOnly value={currentUser.roleTitle} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-normal text-slate-500" />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Employee ID
              <input readOnly value={currentUser.employeeId} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-normal text-slate-500" />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Primary unit
              <input readOnly value={currentUser.department} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-normal text-slate-500" />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Job title
              <input value={profile.jobTitle} onChange={event => setProfile({ ...profile, jobTitle: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Phone
              <input value={profile.phone} onChange={event => setProfile({ ...profile, phone: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <button disabled={savingProfile} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">
              <Save className="h-4 w-4" /> {savingProfile ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>

        <form onSubmit={changePassword} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-700" />
            <div>
              <h2 className="text-sm font-black text-slate-900">Change Password</h2>
              <p className="text-[10px] text-slate-500">Recent passwords cannot be reused. All sessions are revoked after a successful change.</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block text-xs font-bold text-slate-700">
              Current password *
              <input type="password" autoComplete="current-password" required value={password.currentPassword} onChange={event => setPassword({ ...password, currentPassword: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              New password *
              <input type="password" autoComplete="new-password" required value={password.newPassword} onChange={event => setPassword({ ...password, newPassword: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Confirm new password *
              <input type="password" autoComplete="new-password" required value={password.confirmPassword} onChange={event => setPassword({ ...password, confirmPassword: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
            <div className="rounded-xl bg-slate-50 p-3 text-[10px] leading-4 text-slate-500">
              12–128 characters, uppercase, lowercase, number and symbol. Common/default passwords and recent password reuse are blocked.
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button disabled={savingPassword} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">
              <ShieldCheck className="h-4 w-4" /> {savingPassword ? 'Changing…' : 'Change password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
