'use client';

import React, { useEffect, useState } from 'react';
import { BadgeCheck, CalendarClock, X } from 'lucide-react';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';

export default function RemediationPage() {
  const [data, setData] = useState<any>({ deficiencies: [], issues: [], maps: [], retests: [] });
  const [error, setError] = useState('');
  const [extensionMap, setExtensionMap] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [extensionForm, setExtensionForm] = useState({
    newDueDate: '',
    extensionReason: '',
    approverName: ''
  });

  const loadData = async () => {
    setError('');
    try {
      const response = await fetch('/api/assure/remediation');
      if (!response.ok) throw new Error('Remediation data unavailable');
      const payload = await response.json();
      setData({
        deficiencies: payload.deficiencies || [],
        issues: payload.issues || [],
        maps: payload.maps || [],
        retests: payload.retests || []
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remediation data unavailable');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openExtension = (map: any) => {
    setExtensionMap(map);
    setExtensionForm({
      newDueDate: map.revisedDueDate
        ? String(map.revisedDueDate).slice(0, 10)
        : '',
      extensionReason: '',
      approverName: map.approverName || ''
    });
    setError('');
  };

  const submitExtension = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!extensionMap) return;

    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/assure/remediation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'REQUEST_EXTENSION',
          mapId: extensionMap.id,
          ...extensionForm
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to update Management Action Plan.');
      }

      setExtensionMap(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update Management Action Plan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-brand-600 uppercase">
          <BadgeCheck className="w-4 h-4" />
          Remediation & Management Action Plans
        </div>
        <h1 className="text-2xl font-black text-slate-900 mt-1">Issue, MAP & Retest Workspace</h1>
        <p className="text-xs text-slate-500 mt-1">
          Only persisted deficiencies, issues, action plans, milestones, and retest outcomes are shown.
        </p>
      </div>

      <TraceabilityFlow currentStep="MAP Action" />

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Deficiencies', data.deficiencies.length],
          ['Issues', data.issues.length],
          ['Action plans', data.maps.length],
          ['Retests', data.retests.length]
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-[10px] uppercase font-bold text-slate-400">{label}</div>
            <div className="text-2xl font-black text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      {data.maps.length === 0 && data.issues.length === 0 && data.deficiencies.length === 0 ? (
        <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl">
          <div className="font-bold text-slate-700">No remediation records</div>
          <p className="text-xs text-slate-500 mt-1">
            No pre-closed issue or completed MAP is injected into an empty database.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="font-bold text-slate-900 mb-3">Issues</h2>
            <div className="space-y-3">
              {data.issues.map((issue: any) => (
                <div key={issue.id} className="p-3 rounded-xl border border-slate-200 text-xs">
                  <div className="flex justify-between gap-3">
                    <span className="font-mono font-bold">{issue.issueId}</span>
                    <span className="font-bold">{issue.status}</span>
                  </div>
                  <div className="font-semibold text-slate-900 mt-1">{issue.title}</div>
                  <div className="text-[11px] text-slate-500">
                    {issue.process?.name || 'No process linked'} · {issue.control?.controlId || 'No control linked'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="font-bold text-slate-900 mb-3">Management Action Plans</h2>
            <div className="space-y-3">
              {data.maps.map((map: any) => (
                <div key={map.id} className="p-3 rounded-xl border border-slate-200 text-xs space-y-2">
                  <div className="flex justify-between gap-3">
                    <span className="font-mono font-bold">{map.mapId}</span>
                    <span className="font-bold">{map.status}</span>
                  </div>
                  <div className="text-slate-700">{map.agreedAction}</div>
                  <div className="text-[11px] text-slate-500">
                    Progress {map.progressPercent}% · milestones {map.milestones?.length || 0} · retests {map.retests?.length || 0}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-500 pt-1">
                    <div>
                      Original due: <strong className="text-slate-700">{new Date(map.originalDueDate).toLocaleDateString('id-ID')}</strong>
                    </div>
                    <div>
                      Revised due:{' '}
                      <strong className="text-slate-700">
                        {map.revisedDueDate ? new Date(map.revisedDueDate).toLocaleDateString('id-ID') : 'Not revised'}
                      </strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openExtension(map)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700"
                  >
                    <CalendarClock className="w-3.5 h-3.5" />
                    Request / Record Extension
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {extensionMap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">MAP Due-Date Extension</h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  {extensionMap.mapId} · original due date remains immutable.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExtensionMap(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs">
              <div className="text-[10px] uppercase font-bold text-slate-400">Original Due Date</div>
              <div className="font-bold text-slate-900 mt-0.5">
                {new Date(extensionMap.originalDueDate).toLocaleDateString('id-ID')}
              </div>
            </div>

            <form onSubmit={submitExtension} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">New Due Date *</label>
                <input
                  type="date"
                  required
                  value={extensionForm.newDueDate}
                  onChange={event =>
                    setExtensionForm({ ...extensionForm, newDueDate: event.target.value })
                  }
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Extension Reason *</label>
                <textarea
                  required
                  rows={3}
                  value={extensionForm.extensionReason}
                  onChange={event =>
                    setExtensionForm({ ...extensionForm, extensionReason: event.target.value })
                  }
                  placeholder="Document the factual reason for the due-date extension"
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Approver Name *</label>
                <input
                  type="text"
                  required
                  value={extensionForm.approverName}
                  onChange={event =>
                    setExtensionForm({ ...extensionForm, approverName: event.target.value })
                  }
                  placeholder="Enter the approving person"
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setExtensionMap(null)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Extension'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
