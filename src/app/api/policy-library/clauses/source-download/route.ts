import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import { getSourceBinary } from '@/lib/d1-source-library';

export const dynamic = 'force-dynamic';

const READ_ROLES = new Set([
  'SystemAdmin',
  'Admin',
  'ComplianceOfficer',
  'RiskManager',
  'InternalAuditor',
  'Executive',
  'ReadOnlyAuditor'
]);

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function safeFileName(value: string) {
  return value.replace(/[\r\n"]/g, '').replace(/[\\/:*?<>|]/g, '_').slice(0, 180) || 'regulation-source';
}

export async function GET(request: Request) {
  const context = await resolveInstitutionAccess(request);
  if (!context?.institution || !READ_ROLES.has(context.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const documentId = String(url.searchParams.get('documentId') || '').trim();
    if (!documentId) {
      return NextResponse.json({ error: 'Document ID wajib diisi.' }, { status: 400 });
    }

    const result = await getSourceBinary(documentId, context.institution.id);
    if (!result.chunks.length || Number(result.document.rawSizeBytes || 0) <= 0) {
      return NextResponse.json(
        { error: 'Binary dokumen sumber tidak tersedia.' },
        { status: 404 }
      );
    }

    const total = result.chunks.reduce(
      (sum, item) => sum + decodeBase64(item.dataBase64).byteLength,
      0
    );
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of result.chunks) {
      const decoded = decodeBase64(chunk.dataBase64);
      bytes.set(decoded, offset);
      offset += decoded.byteLength;
    }

    return new Response(bytes, {
      headers: {
        'Content-Type': result.document.mimeType || 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="' + safeFileName(result.document.title) + '"',
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'SOURCE_LIBRARY_DOCUMENT_NOT_FOUND') {
      return NextResponse.json({ error: 'Dokumen sumber tidak ditemukan.' }, { status: 404 });
    }
    console.error('Regulatory source download failed:', error);
    return NextResponse.json(
      { error: 'Dokumen sumber belum dapat diunduh.' },
      { status: 500 }
    );
  }
}
