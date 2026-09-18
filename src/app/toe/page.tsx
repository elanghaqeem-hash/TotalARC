'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';

export default function ToEPage() {
  const [tests, setTests] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PASS' | 'FAIL'>('ALL');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/assure/toe')
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('ToE data unavailable')))
      .then((data) => { const rows = data.tests || []; setTests(rows); setSelectedId(rows[0]?.id || ''); })
      .catch((err) => setError(err.message));
  }, []);

  const test = tests.find((item) => item.id === selectedId) || null;
  const samples = useMemo(() => {
    const rows = test?.samples || [];
    if (filter === 'PASS') return rows.filter((row: any) => row.result === 'Pass');
    if (filter === 'FAIL') return rows.filter((row: any) => row.result === 'Fail');
    return rows;
  }, [test, filter]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-sky-600 uppercase"><FlaskConical className="w-4 h-4" />Test of Operating Effectiveness</div>
        <h1 className="text-2xl font-black text-slate-900 mt-1">Digital Testing Workpaper</h1>
        <p className="text-xs text-slate-500 mt-1">Population, samples, exceptions, and conclusions below come directly from stored testing records.</p>
      </div>
      <TraceabilityFlow currentStep="ToE Test" />
      {error && <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>}

      {tests.length === 0 ? (
        <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl"><div className="font-bold text-slate-700">No ToE tests recorded</div><p className="text-xs text-slate-500 mt-1">No sample or exception counts are displayed until a real test is registered.</p></div>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <label className="text-xs font-bold text-slate-600">Testing record</label>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="mt-1 w-full md:max-w-xl p-2.5 rounded-lg border border-slate-200 text-xs">
              {tests.map((row) => <option key={row.id} value={row.id}>{row.testId} · {row.control?.controlId} · {row.period}</option>)}
            </select>
          </div>

          {test && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-2">
                <div><div className="font-mono text-xs font-bold text-sky-700">{test.testId}</div><h2 className="text-lg font-bold text-slate-900">{test.control?.name || 'Control not linked'}</h2><div className="text-xs text-slate-500">{test.process?.name || 'Process not linked'} · {test.period}</div></div>
                <span className="text-xs font-bold px-2.5 py-1 rounded bg-slate-100">{test.finalConclusion}</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                {[['Population', test.populationSize],['Sample size', test.sampleSize],['Passed', test.passCount],['Failed', test.failCount],['Exceptions', test.exceptions?.length || 0]].map(([label,value]) => (
                  <div key={String(label)} className="p-3 rounded-lg bg-slate-50 border border-slate-200"><div className="text-[10px] uppercase text-slate-400 font-bold">{label}</div><div className="text-xl font-black text-slate-900">{value}</div></div>
                ))}
              </div>

              <div className="flex gap-2 text-xs">
                {(['ALL','PASS','FAIL'] as const).map((key) => (
                  <button key={key} onClick={() => setFilter(key)} className={`px-3 py-1.5 rounded-lg border ${filter === key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-slate-200'}`}>
                    {key === 'ALL' ? `All (${test.samples?.length || 0})` : key === 'PASS' ? `Passed (${test.samples?.filter((s:any)=>s.result==='Pass').length || 0})` : `Failed (${test.samples?.filter((s:any)=>s.result==='Fail').length || 0})`}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-slate-600"><tr><th className="p-2 text-left">#</th><th className="p-2 text-left">Reference</th><th className="p-2 text-left">Date</th><th className="p-2 text-left">Result</th><th className="p-2 text-left">Failure reason</th></tr></thead>
                  <tbody>{samples.map((sample: any) => <tr key={sample.id} className="border-b border-slate-100"><td className="p-2">{sample.sampleNumber}</td><td className="p-2 font-mono">{sample.transactionRef}</td><td className="p-2">{new Date(sample.transactionDate).toLocaleDateString('id-ID')}</td><td className="p-2 font-bold">{sample.result}</td><td className="p-2 text-slate-500">{sample.failureReason || '—'}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
