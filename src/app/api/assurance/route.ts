import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const prisma = getPrisma();

    const institution = await prisma.institution.findFirst({
      include: {
        legalEntities: true,
        organizationUnits: true,
        users: true
      },
      orderBy: { createdAt: 'asc' }
    });

    const [
      campaigns,
      todTests,
      walkthroughs,
      financialAccounts,
      ipeRegisters,
      certifications,
      attestations,
      tasks,
      controls,
      toeTests,
      actionPlans,
      retests
    ] = await Promise.all([
      prisma.assessmentCampaign.findMany({ include: { csaResponses: true } }),
      prisma.toDTest.findMany({ include: { control: true, process: true, risk: true } }),
      prisma.walkthrough.findMany(),
      prisma.financialAccount.findMany({ include: { assertions: true } }),
      prisma.iPERegister.findMany(),
      prisma.controlCertification.findMany({ include: { control: true } }),
      prisma.managementAttestation.findMany(),
      prisma.task.findMany({ include: { user: true }, orderBy: { dueDate: 'asc' } }),
      prisma.controlMaster.findMany({
        include: {
          process: true,
          risks: { include: { risk: true } },
          todTests: true,
          toeTests: true,
          monitoringRules: true,
          certifications: true
        }
      }),
      prisma.toETest.findMany({
        include: {
          control: true,
          process: true,
          risk: true,
          samples: true,
          exceptions: true
        }
      }),
      prisma.managementActionPlan.findMany({
        include: {
          issue: true,
          milestones: true,
          retests: true
        }
      }),
      prisma.retestRecord.findMany({ include: { map: true } })
    ]);

    return NextResponse.json({
      institution,
      campaigns,
      todTests,
      walkthroughs,
      financialAccounts,
      ipeRegisters,
      certifications,
      attestations,
      tasks,
      controls,
      toeTests,
      actionPlans,
      retests,
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    console.error('Failed to load assurance data from D1:', error);
    return NextResponse.json(
      { error: 'Persistent D1 database is not available yet.' },
      { status: 503 }
    );
  }
}
