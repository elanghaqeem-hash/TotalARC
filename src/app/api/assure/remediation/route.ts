import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const [deficiencies, issues, maps, retests] = await Promise.all([
      prisma.controlDeficiency.findMany({
        include: {
          exception: true,
          rootCause: true,
          issues: true
        }
      }),
      prisma.issue.findMany({
        include: {
          process: true,
          risk: true,
          control: true,
          deficiency: {
            include: {
              rootCause: true
            }
          },
          actionPlans: {
            include: {
              milestones: true,
              retests: true
            }
          }
        }
      }),
      prisma.managementActionPlan.findMany({
        include: {
          issue: {
            include: {
              process: true,
              control: true
            }
          },
          milestones: true,
          retests: true
        }
      }),
      prisma.retestRecord.findMany({
        include: {
          map: {
            include: {
              issue: true
            }
          }
        }
      })
    ]);

    return NextResponse.json({
      deficiencies,
      issues,
      maps,
      retests
    });
  } catch (error) {
    console.error('Failed to fetch remediation data:', error);
    return NextResponse.json({ error: 'Failed to fetch remediation data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { actionType, mapId, extensionReason, newDueDate, approverName } = body;

    if (actionType === 'REQUEST_EXTENSION' && (!mapId || !extensionReason || !newDueDate || !approverName)) {
      return NextResponse.json({ error: 'mapId, extensionReason, newDueDate, and approverName are required.' }, { status: 400 });
    }

    if (actionType === 'REQUEST_EXTENSION') {
      const existingMap = await prisma.managementActionPlan.findUnique({
        where: { id: mapId }
      });
      if (!existingMap) throw new Error('MAP not found');

      // Original due date is immutable per Section 79!
      const updated = await prisma.managementActionPlan.update({
        where: { id: mapId },
        data: {
          revisedDueDate: new Date(newDueDate),
          extensionCount: existingMap.extensionCount + 1,
          extensionReason: extensionReason,
          approverName
        }
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ message: 'OK' });
  } catch (error) {
    console.error('Failed to process remediation action:', error);
    return NextResponse.json({ error: 'Failed to process remediation action' }, { status: 500 });
  }
}
