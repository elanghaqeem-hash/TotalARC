'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  FileCheck,
  Shield,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Database,
  FileSpreadsheet,
  Building2,
  DollarSign
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { TraceabilityFlow } from '@/components/common/TraceabilityFlow';

export default function ICOFRPage() {
  const [activeTab, setActiveTab] = useState<'scoping' | 'assertions' | 'ipe' | 'itgc'>('scoping');

  const significantAccount = {
    code: '2110-001',
    name: 'Trade Accounts Payable & Accrued Expenses',
    statement: 'Balance Sheet',
    balance: 485000000000,
    materialityThreshold: 25000000000,
    isSignificant: true,
    scopingRationale: 'Account balance exceeds quantitative planning materiality (IDR 25B) by 19.4x. Core operational disbursement cycle.',
    assertions: ['Existence', 'Occurrence', 'Completeness', 'Accuracy', 'Cut-off']
  };

  const ipeItem = {
    reportName: 'ZFI_DISB_RUN_REPORT (Disbursement Run Audit Register)',
    systemSource: 'SAP S/4HANA ERP Module FI-AP',
    reportOwner: 'IT Enterprise Applications Team',
    parameters: 'Company Code = 1000, Fiscal Year = 2026, Run Date range',
    logicSummary: 'Extracts all cleared vendor payment proposal batches with approver user ID, timestamp, and amount.',
    completenessTested: true,
    accuracyTested: true,
    evidenceDoc: 'DOC-IPE-SAP-001.pdf'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-sky-600 uppercase tracking-wider">
            <FileCheck className="w-4 h-4" />
            <span>Internal Control over Financial Reporting (ASSURE)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            ICOFR Scoping, Financial Assertions & IPE
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Sections 56–63: Financial Statement &rarr; Significant Account &rarr; Assertion &rarr; Significant Process &rarr; Financial Reporting Key Control &rarr; Certification.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-xs font-bold text-sky-800 bg-sky-50 border border-sky-200 px-3 py-1.5 rounded-xl">
            Framework: SOX-404 / COSO
          </span>
        </div>
      </div>

      <TraceabilityFlow currentStep="RCM" />

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 bg-white px-4 py-2 rounded-xl shadow-sm text-xs font-semibold">
        <button
          onClick={() => setActiveTab('scoping')}
          className={`px-3.5 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
            activeTab === 'scoping'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          <span>Significant Accounts & Scoping (Section 57)</span>
        </button>

        <button
          onClick={() => setActiveTab('assertions')}
          className={`px-3.5 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
            activeTab === 'assertions'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Financial Assertions (Section 58)</span>
        </button>

        <button
          onClick={() => setActiveTab('ipe')}
          className={`px-3.5 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
            activeTab === 'ipe'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>IPE Register (Section 61)</span>
        </button>
      </div>

      {/* TAB 1: SCOPING & SIGNIFICANT ACCOUNTS */}
      {activeTab === 'scoping' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-xs font-bold text-sky-800 bg-sky-100 px-2 py-0.5 rounded">
                    {significantAccount.code}
                  </span>
                  <span className="text-xs text-slate-500 font-semibold">{significantAccount.statement}</span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 mt-1">{significantAccount.name}</h2>
              </div>

              <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-3 py-1 rounded-lg">
                In Scope: Significant Account
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Account Balance</span>
                <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
                  {formatCurrency(significantAccount.balance)}
                </div>
                <span className="text-slate-500 text-[10px]">As of FY2026</span>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Planning Materiality</span>
                <div className="text-2xl font-black text-slate-700 mt-1 font-mono">
                  {formatCurrency(significantAccount.materialityThreshold)}
                </div>
                <span className="text-slate-500 text-[10px]">Threshold basis: 5% PBT</span>
              </div>

              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <span className="text-emerald-700 font-bold uppercase text-[10px]">Materiality Ratio</span>
                <div className="text-2xl font-black text-emerald-800 mt-1">19.4×</div>
                <span className="text-emerald-700 text-[10px] font-bold">Clearly exceeds threshold</span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Scoping Rationale (Section 57):</span>
              <p className="text-slate-800 font-medium leading-relaxed">
                {significantAccount.scopingRationale}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FINANCIAL ASSERTIONS */}
      {activeTab === 'assertions' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">
              Financial Statement Assertions Mapping (Section 58)
            </h3>
            <p className="text-xs text-slate-500">
              Account &rarr; Assertion &rarr; Risk &rarr; Key Control Mapping
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {significantAccount.assertions.map(a => (
              <div
                key={a}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900">{a}</span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    Covered
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Mitigated by CTRL-P2P-001 (Dual Authorization) and CTRL-P2P-002 (3-Way Matching).
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: IPE REGISTER */}
      {activeTab === 'ipe' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <span className="text-xs font-bold text-brand-600 uppercase tracking-wider">
              Information Produced by Entity (Section 61)
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">
              IPE Register & Data Completeness Testing
            </h3>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-3">
            <div className="font-bold text-slate-900 text-sm font-mono">{ipeItem.reportName}</div>
            <div className="grid grid-cols-2 gap-3 text-slate-600">
              <div>System: <strong>{ipeItem.systemSource}</strong></div>
              <div>Owner: <strong>{ipeItem.reportOwner}</strong></div>
            </div>
            <div>Parameters: <span className="font-mono text-[11px] text-slate-800">{ipeItem.parameters}</span></div>
            <p className="text-slate-600 text-[11px]">{ipeItem.logicSummary}</p>
            <div className="pt-2 border-t border-slate-200 flex items-center space-x-4 font-bold text-emerald-700 text-xs">
              <span className="flex items-center space-x-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Completeness Validated</span>
              </span>
              <span className="flex items-center space-x-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Accuracy Validated</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
