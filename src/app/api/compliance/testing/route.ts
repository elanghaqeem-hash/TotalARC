import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import {
  COMPLIANCE_TEST_READ,COMPLIANCE_TEST_WRITE,COMPLIANCE_TEST_REVIEW,
  addEvidence,addFinding,addSample,createTest,linkFindingMap,listTests,
  testingDetail,testingOptions,transitionTest,type WorkprogramInput
} from '@/lib/d1-compliance-testing';
export const dynamic='force-dynamic';
const HEADERS={'Cache-Control':'private, no-store','Vary':'Cookie'};
async function ctx(request:Request){
  const c=await resolveInstitutionAccess(request);
  if(!c)return {error:'Autentikasi diperlukan.',status:401} as const;
  if(!COMPLIANCE_TEST_READ.has(c.profile.role))return {error:'Tidak berhak membaca pekerjaan pengujian.',status:403} as const;
  if(!c.institution)return {error:'Institusi aktif belum ditetapkan.',status:409} as const;
  return {tenant:c.institution.id,actor:{id:c.profile.id,role:c.profile.role},
    mayWrite:COMPLIANCE_TEST_WRITE.has(c.profile.role),
    mayReview:COMPLIANCE_TEST_REVIEW.has(c.profile.role)};
}
function fail(e:unknown){
  const key=e instanceof Error?e.message:'';
  const messages:Record<string,[number,string]>={
    CT_INVALID_INPUT:[400,'Isi data workprogram secara lengkap dan valid.'],
    CT_INVALID_DATE:[400,'Tanggal tidak valid.'],
    CT_INVALID_SAMPLE:[400,'Ukuran sampel harus masuk akal terhadap populasi.'],
    CT_DUPLICATE:[409,'Kode/referensi sudah terdaftar.'],
    CT_NOT_FOUND:[404,'Workpaper tidak ditemukan di institusi aktif.'],
    CT_OBLIGATION_NOT_FOUND:[404,'Kewajiban yang aktif tidak ditemukan.'],
    CT_CONTROL_NOT_MAPPED:[400,'Kontrol belum memiliki mapping eksplisit ke kewajiban.'],
    CT_RISK_NOT_APPROVED:[400,'Risk Assessment terkait harus berstatus APPROVED.'],
    CT_MONITORING_NOT_APPROVED:[400,'Aktivitas monitoring harus disetujui dan terkait kewajiban yang sama.'],
    CT_ICOFR_NOT_FOUND:[404,'ToD/ToE ICOFR dengan tipe sesuai tidak ditemukan.'],
    CT_RETEST_INVALID:[409,'Re-test wajib merujuk workpaper selesai dengan kewajiban, kontrol, dan jenis pengujian yang sama.'],
    CT_EVIDENCE_NOT_FOUND:[404,'Dokumen dan versi bukti tidak ditemukan di institusi aktif.'],
    CT_UNIT_NOT_FOUND:[404,'Unit pemilik temuan tidak ditemukan.'],
    CT_MAP_NOT_FOUND:[404,'MAP tidak tersedia untuk institusi ini.'],
    CT_FINDING_NOT_FOUND:[404,'Temuan tidak ditemukan.'],
    CT_EXCEPTION_REQUIRED:[400,'Keterangan pengecualian wajib saat sampel gagal.'],
    CT_SAMPLE_LIMIT:[409,'Jumlah sampel sudah mencapai target.'],
    CT_EVIDENCE_REQUIRED:[400,'Bukti nyata wajib ditautkan sebelum submission.'],
    CT_SAMPLES_INCOMPLETE:[400,'Semua sampel ToE harus dinilai sebelum submission.'],
    CT_FINDING_REQUIRED:[400,'Minimal satu temuan harus dicatat bila terdapat sampel gagal.'],
    CT_FALSE_PASS:[409,'Tidak dapat menyatakan EFFECTIVE jika sampel gagal.'],
    CT_LOCKED:[409,'Workpaper terkunci pada status ini.'],
    CT_OWNER_ONLY:[403,'Hanya preparer atau administrator dapat mengajukan/merevisi.'],
    CT_SELF_APPROVAL:[403,'Preparer tidak boleh menjadi reviewer untuk workpaper yang sama.'],
    CT_FORBIDDEN:[403,'Role tidak berhak melakukan keputusan review.'],
    CT_DECISION_REQUIRED:[400,'Keputusan hasil pengujian harus dipilih.'],
    CT_CONFLICT:[409,'Rekaman telah berubah, muat ulang.']
  };
  if(messages[key])return NextResponse.json({error:messages[key][1],code:key},{status:messages[key][0],headers:HEADERS});
  console.error('Compliance Testing:',e);
  return NextResponse.json({error:'Workpaper belum dapat diproses.'},{status:503,headers:HEADERS});
}
export async function GET(request:Request){
  const a=await ctx(request);
  if('error' in a)return NextResponse.json({error:a.error},{status:a.status,headers:HEADERS});
  try{
    const u=new URL(request.url);
    const id=u.searchParams.get('id');
    if(id)return NextResponse.json(await testingDetail(a.tenant,id),{headers:HEADERS});
    if(u.searchParams.get('view')==='options')return NextResponse.json(await testingOptions(a.tenant),{headers:HEADERS});
    return NextResponse.json({...await listTests(a.tenant,Number(u.searchParams.get('page')||1)),
      mayWrite:a.mayWrite,mayReview:a.mayReview},{headers:HEADERS});
  }catch(e){return fail(e);}
}
export async function POST(request:Request){
  const a=await ctx(request);
  if('error' in a)return NextResponse.json({error:a.error},{status:a.status,headers:HEADERS});
  try{
    const raw=await request.text();
    if(raw.length>20000)return NextResponse.json({error:'Permintaan melebihi batas.'},{status:413,headers:HEADERS});
    const b=JSON.parse(raw) as Record<string,unknown>;
    if(!b||typeof b!=='object'||Array.isArray(b))throw new Error('CT_INVALID_INPUT');
    const action=String(b.action||'').toUpperCase(),id=String(b.id||'');
    if(['CREATE','RETEST'].includes(action)&&a.mayWrite){
      if(action==='RETEST'&&!String(b.sourceTestId||'').trim())throw new Error('CT_RETEST_INVALID');
      const input:WorkprogramInput={
        code:String(b.code||''),obligationId:String(b.obligationId||''),controlId:String(b.controlId||''),
        riskAssessmentId:String(b.riskAssessmentId||''),monitoringActivityId:String(b.monitoringActivityId||''),
        icofrReviewId:String(b.icofrReviewId||''),testType:String(b.testType||'') as WorkprogramInput['testType'],
        period:String(b.period||''),objective:String(b.objective||''),
        procedures:String(b.procedures||''),populationDescription:String(b.populationDescription||''),
        populationSize:Number(b.populationSize),sampleSize:Number(b.sampleSize),
        samplingMethod:String(b.samplingMethod||''),targetDate:String(b.targetDate||'')
      };
      return NextResponse.json({record:await createTest(a.tenant,input,a.actor,
        action==='RETEST'?String(b.sourceTestId||''):undefined)},{status:201,headers:HEADERS});
    }
    if(action==='ADD_SAMPLE'&&a.mayWrite)return NextResponse.json({
      result:await addSample(a.tenant,id,a.actor,String(b.reference||''),
        String(b.result||''),String(b.exceptionNote||''))},{status:201,headers:HEADERS});
    if(action==='ADD_EVIDENCE'&&a.mayWrite)return NextResponse.json({
      result:await addEvidence(a.tenant,id,a.actor,String(b.documentId||''),String(b.description||''))},
      {status:201,headers:HEADERS});
    if(action==='ADD_FINDING'&&a.mayWrite)return NextResponse.json({
      result:await addFinding(a.tenant,id,a.actor,{title:String(b.title||''),
        description:String(b.description||''),severity:String(b.severity||''),
        ownerUnitId:String(b.ownerUnitId||''),dueDate:String(b.dueDate||'')})},{status:201,headers:HEADERS});
    if(action==='LINK_MAP'&&a.mayWrite)return NextResponse.json({
      result:await linkFindingMap(a.tenant,id,String(b.findingId||''),String(b.mapId||''),a.actor)},{headers:HEADERS});
    if((['SUBMIT','REVISE'].includes(action)&&a.mayWrite) ||
       (['APPROVE','RETURN'].includes(action)&&a.mayReview)){
      return NextResponse.json({record:await transitionTest(a.tenant,id,a.actor,action,
        String(b.decision||''),String(b.note||''))},{headers:HEADERS});
    }
    return NextResponse.json({error:'Aksi tidak diizinkan untuk role ini.'},{status:403,headers:HEADERS});
  }catch(e){return e instanceof SyntaxError?NextResponse.json({error:'Format JSON tidak sah.'},{status:400,headers:HEADERS}):fail(e);}
}
