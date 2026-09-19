import { NextResponse } from 'next/server';
import { getPrimaryInstitution } from '@/lib/d1';
import { authorizeApi, READ_ROLES } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  try {
    const institution = await getPrimaryInstitution();

    return NextResponse.json({
      institution: institution
        ? {
            ...institution,
            legalEntities: [],
            organizationUnits: [],
            users: []
          }
        : null,
      campaigns: [],
      todTests: [],
      walkthroughs: [],
      financialAccounts: [],
      ipeRegisters: [],
      certifications: [],
      attestations: [],
      tasks: [],
      controls: [],
      toeTests: [],
      actionPlans: [],
      retests: [],
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    console.error('Failed to load persistent assurance data:', error);
    return NextResponse.json(
      { error: 'Persistent D1 database is not available yet.' },
      { status: 503 }
    );
  }
}
