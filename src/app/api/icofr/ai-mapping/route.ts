import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import { getMappingWorkspace, getMappingReviewHistory, createMappingProposal, updateMappingStage } from '@/lib/d1-icofr-mapping-workspace';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
const roles=new Set(['SystemAdmin','ICOFRCoordinator','ProcessOwner','Reviewer','InternalAuditor','ReadOnlyAuditor']);
const error=(message:string,status=400)=>NextResponse.json({error:message},{status,headers});
async function session(request:Request){
  const ctx=await resolveInstitutionAccess(request);
  return ctx?.institution&&roles.has(ctx.profile.role)?ctx:null;
}
export async function GET(request:Request){
  const ctx=await session(request);
  if(!ctx)return error('Institusi atau hak akses tidak valid.',403);
  try {
    const history=new URL(request.url).searchParams.get('history');
    if(history)return NextResponse.json({history:await getMappingReviewHistory(ctx.institution!.id,history)},{headers});
    return NextResponse.json({...await getMappingWorkspace(ctx.institution!.id),requiresHumanApproval:true},{headers});
  }catch(e){console.error('ICOFR mapping read failed',e);return error('Gagal membaca data pemetaan.',503);}
}
export async function POST(request:Request){
  const ctx=await session(request);
  if(!ctx)return error('Institusi atau hak akses tidak valid.',403);
  const origin=request.headers.get('origin');
  if(request.headers.get('sec-fetch-site')==='cross-site'||(origin&&new URL(origin).host!==new URL(request.url).host))return error('Cross-origin blocked.',403);
  if(Number(request.headers.get('content-length')||0)>32000)return error('Payload terlalu besar.',413);
  let body:Record<string,unknown>;
  try {
    const raw=await request.text();
    if(raw.length>32000)return error('Payload terlalu besar.',413);
    body=JSON.parse(raw);
    if(!body||Array.isArray(body)||typeof body!=='object')return error('JSON tidak valid.');
  }catch{return error('JSON tidak valid.');}
  try{
    const action=String(body.action||'');
    const data=action==='CREATE_DRAFT'
      ?await createMappingProposal(ctx.institution!.id,ctx.profile,body)
      :await updateMappingStage(ctx.institution!.id,ctx.profile,body);
    return NextResponse.json(data,{status:action==='CREATE_DRAFT'?201:200,headers});
  }catch(e){
    const code=e instanceof Error?e.message:'UNKNOWN';
    if(/^(MAPPING_ROLE_DENIED|INVALID_ASSERTION|SOURCE_|PROPOSAL_|INVALID_WORKFLOW_TRANSITION|SEGREGATION_OF_DUTIES_REQUIRED|REVIEW_NOTE_REQUIRED|PLC_MAPPING_REQUIRED|CONCURRENT_REVIEW_CONFLICT|PERIOD_CLOSED)/.test(code))
      return error(code,code==='MAPPING_ROLE_DENIED'?403:409);
    console.error('ICOFR mapping mutation failed',e);return error('Gagal memproses pemetaan.',503);
  }
}
