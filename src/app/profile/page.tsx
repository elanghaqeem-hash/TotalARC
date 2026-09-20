'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { useRole } from '@/context/RoleContext';

export default function ProfilePage() {
  const { currentUser, refreshSession } = useRole();
  const [profile, setProfile] = useState({
    displayName: currentUser.name || '',
    email: currentUser.email || '',
    mobile: '',
    jobTitle: currentUser.jobTitle || ''
  });
  const [password, setPassword] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setProfile(current => ({
      ...current,
      displayName: currentUser.name || '',
      email: currentUser.email || '',
      jobTitle: currentUser.jobTitle || ''
    }));
  }, [currentUser.name, currentUser.email, currentUser.jobTitle]);

  useEffect(() => {
    fetch('/api/profile', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to load profile.');
        const user = body.user;
        setProfile({
          displayName: user.displayName || '',
          email: user.email || '',
          mobile: user.mobile || '',
          jobTitle: user.jobTitle || ''
        });
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Unable to load profile.'));
  }, []);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'UPDATE_PROFILE', ...profile })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to update profile.');
      await refreshSession();
      setMessage('Profile information updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingPassword(true);
    setError('');
    setMessage('');
    try {
      if (password.newPassword !== password.confirmPassword) {
        throw new Error('New password confirmation does not match.');
      }
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'CHANGE_PASSWORD',
          currentPassword: password.currentPassword,
          newPassword: password.newPassword
        })
      });
      const body = await response.json();
      if (!response.ok) {
        const details = Array.isArray(body.details) ? ' ' + body.details.join(' ') : '';
        throw new Error((body.error || 'Unable to change password.') + details);
      }
      setPassword({ currentPassword: '', newPassword: '', confirmPassword: '' });
      await refreshSession();
      setMessage('Password changed. Previous sessions have been revoked.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change password.');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-brand-600">
          <UserRound className="h-4 w-4" /> User Profile
        </div>
        <h1 className="mt-1 text-2xl font-black text-slate-950">My Profile & Credential</h1>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Update your personal profile. Role, institution and organizational-unit access are controlled by authorized administrators.
        </p>
      </section>

      {currentUser.mustChangePassword && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs font-semibold leading-5 text-amber-900">
          Password change is mandatory before other Total ARC modules can be used.
        </div>
      )}

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> {message}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={saveProfile} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-black text-slate-900">Personal Information</h2>
            <p className="mt-1 text-[11px] text-slate-500">Self-service fields only.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">
              Employee ID
              <input disabled value={currentUser.employeeId || ''} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-normal text-slate-500" />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Username
              <input disabled value={currentUser.username} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-normal text-slate-500" />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Full Name *
              <input required value={profile.displayName} onChange={event => setProfile({ ...profile, displayName: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Email
              <input type="email" value={profile.email} onChange={event => setProfile({ ...profile, email: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Mobile
              <input value={profile.mobile} onChange={event => setProfile({ ...profile, mobile: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Job Title
              <input value={profile.jobTitle} onChange={event => setProfile({ ...profile, jobTitle: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
          </div>
          <button disabled={savingProfile} className="mt-5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
            {savingProfile ? 'Saving…' : 'Save Profile'}
          </button>
        </form>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-black text-slate-900">
              <ShieldCheck className="h-4 w-4 text-brand-600" /> Access Context
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Institution</div>
                <div className="mt-0.5 font-bold text-slate-800">{currentUser.institution.name}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Roles</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {currentUser.roles.map(role => (
                    <span key={role} className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-bold text-brand-700">{role.replaceAll('_', ' ')}</span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Unit Scope</div>
                <div className="mt-0.5 font-semibold text-slate-700">
                  {currentUser.roles.includes('PLATFORM_SUPER_ADMIN') || currentUser.unitIds.length === 0
                    ? 'Institution / role-defined scope'
                    : currentUser.unitIds.length + ' organizational unit(s) assigned'}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Tenant Database</div>
                <div className="mt-0.5 font-mono text-[11px] font-bold text-slate-700">{currentUser.institution.databaseBinding}</div>
              </div>
            </div>
          </section>

          <form onSubmit={changePassword} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-black text-slate-900">
              <KeyRound className="h-4 w-4 text-brand-600" /> Change Password
            </div>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">
              Minimum 12 characters with uppercase, lowercase, number and special character. Recent passwords cannot be reused.
            </p>
            <div className="mt-4 space-y-3">
              <input
                type="password"
                autoComplete="current-password"
                required
                placeholder="Current password"
                value={password.currentPassword}
                onChange={event => setPassword({ ...password, currentPassword: event.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs"
              />
              <input
                type="password"
                autoComplete="new-password"
                required
                placeholder="New password"
                value={password.newPassword}
                onChange={event => setPassword({ ...password, newPassword: event.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs"
              />
              <input
                type="password"
                autoComplete="new-password"
                required
                placeholder="Confirm new password"
                value={password.confirmPassword}
                onChange={event => setPassword({ ...password, confirmPassword: event.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs"
              />
            </div>
            <button disabled={savingPassword} className="mt-4 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
              {savingPassword ? 'Updating…' : 'Change Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
