import { NextResponse } from 'next/server';
import {
  loadEvidenceVersionBytes,
  recordEvidenceDownload
} from '@/lib/d1-evidence-repository';
import { getCurrentSecurityContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

async function sha256(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function safeHeaderFileName(name: string) {
  return name.replace(/[\r\n"]/g, '_');
}

export async function GET(request: Request) {
  try {
    const security = await getCurrentSecurityContext();
    const params = new URL(request.url).searchParams;
    const versionId = (params.get('versionId') || '').trim();
    if (!versionId) {
      return NextResponse.json({ error: 'Evidence version is required.' }, { status: 400 });
    }

    const loaded = await loadEvidenceVersionBytes(versionId);
    const actual = await sha256(loaded.bytes);
    const expected = String(loaded.version.sha256 || '');
    if (actual !== expected) {
      return NextResponse.json(
        {
          error: 'Stored evidence failed SHA-256 integrity verification. Download was blocked.',
          expectedSha256: expected,
          actualSha256: actual
        },
        { status: 409 }
      );
    }

    await recordEvidenceDownload(
      String(loaded.version.documentId),
      versionId,
      security.displayName,
      security.roles.join(','),
      'Download served only after authenticated access and SHA-256 integrity verification.'
    );

    return new NextResponse(loaded.bytes, {
      status: 200,
      headers: {
        'Content-Type': String(loaded.version.mimeType || 'application/octet-stream'),
        'Content-Length': String(loaded.bytes.length),
        'Content-Disposition':
          'attachment; filename="' + safeHeaderFileName(String(loaded.version.fileName || 'evidence-file')) + '"',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store, max-age=0',
        'X-TotalARC-Evidence-SHA256': expected
      }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Register an institution before downloading evidence.', 409],
      VERSION_NOT_FOUND: ['Evidence version was not found.', 404],
      FILE_CONTENT_MISSING: ['Evidence binary content is missing.', 409],
      FILE_SIZE_MISMATCH: ['Evidence binary content size does not match stored metadata.', 409]
    };
    if (known[code]) {
      return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    }

    console.error('Evidence download failed:', error);
    return NextResponse.json({ error: 'Evidence download failed.' }, { status: 500 });
  }
}
