'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, LockKeyhole, Pencil, Plus, RefreshCcw, RotateCcw, ShieldCheck, Users } from 'lucide-react';

type Role = {
  key: string;
  name: string;
  category: string;
  description: string;
  privileged?: boolean;
  independentAssurance?: boolean;
};

type Unit = { id: string; code?: string; name: string; type?: string };
type UserRow = {
  id: string;
  employeeId?: string | null;
  username: string;
  displayName: string;
  email?: string | null;
  mobile?: string | null;
  jobTitle?: string | null;
  employmentStatus: string;
  status: string;
  authType: string;
  mustChangePassword: boolean;
  passwordExpiresAt?: string | null;
  temporaryCredentialExpiresAt?: string | null;
  lockedUntil?: string | null;
  lastLoginAt?: string | null;
  roles: string[];
  units: Array<{ orgUnitId: string; orgUnitName: string; accessMode: string }>;
};

const blank = {
  userId: '',
  employeeId: '',
  username: '',
  displayName: '',
  email: '',
  mobile: '',
  jobTitle: '',
  employmentStatus: 'Permanent',
  status: 'Active',
  roleKeys: [] as string[],
  unitIds: [] as string[]
};

export default function UserAdministrationPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [sodConflicts, setSodConflicts] = useState<any[]>([]);
  const [institution, setInstitution] = useState<any>(null);
  const [form, setForm] = useState(blank);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [credentialBusyUserId, setCredentialBusyUserId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/users', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to load users.');
      setUsers(body.users || []);
      setRoles(body.roles || []);
      setUnits(body.organizationUnits || []);
      setSodConflicts(body.sodConflicts || []);
      setInstitution(body.institution || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const stats = useMemo(() => ({
    active: users.filter(user => user.status === 'Active').length,
    privileged: users.filter(user =>
      user.roles.some(role => ['PLATFORM_SUPER_ADMIN','INSTITUTION_ADMIN','USER_ADMIN_MAKER','USER_ADMIN_APPROVER'].includes(role))
    ).length,
    locked: users.filter(user => user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()).length,
    mustChange: users.filter(user => user.mustChangePassword).length
  }), [users]);

  const selectedConflicts = useMemo(() => {
    const selected = new Set(form.roleKeys);
    return sodConflicts.filter(rule => selected.has(rule.left) && selected.has(rule.right));
  }, [form.roleKeys, sodConflicts]);

  const toggleRole = (roleKey: string) => {
    setForm(current => ({
      ...current,
      roleKeys: current.roleKeys.includes(roleKey)
        ? current.roleKeys.filter(item => item !== roleKey)
        : [...current.roleKeys, roleKey]
    }));
  };

  const toggleUnit = (unitId: string) => {
    setForm(current => ({
      ...current,
      unitIds: current.unitIds.includes(unitId)
        ? current.unitIds.filter(item => item !== unitId)
        : [...current.unitIds, unitId]
    }));
  };

  const edit = (user: UserRow) => {
    setTemporaryPassword('');
    setMessage('');
    setError('');
    setForm({
      userId: user.id,
      employeeId: user.employeeId || '',
      username: user.username,
      displayName: user.displayName,
      email: user.email || '',
      mobile: user.mobile || '',
      jobTitle: user.jobTitle || '',
      employmentStatus: user.employmentStatus || 'Permanent',
      status: user.status,
      roleKeys: user.roles || [],
      unitIds: (user.units || []).map(unit => unit.orgUnitId)
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reset = () => {
    setForm(blank);
    setTemporaryPassword('');
    setMessage('');
    setError('');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    setTemporaryPassword('');
    try {
      const selectedUnits = units
        .filter(unit => form.unitIds.includes(unit.id))
        .map(unit => ({ id: unit.id, name: unit.name, accessMode: 'WRITE' }));

      const payload = form.userId
        ? {
            actionType: 'UPDATE_ACCESS',
            userId: form.userId,
            roleKeys: form.roleKeys,
            units: selectedUnits,
            status: form.status,
            unlock: false
          }
        : {
            actionType: 'CREATE_USER',
            employeeId: form.employeeId,
            username: form.username,
            displayName: form.displayName,
            email: form.email,
            mobile: form.mobile,
            jobTitle: form.jobTitle,
            employmentStatus: form.employmentStatus,
            roleKeys: form.roleKeys,
            units: selectedUnits
          };

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) {
        const conflictText = Array.isArray(body.conflicts)
          ? ' ' + body.conflicts.map((item: any) => item.reason).join(' ')
          : '';
        throw new Error((body.error || 'Unable to save user.') + conflictText);
      }
      if (body.temporaryPassword) setTemporaryPassword(body.temporaryPassword);
      setMessage(form.userId ? 'User access updated.' : 'User created. Temporary credential is shown once below.');
      if (!form.userId) setForm(blank);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save user.');
    } finally {
      setSaving(false);
    }
  };

  const credentialAction = async (
    user: UserRow,
    actionType: 'RESET_CREDENTIAL' | 'FORCE_PASSWORD_CHANGE' | 'UNLOCK_USER'
  ) => {
    const prompts: Record<typeof actionType, string> = {
      RESET_CREDENTIAL:
        `Reset credential for ${user.displayName}? A new one-time temporary password will be generated, all active sessions will be revoked, and password change will be mandatory at next sign-in.`,
      FORCE_PASSWORD_CHANGE:
        `Require ${user.displayName} to change the password at next sign-in? All active sessions will be revoked.`,
      UNLOCK_USER:
        `Unlock ${user.displayName}'s account and clear failed sign-in counters?`
    };

    if (!window.confirm(prompts[actionType])) return;

    setCredentialBusyUserId(user.id);
    setError('');
    setMessage('');
    setTemporaryPassword('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType, userId: user.id })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to process credential action.');

      if (actionType === 'RESET_CREDENTIAL') {
        setTemporaryPassword(body.temporaryPassword || '');
        setMessage(
          `Credential reset for ${user.displayName}. Active sessions were revoked and the temporary credential must be changed on next sign-in.`
        );
      } else if (actionType === 'FORCE_PASSWORD_CHANGE') {
        setMessage(
          `${user.displayName} must change the password at next sign-in. Active sessions were revoked.`
        );
      } else {
        setMessage(`${user.displayName}'s account lockout was cleared.`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process credential action.');
    } finally {
      setCredentialBusyUserId('');
    }
  };

  const unlock = async (user: UserRow) => {
    await credentialAction(user, 'UNLOCK_USER');
  };

  const resetCredential = async (user: UserRow) => {
    await credentialAction(user, 'RESET_CREDENTIAL');
  };

  const forcePasswordChange = async (user: UserRow) => {
    await credentialAction(user, 'FORCE_PASSWORD_CHANGE');
  };

  const roleGroups = useMemo(() => {
    const groups = new Map<string, Role[]>();
    for (const role of roles) {
      const list = groups.get(role.category) || [];
      list.push(role);
      groups.set(role.category, list);
    }
    return Array.from(groups.entries());
  }, [roles]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-brand-600">
              <Users className="h-4 w-4" /> User & Access Administration
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Banking User Register & RBAC</h1>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
              Manage employee identity, role, organizational-unit access, credential status and segregation of duty for {institution?.name || 'the active institution'}.
            </p>
          </div>
          <button onClick={() => void load()} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-brand-700">
            <RefreshCcw className="h-4 w-4" />
          </button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Active Users', stats.active],
          ['Privileged Users', stats.privileged],
          ['Locked Accounts', stats.locked],
          ['Password Change Due', stats.mustChange]
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
            <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
      {message && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4" />{message}</div>}

      {temporaryPassword && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-xs font-black text-amber-900"><KeyRound className="h-4 w-4" />One-time temporary credential</div>
          <div className="mt-2 rounded-xl bg-white px-4 py-3 font-mono text-sm font-black text-slate-900 ring-1 ring-amber-200">{temporaryPassword}</div>
          <p className="mt-2 text-[10px] leading-4 text-amber-800">Provide this securely to the user. It is displayed only in this browser response, cannot be retrieved later, expires as a temporary credential after 24 hours, and must be changed at first sign-in.</p>
        </div>
      )}

      <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-900">{form.userId ? 'Edit User Access' : 'Create User Credential'}</h2>
            <p className="mt-0.5 text-[10px] text-slate-500">No dummy users are created. Each record represents an actual authorized user account.</p>
          </div>
          {form.userId && (
            <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600">
              <Plus className="h-3.5 w-3.5" /> New User
            </button>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-bold text-slate-700">Employee ID / NIP *
            <input required disabled={Boolean(form.userId)} value={form.employeeId} onChange={e=>setForm({...form,employeeId:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50" />
          </label>
          <label className="text-xs font-bold text-slate-700">Username *
            <input required disabled={Boolean(form.userId)} value={form.username} onChange={e=>setForm({...form,username:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50" />
          </label>
          <label className="text-xs font-bold text-slate-700">Full Name *
            <input required disabled={Boolean(form.userId)} value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50" />
          </label>
          <label className="text-xs font-bold text-slate-700">Email
            <input type="email" disabled={Boolean(form.userId)} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50" />
          </label>
          <label className="text-xs font-bold text-slate-700">Mobile
            <input disabled={Boolean(form.userId)} value={form.mobile} onChange={e=>setForm({...form,mobile:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50" />
          </label>
          <label className="text-xs font-bold text-slate-700">Job Title
            <input disabled={Boolean(form.userId)} value={form.jobTitle} onChange={e=>setForm({...form,jobTitle:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50" />
          </label>
          <label className="text-xs font-bold text-slate-700">Employment Status
            <select disabled={Boolean(form.userId)} value={form.employmentStatus} onChange={e=>setForm({...form,employmentStatus:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50">
              <option>Permanent</option><option>Contract</option><option>Outsourced</option><option>Consultant</option>
            </select>
          </label>
          {form.userId && (
            <label className="text-xs font-bold text-slate-700">User Status
              <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                <option>Active</option><option>Suspended</option><option>Disabled</option>
              </select>
            </label>
          )}
        </div>

        <div className="mt-6">
          <div className="text-xs font-black text-slate-900">Banking Role Assignment</div>
          <p className="mt-1 text-[10px] text-slate-500">Role combinations are validated against segregation-of-duty rules before saving.</p>
          <div className="mt-3 space-y-4">
            {roleGroups.map(([category, categoryRoles]) => (
              <div key={category}>
                <div className="mb-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{category}</div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {categoryRoles.map(role => (
                    <label key={role.key} className={`cursor-pointer rounded-xl border p-3 ${form.roleKeys.includes(role.key)?'border-brand-300 bg-brand-50':'border-slate-200 bg-white'}`}>
                      <div className="flex items-start gap-2">
                        <input type="checkbox" checked={form.roleKeys.includes(role.key)} onChange={()=>toggleRole(role.key)} className="mt-0.5 rounded border-slate-300" />
                        <div>
                          <div className="text-xs font-bold text-slate-800">{role.name}</div>
                          <div className="mt-1 text-[10px] leading-4 text-slate-500">{role.description}</div>
                          {(role.privileged || role.independentAssurance) && (
                            <div className="mt-1 text-[9px] font-bold uppercase tracking-wide text-brand-700">
                              {role.privileged ? 'Privileged' : 'Independent Assurance'}
                            </div>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedConflicts.length > 0 && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            <div className="flex items-center gap-2 font-black"><AlertTriangle className="h-4 w-4" /> Segregation of Duty conflict</div>
            <div className="mt-2 space-y-1 text-[10px] leading-4">
              {selectedConflicts.map((rule:any)=><div key={rule.left+rule.right}>{rule.left} × {rule.right}: {rule.reason}</div>)}
            </div>
          </div>
        )}

        <div className="mt-6">
          <div className="text-xs font-black text-slate-900">Organizational Unit Scope</div>
          <p className="mt-1 text-[10px] text-slate-500">Leave empty only for institution-wide roles. Business roles should be assigned to relevant units.</p>
          {units.length===0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500">No organizational units are registered yet.</div>
          ) : (
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {units.map(unit=>(
                <label key={unit.id} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${form.unitIds.includes(unit.id)?'border-sky-300 bg-sky-50':'border-slate-200'}`}>
                  <input type="checkbox" checked={form.unitIds.includes(unit.id)} onChange={()=>toggleUnit(unit.id)} className="mt-0.5 rounded border-slate-300" />
                  <div>
                    <div className="text-xs font-bold text-slate-800">{unit.code ? unit.code+' · ' : ''}{unit.name}</div>
                    <div className="text-[10px] text-slate-500">{unit.type || 'Organization Unit'}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button disabled={saving || selectedConflicts.length>0} className="rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">
            {saving ? 'Saving…' : form.userId ? 'Update Access' : 'Create User'}
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black text-slate-900">User Register</h2>
            <p className="text-[10px] text-slate-500">Identity, credential state, roles, unit scope and last sign-in.</p>
          </div>
          <ShieldCheck className="h-5 w-5 text-brand-600" />
        </div>
        {loading ? <div className="py-8 text-center text-xs text-slate-500">Loading users…</div> : users.length===0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">No users registered for this institution.</div>
        ) : (
          <div className="space-y-2">
            {users.map(user=>(
              <div key={user.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] font-black text-brand-700">{user.employeeId || 'NO-NIP'}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${user.status==='Active'?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600'}`}>{user.status}</span>
                      {user.mustChangePassword && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-700">Password change required</span>}
                      {user.lockedUntil && new Date(user.lockedUntil).getTime()>Date.now() && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-bold text-rose-700">Locked</span>}
                    </div>
                    <div className="mt-1 text-sm font-black text-slate-900">{user.displayName}</div>
                    <div className="text-[10px] text-slate-500">@{user.username} · {user.email || 'No email'} · {user.jobTitle || 'No title'}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {user.roles.map(role=><span key={role} className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600">{role.replaceAll('_',' ')}</span>)}
                    </div>
                    <div className="mt-2 text-[10px] text-slate-500">
                      Units: {user.units.length ? user.units.map(unit=>unit.orgUnitName).join(', ') : 'Institution / role-defined scope'} · Last login: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('id-ID') : 'Never'}
                      {user.mustChangePassword && user.temporaryCredentialExpiresAt
                        ? ` · Temporary credential expires: ${new Date(user.temporaryCredentialExpiresAt).toLocaleString('id-ID')}`
                        : ''}
                    </div>
                  </div>
                  <div className="flex max-w-full flex-wrap gap-2">
                    {user.lockedUntil && new Date(user.lockedUntil).getTime()>Date.now() && (
                      <button
                        type="button"
                        disabled={credentialBusyUserId === user.id}
                        onClick={()=>void unlock(user)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-[10px] font-bold text-rose-700 disabled:opacity-50"
                      >
                        <LockKeyhole className="h-3.5 w-3.5" /> Unlock
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={credentialBusyUserId === user.id}
                      onClick={()=>void forcePasswordChange(user)}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-800 disabled:opacity-50"
                    >
                      <KeyRound className="h-3.5 w-3.5" /> Force Change
                    </button>
                    <button
                      type="button"
                      disabled={credentialBusyUserId === user.id}
                      onClick={()=>void resetCredential(user)}
                      className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-bold text-sky-800 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Reset Credential
                    </button>
                    <button type="button" onClick={()=>edit(user)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 hover:text-brand-700">
                      <Pencil className="h-3.5 w-3.5" /> Edit Access
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
