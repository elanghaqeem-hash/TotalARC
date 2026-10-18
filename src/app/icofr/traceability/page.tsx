'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  FileSearch,
  Link2,
  RefreshCw,
  Save,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';

const emptyTod = {
  testId: '',
  controlDomainId: '',
  period: '',
  testerName: '',
  reviewerName: '',
  objectiveAlignment: false,
  riskCoverage: false,
  precisionAdequate: false,
  evidenceSufficiency: false,
  walkthroughComplete: false,
  conclusion: 'Not Assessed',
  status: 'Draft',
  notes: ''
};

function badge(value: string | null | undefined, tone = 'slate') {
  const palette: Record<string, string> = {
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
    sky: 'border-sky-200 bg-sky-50 text-sky-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700'
  };
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold ${palette[tone] || palette.slate}`}>
      {value || 'None'}
    </span>
  );
}

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [todForm, setTodForm] = useState(emptyTod);
  const [loading, setLoading] = useState(true);
  const [savingTod, setSavingTod] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [incompleteOnly, setIncompleteOnly] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/icofr/traceability', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Traceability data unavailable.');
      setData(payload);
      setTodForm(current => ({
        ...current,
        testerName: payload.currentTester?.name || '',
        controlDomainId: current.controlDomainId || payload.controls?.[0]?.id || ''
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Traceability data unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredChains = useMemo(() => {
    const rows = data?.chains || [];
    return rows.filter((row: any) => {
      if (incompleteOnly && row.complete) return false;
      if (!query.trim()) return true;
      const haystack = [
        row.financialItem?.itemCode,
        row.financialItem?.name,
        row.assertion?.assertion,
        row.risk?.riskId,
        row.risk?.name,
        row.control?.controlCode,
        row.control?.name,
        row.informationArtifact?.itemCode,
        row.informationArtifact?.name
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    });
  }, [data, query, incompleteOnly]);

  const saveTod = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingTod(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/icofr/traceability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'SAVE_TOD', ...todForm })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save Test of Design.');
      setMessage('Test of Design saved and linked to the ICOFR control.');
      setTodForm(current => ({
        ...emptyTod,
        controlDomainId: current.controlDomainId
      }));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save Test of Design.');
    } finally {
      setSavingTod(false);
    }
  };

  const unmappedItems = useMemo(() => {
    const linked = new Set((data?.assertions || [])
      .filter((a: any) => Number(a.inScope) === 1)
      .map((a: any) => String(a.financialItemId)));
    return (data?.financialItems || []).filter(
      (item: any) => Number(item.significant) === 1 && !linked.has(String(item.id))
    );
  }, [data]);
  const [showAllGaps, setShowAllGaps] = useState(false);
  const approvedPlc = (data?.controls || []).filter((control: any) => control.category === 'PLC' && ['Approved', 'Active', 'Validated'].includes(String(control.status))).length;
  const scopedPairs = (data?.scopedProcessMappings || []).length;

  const metrics = data?.metrics || {};

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-sky-600">
              <Link2 className="h-4 w-4" /> ICOFR Traceability
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">End-to-End ICOFR Traceability Matrix</h1>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
              Relate financial statement items and assertions to risks, ELC/PLC/ITGC/ITAC controls and IPE/EUC.
              Downstream ToD, ToE, deficiency and MAP status is resolved from the actual persisted records.
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex self-start items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {!loading && !data?.institution ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">
          Register an institution before creating ICOFR traceability.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              ['Significant FS Items', metrics.significantItems || 0],
              ['Traced FS Items', metrics.tracedFinancialItems || 0],
              ['Traced Risks', metrics.tracedRisks || 0],
              ['Traced Controls', metrics.tracedControls || 0],
              ['Complete Chains', metrics.completeChains || 0],
              ['Total Chains', metrics.totalChains || 0]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                <div className="mt-1 text-xl font-black text-slate-900">{value}</div>
              </div>
            ))}
          </div>

          {unmappedItems.length > 0 && (
            <section className="rounded-xl border border-amber-200 bg-white p-4">
              <h2 className="text-sm font-bold text-slate-900">
                {unmappedItems.length} akun signifikan belum memiliki assertion in-scope
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Pilih akun dan validasi assertion, risiko, kontrol, serta dasar buktinya.
                Tidak ada pemetaan atau persetujuan yang dibuat otomatis.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(showAllGaps ? unmappedItems : unmappedItems.slice(0, 12)).map((item: any) => (
                  <div key={String(item.id)} className="min-w-0 rounded-lg border p-3">
                    <p className="truncate text-xs font-bold">{item.itemCode || '-'}</p>
                    <p className="line-clamp-2 text-xs">{item.name}</p>
                    <Link href={'/icofr/ai-mapping?item=' + encodeURIComponent(String(item.id))}
                      className="mt-2 inline-flex rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
                      Buat Draft berbasis bukti <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </div>
                ))}
              </div>
              {unmappedItems.length > 12 && (
                <button type="button" onClick={() => setShowAllGaps(!showAllGaps)}
                  className="mt-3 text-xs font-semibold underline">
                  {showAllGaps ? 'Tampilkan 12' : 'Tampilkan semua'}
                </button>
              )}
            </section>
          )}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
              <h2 className="text-sm font-black text-slate-900">1. Pemetaan melalui Draft dan persetujuan berjenjang</h2>
              <p className="mt-2 text-xs leading-5 text-slate-700">
                Assertion final tidak boleh ditulis langsung dari matriks. Gunakan AI Mapping &amp; Validation Workspace
                untuk memilih kandidat berdasarkan relasi BPM yang teregister, melampirkan dokumen sumber,
                dan menjalankan Process Owner → ICOFR Reviewer → Approver. Publikasi hanya tersedia sesudah
                validasi PLC dan persetujuan terpisah.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-sky-100 bg-white p-3">
                  <p className="text-slate-500">Pasangan FSLI–BPM terbaca</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{scopedPairs}</p>
                </div>
                <div className="rounded-xl border border-sky-100 bg-white p-3">
                  <p className="text-slate-500">PLC disetujui / aktif</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{approvedPlc}</p>
                </div>
                <div className="rounded-xl border border-sky-100 bg-white p-3">
                  <p className="text-slate-500">Akun belum punya assertion in-scope</p>
                  <p className="mt-1 text-xl font-bold text-amber-800">{unmappedItems.length}</p>
                </div>
                <div className="rounded-xl border border-sky-100 bg-white p-3">
                  <p className="text-slate-500">Rantai lengkap / total</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{metrics.completeChains || 0} / {metrics.totalChains || 0}</p>
                </div>
              </div>
              {approvedPlc === 0 && <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                Belum ada PLC disetujui/aktif dalam ICOFR Control Domain. Pendaftaran dan validasi kontrol
                proses harus berbasis sumber sebelum Draft dapat dipublikasikan. ITGC tidak otomatis menggantikan PLC.
              </p>}
              {approvedPlc === 0 && <Link href="/icofr/plc" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-900 underline">
                Daftarkan dan validasi kontrol PLC berdasarkan bukti sumber <ArrowRight className="h-3.5 w-3.5" />
              </Link>}
              <div className="mt-4">
              <Link href="/icofr/ai-mapping" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white">
                Buka AI Mapping &amp; Validation Workspace <ArrowRight className="h-4 w-4" />
              </Link>
              </div>
            </section>

            <form onSubmit={saveTod} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-sm font-black text-slate-900">2. Register linked Test of Design</h2>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">
                  Design assessment is stored against the ICOFR control and becomes part of the same traceability chain.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="text-xs font-bold text-slate-700 md:col-span-2">
                  ICOFR control *
                  <select
                    required
                    value={todForm.controlDomainId}
                    onChange={e => setTodForm({ ...todForm, controlDomainId: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option value="">Select</option>
                    {(data?.controls || []).map((item: any) => (
                      <option key={item.id} value={item.id}>
                        {item.category} · {item.controlCode} · {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Test ID
                  <input
                    value={todForm.testId}
                    onChange={e => setTodForm({ ...todForm, testId: e.target.value })}
                    placeholder="Auto-generated if blank"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Period *
                  <input
                    required
                    value={todForm.period}
                    onChange={e => setTodForm({ ...todForm, period: e.target.value })}
                    placeholder="e.g. FY2026"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Tester *
                  <input
                    required
                    value={todForm.testerName}
                    readOnly
                    title="Penguji mengikuti identitas login"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>
                <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 p-3 md:col-span-2 sm:grid-cols-2">
                  {[
                    ['objectiveAlignment', 'Objective alignment'],
                    ['riskCoverage', 'Risk coverage'],
                    ['precisionAdequate', 'Precision adequate'],
                    ['evidenceSufficiency', 'Evidence sufficient'],
                    ['walkthroughComplete', 'Walkthrough complete']
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean((todForm as any)[key])}
                        onChange={e => setTodForm({ ...todForm, [key]: e.target.checked })}
                        className="rounded border-slate-300 text-brand-600"
                      />
                      {label}
                    </label>
                  ))}
                </div>

                <label className="text-xs font-bold text-slate-700">
                  Conclusion
                  <select
                    value={todForm.conclusion}
                    onChange={e => setTodForm({ ...todForm, conclusion: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option>Not Assessed</option>
                    <option>Effective</option>
                    <option>Partially Effective</option>
                    <option>Ineffective</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Status
                  <select
                    value={todForm.status}
                    onChange={e => setTodForm({ ...todForm, status: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  >
                    <option>Draft</option>
                    <option>Under Review</option>

                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700 md:col-span-2">
                  Notes
                  <textarea
                    rows={3}
                    value={todForm.notes}
                    onChange={e => setTodForm({ ...todForm, notes: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
                  />
                </label>
              </div>

              <p className="mt-3 text-xs text-slate-600">Persetujuan dilakukan reviewer independen melalui <Link href="/icofr/workpaper-review" className="font-semibold text-brand-600 underline">Workpaper Review</Link> setelah bukti diunggah dan direview.</p>
              <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
                <button
                  disabled={savingTod || !todForm.controlDomainId || !todForm.period || !todForm.testerName}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {savingTod ? 'Saving…' : 'Save ToD'}
                </button>
              </div>
            </form>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <FileSearch className="h-4 w-4 text-brand-600" />
                  <h2 className="text-sm font-black text-slate-900">Traceability matrix</h2>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  A chain is marked complete when it has a financial item, assertion, risk, ICOFR control, ToD and ToE record.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search account, risk, control…"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-100"
                />
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600">
                  <input
                    type="checkbox"
                    checked={incompleteOnly}
                    onChange={e => setIncompleteOnly(e.target.checked)}
                  />
                  Incomplete only
                </label>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-xs text-slate-500">Loading traceability…</div>
            ) : filteredChains.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-xs text-slate-500">
                No traceability chains match the current view.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[1500px] w-full text-[10px]">
                  <thead className="bg-slate-100 text-slate-500">
                    <tr>
                      <th className="p-2.5 text-left">Account / Disclosure</th>
                      <th className="p-2.5 text-left">Assertion</th>
                      <th className="p-2.5 text-left">Risk</th>
                      <th className="p-2.5 text-left">ELC / PLC / ITGC / ITAC</th>
                      <th className="p-2.5 text-left">IPE / EUC</th>
                      <th className="p-2.5 text-left">ToD</th>
                      <th className="p-2.5 text-left">ToE</th>
                      <th className="p-2.5 text-left">Deficiency</th>
                      <th className="p-2.5 text-left">MAP</th>
                      <th className="p-2.5 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredChains.map((row: any) => {
                      const tod = row.designTests?.[0];
                      const toe = row.toeTests?.[0];
                      const deficiency = row.deficiencies?.[0];
                      const map = row.maps?.[0];
                      return (
                        <tr key={row.id} className="border-b border-slate-100 align-top">
                          <td className="p-2.5">
                            <div className="font-mono font-black text-brand-700">{row.financialItem?.itemCode}</div>
                            <div className="mt-0.5 max-w-[170px] font-bold text-slate-800">{row.financialItem?.name}</div>
                            <div className="mt-1">{row.financialItem?.significant ? badge('Significant', 'sky') : badge('Not significant')}</div>
                          </td>
                          <td className="p-2.5 font-semibold text-slate-700">{row.assertion?.assertion}</td>
                          <td className="p-2.5">
                            <div className="font-mono font-black text-slate-700">{row.risk?.riskId}</div>
                            <div className="mt-0.5 max-w-[170px] text-slate-600">{row.risk?.name}</div>
                          </td>
                          <td className="p-2.5">
                            <div className="flex items-center gap-1">
                              {badge(row.control?.category, 'sky')}
                              {row.control?.keyControl ? badge('Key', 'emerald') : null}
                            </div>
                            <div className="mt-1 font-mono font-black text-slate-700">{row.control?.controlCode}</div>
                            <div className="mt-0.5 max-w-[190px] text-slate-600">{row.control?.name}</div>
                            <div className="mt-1 text-[9px] text-slate-400">
                              {row.control?.sourceControlId ? 'Control Master linked' : 'No Control Master link'}
                            </div>
                          </td>
                          <td className="p-2.5">
                            {row.informationArtifact ? (
                              <>
                                <div>{badge(row.informationArtifact.artifactType, 'sky')}</div>
                                <div className="mt-1 font-mono font-bold">{row.informationArtifact.itemCode}</div>
                                <div className="mt-0.5 max-w-[160px] text-slate-600">{row.informationArtifact.name}</div>
                              </>
                            ) : badge('No dependency')}
                          </td>
                          <td className="p-2.5">
                            {tod ? (
                              <>
                                <div className="font-mono font-bold">{tod.testId}</div>
                                <div className="mt-1">{badge(tod.conclusion, tod.conclusion === 'Effective' ? 'emerald' : tod.conclusion === 'Ineffective' ? 'rose' : 'amber')}</div>
                              </>
                            ) : badge('Not tested', 'amber')}
                          </td>
                          <td className="p-2.5">
                            {toe ? (
                              <>
                                <div className="font-mono font-bold">{toe.testId}</div>
                                <div className="mt-1">{badge(toe.finalConclusion || toe.status, toe.finalConclusion === 'Effective' ? 'emerald' : 'slate')}</div>
                              </>
                            ) : badge('Not tested', 'amber')}
                          </td>
                          <td className="p-2.5">
                            {deficiency ? (
                              <>
                                <div className="font-mono font-bold">{deficiency.deficiencyId}</div>
                                <div className="mt-1">{badge(deficiency.classification, deficiency.classification === 'Material Weakness' ? 'rose' : 'amber')}</div>
                              </>
                            ) : badge('None', 'emerald')}
                          </td>
                          <td className="p-2.5">
                            {map ? (
                              <>
                                <div className="font-mono font-bold">{map.mapId}</div>
                                <div className="mt-1">{badge(map.status, map.status === 'Closed' ? 'emerald' : 'amber')}</div>
                              </>
                            ) : badge('None')}
                          </td>
                          <td className="p-2.5">
                            {row.complete ? badge('Complete', 'emerald') : badge('Incomplete', 'amber')}
                          </td>
                         </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
