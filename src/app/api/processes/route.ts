import { NextResponse } from 'next/server';
import { createBusinessProcess, deleteBusinessProcess, getBusinessProcessDetail, listBusinessProcesses, listBusinessProcessSummaries, listProcessLookups, reviewSourceBackedBusinessProcessDraft, updateBusinessProcess } from '@/lib/d1-core';
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

export async function GET(request: Request) {
  try {
    const profile = await requireProfile(request);
    if (!profile?.institutionId) {
      return NextResponse.json({ error: 'Active institution is required.' }, { status: 409 });
    }
    const url = new URL(request.url);
    const view = url.searchParams.get('view');
    if (view === 'lookup') {
      const processes = await listProcessLookups(profile.institutionId);
      return NextResponse.json({
        processes,
        storage: 'cloudflare-d1',
        view: 'lookup'
      });
    }

    if (view === 'list') {
      const { processes, categories } = await listBusinessProcessSummaries(profile.institutionId);
      return NextResponse.json({
        processes,
        categories,
        storage: 'cloudflare-d1',
        view: 'list',
        progressive: true
      });
    }

    if (view === 'detail') {
      const id = url.searchParams.get('id')?.trim() || '';
      if (!id) {
        return NextResponse.json({ error: 'Process id is required.' }, { status: 400 });
      }
      const process = await getBusinessProcessDetail(id, profile.institutionId);
      return NextResponse.json({
        process,
        storage: 'cloudflare-d1',
        view: 'detail'
      });
    }

    const { processes, categories } = await listBusinessProcesses(profile.institutionId);
    return NextResponse.json({
      processes,
      categories,
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'PROCESS_NOT_FOUND') {
      return NextResponse.json({ error: 'Business process was not found.' }, { status: 404 });
    }
    console.error('Failed to fetch D1 processes:', error);
    return NextResponse.json({ error: 'Failed to fetch processes from persistent database.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requireProfile(request);
    if (!profile?.institutionId) {
      return NextResponse.json({ error: 'Active institution is required.' }, { status: 409 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : '';
    const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim() : '';
    const criticality = typeof body.criticality === 'string' ? body.criticality.trim() : '';
    const classification = typeof body.classification === 'string' ? body.classification.trim() : '';

    if (!name || !categoryId || !criticality || !classification) {
      return NextResponse.json(
        { error: 'name, categoryId, criticality, and classification are required.' },
        { status: 400 }
      );
    }

    const process = await createBusinessProcess({
      ...body,
      name,
      categoryId,
      ownerName,
      criticality,
      classification
    }, profile.institutionId);

    return NextResponse.json(process, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'INSTITUTION_REQUIRED') {
      return NextResponse.json({ error: 'Register an institution before creating processes.' }, { status: 409 });
    }
    if (code === 'CATEGORY_NOT_FOUND') {
      return NextResponse.json({ error: 'Selected process category does not exist.' }, { status: 400 });
    }
    if (code === 'PROCESS_ID_CONFLICT') {
      return NextResponse.json({ error: 'Process ID already exists for this institution.' }, { status: 409 });
    }

    console.error('Failed to create D1 process:', error);
    return NextResponse.json({ error: 'Failed to create process in persistent database.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await requireProfile(request);
    if (!profile?.institutionId) {
      return NextResponse.json({ error: 'Active institution is required.' }, { status: 409 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType.trim() : '';

    if (actionType === 'REVIEW_SOURCE_DRAFT') {
      const processId = typeof body.id === 'string' ? body.id.trim() : '';
      const decision = body.decision === 'APPROVE' || body.decision === 'REJECT' ? body.decision : null;
      if (!processId || !decision) {
        return NextResponse.json(
          { error: 'Process id and a valid decision (APPROVE or REJECT) are required.' },
          { status: 400 }
        );
      }

      const result = await reviewSourceBackedBusinessProcessDraft({
        processId,
        institutionId: profile.institutionId,
        decision,
        reviewedBy: profile.name || profile.email
      });
      return NextResponse.json(result);
    }
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : '';
    const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim() : '';
    const criticality = typeof body.criticality === 'string' ? body.criticality.trim() : '';
    const classification = typeof body.classification === 'string' ? body.classification.trim() : '';

    if (!id || !name || !categoryId || !criticality || !classification) {
      return NextResponse.json(
        { error: 'id, name, categoryId, criticality, and classification are required.' },
        { status: 400 }
      );
    }

    const process = await updateBusinessProcess(id, {
      ...body,
      name,
      categoryId,
      ownerName,
      criticality,
      classification
    }, profile.institutionId);

    return NextResponse.json(process);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'PROCESS_NOT_FOUND') {
      return NextResponse.json({ error: 'Business process was not found.' }, { status: 404 });
    }
    if (code === 'CATEGORY_NOT_FOUND') {
      return NextResponse.json({ error: 'Selected process category does not exist.' }, { status: 400 });
    }
    if (code === 'PROCESS_ID_CONFLICT') {
      return NextResponse.json({ error: 'Process ID already exists for this institution.' }, { status: 409 });
    }
    if (code === 'SOURCE_BPM_DRAFT_NOT_PENDING') {
      return NextResponse.json(
        { error: 'This source-backed BPM is not waiting for validation.' },
        { status: 409 }
      );
    }
    if (code === 'INVALID_DRAFT_DECISION') {
      return NextResponse.json({ error: 'Invalid BPM draft validation decision.' }, { status: 400 });
    }

    console.error('Failed to update D1 process:', error);
    return NextResponse.json({ error: 'Failed to update process in persistent database.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const profile = await requireProfile(request);
    if (!profile?.institutionId) {
      return NextResponse.json({ error: 'Active institution is required.' }, { status: 409 });
    }
    const id = new URL(request.url).searchParams.get('id')?.trim() || '';
    if (!id) {
      return NextResponse.json({ error: 'Process id is required.' }, { status: 400 });
    }

    const deleted = await deleteBusinessProcess(id, profile.institutionId);
    return NextResponse.json({ deleted: true, process: deleted });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'PROCESS_NOT_FOUND') {
      return NextResponse.json({ error: 'Business process was not found.' }, { status: 404 });
    }
    if (code === 'PROCESS_HAS_DEPENDENCIES') {
      return NextResponse.json(
        {
          error:
            'This process cannot be deleted because it is already linked to risk, control, assurance, or ICOFR records. Remove or reassign those dependencies first.'
        },
        { status: 409 }
      );
    }

    console.error('Failed to delete D1 process:', error);
    return NextResponse.json({ error: 'Failed to delete process from persistent database.' }, { status: 500 });
  }
}

