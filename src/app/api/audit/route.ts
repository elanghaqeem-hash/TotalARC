import { NextResponse } from 'next/server';
import { authorizeTenantApi } from '@/lib/api-auth';
import { listAuditRegisterPage } from '@/lib/d1-register-pagination';
import { parsePaginationRequest } from '@/lib/pagination';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, ['Admin', 'Reviewer', 'Auditor']);
  if (auth.response) return auth.response;

  if (auth.user.orgAccessScope !== 'ALL') {
    return NextResponse.json(
      {
        error: 'Audit Trail requires enterprise-wide organization access because audit records do not duplicate organization ownership metadata.',
        code: 'AUDIT_ENTERPRISE_SCOPE_REQUIRED'
      },
      { status: 403 }
    );
  }

  try {
    const pagination = parsePaginationRequest(request);
    const data = await listAuditRegisterPage(
      auth.user.institutionId,
      pagination
    );

    return NextResponse.json({
      ...data,
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    console.error('Failed to load Audit Trail:', error);
    return NextResponse.json(
      { error: 'Failed to load audit records from persistent database.' },
      { status: 503 }
    );
  }
}
