'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Copy, ShieldCheck } from 'lucide-react';

type Industry = { id:string; industry:string; sector:string; subsector:string };

const institutionTypes = [
  'Corporation','Public Company','State-Owned Enterprise','Regional-Owned Enterprise',
  'Financial Institution','Government Agency','Non-Profit Organization','Educational Institution','Other'
];

export default function OnboardingPage() {
  const [industries,setIndustries]=useState<Industry[]>([]);
  const [message,setMessage]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const [result,setResult]=useState<{institutionName:string;adminEmail:string;temporaryPassword:string}|null>(null);
  const [form,setForm]=useState({
    name:'',legalName:'',shortName:'',institutionType:'Corporation',country:'Indonesia',
    provinceState:'',city:'',registeredAddress:'',operationalAddress:'',website:'',generalEmail:'',
    telephone:'',yearEstablished:'',registrationNumber:'',taxId:'',parentCompany:'',holdingCompany:'',
    stockExchange:'',ticker:'',employeeCount:'',revenueRange:'',businessModel:'',operatingModel:'',
    industryId:'',adminName:'',adminEmail:'',adminDepartment:'Administration'
  });

  useEffect(()=>{
    fetch('/api/onboarding',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to load reference data');setIndustries(d.industries||[]);}).catch(e=>setMessage(e.message));
  },[]);

  const selectedIndustry=useMemo(()=>industries.find(x=>x.id===form.industryId),[industries,form.industryId]);

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setSubmitting(true);setMessage('');setResult(null);
    try{
      const res=await fetch('/api/onboarding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Institution onboarding failed');
      setResult({institutionName:data.institution.name,adminEmail:data.admin.email,temporaryPassword:data.temporaryPassword});
    }catch(e){setMessage(e instanceof Error?e.message:'Institution onboarding failed');}
    finally{setSubmitting(false);}
  };

  if(result){
    return <div className="max-w-2xl mx-auto space-y-5">
      <div className="bg-white border border-emerald-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start gap-3"><CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0"/><div><h1 className="text-lg font-black text-slate-900">Institution successfully provisioned</h1><p className="text-xs text-slate-500 mt-1">{result.institutionName} now has its own isolated tenant and initial administrator.</p></div></div>
        <div className="mt-5 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
          <div><span className="text-slate-500">Administrator email</span><div className="font-bold text-slate-900 mt-0.5">{result.adminEmail}</div></div>
          <div><span className="text-slate-500">One-time temporary password</span><div className="flex items-center gap-2 mt-0.5"><code className="font-bold text-slate-900 bg-white border border-slate-200 px-2 py-1 rounded">{result.temporaryPassword}</code><button onClick={()=>navigator.clipboard.writeText(result.temporaryPassword)} className="p-1.5 rounded hover:bg-slate-200" title="Copy password"><Copy className="w-4 h-4"/></button></div></div>
          <div className="flex gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5"><ShieldCheck className="w-4 h-4 shrink-0"/><span>This password is returned only at provisioning/reset time. Share it securely. The administrator must replace it at first sign-in.</span></div>
        </div>
        <button onClick={()=>{setResult(null);setForm({...form,name:'',legalName:'',shortName:'',adminName:'',adminEmail:''});}} className="mt-5 bg-brand-600 text-white text-xs font-bold px-4 py-2.5 rounded-lg">Onboard another institution</button>
      </div>
    </div>;
  }

  return <div className="space-y-6">
    <div><h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><Building2 className="w-5 h-5 text-brand-600"/>Institution Onboarding</h1><p className="text-xs text-slate-500 mt-1">Create a real isolated tenant and its first administrator. No sample process, risk, control or transaction is generated.</p></div>
    {message&&<div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{message}</div>}
    <form onSubmit={submit} className="space-y-5">
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">1. Institution Identity</h2>
        <div className="mt-4 grid md:grid-cols-2 gap-3 text-xs">
          <label className="font-semibold text-slate-700">Institution name *<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
          <label className="font-semibold text-slate-700">Legal name<input value={form.legalName} onChange={e=>setForm({...form,legalName:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
          <label className="font-semibold text-slate-700">Short name / code *<input required maxLength={30} value={form.shortName} onChange={e=>setForm({...form,shortName:e.target.value.toUpperCase()})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
          <label className="font-semibold text-slate-700">Institution type<select value={form.institutionType} onChange={e=>setForm({...form,institutionType:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white">{institutionTypes.map(x=><option key={x}>{x}</option>)}</select></label>
          <label className="font-semibold text-slate-700">Industry reference<select value={form.industryId} onChange={e=>setForm({...form,industryId:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option value="">Select if applicable</option>{industries.map(x=><option key={x.id} value={x.id}>{x.industry} → {x.sector} → {x.subsector}</option>)}</select></label>
          <label className="font-semibold text-slate-700">Year established<input type="number" min="1800" max={new Date().getFullYear()} value={form.yearEstablished} onChange={e=>setForm({...form,yearEstablished:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        </div>
        {selectedIndustry&&<div className="mt-3 text-[11px] text-slate-500">Selected classification: {selectedIndustry.industry} / {selectedIndustry.sector} / {selectedIndustry.subsector}</div>}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">2. Legal, Location & Contact</h2>
        <div className="mt-4 grid md:grid-cols-2 gap-3 text-xs">
          {[
            ['country','Country'],['provinceState','Province / State'],['city','City'],['registrationNumber','Registration number'],
            ['taxId','Tax ID'],['website','Website'],['generalEmail','General email'],['telephone','Telephone'],
            ['parentCompany','Parent company'],['holdingCompany','Holding company'],['stockExchange','Stock exchange'],['ticker','Ticker']
          ].map(([key,label])=><label key={key} className="font-semibold text-slate-700">{label}<input value={(form as any)[key]} onChange={e=>setForm({...form,[key]:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>)}
          <label className="font-semibold text-slate-700 md:col-span-2">Registered address<textarea value={form.registeredAddress} onChange={e=>setForm({...form,registeredAddress:e.target.value})} rows={2} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
          <label className="font-semibold text-slate-700 md:col-span-2">Operational address<textarea value={form.operationalAddress} onChange={e=>setForm({...form,operationalAddress:e.target.value})} rows={2} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">3. Operating Profile</h2>
        <div className="mt-4 grid md:grid-cols-2 gap-3 text-xs">
          <label className="font-semibold text-slate-700">Business model<input placeholder="B2B, B2C, marketplace, regulated service, etc." value={form.businessModel} onChange={e=>setForm({...form,businessModel:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
          <label className="font-semibold text-slate-700">Operating model<input placeholder="Centralized, federated, decentralized, hybrid" value={form.operatingModel} onChange={e=>setForm({...form,operatingModel:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
          <label className="font-semibold text-slate-700">Employee count / range<input value={form.employeeCount} onChange={e=>setForm({...form,employeeCount:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
          <label className="font-semibold text-slate-700">Revenue range<input value={form.revenueRange} onChange={e=>setForm({...form,revenueRange:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">4. Initial Tenant Administrator</h2>
        <p className="text-[11px] text-slate-500 mt-1">Total ARC creates one real administrator account with a cryptographically generated temporary password.</p>
        <div className="mt-4 grid md:grid-cols-2 gap-3 text-xs">
          <label className="font-semibold text-slate-700">Administrator name *<input required value={form.adminName} onChange={e=>setForm({...form,adminName:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
          <label className="font-semibold text-slate-700">Administrator email *<input required type="email" value={form.adminEmail} onChange={e=>setForm({...form,adminEmail:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
          <label className="font-semibold text-slate-700 md:col-span-2">Department<input value={form.adminDepartment} onChange={e=>setForm({...form,adminDepartment:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
        </div>
      </section>

      <button disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold px-6 py-3 rounded-xl">{submitting?'Provisioning secure tenant…':'Create Institution & Administrator'}</button>
    </form>
  </div>;
}
