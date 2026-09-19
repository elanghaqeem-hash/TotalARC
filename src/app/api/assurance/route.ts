import { NextResponse } from 'next/server';
import { ensureBankKalbarPersisted } from '@/lib/d1';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const institution = await ensureBankKalbarPersisted();

    return NextResponse.json({
      institution: {
        ...institution,
        legalEntities: [],
        organizationUnits: [],
        users: []
      },
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
