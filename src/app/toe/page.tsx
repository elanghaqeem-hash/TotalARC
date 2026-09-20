'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, FlaskConical, Plus, Save, X } from 'lucide-react';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';
import { jsonTransaction } from '@/lib/client-transaction';
import { jsonRead } from '@/lib/client-read';
import { EMPTY_PAGINATION, RegisterPager, type PaginationMeta } from '@/components/common/RegisterPager';

const EMPTY_TEST_FORM = {
  testId: '',
  controlId: '',
  testerName: '',
  reviewerName: '',
  period: '',
  populationSize: 0,
  populationSource: '',
  samplingMethod: 'Random',
  notes: ''
};

const EMPTY_SAMPLE_FORM = {
  transactionRef: '',
  transactionDate: '',
  amount: '',
  attributesTested: '',
  evidenceRef: ''
};

export default function ToEPage() {
  const [tests, setTests] = useState<any[]>([]);
  const [controls, setControls] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PASS' | 'FAIL'>('ALL');
  const [error, setError] = useState('');
  const [testModal, setTestModal] = useState(false);
  const [sampleModal, setSampleModal] = useState(false);
  const [exceptionSample, setExceptionSample] = useState<any | null>(null);
  const [exceptionForm, setExceptionForm] = useState({ severity: 'High', description: '' });
  const [saving, setSaving] = useState(false);
  const [testForm, setTestForm] = useState(EMPTY_TEST_FORM);
  const [sampleForm, setSampleForm] = useState(EMPTY_SAMPLE_FORM);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const [pageLoading, setPageLoading] = useState(false);
  const [testDetail, setTestDetail] = useState<any | null>(null);
  const [samplePage, setSamplePage] = useState(1);
  const [samplePagination, setSamplePagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sampleDrafts, setSampleDrafts] = useState<
    Record<string, { result: string; failureReason: string }>
  >({});

  const loadControls = async () => {
    try {
      const controlData = await jsonRead<any>(
        '/api/controls?mode=options',
        { dedupe: false }
      );
      const nextControls = Array.isArray(controlData.controls) ? controlData.controls : [];
      setControls(nextControls);
      setTestForm(current => ({
        ...current,
        controlId:
          current.controlId && nextControls.some((control: any) => control.id === current.controlId)
            ? current.controlId
            : nextControls[0]?.id || ''
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Control library unavailable');
    }
  };

  const loadData = async (targetPage = page) => {
    setError('');
    setPageLoading(true);
    try {
      const testData = await jsonRead<any>(
        '/api/assure/toe?page=' + targetPage + '&pageSize=50',
        { dedupe: false }
      );
      const nextTests = Array.isArray(testData.tests) ? testData.tests : [];

      setTests(nextTests);
      setPagination(testData.pagination || EMPTY_PAGINATION);
      setPage(targetPage);
      setSelectedId(current =>
        current && nextTests.some((item: any) => item.id === current)
          ? current
          : nextTests[0]?.id || ''
      );


    } catch (err) {
      setError(err instanceof Error ? err.message : 'ToE data unavailable');
    } finally {
      setPageLoading(false);
    }
  };

  const loadDetail = async (
    testId: string,
    targetSamplePage = samplePage,
    targetFilter: 'ALL' | 'PASS' | 'FAIL' = filter
  ) => {
    if (!testId) {
      setTestDetail(null);
      setSamplePagination(EMPTY_PAGINATION);
      setSampleDrafts({});
      return;
    }

    setDetailLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        mode: 'detail',
        testId,
        samplePage: String(targetSamplePage),
        samplePageSize: '50',
        sampleFilter: targetFilter
      });
      const data = await jsonRead<any>(
        '/api/assure/toe?' + params.toString(),
        { dedupe: false }
      );
      const nextDetail = data.test || null;
      setTestDetail(nextDetail);
      setSamplePagination(nextDetail?.samplePagination || EMPTY_PAGINATION);
      setSamplePage(nextDetail?.samplePagination?.page || targetSamplePage);

      const drafts: Record<string, { result: string; failureReason: string }> = {};
      for (const sample of nextDetail?.samples || []) {
        drafts[sample.id] = {
          result: sample.result || 'Not Tested',
          failureReason: sample.failureReason || ''
        };
      }
      setSampleDrafts(drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ToE workpaper detail unavailable');
      setTestDetail(null);
      setSamplePagination(EMPTY_PAGINATION);
      setSampleDrafts({});
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadData(1), loadControls()]);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setTestDetail(null);
      setSamplePagination(EMPTY_PAGINATION);
      setSampleDrafts({});
      return;
    }
    setFilter('ALL');
    void loadDetail(selectedId, 1, 'ALL');
  }, [selectedId]);

  const selectedSummary = tests.find(item => item.id === selectedId) || null;
  const test = testDetail || selectedSummary;
  const samples = Array.isArray(testDetail?.samples) ? testDetail.samples : [];

  const createTest = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = await jsonTransaction<any>('/api/assure/toe', {
        actionType: 'CREATE_TEST',
        ...testForm
      });

      setTestModal(false);
      setTestForm({
        ...EMPTY_TEST_FORM,
        controlId: controls[0]?.id || ''
      });
      await loadData(1);
      setSelectedId(payload.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to register ToE test.');
    } finally {
      setSaving(false);
    }
  };

  const addSample = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!test) return;

    setSaving(true);
    setError('');
    try {
      await jsonTransaction('/api/assure/toe', {
        actionType: 'ADD_SAMPLE',
        toeTestId: test.id,
        ...sampleForm
      });

      setSampleModal(false);
      setSampleForm(EMPTY_SAMPLE_FORM);
      await loadData(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add ToE sample.');
    } finally {
      setSaving(false);
    }
  };

  const openException = (sample: any) => {
    setExceptionSample(sample);
    setExceptionForm({
      severity: 'High',
      description: sample.failureReason || ''
    });
    setError('');
  };

  const createException = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!test || !exceptionSample) return;

    setSaving(true);
    setError('');
    try {
      await jsonTransaction('/api/assure/toe', {
        actionType: 'CREATE_EXCEPTION',
        toeTestId: test.id,
        sampleId: exceptionSample.id,
        ...exceptionForm
      });

      setExceptionSample(null);
      await loadData(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to raise testing exception.');
    } finally {
      setSaving(false);
    }
  };

  const saveSampleResult = async (sampleId: string) => {
    const draft = sampleDrafts[sampleId];
    if (!draft) return;

    if (draft.result === 'Fail' && !draft.failureReason.trim()) {
      setError('A factual failure reason is required when a sample result is Fail.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await jsonTransaction('/api/assure/toe', {
        actionType: 'UPDATE_SAMPLE',
        sampleId,
        result: draft.result,
        failureReason: draft.failureReason
      });
      await loadData(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update ToE sample.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-sky-600 uppercase">
            <FlaskConical className="w-4 h-4" />
            Test of Operating Effectiveness
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">Digital Testing Workpaper</h1>
          <p className="text-xs text-slate-500 mt-1">
            Population, samples, exceptions, and conclusions come only from persisted testing records.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTestModal(true)}
          disabled={controls.length === 0}
          className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          Register ToE Test
        </button>
      </div>

      <TraceabilityFlow currentStep="ToE Test" />

      {controls.length === 0 && !error && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          Register a real control before creating a ToE test.
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {error}
        </div>
      )}

      <RegisterPager
        pagination={pagination}
        loading={pageLoading}
        onPageChange={nextPage => void loadData(nextPage)}
      />

      {tests.length === 0 ? (
        <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl">
          <div className="font-bold text-slate-700">No ToE tests recorded</div>
          <p className="text-xs text-slate-500 mt-1">
            No sample or exception counts are displayed until a real test is registered.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <label className="text-xs font-bold text-slate-600">Testing record</label>
            <select
              value={selectedId}
              onChange={event => setSelectedId(event.target.value)}
              className="mt-1 w-full md:max-w-xl p-2.5 rounded-lg border border-slate-200 text-xs"
            >
              {tests.map(row => (
                <option key={row.id} value={row.id}>
                  {row.testId} · {row.control?.controlId || 'Control unavailable'} · {row.period}
                </option>
              ))}
            </select>
          </div>

          {test && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-xs font-bold text-sky-700">{test.testId}</div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {test.control?.name || 'Control not linked'}
                  </h2>
                  <div className="text-xs text-slate-500">
                    {test.process?.name || 'Process not linked'} · {test.period}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2.5 py-1 rounded bg-slate-100">
                    {test.finalConclusion}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSampleModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Sample
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                {[
                  ['Population', test.populationSize],
                  ['Sample size', test.sampleSize],
                  ['Passed', test.passCount],
                  ['Failed', test.failCount],
                  ['Exceptions', test.exceptions?.length || 0]
                ].map(([label, value]) => (
                  <div key={String(label)} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[10px] uppercase text-slate-400 font-bold">{label}</div>
                    <div className="text-xl font-black text-slate-900">{value}</div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 text-xs">
                {(['ALL', 'PASS', 'FAIL'] as const).map(key => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`px-3 py-1.5 rounded-lg border ${
                      filter === key
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    {key === 'ALL'
                      ? `All (${test.samples?.length || 0})`
                      : key === 'PASS'
                        ? `Passed (${test.samples?.filter((sample: any) => sample.result === 'Pass').length || 0})`
                        : `Failed (${test.samples?.filter((sample: any) => sample.result === 'Fail').length || 0})`}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[900px]">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="p-2 text-left">#</th>
                      <th className="p-2 text-left">Reference</th>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-left">Result</th>
                      <th className="p-2 text-left">Failure reason</th>
                      <th className="p-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {samples.map((sample: any) => {
                      const draft = sampleDrafts[sample.id] || {
                        result: sample.result || 'Not Tested',
                        failureReason: sample.failureReason || ''
                      };

                      return (
                        <tr key={sample.id} className="border-b border-slate-100">
                          <td className="p-2">{sample.sampleNumber}</td>
                          <td className="p-2 font-mono">{sample.transactionRef}</td>
                          <td className="p-2">
                            {new Date(sample.transactionDate).toLocaleDateString('id-ID')}
                          </td>
                          <td className="p-2">
                            <select
                              value={draft.result}
                              onChange={event =>
                                setSampleDrafts(current => ({
                                  ...current,
                                  [sample.id]: {
                                    ...draft,
                                    result: event.target.value,
                                    failureReason:
                                      event.target.value === 'Fail' ? draft.failureReason : ''
                                  }
                                }))
                              }
                              className="p-2 rounded-lg border border-slate-200 bg-white"
                            >
                              <option value="Not Tested">Not Tested</option>
                              <option value="Pass">Pass</option>
                              <option value="Fail">Fail</option>
                              <option value="N/A">N/A</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              value={draft.failureReason}
                              disabled={draft.result !== 'Fail'}
                              onChange={event =>
                                setSampleDrafts(current => ({
                                  ...current,
                                  [sample.id]: {
                                    ...draft,
                                    failureReason: event.target.value
                                  }
                                }))
                              }
                              placeholder={draft.result === 'Fail' ? 'Required factual reason' : '—'}
                              className="w-full p-2 rounded-lg border border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => saveSampleResult(sample.id)}
                                disabled={saving}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold disabled:opacity-50"
                              >
                                <Save className="w-3.5 h-3.5" />
                                Save
                              </button>
                              {sample.result === 'Fail' && (
                                test.exceptions?.some((exception: any) => exception.sampleRef === sample.transactionRef) ? (
                                  <span className="inline-flex items-center px-2.5 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                                    Exception raised
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openException(sample)}
                                    disabled={saving}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold disabled:opacity-50"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Raise Exception
                                  </button>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {testModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">Register ToE Test</h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  Creates a planned testing workpaper only. No sample result or effectiveness conclusion is inferred.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTestModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={createTest} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Control *</label>
                <select
                  required
                  value={testForm.controlId}
                  onChange={event => setTestForm({ ...testForm, controlId: event.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                >
                  {controls.map(control => (
                    <option key={control.id} value={control.id}>
                      {control.controlId} — {control.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Test ID</label>
                  <input
                    value={testForm.testId}
                    onChange={event => setTestForm({ ...testForm, testId: event.target.value })}
                    placeholder="Auto-generated if blank"
                    className="w-full p-2.5 rounded-lg border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Period *</label>
                  <input
                    required
                    value={testForm.period}
                    onChange={event => setTestForm({ ...testForm, period: event.target.value })}
                    placeholder="e.g. 2026 Q3"
                    className="w-full p-2.5 rounded-lg border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tester *</label>
                  <input
                    required
                    value={testForm.testerName}
                    onChange={event => setTestForm({ ...testForm, testerName: event.target.value })}
                    placeholder="Actual tester name"
                    className="w-full p-2.5 rounded-lg border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Reviewer</label>
                  <input
                    value={testForm.reviewerName}
                    onChange={event => setTestForm({ ...testForm, reviewerName: event.target.value })}
                    placeholder="Reviewer name, if assigned"
                    className="w-full p-2.5 rounded-lg border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Population Size *</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={testForm.populationSize}
                    onChange={event =>
                      setTestForm({ ...testForm, populationSize: Number(event.target.value) })
                    }
                    className="w-full p-2.5 rounded-lg border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Sampling Method *</label>
                  <select
                    required
                    value={testForm.samplingMethod}
                    onChange={event =>
                      setTestForm({ ...testForm, samplingMethod: event.target.value })
                    }
                    className="w-full p-2.5 rounded-lg border border-slate-200"
                  >
                    <option value="Random">Random</option>
                    <option value="Systematic">Systematic</option>
                    <option value="Judgmental">Judgmental</option>
                    <option value="Risk-Based">Risk-Based</option>
                    <option value="Full Population">Full Population</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Population Source *</label>
                <input
                  required
                  value={testForm.populationSource}
                  onChange={event =>
                    setTestForm({ ...testForm, populationSource: event.target.value })
                  }
                  placeholder="Actual source system/report/file used as the population"
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={testForm.notes}
                  onChange={event => setTestForm({ ...testForm, notes: event.target.value })}
                  placeholder="Scope or testing notes"
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTestModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !testForm.controlId}
                  className="px-5 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Register Test'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {exceptionSample && test && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">Raise Testing Exception</h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  {test.testId} · sample {exceptionSample.transactionRef}. This does not create a deficiency or issue automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExceptionSample(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={createException} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Severity *</label>
                <select
                  required
                  value={exceptionForm.severity}
                  onChange={event =>
                    setExceptionForm({ ...exceptionForm, severity: event.target.value })
                  }
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Exception Description *</label>
                <textarea
                  required
                  rows={4}
                  value={exceptionForm.description}
                  onChange={event =>
                    setExceptionForm({ ...exceptionForm, description: event.target.value })
                  }
                  placeholder="Describe the factual exception evidenced by this failed sample"
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                />
              </div>

              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800">
                The exception is persisted only after this human action. Deficiency classification and issue creation remain separate approval steps.
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setExceptionSample(null)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Raise Exception'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sampleModal && test && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">Add Actual Test Sample</h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  {test.testId} · the new sample starts as Not Tested.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSampleModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={addSample} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Transaction / Sample Reference *</label>
                <input
                  required
                  value={sampleForm.transactionRef}
                  onChange={event =>
                    setSampleForm({ ...sampleForm, transactionRef: event.target.value })
                  }
                  placeholder="Source transaction or evidence reference"
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Transaction Date *</label>
                  <input
                    type="date"
                    required
                    value={sampleForm.transactionDate}
                    onChange={event =>
                      setSampleForm({ ...sampleForm, transactionDate: event.target.value })
                    }
                    className="w-full p-2.5 rounded-lg border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Amount</label>
                  <input
                    type="number"
                    step="any"
                    value={sampleForm.amount}
                    onChange={event => setSampleForm({ ...sampleForm, amount: event.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Attributes to Test</label>
                <textarea
                  rows={2}
                  value={sampleForm.attributesTested}
                  onChange={event =>
                    setSampleForm({ ...sampleForm, attributesTested: event.target.value })
                  }
                  placeholder="Document the actual attributes/criteria to test"
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Evidence Reference</label>
                <input
                  value={sampleForm.evidenceRef}
                  onChange={event =>
                    setSampleForm({ ...sampleForm, evidenceRef: event.target.value })
                  }
                  placeholder="Evidence repository/file reference"
                  className="w-full p-2.5 rounded-lg border border-slate-200"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSampleModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Add Sample'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
