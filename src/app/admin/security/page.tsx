'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, LockKeyhole, RefreshCcw, ShieldCheck } from 'lucide-react';

export default function SecurityAdministrationPage() {
  const [data, setData] = useState<any>(null);
  const [values, setValues] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/security', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to load security parameters.');
      setData(body);
      const current = Object.fromEntries((body.parameters || []).map((item:any)=>[item.parameterKey,item.parameterValue]));
      setValues({
        PASSWORD_EXPIRY_DAYS: current.PASSWORD_EXPIRY_DAYS || String(body.passwordPolicy?.expiryDays || 90),
        SESSION_MINUTES: current.SESSION_MINUTES || String(body.passwordPolicy?.sessionMinutes || 60),
        LOCKOUT_MINUTES: current.LOCKOUT_MINUTES || String(body.passwordPolicy?.lockoutMinutes || 15),
        MAX_FAILED_ATTEMPTS: current.MAX_FAILED_ATTEMPTS || String(body.passwordPolicy?.maxFailedAttempts || 5),
        REQUIRE_PRIVILEGED_MFA: current.REQUIRE_PRIVILEGED_MFA || 'false',
        ALLOW_LOCAL_AUTH: current.ALLOW_LOCAL_AUTH || 'true',
        USER_REVIEW_FREQUENCY_DAYS: current.USER_REVIEW_FREQUENCY_DAYS || '90'
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load security parameters.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(()=>{ void load(); },[]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/security', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({values})
      });
      const body=await response.json();
      if(!response.ok) throw new Error(body.error||'Unable to save security parameters.');
      setMessage('Institution security parameters saved.');
      await load();
    } catch(err){
      setError(err instanceof Error?err.message:'Unable to save security parameters.');
    } finally {
      setSaving(false);
    }
  };

  const groupedRoles = useMemo(()=>{
    const map=new Map<string,any[]>();
    for(const role of data?.roles||[]){
      const list=map.get(role.category)||[];
      list.push(role);
      map.set(role.category,list);
    }
    return Array.from(map.entries());
  },[data]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-brand-600"><ShieldCheck className="h-4 w-4"/>Security Administration</div>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Authentication, RBAC & SoD Parameters</h1>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">Security governance for {data?.institution?.name||'the active institution'}, including credential policy, session policy, banking role catalog and segregation-of-duty rules.</p>
          </div>
          <button onClick={()=>void load()} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-brand-700"><RefreshCcw className="h-4 w-4"/></button>
        </div>
      </section>

      {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
      {message&&<div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4"/>{message}</div>}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400"><KeyRound className="h-4 w-4"/>Login Success 24h</div>
          <div className="mt-1 text-2xl font-black text-slate-900">{data?.loginSummary?.success24h??0}</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-rose-600"><AlertTriangle className="h-4 w-4"/>Failed Login 24h</div>
          <div className="mt-1 text-2xl font-black text-rose-900">{data?.loginSummary?.failed24h??0}</div>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-sky-600"><LockKeyhole className="h-4 w-4"/>Tenant DB</div>
          <div className="mt-1 font-mono text-sm font-black text-sky-900">{data?.tenant?.databaseBinding||'—'}</div>
        </div>
      </div>

      <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-sm font-black text-slate-900">Institution Security Parameters</h2>
          <p className="mt-1 text-[10px] text-slate-500">Parameters are maintained by authorized institution administrators. Static baseline controls remain enforced even when an override is absent.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-bold text-slate-700">Password Expiry (days)
            <input type="number" min="30" max="365" value={values.PASSWORD_EXPIRY_DAYS||''} onChange={e=>setValues({...values,PASSWORD_EXPIRY_DAYS:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"/>
          </label>
          <label className="text-xs font-bold text-slate-700">Session Lifetime (minutes)
            <input type="number" min="15" max="480" value={values.SESSION_MINUTES||''} onChange={e=>setValues({...values,SESSION_MINUTES:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"/>
          </label>
          <label className="text-xs font-bold text-slate-700">Lockout Duration (minutes)
            <input type="number" min="5" max="120" value={values.LOCKOUT_MINUTES||''} onChange={e=>setValues({...values,LOCKOUT_MINUTES:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"/>
          </label>
          <label className="text-xs font-bold text-slate-700">Max Failed Attempts
            <input type="number" min="3" max="10" value={values.MAX_FAILED_ATTEMPTS||''} onChange={e=>setValues({...values,MAX_FAILED_ATTEMPTS:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"/>
          </label>
          <label className="text-xs font-bold text-slate-700">User Access Review (days)
            <input type="number" min="30" max="365" value={values.USER_REVIEW_FREQUENCY_DAYS||''} onChange={e=>setValues({...values,USER_REVIEW_FREQUENCY_DAYS:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"/>
          </label>
          <label className="text-xs font-bold text-slate-700">Local Authentication
            <select value={values.ALLOW_LOCAL_AUTH||'true'} onChange={e=>setValues({...values,ALLOW_LOCAL_AUTH:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><option value="true">Enabled</option><option value="false">Disabled</option></select>
          </label>
          <label className="text-xs font-bold text-slate-700">Privileged MFA Policy
            <select value={values.REQUIRE_PRIVILEGED_MFA||'false'} onChange={e=>setValues({...values,REQUIRE_PRIVILEGED_MFA:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><option value="false">Not Enforced Yet</option><option value="true">Required</option></select>
          </label>
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-900">
          MFA policy is stored as an institution parameter; a production MFA provider/enrollment flow must be configured before setting it to Required.
        </div>
        <div className="mt-5 flex justify-end"><button disabled={saving} className="rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving?'Saving…':'Save Security Parameters'}</button></div>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-900">Segregation of Duty Rules</h2>
        <p className="mt-1 text-[10px] text-slate-500">Conflicting role combinations are blocked during user access assignment.</p>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {(data?.sodConflicts||[]).map((rule:any)=>(
            <div key={rule.left+rule.right} className="rounded-xl border border-slate-200 p-3">
              <div className="text-[10px] font-black text-slate-800">{rule.left.replaceAll('_',' ')} × {rule.right.replaceAll('_',' ')}</div>
              <div className="mt-1 text-[10px] leading-4 text-slate-500">{rule.reason}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-900">Banking Role Catalog</h2>
        <p className="mt-1 text-[10px] text-slate-500">Standard role templates are reusable across institutions; actual users are created separately.</p>
        {loading?<div className="py-8 text-center text-xs text-slate-500">Loading role catalog…</div>:(
          <div className="mt-4 space-y-5">
            {groupedRoles.map(([category,roles]:any)=>(
              <div key={category}>
                <div className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{category}</div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {roles.map((role:any)=>(
                    <div key={role.key} className="rounded-xl border border-slate-200 p-3">
                      <div className="text-xs font-black text-slate-900">{role.name}</div>
                      <div className="mt-1 text-[10px] leading-4 text-slate-500">{role.description}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {role.privileged&&<span className="rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-bold text-rose-700">Privileged</span>}
                        {role.independentAssurance&&<span className="rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-bold text-sky-700">Independent Assurance</span>}
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">{role.permissions.length} permissions</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
