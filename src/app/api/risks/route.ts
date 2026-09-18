import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function riskRating(score: number) {
  if (score >= 15) return 'Critical';
  if (score >= 10) return 'High';
  if (score >= 5) return 'Medium';
  return 'Low';
}

export async function GET() {
  try {
    const risks = await prisma.riskMaster.findMany({
      include: { process: true, activity: true, controls: { include: { control: true } }, issues: true },
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
      riskId, name, description, cause, event, impact, category, processId,
      ownerName, inherentLikelihood, inherentImpact
    } = body;

    const likelihood = Number(inherentLikelihood);
    const impactValue = Number(inherentImpact);
    if (
      !name || !description || !cause || !event || !impact || !category || !processId || !ownerName ||
      !Number.isInteger(likelihood) || likelihood < 1 || likelihood > 5 ||
      !Number.isInteger(impactValue) || impactValue < 1 || impactValue > 5
    ) {
      return NextResponse.json(
        { error: 'Complete risk data and a 1-5 inherent likelihood/impact assessment are required.' },
        { status: 400 }
      );
    }

    const institution = await prisma.institution.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!institution) return NextResponse.json({ error: 'Register an institution before creating risks.' }, { status: 409 });

    const score = likelihood * impactValue;
    const rating = riskRating(score);
    const risk = await prisma.riskMaster.create({
      data: {
        institutionId: institution.id,
        riskId: riskId || `RSK-${Date.now().toString(36).toUpperCase()}`,
        name, description, cause, event, impact, category, processId, ownerName,
        inherentLikelihood: likelihood,
        inherentImpact: impactValue,
        inherentScore: score,
        inherentRating: rating,
        residualLikelihood: likelihood,
        residualImpact: impactValue,
        residualScore: score,
        residualRating: rating,
        riskTreatment: 'Not Assessed'
      }
    });

    return NextResponse.json(risk, { status: 201 });
  } catch (error) {
    console.error('Failed to create risk:', error);
    return NextResponse.json({ error: 'Failed to create risk' }, { status: 500 });
  }
}
