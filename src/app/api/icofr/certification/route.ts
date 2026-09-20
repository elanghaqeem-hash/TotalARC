import { NextResponse } from 'next/server';
import {
  getCertificationData,
  saveEvidencePack,
  saveManagementAttestation,
  saveSubCertification,
  signManagementAttestation
} from '@/lib/d1-icofr-certification';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getCertificationData();
    return NextResponse.json({ ...data, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to load ICOFR certification data:', error);
    return NextResponse.json(
      { error: 'Failed to load ICOFR certification data from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType : '';

    if (actionType === 'SAVE_SUBCERTIFICATION') {
      const record = await saveSubCertification(body);
      return NextResponse.json(record, { status: body.id ? 200 : 201 });
    }

    if (actionType === 'SAVE_ATTESTATION') {
      const record = await saveManagementAttestation(body);
      return NextResponse.json(record, { status: body.id ? 200 : 201 });
    }

    if (actionType === 'SAVE_EVIDENCE_PACK') {
      const record = await saveEvidencePack(body);
      return NextResponse.json(record, { status: body.id ? 200 : 201 });
    }

    if (actionType === 'SIGN_ATTESTATION') {
      const attestationId = typeof body.attestationId === 'string' ? body.attestationId.trim() : '';
      const role = body.role === 'CEO' ? 'CEO' : body.role === 'CFO' ? 'CFO' : '';
      const signatoryName = typeof body.signatoryName === 'string' ? body.signatoryName.trim() : '';
      const declarationConfirmed = body.declarationConfirmed === true;

      if (!attestationId || !role || !signatoryName || !declarationConfirmed) {
        return NextResponse.json(
          { error: 'Attestation, role, signatory name and declaration confirmation are required.' },
          { status: 400 }
        );
      }

      const result = await signManagementAttestation(
        attestationId,
        role as 'CFO' | 'CEO',
        signatoryName,
        declarationConfirmed
      );
      return NextResponse.json(result, { status: 201 });
    }

    return NextResponse.json({ error: 'Unsupported ICOFR certification action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Register an institution before using ICOFR certification.', 409],
      SUBCERT_REQUIRED: ['Scope, period, subject, certifier and declaration are required.', 400],
      INVALID_SUBJECT_TYPE: ['Sub-certification subject must be a Legal Entity or Organization Unit.', 400],
      SUBJECT_NOT_FOUND: ['Selected legal entity or organization unit was not found.', 400],
      SCOPE_NOT_FOUND: ['Selected ICOFR scope was not found.', 400],
      CYCLE_NOT_FOUND: ['Selected testing cycle does not belong to the selected scope.', 400],
      SUBCERT_CONFLICT: ['A sub-certification already exists for this subject and period.', 409],
      SUBCERT_DECLARATIONS_INCOMPLETE: ['All certification declarations and a conclusion are required before submission/approval.', 400],
      SUBCERT_REVIEW_REQUIRED: ['Reviewer name and decision are required before approval.', 400],
      ATTESTATION_REQUIRED: ['Scope, period, scope summary, management representation and preparer are required.', 400],
      ATTESTATION_CONFLICT: ['A management attestation already exists for this scope and period.', 409],
      OVERRIDE_REASON_REQUIRED: ['A documented reason is required when readiness override is enabled.', 400],
      EVIDENCE_REQUIRED: ['Attestation, pack name, period, preparer and evidence index reference are required.', 400],
      ATTESTATION_NOT_FOUND: ['Selected management attestation was not found.', 404],
      EVIDENCE_CONFLICT: ['An evidence pack with this name already exists for the selected attestation.', 409],
      SIGNOFF_REQUIRED: ['Signatory name and explicit declaration confirmation are required.', 400],
      CONCLUSION_REQUIRED: ['Record management overall conclusion before executive sign-off.', 400],
      READINESS_NOT_MET: ['Readiness gates are not fully met. Resolve the gaps or document an approved readiness override before sign-off.', 409]
    };

    if (known[code]) {
      return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    }

    console.error('Failed to save ICOFR certification data:', error);
    return NextResponse.json({ error: 'Failed to save ICOFR certification data.' }, { status: 500 });
  }
}
