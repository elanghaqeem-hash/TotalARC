import { NextResponse } from 'next/server';
import {
  linkEvidence,
  uploadEvidenceVersion
} from '@/lib/d1-evidence-repository';

export const dynamic = 'force-dynamic';

function textField(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Evidence file is required.' }, { status: 400 });
    }

    const title = textField(form, 'title');
    const category = textField(form, 'category');
    const sensitivity = textField(form, 'sensitivity');
    const retentionClass = textField(form, 'retentionClass');
    const ownerName = textField(form, 'ownerName');
    const uploadedBy = textField(form, 'uploadedBy');

    if (!title || !category || !sensitivity || !retentionClass || !ownerName || !uploadedBy) {
      return NextResponse.json(
        { error: 'Title, category, sensitivity, retention class, owner, uploader and file are required.' },
        { status: 400 }
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    const uploaded = await uploadEvidenceVersion({
      documentId: textField(form, 'documentId') || null,
      title,
      description: textField(form, 'description') || null,
      category,
      sensitivity,
      retentionClass,
      retentionUntil: textField(form, 'retentionUntil') || null,
      legalHold: textField(form, 'legalHold') === 'true',
      ownerName,
      sourceSystem: textField(form, 'sourceSystem') || null,
      uploadedBy,
      versionNote: textField(form, 'versionNote') || null,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      bytes
    });

    let linked = null;
    let linkWarning = null;
    const entityType = textField(form, 'entityType');
    const entityId = textField(form, 'entityId');

    if (entityType && entityId) {
      try {
        linked = await linkEvidence({
          documentId: uploaded.documentId,
          versionId: uploaded.versionId,
          entityType,
          entityId,
          relationship: textField(form, 'relationship') || 'SUPPORTS',
          notes: textField(form, 'linkNotes') || null,
          syncWorkpaperIndex: textField(form, 'syncWorkpaperIndex') === 'true',
          evidenceType: textField(form, 'workpaperEvidenceType') || null,
          evidenceOwner: textField(form, 'workpaperEvidenceOwner') || ownerName
        });
      } catch (error) {
        linkWarning =
          error instanceof Error
            ? error.message
            : 'Evidence file was stored, but the requested link could not be completed.';
      }
    }

    return NextResponse.json(
      {
        ...uploaded,
        linked,
        linkWarning,
        storage: 'cloudflare-d1-chunked'
      },
      { status: 201 }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Register an institution before uploading evidence.', 409],
      UPLOAD_REQUIRED: ['Title, category, owner and uploader are required.', 400],
      INVALID_SENSITIVITY: ['Sensitivity must be Internal, Confidential, or Restricted.', 400],
      INVALID_RETENTION_CLASS: ['Select a supported retention class.', 400],
      CUSTOM_RETENTION_DATE_REQUIRED: ['A retention date is required for Custom retention.', 400],
      FILE_TYPE_NOT_ALLOWED: ['This file type is not permitted for enterprise evidence storage.', 415],
      FILE_EMPTY: ['The evidence file is empty.', 400],
      FILE_TOO_LARGE: ['Evidence file exceeds the current 8 MB per-version storage limit.', 413],
      DOCUMENT_NOT_FOUND: ['Selected evidence document was not found.', 404],
      DOCUMENT_ARCHIVED: ['Archived evidence documents cannot receive new versions.', 409],
      DUPLICATE_FILE_VERSION: ['The uploaded file is identical to the current evidence version.', 409],
      VERSION_NOTE_REQUIRED: ['Document the reason/change note when uploading a new evidence version.', 400]
    };

    if (known[code]) {
      return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    }

    console.error('Evidence upload failed:', error);
    return NextResponse.json({ error: 'Evidence upload failed.' }, { status: 500 });
  }
}
