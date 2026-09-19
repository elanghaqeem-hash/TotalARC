import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export async function GET() {
  try {
    const prisma = getPrisma();
    const rules = await prisma.monitoringRule.findMany({
      include: {
        control: { include: { process: true } },
        runs: { orderBy: { runTimestamp: 'desc' }, take: 10, include: { exceptions: true } }
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
    const prisma = getPrisma();
    const body = await request.json();
    const { ruleId, populationChecked, exceptionsFound, details, exceptions = [] } = body;

    if (
      !ruleId ||
      !Number.isInteger(populationChecked) || populationChecked < 0 ||
      !Number.isInteger(exceptionsFound) || exceptionsFound < 0
    ) {
      return NextResponse.json(
        { error: 'ruleId, populationChecked, and exceptionsFound from an actual monitoring execution are required.' },
        { status: 400 }
      );
    }

    if (exceptions.length > 0 && exceptionsFound !== exceptions.length) {
      return NextResponse.json({ error: 'exceptionsFound must match submitted exception records.' }, { status: 400 });
    }

    const rule = await prisma.monitoringRule.findUnique({ where: { id: ruleId } });
    if (!rule) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });

    const status = exceptionsFound > 0 ? 'Exception Detected' : 'Healthy';
    const run = await prisma.monitoringRun.create({
      data: { ruleId: rule.id, populationChecked, exceptionsFound, status, details: details || null }
    });

    for (const exception of exceptions) {
      if (!exception.transactionRef || !exception.details) continue;
      await prisma.cCMException.create({
        data: { runId: run.id, transactionRef: exception.transactionRef, details: exception.details }
      });
    }

    await prisma.monitoringRule.update({
      where: { id: rule.id },
      data: { lastRunDate: new Date(), lastStatus: status }
    });

    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    console.error('Failed to ingest CCM result:', error);
    return NextResponse.json({ error: 'Failed to ingest CCM result' }, { status: 500 });
  }
}
