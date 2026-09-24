import { NextResponse } from 'next/server';
import { applyRcmDerivedBpmDraft } from '@/lib/d1-core';
import { resolveInstitutionAccess } from '@/lib/institution-context';

export const dynamic = 'force-dynamic';

async function requireProfile(request: Request) {
  const context = await resolveInstitutionAccess(request);
  if (!context) return null;
  if (!context.institution) return context.profile;
  return {
    ...context.profile,
    institutionId: context.institution.id,
    institutionName: context.institution.name
  };
}

export async function POST(request: Request) {
  try {
    const profile = await requireProfile(request);
    if (!profile?.institutionId) {
      return NextResponse.json({ error: 'Active institution is required.' }, { status: 409 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const processId = typeof body.processId === 'string' ? body.processId.trim() : '';
    const sourceFingerprint =
      typeof body.sourceFingerprint === 'string' ? body.sourceFingerprint.trim() : '';

    if (!processId || !sourceFingerprint) {
      return NextResponse.json(
        { error: 'processId and sourceFingerprint are required.' },
        { status: 400 }
      );
    }

    const process = await applyRcmDerivedBpmDraft(processId, sourceFingerprint, profile.institutionId);
    return NextResponse.json({
      applied: true,
      process,
      message:
        'RCM-derived BPM draft validated and applied. The process should be reviewed again if the underlying RCM changes.'
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';

    if (code === 'PROCESS_NOT_FOUND') {
      return NextResponse.json({ error: 'Business process was not found.' }, { status: 404 });
    }
    if (code === 'RCM_BPM_DRAFT_NOT_AVAILABLE') {
      return NextResponse.json(
        { error: 'No RCM-derived BPM draft is currently available for this process.' },
        { status: 409 }
      );
    }
    if (code === 'RCM_BPM_DRAFT_STALE') {
      return NextResponse.json(
        {
          error:
            'The underlying RCM changed after this draft was displayed. Reload the BPM page and validate the refreshed draft.'
        },
        { status: 409 }
      );
    }

    console.error('Failed to apply RCM-derived BPM draft:', error);
    return NextResponse.json(
      { error: 'Failed to validate and apply the RCM-derived BPM draft.' },
      { status: 500 }
    );
  }
}
