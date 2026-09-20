'use client';

import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserCog,
  Users
} from 'lucide-react';
import { ROLE_TITLES, USER_ROLES, type UserRole } from '@/lib/access-control';
import { useRole } from '@/context/RoleContext';

type ManagedUser = {
  id: string;
  institutionId: string | null;
  orgUnitId: string | null;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  active: boolean;
  failedLoginCount: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
};

type OrgUnit = {
  id: string;
  code?: string;
  name?: string;
  type?: string;
};

const emptyForm = {
  name: '',
  email: '',
  password: '',
  role: 'ProcessOwner' as UserRole,
  department: '',
  orgUnitId: ''
};

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*_-';
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
}

export default function UserManagementPage() {
  const { currentUser } = useRole();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetUserId, setResetUserId] = useState('');
  const [resetPassword, setResetPassword] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [usersResponse, orgResponse] = await Promise.all([
        fetch('/api/admin/users', { cache: 'no-store' }),
        fetch('/api/organization', { cache: 'no-store' })
      ]);

      const usersPayload = await usersResponse.json().catch(() => ({}));
      if (!usersResponse.ok) throw new Error(usersPayload?.error || 'User list tidak tersedia.');

      setUsers(usersPayload.users || []);

      if (orgResponse.ok) {
        const orgPayload = await orgResponse.json();
        setOrgUnits(orgPayload.organizationUnits || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'User list tidak tersedia.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const unitMap = useMemo(
    () => new Map(orgUnits.map(unit => [unit.id, unit])),
    [orgUnits]
  );

  const submitNewUser = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'User tidak dapat dibuat.');

      setUsers(current => [...current, payload.user].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(emptyForm);
      setSuccess('User berhasil dibuat. Password sementara wajib diganti pada login pertama dan akses mengikuti role akun tersebut.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'User tidak dapat dibuat.');
    } finally {
      setSaving(false);
    }
  };

  const updateUser = async (
    userId: string,
    patch: Partial<Pick<ManagedUser, 'role' | 'department' | 'active'>> & { password?: string }
  ) => {
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...patch })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'User tidak dapat diperbarui.');

      setUsers(current => current.map(user => user.id === userId ? payload.user : user));
      setSuccess('Perubahan user tersimpan.');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'User tidak dapat diperbarui.');
      return false;
    }
  };

  const resetUserPassword = async (userId: string) => {
    if (resetPassword.length < 12) {
      setError('Password baru minimum 12 karakter.');
      return;
    }

    const ok = await updateUser(userId, { password: resetPassword });
    if (ok) {
      setResetUserId('');
      setResetPassword('');
      setSuccess('Password user berhasil di-reset. Semua sesi aktif dicabut dan user wajib mengganti password pada login berikutnya.');
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-brand-600">
              <ShieldCheck className="h-4 w-4" />
              Administration
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-950">User & Role Access Management</h1>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
              Setiap user memiliki credential dan satu role aktif. Role ditetapkan administrator dan tidak dapat diganti oleh user dari aplikasi.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <form onSubmit={submitNewUser} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Plus className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900">Create user</h2>
              <p className="text-[10px] text-slate-500">Credential terpisah untuk setiap pengguna.</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold text-slate-700">Full name</span>
              <input
                required
                value={form.name}
                onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold text-slate-700">Email / username</span>
              <input
                required
                type="email"
                value={form.email}
                onChange={event => setForm(current => ({ ...current, email: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold text-slate-700">Role</span>
              <select
                value={form.role}
                onChange={event => setForm(current => ({ ...current, role: event.target.value as UserRole }))}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-400"
              >
                {USER_ROLES.map(role => (
                  <option key={role} value={role}>{ROLE_TITLES[role]}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold text-slate-700">Organization unit</span>
              <select
                value={form.orgUnitId}
                onChange={event => {
                  const id = event.target.value;
                  const selected = orgUnits.find(unit => unit.id === id);
                  setForm(current => ({
                    ...current,
                    orgUnitId: id,
                    department: selected?.name || current.department
                  }));
                }}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-400"
              >
                <option value="">Not assigned</option>
                {orgUnits.map(unit => (
                  <option key={unit.id} value={unit.id}>
                    {unit.code ? unit.code + ' · ' : ''}{unit.name || unit.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold text-slate-700">Unit / department label</span>
              <input
                value={form.department}
                onChange={event => setForm(current => ({ ...current, department: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold text-slate-700">Initial password</span>
              <div className="flex gap-2">
                <input
                  required
                  minLength={12}
                  value={form.password}
                  onChange={event => setForm(current => ({ ...current, password: event.target.value }))}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 font-mono text-xs outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                />
                <button
                  type="button"
                  onClick={() => setForm(current => ({ ...current, password: generatePassword() }))}
                  className="rounded-xl border border-slate-200 px-3 text-[10px] font-black text-slate-600 hover:bg-slate-50"
                >
                  Generate
                </button>
              </div>
              <span className="mt-1.5 block text-[10px] text-slate-400">12–128 karakter dengan huruf besar, huruf kecil, angka, dan simbol. Password umum/default ditolak dan user wajib menggantinya pada login pertama.</span>
            </label>

            <button
              type="submit"
              disabled={saving}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-xs font-black text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              <UserCog className="h-4 w-4" />
              {saving ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-brand-600" />
              <div>
                <h2 className="text-sm font-black text-slate-900">Registered users</h2>
                <p className="text-[10px] text-slate-500">{users.length} account(s)</p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2].map(item => <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
              </div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">Belum ada user terdaftar.</div>
            ) : (
              users.map(user => {
                const unit = user.orgUnitId ? unitMap.get(user.orgUnitId) : null;
                const isSelf = user.id === currentUser.id;
                const locked = Boolean(user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now());

                return (
                  <div key={user.id} className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-black text-slate-900">{user.name}</div>
                          {isSelf && (
                            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[9px] font-black text-brand-700">YOU</span>
                          )}
                          {!user.active && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">INACTIVE</span>
                          )}
                          {locked && (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-black text-rose-700">LOCKED</span>
                          )}
                          {user.mustChangePassword && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-700">PASSWORD CHANGE</span>
                          )}
                        </div>
                        <div className="mt-1 truncate text-[11px] text-slate-500">{user.email}</div>
                        <div className="mt-1 text-[10px] text-slate-400">
                          {unit?.name || user.department || 'No unit assigned'}
                          {user.lastLoginAt ? ' · Last login ' + new Date(user.lastLoginAt).toLocaleString('id-ID') : ' · Never logged in'}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={user.role}
                          disabled={isSelf}
                          onChange={event => void updateUser(user.id, { role: event.target.value as UserRole })}
                          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-700 disabled:bg-slate-50 disabled:text-slate-400"
                        >
                          {USER_ROLES.map(role => (
                            <option key={role} value={role}>{ROLE_TITLES[role]}</option>
                          ))}
                        </select>

                        <button
                          type="button"
                          disabled={isSelf}
                          onClick={() => void updateUser(user.id, { active: !user.active })}
                          className={`h-9 rounded-lg border px-3 text-[10px] font-black disabled:cursor-not-allowed disabled:opacity-40 ${
                            user.active
                              ? 'border-rose-200 bg-rose-50 text-rose-700'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {user.active ? 'Deactivate' : 'Activate'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setResetUserId(user.id);
                            setResetPassword(generatePassword());
                          }}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-600 hover:bg-slate-50"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Reset password
                        </button>
                      </div>
                    </div>

                    {resetUserId === user.id && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-800">New password</div>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <input
                            value={resetPassword}
                            minLength={12}
                            onChange={event => setResetPassword(event.target.value)}
                            className="h-10 min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-3 font-mono text-xs outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => void resetUserPassword(user.id)}
                            className="h-10 rounded-lg bg-amber-700 px-4 text-[10px] font-black text-white"
                          >
                            Confirm reset
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setResetUserId('');
                              setResetPassword('');
                            }}
                            className="h-10 rounded-lg border border-amber-200 bg-white px-4 text-[10px] font-black text-amber-800"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </section>
    </div>
  );
}
