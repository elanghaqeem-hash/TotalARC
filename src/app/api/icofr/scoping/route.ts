import { NextResponse } from 'next/server';
import { getIcofrScopingData, saveIcofrScope, type IcofrScopeItemInput } from '@/lib/d1-icofr';

export const dynamic = 'force-dynamic';

function numberValue(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET() {
  try {
    const data = await getIcofrScopingData();
    return NextResponse.json({ ...data, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to load ICOFR scoping data:', error);
    return NextResponse.json(
      { error: 'Failed to load ICOFR scoping data from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const items = Array.isArray(body.items)
      ? body.items.filter(
          (item): item is IcofrScopeItemInput =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof (item as Record<string, unknown>).name === 'string' &&
            typeof (item as Record<string, unknown>).itemType === 'string'
        )
      : [];

    const fiscalYear = numberValue(body.fiscalYear);
    const benchmarkAmount = numberValue(body.benchmarkAmount);
    const overallMaterialityPercent = numberValue(body.overallMaterialityPercent);
    const overallMaterialityAmount = numberValue(body.overallMaterialityAmount);
    const performanceMaterialityPercent = numberValue(body.performanceMaterialityPercent);
    const performanceMaterialityAmount = numberValue(body.performanceMaterialityAmount);

    if (
      fiscalYear === null ||
      benchmarkAmount === null ||
      overallMaterialityPercent === null ||
      overallMaterialityAmount === null ||
      performanceMaterialityPercent === null ||
      performanceMaterialityAmount === null
    ) {
      return NextResponse.json(
        { error: 'Fiscal year, benchmark, OM and PM values are required.' },
        { status: 400 }
      );
    }

    const scope = await saveIcofrScope({
      id: typeof body.id === 'string' ? body.id : undefined,
      scopeName: typeof body.scopeName === 'string' ? body.scopeName : '',
      fiscalYear,
      reportingPeriod: typeof body.reportingPeriod === 'string' ? body.reportingPeriod : '',
      currency: typeof body.currency === 'string' ? body.currency : '',
      consolidationBasis:
        typeof body.consolidationBasis === 'string' ? body.consolidationBasis : '',
      accountingFramework:
        typeof body.accountingFramework === 'string' ? body.accountingFramework : null,
      benchmarkType: typeof body.benchmarkType === 'string' ? body.benchmarkType : '',
      benchmarkAmount,
      overallMaterialityPercent,
      overallMaterialityAmount,
      performanceMaterialityPercent,
      performanceMaterialityAmount,
      clearlyTrivialPercent: numberValue(body.clearlyTrivialPercent),
      clearlyTrivialAmount: numberValue(body.clearlyTrivialAmount),
      componentMaterialityAmount: numberValue(body.componentMaterialityAmount),
      scopeApproach: typeof body.scopeApproach === 'string' ? body.scopeApproach : '',
      quantitativeCriteria:
        typeof body.quantitativeCriteria === 'string' ? body.quantitativeCriteria : null,
      qualitativeCriteria:
        typeof body.qualitativeCriteria === 'string' ? body.qualitativeCriteria : null,
      exclusions: typeof body.exclusions === 'string' ? body.exclusions : null,
      status: typeof body.status === 'string' ? body.status : 'Draft',
      preparedBy: typeof body.preparedBy === 'string' ? body.preparedBy : '',
      reviewedBy: typeof body.reviewedBy === 'string' ? body.reviewedBy : null,
      approvedBy: typeof body.approvedBy === 'string' ? body.approvedBy : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
      items
    });

    return NextResponse.json(scope, { status: body.id ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';

    if (code === 'INSTITUTION_REQUIRED') {
      return NextResponse.json(
        { error: 'Register an institution before defining the ICOFR scope.' },
        { status: 409 }
      );
    }

    if (code === 'REQUIRED_FIELDS') {
      return NextResponse.json(
        { error: 'Complete the required ICOFR scoping fields.' },
        { status: 400 }
      );
    }

    if (code === 'INVALID_NUMERIC_VALUES') {
      return NextResponse.json(
        { error: 'Materiality and benchmark values must be valid non-negative numbers.' },
        { status: 400 }
      );
    }

    if (code === 'PM_ABOVE_OM') {
      return NextResponse.json(
        { error: 'Performance Materiality (PM) cannot exceed Overall Materiality (OM).' },
        { status: 400 }
      );
    }

    if (code === 'TRIVIAL_ABOVE_OM') {
      return NextResponse.json(
        { error: 'Clearly trivial / SAD threshold cannot exceed Overall Materiality (OM).' },
        { status: 400 }
      );
    }

    if (code === 'SCOPE_NOT_FOUND') {
      return NextResponse.json({ error: 'ICOFR scope record was not found.' }, { status: 404 });
    }

    if (code === 'PERIOD_CLOSED') {
      return NextResponse.json(
        { error: 'This ICOFR period is closed. Use Period Close & Archive to request a controlled reopening before changing the scope.' },
        { status: 409 }
      );
    }

    console.error('Failed to save ICOFR scope:', error);
    return NextResponse.json(
      { error: 'Failed to save ICOFR scope to persistent database.' },
      { status: 500 }
    );
  }
}
