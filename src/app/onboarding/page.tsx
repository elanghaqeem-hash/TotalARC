'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/context/RoleContext';
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  Shield,
  Layers,
  FileCheck2,
  Sparkles,
  AlertCircle
} from 'lucide-react';

export default function OnboardingPage() {
  const router = useRouter();
  const { setInstitutionName } = useRole();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [industries, setIndustries] = useState<any[]>([]);
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [existingInstitution, setExistingInstitution] = useState<any | null>(null);
  const [saveError, setSaveError] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    legalName: '',
    shortName: '',
    institutionType: '',
    country: 'Indonesia',
    provinceState: '',
    city: '',
    registeredAddress: '',
    website: '',
    generalEmail: '',
    telephone: '',
    yearEstablished: '',
    stockExchange: '',
    ticker: '',
    selectedIndustry: 'Financial Services',
    selectedSector: 'Commercial Banking',
    selectedSubsector: 'Corporate & Retail Banking',
    businessModel: '',
    operatingModel: '',
    employeeCount: '',
    revenueRange: '',
    applicableFrameworks: [] as string[]
  });

  useEffect(() => {
    fetch('/api/onboarding', { cache: 'no-store' })
      .then(async res => {
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || 'Institution master could not be loaded.');
        return payload;
      })
      .then(d => {
        setIndustries(d.industries || []);
        setFrameworks(d.frameworks || []);
        setExistingInstitution(d.institution || null);

        if (d.institution) {
          const institution = d.institution;
          setFormData(current => ({
            ...current,
            name: institution.name || '',
            legalName: institution.legalName || '',
            shortName: institution.shortName || '',
            institutionType: institution.institutionType || '',
            country: institution.country || 'Indonesia',
            provinceState: institution.provinceState || '',
            city: institution.city || '',
            registeredAddress: institution.registeredAddress || '',
            website: institution.website || '',
            generalEmail: institution.generalEmail || '',
            telephone: institution.telephone || '',
            yearEstablished: institution.yearEstablished ? String(institution.yearEstablished) : '',
            stockExchange: institution.stockExchange || '',
            ticker: institution.ticker || '',
            businessModel: institution.businessModel || '',
            operatingModel: institution.operatingModel || '',
            employeeCount: institution.employeeCount || '',
            revenueRange: institution.revenueRange || ''
          }));
        }
      })
      .catch(error => setSaveError(error instanceof Error ? error.message : 'Institution master could not be loaded.'));
  }, []);

  const institutionTypes = [
    'Corporation',
    'Public Company',
    'Private Company',
    'State-Owned Enterprise',
    'Regional-Owned Enterprise',
    'Government Institution',
    'Financial Institution',
    'Healthcare Institution',
    'Educational Institution',
    'Professional Firm',
    'Holding Company',
    'Subsidiary',
    'Start-up'
  ];

  const handleSubmit = async () => {
    setLoading(true);
    setSaveError('');
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Institution master could not be saved.');
      }

      setExistingInstitution(payload.institution || null);
      setInstitutionName(payload.institution?.name || formData.name);
      router.push('/organization');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Institution master could not be saved.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center space-x-2 text-xs font-bold text-brand-600 uppercase tracking-wider">
          <Building2 className="w-4 h-4" />
          <span>Institution Registration Wizard</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
          Onboard Your Enterprise to Total ARC
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Configure your legal profile, industry classification, operating model, and applicable frameworks once. All assurance activities will dynamically inherit this master data.
        </p>

        {existingInstitution && (
          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />
                Live institution master loaded from Cloudflare D1
              </div>
              <div className="mt-1 text-[11px] text-emerald-700">
                {existingInstitution.legalName} · {existingInstitution.city || existingInstitution.country}
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push('/organization')}
              className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-[11px] font-black text-emerald-800 hover:bg-emerald-100"
            >
              Open Organization Structure
            </button>
          </div>
        )}

        {saveError && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        {/* Stepper Progress */}
        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
          {[
            { num: 1, title: 'Legal Profile' },
            { num: 2, title: 'Industry & Sector' },
            { num: 3, title: 'Operating Model' },
            { num: 4, title: 'Regulatory & Frameworks' },
            { num: 5, title: 'Review & Activate' }
          ].map(s => (
            <div key={s.num} className="flex items-center space-x-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step === s.num
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
                    : step > s.num
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {step > s.num ? <CheckCircle2 className="w-4 h-4" /> : s.num}
              </div>
              <span
                className={`hidden sm:inline-block text-xs font-semibold ${
                  step === s.num ? 'text-slate-900 font-bold' : 'text-slate-400'
                }`}
              >
                {s.title}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Form Container */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        {/* Step 1: Legal Profile */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              1. Institution Legal Identity
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Institution Common Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Registered Legal Name *
                </label>
                <input
                  type="text"
                  value={formData.legalName}
                  onChange={e => setFormData({ ...formData, legalName: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Short Name / Ticker Acronym
                </label>
                <input
                  type="text"
                  value={formData.shortName}
                  onChange={e => setFormData({ ...formData, shortName: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Province / State</label>
                <input
                  type="text"
                  value={formData.provinceState}
                  onChange={e => setFormData({ ...formData, provinceState: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Institution Type *
                </label>
                <select
                  value={formData.institutionType}
                  onChange={e => setFormData({ ...formData, institutionType: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                >
                  <option value="">Select institution type</option>
                  {institutionTypes.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Stock Exchange & Ticker</label>
                <input
                  type="text"
                  value={
                    formData.stockExchange || formData.ticker
                      ? `${formData.stockExchange}${formData.stockExchange && formData.ticker ? ': ' : ''}${formData.ticker}`
                      : ''
                  }
                  onChange={e => {
                    const rawValue = e.target.value;
                    const separatorIndex = rawValue.indexOf(':');

                    if (separatorIndex === -1) {
                      setFormData({ ...formData, stockExchange: rawValue.trim(), ticker: '' });
                      return;
                    }

                    setFormData({
                      ...formData,
                      stockExchange: rawValue.slice(0, separatorIndex).trim(),
                      ticker: rawValue.slice(separatorIndex + 1).trim()
                    });
                  }}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Industry Classification */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              2. Industry & Sector Classification (Section 12)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Industry Group</label>
                <select
                  value={formData.selectedIndustry}
                  onChange={e => setFormData({ ...formData, selectedIndustry: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                >
                  <option value="Technology">Technology</option>
                  <option value="Financial Services">Financial Services</option>
                  <option value="Energy">Energy</option>
                  <option value="Mining">Mining</option>
                  <option value="Manufacturing">Manufacturing</option>
                  <option value="Telecommunications">Telecommunications</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Retail & Consumer">Retail & Consumer</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Sector</label>
                <input
                  type="text"
                  value={formData.selectedSector}
                  onChange={e => setFormData({ ...formData, selectedSector: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Subsector</label>
                <input
                  type="text"
                  value={formData.selectedSubsector}
                  onChange={e => setFormData({ ...formData, selectedSubsector: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="p-3 bg-brand-50 border border-brand-200 rounded-lg text-xs text-brand-800 flex items-start space-x-2">
              <Sparkles className="w-4 h-4 text-brand-600 flex-shrink-0 mt-0.5" />
              <span>
                Total ARC contains pre-configured risk taxonomies and control libraries specifically tuned for <strong>{formData.selectedIndustry}</strong>.
              </span>
            </div>
          </div>
        )}

        {/* Step 3: Operating Model */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              3. Organization Scale & Operating Model (Section 13)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Business Model</label>
                <select
                  value={formData.businessModel}
                  onChange={e => setFormData({ ...formData, businessModel: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                >
                  <option value="B2B">B2B (Business to Business)</option>
                  <option value="B2C">B2C (Business to Consumer)</option>
                  <option value="B2B2C">B2B2C (Hybrid Marketplace)</option>
                  <option value="B2G">B2G (Government Services)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Operating Model</label>
                <select
                  value={formData.operatingModel}
                  onChange={e => setFormData({ ...formData, operatingModel: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                >
                  <option value="Centralized">Centralized</option>
                  <option value="Decentralized">Decentralized</option>
                  <option value="Federated">Federated</option>
                  <option value="Shared Service">Shared Service</option>
                  <option value="Hybrid">Hybrid</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Employee Scale</label>
                <select
                  value={formData.employeeCount}
                  onChange={e => setFormData({ ...formData, employeeCount: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                >
                  <option value="100 - 500 Employees">100 - 500 Employees</option>
                  <option value="500 - 1,000 Employees">500 - 1,000 Employees</option>
                  <option value="2,500 - 5,000 Employees">2,500 - 5,000 Employees</option>
                  <option value="> 10,000 Employees">&gt; 10,000 Employees</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Revenue Range</label>
                <select
                  value={formData.revenueRange}
                  onChange={e => setFormData({ ...formData, revenueRange: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                >
                  <option value="IDR 100B - IDR 500B">IDR 100 Miliar - IDR 500 Miliar</option>
                  <option value="IDR 500B - IDR 1T">IDR 500 Miliar - IDR 1 Triliun</option>
                  <option value="IDR 1 Trillion - IDR 5 Trillion">IDR 1 Triliun - IDR 5 Triliun</option>
                  <option value="> IDR 10 Trillion">&gt; IDR 10 Triliun</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Regulatory & Frameworks */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              4. Governance Frameworks & Standards (Section 15)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {[
                { code: 'COSO-IC', name: 'COSO Internal Control — Integrated Framework', badge: 'Mandatory for ICOFR' },
                { code: 'ISO-31000', name: 'ISO 31000:2018 Risk Management Guidelines', badge: 'ERM Standard' },
                { code: 'ISO-27001', name: 'ISO/IEC 27001 Information Security', badge: 'Cybersecurity' },
                { code: 'SOX-404', name: 'Sarbanes-Oxley Act Sec. 404 (ICOFR)', badge: 'Public Markets' },
                { code: 'POJK-13', name: 'OJK POJK 13/2017 Integrated Governance', badge: 'Financial Sector' },
                { code: 'UU-PDP', name: 'UU No. 27/2022 Pelindungan Data Pribadi', badge: 'Privacy' }
              ].map(f => (
                <div
                  key={f.code}
                  className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-slate-900">{f.code}</div>
                    <div className="text-slate-500 text-[11px]">{f.name}</div>
                  </div>
                  <span className="text-[10px] font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                    {f.badge}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Review & Activate */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              5. Final Confirmation & Workspace Activation
            </h2>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500 font-medium">Institution Name:</span>
                <span className="font-bold text-slate-900">{formData.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500 font-medium">Industry / Sector:</span>
                <span className="font-bold text-slate-900">{formData.selectedIndustry} → {formData.selectedSector}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500 font-medium">Operating Model:</span>
                <span className="font-bold text-slate-900">{formData.operatingModel} ({formData.businessModel})</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500 font-medium">Operational Seed Data:</span>
                <span className="font-bold text-slate-700">None — real records only</span>
              </div>
            </div>

            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span>
                Your institution record will be created with an empty operational workspace. Processes, risks, controls, assessments, tests, and monitoring results are added only from real user input or approved integrations.
              </span>
            </div>
          </div>
        )}

        {/* Wizard Navigation Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
          ) : (
            <div></div>
          )}

          {step < 5 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-sm shadow-brand-500/20 transition-all"
            >
              <span>Continue Step {step + 1}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="inline-flex items-center space-x-2 px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm shadow-emerald-500/20 transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? 'Saving Institution...' : existingInstitution ? 'Save & Continue to Organization' : 'Create Institution & Continue'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
