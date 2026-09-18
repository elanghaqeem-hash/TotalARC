'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  FolderTree,
  Building2,
  Users,
  Plus,
  ChevronDown,
  ChevronRight,
  Shield,
  Layers,
  ArrowRight
} from 'lucide-react';
import { useRole } from '@/context/RoleContext';

export default function OrganizationPage() {
  const { institutionName } = useRole();
  const [viewMode, setViewMode] = useState<'tree' | 'cards'>('tree');

  const orgTree = {
    name: institutionName,
    code: 'NDS-HQ',
    type: 'Institution',
    head: 'Satria Pratama (Board)',
    children: [
      {
        name: 'Directorate of Finance, Operations & Risk',
        code: 'DIR-FIN-OPS',
        type: 'Directorate',
        head: 'Budi Santoso (CFO)',
        children: [
          {
            name: 'Treasury & Accounts Payable Division',
            code: 'DIV-TREASURY',
            type: 'Division',
            head: 'Maya Indira (VP)',
            children: [
              {
                name: 'Accounts Payable & Payment Disbursement',
                code: 'DEPT-AP',
                type: 'Department',
                head: 'Rizky Ananda (Manager)',
                processesCount: 1,
                controlsCount: 2
              },
              {
                name: 'Cash Management & Bank Relations',
                code: 'DEPT-CASH',
                type: 'Department',
                head: 'Dian Nugraha',
                processesCount: 1,
                controlsCount: 1
              }
            ]
          },
          {
            name: 'Financial Accounting & Reporting Division',
            code: 'DIV-ACCOUNTING',
            type: 'Division',
            head: 'Agus Setiawan',
            children: [
              {
                name: 'General Ledger & Tax Reporting',
                code: 'DEPT-GL',
                type: 'Department',
                head: 'Sri Wahyuni',
                processesCount: 1,
                controlsCount: 2
              }
            ]
          }
        ]
      },
      {
        name: 'Directorate of Information Technology & Security',
        code: 'DIR-IT',
        type: 'Directorate',
        head: 'Fajar Nugroho (CIO/CISO)',
        children: [
          {
            name: 'Enterprise Applications & ERP Operations',
            code: 'DIV-ERP',
            type: 'Division',
            head: 'Rian Wijaya',
            children: [
              {
                name: 'SAP S/4HANA Basis & Security Team',
                code: 'DEPT-SAP',
                type: 'Department',
                head: 'Taufik Hidayat',
                processesCount: 2,
                controlsCount: 3
              }
            ]
          }
        ]
      }
    ]
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-brand-600 uppercase tracking-wider">
            <FolderTree className="w-4 h-4" />
            <span>Organization Structure Builder (MANAGE)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Enterprise Organizational Hierarchy
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Section 16: Institution &rarr; Legal Entity &rarr; Directorate &rarr; Division &rarr; Department &rarr; Unit. Directly maps process and control ownership.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setViewMode('tree')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                viewMode === 'tree' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Tree Hierarchy
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                viewMode === 'cards' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Unit Cards
            </button>
          </div>
        </div>
      </div>

      {/* Tree Visualization */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-900">{orgTree.name}</h2>
              <p className="text-xs text-slate-500">Legal Entity Code: {orgTree.code} • Head: {orgTree.head}</p>
            </div>
          </div>
          <span className="text-xs font-bold text-brand-700 bg-brand-50 px-2.5 py-1 rounded border border-brand-200">
            Root Entity
          </span>
        </div>

        {/* Directorate & Division Nodes */}
        <div className="space-y-6 pl-4 border-l-2 border-brand-200">
          {orgTree.children.map(dir => (
            <div key={dir.code} className="space-y-4">
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                      {dir.code}
                    </span>
                    <span className="text-xs text-slate-400 font-semibold">{dir.type}</span>
                  </div>
                  <h3 className="font-bold text-sm text-slate-900 mt-1">{dir.name}</h3>
                  <div className="text-xs text-slate-500 mt-0.5">Head: <strong>{dir.head}</strong></div>
                </div>
              </div>

              {/* Divisions */}
              <div className="space-y-3 pl-6 border-l-2 border-slate-200">
                {dir.children.map(div => (
                  <div key={div.code} className="space-y-3">
                    <div className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200 flex items-center justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-brand-100 text-brand-800">
                            {div.code}
                          </span>
                          <span className="text-xs text-slate-400 font-semibold">{div.type}</span>
                        </div>
                        <h4 className="font-bold text-xs text-slate-900 mt-1">{div.name}</h4>
                        <div className="text-[11px] text-slate-500 mt-0.5">Lead: {div.head}</div>
                      </div>
                    </div>

                    {/* Departments */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                      {div.children.map(dept => (
                        <div
                          key={dept.code}
                          className="p-3 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 rounded">
                              {dept.code}
                            </span>
                            <span className="text-[10px] font-bold text-emerald-700">
                              {dept.processesCount || 1} Processes
                            </span>
                          </div>
                          <div className="font-bold text-slate-900 text-xs">{dept.name}</div>
                          <div className="text-[11px] text-slate-500">Manager: {dept.head}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
