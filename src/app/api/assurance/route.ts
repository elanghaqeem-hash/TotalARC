import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [
      institution, campaigns, todTests, walkthroughs, financialAccounts, ipeRegisters,
      certifications, attestations, tasks, controls, toeTests, actionPlans, retests
    ] = await Promise.all([
      prisma.institution.findFirst({
        orderBy: { createdAt: 'asc' },
        include: { legalEntities: true, organizationUnits: true, users: true }
      }),
      prisma.assessmentCampaign.findMany({
        include: { csaResponses: { include: { control: { include: { process: true } } } } },
        orderBy: { startDate: 'desc' }
      }),
      prisma.toDTest.findMany({
        include: { control: true, process: true, risk: true },
        orderBy: { testedAt: 'desc' }
      }),
      prisma.walkthrough.findMany({ orderBy: { date: 'desc' } }),
      prisma.financialAccount.findMany({ include: { assertions: true }, orderBy: { accountCode: 'asc' } }),
      prisma.iPERegister.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.controlCertification.findMany({
        include: { control: { include: { process: true } } },
        orderBy: { certifiedAt: 'desc' }
      }),
      prisma.managementAttestation.findMany({ orderBy: { attestedAt: 'desc' } }),
      prisma.task.findMany({ include: { user: true }, orderBy: { dueDate: 'asc' } }),
      prisma.controlMaster.findMany({
        include: {
          process: true, csaResponses: true, todTests: true, toeTests: true, issues: true,
          monitoringRules: { include: { runs: { orderBy: { runTimestamp: 'desc' }, take: 1 } } },
          certifications: true
        },
        orderBy: { controlId: 'asc' }
      }),
      prisma.toETest.findMany({
        include: { control: true, process: true, risk: true, exceptions: true, samples: true },
        orderBy: { testedAt: 'desc' }
      }),
      prisma.managementActionPlan.findMany({
        include: { issue: true, milestones: true, retests: true },
        orderBy: { originalDueDate: 'asc' }
      }),
      prisma.retestRecord.findMany({ include: { map: true }, orderBy: { retestedAt: 'desc' } })
    ]);

    return NextResponse.json({
      institution, campaigns, todTests, walkthroughs, financialAccounts, ipeRegisters,
      certifications, attestations, tasks, controls, toeTests, actionPlans, retests
    });
  } catch (error) {
    console.error('Failed to load assurance data:', error);
    return NextResponse.json({ error: 'Failed to load assurance data' }, { status: 500 });
  }
}
