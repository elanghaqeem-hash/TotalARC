import { NextResponse } from 'next/server';
import {
  getTraceabilityData,
  removeTraceabilityChain,
  saveDesignAssessment,
  saveTraceabilityChain
} from '@/lib/d1-icofr-traceability';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getTraceabilityData();
    return NextResponse.json({ ...data, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to load ICOFR traceability:', error);
    return NextResponse.json(
      { error: 'Failed to load ICOFR traceability from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType : '';

    if (actionType === 'SAVE_CHAIN') {
      const financialItemId = typeof body.financialItemId === 'string' ? body.financialItemId.trim() : '';
      const assertion = typeof body.assertion === 'string' ? body.assertion.trim() : '';
      const riskId = typeof body.riskId === 'string' ? body.riskId.trim() : '';
      const controlDomainId = typeof body.controlDomainId === 'string' ? body.controlDomainId.trim() : '';

      if (!financialItemId || !assertion || !riskId || !controlDomainId) {
        return NextResponse.json(
          { error: 'Financial item, assertion, risk and ICOFR control are required.' },
          { status: 400 }
        );
      }

      const result = await saveTraceabilityChain({
        financialItemId,
        assertion,
        riskId,
        controlDomainId,
        informationArtifactId:
          typeof body.informationArtifactId === 'string' && body.informationArtifactId.trim()
            ? body.informationArtifactId.trim()
            : null,
        sourceControlId:
          typeof body.sourceControlId === 'string' && body.sourceControlId.trim()
            ? body.sourceControlId.trim()
            : null,
        rationale:
          typeof body.rationale === 'string' && body.rationale.trim()
            ? body.rationale.trim()
            : null
      });

      return NextResponse.json(result, { status: 201 });
    }

    if (actionType === 'REMOVE_CHAIN') {
      const assertionId = typeof body.assertionId === 'string' ? body.assertionId.trim() : '';
      const riskId = typeof body.riskId === 'string' ? body.riskId.trim() : '';
      if (!assertionId || !riskId) {
        return NextResponse.json({ error: 'Assertion and risk are required to remove a chain.' }, { status: 400 });
      }
      const result = await removeTraceabilityChain({ assertionId, riskId });
      return NextResponse.json(result);
    }

    if (actionType === 'SAVE_TOD') {
      const result = await saveDesignAssessment(body);
      return NextResponse.json(result, { status: body.id ? 200 : 201 });
    }

    return NextResponse.json({ error: 'Unsupported traceability action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Register an institution before maintaining ICOFR traceability.', 409],
      FINANCIAL_ITEM_NOT_FOUND: ['Selected account/disclosure was not found.', 400],
      INVALID_ASSERTION: ['Select a valid financial statement assertion.', 400],
      RISK_NOT_FOUND: ['Selected risk was not found.', 400],
      CONTROL_DOMAIN_NOT_FOUND: ['Selected ICOFR control was not found.', 400],
      INFORMATION_ARTIFACT_NOT_FOUND: ['Selected IPE/EUC record was not found.', 400],
      SOURCE_CONTROL_NOT_FOUND: ['Selected enterprise Control Master record was not found.', 400],
      REQUIRED_FIELDS: ['Control, period and tester are required for Test of Design.', 400],
      TEST_ID_CONFLICT: ['Test of Design ID already exists.', 409],
      TRACE_LINK_NOT_FOUND: ['Traceability link was not found.', 404],
      PERIOD_CLOSED: ['This ICOFR period is closed. Request an approved temporary reopening before changing Test of Design evidence.', 409]
    };

    if (known[code]) {
      return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    }

    console.error('Failed to save ICOFR traceability:', error);
    return NextResponse.json({ error: 'Failed to save ICOFR traceability.' }, { status: 500 });
  }
}
