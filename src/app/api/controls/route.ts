import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const controls = await prisma.controlMaster.findMany({
      include: {
        process: true,
        activity: true,
        risks: {
          include: {
            risk: true
          }
        },
        todTests: true,
        toeTests: {
          include: {
            exceptions: true
          }
        },
        monitoringRules: true,
        certifications: true
      },
      orderBy: { controlId: 'asc' }
    });

    return NextResponse.json({ controls });
  } catch (error) {
    console.error('Failed to fetch controls:', error);
    return NextResponse.json({ error: 'Failed to fetch controls' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      controlId,
      name,
      description,
      objective,
      processId,
      riskId,
      controlOwner,
      type,
      nature,
      frequency,
      isKeyControl,
      isIcofrKey
    } = body;

    const defaultInst = await prisma.institution.findFirst();
    if (!defaultInst) throw new Error('No institution found');

    const newControl = await prisma.controlMaster.create({
      data: {
        institutionId: defaultInst.id,
        controlId: controlId || `CTRL-${Date.now().toString().slice(-4)}`,
        name,
        description,
        objective: objective || 'Mitigate identified process risks through consistent execution.',
        processId,
        controlOwner: controlOwner || 'Control Owner',
        type: type || 'Preventive',
        nature: nature || 'Automated',
        frequency: frequency || 'Real Time',
        isKeyControl: Boolean(isKeyControl),
        isIcofrKey: Boolean(isIcofrKey),
        overallHealth: 'Healthy'
      }
    });

    if (riskId) {
      await prisma.controlRiskMapping.create({
        data: {
          controlId: newControl.id,
          riskId
        }
      });
    }

    return NextResponse.json(newControl);
  } catch (error) {
    console.error('Failed to create control:', error);
    return NextResponse.json({ error: 'Failed to create control' }, { status: 500 });
  }
}
