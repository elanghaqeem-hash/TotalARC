'use client';

import React, { useEffect, useState } from 'react';
import { Copy, KeyRound, UserPlus, Users } from 'lucide-react';

type UserRow = {
  id:string; name:string; email:string; role:string; department?:string|null; active:boolean;
  mustChangePassword:boolean; lastLoginAt?:string|null; lockedUntil?:string|null; createdAt:string;
};

export default function UsersPage() {
  const [users,setUsers]=useState<UserRow[]>([]);
  const [roles,setRoles]=useState<string[]>([]);
  const [message,setMessage]=useState('');
  const [credential,setCredential]=useState<{email:string;temporaryPassword:string}|null>(null);
  const [form,setForm]=useState({name:'',email:'',role:'ProcessOwner',department:''});

  const load=async()=>{
    const r=await fetch('/api/admin/users',{cache:'no-store'});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Unable to load users');
    setUsers(d.users||[]);setRoles(d.roles||[]);
  };
  useEffect(()=>{load().catch(e=>setMessage(e.message));},[]);

  const create=async(e:React.FormEvent)=>{
    e.preventDefault();setMessage('');setCredential(null);
    const r=await fetch('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'CREATE',...form})});
    const d=await r.json();if(!r.ok)return setMessage(d.error||'Unable to create user');
    setCredential({email:d.user.email,temporaryPassword:d.temporaryPassword});
    setForm({name:'',email:'',role:'ProcessOwner',department:''});
    await load();
  };

  const reset=async(user:UserRow)=>{
    setMessage('');setCredential(null);
    const r=await fetch('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'RESET_PASSWORD',id:user.id})});
    const d=await r.json();if(!r.ok)return setMessage(d.error||'Unable to reset password');
    setCredential({email:user.email,temporaryPassword:d.temporaryPassword});
    await load();
  };

  const setActive=async(user:UserRow,active:boolean)=>{
    setMessage('');
    const r=await fetch('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'SET_ACTIVE',id:user.id,active})});
    const d=await r.json();if(!r.ok)return setMessage(d.error||'Unable to update user');
    await load();
  };

  return <div className="space-y-6">
    <div><h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><Users className="w-5 h-5 text-brand-600"/>User Administration</h1><p className="text-xs text-slate-500 mt-1">Provision tenant users and enforce first-login password replacement. Role changes are server-side, not simulated in the browser.</p></div>

    {message&&<div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{message}</div>}
    {credential&&<div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs">
      <div className="font-bold text-amber-900">Temporary credential — shown for this operation</div>
      <div className="mt-2 text-amber-800">Email: <strong>{credential.email}</strong></div>
      <div className="mt-1 flex items-center gap-2"><code className="bg-white border border-amber-200 rounded px-2 py-1 font-bold">{credential.temporaryPassword}</code><button onClick={()=>navigator.clipboard.writeText(credential.temporaryPassword)} className="p-1.5 rounded hover:bg-amber-100"><Copy className="w-4 h-4"/></button></div>
      <div className="mt-2 text-[11px] text-amber-800">Deliver through an approved secure channel. The user must change it at first sign-in.</div>
    </div>}

    <form onSubmit={create} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2"><UserPlus className="w-4 h-4 text-brand-600"/><h2 className="text-sm font-bold text-slate-900">Provision User</h2></div>
      <div className="mt-4 grid md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
        <label className="font-semibold text-slate-700">Name *<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="font-semibold text-slate-700">Email *<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="font-semibold text-slate-700">Role *<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white">{roles.map(r=><option key={r}>{r}</option>)}</select></label>
        <label className="font-semibold text-slate-700">Department<input value={form.department} onChange={e=>setForm({...form,department:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      </div>
      <button className="mt-4 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg">Create Account</button>
    </form>

    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="bg-slate-50 text-slate-500"><tr><th className="text-left p-3">User</th><th className="text-left p-3">Role</th><th className="text-left p-3">Status</th><th className="text-left p-3">Last Sign-in</th><th className="text-right p-3">Actions</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {users.map(u=><tr key={u.id}>
            <td className="p-3"><div className="font-bold text-slate-900">{u.name}</div><div className="text-[11px] text-slate-500">{u.email}{u.department ? ' • ' + u.department : ''}</div></td>
            <td className="p-3">{u.role}</td>
            <td className="p-3"><div>{u.active?'Active':'Inactive'}</div>{u.mustChangePassword&&<div className="text-[10px] text-amber-700 mt-0.5">Password change required</div>}{u.lockedUntil&&new Date(u.lockedUntil)>new Date()&&<div className="text-[10px] text-rose-700 mt-0.5">Temporarily locked</div>}</td>
            <td className="p-3 text-slate-500">{u.lastLoginAt?new Date(u.lastLoginAt).toLocaleString('id-ID'):'Never'}</td>
            <td className="p-3"><div className="flex justify-end gap-2"><button onClick={()=>reset(u)} className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 bg-brand-50 border border-brand-200 px-2.5 py-1.5 rounded-lg"><KeyRound className="w-3.5 h-3.5"/>Reset</button><button onClick={()=>setActive(u,!u.active)} className={u.active ? 'text-[11px] font-bold px-2.5 py-1.5 rounded-lg border text-rose-700 bg-rose-50 border-rose-200' : 'text-[11px] font-bold px-2.5 py-1.5 rounded-lg border text-emerald-700 bg-emerald-50 border-emerald-200'}>{u.active?'Deactivate':'Activate'}</button></div></td>
          </tr>)}
          {!users.length&&<tr><td colSpan={5} className="p-8 text-center text-slate-400">No user account found.</td></tr>}
        </tbody>
      </table>
    </div>
  </div>;
}
