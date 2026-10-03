import { NextResponse } from 'next/server';
import { listDeficiencies, saveDeficiency } from '@/lib/d1-icofr-domains';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await listDeficiencies();
    return NextResponse.json({ ...data, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to load ICOFR deficiencies:', error);
    return NextResponse.json({ error: 'Gagal memuat register defisiensi ICOFR.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const record = await saveDeficiency(body);
    return NextResponse.json(record, { status: body.id ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Daftarkan institusi terlebih dahulu sebelum mengelola defisiensi ICOFR.', 409],
      REQUIRED_FIELDS: ['Kode, judul, deskripsi, tingkat keparahan, dan penanggung jawab wajib diisi.', 400],
      CODE_CONFLICT: ['Kode defisiensi tersebut sudah terdaftar.', 409]
    };
    if (known[code]) return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    console.error('Failed to save ICOFR deficiency:', error);
    return NextResponse.json({ error: 'Gagal menyimpan defisiensi ICOFR.' }, { status: 500 });
  }
}
