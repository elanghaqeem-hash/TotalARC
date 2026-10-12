import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import { guardAiPost } from '@/lib/ai/http-security';
import { importOrganizationStructure } from '@/lib/d1-organization';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export async function POST(request: Request) {
  const context = await resolveInstitutionAccess(request);
  if (!context?.institution || !['SystemAdmin', 'Admin'].includes(context.profile.role)) return NextResponse.json({error: 'Impor hanya diizinkan untuk administrator institusi.'}, {status: 403, headers});
  const guarded = await guardAiPost(request, 'AI_ANALYZE_RATE_LIMIT', 600 * 1024);
  if (!guarded.ok) return guarded.response;
  const body = guarded.body;
  if (body.institutionId !== context.institution.id) return NextResponse.json({error: 'Institusi aktif berubah. Analisis ulang untuk institusi yang dipilih.'}, {status: 409, headers});
  if (body.confirmed !== true || typeof body.sourceName !== 'string' || !body.sourceName.trim() || body.sourceName.length > 255 || (body.legalEntityId != null && typeof body.legalEntityId !== 'string')) return NextResponse.json({error: 'Tinjau dan konfirmasi hasil serta dokumen sumber sebelum menyimpan.'}, {status: 400, headers});
  try {
    const result = await importOrganizationStructure(body.units, context.institution.id, body.sourceName, context.profile, body.legalEntityId as string | null);
    return NextResponse.json(result, {status: 201, headers});
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const validation = /^(Impor harus|Unit |Field |Kode|Email unit|Referensi sumber|Hubungan induk|Induk tidak|Entitas legal|Institusi tidak)/.test(message);
    return NextResponse.json({error: validation ? message : 'Impor tidak disimpan. Muat ulang struktur untuk memeriksa konflik kode, lalu coba lagi.'}, {status: validation ? 400 : 409, headers});
  }
}
