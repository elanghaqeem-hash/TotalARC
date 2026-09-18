import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const tests = await prisma.toETest.findMany({
      include: {
        control: true,
        process: true,
        risk: true,
        samples: {
          orderBy: { sampleNumber: 'asc' }
        },
        exceptions: {
          include: {
            deficiencies: {
              include: {
                rootCause: true,
                issues: {
                  include: {
                    actionPlans: {
                      include: {
                        retests: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    return NextResponse.json({ tests });
  } catch (error) {
    console.error('Failed to fetch ToE tests:', error);
    return NextResponse.json({ error: 'Failed to fetch ToE tests' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { testId, sampleId, result, failureReason } = body;

    if (sampleId) {
      const updatedSample = await prisma.testSample.update({
        where: { id: sampleId },
        data: {
          result,
          failureReason: result === 'Fail' ? failureReason : null
        }
      });
      return NextResponse.json(updatedSample);
    }

    return NextResponse.json({ message: 'OK' });
  } catch (error) {
    console.error('Failed to update ToE sample:', error);
    return NextResponse.json({ error: 'Failed to update sample' }, { status: 500 });
  }
}
