'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckSquare, Plus } from 'lucide-react';
import { useRole } from '@/context/RoleContext';

type TaskRow = {
  id:string; title:string; type:string; dueDate:string; priority:string; status:string; storedStatus:string;
  entityRef?:string|null; link?:string|null; user?:{id:string;name:string;role:string}|null;
};
type UserRow = { id:string; name:string; role:string };

export default function TasksPage() {
  const { currentUser } = useRole();
  const [tasks,setTasks]=useState<TaskRow[]>([]);
  const [users,setUsers]=useState<UserRow[]>([]);
  const [showForm,setShowForm]=useState(false);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({title:'',type:'Review',dueDate:'',priority:'Medium',userId:'',entityRef:'',link:''});

  const canCreate=['Admin','Reviewer','ProcessOwner'].includes(currentUser?.role||'');

  const load=async()=>{
    const[t,u]=await Promise.all([
      fetch('/api/tasks',{cache:'no-store'}),
      fetch('/api/users',{cache:'no-store'})
    ]);
    const td=await t.json();const ud=await u.json();
    if(!t.ok)throw new Error(td.error||'Unable to load tasks');
    if(!u.ok)throw new Error(ud.error||'Unable to load users');
    setTasks(td.tasks||[]);
    setUsers(ud.users||[]);
  };
  useEffect(()=>{load().catch(err=>setMessage(err.message));},[]);

  const create=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setMessage('');
    try{
      const res=await fetch('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'CREATE',...form})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Unable to create task');
      setForm({title:'',type:'Review',dueDate:'',priority:'Medium',userId:'',entityRef:'',link:''});
      setShowForm(false);
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:'Unable to create task');}
    finally{setBusy(false);}
  };

  const update=async(id:string,status:string)=>{
    setBusy(true);setMessage('');
    try{
      const res=await fetch('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'UPDATE_STATUS',id,status})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Unable to update task');
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:'Unable to update task');}
    finally{setBusy(false);}
  };

  const canUpdate=(task:TaskRow)=>{
    if(!currentUser)return false;
    if(['Admin','Reviewer'].includes(currentUser.role))return true;
    return Boolean(task.user?.id&&task.user.id===currentUser.id);
  };

  return <div className="space-y-6">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><CheckSquare className="w-5 h-5 text-brand-600"/>Task Center</h1>
        <p className="text-xs text-slate-500 mt-1">Persistent assignments and due dates. Overdue is derived from due date and cannot be manually selected.</p>
      </div>
      {canCreate&&<button onClick={()=>setShowForm(v=>!v)} className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-xs font-bold px-3 py-2 rounded-lg"><Plus className="w-4 h-4"/>New Task</button>}
    </div>

    {message&&<div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">{message}</div>}

    {showForm&&canCreate&&<form onSubmit={create} className="bg-white border border-slate-200 rounded-xl p-5 grid md:grid-cols-2 gap-3 text-xs">
      <label className="font-semibold text-slate-700 md:col-span-2">Title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <label className="font-semibold text-slate-700">Type<select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option>CSA</option><option>ToD</option><option>ToE</option><option>Review</option><option>MAP</option><option>Retest</option><option>Certification</option></select></label>
      <label className="font-semibold text-slate-700">Due date<input required type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <label className="font-semibold text-slate-700">Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option>Critical</option><option>High</option><option>Medium</option></select></label>
      <label className="font-semibold text-slate-700">Assignee<select value={form.userId} onChange={e=>setForm({...form,userId:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option value="">Unassigned</option>{users.map(u=><option key={u.id} value={u.id}>{u.name} — {u.role}</option>)}</select></label>
      <label className="font-semibold text-slate-700">Entity reference<input value={form.entityRef} onChange={e=>setForm({...form,entityRef:e.target.value})} placeholder="Optional control/test/MAP reference" className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <label className="font-semibold text-slate-700">Internal link<input value={form.link} onChange={e=>setForm({...form,link:e.target.value})} placeholder="/toe, /remediation, …" className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <button disabled={busy} className="md:col-span-2 justify-self-start bg-slate-900 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg">Create Task</button>
    </form>}

    <div className="bg-white border border-slate-200 rounded-xl shadow-sm divide-y divide-slate-100">
      {tasks.map(task=>{
        const editable=canUpdate(task);
        return <div key={task.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1">
            <div className="text-xs font-bold text-slate-900">{task.title}</div>
            <div className="text-[11px] text-slate-500 mt-1">{task.type} • Due {new Date(task.dueDate).toLocaleDateString('id-ID')} • {task.user?.name||'Unassigned'}{task.entityRef?' • '+task.entityRef:''}</div>
          </div>
          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{task.priority}</span>
          {task.status==='Overdue'&&<span className="text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-2 py-1 rounded-full">Overdue</span>}
          <select disabled={busy||!editable} value={task.storedStatus||task.status} onChange={e=>update(task.id,e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white disabled:bg-slate-50 disabled:text-slate-400">
            <option>Pending</option><option>In Progress</option><option>Completed</option>
          </select>
          {task.link&&<Link href={task.link} className="text-xs font-semibold text-brand-600">Open</Link>}
        </div>;
      })}
      {!tasks.length&&<div className="p-8 text-xs text-slate-500">No tasks are registered.</div>}
    </div>
  </div>;
}
