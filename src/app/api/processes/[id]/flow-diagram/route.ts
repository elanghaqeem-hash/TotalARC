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
    const note = clean(matched.note, 260) || null;

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
    title: clean(parsed.title, 180) || source.process.name + ' Process Flow',
    summary: clean(parsed.summary, 500) || null,
    processName: source.process.name,
    processCode: source.process.processId,
    steps
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
      return noStore({ error: 'Active institution is required.' }, { status: 409 });
    }

    const { id } = await routeContext.params;
    const processId = String(id || '').trim();
    if (!processId) {
      return noStore({ error: 'Process id is required.' }, { status: 400 });
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
    console.error('Failed to load process flow workspace:', error);
    return noStore({ error: 'Gagal memuat alur proses tersimpan.' }, { status: 503 });
  }
}

export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const context = await contextFor(request);
    if (!context) {
      return noStore({ error: 'Active institution is required.' }, { status: 409 });
    }

    const guarded = await guardAiPost(request, 'AI_ANALYZE_RATE_LIMIT');
    if (!guarded.ok) return guarded.response;

    const { id } = await routeContext.params;
    const processId = String(id || '').trim();
    if (!processId) {
      return noStore({ error: 'Process id is required.' }, { status: 400 });
    }

    const actionType = clean(guarded.body.actionType, 40) || 'GENERATE';
    if (actionType !== 'GENERATE') {
      return noStore({ error: 'Unsupported process-flow action.' }, { status: 400 });
    }

    const institutionId = context.institution!.id;
    const source = await getProcessFlowSource(processId, institutionId);
    if (!source.activities.length) {
      return noStore(
        {
          error: 'Register Aktivitas masih kosong. Tambahkan atau validasi aktivitas proses sebelum membuat alur.'
        },
        { status: 409 }
      );
    }

    const systemPrompt = [
      'Anda adalah AI Total ARC yang menyiapkan konten proses bisnis terstruktur untuk renderer alur deterministik Total ARC.',
      'Return structured JSON only; never draw SVG, HTML, Mermaid, ASCII diagrams, coordinates, colors, typography, or layout instructions.',
      'Gunakan hanya data sumber Register Aktivitas yang diberikan.',
      'Jangan mengarang langkah, peran, sistem, kontrol, persetujuan, ambang batas, regulasi, kejadian, cabang, pengecualian, atau fakta yang tidak tersedia.',
      'Pertahankan jumlah dan urutan aktivitas sumber secara persis.',
      'Untuk setiap langkah, kembalikan sourceActivityId persis dari input.',
      'Buat judul setiap langkah ringkas dan ramah perangkat seluler: idealnya 3-9 kata dan maksimal 90 karakter; ringkas hanya jika makna tetap terjaga.',
      'Klasifikasikan kind sebagai decision hanya jika teks sumber jelas menunjukkan keputusan, persetujuan, otorisasi, validasi, atau pemeriksaan kondisi; selain itu gunakan task.',
      'Buat note ringkas: satu kalimat sederhana yang hanya berdasarkan aktivitas sumber, idealnya di bawah 140 karakter. Gunakan string kosong jika sumber tidak mendukung catatan yang berguna.',
      'Jangan mengulang performer, system, status, nomor urut, atau nama proses di title maupun note karena Total ARC menampilkan field tersebut secara terpisah.',
      'Jika nilai sumber tidak tersedia, biarkan kosong; jangan menggantinya dengan asumsi.',
      'Renderer akan menerapkan tinggi kartu dinamis, chip status terpisah, pembungkusan teks aman, konektor tanpa tumpang tindih, dan jarak untuk perangkat seluler.',
      'Kembalikan JSON saja: {"title":"string","summary":"string","steps":[{"sourceActivityId":"string","activityId":"string","order":1,"title":"string","kind":"task|decision","note":"string"}]}. Semua nilai title, summary, dan note wajib menggunakan Bahasa Indonesia; token kind tetap task|decision untuk kompatibilitas sistem.'
    ].join(' ');

    const result = await runAiGateway({
      task: 'process_flow',
      sensitivity: 'confidential',
      systemPrompt,
      prompt:
        'Buat konten alur terstruktur yang ringkas dari sumber BPM Total ARC terdaftar berikut. Tata letak visual dirender oleh Total ARC, bukan oleh AI.\n' +
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
      generatedBy: context.profile.name || context.profile.email
    });

    const workspace = await getProcessFlowWorkspace(processId, institutionId);
    return noStore(
      {
        ...workspace,
        diagram: saved,
        generated: true,
        reusable: true,
        aiRequiredToView: false
      },
      { status: 201 }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'PROCESS_NOT_FOUND') {
      return noStore({ error: 'Proses bisnis tidak ditemukan pada institusi aktif.' }, { status: 404 });
    }
    if (code === 'PROCESS_SOURCE_CHANGED') {
      return noStore(
        { error: 'Register Aktivitas berubah saat alur sedang dibuat. Silakan buat ulang.' },
        { status: 409 }
      );
    }
    if (code === 'AI_FLOW_INVALID') {
      return noStore(
        { error: 'AI mengembalikan struktur alur yang tidak valid. Alur tersimpan yang ada tidak diubah.' },
        { status: 502 }
      );
    }
    console.error('Failed to generate and save process flow:', error);
    return noStore(
      {
        error:
          'Unable to generate the process flow right now. Any previously saved diagram remains available without AI.'
      },
      { status: 503 }
    );
  }
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const context = await contextFor(request);
    if (!context) {
      return noStore({ error: 'Active institution is required.' }, { status: 409 });
    }

    const { id } = await routeContext.params;
    const processId = String(id || '').trim();
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = clean(body.actionType, 40);
    const diagramId = clean(body.diagramId, 120);

    if (actionType !== 'ACTIVATE' || !diagramId) {
      return noStore(
        { error: 'actionType=ACTIVATE and diagramId are required.' },
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
    return noStore({ ...workspace, reusable: true, aiRequiredToView: false });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'PROCESS_NOT_FOUND') {
      return noStore({ error: 'Proses bisnis tidak ditemukan pada institusi aktif.' }, { status: 404 });
    }
    if (code === 'FLOW_NOT_FOUND') {
      return noStore({ error: 'Versi alur tersimpan tidak ditemukan pada institusi aktif.' }, { status: 404 });
    }
    console.error('Failed to activate saved process flow:', error);
    return noStore({ error: 'Gagal mengaktifkan versi alur proses tersimpan.' }, { status: 500 });
  }
}
