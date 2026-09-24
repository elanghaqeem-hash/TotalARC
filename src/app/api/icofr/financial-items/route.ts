import { NextResponse } from 'next/server';
import { listFinancialItems, saveFinancialItem } from '@/lib/d1-icofr-domains';
import { resolveInstitutionAccess } from '@/lib/institution-context';

export const dynamic = 'force-dynamic';

async function access(request: Request) {
  const context = await resolveInstitutionAccess(request);
  if (!context?.institution) return null;
  return context;
}

export async function GET(request: Request) {
  try {
    const context = await access(request);
    if (!context) {
      return NextResponse.json({ error: 'Institusi aktif diperlukan.' }, { status: 409 });
    }

    const data = await listFinancialItems(context.institution!.id);
    return NextResponse.json({ ...data, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Gagal memuat akun dan disclosure ICOFR:', error);
    return NextResponse.json(
      { error: 'Gagal memuat register akun dan disclosure.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const context = await access(request);
    if (!context) {
      return NextResponse.json({ error: 'Institusi aktif diperlukan.' }, { status: 409 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const record = await saveFinancialItem(body, context.institution!.id);
    return NextResponse.json(record, { status: body.id ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Daftarkan institusi sebelum mengelola akun laporan keuangan ICOFR.', 409],
      INVALID_RECORD_TYPE: ['Jenis data harus Akun atau Disclosure.', 400],
      REQUIRED_FIELDS: ['Kode dan nama akun/disclosure wajib diisi.', 400],
      INVALID_AMOUNT: ['Nilai saldo harus berupa angka.', 400],
      CODE_CONFLICT: ['Kode akun/disclosure sudah digunakan.', 409]
    };
    if (known[code]) {
      return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    }

    console.error('Gagal menyimpan akun/disclosure ICOFR:', error);
    return NextResponse.json(
      { error: 'Gagal menyimpan akun/disclosure.' },
      { status: 500 }
    );
  }
}
