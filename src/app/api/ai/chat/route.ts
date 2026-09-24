import { NextResponse } from 'next/server';
import { runAiGateway } from '@/lib/ai/gateway';
import { guardAiPost } from '@/lib/ai/http-security';
import type { AiTask } from '@/lib/ai/types';

const TASKS: AiTask[] = [
  'process_analysis',
  'risk_identification',
  'control_gap',
  'rcm_generation',
  'rcsa',
  'tod',
  'toe',
  'remediation',
  'root_cause',
  'classification',
  'control_classification',
  'summarization',
  'evidence_summary',
  'chat'
];

function taskFrom(value: unknown): AiTask {
  return typeof value === 'string' && TASKS.includes(value as AiTask)
    ? (value as AiTask)
    : 'chat';
}


export async function POST(request: Request) {
  try {
    const guarded = await guardAiPost(request, 'AI_CHAT_RATE_LIMIT');
    if (!guarded.ok) return guarded.response;

    const body = guarded.body;
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!message) {
      return NextResponse.json({ error: 'Pesan wajib diisi.' }, { status: 400 });
    }

    const context =
      body.context && typeof body.context === 'object'
        ? '\n\nTotal ARC context:\n' + JSON.stringify(body.context)
        : '';

    const result = await runAiGateway({
      task: taskFrom(body.task),
      sensitivity: 'confidential',
      systemPrompt: [
        'Anda adalah AI Total ARC, kopilot untuk Tata Kelola, Risiko, Kepatuhan, ICOFR, dan Pengendalian Internal.',
        'Gunakan fakta dan konteks yang diberikan. Bedakan dengan jelas bukti dari usulan.',
        'Jangan mengarang regulasi, bukti, kinerja kontrol, hasil pengujian, atau persetujuan.',
        'Jangan pernah secara mandiri menyetujui, menolak, mengubah peringkat, menutup isu, atau menulis ke catatan bisnis.',
        'Setiap rekomendasi harus tetap melalui review manusia.',
        'Gunakan Bahasa Indonesia untuk seluruh jawaban kecuali pengguna secara eksplisit meminta bahasa lain.'
      ].join(' '),
      prompt: message + context,
      temperature: 0.2,
      maxOutputTokens: 4096
    });

    return NextResponse.json({
      answer: result.text,
      disclaimer: 'Usulan AI — Memerlukan Review Manusia',
      ai: {
        requestId: result.requestId,
        provider: result.provider,
        model: result.model,
        attemptedProviders: result.attemptedProviders,
        fallbackUsed: result.fallbackUsed,
        redactions: result.redactions,
        durationMs: result.durationMs
      }
    });
  } catch (error) {
    console.error('AI chat failed:', error);
    return NextResponse.json(
      {
        error: 'Asisten AI tidak tersedia.'
      },
      { status: 503 }
    );
  }
}
