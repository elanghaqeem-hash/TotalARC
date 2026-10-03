import { NextResponse } from 'next/server';
import {
  getCertificationData,
  saveEvidencePack,
  saveManagementAttestation,
  saveSubCertification,
  signManagementAttestation
} from '@/lib/d1-icofr-certification';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getCertificationData();
    return NextResponse.json({ ...data, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to load ICOFR certification data:', error);
    return NextResponse.json(
      { error: 'Gagal memuat data sertifikasi ICOFR dari database persisten.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType : '';

    if (actionType === 'SAVE_SUBCERTIFICATION') {
      const record = await saveSubCertification(body);
      return NextResponse.json(record, { status: body.id ? 200 : 201 });
    }

    if (actionType === 'SAVE_ATTESTATION') {
      const record = await saveManagementAttestation(body);
      return NextResponse.json(record, { status: body.id ? 200 : 201 });
    }

    if (actionType === 'SAVE_EVIDENCE_PACK') {
      const record = await saveEvidencePack(body);
      return NextResponse.json(record, { status: body.id ? 200 : 201 });
    }

    if (actionType === 'SIGN_ATTESTATION') {
      const attestationId = typeof body.attestationId === 'string' ? body.attestationId.trim() : '';
      const role = body.role === 'CEO' ? 'CEO' : body.role === 'CFO' ? 'CFO' : '';
      const signatoryName = typeof body.signatoryName === 'string' ? body.signatoryName.trim() : '';
      const declarationConfirmed = body.declarationConfirmed === true;

      if (!attestationId || !role || !signatoryName || !declarationConfirmed) {
        return NextResponse.json(
          { error: 'Atestasi, peran, nama penandatangan, dan konfirmasi deklarasi wajib diisi.' },
          { status: 400 }
        );
      }

      const result = await signManagementAttestation(
        attestationId,
        role as 'CFO' | 'CEO',
        signatoryName,
        declarationConfirmed
      );
      return NextResponse.json(result, { status: 201 });
    }

    return NextResponse.json({ error: 'Aksi sertifikasi ICOFR tidak didukung.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Daftarkan institusi terlebih dahulu sebelum menggunakan sertifikasi ICOFR.', 409],
      SUBCERT_REQUIRED: ['Scope, periode, subjek, nama/jabatan/email pemberi sertifikasi, dan deklarasi wajib diisi.', 400],
      INVALID_CERTIFICATION_TYPE: ['Jenis sertifikasi harus Triwulanan, Semesteran, Akhir Tahun, atau Ad Hoc.', 400],
      INVALID_SUBCERT_STATUS: ['Status alur kerja sub-sertifikasi tidak valid.', 400],
      INVALID_SUBCERT_CONCLUSION: ['Kesimpulan sub-sertifikasi tidak valid.', 400],
      INVALID_REVIEWER_DECISION: ['Keputusan reviewer tidak valid.', 400],
      INVALID_SUBJECT_TYPE: ['Subjek sub-sertifikasi harus berupa Entitas Hukum atau Unit Organisasi.', 400],
      SUBJECT_NOT_FOUND: ['Entitas hukum atau unit organisasi yang dipilih tidak ditemukan.', 400],
      SCOPE_NOT_FOUND: ['Scope ICOFR yang dipilih tidak ditemukan.', 400],
      CYCLE_NOT_FOUND: ['Siklus pengujian yang dipilih tidak terkait dengan scope yang dipilih.', 400],
      SUBCERT_CONFLICT: ['Sub-sertifikasi untuk subjek dan periode tersebut sudah ada.', 409],
      SUBCERT_DECLARATIONS_INCOMPLETE: ['Seluruh representasi wajib, tanggal sertifikasi, referensi evidence, dan kesimpulan harus dilengkapi sebelum pengajuan/persetujuan.', 400],
      SUBCERT_EXCEPTION_RATIONALE_REQUIRED: ['Dokumentasikan pengecualian/dasar apabila kesimpulan adalah Efektif dengan Pengecualian atau Tidak Efektif.', 400],
      SUBCERT_REVIEW_REQUIRED: ['Nama reviewer, jabatan reviewer, dan keputusan reviewer Disetujui wajib diisi sebelum persetujuan.', 400],
      ATTESTATION_REQUIRED: ['Scope, periode, ringkasan scope, representasi manajemen, dan penyusun wajib diisi.', 400],
      ATTESTATION_CONFLICT: ['Atestasi manajemen untuk scope dan periode tersebut sudah ada.', 409],
      OVERRIDE_REASON_REQUIRED: ['Alasan terdokumentasi wajib diisi ketika override kesiapan diaktifkan.', 400],
      EVIDENCE_REQUIRED: ['Atestasi, nama paket, periode, penyusun, dan referensi indeks evidence wajib diisi.', 400],
      ATTESTATION_NOT_FOUND: ['Atestasi manajemen yang dipilih tidak ditemukan.', 404],
      EVIDENCE_CONFLICT: ['Paket evidence dengan nama tersebut sudah ada untuk atestasi yang dipilih.', 409],
      SIGNOFF_REQUIRED: ['Nama penandatangan dan konfirmasi deklarasi eksplisit wajib diisi.', 400],
      CONCLUSION_REQUIRED: ['Catat kesimpulan manajemen secara keseluruhan sebelum persetujuan eksekutif.', 400],
      READINESS_NOT_MET: ['Pemeriksaan kesiapan belum seluruhnya terpenuhi. Selesaikan kesenjangan atau dokumentasikan override kesiapan yang telah disetujui sebelum persetujuan.', 409],
      PERIOD_CLOSED: ['Periode ICOFR ini telah ditutup. Data sertifikasi, atestasi, dan paket evidence dibekukan sampai pembukaan kembali sementara yang telah disetujui aktif.', 409]
    };

    if (known[code]) {
      return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    }

    console.error('Failed to save ICOFR certification data:', error);
    return NextResponse.json({ error: 'Gagal menyimpan data sertifikasi ICOFR.' }, { status: 500 });
  }
}
