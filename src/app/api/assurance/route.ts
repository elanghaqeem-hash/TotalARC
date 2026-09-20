import { NextResponse } from 'next/server';
import { getOrganizationStructure } from '@/lib/d1-organization';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const organization = await getOrganizationStructure();
    const institution = organization.institution;

    return NextResponse.json({
      institution: institution
        ? {
            ...institution,
            legalEntities: organization.legalEntities,
            organizationUnits: organization.organizationUnits,
            users: organization.users
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