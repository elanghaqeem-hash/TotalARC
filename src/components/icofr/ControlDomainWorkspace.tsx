'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Link2, Pencil, Plus, Save, ShieldCheck } from 'lucide-react';

type RecordItem = {
  id: string;
  category: string;
  controlCode: string;
  name: string;
  subcategory?: string | null;
  objective: string;
  riskDescription?: string | null;
  owner: string;
  reviewer?: string | null;
  frequency: string;
  nature: string;
  controlType: string;
  systemName?: string | null;
  processName?: string | null;
  financialStatementArea?: string | null;
  assertions?: string | null;
  frameworkReference?: string | null;
  sourceControlId?: string | null;
  keyControl: boolean;
  status: string;
};

type Props = {
  category: 'ELC' | 'ITGC' | 'ITAC' | 'PLC';
  title: string;
  subtitle: string;
  subcategoryLabel: string;
  subcategoryOptions: string[];
  systemRequired?: boolean;
  processRelevant?: boolean;
};

const blank = {
  id: '',
  controlCode: '',
  name: '',
  subcategory: '',
  objective: '',
  riskDescription: '',
  owner: '',
  reviewer: '',
  frequency: '',
  nature: '',
  controlType: '',
  systemName: '',
  processName: '',
  financialStatementArea: '',
  assertions: '',
  frameworkReference: '',
  sourceControlId: '',
  keyControl: false,
  status: 'Draft'
};

export function ControlDomainWorkspace(props: Props) {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [institution, setInstitution] = useState<any>(null);
  const [processes, setProcesses] = useState<any[]>([]);
  const [sourceControls, setSourceControls] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch('/api/icofr/controls?category=' + encodeURIComponent(props.category), { cache: 'no-store' })
      .then(async res => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Register unavailable.');
        return body;
      })
      .then(body => {
        if (!active) return;
        setRecords(body.records || []);
        setInstitution(body.institution || null);
        setProcesses(body.processes || []);
        setSourceControls(body.sourceControls || []);
        setCandidates(body.candidates || []);
        setError('');
      })
      .catch(err => active && setError(err instanceof Error ? err.message : 'Register unavailable.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [props.category]);

  const keyCount = useMemo(() => records.filter(item => item.keyControl).length, [records]);

  const selectSourceControl = (sourceControlId: string) => {
    if (!sourceControlId) {
      setForm(current => ({ ...current, sourceControlId: '' }));
      return;
    }

    const source = sourceControls.find(control => String(control.id) === String(sourceControlId));
    if (!source) {
      setForm(current => ({ ...current, sourceControlId }));
      return;
    }

    setForm(current => ({
      ...current,
      sourceControlId,
      name: current.name || source.name || '',
      objective: current.objective || source.objective || '',
      owner: current.owner || source.controlOwner || '',
      frequency: current.frequency || source.frequency || '',
      nature: current.nature || source.nature || '',
      controlType: current.controlType || source.type || '',
      processName: current.processName || source.process?.name || '',
      keyControl: current.keyControl || Boolean(source.isKeyControl)
    }));
  };

  const sourceControlLabel = (sourceControlId?: string | null) => {
    if (!sourceControlId) return '';
    const source = sourceControls.find(control => String(control.id) === String(sourceControlId));
    return source ? `${source.controlId} · ${source.name}` : 'Linked Control Master record';
  };

  const edit = (item: RecordItem) => {
    setForm({
      id: item.id,
      controlCode: item.controlCode || '',
      name: item.name || '',
      subcategory: item.subcategory || '',
      objective: item.objective || '',
      riskDescription: item.riskDescription || '',
      owner: item.owner || '',
      reviewer: item.reviewer || '',
      frequency: item.frequency || '',
      nature: item.nature || '',
      controlType: item.controlType || '',
      systemName: item.systemName || '',
      processName: item.processName || '',
      financialStatementArea: item.financialStatementArea || '',
      assertions: item.assertions || '',
      frameworkReference: item.frameworkReference || '',
      sourceControlId: item.sourceControlId || '',
      keyControl: Boolean(item.keyControl),
      status: item.status || 'Draft'
    });
    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reset = () => {
    setForm(blank);
    setMessage('');
    setError('');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/icofr/controls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, category: props.category })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Failed to save control.');
      setRecords(current => {
        const exists = current.some(item => item.id === body.id);
        return exists
          ? current.map(item => item.id === body.id ? body : item)
          : [...current, body].sort((a, b) => a.controlCode.localeCompare(b.controlCode));
      });
      setForm(current => ({ ...current, id: body.id }));
      setMessage(form.id ? 'Control updated in Cloudflare D1.' : 'Control saved in Cloudflare D1.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save control.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-sky-600">
              <ShieldCheck className="h-4 w-4" /> ICOFR · {props.category}
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">{props.title}</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">{props.subtitle}</p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold flex-wrap">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{records.length} controls</span>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700">{keyCount} key</span>
            <Link href="/controls" className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-slate-600 hover:text-brand-700">
              <Link2 className="h-3 w-3" /> Control Master
            </Link>
            <Link href="/processes" className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-slate-600 hover:text-brand-700">
              <Link2 className="h-3 w-3" /> Process
            </Link>
          </div>
        </div>
      </div>

      {error && <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      {message && <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{message}</div>}

      {!loading && !institution ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">Register an institution before maintaining ICOFR controls.</div>
      ) : (
        <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900">{form.id ? 'Edit control' : 'Register control'}</h2>
              <p className="text-[10px] text-slate-500">Persisted ICOFR control definition. Fields start blank by design.</p>
            </div>
            {form.id && <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-bold text-slate-600"><Plus className="h-3 w-3" />New</button>}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-xs font-bold text-slate-700">Control code *
              <input required value={form.controlCode} onChange={e=>setForm({...form,controlCode:e.target.value})} placeholder={props.category + '-001'} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-brand-100" />
            </label>
            <label className="text-xs font-bold text-slate-700">Control name *
              <input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-brand-100" />
            </label>
            <label className="text-xs font-bold text-slate-700">{props.subcategoryLabel}
              <select value={form.subcategory} onChange={e=>setForm({...form,subcategory:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                <option value="">Select</option>
                {props.subcategoryOptions.map(option=><option key={option}>{option}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-700 md:col-span-2 xl:col-span-3">Control objective *
              <textarea required rows={2} value={form.objective} onChange={e=>setForm({...form,objective:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5" />
            </label>
            <label className="text-xs font-bold text-slate-700 md:col-span-2 xl:col-span-3">Financial reporting risk / failure mode
              <textarea rows={2} value={form.riskDescription} onChange={e=>setForm({...form,riskDescription:e.target.value})} placeholder="Describe what could cause a material misstatement or reporting failure." className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-5" />
            </label>
            <label className="text-xs font-bold text-slate-700">Owner *
              <input required value={form.owner} onChange={e=>setForm({...form,owner:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-xs font-bold text-slate-700">Reviewer
              <input value={form.reviewer} onChange={e=>setForm({...form,reviewer:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-xs font-bold text-slate-700">Frequency *
              <select required value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                <option value="">Select</option><option>Continuous</option><option>Per Transaction</option><option>Event Driven</option><option>Daily</option><option>Weekly</option><option>Monthly</option><option>Quarterly</option><option>Semi-Annual</option><option>Annual</option><option>Pending Validation</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-700">Nature *
              <select required value={form.nature} onChange={e=>setForm({...form,nature:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                <option value="">Select</option><option>Manual</option><option>IT Dependent Manual</option><option>Automated</option><option>ITDM-EUC</option><option>ITDM-IPE</option><option>MRC</option><option>Pending Validation</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-700">Control type *
              <select required value={form.controlType} onChange={e=>setForm({...form,controlType:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                <option value="">Select</option><option>Preventive</option><option>Detective</option><option>Preventive & Detective</option><option>Pending Validation</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-700">System / application {props.systemRequired ? '*' : ''}
              <input required={props.systemRequired} value={form.systemName} onChange={e=>setForm({...form,systemName:e.target.value})} placeholder={props.systemRequired ? 'Required for this domain' : 'Optional'} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-xs font-bold text-slate-700">Link to Single Control Library
              <select value={form.sourceControlId} onChange={e=>selectSourceControl(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                <option value="">No Control Master link</option>
                {sourceControls.map(control => (
                  <option key={control.id} value={control.id}>
                    {control.controlId} · {control.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-700">Business process
              <select value={form.processName} onChange={e=>setForm({...form,processName:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                <option value="">No process selected</option>
                {processes.map(process => (
                  <option key={process.id} value={process.name}>
                    {process.processId} · {process.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-700">FS area / account
              <input value={form.financialStatementArea} onChange={e=>setForm({...form,financialStatementArea:e.target.value})} placeholder="e.g. Revenue, Cash, Loans" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-xs font-bold text-slate-700">Assertions
              <input value={form.assertions} onChange={e=>setForm({...form,assertions:e.target.value})} placeholder="Existence, Completeness, Accuracy..." className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-xs font-bold text-slate-700">Framework / principle
              <input value={form.frameworkReference} onChange={e=>setForm({...form,frameworkReference:e.target.value})} placeholder="COSO principle / internal framework" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-xs font-bold text-slate-700">Status
              <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                <option>Draft</option><option>Under Review</option><option>Approved</option><option>Retired</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700">
              <input type="checkbox" checked={form.keyControl} onChange={e=>setForm({...form,keyControl:e.target.checked})} className="rounded border-slate-300 text-brand-600" />
              Key ICOFR Control
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving…' : form.id ? 'Update Control' : 'Save Control'}</button>
          </div>
        </form>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black text-slate-900">{props.category} register</h2><span className="text-[10px] text-slate-400">Cloudflare D1</span></div>
        {loading ? <div className="py-8 text-center text-xs text-slate-500">Loading…</div> : records.length===0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">No {props.category} controls registered.</div> : (
          <div className="space-y-2">
            {records.map(item=>(
              <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] font-black text-brand-700">{item.controlCode}</span>{item.keyControl&&<span className="rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-bold text-sky-700">Key</span>}<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">{item.status}</span></div>
                    <div className="mt-1 text-sm font-bold text-slate-900">{item.name}</div>
                    <div className="mt-1 text-[10px] text-slate-500">{[item.subcategory,item.systemName,item.processName].filter(Boolean).join(' · ') || 'No additional classification'}</div>
                    {item.sourceControlId && (
                      <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-brand-700">
                        <Link2 className="h-3 w-3" /> {sourceControlLabel(item.sourceControlId)}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={()=>edit(item)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:text-brand-700"><Pencil className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mt-2 text-[11px] leading-5 text-slate-600">{item.objective}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {props.category === 'ITAC' && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900">Source-backed ITAC candidates</h2>
              <p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-600">
                Candidate controls are shown for reconciliation only. They are not promoted into the ITAC register until the
                application dependency, automated logic, Process Owner confirmation, and walkthrough evidence are validated.
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black text-amber-800">
              {candidates.length} pending review
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {candidates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-amber-200 bg-white/70 p-6 text-center text-xs text-slate-500">
                No source-backed ITAC candidates are currently identified.
              </div>
            ) : candidates.map(candidate => (
              <div key={candidate.id} className="rounded-xl border border-amber-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] font-black text-brand-700">{candidate.controlId}</span>
                  <span className={
                    `rounded-full px-2 py-0.5 text-[9px] font-black ${
                      candidate.candidateStatus === 'CONTRADICTORY_SOURCE_CLASSIFICATION'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-amber-50 text-amber-700'
                    }`
                  }>
                    {String(candidate.candidateStatus || '').replaceAll('_', ' ')}
                  </span>
                </div>
                <div className="mt-1 text-sm font-bold text-slate-900">{candidate.name}</div>
                <div className="mt-1 text-[10px] text-slate-500">
                  {[candidate.enterpriseProcessId, candidate.processName, candidate.systemDependency].filter(Boolean).join(' · ')}
                </div>
                <div className="mt-2 text-[11px] leading-5 text-slate-600">{candidate.governanceNote}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
