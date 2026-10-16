import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import { getTraceabilityData, saveDesignAssessment } from '@/lib/d1-icofr-traceability';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const readRoles = new Set([
  'SystemAdmin', 'ICOFRCoordinator', 'ProcessOwner', 'Reviewer',
  'InternalAuditor', 'ReadOnlyAuditor'
]);
const todRoles = new Set(['ICOFRCoordinator', 'Reviewer', 'InternalAuditor']);
const errorResponse = (message: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: message, ...extra }, { status, headers });

async function authorized(request: Request) {
  const ctx = await resolveInstitutionAccess(request);
  if (!ctx?.institution || !readRoles.has(ctx.profile.role)) return null;
  return ctx;
}

export async function GET(request: Request) {
  const ctx = await authorized(request);
  if (!ctx) return errorResponse('Institusi atau hak akses tidak valid.', 403);
  try {
    const data = await getTraceabilityData();
    return NextResponse.json({
      ...data,
      storage: 'cloudflare-d1',
      publicationWorkflow: '/icofr/ai-mapping',
      requiresHumanApproval: true
    }, { headers });
  } catch (error) {
    console.error('Failed to load ICOFR traceability:', error);
    return errorResponse('Gagal memuat traceability dari database.', 503);
  }
}

export async function POST(request: Request) {
  const ctx = await authorized(request);
  if (!ctx) return errorResponse('Institusi atau hak akses tidak valid.', 403);

  // No state-changing request from a different origin. Browser requests without
  // Origin are still authenticated by the session cookie, never by a probe token.
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' ||
    (origin && new URL(origin).host !== new URL(request.url).host)) {
    return errorResponse('Cross-origin blocked.', 403);
  }
  if (Number(request.headers.get('content-length') || 0) > 32000)
    return errorResponse('Payload terlalu besar.', 413);

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 32000) return errorResponse('Payload terlalu besar.', 413);
    body = JSON.parse(raw);
    if (!body || Array.isArray(body) || typeof body !== 'object')
      return errorResponse('JSON tidak valid.', 400);
  } catch {
    return errorResponse('JSON tidak valid.', 400);
  }

  const actionType = typeof body.actionType === 'string' ? body.actionType : '';

  // IMPORTANT: This legacy endpoint used to create in-scope assertions directly,
  // bypassing maker-checker approval. Publication is ONLY performed by
  // updateMappingStage(PUBLISH) following the approved source-backed workflow.
  if (actionType === 'SAVE_CHAIN')
    return errorResponse('Publikasi langsung ditolak. Buat Draft dan lengkapi persetujuan Process Owner → ICOFR Reviewer → Approver terlebih dahulu.', 409, {
      code: 'MAPPING_APPROVAL_REQUIRED',
      workspaceUrl: '/icofr/ai-mapping'
    });

  // Deleting a published assertion/risk link would invalidate its approval
  // lineage; a governed reversal process is required, not an ad-hoc delete.
  if (actionType === 'REMOVE_CHAIN')
    return errorResponse('Penghapusan langsung rantai yang dipublikasikan dinonaktifkan. Ajukan koreksi melalui ICOFR Reviewer.', 409, {
      code: 'TRACEABILITY_REVERSAL_REVIEW_REQUIRED',
      workspaceUrl: '/icofr/ai-mapping'
    });

  if (actionType !== 'SAVE_TOD')
    return errorResponse('Aksi traceability tidak dikenal.', 400);

  if (!todRoles.has(ctx.profile.role))
    return errorResponse('Role tidak diizinkan membuat Test of Design.', 403);

  // Approval of a design test requires a distinct reviewer role. Creating a
  // Draft never constitutes positive control effectiveness evidence.
  if (body.status === 'Approved' && ctx.profile.role !== 'Reviewer')
    return errorResponse('Persetujuan ToD hanya dapat dilakukan Reviewer.', 403);

  try {
    const result = await saveDesignAssessment(body);
    return NextResponse.json(result, { status: body.id ? 200 : 201, headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Registrasikan institusi sebelum membuat ToD.', 409],
      CONTROL_DOMAIN_NOT_FOUND: ['Kontrol ICOFR tidak ditemukan pada institusi aktif.', 404],
      REQUIRED_FIELDS: ['Kontrol, periode, dan penguji ToD wajib diisi.', 400],
      TEST_ID_CONFLICT: ['ID pengujian ToD sudah digunakan.', 409],
      PERIOD_CLOSED: ['Periode ICOFR telah ditutup.', 409]
    };
    if (known[code]) return errorResponse(known[code][0], known[code][1]);
    console.error('Failed to save ICOFR Test of Design:', error);
    return errorResponse('Gagal menyimpan ToD.', 500);
  }
}
