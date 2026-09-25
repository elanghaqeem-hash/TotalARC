import { buildIcofrScopingApprovalMemoPdf } from '@/lib/d1-icofr';

export const dynamic = 'force-dynamic';

function safeFilename(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-');
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scopeId = url.searchParams.get('scopeId')?.trim() || '';

    if (!scopeId) {
      return new Response(JSON.stringify({ error: 'scopeId wajib diisi.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    const result = await buildIcofrScopingApprovalMemoPdf(scopeId);

    return new Response(result.bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFilename(result.filename)}"`,
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';

    if (code === 'INSTITUTION_REQUIRED') {
      return new Response(
        JSON.stringify({
          error: 'Profil institusi harus tersedia sebelum memo persetujuan dapat dibuat.'
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        }
      );
    }

    if (code === 'INSTITUTION_ADDRESS_REQUIRED') {
      return new Response(
        JSON.stringify({
          error:
            'Alamat kantor institusi belum tersedia. Lengkapi Operational Address atau Registered Address pada profil institusi agar memo formal dapat mencantumkan kantor dan alamat bank.'
        }),
        {
          status: 422,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        }
      );
    }

    if (code === 'SCOPE_NOT_FOUND') {
      return new Response(
        JSON.stringify({ error: 'Data scope ICOFR yang dipilih tidak ditemukan.' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        }
      );
    }

    console.error('Failed to generate ICOFR scoping approval memo:', error);
    return new Response(
      JSON.stringify({
        error: 'Memo persetujuan scope ICOFR belum dapat dibuat. Silakan coba kembali.'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }
    );
  }
}
