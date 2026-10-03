import { NextResponse } from 'next/server';
import { runAiGateway } from '@/lib/ai/gateway';
import { guardAiPost } from '@/lib/ai/http-security';
import { findBusinessProcessForAi, recordAiAnalysisAudit } from '@/lib/d1-core';
import { resolveInstitutionAccess } from '@/lib/institution-context';

type Finding = {
  id: string;
  type: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  title: string;
  category: string;
  description: string;
  recommendation: string;
  suggestedRisk: string;
  suggestedControl: string;
  disclaimer: string;
  status: string;
};


function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^\`\`\`(?:json)?/i, '').replace(/\`\`\`$/i, '').trim();

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error('AI response was not valid JSON');
  }
}

function normalizeSeverity(value: unknown): Finding['severity'] {
  if (value === 'Critical' || value === 'High' || value === 'Medium' || value === 'Low') {
    return value;
  }
  return 'Medium';
}

function normalizeFindings(value: unknown): Finding[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 12).map((raw, index) => {
    const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    return {
      id: 'AI-FND-' + String(index + 1).padStart(3, '0'),
      type: typeof item.type === 'string' ? item.type : 'Observasi Pengendalian',
      severity: normalizeSeverity(item.severity),
      title: typeof item.title === 'string' ? item.title : 'Potensi observasi pengendalian',
      category: typeof item.category === 'string' ? item.category : 'Umum',
      description: typeof item.description === 'string' ? item.description : '',
      recommendation: typeof item.recommendation === 'string' ? item.recommendation : '',
      suggestedRisk: typeof item.suggestedRisk === 'string' ? item.suggestedRisk : '',
      suggestedControl: typeof item.suggestedControl === 'string' ? item.suggestedControl : '',
      disclaimer: 'Saran AI — Memerlukan Reviu Manusia',
      status: 'Menunggu Reviu'
    };
  });
}

export async function POST(request: Request) {
  try {
    const institutionContext = await resolveInstitutionAccess(request);
    if (!institutionContext?.institution) {
      return NextResponse.json(
        { error: 'Active institution is required.' },
        { status: institutionContext ? 409 : 401 }
      );
    }
    const institutionId = institutionContext.institution.id;

    const guarded = await guardAiPost(request, 'AI_ANALYZE_RATE_LIMIT');
    if (!guarded.ok) return guarded.response;

    const body = guarded.body;
    const processId = typeof body.processId === 'string' ? body.processId.trim() : '';
    const processName = typeof body.processName === 'string' ? body.processName.trim() : '';

    const registeredProcess =
      processId || processName
        ? await findBusinessProcessForAi({
            processId: processId || undefined,
            processName: processName || undefined
          }, institutionId)
        : null;

    const suppliedActivities = Array.isArray(body.activities) ? body.activities : [];
    const suppliedRisks = Array.isArray(body.risks) ? body.risks : [];
    const suppliedControls = Array.isArray(body.controls) ? body.controls : [];

    if (!registeredProcess && suppliedActivities.length === 0 && suppliedRisks.length === 0 && suppliedControls.length === 0) {
      return NextResponse.json(
        {
          error: 'Konteks BPM/RCM terdaftar tidak ditemukan untuk analisis AI.',
          detail: 'Gunakan processId/processName yang valid atau berikan aktivitas, risiko, dan kontrol secara eksplisit.'
        },
        { status: 404 }
      );
    }

    const context = registeredProcess
      ? {
          process: {
            id: registeredProcess.id,
            processId: registeredProcess.processId,
            name: registeredProcess.name,
            description: registeredProcess.description,
            criticality: registeredProcess.criticality,
            classification: registeredProcess.classification,
            isIcofrRelevant: registeredProcess.isIcofrRelevant,
            status: registeredProcess.status,
            category: registeredProcess.category?.name,
            orgUnit: registeredProcess.orgUnit?.name,
            objectives: registeredProcess.objectives,
            sipoc: registeredProcess.sipoc
          },
          activities: registeredProcess.activities,
          risks: registeredProcess.risks,
          controls: registeredProcess.controls
        }
      : {
          process: {
            processId: processId || null,
            name: processName || 'Analisis proses ad-hoc'
          },
          activities: suppliedActivities,
          risks: suppliedRisks,
          controls: suppliedControls
        };

    const systemPrompt = [
      'Anda adalah AI Total ARC, kopilot enterprise untuk Tata Kelola, Risiko, Pengendalian Internal, dan Assurance.',
      'Analisis hanya bukti yang tersedia dalam konteks BPM/RCM terdaftar.',
      'Jangan pernah mengarang peran ERP, ambang transaksi, regulasi, kegagalan kontrol, bukti, insiden, atau konfigurasi sistem yang tidak terdapat dalam input.',
      'Jika bukti tidak cukup untuk mendukung suatu temuan, jangan membuat temuan tersebut.',
      'Fokus pada cakupan risiko, kesenjangan desain pengendalian, segregasi tugas, peluang otomasi, logika key control, relevansi ICOFR, kontrol duplikat, kontrol yang belum tersedia, dan ketertelusuran.',
      'Output AI hanya bersifat advisori. AI tidak menyetujui proses, mengubah rating risiko, mengubah kesimpulan ToD/ToE, menutup isu, atau membuat remediasi tanpa persetujuan manusia.',
      'WAJIB gunakan Bahasa Indonesia untuk semua teks yang ditampilkan kepada pengguna: analysisNote, type, title, category, description, recommendation, suggestedRisk, dan suggestedControl. Jangan gunakan judul atau uraian berbahasa Inggris, kecuali nama resmi sistem, singkatan, atau istilah teknis yang memang perlu dipertahankan.',
      'Nilai severity tetap harus menggunakan enum internal Critical|High|Medium|Low agar kompatibel dengan sistem.',
      'Kembalikan JSON saja dengan bentuk: {"analysisNote":"string","findings":[{"type":"string","severity":"Critical|High|Medium|Low","title":"string","category":"string","description":"string","recommendation":"string","suggestedRisk":"string","suggestedControl":"string"}]}.',
      'Maksimum 12 temuan. Gunakan findings kosong jika tidak ada gap yang didukung bukti.'
    ].join(' ');

    const analysisSensitivity = 'confidential' as const;

    const result = await runAiGateway({
      task: 'process_analysis',
      sensitivity: analysisSensitivity,
      systemPrompt,
      prompt: 'Analisis konteks BPM/RCM Total ARC berikut dan berikan seluruh narasi dalam Bahasa Indonesia:\n' + JSON.stringify(context),
      temperature: 0.15,
      maxOutputTokens: 4096,
      requireJson: true
    });

    const parsed = parseJsonObject(result.text);
    const findings = normalizeFindings(parsed.findings);
    const analysisNote =
      typeof parsed.analysisNote === 'string'
        ? parsed.analysisNote
        : findings.length === 0
          ? 'Tidak ditemukan kesenjangan pengendalian yang didukung bukti dari konteks yang tersedia.'
          : 'Analisis AI berbasis bukti telah selesai.';

    if (registeredProcess) {
      try {
        await recordAiAnalysisAudit({
          institutionId:
            typeof registeredProcess.institutionId === 'string'
              ? registeredProcess.institutionId
              : null,
          processId: String(registeredProcess.id),
          requestId: result.requestId,
          provider: result.provider,
          model: result.model,
          findingsCount: findings.length
        });
      } catch (auditError) {
        console.warn('AI audit log persistence failed:', auditError);
      }
    }

    return NextResponse.json({
      processAnalyzed: (registeredProcess?.name as string | undefined) || processName || 'Proses ad-hoc',
      processId: (registeredProcess?.processId as string | undefined) || processId || null,
      disclaimer: 'Saran AI — Memerlukan Reviu Manusia',
      analysisNote,
      findingsCount: findings.length,
      findings,
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
    console.error('AI analysis failed:', error);
    return NextResponse.json(
      {
        error: 'Analisis proses gagal dijalankan menggunakan provider AI yang dikonfigurasi.'
      },
      { status: 503 }
    );
  }
}
