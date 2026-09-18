'use client';

import React, { useEffect, useState } from 'react';
import { FileCheck, Plus } from 'lucide-react';

type Account = { id:string; accountCode:string; accountName:string; financialStatement:string; balanceAmount:number; isSignificant:boolean; scopingRationale?:string|null; assertions:Array<{id:string;assertion:string;isInScope:boolean}> };
type IPE = { id:string; reportName:string; systemSource:string; reportOwner:string; completenessTested:boolean; accuracyTested:boolean; evidenceDoc?:string|null };

export default function ICOFRPage() {
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [ipe,setIpe]=useState<IPE[]>([]);
  const [message,setMessage]=useState('');
  const [tab,setTab]=useState<'accounts'|'ipe'>('accounts');
  const [show,setShow]=useState(false);
  const [accountForm,setAccountForm]=useState({accountCode:'',accountName:'',financialStatement:'Balance Sheet',balanceAmount:'',isSignificant:false,scopingRationale:'',assertions:'Existence,Completeness,Valuation'});
  const [ipeForm,setIpeForm]=useState({reportName:'',systemSource:'',reportOwner:'',parameters:'',logicSummary:'',completenessTested:false,accuracyTested:false,evidenceDoc:''});

  const load=async()=>{const r=await fetch('/api/icofr',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to load ICOFR data');setAccounts(d.accounts||[]);setIpe(d.ipe||[]);};
  useEffect(()=>{load().catch(e=>setMessage(e.message));},[]);

  const createAccount=async(e:React.FormEvent)=>{e.preventDefault();const r=await fetch('/api/icofr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'CREATE_ACCOUNT',...accountForm,balanceAmount:Number(accountForm.balanceAmount||0),assertions:accountForm.assertions.split(',').map(x=>x.trim()).filter(Boolean)})});const d=await r.json();if(!r.ok)return setMessage(d.error||'Unable to create account');setShow(false);await load();};
  const createIpe=async(e:React.FormEvent)=>{e.preventDefault();const r=await fetch('/api/icofr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'CREATE_IPE',...ipeForm})});const d=await r.json();if(!r.ok)return setMessage(d.error||'Unable to create IPE');setShow(false);await load();};

  return <div className="space-y-6">
    <div className="flex items-center justify-between"><div><h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><FileCheck className="w-5 h-5 text-brand-600"/>ICOFR & Financial Assertions</h1><p className="text-xs text-slate-500 mt-1">Significant accounts, assertions and IPE records are stored in the database.</p></div><button onClick={()=>setShow(v=>!v)} className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-xs font-bold px-3 py-2 rounded-lg"><Plus className="w-4 h-4"/>Add {tab==='accounts'?'Account':'IPE'}</button></div>
    {message&&<div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">{message}</div>}
    <div className="flex gap-2"><button onClick={()=>{setTab('accounts');setShow(false)}} className={`text-xs font-bold px-3 py-2 rounded-lg ${tab==='accounts'?'bg-slate-900 text-white':'bg-white border border-slate-200'}`}>Financial Accounts</button><button onClick={()=>{setTab('ipe');setShow(false)}} className={`text-xs font-bold px-3 py-2 rounded-lg ${tab==='ipe'?'bg-slate-900 text-white':'bg-white border border-slate-200'}`}>IPE Register</button></div>

    {show&&tab==='accounts'&&<form onSubmit={createAccount} className="bg-white border border-slate-200 rounded-xl p-5 grid md:grid-cols-2 gap-3 text-xs">
      <label className="font-semibold text-slate-700">Account code<input required value={accountForm.accountCode} onChange={e=>setAccountForm({...accountForm,accountCode:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <label className="font-semibold text-slate-700">Account name<input required value={accountForm.accountName} onChange={e=>setAccountForm({...accountForm,accountName:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <label className="font-semibold text-slate-700">Financial statement<select value={accountForm.financialStatement} onChange={e=>setAccountForm({...accountForm,financialStatement:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 bg-white"><option>Balance Sheet</option><option>Income Statement</option><option>Cash Flow</option><option>Notes</option></select></label>
      <label className="font-semibold text-slate-700">Balance amount<input type="number" value={accountForm.balanceAmount} onChange={e=>setAccountForm({...accountForm,balanceAmount:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <label className="font-semibold text-slate-700 md:col-span-2">Assertions (comma separated)<input value={accountForm.assertions} onChange={e=>setAccountForm({...accountForm,assertions:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <label className="md:col-span-2 flex items-center gap-2 font-semibold text-slate-700"><input type="checkbox" checked={accountForm.isSignificant} onChange={e=>setAccountForm({...accountForm,isSignificant:e.target.checked})}/>Significant account</label>
      <label className="font-semibold text-slate-700 md:col-span-2">Scoping rationale<textarea value={accountForm.scopingRationale} onChange={e=>setAccountForm({...accountForm,scopingRationale:e.target.value})} rows={3} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <button className="md:col-span-2 justify-self-start bg-slate-900 text-white font-bold px-4 py-2.5 rounded-lg">Create Account</button>
    </form>}
    {show&&tab==='ipe'&&<form onSubmit={createIpe} className="bg-white border border-slate-200 rounded-xl p-5 grid md:grid-cols-2 gap-3 text-xs">
      <label className="font-semibold text-slate-700">Report name<input required value={ipeForm.reportName} onChange={e=>setIpeForm({...ipeForm,reportName:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <label className="font-semibold text-slate-700">System source<input required value={ipeForm.systemSource} onChange={e=>setIpeForm({...ipeForm,systemSource:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <label className="font-semibold text-slate-700">Report owner<input required value={ipeForm.reportOwner} onChange={e=>setIpeForm({...ipeForm,reportOwner:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <label className="font-semibold text-slate-700">Evidence reference<input value={ipeForm.evidenceDoc} onChange={e=>setIpeForm({...ipeForm,evidenceDoc:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <label className="font-semibold text-slate-700 md:col-span-2">Parameters<textarea value={ipeForm.parameters} onChange={e=>setIpeForm({...ipeForm,parameters:e.target.value})} rows={2} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <label className="font-semibold text-slate-700 md:col-span-2">Logic summary<textarea value={ipeForm.logicSummary} onChange={e=>setIpeForm({...ipeForm,logicSummary:e.target.value})} rows={2} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5"/></label>
      <div className="md:col-span-2 flex gap-5"><label className="flex items-center gap-2"><input type="checkbox" checked={ipeForm.completenessTested} onChange={e=>setIpeForm({...ipeForm,completenessTested:e.target.checked})}/>Completeness tested</label><label className="flex items-center gap-2"><input type="checkbox" checked={ipeForm.accuracyTested} onChange={e=>setIpeForm({...ipeForm,accuracyTested:e.target.checked})}/>Accuracy tested</label></div>
      <button className="md:col-span-2 justify-self-start bg-slate-900 text-white font-bold px-4 py-2.5 rounded-lg">Create IPE</button>
    </form>}

    {tab==='accounts'?<div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="text-left p-3">Account</th><th className="text-left p-3">Statement</th><th className="text-right p-3">Balance</th><th className="text-left p-3">Significant</th><th className="text-left p-3">Assertions</th></tr></thead><tbody className="divide-y divide-slate-100">{accounts.map(a=><tr key={a.id}><td className="p-3"><div className="font-bold text-slate-900">{a.accountCode}</div><div className="text-slate-500">{a.accountName}</div></td><td className="p-3">{a.financialStatement}</td><td className="p-3 text-right">{a.balanceAmount.toLocaleString('id-ID')}</td><td className="p-3">{a.isSignificant?'Yes':'No'}</td><td className="p-3">{a.assertions.map(x=>x.assertion).join(', ')||'—'}</td></tr>)}{!accounts.length&&<tr><td colSpan={5} className="p-8 text-center text-slate-400">No financial account registered.</td></tr>}</tbody></table></div>:<div className="grid md:grid-cols-2 gap-4">{ipe.map(x=><article key={x.id} className="bg-white border border-slate-200 rounded-xl p-4"><h3 className="text-sm font-bold text-slate-900">{x.reportName}</h3><div className="text-[11px] text-slate-500 mt-2">Source: {x.systemSource} • Owner: {x.reportOwner}</div><div className="mt-3 flex gap-2 text-[10px]"><span className="bg-slate-100 px-2 py-1 rounded">Completeness: {x.completenessTested?'Tested':'Not tested'}</span><span className="bg-slate-100 px-2 py-1 rounded">Accuracy: {x.accuracyTested?'Tested':'Not tested'}</span></div></article>)}{!ipe.length&&<div className="md:col-span-2 border border-dashed border-slate-300 rounded-xl p-8 text-xs text-slate-500">No IPE record registered.</div>}</div>}
  </div>;
}
