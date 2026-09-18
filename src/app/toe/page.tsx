'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Cpu,
  FlaskConical,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileCheck,
  Shield,
  Layers,
  ArrowRight,
  Filter,
  Search,
  Download,
  BadgeCheck,
  FileSpreadsheet
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';

export default function ToEWorkpaperPage() {
  const [tests, setTests] = useState<any[]>([]);
  const [selectedTest, setSelectedTest] = useState<any>(null);
  const [samples, setSamples] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sampleFilter, setSampleFilter] = useState<'ALL' | 'FAIL' | 'PASS'>('ALL');

  useEffect(() => {
    fetch('/api/assure/toe')
      .then(res => res.json())
      .then(d => {
        setTests(d.tests || []);
        if (d.tests?.length > 0) {
          setSelectedTest(d.tests[0]);
          setSamples(d.tests[0].samples || []);
        }
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  const filteredSamples = samples.filter(s => {
    if (sampleFilter === 'FAIL') return s.result === 'Fail';
    if (sampleFilter === 'PASS') return s.result === 'Pass';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-sky-600 uppercase tracking-wider">
            <FlaskConical className="w-4 h-4" />
            <span>Test of Operating Effectiveness (ASSURE)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Digital Testing Workpaper & Sampling Engine
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Section 66–71 & Section 136 Scenario: 450 Population, 25 Samples Tested, 2 Failed Exceptions, Resulting in Control Deficiency & Remediation.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/remediation"
            className="inline-flex items-center space-x-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm shadow-brand-500/20 transition-all"
          >
            <BadgeCheck className="w-4 h-4" />
            <span>View Remediation & Retest →</span>
          </Link>
        </div>
      </div>

      <TraceabilityFlow currentStep="ToE Test" />

      {/* Workpaper Metadata Banner */}
      {selectedTest && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-2">
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-xs font-bold text-sky-800 bg-sky-100 px-2 py-0.5 rounded">
                  {selectedTest.testId}
                </span>
                <span className="text-xs text-slate-500">Period: {selectedTest.period}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  Conclusion: {selectedTest.finalConclusion}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-1">
                Control Testing: {selectedTest.control?.name} ({selectedTest.control?.controlId})
              </h2>
            </div>

            <div className="text-right text-xs text-slate-500">
              <div>Tester: <strong>{selectedTest.testerName}</strong></div>
              <div>Reviewer: <strong>{selectedTest.reviewerName}</strong></div>
            </div>
          </div>

          {/* Test Parameters & Sampling Metrics (Section 66 & 67) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400">Total Population</span>
              <div className="text-xl font-black text-slate-900 mt-0.5">{selectedTest.populationSize}</div>
              <div className="text-[10px] text-slate-500 truncate">{selectedTest.populationSource}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400">Sampling Method</span>
              <div className="text-xs font-bold text-slate-900 mt-1">{selectedTest.samplingMethod}</div>
              <div className="text-[10px] text-brand-600 font-semibold">Guidance Compliant</div>
            </div>

            <div className="p-3 bg-sky-50 rounded-lg border border-sky-200">
              <span className="text-[10px] font-bold uppercase text-sky-700">Sample Size</span>
              <div className="text-xl font-black text-sky-900 mt-0.5">{selectedTest.sampleSize} Items</div>
              <div className="text-[10px] text-sky-700 font-medium">100% Executed</div>
            </div>

            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
              <span className="text-[10px] font-bold uppercase text-emerald-700">Passed Tests</span>
              <div className="text-xl font-black text-emerald-900 mt-0.5">{selectedTest.passCount} Pass</div>
              <div className="text-[10px] text-emerald-700 font-medium">92% Compliance</div>
            </div>

            <div className="p-3 bg-rose-50 rounded-lg border border-rose-200">
              <span className="text-[10px] font-bold uppercase text-rose-700">Exceptions Identified</span>
              <div className="text-xl font-black text-rose-900 mt-0.5">{selectedTest.failCount} Exceptions</div>
              <div className="text-[10px] text-rose-700 font-bold">Requires Deficiency</div>
            </div>
          </div>

          {/* Test Observations & Section 136 Narrative */}
          <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl text-xs space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">
              Tester Findings & Workpaper Notes (Section 136)
            </span>
            <p className="text-slate-800 leading-relaxed font-medium">
              {selectedTest.notes}
            </p>
          </div>
        </div>
      )}

      {/* SAMPLE TESTING GRID (Section 68 & 69) */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden space-y-4 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Sample Attributes Testing Grid (25 Samples)
            </h3>
            <p className="text-xs text-slate-500">
              Verification of Dual Signatory Approval, Threshold Adherence & ERP Release Logs
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <button
              onClick={() => setSampleFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                sampleFilter === 'ALL' ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Samples (25)
            </button>
            <button
              onClick={() => setSampleFilter('FAIL')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                sampleFilter === 'FAIL' ? 'bg-rose-600 text-white shadow-sm' : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
              }`}
            >
              Exceptions Only (2)
            </button>
            <button
              onClick={() => setSampleFilter('PASS')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                sampleFilter === 'PASS' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
              }`}
            >
              Passed Samples (23)
            </button>
          </div>
        </div>

        {/* Table of Samples */}
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-100 sticky top-0 z-10 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
              <tr>
                <th className="py-2.5 px-3 w-12 text-center">#</th>
                <th className="py-2.5 px-3">Transaction Ref</th>
                <th className="py-2.5 px-3">Disbursement Date</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
                <th className="py-2.5 px-3">Attributes Tested</th>
                <th className="py-2.5 px-3 text-center">Result</th>
                <th className="py-2.5 px-4">Observation / Failure Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredSamples.map(s => {
                const isFail = s.result === 'Fail';
                return (
                  <tr
                    key={s.id}
                    className={`transition-colors ${
                      isFail ? 'bg-rose-50/80 font-medium' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                      {s.sampleNumber}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                      {s.transactionRef}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {formatDate(s.transactionDate)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {formatCurrency(s.amount)}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-600">
                      {s.attributesTested}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isFail
                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        }`}
                      >
                        {isFail ? (
                          <>
                            <XCircle className="w-3 h-3 text-rose-600" />
                            <span>Fail</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Pass</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-xs">
                      {isFail ? (
                        <div className="text-rose-800 font-bold flex items-center space-x-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
                          <span>{s.failureReason}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Dual sign-off verified</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
