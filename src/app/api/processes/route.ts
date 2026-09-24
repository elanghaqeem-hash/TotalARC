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
      return NextResponse.json({ error: 'Institusi aktif wajib tersedia.' }, { status: 409 });
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
        return NextResponse.json({ error: 'ID proses wajib diisi.' }, { status: 400 });
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
      return NextResponse.json({ error: 'Proses bisnis tidak ditemukan.' }, { status: 404 });
    }
    console.error('Failed to fetch D1 processes:', error);
    return NextResponse.json({ error: 'Gagal mengambil data proses dari database permanen.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requireProfile(request);
    if (!profile?.institutionId) {
      return NextResponse.json({ error: 'Institusi aktif wajib tersedia.' }, { status: 409 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : '';
    const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim() : '';
    const criticality = typeof body.criticality === 'string' ? body.criticality.trim() : '';
    const classification = typeof body.classification === 'string' ? body.classification.trim() : '';

    if (!name || !categoryId || !criticality || !classification) {
      return NextResponse.json(
        { error: 'Nama, kategori, kritikalitas, dan klasifikasi wajib diisi.' },
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
      return NextResponse.json({ error: 'Daftarkan institusi sebelum membuat proses.' }, { status: 409 });
    }
    if (code === 'CATEGORY_NOT_FOUND') {
      return NextResponse.json({ error: 'Kategori proses terpilih tidak tersedia.' }, { status: 400 });
    }
    if (code === 'PROCESS_ID_CONFLICT') {
      return NextResponse.json({ error: 'ID Proses sudah ada pada institusi ini.' }, { status: 409 });
    }

    console.error('Failed to create D1 process:', error);
    return NextResponse.json({ error: 'Gagal membuat proses pada database permanen.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await requireProfile(request);
    if (!profile?.institutionId) {
      return NextResponse.json({ error: 'Institusi aktif wajib tersedia.' }, { status: 409 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType.trim() : '';

    if (actionType === 'REVIEW_SOURCE_DRAFT') {
      const processId = typeof body.id === 'string' ? body.id.trim() : '';
      const decision = body.decision === 'APPROVE' || body.decision === 'REJECT' ? body.decision : null;
      if (!processId || !decision) {
        return NextResponse.json(
          { error: 'ID proses dan keputusan yang valid (APPROVE atau REJECT) wajib diisi.' },
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
        { error: 'ID, nama, kategori, kritikalitas, dan klasifikasi wajib diisi.' },
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
      return NextResponse.json({ error: 'Proses bisnis tidak ditemukan.' }, { status: 404 });
    }
    if (code === 'CATEGORY_NOT_FOUND') {
      return NextResponse.json({ error: 'Kategori proses terpilih tidak tersedia.' }, { status: 400 });
    }
    if (code === 'PROCESS_ID_CONFLICT') {
      return NextResponse.json({ error: 'ID Proses sudah ada pada institusi ini.' }, { status: 409 });
    }
    if (code === 'SOURCE_BPM_DRAFT_NOT_PENDING') {
      return NextResponse.json(
        { error: 'BPM berbasis sumber ini tidak sedang menunggu validasi.' },
        { status: 409 }
      );
    }
    if (code === 'INVALID_DRAFT_DECISION') {
      return NextResponse.json({ error: 'Keputusan validasi draf BPM tidak valid.' }, { status: 400 });
    }

    console.error('Failed to update D1 process:', error);
    return NextResponse.json({ error: 'Gagal memperbarui proses pada database permanen.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const profile = await requireProfile(request);
    if (!profile?.institutionId) {
      return NextResponse.json({ error: 'Institusi aktif wajib tersedia.' }, { status: 409 });
    }
    const id = new URL(request.url).searchParams.get('id')?.trim() || '';
    if (!id) {
      return NextResponse.json({ error: 'ID proses wajib diisi.' }, { status: 400 });
    }

    const deleted = await deleteBusinessProcess(id, profile.institutionId);
    return NextResponse.json({ deleted: true, process: deleted });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'PROCESS_NOT_FOUND') {
      return NextResponse.json({ error: 'Proses bisnis tidak ditemukan.' }, { status: 404 });
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
    return NextResponse.json({ error: 'Gagal menghapus proses dari database permanen.' }, { status: 500 });
  }
}

