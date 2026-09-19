import { NextResponse } from 'next/server';
import { getPrimaryInstitution } from '@/lib/d1';

export const dynamic = 'force-dynamic';

export async function GET() {
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
