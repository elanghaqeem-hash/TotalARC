import { NextResponse } from 'next/server';
import {
  getExecutiveReportingData,
  saveAuditRelianceMapping,
  saveExecutiveReportPack,
  savePbcRequest
} from '@/lib/d1-icofr-executive-reporting';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getExecutiveReportingData();
    return NextResponse.json({ ...data, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to load ICOFR executive reporting data:', error);
    return NextResponse.json(
      { error: 'Failed to load ICOFR executive reporting data from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType : '';

    if (actionType === 'SAVE_REPORT_PACK') {
      const record = await saveExecutiveReportPack(body);
      return NextResponse.json(record, { status: body.id ? 200 : 201 });
    }

    if (actionType === 'SAVE_RELIANCE') {
      const record = await saveAuditRelianceMapping(body);
      return NextResponse.json(record, { status: body.id ? 200 : 201 });
    }

    if (actionType === 'SAVE_PBC') {
      const record = await savePbcRequest(body);
      return NextResponse.json(record, { status: body.id ? 200 : 201 });
    }

    return NextResponse.json({ error: 'Unsupported ICOFR reporting action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Register an institution before using ICOFR executive reporting.', 409],
      REPORT_REQUIRED: ['Period, audience, report title, executive summary and preparer are required.', 400],
      REPORT_REVIEW_REQUIRED: ['Reviewer is required before an executive report pack can be issued.', 400],
      SCOPE_NOT_FOUND: ['Selected ICOFR scope was not found.', 400],
      CYCLE_NOT_FOUND: ['Selected ICOFR testing cycle was not found.', 400],
      CYCLE_SCOPE_MISMATCH: ['Selected testing cycle does not belong to the selected scope.', 400],
      ATTESTATION_NOT_FOUND: ['Selected management attestation was not found.', 400],
      RELIANCE_REQUIRED: ['Period, auditor, control, reliance area, planned reliance and owner are required.', 400],
      CONTROL_NOT_FOUND: ['Selected ICOFR control was not found.', 400],
      RELIANCE_CONFLICT: ['A reliance mapping already exists for this auditor, period and control.', 409],
      RELIANCE_CLOSE_REQUIRED: ['Reliance conclusion and workpaper reference are required before reliance can be accepted/closed.', 400],
      PBC_REQUIRED: ['Period, request number, auditor, category, description, owner and dates are required.', 400],
      INVALID_PBC_DATES: ['PBC due date cannot be earlier than the request date.', 400],
      PBC_CONFLICT: ['This PBC request number already exists for the selected period.', 409],
      PBC_EVIDENCE_REQUIRED: ['Evidence reference is required before a PBC request can be submitted, accepted or closed.', 400]
    };

    if (known[code]) {
      return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    }

    console.error('Failed to save ICOFR reporting data:', error);
    return NextResponse.json(
      { error: 'Failed to save ICOFR executive reporting data.' },
      { status: 500 }
    );
  }
}
