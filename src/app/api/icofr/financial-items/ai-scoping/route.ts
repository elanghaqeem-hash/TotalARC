import { NextResponse } from 'next/server';
import { runAiGateway } from '@/lib/ai/gateway';
import { guardAiMultipart } from '@/lib/ai/http-security';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import { getIcofrScopingData } from '@/lib/d1-icofr';
import {
  getFinancialScopingAnalysis,
  listFinancialItems,
  listFinancialScopingAnalyses,
  saveFinancialItem,
  saveFinancialScopingAnalysis,
  setFinancialScopingAnalysisStatus,
  type FinancialScopingAnalysisResult,
  type FinancialScopingCandidate
} from '@/lib/d1-icofr-domains';
import { uploadEvidenceVersion, linkEvidence } from '@/lib/d1-evidence-repository';
import { extractProcessSupportingDocument } from '@/lib/process-document-extraction';

export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['pdf', 'xlsx', 'docx', 'txt', 'jpg', 'jpeg', 'png']);

function extOf(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function clean(value: unknown, max = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function nullable(value: unknown, max = 1000) {
  const result = clean(value, max);
  if (!result || /^(null|n\/a|not available|not provided|tidak tersedia)$/i.test(result)) {
    return null;
  }
  return result;
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function bool(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function stringArray(value: unknown, maxItems = 12) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => clean(item, 300))
    .filter(Boolean)
    .slice(0, maxItems);
}

function parseJsonObject(value: string): Record<string, unknown> {
  const trimmed = value.trim().replace(/^\`\`\`(?:json)?/i, '').replace(/\`\`\`$/i, '').trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error('AI_FINANCIAL_SCOPING_INVALID');
  }
}

function validMultiplier(value: unknown) {
  const next = numberValue(value);
  if (next === null || next <= 0 || next > 1_000_000_000_000) return null;
  return next;
}

function currencyMatches(a: string | null, b: string) {
  if (!a) return true;
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

function normalizeAiResult(
  parsed: Record<string, unknown>,
  input: {
    pmAmount: number;
    currency: string;
    fileName: string;
  }
): FinancialScopingAnalysisResult {
  const rawCandidates = Array.isArray(parsed.candidates)
    ? parsed.candidates.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>
    : [];

  if (!rawCandidates.length) throw new Error('AI_FINANCIAL_SCOPING_NO_ITEMS');

  const documentCurrency =
    nullable(parsed.documentCurrency, 10)?.toUpperCase() || input.currency.toUpperCase();
  const documentUnitMultiplier = validMultiplier(parsed.documentUnitMultiplier);
  const usedCodes = new Set<string>();

  const candidates: FinancialScopingCandidate[] = rawCandidates.slice(0, 250).map((item, index) => {
    const recordType = item.recordType === 'Disclosure' ? 'Disclosure' : 'Account';
    const name = clean(item.name, 260);
    if (!name) throw new Error('AI_FINANCIAL_SCOPING_INVALID_ITEM');

    const sourceCode = nullable(item.itemCode, 80)?.toUpperCase() || null;
    let itemCode = sourceCode || 'AI-' + crypto.randomUUID().slice(0, 8).toUpperCase();
    while (usedCodes.has(itemCode)) {
      itemCode = itemCode + '-' + String(index + 1);
    }
    usedCodes.add(itemCode);

    const documentAmount = numberValue(item.documentAmount);
    const itemMultiplier = validMultiplier(item.unitMultiplier) || documentUnitMultiplier || 1;
    const normalizedAmount =
      documentAmount === null ? null : documentAmount * itemMultiplier;
    const itemCurrency =
      nullable(item.currency, 10)?.toUpperCase() || documentCurrency || input.currency.toUpperCase();
    const comparable = normalizedAmount !== null && currencyMatches(itemCurrency, input.currency);
    const quantitativeSignificant =
      comparable && Math.abs(normalizedAmount as number) >= input.pmAmount;
    const qualitativeSignificant = bool(item.qualitativeSignificant);
    const recommendedSignificant = quantitativeSignificant || qualitativeSignificant;
    const pmRatio =
      comparable && input.pmAmount > 0
        ? Math.abs(normalizedAmount as number) / input.pmAmount
        : null;

    let significanceBasis: FinancialScopingCandidate['significanceBasis'] = 'NOT_SIGNIFICANT';
    if (!comparable) significanceBasis = 'REVIEW_REQUIRED';
    else if (quantitativeSignificant && qualitativeSignificant) significanceBasis = 'PM_AND_QUALITATIVE';
    else if (quantitativeSignificant) significanceBasis = 'PM';
    else if (qualitativeSignificant) significanceBasis = 'QUALITATIVE';

    const qualitativeFactors = stringArray(item.qualitativeFactors, 10);
    const sourceReference = nullable(item.sourceReference, 300);
    const confidenceRaw = clean(item.confidence, 20);
    const confidence: FinancialScopingCandidate['confidence'] =
      confidenceRaw === 'High' || confidenceRaw === 'Low' ? confidenceRaw : 'Medium';

    const rationaleParts: string[] = [];
    if (quantitativeSignificant) {
      rationaleParts.push(
        'Nilai absolut akun setara atau melebihi Performance Materiality (PM).'
      );
    } else if (comparable && normalizedAmount !== null) {
      rationaleParts.push(
        'Nilai absolut akun berada di bawah Performance Materiality (PM).'
      );
    } else {
      rationaleParts.push(
        'Perbandingan kuantitatif dengan PM memerlukan validasi mata uang atau nilai akun.'
      );
    }
    if (qualitativeSignificant) {
      rationaleParts.push(
        'Dokumen juga menunjukkan faktor kualitatif yang memerlukan pertimbangan signifikansi.'
      );
    }
    const aiRationale = nullable(item.rationale, 700);
    if (aiRationale) rationaleParts.push(aiRationale);

    return {
      recordType,
      itemCode,
      codeSource: sourceCode ? 'DOCUMENT' : 'TOTAL_ARC_GENERATED',
      name,
      financialStatement: nullable(item.financialStatement, 180),
      documentAmount,
      unitMultiplier: itemMultiplier,
      balanceAmount: normalizedAmount,
      currency: itemCurrency,
      sourceReference,
      quantitativeSignificant,
      qualitativeSignificant,
      recommendedSignificant,
      pmRatio,
      significanceBasis,
      assertions: nullable(item.assertions, 700),
      riskFactors: nullable(item.riskFactors, 1000),
      processReference: nullable(item.processReference, 300),
      owner: nullable(item.owner, 300),
      rationale: rationaleParts.join(' '),
      confidence,
      qualitativeFactors
    };
  });

  return {
    documentTitle: nullable(parsed.documentTitle, 300) || input.fileName,
    reportingPeriod: nullable(parsed.reportingPeriod, 120),
    documentCurrency,
    documentUnit: nullable(parsed.documentUnit, 120),
    documentUnitMultiplier,
    sourceSummary: nullable(parsed.sourceSummary, 1200),
    gaps: stringArray(parsed.gaps, 20),
    candidates
  };
}

function noStore<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      ...(init?.headers || {})
    }
  });
}

async function access(request: Request) {
  const context = await resolveInstitutionAccess(request);
  if (!context?.institution) return null;
  return context;
}

async function activeScope() {
  const data = await getIcofrScopingData();
  const scopes = Array.isArray(data.scopes) ? data.scopes : [];
  const scope = scopes.find(
    (item: Record<string, unknown>) =>
      Number(item.performanceMaterialityAmount || 0) > 0 &&
      String(item.status || '').toLowerCase() !== 'closed'
  ) || scopes.find(
    (item: Record<string, unknown>) => Number(item.performanceMaterialityAmount || 0) > 0
  ) || null;

  return { data, scope };
}

export async function GET(request: Request) {
  try {
    const context = await access(request);
    if (!context) return noStore({ error: 'Institusi aktif diperlukan.' }, { status: 409 });

    const { data, scope } = await activeScope();
    if (data.institution && String(data.institution.id) !== context.institution!.id) {
      return noStore({ error: 'Konteks institusi tidak konsisten.' }, { status: 409 });
    }

    const analyses = await listFinancialScopingAnalyses(context.institution!.id);
    return noStore({
      scope: scope
        ? {
            id: scope.id,
            scopeName: scope.scopeName,
            fiscalYear: scope.fiscalYear,
            reportingPeriod: scope.reportingPeriod,
            currency: scope.currency,
            performanceMaterialityAmount: scope.performanceMaterialityAmount,
            overallMaterialityAmount: scope.overallMaterialityAmount,
            status: scope.status
          }
        : null,
      analyses,
      acceptedExtensions: Array.from(ALLOWED_EXTENSIONS),
      maxFileBytes: MAX_FILE_BYTES
    });
  } catch (error) {
    console.error('Gagal memuat alat penetapan akun signifikan:', error);
    return noStore(
      { error: 'Gagal memuat konfigurasi PM dan riwayat analisis akun signifikan.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  let storedEvidence: Record<string, unknown> | null = null;

  try {
    const context = await access(request);
    if (!context) return noStore({ error: 'Institusi aktif diperlukan.' }, { status: 409 });

    const guarded = await guardAiMultipart(request, 'AI_ANALYZE_RATE_LIMIT');
    if (guarded) return guarded;

    const { data, scope } = await activeScope();
    if (!scope) {
      return noStore(
        {
          error:
            'Performance Materiality (PM) belum ditetapkan. Tetapkan PM terlebih dahulu pada menu Ruang Lingkup & Materialitas ICOFR.'
        },
        { status: 409 }
      );
    }
    if (data.institution && String(data.institution.id) !== context.institution!.id) {
      return noStore({ error: 'Konteks institusi tidak konsisten.' }, { status: 409 });
    }

    const pmAmount = Number(scope.performanceMaterialityAmount || 0);
    const currency = String(scope.currency || '').trim().toUpperCase();
    if (!Number.isFinite(pmAmount) || pmAmount <= 0 || !currency) {
      return noStore(
        { error: 'Nilai PM atau mata uang pada ruang lingkup ICOFR belum valid.' },
        { status: 409 }
      );
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return noStore({ error: 'Dokumen laporan keuangan wajib diunggah.' }, { status: 400 });
    }

    const extension = extOf(file.name);
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return noStore(
        { error: 'Format yang didukung: PDF, XLSX, DOCX, TXT, JPG/JPEG, dan PNG.' },
        { status: 415 }
      );
    }
    if (file.size <= 0) {
      return noStore({ error: 'Dokumen laporan keuangan kosong.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return noStore({ error: 'Ukuran dokumen melebihi batas 8 MB.' }, { status: 413 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const actor = context.profile.name || context.profile.email;
    const institutionId = context.institution!.id;

    const uploaded = await uploadEvidenceVersion({
      institutionId,
      documentId: null,
      title: 'ICOFR Significant Account Scoping – ' + file.name,
      description:
        'Dokumen laporan keuangan untuk penetapan akun signifikan berbasis PM dengan bantuan AI Total ARC.',
      category: 'ICOFR Financial Statement Scoping',
      sensitivity: 'Confidential',
      retentionClass: '7 Years',
      retentionUntil: null,
      legalHold: false,
      ownerName: actor,
      sourceSystem: 'Total ARC ICOFR',
      uploadedBy: actor,
      versionNote: null,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      bytes
    });

    storedEvidence = uploaded as unknown as Record<string, unknown>;

    await linkEvidence({
      institutionId,
      documentId: uploaded.documentId,
      versionId: uploaded.versionId,
      entityType: 'ICOFR_SCOPE',
      entityId: String(scope.id),
      relationship: 'SUPPORTS',
      notes:
        'Sumber laporan keuangan untuk penetapan akun signifikan berbasis Performance Materiality.',
      evidenceOwner: actor
    });

    const extracted = await extractProcessSupportingDocument({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      bytes
    });

    const systemPrompt = [
      'Anda adalah AI Total ARC yang membantu proses ICOFR Financial Statement Scoping.',
      'Tugas Anda hanya mengekstrak akun dan disclosure dari dokumen laporan keuangan dan mengidentifikasi faktor kualitatif yang benar-benar didukung dokumen.',
      'Jangan menetapkan keputusan final. Keputusan final akun signifikan tetap harus divalidasi pengguna.',
      'Gunakan hanya informasi yang terdapat dalam dokumen. Jangan mengarang kode akun, nilai, mata uang, unit, owner, proses, asersi, atau faktor risiko.',
      'Jika kode akun tidak tersedia, gunakan null. Total ARC akan membuat kode internal yang jelas sebagai kode sistem.',
      'Untuk nilai, kembalikan documentAmount persis sebagai angka yang disajikan dan unitMultiplier sesuai unit dokumen (contoh: 1000 untuk ribuan, 1000000 untuk jutaan).',
      'Jangan membandingkan sendiri angka dengan PM; Total ARC akan menghitung perbandingan secara deterministik di backend.',
      'qualitativeSignificant boleh true hanya jika dokumen mendukung indikator seperti estimasi/judgement signifikan, pihak berelasi, transaksi tidak biasa, sensitivitas regulasi, potensi fraud, kompleksitas, atau pengungkapan penting.',
      'Jika bukti kualitatif tidak jelas, set false dan jelaskan gap.',
      'Pertahankan nama akun sesuai dokumen dan cantumkan sourceReference berupa halaman/catatan/baris bila tersedia.',
      'Kembalikan JSON saja dengan struktur:',
      '{"documentTitle":string|null,"reportingPeriod":string|null,"documentCurrency":string|null,"documentUnit":string|null,"documentUnitMultiplier":number|null,"sourceSummary":string|null,"gaps":[string],"candidates":[{"recordType":"Account|Disclosure","itemCode":string|null,"name":string,"financialStatement":string|null,"documentAmount":number|null,"unitMultiplier":number|null,"currency":string|null,"sourceReference":string|null,"qualitativeSignificant":boolean,"qualitativeFactors":[string],"assertions":string|null,"riskFactors":string|null,"processReference":string|null,"owner":string|null,"rationale":string|null,"confidence":"High|Medium|Low"}]}.'
    ].join(' ');

    const result = await runAiGateway({
      task: 'classification',
      sensitivity: 'confidential',
      systemPrompt,
      prompt:
        'KONTEKS MATERIALITAS ICOFR\n' +
        JSON.stringify({
          institution: context.institution!.name,
          scopeId: scope.id,
          scopeName: scope.scopeName,
          fiscalYear: scope.fiscalYear,
          reportingPeriod: scope.reportingPeriod,
          scopeCurrency: currency,
          performanceMaterialityAmount: pmAmount,
          overallMaterialityAmount: scope.overallMaterialityAmount
        }) +
        '\n\nTEKS DOKUMEN LAPORAN KEUANGAN\n' +
        extracted.text,
      temperature: 0.05,
      maxOutputTokens: 7000,
      requireJson: true
    });

    const parsed = parseJsonObject(result.text);
    const normalized = normalizeAiResult(parsed, {
      pmAmount,
      currency,
      fileName: file.name
    });

    const analysis = await saveFinancialScopingAnalysis({
      institutionId,
      scopeId: String(scope.id),
      evidenceDocumentId: uploaded.documentId,
      evidenceVersionId: uploaded.versionId,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      extractionMethod: extracted.method,
      sourceTextTruncated: extracted.truncated,
      performanceMaterialityAmount: pmAmount,
      currency,
      result: normalized,
      aiProvider: result.provider,
      aiModel: result.model,
      aiRequestId: result.requestId,
      createdBy: actor
    });

    await linkEvidence({
      institutionId,
      documentId: uploaded.documentId,
      versionId: uploaded.versionId,
      entityType: 'ICOFR_FINANCIAL_SCOPING_ANALYSIS',
      entityId: analysis.id,
      relationship: 'SOURCE_FOR',
      notes: 'Dokumen sumber analisis akun signifikan yang menunggu validasi pengguna.',
      evidenceOwner: actor
    });

    return noStore(
      {
        analysis,
        pm: {
          amount: pmAmount,
          currency,
          scopeId: scope.id,
          scopeName: scope.scopeName
        },
        evidence: {
          documentId: uploaded.documentId,
          versionId: uploaded.versionId,
          fileName: file.name
        },
        message:
          'Analisis selesai. Tinjau rekomendasi akun signifikan sebelum menerapkannya ke register.'
      },
      { status: 201 }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      DOCUMENT_CONVERTER_UNAVAILABLE: ['Konversi dokumen sementara tidak tersedia.', 503],
      DOCUMENT_CONVERSION_FAILED: ['Dokumen tidak dapat dikonversi menjadi teks yang dapat dianalisis.', 422],
      DOCUMENT_TEXT_EMPTY: ['Tidak ada informasi laporan keuangan yang dapat dibaca dari dokumen.', 422],
      AI_FINANCIAL_SCOPING_INVALID: ['AI mengembalikan struktur analisis yang tidak valid.', 502],
      AI_FINANCIAL_SCOPING_NO_ITEMS: ['Tidak ada akun atau disclosure yang dapat diidentifikasi secara defensible dari dokumen.', 422],
      AI_FINANCIAL_SCOPING_INVALID_ITEM: ['AI mengembalikan kandidat akun yang tidak valid.', 502],
      FILE_TYPE_NOT_ALLOWED: ['Tipe dokumen tidak diizinkan oleh Repositori Bukti.', 415],
      FILE_TOO_LARGE: ['Ukuran dokumen melebihi batas 8 MB.', 413]
    };

    if (known[code]) {
      return noStore(
        {
          error: known[code][0],
          evidenceStored: Boolean(storedEvidence)
        },
        { status: known[code][1] }
      );
    }

    console.error('Analisis akun signifikan AI gagal:', error);
    return noStore(
      {
        error: storedEvidence
          ? 'Dokumen sudah tersimpan aman, tetapi analisis AI belum dapat diselesaikan. Silakan coba kembali.'
          : 'Dokumen belum dapat disimpan dan dianalisis.',
        evidenceStored: Boolean(storedEvidence)
      },
      { status: 503 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await access(request);
    if (!context) return noStore({ error: 'Institusi aktif diperlukan.' }, { status: 409 });

    const body = (await request.json()) as Record<string, unknown>;
    const actionType = clean(body.actionType, 40);
    const analysisId = clean(body.analysisId, 120);
    if (!analysisId) {
      return noStore({ error: 'ID analisis diperlukan.' }, { status: 400 });
    }

    const actor = context.profile.name || context.profile.email;
    if (actionType === 'REJECT') {
      const status = await setFinancialScopingAnalysisStatus({
        analysisId,
        institutionId: context.institution!.id,
        status: 'REJECTED',
        actor
      });
      return noStore({
        status,
        message: 'Draf analisis ditolak dan tidak diterapkan ke register akun.'
      });
    }

    if (actionType !== 'APPLY') {
      return noStore(
        { error: 'actionType harus APPLY atau REJECT.' },
        { status: 400 }
      );
    }

    const selectedCodes = Array.isArray(body.selectedCodes)
      ? body.selectedCodes.map(value => clean(value, 100)).filter(Boolean)
      : [];
    if (!selectedCodes.length) {
      return noStore(
        { error: 'Pilih minimal satu akun/disclosure sebelum menerapkan hasil analisis.' },
        { status: 400 }
      );
    }

    const analysis = await getFinancialScopingAnalysis(
      analysisId,
      context.institution!.id
    );
    if (String(analysis.status || '') !== 'PENDING_USER_VALIDATION') {
      return noStore(
        { error: 'Draf analisis ini sudah tidak menunggu validasi pengguna.' },
        { status: 409 }
      );
    }

    const candidates = analysis.result.candidates || [];
    const selected = candidates.filter(item => selectedCodes.includes(item.itemCode));
    if (!selected.length) {
      return noStore({ error: 'Kandidat terpilih tidak ditemukan pada analisis tersimpan.' }, { status: 400 });
    }

    const current = await listFinancialItems(context.institution!.id);
    const existingByKey = new Map(
      current.records.map(item => [
        String(item.recordType) + '::' + String(item.itemCode).toUpperCase(),
        item
      ])
    );

    const applied = [];
    for (const candidate of selected) {
      const key = candidate.recordType + '::' + candidate.itemCode.toUpperCase();
      const existing = existingByKey.get(key) as Record<string, unknown> | undefined;
      const record = await saveFinancialItem(
        {
          id: existing?.id,
          recordType: candidate.recordType,
          itemCode: candidate.itemCode,
          name: candidate.name,
          financialStatement: candidate.financialStatement,
          balanceAmount: candidate.balanceAmount,
          currency: candidate.currency || analysis.currency,
          significant: true,
          scopingRationale:
            candidate.rationale +
            ' PM yang digunakan: ' +
            Number(analysis.performanceMaterialityAmount).toLocaleString('id-ID') +
            ' ' +
            String(analysis.currency || '') +
            '. Sumber: ' +
            String(analysis.fileName || 'dokumen laporan keuangan') +
            (candidate.sourceReference ? ' (' + candidate.sourceReference + ')' : '') +
            '. Hasil telah dipilih pengguna dari draf analisis AI Total ARC.',
          assertions: candidate.assertions,
          riskFactors:
            [
              candidate.riskFactors,
              candidate.qualitativeFactors?.length
                ? 'Faktor kualitatif: ' + candidate.qualitativeFactors.join('; ')
                : null
            ].filter(Boolean).join(' | ') || null,
          processReference: candidate.processReference,
          owner: candidate.owner,
          status: 'Draft'
        },
        context.institution!.id
      );
      applied.push(record);
    }

    await setFinancialScopingAnalysisStatus({
      analysisId,
      institutionId: context.institution!.id,
      status: 'APPLIED',
      actor,
      appliedCount: applied.length
    });

    return noStore({
      applied,
      message:
        applied.length +
        ' akun/disclosure signifikan diterapkan sebagai Draf dan tetap memerlukan review/approval sesuai tata kelola ICOFR.'
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      FINANCIAL_SCOPING_ANALYSIS_NOT_FOUND: ['Draf analisis tidak ditemukan.', 404],
      FINANCIAL_SCOPING_ANALYSIS_INVALID: ['Draf analisis tersimpan tidak valid.', 409],
      FINANCIAL_SCOPING_ANALYSIS_NOT_PENDING: ['Draf analisis sudah tidak menunggu validasi.', 409],
      CODE_CONFLICT: ['Kode akun/disclosure bertabrakan dengan data yang sudah ada.', 409],
      REQUIRED_FIELDS: ['Data akun hasil analisis belum lengkap untuk diterapkan.', 400],
      INVALID_AMOUNT: ['Nilai akun hasil analisis tidak valid.', 400]
    };
    if (known[code]) {
      return noStore({ error: known[code][0] }, { status: known[code][1] });
    }

    console.error('Gagal menerapkan analisis akun signifikan:', error);
    return noStore(
      { error: 'Hasil analisis belum dapat diterapkan ke register akun signifikan.' },
      { status: 500 }
    );
  }
}
