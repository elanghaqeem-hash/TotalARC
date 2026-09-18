import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const rules = await prisma.monitoringRule.findMany({
      include: {
        control: {
          include: {
            process: true
          }
        },
        runs: {
          orderBy: { runTimestamp: 'desc' },
          take: 10,
          include: {
            exceptions: true
          }
        }
      }
    });

    return NextResponse.json({ rules });
  } catch (error) {
    console.error('Failed to fetch CCM rules:', error);
    return NextResponse.json({ error: 'Failed to fetch CCM rules' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ruleId, simulateFailure } = body;

    const rule = await prisma.monitoringRule.findUnique({
      where: { id: ruleId }
    });
    if (!rule) throw new Error('Rule not found');

    const exceptionsFound = simulateFailure ? 1 : 0;
    const runStatus = exceptionsFound > 0 ? 'Exception Detected' : 'Healthy';

    const newRun = await prisma.monitoringRun.create({
      data: {
        ruleId: rule.id,
        runTimestamp: new Date(),
        populationChecked: Math.floor(Math.random() * 50) + 100,
        exceptionsFound,
        status: runStatus,
        details: exceptionsFound > 0
          ? 'Automated scan detected 1 transaction exceeding limit without dual approval.'
          : 'Automated scan executed successfully. All scanned transactions compliant with dual approval.'
      }
    });

    if (exceptionsFound > 0) {
      await prisma.cCMException.create({
        data: {
          runId: newRun.id,
          transactionRef: `TRX-CCM-${Date.now().toString().slice(-4)}`,
          details: 'Disbursement of IDR 145,000,000 processed with only 1 signatory approval.'
        }
      });
    }

    // Update rule status
    await prisma.monitoringRule.update({
      where: { id: rule.id },
      data: {
        lastRunDate: new Date(),
        lastStatus: runStatus
      }
    });

    return NextResponse.json(newRun);
  } catch (error) {
    console.error('Failed to execute CCM run:', error);
    return NextResponse.json({ error: 'Failed to execute CCM run' }, { status: 500 });
  }
}
