import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const [certifications, attestations] = await Promise.all([
      prisma.controlCertification.findMany({
        where: { control: { institutionId: user.institutionId } },
        include: { control: true },
        orderBy: { certifiedAt: 'desc' }
      }),
      prisma.managementAttestation.findMany({ where: { institutionId: user.institutionId }, orderBy: { createdAt: 'desc' } })
    ]);
    return NextResponse.json({ certifications, attestations });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = await readJson<Record<string, unknown>>(request);
    const action = requireString(body.action, 'action', 50);

    if (action === 'CERTIFY_CONTROL') {
      if (!['Admin','ControlOwner','Reviewer'].includes(user.role)) throw new ApiError(403, 'FORBIDDEN', 'Control certification permission required');
      const controlId = requireString(body.controlId, 'controlId', 100);
      const control = await prisma.controlMaster.findFirst({ where: { id: controlId, institutionId: user.institutionId } });
      if (!control) throw new ApiError(404, 'CONTROL_NOT_FOUND', 'Control not found');
      const cert = await prisma.controlCertification.create({
        data: {
          controlId,
          period: requireString(body.period, 'period', 80),
          declarationText: requireString(body.declarationText, 'declarationText', 5000),
          certifierName: user.name,
          certifierRole: user.role,
          status: requireString(body.status || 'Certified', 'status', 80)
        }
      });
      await writeAudit(user, request, { action: 'CERTIFY', entityType: 'ControlCertification', recordId: cert.id, newValue: cert });
      return NextResponse.json(cert, { status: 201 });
    }

    if (action === 'ATTEST_MANAGEMENT') {
      if (!['Admin','Executive'].includes(user.role)) throw new ApiError(403, 'FORBIDDEN', 'Executive attestation permission required');
      const period = requireString(body.period, 'period', 80);
      const attestation = await prisma.managementAttestation.upsert({
        where: { institutionId_period: { institutionId: user.institutionId, period } },
        update: {
          scopeSummary: requireString(body.scopeSummary, 'scopeSummary', 5000),
          overallOpinion: requireString(body.overallOpinion, 'overallOpinion', 1000),
          cfoSignOff: body.cfoSignOff === true,
          cfoName: body.cfoSignOff === true ? user.name : optionalString(body.cfoName, 250),
          croSignOff: body.croSignOff === true,
          croName: optionalString(body.croName, 250),
          attestedAt: new Date()
        },
        create: {
          institutionId: user.institutionId,
          period,
          scopeSummary: requireString(body.scopeSummary, 'scopeSummary', 5000),
          overallOpinion: requireString(body.overallOpinion, 'overallOpinion', 1000),
          cfoSignOff: body.cfoSignOff === true,
          cfoName: body.cfoSignOff === true ? user.name : optionalString(body.cfoName, 250),
          croSignOff: body.croSignOff === true,
          croName: optionalString(body.croName, 250),
          attestedAt: new Date()
        }
      });
      await writeAudit(user, request, { action: 'ATTEST', entityType: 'ManagementAttestation', recordId: attestation.id, newValue: attestation });
      return NextResponse.json(attestation);
    }

    throw new ApiError(400, 'UNSUPPORTED_ACTION', 'Unsupported certification action');
  } catch (error) { return apiError(error); }
}
