import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import {
  addMonitoringActivity, cancelMonitoringActivity, createMonitoringPlan,
  updateMonitoringDraft, listMonitoringPlans,
  monitoringDetail, monitoringOptions, progressMonitoringActivity,
  transitionMonitoringPlan
} from '@/lib/d1-compliance-monitoring';

export const dynamic = 'force-dynamic';
const READ = new Set([
  'SystemAdmin','Admin','ComplianceOfficer','RiskManager',
  'InternalAuditor','Executive','ReadOnlyAuditor'
]);
const WRITE = new Set(['SystemAdmin','Admin','ComplianceOfficer']);
const NO_STORE = { 'Cache-Control':'private, no-store','Vary':'Cookie' };
async function access(request: Request) {
  const context = await resolveInstitutionAccess(request);
  if (!context) return { status:401, error:'Sesi login diperlukan.' } as const;
  if (!READ.has(context.profile.role)) return { status:403, error:'Akses Compliance ditolak.' } as const;
  if (!context.institution) return { status:409, error:'Institusi aktif belum tersedia.' } as const;
  return {
    id:context.institution.id, role:context.profile.role,
    actor:{id:context.profile.id,role:context.profile.role},
    canManage:WRITE.has(context.profile.role)
  };
}
function fail(error: unknown) {
  const code = error instanceof Error ? error.message : 'MONITORING_UNKNOWN';
  const messages: Record<string,[number,string]> = {
    MONITORING_INVALID_INPUT:[400,'Periksa kode, periode, rentang tanggal, dan field wajib.'],
    MONITORING_INVALID_DATE:[400,'Tanggal harus valid dalam format YYYY-MM-DD.'],
    MONITORING_DATE_OUTSIDE_PLAN:[400,'Jadwal aktivitas harus berada dalam periode rencana.'],
    MONITORING_DUPLICATE:[409,'Kode rencana sudah digunakan institusi ini.'],
    MONITORING_UNIT_NOT_FOUND:[404,'Unit organisasi tidak tersedia di institusi aktif.'],
    MONITORING_NOT_FOUND:[404,'Rencana pemantauan tidak ditemukan.'],
    MONITORING_OBLIGATION_NOT_FOUND:[404,'Kewajiban aktif tidak ditemukan pada institusi aktif.'],
    MONITORING_PROCESS_NOT_MAPPED:[400,'BPM belum mempunyai relasi terverifikasi dengan kewajiban ini. Buat relasinya di Compliance Universe.'],
    MONITORING_ACTIVITY_NOT_FOUND:[404,'Aktivitas pemantauan tidak ditemukan.'],
    MONITORING_LOCKED:[409,'Rencana terkunci pada tahap ini.'],
    MONITORING_INVALID_TRANSITION:[409,'Perubahan status tidak sesuai alur persetujuan.'],
    MONITORING_CONFLICT:[409,'Data telah berubah. Muat ulang sebelum mencoba kembali.'],
    MONITORING_SELF_APPROVAL:[403,'Pembuat rencana tidak boleh menyetujui atau menolak rencananya sendiri.'],
    MONITORING_NOTE_REQUIRED:[400,'Alasan penolakan wajib diisi.'],
    MONITORING_OWNER_ONLY:[403,'Hanya pembuat rencana atau admin yang dapat mengajukan/revisi.'],
    MONITORING_ACTIVITY_REQUIRED:[400,'Minimal satu aktivitas diperlukan sebelum diajukan.'],
    MONITORING_ACTIVITIES_PENDING:[409,'Semua aktivitas harus selesai sebelum rencana ditutup.'],
    MONITORING_ACCESS_REQUIRED:[403,'Hak akses institusi diperlukan.']
  };
  const response = messages[code];
  if (!response) {
    console.error('Monitoring Plan failure:',error);
    return NextResponse.json({error:'Pemrosesan Monitoring Plan gagal.'},{status:503,headers:NO_STORE});
  }
  return NextResponse.json({code,error:response[1]},{status:response[0],headers:NO_STORE});
}

export async function GET(request: Request) {
  const ctx = await access(request);
  if ('error' in ctx) return NextResponse.json({error:ctx.error},{status:ctx.status,headers:NO_STORE});
  try {
    const url = new URL(request.url);
    const planId = url.searchParams.get('planId');
    if (planId) return NextResponse.json(await monitoringDetail(ctx.id,planId),{headers:NO_STORE});
    if (url.searchParams.get('view') === 'options') {
      return NextResponse.json(await monitoringOptions(ctx.id),{headers:NO_STORE});
    }
    const page = Number(url.searchParams.get('page') || 1);
    const year = Number(url.searchParams.get('year') || 0);
    const result = await listMonitoringPlans(ctx.id,page,year);
    return NextResponse.json({...result,canManage:ctx.canManage},{headers:NO_STORE});
  } catch(error) { return fail(error); }
}
export async function POST(request: Request) {
  const ctx = await access(request);
  if ('error' in ctx) return NextResponse.json({error:ctx.error},{status:ctx.status,headers:NO_STORE});
  if (!ctx.canManage) return NextResponse.json({error:'Role ini hanya memiliki akses baca.'},{status:403,headers:NO_STORE});
  try {
    // Bound input and use only authenticated actor+institution, never client-supplied scope.
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 16384) return NextResponse.json({error:'Ukuran permintaan terlalu besar.'},{status:413,headers:NO_STORE});
    const body = await request.json() as Record<string,unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({error:'Format data tidak valid.'},{status:400,headers:NO_STORE});
    }
    const action = String(body.action || '').toUpperCase();
    let result:unknown;
    if (action === 'CREATE') {
      result = await createMonitoringPlan(ctx.id,{
        code:String(body.code || ''),title:String(body.title || ''),
        year:Number(body.year),period:String(body.period || ''),
        quarter:body.quarter === undefined ? null : Number(body.quarter),
        objective:String(body.objective || ''),scope:String(body.scope || ''),
        ownerUnitId:String(body.ownerUnitId || ''),
        startDate:String(body.startDate || ''),endDate:String(body.endDate || '')
      },ctx.actor);
    } else if (action === 'UPDATE_DRAFT') {
      result = await updateMonitoringDraft(ctx.id,String(body.planId || ''),{
        code:String(body.code || ''),title:String(body.title || ''),
        year:Number(body.year),period:String(body.period || ''),
        quarter:body.quarter === undefined ? null : Number(body.quarter),
        objective:String(body.objective || ''),scope:String(body.scope || ''),
        ownerUnitId:String(body.ownerUnitId || ''),
        startDate:String(body.startDate || ''),endDate:String(body.endDate || '')
      },ctx.actor);
    } else if (action === 'CANCEL_ACTIVITY') {
      result = await cancelMonitoringActivity(ctx.id,String(body.activityId || ''),ctx.actor);
    } else if (action === 'ADD_ACTIVITY') {
      result = await addMonitoringActivity(ctx.id,{
        planId:String(body.planId || ''),obligationId:String(body.obligationId || ''),
        processId:String(body.processId || ''),ownerUnitId:String(body.ownerUnitId || ''),
        description:String(body.description || ''),scheduledDate:String(body.scheduledDate || '')
      },ctx.actor);
    } else if (['SUBMIT','APPROVE','REJECT','REVISE','START','COMPLETE'].includes(action)) {
      result = await transitionMonitoringPlan(ctx.id,String(body.planId || ''),action,ctx.actor,String(body.note || ''));
    } else if (action === 'PROGRESS_ACTIVITY') {
      result = await progressMonitoringActivity(ctx.id,String(body.activityId || ''),
        String(body.status || ''),ctx.actor,
        typeof body.actualDate === 'string' ? body.actualDate : null,
        typeof body.outcomeNote === 'string' ? body.outcomeNote : null);
    } else {
      return NextResponse.json({error:'Aksi tidak dikenali.'},{status:400,headers:NO_STORE});
    }
    return NextResponse.json({ok:true,result},{status:action === 'CREATE' || action === 'ADD_ACTIVITY' ? 201 : 200,headers:NO_STORE});
  } catch(error) { return fail(error); }
}
