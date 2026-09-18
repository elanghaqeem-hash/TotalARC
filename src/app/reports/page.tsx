'use client';

import React,{useState} from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';

function downloadCsv(name:string, rows:any[]) {
  if(!rows.length) return false;
  const keys=Array.from(new Set(rows.flatMap(r=>Object.keys(r).filter(k=>typeof r[k]!=='object'))));
  const esc=(v:any)=>`"${String(v??'').replace(/"/g,'""')}"`;
  const csv=[keys.map(esc).join(','),...rows.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);return true;
}

export default function ReportsPage(){
 const[message,setMessage]=useState('');
 const exportEndpoint=async(label:string,url:string,key:string)=>{setMessage('');try{const r=await fetch(url,{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to export');const rows=d[key]||[];if(!downloadCsv(`TotalARC_${label}_${new Date().toISOString().slice(0,10)}.csv`,rows))setMessage(`No ${label} data is available to export.`);}catch(e){setMessage(e instanceof Error?e.message:'Export failed');}};
 const items=[['RCM','/api/rcm','rcm'],['Risks','/api/risks','risks'],['Controls','/api/controls','controls'],['Processes','/api/processes','processes']];
 return <div className="space-y-6"><div><h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-brand-600"/>Workpapers & Export Center</h1><p className="text-xs text-slate-500 mt-1">Exports are generated from current tenant database records. Empty datasets produce no fabricated report.</p></div>{message&&<div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">{message}</div>}<div className="grid md:grid-cols-2 gap-4">{items.map(([label,url,key])=><article key={label} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"><h2 className="text-sm font-bold text-slate-900">{label} Export</h2><p className="text-[11px] text-slate-500 mt-1">CSV generated on demand from authenticated database records.</p><button onClick={()=>exportEndpoint(label,url,key)} className="mt-4 inline-flex items-center gap-2 bg-brand-600 text-white text-xs font-bold px-3 py-2 rounded-lg"><Download className="w-4 h-4"/>Export CSV</button></article>)}</div></div>;
}
