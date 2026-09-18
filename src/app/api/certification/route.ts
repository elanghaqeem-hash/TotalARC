import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { deriveControlHealth } from '@/lib/control-health';

const CERTIFICATION_STATUSES = ['Certified','Certified with Exception','Not Certified'];

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const [certifications, attestations] = await Promise.all([
      prisma.controlCertification.findMany({
        where: { control: { institutionId: user.institutionId } },
        include: { control: true },
        orderBy: { certifiedAt: 'desc' }
      }),
      prisma.managementAttestation.findMany({
        where: { institutionId: user.institutionId },
        orderBy: { createdAt: 'desc' }
      })
    ]);
    return NextResponse.json({ certifications, attestations });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = await readJson<Record<string, unknown>>(request);
    const action = requireString(body.action, 'action', 50);

    if (action === 'CERTIFY_CONTROL') {
      if (!['Admin','ControlOwner','Reviewer'].includes(user.role)) {
        throw new ApiError(403, 'FORBIDDEN', 'Control certification permission required');
      }

      const controlId = requireString(body.controlId, 'controlId', 100);
      const period = requireString(body.period, 'period', 80);
      const status = requireString(body.status, 'status', 80);
      if (!CERTIFICATION_STATUSES.includes(status)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid certification status');
      }

      const control = await prisma.controlMaster.findFirst({
        where: { id: controlId, institutionId: user.institutionId },
        include: {
          todTests: { where: { status: 'Approved' }, orderBy: { testedAt: 'desc' }, take: 1 },
          toeTests: { where: { status: 'Reviewed' }, orderBy: { testedAt: 'desc' }, take: 1 },
          issues: { orderBy: { createdAt: 'desc' } },
          monitoringRules: { orderBy: { createdAt: 'desc' } }
        }
      });
      if (!control) throw new ApiError(404, 'CONTROL_NOT_FOUND', 'Control not found');

      const health = deriveControlHealth(control);
      if (status === 'Certified' && health !== 'Healthy') {
        throw new ApiError(
          400,
          'EVIDENCE_NOT_SUFFICIENT',
          `Control can only be Certified when current evidence-derived health is Healthy. Current health: ${health}`
        );
      }
      if (status === 'Certified with Exception' && health !== 'Attention Required') {
        throw new ApiError(
          400,
          'EVIDENCE_NOT_SUFFICIENT',
          `Certified with Exception requires current health of Attention Required. Current health: ${health}`
        );
      }

      const declarationText = requireString(body.declarationText, 'declarationText', 5000);
      const existing = await prisma.controlCertification.findUnique({
        where: { controlId_period: { controlId, period } }
      });

      const cert = await prisma.controlCertification.upsert({
        where: { controlId_period: { controlId, period } },
        update: {
          declarationText,
          certifierName: user.name,
          certifierRole: user.role,
          status,
          certifiedAt: new Date()
        },
        create: {
          controlId,
          period,
          declarationText,
          certifierName: user.name,
          certifierRole: user.role,
          status
        }
      });

      await writeAudit(user, request, {
        action: existing ? 'RECERTIFY' : 'CERTIFY',
        entityType: 'ControlCertification',
        recordId: cert.id,
        reason: `Certification recorded against evidence-derived health: ${health}`,
        oldValue: existing || undefined,
        newValue: { ...cert, evidenceDerivedHealth: health }
      });
      return NextResponse.json({ certification: cert, evidenceDerivedHealth: health }, { status: existing ? 200 : 201 });
    }

    if (action === 'ATTEST_MANAGEMENT') {
      if (!['Admin','Executive'].includes(user.role)) {
        throw new ApiError(403, 'FORBIDDEN', 'Executive attestation permission required');
      }

      const period = requireString(body.period, 'period', 80);
      const scopeSummary = requireString(body.scopeSummary, 'scopeSummary', 5000);
      const overallOpinion = requireString(body.overallOpinion, 'overallOpinion', 1000);

      const [keyControls, certifications, openIssues] = await Promise.all([
        prisma.controlMaster.count({ where: { institutionId: user.institutionId, isKeyControl: true } }),
        prisma.controlCertification.count({
          where: {
            control: { institutionId: user.institutionId, isKeyControl: true },
            period,
            status: { in: ['Certified','Certified with Exception'] }
          }
        }),
        prisma.issue.count({
          where: { institutionId: user.institutionId, status: { not: 'Closed' } }
        })
      ]);

      const attestation = await prisma.managementAttestation.upsert({
        where: { institutionId_period: { institutionId: user.institutionId, period } },
        update: {
          scopeSummary,
          overallOpinion,
          cfoSignOff: body.cfoSignOff === true,
          cfoName: body.cfoSignOff === true ? user.name : optionalString(body.cfoName, 250),
          croSignOff: body.croSignOff === true,
          croName: body.croSignOff === true ? user.name : optionalString(body.croName, 250),
          attestedAt: new Date()
        },
        create: {
          institutionId: user.institutionId,
          period,
          scopeSummary,
          overallOpinion,
          cfoSignOff: body.cfoSignOff === true,
          cfoName: body.cfoSignOff === true ? user.name : optionalString(body.cfoName, 250),
          croSignOff: body.croSignOff === true,
          croName: body.croSignOff === true ? user.name : optionalString(body.croName, 250),
          attestedAt: new Date()
        }
      });

      await writeAudit(user, request, {
        action: 'ATTEST',
        entityType: 'ManagementAttestation',
        recordId: attestation.id,
        reason: `Period ${period}: ${certifications}/${keyControls} key controls certified; ${openIssues} open issue(s)`,
        newValue: {
          ...attestation,
          evidenceSnapshot: { keyControls, certifications, openIssues }
        }
      });

      return NextResponse.json({
        attestation,
        evidenceSnapshot: { keyControls, certifiedKeyControls: certifications, openIssues }
      });
    }

    throw new ApiError(400, 'UNSUPPORTED_ACTION', 'Unsupported certification action');
  } catch (error) {
    return apiError(error);
  }
}
