import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import {
  COMPLIANCE_RISK_READ,COMPLIANCE_RISK_WRITE,COMPLIANCE_RISK_REVIEW,
  complianceRiskDetail,complianceRiskOptions,listComplianceRisks,saveComplianceRisk,
  transitionComplianceRisk,type RiskInput
} from '@/lib/d1-compliance-risk-assessment';
export const dynamic='force-dynamic';
const HEADERS={'Cache-Control':'private, no-store','Vary':'Cookie'};
async function ctx(request:Request){
  const c=await resolveInstitutionAccess(request);
  if(!c)return {error:'Autentikasi diperlukan.',status:401} as const;
  if(!COMPLIANCE_RISK_READ.has(c.profile.role))return {error:'Tidak memiliki akses Compliance Risk Assessment.',status:403} as const;
  if(!c.institution)return {error:'Institusi belum dipilih.',status:409} as const;
  return {tenant:c.institution.id,actor:{id:c.profile.id,role:c.profile.role},
    mayEdit:COMPLIANCE_RISK_WRITE.has(c.profile.role),
    mayReview:COMPLIANCE_RISK_REVIEW.has(c.profile.role)};
}
function fail(e:unknown){
  const key=e instanceof Error?e.message:'';
  const messages:Record<string,[number,string]>={
    CRA_INVALID_INPUT:[400,'Periksa field wajib, teks, dan periode penilaian.'],
    CRA_SCORE_INVALID:[400,'Likelihood dan impact harus antara 1 sampai 5.'],
    CRA_DATE_INVALID:[400,'Tanggal review harus valid.'],
    CRA_NOT_FOUND:[404,'Penilaian tidak ada di institusi ini.'],
    CRA_TARGET_NOT_FOUND:[404,'Unit tidak tersedia di struktur institusi.'],
    CRA_OBLIGATION_NOT_FOUND:[404,'Kewajiban aktif tidak ditemukan.'],
    CRA_TARGET_NOT_MAPPED:[400,'BPM, risiko, atau kontrol belum terhubung eksplisit ke kewajiban.'],
    CRA_TRACEABILITY_INVALID:[400,'Relasi proses, risiko dan kontrol belum konsisten dengan RCM.'],
    CRA_LOCKED:[409,'Penilaian terkunci sesuai status workflow.'],
    CRA_OWNER_ONLY:[403,'Hanya pembuat atau administrator dapat mengubah draft.'],
    CRA_SELF_APPROVAL:[403,'Pembuat tidak boleh memvalidasi penilaiannya sendiri.'],
    CRA_FORBIDDEN:[403,'Tidak berwenang melakukan review.'],
    CRA_CONFLICT:[409,'Rekaman telah berubah, muat ulang.']
  };
  if(messages[key])return NextResponse.json({error:messages[key][1],code:key},{status:messages[key][0],headers:HEADERS});
  console.error('Compliance Risk Assessment:',e);
  return NextResponse.json({error:'Data penilaian belum dapat diproses.'},{status:503,headers:HEADERS});
}
export async function GET(request:Request){
  const a=await ctx(request);
  if('error' in a)return NextResponse.json({error:a.error},{status:a.status,headers:HEADERS});
  try{
    const u=new URL(request.url);
    const id=u.searchParams.get('id');
    if(id)return NextResponse.json(await complianceRiskDetail(a.tenant,id),{headers:HEADERS});
    if(u.searchParams.get('view')==='options')return NextResponse.json(await complianceRiskOptions(a.tenant),{headers:HEADERS});
    return NextResponse.json({...await listComplianceRisks(a.tenant,
      Number(u.searchParams.get('page')||1),u.searchParams.get('period')||undefined),
      mayEdit:a.mayEdit,mayReview:a.mayReview},{headers:HEADERS});
  }catch(e){return fail(e);}
}
export async function POST(request:Request){
  const a=await ctx(request);
  if('error' in a)return NextResponse.json({error:a.error},{status:a.status,headers:HEADERS});
  try{
    const raw=await request.text();
    if(raw.length>16384)return NextResponse.json({error:'Permintaan melebihi batas.'},{status:413,headers:HEADERS});
    const b=JSON.parse(raw) as Record<string,unknown>;
    if(!b||typeof b!=='object'||Array.isArray(b))throw new Error('CRA_INVALID_INPUT');
    const action=String(b.action||'').toUpperCase();
    if((action==='CREATE'||action==='SAVE')&&a.mayEdit){
      const input:RiskInput={
        obligationId:String(b.obligationId||''),processId:String(b.processId||''),
        riskId:String(b.riskId||''),controlId:String(b.controlId||''),
        ownerUnitId:String(b.ownerUnitId||''),productName:String(b.productName||''),
        period:String(b.period||''),inherentLikelihood:Number(b.inherentLikelihood),
        inherentImpact:Number(b.inherentImpact),residualLikelihood:Number(b.residualLikelihood),
        residualImpact:Number(b.residualImpact),threatDescription:String(b.threatDescription||''),
        existingControls:String(b.existingControls||''),rationale:String(b.rationale||''),
        mitigationPlan:String(b.mitigationPlan||''),nextReviewDate:String(b.nextReviewDate||'')
      };
      return NextResponse.json({record:await saveComplianceRisk(a.tenant,input,a.actor,
        action==='SAVE'?String(b.id||''):undefined)},{status:action==='CREATE'?201:200,headers:HEADERS});
    }
    if(action==='SUBMIT'&&a.mayEdit || ['APPROVE','REJECT'].includes(action)&&a.mayReview){
      return NextResponse.json({record:await transitionComplianceRisk(a.tenant,
        String(b.id||''),action,a.actor,String(b.note||''))},{headers:HEADERS});
    }
    return NextResponse.json({error:'Aksi tidak diizinkan.'},{status:403,headers:HEADERS});
  }catch(e){return e instanceof SyntaxError?NextResponse.json({error:'Format JSON tidak sah.'},{status:400,headers:HEADERS}):fail(e);}
}
