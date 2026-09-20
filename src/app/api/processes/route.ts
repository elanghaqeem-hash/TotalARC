import { NextResponse } from 'next/server';
import { createBusinessProcess, deleteBusinessProcess, listBusinessProcesses, listProcessLookups, updateBusinessProcess } from '@/lib/d1-core';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const view = new URL(request.url).searchParams.get('view');
    if (view === 'lookup') {
      const processes = await listProcessLookups();
      return NextResponse.json({
        processes,
        storage: 'cloudflare-d1',
        view: 'lookup'
      });
    }

    const { processes, categories } = await listBusinessProcesses();
    return NextResponse.json({
      processes,
      categories,
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    console.error('Failed to fetch D1 processes:', error);
    return NextResponse.json({ error: 'Failed to fetch processes from persistent database.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : '';
    const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim() : '';
    const criticality = typeof body.criticality === 'string' ? body.criticality.trim() : '';
    const classification = typeof body.classification === 'string' ? body.classification.trim() : '';

    if (!name || !categoryId || !ownerName || !criticality || !classification) {
      return NextResponse.json(
        { error: 'name, categoryId, ownerName, criticality, and classification are required.' },
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
    });

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
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : '';
    const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim() : '';
    const criticality = typeof body.criticality === 'string' ? body.criticality.trim() : '';
    const classification = typeof body.classification === 'string' ? body.classification.trim() : '';

    if (!id || !name || !categoryId || !ownerName || !criticality || !classification) {
      return NextResponse.json(
        { error: 'id, name, categoryId, ownerName, criticality, and classification are required.' },
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
    });

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

    console.error('Failed to update D1 process:', error);
    return NextResponse.json({ error: 'Failed to update process in persistent database.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id')?.trim() || '';
    if (!id) {
      return NextResponse.json({ error: 'Process id is required.' }, { status: 400 });
    }

    const deleted = await deleteBusinessProcess(id);
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

