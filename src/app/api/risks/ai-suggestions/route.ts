import { NextResponse } from 'next/server';
import { runAiGateway } from '@/lib/ai/gateway';
import { guardAiPost } from '@/lib/ai/http-security';
import { findBusinessProcessForAi } from '@/lib/d1-core';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import {
  AI_RISK_CATEGORIES,
  applyAiRiskSuggestionSelection,
  fingerprintAiRiskContext,
  getAiRiskSuggestionBatch,
  listAiRiskSuggestionBatches,
  saveAiRiskSuggestionBatch,
  type AiRiskCategory,
  type AiRiskSuggestion
} from '@/lib/d1-ai-risk-register';

export const dynamic = 'force-dynamic';

function clean(value: unknown, max = 1200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
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
    throw new Error('AI_RISK_RESPONSE_INVALID');
  }
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

async function activeContext(request: Request) {
  const context = await resolveInstitutionAccess(request);
  if (!context?.institution) return null;
  return context;
}

function buildBpmRiskContext(process: Record<string, any>) {
  return {
    process: {
      id: String(process.id || ''),
      processId: String(process.processId || ''),
      name: String(process.name || ''),
      description: process.description || null,
      ownerName: process.ownerName || null,
      criticality: process.criticality || null,
      classification: process.classification || null,
      isIcofrRelevant: Boolean(process.isIcofrRelevant),
      category: process.category?.name || null,
      objectives: Array.isArray(process.objectives) ? process.objectives : [],
      sipoc: process.sipoc || null
    },
    activities: Array.isArray(process.activities)
      ? process.activities.map((item: any) => ({
          id: String(item.id || ''),
          activityId: String(item.activityId || ''),
          name: String(item.name || ''),
          description: item.description || null,
          performer: item.performer || null,
          nature: item.nature || null,
          frequency: item.frequency || null,
          inputData: item.inputData || null,
          outputData: item.outputData || null,
          systemUsed: item.systemUsed || null,
          sla: item.sla || null,
          orderIndex: Number(item.orderIndex || 0)
        }))
      : [],
    existingRisks: Array.isArray(process.risks)
      ? process.risks.map((item: any) => ({
          riskId: String(item.riskId || ''),
          name: String(item.name || ''),
          category: String(item.category || ''),
          cause: String(item.cause || ''),
          event: String(item.event || ''),
          impact: String(item.impact || '')
        }))
      : []
  };
}

function fingerprintSource(context: ReturnType<typeof buildBpmRiskContext>) {
  return {
    process: context.process,
    activities: context.activities
  };
}

function normalizeSuggestions(
  value: unknown,
  activities: Array<Record<string, unknown>>
): AiRiskSuggestion[] {
  if (!Array.isArray(value)) return [];

  const allowedCategories = new Set<string>(AI_RISK_CATEGORIES);
  const activityById = new Map(
    activities.map(item => [String(item.id || ''), item])
  );
  const seen = new Set<string>();
  const suggestions: AiRiskSuggestion[] = [];

  for (const raw of value.slice(0, 20)) {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const category = clean(item.category, 80);
    const name = clean(item.name, 260);
    const cause = clean(item.cause, 1000);
    const event = clean(item.event, 1000);
    const impact = clean(item.impact, 1000);
    const rationale = clean(item.rationale, 1200);

    if (!allowedCategories.has(category) || !name || !cause || !event || !impact || !rationale) {
      continue;
    }

    const duplicateKey = [
      category.toLowerCase(),
      name.toLowerCase().replace(/s+/g, ' ')
    ].join('|');
    if (seen.has(duplicateKey)) continue;
    seen.add(duplicateKey);

    const rawActivityIds = Array.isArray(item.sourceActivityIds)
      ? item.sourceActivityIds.map(value => clean(value, 120)).filter(Boolean)
      : [];
    const sourceActivityIds = Array.from(new Set(rawActivityIds))
      .filter(id => activityById.has(id))
      .slice(0, 6);
    const sourceActivityNames = sourceActivityIds
      .map(id => String(activityById.get(id)?.name || ''))
      .filter(Boolean);

    const confidenceRaw = clean(item.confidence, 20);
    const confidence: 'High' | 'Medium' | 'Low' =
      confidenceRaw === 'High' || confidenceRaw === 'Low' ? confidenceRaw : 'Medium';

    suggestions.push({
      id: 'AI-RISK-' + String(suggestions.length + 1).padStart(3, '0'),
      category: category as AiRiskCategory,
      name,
      cause,
      event,
      impact,
      rationale,
      sourceActivityIds,
      sourceActivityNames,
      confidence
    });

    if (suggestions.length >= 16) break;
  }

  return suggestions;
}

export async function GET(request: Request) {
  try {
    const context = await activeContext(request);
    if (!context) {
      return noStore({ error: 'Active institution is required.' }, { status: 409 });
    }

    const processId = new URL(request.url).searchParams.get('processId')?.trim() || '';
    if (!processId) {
      return noStore({ error: 'Pilih Proses Bisnis terlebih dahulu.' }, { status: 400 });
    }

    const process = await findBusinessProcessForAi({ processId }, context.institution!.id) as Record<string, any> | null;
    if (!process) {
      return noStore({ error: 'Proses Bisnis terpilih tidak ditemukan pada institusi aktif.' }, { status: 404 });
    }

    const bpmContext = buildBpmRiskContext(process);
    const fingerprint = await fingerprintAiRiskContext(fingerprintSource(bpmContext));
    const batches = await listAiRiskSuggestionBatches(String(process.id), context.institution!.id);

    return noStore({
      process: bpmContext.process,
      currentSourceFingerprint: fingerprint,
      batches: batches.map(batch => ({
        ...batch,
        stale: batch.sourceFingerprint !== fingerprint
      })),
      categories: AI_RISK_CATEGORIES,
      workflow: 'select-bpm-generate-review-select-create-draft'
    });
  } catch (error) {
    console.error('Failed to load AI risk suggestion history:', error);
    return noStore({ error: 'Tidak dapat memuat riwayat usulan risiko AI.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await activeContext(request);
    if (!context) {
      return noStore({ error: 'Active institution is required.' }, { status: 409 });
    }

    const guarded = await guardAiPost(request, 'AI_ANALYZE_RATE_LIMIT');
    if (!guarded.ok) return guarded.response;

    const processId = clean(guarded.body.processId, 160);
    if (!processId) {
      return noStore(
        {
          error: 'Pilih Proses Bisnis sebelum menekan Buat Risiko dengan AI.',
          code: 'BPM_SELECTION_REQUIRED'
        },
        { status: 400 }
      );
    }

    const process = await findBusinessProcessForAi({ processId }, context.institution!.id) as Record<string, any> | null;
    if (!process) {
      return noStore({ error: 'Proses Bisnis terpilih tidak ditemukan pada institusi aktif.' }, { status: 404 });
    }

    const bpmContext = buildBpmRiskContext(process);
    const evidenceSignals =
      (bpmContext.process.description ? 1 : 0) +
      bpmContext.process.objectives.length +
      (bpmContext.process.sipoc ? 1 : 0) +
      bpmContext.activities.length;

    if (evidenceSignals === 0) {
      return noStore(
        {
          error:
            'BPM terpilih belum memiliki informasi proses yang memadai. Lengkapi deskripsi BPM, tujuan, SIPOC, atau Register Aktivitas terlebih dahulu.'
        },
        { status: 409 }
      );
    }

    const fingerprint = await fingerprintAiRiskContext(fingerprintSource(bpmContext));

    const systemPrompt = [
      'Anda adalah AI Total ARC yang membuat draf Register Risiko dari satu Proses Bisnis terdaftar.',
      'Pengguna telah memilih BPM. Analisis hanya konteks BPM tersebut.',
      'Gunakan struktur Penyebab -> Kejadian -> Dampak untuk setiap usulan risiko.',
      'Jangan mengarang regulasi, ambang batas, sistem, peran, insiden, kegagalan kontrol, produk, vendor, kanal, atau langkah proses yang tidak didukung BPM.',
      'Jangan menduplikasi risiko yang sudah ada pada existingRisks.',
      'Use only these risk categories: Operational, Financial Reporting, Compliance, Technology, Cybersecurity, Strategic, Fraud, Third Party.',
      'Usulkan beberapa jenis risiko yang relevan bila didukung bukti BPM. Targetkan 5-12 usulan yang berguna dan sedikitnya 2 kategori bila didukung, tetapi jangan menambahkan kategori yang tidak relevan hanya demi variasi.',
      'Satu aktivitas proses dapat mendukung lebih dari satu risiko jika kejadian risikonya berbeda secara material.',
      'sourceActivityIds hanya boleh berisi nilai activity id persis dari konteks BPM. Gunakan array kosong bila risiko didukung oleh konteks tingkat proses dan bukan aktivitas tertentu.',
      'Confidence mencerminkan seberapa langsung BPM mendukung usulan, bukan tingkat keparahan risiko.',
      'Jangan menetapkan likelihood, skor impact, inherent rating, residual rating, atau treatment. Nilai tersebut memerlukan asesmen manusia setelah risiko dibuat.',
      'Output bersifat advisory dan harus tetap dipilih oleh pengguna sebelum data apa pun dibuat pada Register Risiko.',
      'Kembalikan JSON saja dengan bentuk: {"analysisSummary":"string","suggestions":[{"category":"Operational|Financial Reporting|Compliance|Technology|Cybersecurity|Strategic|Fraud|Third Party","name":"string","cause":"string","event":"string","impact":"string","rationale":"string","sourceActivityIds":["exact-activity-id"],"confidence":"High|Medium|Low"}]}. Semua nilai teks yang ditampilkan kepada pengguna (analysisSummary, name, cause, event, impact, rationale) wajib menggunakan Bahasa Indonesia. Token category dan confidence tetap menggunakan nilai enum yang ditentukan untuk kompatibilitas sistem.'
    ].join(' ');

    const result = await runAiGateway({
      task: 'risk_identification',
      sensitivity: 'confidential',
      systemPrompt,
      prompt: 'Buat usulan risiko yang dapat dipilih dari BPM berikut:\n' + JSON.stringify(bpmContext),
      temperature: 0.12,
      maxOutputTokens: 6000,
      requireJson: true
    });

    const parsed = parseJsonObject(result.text);
    const suggestions = normalizeSuggestions(parsed.suggestions, bpmContext.activities);
    if (!suggestions.length) {
      return noStore(
        {
          error:
            'ARC AI tidak dapat menghasilkan usulan risiko berbasis bukti dari BPM ini. Tidak ada data Register Risiko yang diubah.'
        },
        { status: 422 }
      );
    }

    const analysisSummary =
      clean(parsed.analysisSummary, 1800) ||
      'ARC AI mengidentifikasi skenario risiko draf dari BPM terpilih. Pilihan dan asesmen manusia tetap diperlukan.';

    const batch = await saveAiRiskSuggestionBatch({
      institutionId: context.institution!.id,
      processId: String(process.id),
      processEnterpriseId: String(process.processId || ''),
      processName: String(process.name || ''),
      sourceFingerprint: fingerprint,
      analysisSummary,
      suggestions,
      aiProvider: result.provider,
      aiModel: result.model,
      aiRequestId: result.requestId,
      createdBy: context.profile.name || context.profile.email
    });

    return noStore(
      {
        process: bpmContext.process,
        batch,
        categories: AI_RISK_CATEGORIES,
        disclaimer: 'Usulan AI — Memerlukan Pilihan Pengguna & Asesmen Manusia',
        nextAction: 'Pilih satu atau lebih usulan risiko, isi/konfirmasi Pemilik Risiko, lalu buat sebagai Draf / Belum Dinilai.'
      },
      { status: 201 }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'AI_RISK_RESPONSE_INVALID') {
      return noStore(
        { error: 'ARC AI mengembalikan struktur usulan risiko yang tidak valid. Tidak ada data Register Risiko yang diubah.' },
        { status: 502 }
      );
    }
    console.error('AI BPM risk identification failed:', error);
    return noStore(
      { error: 'Tidak dapat membuat usulan risiko berbasis BPM menggunakan penyedia AI yang dikonfigurasi.' },
      { status: 503 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await activeContext(request);
    if (!context) {
      return noStore({ error: 'Active institution is required.' }, { status: 409 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const processId = clean(body.processId, 160);
    const batchId = clean(body.batchId, 160);
    const ownerName = clean(body.ownerName, 300);
    const selectedSuggestionIds = Array.isArray(body.selectedSuggestionIds)
      ? body.selectedSuggestionIds.map(value => clean(value, 120)).filter(Boolean)
      : [];

    if (!processId || !batchId || !selectedSuggestionIds.length) {
      return noStore(
        { error: 'BPM, batch usulan AI, dan minimal satu risiko terpilih wajib tersedia.' },
        { status: 400 }
      );
    }
    if (!ownerName) {
      return noStore(
        { error: 'Konfirmasi Pemilik Risiko yang bertanggung jawab sebelum membuat risiko terpilih.' },
        { status: 400 }
      );
    }

    const process = await findBusinessProcessForAi({ processId }, context.institution!.id) as Record<string, any> | null;
    if (!process) {
      return noStore({ error: 'Proses Bisnis terpilih tidak ditemukan pada institusi aktif.' }, { status: 404 });
    }

    const batch = await getAiRiskSuggestionBatch(batchId, String(process.id), context.institution!.id);
    if (!batch) {
      return noStore({ error: 'Batch usulan risiko AI tidak ditemukan untuk BPM terpilih.' }, { status: 404 });
    }

    const bpmContext = buildBpmRiskContext(process);
    const currentFingerprint = await fingerprintAiRiskContext(fingerprintSource(bpmContext));
    if (currentFingerprint !== batch.sourceFingerprint) {
      return noStore(
        {
          error:
            'BPM terpilih telah berubah sejak usulan risiko ini dibuat. Buat batch risiko AI baru sebelum membuat data Register Risiko.',
          code: 'AI_RISK_BATCH_STALE'
        },
        { status: 409 }
      );
    }

    const result = await applyAiRiskSuggestionSelection({
      institutionId: context.institution!.id,
      processId: String(process.id),
      batchId,
      selectedSuggestionIds,
      ownerName,
      actor: context.profile.name || context.profile.email
    });

    return noStore({
      result,
      message:
        result.created.length > 0
          ? result.created.length + ' risiko AI terpilih dibuat sebagai Draf / Belum Dinilai.'
          : 'Tidak ada risiko baru yang dibuat. Usulan terpilih sudah diterapkan atau cocok dengan risiko yang sudah ada.',
      humanAssessmentRequired: true
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      PROCESS_NOT_FOUND: ['Proses Bisnis terpilih tidak ditemukan pada institusi aktif.', 404],
      AI_RISK_BATCH_NOT_FOUND: ['Batch usulan risiko AI tidak ditemukan.', 404],
      AI_RISK_SELECTION_REQUIRED: ['Pilih minimal satu usulan risiko AI.', 400],
      AI_RISK_SELECTION_INVALID: ['Satu atau lebih risiko terpilih bukan bagian dari batch AI tersimpan ini.', 400],
      RISK_OWNER_REQUIRED: ['Konfirmasi Pemilik Risiko yang bertanggung jawab sebelum membuat risiko.', 400]
    };
    if (known[code]) {
      return noStore({ error: known[code][0] }, { status: known[code][1] });
    }

    console.error('Failed to create selected AI BPM risks:', error);
    return noStore({ error: 'Tidak dapat membuat risiko AI terpilih pada Register Risiko.' }, { status: 500 });
  }
}
