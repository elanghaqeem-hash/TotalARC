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

const FINDING_TYPE_LABEL_ID: Record<string, string> = {
  'Control Design Gap': 'Kesenjangan Desain Pengendalian',
  'Control Observation': 'Observasi Pengendalian',
  'Segregation of Duties': 'Segregasi Tugas',
  'Automation Opportunity': 'Peluang Otomasi',
  'Traceability Gap': 'Kesenjangan Ketertelusuran',
  'Key-Control Logic': 'Logika Key Control',
  'Missing Control': 'Kontrol Belum Tersedia',
  'Duplicate Control': 'Kontrol Duplikat'
};

const LEGACY_TITLE_LABEL_ID: Record<string, string> = {
  'Missing Controls for CKPN Calculation Accuracy': 'Kontrol untuk Akurasi Perhitungan CKPN Belum Tersedia',
  'Concentration of Duties in CKPN Process': 'Konsentrasi Tugas dalam Proses CKPN',
  'Limited Automation in CKPN Validation': 'Otomasi dalam Validasi CKPN Masih Terbatas',
  'Lack of Audit Trail for CKPN Inputs': 'Jejak Audit atas Input CKPN Belum Memadai',
  'Missing Control for Objective Evidence Verification': 'Kontrol Verifikasi Bukti Objektif Belum Tersedia'
};

function localizedFindingType(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return 'Observasi Pengendalian';
  return FINDING_TYPE_LABEL_ID[value.trim()] || value.trim();
}

function localizedFindingTitle(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return 'Potensi observasi pengendalian';
  return LEGACY_TITLE_LABEL_ID[value.trim()] || value.trim();
}

function likelyContainsEnglish(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const text = ' ' + value.toLowerCase().replace(/[^a-z0-9/ -]+/g, ' ') + ' ';
  const englishMarkers = [
    ' the ', ' and ', ' for ', ' with ', ' without ', ' no ', ' missing ', ' controls ',
    ' control ', ' calculation ', ' accuracy ', ' assign ', ' separate ', ' roles ',
    ' ensure ', ' validation ', ' lack ', ' evidence ', ' implement ', ' automated ',
    ' manual ', ' review ', ' limited ', ' concentration ', ' duties ', ' traceability ',
    ' audit ', ' trail ', ' inputs ', ' outputs ', ' against ', ' performed ', ' increasing '
  ];
  return englishMarkers.some(marker => text.includes(marker));
}

function outputNeedsLanguageRepair(parsed: Record<string, unknown>) {
  const parts: string[] = [];
  if (typeof parsed.analysisNote === 'string') parts.push(parsed.analysisNote);
  if (Array.isArray(parsed.findings)) {
    for (const raw of parsed.findings) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      for (const key of [
        'type',
        'title',
        'category',
        'description',
        'recommendation',
        'suggestedRisk',
        'suggestedControl'
      ]) {
        if (typeof item[key] === 'string') parts.push(String(item[key]));
      }
    }
  }
  return likelyContainsEnglish(parts.join(' '));
}

function normalizeFindings(value: unknown): Finding[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 12).map((raw, index) => {
    const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    return {
      id: 'AI-FND-' + String(index + 1).padStart(3, '0'),
      type: localizedFindingType(item.type),
      severity: normalizeSeverity(item.severity),
      title: localizedFindingTitle(item.title),
      category:
        typeof item.category === 'string' && item.category.trim()
          ? (item.category.trim() === 'General' ? 'Umum' : item.category.trim())
          : 'Umum',
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
        { error: 'Institusi aktif diperlukan.' },
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

    let parsed = parseJsonObject(result.text);
    let languageRepairApplied = false;
    let languageRepairProvider: string | null = null;

    // Some providers may still return English even when the primary prompt asks
    // for Indonesian. Detect that case and perform one translation-only pass.
    // The repair pass is prohibited from changing facts, severity, counts, or
    // recommendations; it may only translate user-visible narrative fields.
    if (outputNeedsLanguageRepair(parsed)) {
      try {
        const languageRepair = await runAiGateway({
          task: 'process_analysis',
          sensitivity: analysisSensitivity,
          systemPrompt: [
            'Anda adalah penerjemah JSON untuk Total ARC.',
            'Terjemahkan HANYA nilai teks yang terlihat pengguna ke Bahasa Indonesia.',
            'Jangan menambah, menghapus, menyimpulkan, memperkuat, atau mengubah fakta apa pun.',
            'Pertahankan struktur JSON, jumlah temuan, urutan temuan, dan severity persis seperti input.',
            'Pertahankan singkatan resmi dan istilah yang perlu tetap asli seperti CKPN, ECL, PSAK, PD/LGD, NPV, ICOFR, ToD, ToE, ERP, dan nama sistem.',
            'Field yang harus diterjemahkan bila berbahasa Inggris: analysisNote, type, title, category, description, recommendation, suggestedRisk, suggestedControl.',
            'Kembalikan JSON saja.'
          ].join(' '),
          prompt:
            'Terjemahkan JSON berikut ke Bahasa Indonesia tanpa mengubah substansi:\n' +
            JSON.stringify(parsed),
          temperature: 0,
          maxOutputTokens: 4096,
          requireJson: true
        });

        parsed = parseJsonObject(languageRepair.text);
        languageRepairApplied = true;
        languageRepairProvider = languageRepair.provider;
      } catch (languageRepairError) {
        console.warn('AI Indonesian language repair failed; using primary analysis output.', languageRepairError);
      }
    }

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
        durationMs: result.durationMs,
        languageRepairApplied,
        languageRepairProvider
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
