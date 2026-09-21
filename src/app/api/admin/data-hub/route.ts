import { NextResponse } from 'next/server';
import { getAuthenticatedProfile } from '@/lib/auth';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';
import { getDataHubSummary, getSourceCoverage, getSourceGovernance, listDataHubRecords } from '@/lib/d1-data-hub';
import { resolveSourceInstitution } from '@/lib/d1-source-library';

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
    const view = url.searchParams.get('view') || 'records';

    if (view === 'summary') {
      const [summary, sourceCoverage, governance] = await Promise.all([
        getDataHubSummary(institution.id),
        getSourceCoverage(institution.id),
        getSourceGovernance(institution.id)
      ]);
      return NextResponse.json({
        storage: 'cloudflare-d1',
        institutionId: institution.id,
        summary,
        sourceCoverage,
        governance
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const result = await listDataHubRecords(institution.id, {
      page: Number(url.searchParams.get('page') || 1),
      pageSize: Number(url.searchParams.get('pageSize') || 50),
      recordType: url.searchParams.get('recordType') || undefined,
      sourceRole: url.searchParams.get('sourceRole') || undefined,
      batch: url.searchParams.get('batch') || undefined,
      quality: url.searchParams.get('quality') || undefined,
      mapping: url.searchParams.get('mapping') || undefined,
      query: url.searchParams.get('q') || undefined
    });

    return NextResponse.json({
      storage: 'cloudflare-d1',
      institutionId: institution.id,
      ...result
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'DATA_HUB_ERROR';
    console.error('Data hub error:', error);
    return NextResponse.json(
      { error: 'Data Integration Hub tidak dapat dimuat.', code },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
