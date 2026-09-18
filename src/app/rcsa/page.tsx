'use client';

import React, { useEffect, useState } from 'react';
import { ClipboardCheck, Plus } from 'lucide-react';
import { useRole } from '@/context/RoleContext';

type Campaign = { id: string; name: string; type: string; period: string; startDate: string; dueDate: string; status: string; ownerName: string; csaResponses: Array<{ id: string; csaConclusion: string; assessorName: string; assessedAt: string; control: { id: string; controlId: string; name: string } }> };
type Control = { id: string; controlId: string; name: string };

export default function RCSAPage() {
  const { currentUser } = useRole();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [controls, setControls] = useState<Control[]>([]);
  const [message, setMessage] = useState('');
  const [showCampaign, setShowCampaign] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ name: '', type: 'RCSA', period: '', startDate: '', dueDate: '', approverName: '' });
  const [responseForm, setResponseForm] = useState({ campaignId: '', controlId: '', csaConclusion: 'Effective', wasPerformed: true, frequencyMet: true, evidenceAttached: false, exceptionsFound: false, exceptionCount: 0, processChanged: false, controlChanged: false, assessorNotes: '' });

  const load = async () => {
    const [a,b] = await Promise.all([fetch('/api/rcsa', { cache: 'no-store' }), fetch('/api/controls', { cache: 'no-store' })]);
    const ad = await a.json(); const bd = await b.json();
    if (!a.ok) throw new Error(ad.error || 'Unable to load RCSA');
    setCampaigns(ad.campaigns || []);
    setControls((bd.controls || []).map((x:any) => ({ id: x.id, controlId: x.controlId, name: x.name })));
    setResponseForm(v => {
      const open = (ad.campaigns || []).filter((x:Campaign) => x.status === 'In Progress');
      const campaignId = open.some((x:Campaign) => x.id === v.campaignId) ? v.campaignId : open[0]?.id || '';
      return { ...v, campaignId, controlId: v.controlId || bd.controls?.[0]?.id || '' };
    });
  };
  useEffect(() => { load().catch(err => setMessage(err.message)); }, []);

  const createCampaign = async (e: React.FormEvent) => {
    e.preventDefault(); setMessage('');
    const res = await fetch('/api/rcsa', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'CREATE_CAMPAIGN', ...campaignForm }) });
    const data = await res.json(); if(!res.ok) return setMessage(data.error || 'Unable to create campaign');
    setShowCampaign(false); setCampaignForm({ name:'', type:'RCSA', period:'', startDate:'', dueDate:'', approverName:'' }); await load();
  };

  const submitCsa = async (e: React.FormEvent) => {
    e.preventDefault(); setMessage('');
    const res = await fetch('/api/rcsa', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'SUBMIT_CSA', ...responseForm }) });
    const data = await res.json(); if(!res.ok) return setMessage(data.error || 'Unable to submit CSA');
    setResponseForm(v => ({ ...v, assessorNotes:'', exceptionsFound:false, exceptionCount:0 })); await load();
  };

  const changeCampaignStatus = async (campaignId: string, status: string) => {
    setMessage('');
    const res = await fetch('/api/rcsa', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ action:'SET_CAMPAIGN_STATUS', campaignId, status })
    });
    const data = await res.json();
    if(!res.ok) return setMessage(data.error || 'Unable to change campaign status');
    await load();
  };

  const canManageCampaign = ['Admin','Reviewer'].includes(currentUser?.role || '');
  const canSubmitCsa = ['Admin','ControlOwner','ProcessOwner'].includes(currentUser?.role || '');
  const openCampaigns = campaigns.filter(c => c.status === 'In Progress');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-brand-600" />RCSA & CSA Workspace</h1><p className="text-xs text-slate-500 mt-1">Campaigns and control self-assessments are persisted to the shared control library.</p></div>
        <button onClick={() => setShowCampaign(v=>!v)} className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-xs font-bold px-3 py-2 rounded-lg"><Plus className="w-4 h-4" />New Campaign</button>
      </div>
      {message && <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">{message}</div>}

      {showCampaign && <form onSubmit={createCampaign} className="bg-white border border-slate-200 rounded-xl p-5 grid md:grid-cols-2 gap-3 text-xs">
        <label className="font-semibold text-slate-700 md:col-span-2">Campaign name<input required value={campaignForm.name} onChange={e=>setCampaignForm({...campaignForm,name:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="font-semibold text-slate-700">Period<input required value={campaignForm.period} onChange={e=>setCampaignForm({...campaignForm,period:e.target.value})} placeholder="e.g. 2027-Q1" className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="font-semibold text-slate-700">Type<select value={campaignForm.type} onChange={e=>setCampaignForm({...campaignForm,type:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option>RCSA</option><option>CSA</option><option>ICOFR</option></select></label>
        <label className="font-semibold text-slate-700">Start date<input required type="date" value={campaignForm.startDate} onChange={e=>setCampaignForm({...campaignForm,startDate:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <label className="font-semibold text-slate-700">Due date<input required type="date" value={campaignForm.dueDate} onChange={e=>setCampaignForm({...campaignForm,dueDate:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <button className="md:col-span-2 justify-self-start bg-slate-900 text-white font-bold px-4 py-2.5 rounded-lg">Create Campaign</button>
      </form>}

      <form onSubmit={submitCsa} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-900">Submit Control Self-Assessment</h2>
        <div className="grid md:grid-cols-2 gap-3 text-xs">
          <label className="font-semibold text-slate-700">Campaign<select required value={responseForm.campaignId} onChange={e=>setResponseForm({...responseForm,campaignId:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option value="">Select campaign</option>{openCampaigns.map(x=><option key={x.id} value={x.id}>{x.period} — {x.name}</option>)}</select></label>
          <label className="font-semibold text-slate-700">Control<select required value={responseForm.controlId} onChange={e=>setResponseForm({...responseForm,controlId:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option value="">Select control</option>{controls.map(x=><option key={x.id} value={x.id}>{x.controlId} — {x.name}</option>)}</select></label>
          <label className="font-semibold text-slate-700">Conclusion<select value={responseForm.csaConclusion} onChange={e=>setResponseForm({...responseForm,csaConclusion:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option>Effective</option><option>Partially Effective</option><option>Ineffective</option><option>Not Performed</option></select></label>
          <label className="font-semibold text-slate-700">Exception count<input type="number" min="0" value={responseForm.exceptionCount} onChange={e=>setResponseForm({...responseForm,exceptionCount:Number(e.target.value),exceptionsFound:Number(e.target.value)>0})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-slate-700">
          {[
            ['wasPerformed','Performed'],['frequencyMet','Frequency met'],['evidenceAttached','Evidence attached'],['processChanged','Process changed'],['controlChanged','Control changed']
          ].map(([key,label])=><label key={key} className="flex items-center gap-2"><input type="checkbox" checked={(responseForm as any)[key]} onChange={e=>setResponseForm({...responseForm,[key]:e.target.checked})}/>{label}</label>)}
        </div>
        <label className="block text-xs font-semibold text-slate-700">Assessment notes<textarea value={responseForm.assessorNotes} onChange={e=>setResponseForm({...responseForm,assessorNotes:e.target.value})} rows={3} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        <button disabled={!canSubmitCsa || !responseForm.campaignId || !responseForm.controlId} className="bg-brand-600 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-lg">{canSubmitCsa ? 'Submit / Update CSA' : 'Your role cannot submit CSA'}</button>
      </form>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {campaigns.map(c=><article key={c.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex justify-between gap-3"><div><div className="text-[10px] font-mono text-slate-400">{c.period}</div><h3 className="text-sm font-bold text-slate-900">{c.name}</h3></div><span className="text-[10px] bg-slate-100 px-2 py-1 rounded-full h-fit">{c.status}</span></div>
          <div className="text-[11px] text-slate-500 mt-2">{new Date(c.startDate).toLocaleDateString('id-ID')} – {new Date(c.dueDate).toLocaleDateString('id-ID')} • Owner: {c.ownerName}</div>
          {canManageCampaign && <div className="mt-3 flex flex-wrap gap-2">
            {c.status === 'Draft' && <button onClick={()=>changeCampaignStatus(c.id,'In Progress')} className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1.5 rounded-lg">Launch Campaign</button>}
            {c.status === 'In Progress' && <button onClick={()=>changeCampaignStatus(c.id,'Review')} className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1.5 rounded-lg">Move to Review</button>}
            {c.status === 'Review' && <>
              <button onClick={()=>changeCampaignStatus(c.id,'In Progress')} className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg">Reopen</button>
              <button onClick={()=>changeCampaignStatus(c.id,'Completed')} className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1.5 rounded-lg">Complete Campaign</button>
            </>}
          </div>}
          <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
            {c.csaResponses.map(r=><div key={r.id} className="text-[11px] flex justify-between gap-3"><span className="text-slate-700">{r.control.controlId} — {r.control.name}</span><span className="font-semibold text-slate-600">{r.csaConclusion}</span></div>)}
            {!c.csaResponses.length && <div className="text-xs text-slate-400">No CSA response submitted.</div>}
          </div>
        </article>)}
        {!campaigns.length && <div className="xl:col-span-2 border border-dashed border-slate-300 rounded-xl p-8 text-xs text-slate-500">No RCSA/CSA campaign exists yet.</div>}
      </div>
    </div>
  );
}
