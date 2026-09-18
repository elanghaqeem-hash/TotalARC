import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const controls = await prisma.controlMaster.findMany({
      where: { institutionId: user.institutionId },
      include: {
        process: true,
        activity: true,
        risks: { include: { risk: true } },
        todTests: { orderBy: { testedAt: 'desc' }, take: 1 },
        toeTests: { orderBy: { testedAt: 'desc' }, take: 1, include: { exceptions: true } },
        monitoringRules: { orderBy: { createdAt: 'desc' } },
        certifications: { orderBy: { certifiedAt: 'desc' }, take: 1 }
      },
      orderBy: { controlId: 'asc' }
    });
    return NextResponse.json({ controls });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, ['Admin','ControlOwner','ProcessOwner','Reviewer']);
    const body = await readJson<Record<string, unknown>>(request);
    const processId = requireString(body.processId, 'processId', 100);
    const process = await prisma.businessProcess.findFirst({ where: { id: processId, institutionId: user.institutionId } });
    if (!process) throw new ApiError(404, 'PROCESS_NOT_FOUND', 'Process not found in your institution');

    let riskId: string | null = null;
    if (body.riskId) {
      riskId = requireString(body.riskId, 'riskId', 100);
      const risk = await prisma.riskMaster.findFirst({ where: { id: riskId, institutionId: user.institutionId } });
      if (!risk) throw new ApiError(404, 'RISK_NOT_FOUND', 'Risk not found in your institution');
      if (risk.processId !== processId) throw new ApiError(400, 'RISK_PROCESS_MISMATCH', 'Risk must belong to the same process as the control');
    }

    const control = await prisma.controlMaster.create({
      data: {
        institutionId: user.institutionId,
        controlId: optionalString(body.controlId, 80) || `CTRL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        name: requireString(body.name, 'name', 250),
        description: requireString(body.description, 'description', 4000),
        objective: optionalString(body.objective, 2000) || 'Control objective pending owner confirmation.',
        processId,
        controlOwner: optionalString(body.controlOwner, 250) || user.name,
        type: optionalString(body.type, 50) || 'Preventive',
        nature: optionalString(body.nature, 80) || 'Manual',
        frequency: optionalString(body.frequency, 80) || 'Per Transaction',
        isKeyControl: body.isKeyControl === true,
        isIcofrKey: body.isIcofrKey === true,
        designAssessment: 'Not Assessed',
        operatingStatus: 'Not Assessed',
        overallHealth: 'Not Assessed'
      }
    });

    if (riskId) {
      await prisma.controlRiskMapping.create({ data: { controlId: control.id, riskId } });
    }

    await writeAudit(user, request, { action: 'CREATE', entityType: 'Control', recordId: control.id, reason: `Registered control ${control.controlId}`, newValue: control });
    return NextResponse.json(control, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
