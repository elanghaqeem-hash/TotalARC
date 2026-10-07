import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import { readPdfTextInput } from '@/lib/pdf-text-input';
import { upsertSourceDocument } from '@/lib/d1-source-library';

export const dynamic = 'force-dynamic';

const MANAGE_ROLES = new Set(['SystemAdmin', 'Admin', 'ComplianceOfficer']);
const ALLOWED_TYPES = new Set(['application/pdf', 'text/plain']);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const context = await resolveInstitutionAccess(request);
  if (!context?.institution || !MANAGE_ROLES.has(context.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const value = form.get('file');
    const file = value instanceof File ? value : null;
    if (!file || !file.name.trim() || file.size <= 0) {
      return NextResponse.json({ error: 'File regulasi wajib dipilih.' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'File regulasi untuk Source Library maksimal 8 MB.' },
        { status: 413 }
      );
    }

    const mimeType = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : 'text/plain');
    if (!ALLOWED_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: 'Clause Intelligence saat ini menerima PDF atau TXT.' },
        { status: 415 }
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    let extractedText = '';

    if (mimeType === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      const parsed = readPdfTextInput(form.get('pdfText'), file.name);
      if (!parsed?.text) {
        return NextResponse.json(
          { error: 'PDF harus melalui text extraction/OCR sebelum diupload.' },
          { status: 400 }
        );
      }
      extractedText = parsed.text;
    } else {
      extractedText = new TextDecoder().decode(bytes).slice(0, 500000).trim();
      if (!extractedText) {
        return NextResponse.json({ error: 'File teks tidak memiliki isi yang dapat dibaca.' }, { status: 400 });
      }
    }

    const actor = context.profile.name || context.profile.email || context.profile.id;
    const result = await upsertSourceDocument(
      context.institution.id,
      {
        provider: 'UPLOAD',
        externalId: 'REGULATORY-' + crypto.randomUUID(),
        sourceKind: 'ROOT_FILE',
        title: file.name,
        mimeType,
        sourceUrl: null,
        sourceCreatedAt: new Date(file.lastModified || Date.now()).toISOString(),
        sourceModifiedAt: new Date(file.lastModified || Date.now()).toISOString(),
        module: 'REGULATORY_SOURCE',
        sensitivity: 'Confidential',
        rawBytes: bytes,
        extractedText,
        metadata: {
          importedBy: context.profile.id,
          importedByRole: context.profile.role,
          importedByName: actor,
          purpose: 'REGULATORY_CLAUSE_INTELLIGENCE',
          originalFileName: file.name
        }
      },
      'Regulatory source uploaded by Policy/Compliance through Clause Intelligence.'
    );

    return NextResponse.json(
      {
        changed: result.changed,
        document: result.record,
        textLength: result.record.textLength
      },
      {
        status: 201,
        headers: { 'Cache-Control': 'no-store' }
      }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'SOURCE_LIBRARY_FILE_TOO_LARGE') {
      return NextResponse.json({ error: 'File regulasi melebihi batas Source Library 8 MB.' }, { status: 413 });
    }
    if (code === 'PDF_TEXT_INVALID') {
      return NextResponse.json({ error: 'Hasil text extraction/OCR PDF tidak valid.' }, { status: 400 });
    }
    console.error('Regulatory source upload failed:', error);
    return NextResponse.json(
      { error: 'Dokumen regulasi belum dapat disimpan ke Source Library.' },
      { status: 500 }
    );
  }
}
