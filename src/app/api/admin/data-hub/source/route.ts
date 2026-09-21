import { NextResponse } from 'next/server';
import { getAuthenticatedProfile } from '@/lib/auth';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';
import { resolveSourceInstitution } from '@/lib/d1-source-library';
import { getSourceDocumentDetail } from '@/lib/d1-source-view';

export const dynamic = 'force-dynamic';

function tokenFromRequest(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp('(?:^|;\\s*)' + AUTH_COOKIE_NAME + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : '';
}

async function requireAdmin(request: Request) {
  const token = tokenFromRequest(request);
  if (!token) return null;
  const profile = await getAuthenticatedProfile(token);
  if (!profile || profile.role !== 'Admin') return null;
  return profile;
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const institution = admin.institutionId
      ? { id: admin.institutionId }
      : await resolveSourceInstitution('Bank Kalbar');

    const url = new URL(request.url);
    const documentId = (url.searchParams.get('documentId') || '').trim();
    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required.' }, { status: 400 });
    }

    const detail = await getSourceDocumentDetail(
      institution.id,
      documentId,
      Number(url.searchParams.get('page') || 1),
      Number(url.searchParams.get('pageSize') || 8)
    );

    return NextResponse.json(
      { storage: 'cloudflare-d1', institutionId: institution.id, ...detail },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SOURCE_VIEW_ERROR';
    if (code === 'SOURCE_DOCUMENT_NOT_FOUND') {
      return NextResponse.json({ error: 'Source document was not found.', code }, { status: 404 });
    }
    console.error('Source document detail error:', error);
    return NextResponse.json(
      { error: 'Source document detail could not be loaded.', code },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
