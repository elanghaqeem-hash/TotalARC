'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  Save,
  ShieldCheck,
  UserCog
} from 'lucide-react';

const emptyForm = {
  id: '',
  institutionId: '',
  email: '',
  name: '',
  employeeId: '',
  jobTitle: '',
  phone: '',
  role: 'ProcessOwner',
  primaryOrgUnitId: '',
  orgUnitIds: [] as string[],
  temporaryPassword: '',
  status: 'Active'
};

export default function UserAdministrationPage() {
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/users', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'User administration data unavailable.');
      setData(body);
      setForm(current => ({
        ...current,
        institutionId: current.institutionId || body.institutions?.[0]?.id || ''
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'User administration data unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const orgUnits = useMemo(
    () =>
      (data?.organizationUnits || []).filter(
        (item: any) => !form.institutionId || item.institutionId === form.institutionId
      ),
    [data, form.institutionId]
  );

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.users || []).filter((item: any) => {
      if (!needle) return true;
      return [item.name, item.email, item.role, item.institutionName, item.primaryOrgUnitName]
        .some(value => String(value || '').toLowerCase().includes(needle));
    });
  }, [data, query]);

  const selectUser = (user: any) => {
    setForm({
      id: user.id,
      institutionId: user.institutionId,
      email: user.email,
      name: user.name,
      employeeId: user.employeeId || '',
      jobTitle: user.jobTitle || '',
      phone: user.phone || '',
      role: user.role,
      primaryOrgUnitId: user.primaryOrgUnitId || '',
      orgUnitIds: (user.unitAccess || []).map((item: any) => String(item.orgUnitId)),
      temporaryPassword: '',
      status: user.status || 'Active'
    });
    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/users', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          form.id
            ? {
                id: form.id,
                name: form.name,
                employeeId: form.employeeId,
                jobTitle: form.jobTitle,
                phone: form.phone,
                role: form.role,
                primaryOrgUnitId: form.primaryOrgUnitId,
                orgUnitIds: form.orgUnitIds,
                status: form.status
              }
            : form
        )
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'User account could not be saved.');
      setMessage(form.id ? 'User account and access assignments updated.' : 'User created with a forced password change at first sign-in.');
      setForm({
        ...emptyForm,
        institutionId: form.institutionId || data?.institutions?.[0]?.id || ''
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'User account could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async (user: any) => {
    const temporaryPassword = window.prompt(
      'Enter a temporary password for ' + user.email + '. It must meet the 12-character complexity policy. The password will not be stored in plaintext.'
    );
    if (!temporaryPassword) return;

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'RESET_PASSWORD',
          userId: user.id,
          temporaryPassword
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Password reset failed.');
      setMessage('Temporary password set, all prior sessions revoked, and password change required at next sign-in.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setSaving(false);
    }
  };

  const toggleUnit = (id: string) => {
    setForm(current => ({
      ...current,
      orgUnitIds: current.orgUnitIds.includes(id)
        ? current.orgUnitIds.filter(item => item !== id)
        : [...current.orgUnitIds, id]
    }));
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-brand-600">
              <UserCog className="h-4 w-4" /> User Administration
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Institution users, roles & organizational access</h1>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
              Create named users without default credentials, assign one accountable role and explicit organization-unit access, suspend accounts, and issue non-retrievable temporary passwords.
            </p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-40">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </section>

      {error && <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      {message && <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{message}</div>}

      <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-900">{form.id ? 'Edit User' : 'Create User'}</h2>
            <p className="mt-1 text-[10px] text-slate-500">Role and unit access changes revoke active sessions so new authorization takes effect on the next sign-in.</p>
          </div>
          {form.id && (
            <button type="button" onClick={() => setForm({ ...emptyForm, institutionId: data?.institutions?.[0]?.id || '' })} className="text-[10px] font-bold text-slate-500">
              New user
            </button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-bold text-slate-700">
            Institution *
            <select disabled={Boolean(form.id)} required value={form.institutionId} onChange={event => setForm({ ...form, institutionId: event.target.value, primaryOrgUnitId: '', orgUnitIds: [] })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50">
              <option value="">Select institution</option>
              {(data?.institutions || []).map((item: any) => <option key={item.id} value={item.id}>{item.name || item.legalName}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">
            Full name *
            <input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Email *
            <input type="email" disabled={Boolean(form.id)} required value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50" />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Employee ID
            <input value={form.employeeId} onChange={event => setForm({ ...form, employeeId: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Job title
            <input value={form.jobTitle} onChange={event => setForm({ ...form, jobTitle: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Phone
            <input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Role *
            <select required value={form.role} onChange={event => setForm({ ...form, role: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
              {(data?.roles || []).map((role: string) => <option key={role}>{role}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">
            Primary organization unit
            <select value={form.primaryOrgUnitId} onChange={event => setForm({ ...form, primaryOrgUnitId: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
              <option value="">No primary unit</option>
              {orgUnits.map((item: any) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
            </select>
          </label>

          {!form.id && (
            <label className="text-xs font-bold text-slate-700 md:col-span-2">
              Temporary password *
              <input type="password" autoComplete="new-password" required value={form.temporaryPassword} onChange={event => setForm({ ...form, temporaryPassword: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              <span className="mt-1 block text-[9px] font-normal text-slate-400">User must change it at first sign-in. Total ARC never displays it again.</span>
            </label>
          )}

          {form.id && (
            <label className="text-xs font-bold text-slate-700">
              Account status *
              <select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                <option>Active</option>
                <option>Suspended</option>
                <option>Disabled</option>
              </select>
            </label>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Assigned organization units</div>
          {orgUnits.length === 0 ? (
            <div className="mt-2 text-[10px] text-slate-500">No organization units are registered for this institution yet.</div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {orgUnits.map((item: any) => (
                <label key={item.id} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-[10px] font-bold text-slate-700">
                  <input type="checkbox" checked={form.orgUnitIds.includes(item.id)} onChange={() => toggleUnit(item.id)} />
                  <span><span className="font-mono text-brand-700">{item.code}</span><br />{item.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-black text-white disabled:opacity-40">
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : form.id ? 'Update user' : 'Create user'}
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-black text-slate-900">User Register</h2>
            <p className="mt-1 text-[10px] text-slate-500">Passwords and password hashes are never returned by this API.</p>
          </div>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search user, email, role, unit…" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs sm:max-w-xs" />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[1100px] w-full text-[10px]">
            <thead className="bg-slate-100 text-slate-500">
              <tr>
                <th className="p-2.5 text-left">User</th>
                <th className="p-2.5 text-left">Institution</th>
                <th className="p-2.5 text-left">Role</th>
                <th className="p-2.5 text-left">Primary Unit</th>
                <th className="p-2.5 text-left">Assigned Units</th>
                <th className="p-2.5 text-left">Status</th>
                <th className="p-2.5 text-left">Password</th>
                <th className="p-2.5 text-left">Last Login</th>
                <th className="p-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user: any) => (
                <tr key={user.id} className="border-b border-slate-100">
                  <td className="p-2.5"><div className="font-bold text-slate-800">{user.name}</div><div className="text-slate-400">{user.email}</div></td>
                  <td className="p-2.5">{user.institutionShortName || user.institutionName}</td>
                  <td className="p-2.5 font-bold text-brand-700">{user.role}</td>
                  <td className="p-2.5">{user.primaryOrgUnitCode ? user.primaryOrgUnitCode + ' · ' + user.primaryOrgUnitName : '—'}</td>
                  <td className="p-2.5">{(user.unitAccess || []).length}</td>
                  <td className="p-2.5"><span className={`rounded-full border px-2 py-0.5 font-bold ${user.status === 'Active' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{user.status}</span></td>
                  <td className="p-2.5">{user.mustChangePassword ? <span className="font-bold text-amber-700">Change required</span> : 'Current'}</td>
                  <td className="p-2.5">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('id-ID') : 'Never'}</td>
                  <td className="p-2.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => selectUser(user)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-bold text-slate-600">Edit</button>
                      <button type="button" disabled={saving} onClick={() => void resetPassword(user)} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 px-2.5 py-1.5 font-bold text-amber-700 disabled:opacity-40"><KeyRound className="h-3 w-3" />Reset</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && filteredUsers.length === 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">No users match the current filter.</div>
        )}

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-[10px] leading-4 text-cyan-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          One user has one accountable role. Unit assignments are persisted now; domain-by-domain row filtering will use these assignments as the remaining tenant/unit isolation migration is completed.
        </div>
      </section>
    </div>
  );
}
