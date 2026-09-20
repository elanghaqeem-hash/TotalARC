import {
  buildBoardAuditCommitteePdf,
  buildExternalAuditorExcel,
  getPeriodSnapshotBundle
} from '@/lib/d1-icofr-period-close';

export const dynamic = 'force-dynamic';

function safeFilename(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-');
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const closeId = url.searchParams.get('closeId')?.trim() || '';
    const format = url.searchParams.get('format')?.trim() || 'snapshot-json';
    const versionRaw = url.searchParams.get('version');
    const version = versionRaw ? Number(versionRaw) : null;

    if (!closeId) {
      return new Response(JSON.stringify({ error: 'closeId is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (version !== null && (!Number.isInteger(version) || version <= 0)) {
      return new Response(JSON.stringify({ error: 'version must be a positive integer.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (format === 'board-pdf') {
      const result = await buildBoardAuditCommitteePdf(closeId, version);
      return new Response(result.bytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${safeFilename(result.filename)}"`,
          'Cache-Control': 'no-store'
        }
      });
    }

    if (format === 'evidence-excel') {
      const result = await buildExternalAuditorExcel(closeId, version);
      return new Response(result.content, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
          'Content-Disposition': `attachment; filename="${safeFilename(result.filename)}"`,
          'Cache-Control': 'no-store'
        }
      });
    }

    const bundle = await getPeriodSnapshotBundle(closeId, version);
    return new Response(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="TotalARC-ICOFR-Snapshot-${safeFilename(String(bundle.close.period))}-v${bundle.version}.json"`,
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status = code === 'CLOSE_NOT_FOUND' || code === 'SNAPSHOT_NOT_FOUND' ? 404 : 500;
    return new Response(
      JSON.stringify({
        error:
          code === 'CLOSE_NOT_FOUND'
            ? 'ICOFR period close record was not found.'
            : code === 'SNAPSHOT_NOT_FOUND'
              ? 'Requested immutable snapshot version was not found.'
              : 'Failed to generate ICOFR period-close export.'
      }),
      {
        status,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
