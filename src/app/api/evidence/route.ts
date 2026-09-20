import { NextResponse } from 'next/server';
import {
  archiveEvidenceDocument,
  getEvidenceRepositoryData,
  linkEvidence,
  unlinkEvidence,
  updateEvidenceGovernance,
  verifyEvidenceVersion
} from '@/lib/d1-evidence-repository';
import { getCurrentSecurityContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getEvidenceRepositoryData();
    return NextResponse.json(
      { ...data, storage: 'cloudflare-d1' },
      { headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=45' } }
    );
  } catch (error) {
    console.error('Failed to load evidence repository:', error);
    return NextResponse.json(
      { error: 'Failed to load enterprise evidence repository from persistent storage.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType.trim() : '';

    if (actionType === 'UPDATE_GOVERNANCE') {
      return NextResponse.json(await updateEvidenceGovernance(body));
    }

    if (actionType === 'LINK') {
      const record = await linkEvidence({
        documentId: String(body.documentId || ''),
        versionId: typeof body.versionId === 'string' ? body.versionId : null,
        entityType: String(body.entityType || ''),
        entityId: String(body.entityId || ''),
        relationship: typeof body.relationship === 'string' ? body.relationship : null,
        notes: typeof body.notes === 'string' ? body.notes : null,
        syncWorkpaperIndex: body.syncWorkpaperIndex === true,
        evidenceType: typeof body.evidenceType === 'string' ? body.evidenceType : null,
        evidenceOwner: typeof body.evidenceOwner === 'string' ? body.evidenceOwner : null
      });
      return NextResponse.json(record, { status: 201 });
    }

    if (actionType === 'UNLINK') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      if (!id) return NextResponse.json({ error: 'Evidence link ID is required.' }, { status: 400 });
      return NextResponse.json(await unlinkEvidence(id));
    }

    if (actionType === 'ARCHIVE') {
      const documentId = typeof body.documentId === 'string' ? body.documentId.trim() : '';
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!documentId || !reason) {
        return NextResponse.json({ error: 'Document and archive reason are required.' }, { status: 400 });
      }
      return NextResponse.json(await archiveEvidenceDocument(documentId, reason));
    }

    if (actionType === 'VERIFY') {
      const security = await getCurrentSecurityContext();
      const versionId = typeof body.versionId === 'string' ? body.versionId.trim() : '';
      const actorName = security.displayName;
      const actorRole = security.roles.join(',');
      if (!versionId) {
        return NextResponse.json({ error: 'Evidence version is required.' }, { status: 400 });
      }
      const result = await verifyEvidenceVersion(versionId, actorName, actorRole);
      return NextResponse.json(result, { status: result.matches ? 200 : 409 });
    }

    return NextResponse.json({ error: 'Unsupported evidence repository action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Register an institution before using the evidence repository.', 409],
      DOCUMENT_NOT_FOUND: ['Evidence document was not found for this institution.', 404],
      DOCUMENT_ARCHIVED: ['Archived evidence documents cannot receive new versions.', 409],
      VERSION_NOT_FOUND: ['Evidence version was not found.', 404],
      LINK_REQUIRED: ['Document, target type, and target record are required.', 400],
      INVALID_LINK_TYPE: ['Selected evidence-link target type is not supported.', 400],
      LINK_TARGET_NOT_FOUND: ['Selected target record was not found for this institution.', 404],
      LINK_CONFLICT: ['This evidence version is already linked to the selected target.', 409],
      LINK_NOT_FOUND: ['Evidence link was not found.', 404],
      WORKPAPER_SYNC_REQUIRED: ['Evidence type and evidence owner are required to synchronize a workpaper evidence index.', 400],
      GOVERNANCE_REQUIRED: ['Title, category, owner, sensitivity and retention class are required.', 400],
      INVALID_SENSITIVITY: ['Sensitivity must be Internal, Confidential, or Restricted.', 400],
      INVALID_RETENTION_CLASS: ['Select a supported retention class.', 400],
      CUSTOM_RETENTION_DATE_REQUIRED: ['A retention date is required for Custom retention.', 400],
      LEGAL_HOLD_ACTIVE: ['Evidence under legal hold cannot be archived.', 409],
      ARCHIVE_REASON_REQUIRED: ['Documented archive reason is required.', 400],
      FILE_CONTENT_MISSING: ['Evidence binary content is missing.', 409],
      FILE_SIZE_MISMATCH: ['Evidence binary content size does not match stored metadata.', 409],
      REVIEW_NOT_FOUND: ['Linked workpaper review was not found.', 404],
      REVIEW_LOCKED: ['Approved workpaper review is locked.', 409],
      EVIDENCE_CONFLICT: ['A matching evidence index entry already exists for this workpaper.', 409],
      PERIOD_CLOSED: ['The linked ICOFR period is closed and cannot accept evidence-index changes.', 409]
    };

    if (known[code]) {
      return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    }

    console.error('Evidence repository action failed:', error);
    return NextResponse.json({ error: 'Evidence repository action failed.' }, { status: 500 });
  }
}
