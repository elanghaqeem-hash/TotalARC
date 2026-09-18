import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const controls = await prisma.controlMaster.findMany({
      include: {
        process: true, activity: true, risks: { include: { risk: true } }, todTests: true,
        toeTests: { include: { exceptions: true } }, monitoringRules: true, certifications: true
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
      controlId, name, description, objective, processId, riskId, controlOwner,
      type, nature, frequency, isKeyControl, isIcofrKey
    } = body;

    if (!name || !description || !objective || !processId || !controlOwner || !type || !nature || !frequency) {
      return NextResponse.json(
        { error: 'Complete control definition, ownership, type, nature, and frequency are required.' },
        { status: 400 }
      );
    }

    const institution = await prisma.institution.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!institution) return NextResponse.json({ error: 'Register an institution before creating controls.' }, { status: 409 });

    const control = await prisma.controlMaster.create({
      data: {
        institutionId: institution.id,
        controlId: controlId || `CTRL-${Date.now().toString(36).toUpperCase()}`,
        name, description, objective, processId, controlOwner, type, nature, frequency,
        isKeyControl: Boolean(isKeyControl),
        isIcofrKey: Boolean(isIcofrKey),
        designAssessment: 'Not Assessed',
        operatingStatus: 'Not Assessed',
        overallHealth: 'Not Assessed'
      }
    });

    if (riskId) await prisma.controlRiskMapping.create({ data: { controlId: control.id, riskId } });
    return NextResponse.json(control, { status: 201 });
  } catch (error) {
    console.error('Failed to create control:', error);
    return NextResponse.json({ error: 'Failed to create control' }, { status: 500 });
  }
}
