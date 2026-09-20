'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CheckSquare, Plus, Save, X } from 'lucide-react';
import { useAssuranceData } from '@/hooks/useAssuranceData';
import { useRole } from '@/context/RoleContext';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100';

export default function TasksPage() {
  const { data, loading, error, reload } = useAssuranceData(['tasks', 'organization']);
  const { currentUser } = useRole();
  const tasks = data?.tasks || [];
  const units = data?.institution?.organizationUnits || [];
  const users = data?.institution?.users || [];
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<Record<string, any>>({});

  const canWrite = Boolean(
    currentUser
      && ['Admin', 'Reviewer', 'ProcessOwner', 'ControlOwner', 'Tester'].includes(currentUser.role)
  );

  const setField = (key: string, value: any) =>
    setForm(current => ({ ...current, [key]: value }));

  const openCreate = () => {
    setMessage('');
    setShowForm(true);
    setForm({
      actionType: 'CREATE_TASK',
      title: '',
      type: 'Review',
      dueDate: '',
      priority: 'High',
      status: 'Pending',
      orgUnitId: currentUser?.orgUnitId || (units.length === 1 ? units[0].id : ''),
      userId: currentUser?.id || '',
      entityRef: '',
      link: ''
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/assure/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save task.');
      await reload();
      setShowForm(false);
      setMessage('Task saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save task.');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (taskId: string, status: string) => {
    setMessage('');
    try {
      const response = await fetch('/api/assure/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'UPDATE_STATUS', taskId, status })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to update task.');
      await reload();
      setMessage('Task status updated.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to update task.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase">
              <CheckSquare className="w-4 h-4" />Task Center
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Assurance Tasks & Escalations</h1>
            <p className="text-xs text-slate-500 mt-1">
              Tasks are stored in D1, assigned to an organization unit, and filtered to the authenticated user's scope.
            </p>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 self-start rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white"
            >
              <Plus className="h-4 w-4" /> New Task
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          {message}
        </div>
      )}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Assignment</div>
              <h2 className="text-base font-black text-slate-900">Create Assurance Task</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-xs font-bold text-slate-700 md:col-span-2">
              Task Title *
              <input
                className={inputClass}
                value={form.title || ''}
                onChange={e => setField('title', e.target.value)}
                required
              />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Type *
              <select
                className={inputClass}
                value={form.type || 'Review'}
                onChange={e => setField('type', e.target.value)}
              >
                <option>RCSA</option>
                <option>CSA</option>
                <option>ToD</option>
                <option>ToE</option>
                <option>Review</option>
                <option>MAP</option>
                <option>Retest</option>
                <option>Certification</option>
                <option>ICOFR</option>
                <option>CCM</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-700">
              Organization Unit *
              <select
                className={inputClass}
                value={form.orgUnitId || ''}
                onChange={e => setField('orgUnitId', e.target.value)}
                required
              >
                <option value="">Select unit</option>
                {units.map((unit: any) => (
                  <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-700">
              Assignee
              <select
                className={inputClass}
                value={form.userId || ''}
                onChange={e => setField('userId', e.target.value)}
              >
                <option value="">Unassigned</option>
                {users.map((user: any) => (
                  <option key={user.id} value={user.id}>{user.name} · {user.role}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-700">
              Due Date *
              <input
                type="date"
                className={inputClass}
                value={form.dueDate || ''}
                onChange={e => setField('dueDate', e.target.value)}
                required
              />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Priority
              <select
                className={inputClass}
                value={form.priority || 'High'}
                onChange={e => setField('priority', e.target.value)}
              >
                <option>Critical</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-700">
              Entity Reference
              <input
                className={inputClass}
                value={form.entityRef || ''}
                onChange={e => setField('entityRef', e.target.value)}
                placeholder="Control ID, Test ID, MAP ID..."
              />
            </label>
            <label className="text-xs font-bold text-slate-700 md:col-span-2">
              Internal Link
              <input
                className={inputClass}
                value={form.link || ''}
                onChange={e => setField('link', e.target.value)}
                placeholder="/tod, /toe, /remediation..."
              />
            </label>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-xs text-slate-500">Loading…</div>
      ) : tasks.length === 0 ? (
        <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl">
          <div className="font-bold text-slate-700">No assurance tasks recorded</div>
          <p className="text-xs text-slate-500 mt-1">
            Create tasks only for actual assurance work and assign them to an authorized organization unit.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          {tasks.map((task: any) => {
            const canUpdate =
              currentUser
              && (
                ['Admin', 'Reviewer'].includes(currentUser.role)
                || !task.userId
                || task.userId === currentUser.id
              );

            return (
              <div
                key={task.id}
                className="p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div>
                  <div className="text-[10px] uppercase font-bold text-emerald-600">{task.type}</div>
                  <div className="font-bold text-sm text-slate-900">{task.title}</div>
                  <div className="text-[11px] text-slate-500">
                    Due {new Date(task.dueDate).toLocaleDateString('id-ID')} · Assignee: {task.user?.name || 'Unassigned'}
                    {task.entityRef ? ` · Ref: ${task.entityRef}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] px-2 py-1 rounded bg-slate-100 font-bold">{task.priority}</span>
                  {canUpdate ? (
                    <select
                      value={task.status}
                      onChange={e => void updateStatus(task.id, e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700"
                    >
                      <option>Pending</option>
                      <option>In Progress</option>
                      <option>Completed</option>
                      <option>Overdue</option>
                    </select>
                  ) : (
                    <span className="text-[10px] px-2 py-1 rounded bg-slate-100 font-bold">{task.status}</span>
                  )}
                  {task.link && (
                    <Link href={task.link} className="text-xs font-bold text-emerald-600">
                      Open →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
