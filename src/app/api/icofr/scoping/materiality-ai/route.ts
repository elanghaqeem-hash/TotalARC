import { NextResponse } from 'next/server';
import { runAiGateway } from '@/lib/ai/gateway';
import { guardAiPost } from '@/lib/ai/http-security';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import { getIcofrScopingData } from '@/lib/d1-icofr';
import { listFinancialItems } from '@/lib/d1-icofr-domains';

export const dynamic = 'force-dynamic';

type BenchmarkType =
  | 'Profit Before Tax'
  | 'Average PBT 3 Years'
  | 'Revenue'
  | 'Total Assets'
  | 'Equity'
  | 'Custom';

type RiskLevel = 'Low' | 'Medium' | 'High' | 'Needs Review';

const METHODOLOGY: Record<
  Exclude<BenchmarkType, 'Custom'>,
  { min: number; max: number; label: string; appropriateWhen: string }
> = {
  'Profit Before Tax': {
    min: 5,
    max: 5,
    label: 'Laba sebelum pajak (PBT)',
    appropriateWhen: 'Laba relatif stabil dan menjadi fokus utama pengguna laporan.'
  },
  'Average PBT 3 Years': {
    min: 5,
    max: 5,
    label: 'Rata-rata PBT 3 tahun',
    appropriateWhen: 'Laba tahunan berfluktuasi dan rata-rata multi-tahun lebih representatif.'
  },
  Revenue: {
    min: 0.5,
    max: 1,
    label: 'Pendapatan (bunga + fee)',
    appropriateWhen: 'Laba tipis/negatif atau pendapatan lebih relevan bagi pengguna.'
  },
  'Total Assets': {
    min: 0.5,
    max: 1,
    label: 'Total aset',
    appropriateWhen: 'Laba volatil dan fokus pengguna lebih kuat pada posisi neraca.'
  },
  Equity: {
    min: 1,
    max: 2,
    label: 'Ekuitas',
    appropriateWhen: 'Fokus utama pada permodalan/solvabilitas.'
  }
};

const PM_RANGES: Record<Exclude<RiskLevel, 'Needs Review'>, { min: number; max: number }> = {
  Low: { min: 75, max: 75 },
  Medium: { min: 60, max: 65 },
  High: { min: 50, max: 50 }
};

function noStore<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      ...(init?.headers || {})
    }
  });
}

function clean(value: unknown, max = 1200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function parseJsonObject(value: string): Record<string, unknown> {
  const trimmed = value.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error('AI_MATERIALITY_INVALID');
  }
}

function isBenchmarkType(value: string): value is BenchmarkType {
  return [
    'Profit Before Tax',
    'Average PBT 3 Years',
    'Revenue',
    'Total Assets',
    'Equity',
    'Custom'
  ].includes(value);
}

function isRiskLevel(value: string): value is RiskLevel {
  return ['Low', 'Medium', 'High', 'Needs Review'].includes(value);
}

function normalizeName(value: unknown) {
  return clean(value, 260).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function financialBenchmarkCandidates(records: Array<Record<string, unknown>>) {
  const candidates: Array<{
    benchmarkType: BenchmarkType;
    amount: number;
    sourceName: string;
    sourceCode: string | null;
  }> = [];

  for (const row of records) {
    const amount = numberValue(row.balanceAmount);
    if (amount === null || amount <= 0) continue;

    const name = normalizeName(row.name);
    let benchmarkType: BenchmarkType | null = null;

    if (
      /(profit before tax|laba sebelum pajak|laba sebelum beban pajak|laba.*sebelum.*pajak)/i.test(name)
    ) {
      benchmarkType = 'Profit Before Tax';
    } else if (/(total assets|total aset|jumlah aset)/i.test(name)) {
      benchmarkType = 'Total Assets';
    } else if (/(total equity|total ekuitas|jumlah ekuitas)/i.test(name)) {
      benchmarkType = 'Equity';
    } else if (
      /(total revenue|total pendapatan|pendapatan bunga.*fee|pendapatan operasional)/i.test(name)
    ) {
      benchmarkType = 'Revenue';
    }

    if (!benchmarkType) continue;

    candidates.push({
      benchmarkType,
      amount,
      sourceName: clean(row.name, 260),
      sourceCode: clean(row.itemCode, 100) || null
    });
  }

  const unique = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.benchmarkType)) unique.set(candidate.benchmarkType, candidate);
  }
  return Array.from(unique.values());
}

function validatePercent(value: number | null, min: number, max: number) {
  return value !== null && value >= min && value <= max;
}

export async function POST(request: Request) {
  try {
    const context = await resolveInstitutionAccess(request);
    if (!context?.institution) {
      return noStore({ error: 'Institusi aktif wajib dipilih.' }, { status: 409 });
    }

    const guarded = await guardAiPost(request, 'AI_ANALYZE_RATE_LIMIT');
    if (!guarded.ok) return guarded.response;

    const body = guarded.body as Record<string, unknown>;
    const benchmarkTypeRaw = clean(body.benchmarkType, 80);
    const benchmarkAmount = numberValue(body.benchmarkAmount);
    const riskLevelPreferenceRaw = clean(body.riskLevelPreference, 40);
    const currentOmPercent = numberValue(body.overallMaterialityPercent);
    const scopeName = clean(body.scopeName, 300);
    const fiscalYear = numberValue(body.fiscalYear);
    const reportingPeriod = clean(body.reportingPeriod, 100);
    const consolidationBasis = clean(body.consolidationBasis, 120);
    const accountingFramework = clean(body.accountingFramework, 240);
    const currentNotes = clean(body.notes, 2500);

    const benchmarkType = isBenchmarkType(benchmarkTypeRaw) ? benchmarkTypeRaw : null;
    const riskLevelPreference = isRiskLevel(riskLevelPreferenceRaw)
      ? riskLevelPreferenceRaw
      : null;

    const [financialItems, scopingData] = await Promise.all([
      listFinancialItems(context.institution.id),
      getIcofrScopingData()
    ]);

    if (
      financialItems.institution &&
      String(financialItems.institution.id) !== context.institution.id
    ) {
      return noStore({ error: 'Konteks data keuangan tidak konsisten dengan institusi aktif.' }, { status: 409 });
    }
    if (
      scopingData.institution &&
      String(scopingData.institution.id) !== context.institution.id
    ) {
      return noStore({ error: 'Konteks materialitas tidak konsisten dengan institusi aktif.' }, { status: 409 });
    }

    const financialCandidates = financialBenchmarkCandidates(
      (financialItems.records || []) as Array<Record<string, unknown>>
    );

    const manualCandidate =
      benchmarkType && benchmarkAmount !== null && benchmarkAmount > 0
        ? {
            benchmarkType,
            amount: benchmarkAmount,
            sourceName: 'Input pengguna pada form Materialitas',
            sourceCode: null
          }
        : null;

    const candidatePool = manualCandidate
      ? [manualCandidate, ...financialCandidates.filter(item => item.benchmarkType !== benchmarkType)]
      : financialCandidates;

    if (!candidatePool.length) {
      return noStore(
        {
          error:
            'Belum ada nilai benchmark yang dapat digunakan. Isi Benchmark dan Nilai Benchmark terlebih dahulu, atau pastikan akun keuangan seperti PBT, total aset, pendapatan, atau ekuitas sudah tersedia di Total ARC.'
        },
        { status: 409 }
      );
    }

    const priorScopes = Array.isArray(scopingData.scopes)
      ? scopingData.scopes.slice(0, 5).map((scope: any) => ({
          fiscalYear: scope.fiscalYear,
          reportingPeriod: scope.reportingPeriod,
          benchmarkType: scope.benchmarkType,
          benchmarkAmount: scope.benchmarkAmount,
          overallMaterialityPercent: scope.overallMaterialityPercent,
          overallMaterialityAmount: scope.overallMaterialityAmount,
          performanceMaterialityPercent: scope.performanceMaterialityPercent,
          performanceMaterialityAmount: scope.performanceMaterialityAmount,
          clearlyTrivialPercent: scope.clearlyTrivialPercent,
          status: scope.status
        }))
      : [];

    const methodology = Object.entries(METHODOLOGY).map(([type, rule]) => ({
      benchmarkType: type,
      omPercentMin: rule.min,
      omPercentMax: rule.max,
      label: rule.label,
      appropriateWhen: rule.appropriateWhen
    }));

    const systemPrompt = [
      'Anda adalah AI Total ARC untuk membantu penyusunan usulan materialitas ICOFR.',
      'Output hanya usulan metodologis dan tidak boleh dianggap sebagai keputusan final, opini audit, atau ketentuan regulator.',
      'Gunakan data institusi dan kandidat benchmark yang disediakan. Jangan mengarang nilai benchmark.',
      'Jika benchmarkType yang direkomendasikan berasal dari candidatePool, gunakan amount persis dari kandidat tersebut.',
      'Gunakan referensi metodologi ilustratif berikut dan jangan melampaui rentangnya: PBT 5%; rata-rata PBT 3 tahun 5%; total aset 0,5%-1%; pendapatan 0,5%-1%; ekuitas 1%-2%.',
      'Untuk Performance Materiality: risiko rendah 75% OM; risiko sedang 60%-65% OM; risiko tinggi 50% OM.',
      'Clearly Trivial/SAD menggunakan 3%-5% dari PM.',
      'Tidak ada persentase universal. Pemilihan benchmark harus mempertimbangkan relevansi bagi pengguna laporan, stabilitas antarperiode, dan keterandalan data.',
      'Jika konteks tidak cukup untuk mendukung tingkat risiko PM, gunakan riskLevel "Needs Review" dan pmPercent null. Jangan memilih Medium hanya sebagai default.',
      'Jika pengguna memberikan riskLevelPreference Low/Medium/High, gunakan preferensi tersebut kecuali data menunjukkan konflik material; jelaskan konflik di warnings.',
      'Jangan membuat kesimpulan kepatuhan. Seluruh narasi harus Bahasa Indonesia.',
      'Return JSON only: {"benchmarkType":"Profit Before Tax|Average PBT 3 Years|Revenue|Total Assets|Equity|Custom","benchmarkAmount":number,"benchmarkSource":"string","omPercent":number,"riskLevel":"Low|Medium|High|Needs Review","pmPercent":number|null,"trivialPercent":number,"benchmarkRationale":"string","pmRationale":"string","analysisSummary":"string","warnings":["string"],"alternatives":[{"benchmarkType":"Profit Before Tax|Revenue|Total Assets|Equity","benchmarkAmount":number,"omPercent":number,"rationale":"string"}]}.'
    ].join(' ');

    const result = await runAiGateway({
      task: 'classification',
      sensitivity: 'confidential',
      systemPrompt,
      prompt:
        'KONTEKS PENETAPAN MATERIALITAS\n' +
        JSON.stringify({
          institution: context.institution.name,
          scopeName,
          fiscalYear,
          reportingPeriod,
          consolidationBasis,
          accountingFramework,
          currentNotes,
          currentInput: {
            benchmarkType,
            benchmarkAmount,
            overallMaterialityPercent: currentOmPercent,
            riskLevelPreference
          },
          candidatePool,
          methodology,
          priorScopes
        }),
      temperature: 0.05,
      maxOutputTokens: 2600,
      requireJson: true
    });

    const parsed = parseJsonObject(result.text);
    const suggestedBenchmark = clean(parsed.benchmarkType, 80);
    if (!isBenchmarkType(suggestedBenchmark)) throw new Error('AI_MATERIALITY_INVALID');

    const selectedCandidate = candidatePool.find(
      item => item.benchmarkType === suggestedBenchmark
    );
    if (!selectedCandidate) {
      if (suggestedBenchmark !== 'Custom' || !manualCandidate) {
        throw new Error('AI_MATERIALITY_UNSUPPORTED_BENCHMARK');
      }
    }

    const suggestedBenchmarkAmount = numberValue(parsed.benchmarkAmount);
    const expectedAmount = selectedCandidate?.amount ?? manualCandidate?.amount ?? null;
    if (
      suggestedBenchmarkAmount === null ||
      expectedAmount === null ||
      Math.abs(suggestedBenchmarkAmount - expectedAmount) > Math.max(1, Math.abs(expectedAmount) * 0.000001)
    ) {
      throw new Error('AI_MATERIALITY_AMOUNT_MISMATCH');
    }

    const omPercent = numberValue(parsed.omPercent);
    if (suggestedBenchmark !== 'Custom') {
      const rule = METHODOLOGY[suggestedBenchmark];
      if (!validatePercent(omPercent, rule.min, rule.max)) {
        throw new Error('AI_MATERIALITY_OM_OUTSIDE_METHOD');
      }
    } else if (currentOmPercent === null || currentOmPercent <= 0 || omPercent !== currentOmPercent) {
      throw new Error('AI_MATERIALITY_CUSTOM_REQUIRES_USER_PERCENT');
    }

    const riskLevelRaw = clean(parsed.riskLevel, 40);
    if (!isRiskLevel(riskLevelRaw)) throw new Error('AI_MATERIALITY_INVALID');
    const pmPercent = numberValue(parsed.pmPercent);
    if (riskLevelRaw === 'Needs Review') {
      if (pmPercent !== null) throw new Error('AI_MATERIALITY_PM_REVIEW_REQUIRED');
    } else {
      const rule = PM_RANGES[riskLevelRaw];
      if (!validatePercent(pmPercent, rule.min, rule.max)) {
        throw new Error('AI_MATERIALITY_PM_OUTSIDE_METHOD');
      }
    }

    const trivialPercent = numberValue(parsed.trivialPercent);
    if (!validatePercent(trivialPercent, 3, 5)) {
      throw new Error('AI_MATERIALITY_TRIVIAL_OUTSIDE_METHOD');
    }

    const omAmount = suggestedBenchmarkAmount * ((omPercent as number) / 100);
    const pmAmount =
      pmPercent === null ? null : omAmount * (pmPercent / 100);
    const trivialAmount =
      pmAmount === null ? null : pmAmount * ((trivialPercent as number) / 100);

    const alternatives = Array.isArray(parsed.alternatives)
      ? parsed.alternatives
          .filter(item => item && typeof item === 'object')
          .map(item => item as Record<string, unknown>)
          .filter(item => {
            const type = clean(item.benchmarkType, 80);
            const amount = numberValue(item.benchmarkAmount);
            const percent = numberValue(item.omPercent);
            if (!isBenchmarkType(type) || type === 'Custom') return false;
            const candidate = candidatePool.find(row => row.benchmarkType === type);
            const method = METHODOLOGY[type];
            return Boolean(
              candidate &&
                amount !== null &&
                Math.abs(amount - candidate.amount) <= Math.max(1, Math.abs(candidate.amount) * 0.000001) &&
                validatePercent(percent, method.min, method.max)
            );
          })
          .slice(0, 2)
          .map(item => {
            const type = clean(item.benchmarkType, 80) as Exclude<BenchmarkType, 'Custom'>;
            const amount = numberValue(item.benchmarkAmount) as number;
            const percent = numberValue(item.omPercent) as number;
            return {
              benchmarkType: type,
              benchmarkAmount: amount,
              omPercent: percent,
              omAmount: amount * (percent / 100),
              rationale: clean(item.rationale, 900)
            };
          })
      : [];

    return noStore({
      suggestion: {
        benchmarkType: suggestedBenchmark,
        benchmarkAmount: suggestedBenchmarkAmount,
        benchmarkSource:
          clean(parsed.benchmarkSource, 500) ||
          selectedCandidate?.sourceName ||
          manualCandidate?.sourceName ||
          'Sumber benchmark Total ARC',
        omPercent,
        omAmount,
        riskLevel: riskLevelRaw,
        pmPercent,
        pmAmount,
        trivialPercent,
        trivialAmount,
        benchmarkRationale: clean(parsed.benchmarkRationale, 1400),
        pmRationale: clean(parsed.pmRationale, 1400),
        analysisSummary: clean(parsed.analysisSummary, 1800),
        warnings: Array.isArray(parsed.warnings)
          ? parsed.warnings.map(item => clean(item, 600)).filter(Boolean).slice(0, 10)
          : [],
        alternatives
      },
      methodology: {
        benchmarkRanges: methodology,
        pmRanges: PM_RANGES,
        trivialPercent: { min: 3, max: 5, basis: 'PM' },
        disclaimer:
          'Rentang merupakan referensi metodologi/praktik audit ilustratif, bukan persentase universal atau ketentuan regulator. Keputusan final harus divalidasi dan didokumentasikan oleh pihak berwenang.'
      },
      provider: result.provider,
      model: result.model,
      requestId: result.requestId,
      humanReviewRequired: true
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      AI_MATERIALITY_INVALID: ['AI menghasilkan struktur usulan materialitas yang tidak valid.', 502],
      AI_MATERIALITY_UNSUPPORTED_BENCHMARK: ['AI memilih benchmark yang tidak memiliki nilai sumber yang dapat diverifikasi.', 502],
      AI_MATERIALITY_AMOUNT_MISMATCH: ['Nilai benchmark usulan AI tidak sama dengan nilai sumber. Usulan tidak diterapkan.', 502],
      AI_MATERIALITY_OM_OUTSIDE_METHOD: ['Persentase OM usulan AI berada di luar rentang metodologi yang dikonfigurasi.', 502],
      AI_MATERIALITY_CUSTOM_REQUIRES_USER_PERCENT: ['Benchmark kustom memerlukan persentase OM yang ditetapkan pengguna.', 409],
      AI_MATERIALITY_PM_REVIEW_REQUIRED: ['Tingkat risiko PM masih memerlukan review pengguna.', 409],
      AI_MATERIALITY_PM_OUTSIDE_METHOD: ['Persentase PM usulan AI berada di luar rentang metodologi yang dikonfigurasi.', 502],
      AI_MATERIALITY_TRIVIAL_OUTSIDE_METHOD: ['Persentase Clearly Trivial/SAD usulan AI berada di luar rentang 3%-5% PM.', 502]
    };
    if (known[code]) return noStore({ error: known[code][0] }, { status: known[code][1] });

    console.error('Gagal membuat usulan OM/PM dengan AI:', error);
    return noStore(
      { error: 'Tidak dapat membuat usulan OM/PM dengan penyedia AI yang dikonfigurasi.' },
      { status: 503 }
    );
  }
}
