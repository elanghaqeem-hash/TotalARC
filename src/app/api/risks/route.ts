import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const risks = await prisma.riskMaster.findMany({
      include: {
        process: true,
        activity: true,
        controls: {
          include: {
            control: true
          }
        },
        issues: true
      },
      orderBy: { riskId: 'asc' }
    });

    return NextResponse.json({ risks });
  } catch (error) {
    console.error('Failed to fetch risks:', error);
    return NextResponse.json({ error: 'Failed to fetch risks' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      riskId,
      name,
      description,
      cause,
      event,
      impact,
      category,
      processId,
      ownerName,
      inherentLikelihood,
      inherentImpact
    } = body;

    const defaultInst = await prisma.institution.findFirst();
    if (!defaultInst) throw new Error('No institution found');

    const score = (inherentLikelihood || 3) * (inherentImpact || 3);
    let rating = 'Medium';
    if (score >= 15) rating = 'Critical';
    else if (score >= 10) rating = 'High';
    else if (score >= 5) rating = 'Medium';
    else rating = 'Low';

    const newRisk = await prisma.riskMaster.create({
      data: {
        institutionId: defaultInst.id,
        riskId: riskId || `RSK-${Date.now().toString().slice(-4)}`,
        name,
        description: description || `Due to ${cause}, there is a risk that ${event}, resulting in ${impact}.`,
        cause: cause || '',
        event: event || '',
        impact: impact || '',
        category: category || 'Operational',
        processId,
        ownerName: ownerName || 'Process Owner',
        inherentLikelihood: inherentLikelihood || 3,
        inherentImpact: inherentImpact || 3,
        inherentScore: score,
        inherentRating: rating,
        residualLikelihood: Math.max(1, (inherentLikelihood || 3) - 1),
        residualImpact: Math.max(1, (inherentImpact || 3) - 1),
        residualScore: Math.max(1, (inherentLikelihood || 3) - 1) * Math.max(1, (inherentImpact || 3) - 1),
        residualRating: 'Medium',
        riskTreatment: 'Reduce'
      }
    });

    return NextResponse.json(newRisk);
  } catch (error) {
    console.error('Failed to create risk:', error);
    return NextResponse.json({ error: 'Failed to create risk' }, { status: 500 });
  }
}
