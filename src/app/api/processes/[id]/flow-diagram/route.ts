import { NextResponse } from 'next/server';
import { runAiGateway } from '@/lib/ai/gateway';
import { guardAiPost } from '@/lib/ai/http-security';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import {
  activateProcessFlowDiagram,
  getProcessFlowSource,
  getProcessFlowWorkspace,
  saveGeneratedProcessFlow,
  type ProcessFlowDefinition,
  type ProcessFlowSource
} from '@/lib/d1-process-flow';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
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
    throw new Error('AI_FLOW_INVALID');
  }
}

function normalizeDefinition(
  parsed: Record<string, unknown>,
  source: ProcessFlowSource
): ProcessFlowDefinition {
  const rawSteps = Array.isArray(parsed.steps)
    ? parsed.steps.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>
    : [];

  if (!rawSteps.length) throw new Error('AI_FLOW_INVALID');

  const steps = source.activities.map((activity, index) => {
    const matched =
      rawSteps.find(item => clean(item.sourceActivityId, 120) === activity.id) ||
      rawSteps.find(item => clean(item.activityId, 120) === activity.activityId) ||
      rawSteps.find(item => Number(item.order) === activity.orderIndex) ||
      rawSteps[index] ||
      {};

    const kind: 'task' | 'decision' = matched.kind === 'decision' ? 'decision' : 'task';
    const title = clean(matched.title, 180) || activity.name;
    const note = clean(matched.note, 260) || activity.description || null;

    return {
      sourceActivityId: activity.id,
      order: activity.orderIndex || index + 1,
      title,
      sourceTitle: activity.name,
      performer: activity.performer,
      system: activity.systemUsed,
      nature: activity.nature,
      kind,
      note
    };
  });

  return {
    title: clean(parsed.title, 180) || 'Alur Proses ' + source.process.name,
    summary:
      clean(parsed.summary, 500) ||
      source.process.description ||
      'Alur proses disusun berdasarkan Activity Register yang tersimpan di Total ARC.',
    processName: source.process.name,
    processCode: source.process.processId,
    steps
  };
}

function deterministicKind(activity: ProcessFlowSource['activities'][number]): 'task' | 'decision' {
  const sourceText = [
    activity.name,
    activity.description,
    activity.nature
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return /(keputusan|persetujuan|otorisasi|otoris|verifikasi|validasi|pemeriksaan|approval|authorize|authorisation|authorization|decision|validation|verification|review|check)/i.test(
    sourceText
  )
    ? 'decision'
    : 'task';
}

function buildDeterministicDefinition(source: ProcessFlowSource): ProcessFlowDefinition {
  return {
    title: 'Alur Proses ' + source.process.name,
    summary:
      source.process.description ||
      'Alur proses dibuat langsung dari Activity Register tersimpan tanpa mengubah data BPM sumber.',
    processName: source.process.name,
    processCode: source.process.processId,
    steps: source.activities.map((activity, index) => ({
      sourceActivityId: activity.id,
      order: activity.orderIndex || index + 1,
      title: activity.name,
      sourceTitle: activity.name,
      performer: activity.performer,
      system: activity.systemUsed,
      nature: activity.nature,
      kind: deterministicKind(activity),
      note: activity.description
    }))
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

async function contextFor(request: Request) {
  const context = await resolveInstitutionAccess(request);
  if (!context?.institution) return null;
  return context;
}

export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const context = await contextFor(request);
    if (!context) {
      return noStore({ error: 'Institusi aktif diperlukan.' }, { status: 409 });
    }

    const { id } = await routeContext.params;
    const processId = String(id || '').trim();
    if (!processId) {
      return noStore({ error: 'ID proses diperlukan.' }, { status: 400 });
    }

    const institutionId = context.institution!.id;
    const workspace = await getProcessFlowWorkspace(processId, institutionId);
    return noStore({
      ...workspace,
      storage: 'cloudflare-d1',
      reusable: true,
      aiRequiredToView: false
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'PROCESS_NOT_FOUND') {
      return noStore({ error: 'Proses bisnis tidak ditemukan pada institusi aktif.' }, { status: 404 });
    }
    console.error('Gagal memuat ruang kerja alur proses:', error);
    return noStore({ error: 'Gagal memuat alur proses yang tersimpan.' }, { status: 503 });
  }
}

export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const context = await contextFor(request);
    if (!context) {
      return noStore({ error: 'Institusi aktif diperlukan.' }, { status: 409 });
    }

    const guarded = await guardAiPost(request, 'AI_ANALYZE_RATE_LIMIT');
    if (!guarded.ok) return guarded.response;

    const { id } = await routeContext.params;
    const processId = String(id || '').trim();
    if (!processId) {
      return noStore({ error: 'ID proses diperlukan.' }, { status: 400 });
    }

    const actionType = clean(guarded.body.actionType, 40) || 'GENERATE';
    if (actionType !== 'GENERATE') {
      return noStore({ error: 'Aksi alur proses tidak didukung.' }, { status: 400 });
    }

    const institutionId = context.institution!.id;
    const generatedBy = context.profile.name || context.profile.email;
    const source = await getProcessFlowSource(processId, institutionId);

    if (!source.activities.length) {
      return noStore(
        {
          error:
            'Activity Register masih kosong. Tambahkan atau validasi aktivitas proses sebelum membuat diagram alur.'
        },
        { status: 409 }
      );
    }

    const systemPrompt = [
      'Anda adalah AI Total ARC yang menyiapkan konten proses bisnis terstruktur untuk renderer alur deterministik Total ARC.',
      'Gunakan Bahasa Indonesia yang profesional, ringkas, dan mudah dipahami untuk judul, ringkasan, dan catatan.',
      'Pertahankan nama resmi, kode proses, nama sistem, akronim, dan istilah teknis yang memang berasal dari sumber.',
      'Kembalikan JSON terstruktur saja; jangan membuat SVG, HTML, Mermaid, diagram ASCII, koordinat, warna, tipografi, atau instruksi tata letak.',
      'Gunakan hanya data Activity Register yang diberikan.',
      'Jangan mengarang tahapan, peran, sistem, kontrol, persetujuan, threshold, regulasi, event, cabang proses, exception, atau fakta yang tidak tersedia.',
      'Pertahankan jumlah dan urutan aktivitas sumber secara persis.',
      'Untuk setiap langkah, kembalikan sourceActivityId yang sama persis dari input.',
      'Buat judul langkah ringkas dan ramah layar HP: idealnya 3-9 kata dan tidak lebih dari 90 karakter, tanpa mengubah makna.',
      'Klasifikasikan kind sebagai decision hanya bila wording sumber jelas menunjukkan keputusan, persetujuan, otorisasi, validasi, verifikasi, atau pemeriksaan; selain itu gunakan task.',
      'Catatan maksimal satu kalimat singkat yang sepenuhnya berasal dari aktivitas sumber; gunakan string kosong bila tidak ada keterangan yang cukup.',
      'Jangan ulangi performer, system, status, nomor urut, atau nama proses di dalam title atau note karena Total ARC menampilkannya secara terpisah.',
      'Jika data sumber tidak tersedia, biarkan kosong dan jangan menggantinya dengan asumsi.',
      'Renderer Total ARC akan menangani tinggi kartu dinamis, badge status terpisah, text wrapping aman, connector tanpa overlap, dan spacing mobile.',
      'Kembalikan JSON saja: {"title":"string","summary":"string","steps":[{"sourceActivityId":"string","activityId":"string","order":1,"title":"string","kind":"task|decision","note":"string"}]}.'
    ].join(' ');

    try {
      const result = await runAiGateway({
        task: 'process_flow',
        sensitivity: 'confidential',
        systemPrompt,
        prompt:
          'Susun konten alur proses berbahasa Indonesia dari BPM Total ARC berikut. Tata letak visual dibuat oleh Total ARC, bukan oleh AI.\n' +
          JSON.stringify({
            process: source.process,
            activities: source.activities
          }),
        temperature: 0.1,
        maxOutputTokens: 3200,
        requireJson: true
      });

      const parsed = parseJsonObject(result.text);
      const definition = normalizeDefinition(parsed, source);
      const saved = await saveGeneratedProcessFlow({
        institutionId,
        processId,
        sourceHash: source.sourceHash,
        definition,
        aiProvider: result.provider,
        aiModel: result.model,
        aiRequestId: result.requestId,
        generatedBy,
        sourceType: 'AI_GENERATED'
      });

      const workspace = await getProcessFlowWorkspace(processId, institutionId);
      return noStore(
        {
          ...workspace,
          diagram: saved,
          generated: true,
          generatedWithFallback: false,
          reusable: true,
          aiRequiredToView: false,
          notice: 'Diagram alur proses berhasil dibuat dan disimpan.'
        },
        { status: 201 }
      );
    } catch (aiError) {
      const code = aiError instanceof Error ? aiError.message : 'AI_PROVIDER_FAILED';
      if (code === 'PROCESS_SOURCE_CHANGED') throw aiError;

      console.warn(
        JSON.stringify({
          event: 'totalarc.process_flow.ai_fallback',
          processId,
          institutionId,
          reason: code.slice(0, 180)
        })
      );

      const definition = buildDeterministicDefinition(source);
      const saved = await saveGeneratedProcessFlow({
        institutionId,
        processId,
        sourceHash: source.sourceHash,
        definition,
        aiProvider: 'totalarc',
        aiModel: 'deterministic-v1',
        aiRequestId: 'fallback-' + crypto.randomUUID(),
        generatedBy,
        sourceType: 'SYSTEM_FALLBACK'
      });

      const workspace = await getProcessFlowWorkspace(processId, institutionId);
      return noStore(
        {
          ...workspace,
          diagram: saved,
          generated: true,
          generatedWithFallback: true,
          reusable: true,
          aiRequiredToView: false,
          notice:
            'Peningkatan AI sementara tidak tersedia. Diagram tetap berhasil dibuat langsung dari Activity Register dan disimpan tanpa mengubah data BPM sumber.'
        },
        { status: 201 }
      );
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : '';

    if (code === 'PROCESS_NOT_FOUND') {
      return noStore({ error: 'Proses bisnis tidak ditemukan pada institusi aktif.' }, { status: 404 });
    }
    if (code === 'PROCESS_SOURCE_CHANGED') {
      return noStore(
        {
          error:
            'Activity Register berubah saat diagram sedang dibuat. Muat ulang data lalu coba kembali.'
        },
        { status: 409 }
      );
    }

    console.error('Gagal membuat dan menyimpan alur proses:', error);
    return noStore(
      {
        error:
          'Diagram alur belum dapat disimpan karena terjadi kendala pada pemrosesan atau penyimpanan. Diagram versi sebelumnya tetap aman dan dapat digunakan.'
      },
      { status: 503 }
    );
  }
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const context = await contextFor(request);
    if (!context) {
      return noStore({ error: 'Institusi aktif diperlukan.' }, { status: 409 });
    }

    const { id } = await routeContext.params;
    const processId = String(id || '').trim();
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = clean(body.actionType, 40);
    const diagramId = clean(body.diagramId, 120);

    if (actionType !== 'ACTIVATE' || !diagramId) {
      return noStore(
        { error: 'Aksi ACTIVATE dan ID diagram diperlukan.' },
        { status: 400 }
      );
    }

    const institutionId = context.institution!.id;
    const workspace = await activateProcessFlowDiagram({
      institutionId,
      processId,
      diagramId,
      actor: context.profile.name || context.profile.email
    });

    return noStore({
      ...workspace,
      reusable: true,
      aiRequiredToView: false,
      notice: 'Versi diagram berhasil dijadikan versi aktif.'
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';

    if (code === 'PROCESS_NOT_FOUND') {
      return noStore({ error: 'Proses bisnis tidak ditemukan pada institusi aktif.' }, { status: 404 });
    }
    if (code === 'FLOW_NOT_FOUND') {
      return noStore({ error: 'Versi diagram tidak ditemukan pada institusi aktif.' }, { status: 404 });
    }

    console.error('Gagal mengaktifkan versi alur proses:', error);
    return noStore({ error: 'Gagal mengaktifkan versi diagram alur yang dipilih.' }, { status: 500 });
  }
}
