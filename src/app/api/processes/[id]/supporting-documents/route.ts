import { NextResponse } from 'next/server';
import { runAiGateway } from '@/lib/ai/gateway';
import { guardAiMultipart } from '@/lib/ai/http-security';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import { getBusinessProcessDetail } from '@/lib/d1-core';
import {
  linkEvidence,
  uploadEvidenceVersion
} from '@/lib/d1-evidence-repository';
import { extractProcessSupportingDocument } from '@/lib/process-document-extraction';
import {
  applyProcessDocumentAnalysis,
  listProcessDocumentAnalyses,
  rejectProcessDocumentAnalysis,
  saveProcessDocumentAnalysis,
  type ProcessDocumentDraft
} from '@/lib/d1-process-document-analysis';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['docx', 'pdf', 'txt', 'pptx', 'jpg', 'jpeg', 'png', 'xlsx']);

function extOf(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function clean(value: unknown, max = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function nullable(value: unknown, max = 1000) {
  const result = clean(value, max);
  if (!result || /^not (provided|available|specified|identified)$/i.test(result)) return null;
  return result;
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
    throw new Error('AI_DOCUMENT_DRAFT_INVALID');
  }
}

function stringArray(value: unknown, maxItems = 12) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => clean(item, 300))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeDraft(parsed: Record<string, unknown>): ProcessDocumentDraft {
  const rawMaster =
    parsed.master && typeof parsed.master === 'object' && !Array.isArray(parsed.master)
      ? parsed.master as Record<string, unknown>
      : {};
  const rawObjective =
    parsed.objective && typeof parsed.objective === 'object' && !Array.isArray(parsed.objective)
      ? parsed.objective as Record<string, unknown>
      : null;
  const rawSipoc =
    parsed.sipoc && typeof parsed.sipoc === 'object' && !Array.isArray(parsed.sipoc)
      ? parsed.sipoc as Record<string, unknown>
      : null;
  const rawActivities = Array.isArray(parsed.activities)
    ? parsed.activities.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>
    : [];

  if (!rawActivities.length) throw new Error('AI_DOCUMENT_DRAFT_NO_ACTIVITIES');

  const criticalities = new Set(['Critical', 'High', 'Medium', 'Low', 'Not Assessed']);
  const classifications = new Set([
    'Core',
    'Finance',
    'Technology',
    'Governance',
    'Support',
    'Management'
  ]);
  const criticalityRaw = clean(rawMaster.criticality, 30);
  const classificationRaw = clean(rawMaster.classification, 30);
  const confidenceRaw = clean(parsed.confidence, 20);

  const objectiveText = rawObjective ? nullable(rawObjective.objective, 1200) : null;
  const hasSipoc =
    rawSipoc &&
    [
      rawSipoc.suppliers,
      rawSipoc.inputs,
      rawSipoc.processSteps,
      rawSipoc.outputs,
      rawSipoc.customers
    ].some(value => Boolean(nullable(value, 1600)));

  const activities = rawActivities.slice(0, 60).map((item, index) => {
    const name = clean(item.name, 240);
    if (!name) throw new Error('AI_DOCUMENT_DRAFT_INVALID_ACTIVITY');
    const kind: 'task' | 'decision' = item.kind === 'decision' ? 'decision' : 'task';
    return {
      activityId: clean(item.activityId, 120) || 'AI-DOC-' + String(index + 1).padStart(3, '0'),
      name,
      description: nullable(item.description, 1200),
      performer: nullable(item.performer, 300),
      nature: nullable(item.nature, 80) || 'Not Assessed',
      frequency: nullable(item.frequency, 80) || 'Not Assessed',
      inputData: nullable(item.inputData, 800),
      outputData: nullable(item.outputData, 800),
      systemUsed: nullable(item.systemUsed, 300),
      sla: nullable(item.sla, 300),
      orderIndex: index + 1,
      kind,
      flowNote: nullable(item.flowNote, 500)
    };
  });

  const isIcofrRaw = rawMaster.isIcofrRelevant;
  const isIcofrRelevant =
    typeof isIcofrRaw === 'boolean' ? isIcofrRaw : null;

  return {
    master: {
      name: nullable(rawMaster.name, 300),
      description: nullable(rawMaster.description, 2500),
      ownerName: nullable(rawMaster.ownerName, 300),
      categorySuggestion: nullable(rawMaster.categorySuggestion, 160),
      criticality: criticalities.has(criticalityRaw)
        ? criticalityRaw as Exclude<ProcessDocumentDraft['master']['criticality'], null>
        : null,
      classification: classifications.has(classificationRaw)
        ? classificationRaw as Exclude<ProcessDocumentDraft['master']['classification'], null>
        : null,
      isIcofrRelevant
    },
    objective: objectiveText
      ? {
          objective: objectiveText,
          strategicGoal: nullable(rawObjective?.strategicGoal, 1000),
          expectedOutcome: nullable(rawObjective?.expectedOutcome, 1000),
          kpi: nullable(rawObjective?.kpi, 800),
          kri: nullable(rawObjective?.kri, 800),
          sla: nullable(rawObjective?.sla, 500)
        }
      : null,
    sipoc: hasSipoc
      ? {
          suppliers: nullable(rawSipoc?.suppliers, 1600),
          inputs: nullable(rawSipoc?.inputs, 1600),
          processSteps: nullable(rawSipoc?.processSteps, 2200),
          outputs: nullable(rawSipoc?.outputs, 1600),
          customers: nullable(rawSipoc?.customers, 1600)
        }
      : null,
    activities,
    sourceSummary: clean(parsed.sourceSummary, 1600) || 'AI draft derived from the uploaded supporting document.',
    confidence:
      confidenceRaw === 'High' || confidenceRaw === 'Medium' || confidenceRaw === 'Low'
        ? confidenceRaw
        : 'Medium',
    assumptions: stringArray(parsed.assumptions),
    gaps: stringArray(parsed.gaps)
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

export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const context = await access(request);
    if (!context) return noStore({ error: 'Active institution is required.' }, { status: 409 });
    const { id } = await routeContext.params;
    const processId = String(id || '').trim();
    if (!processId) return noStore({ error: 'Process id is required.' }, { status: 400 });

    const analyses = await listProcessDocumentAnalyses(processId, context.institution!.id);
    return noStore({
      analyses,
      acceptedExtensions: Array.from(ALLOWED_EXTENSIONS),
      maxFileBytes: MAX_FILE_BYTES,
      workflow: 'upload-store-extract-ai-draft-user-validation'
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'PROCESS_NOT_FOUND') {
      return noStore({ error: 'Business process was not found in the active institution.' }, { status: 404 });
    }
    console.error('Failed to load process supporting-document analyses:', error);
    return noStore({ error: 'Unable to load supporting-document analysis history.' }, { status: 503 });
  }
}

export async function POST(request: Request, routeContext: RouteContext) {
  let storedEvidence: Record<string, unknown> | null = null;

  try {
    const context = await access(request);
    if (!context) return noStore({ error: 'Active institution is required.' }, { status: 409 });

    const guarded = await guardAiMultipart(request, 'AI_ANALYZE_RATE_LIMIT');
    if (guarded) return guarded;

    const { id } = await routeContext.params;
    const processId = String(id || '').trim();
    if (!processId) return noStore({ error: 'Process id is required.' }, { status: 400 });

    const process = await getBusinessProcessDetail(
      processId,
      context.institution!.id
    ) as Record<string, any>;
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return noStore({ error: 'Supporting document file is required.' }, { status: 400 });
    }

    const extension = extOf(file.name);
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return noStore(
        { error: 'Supported files: DOCX, PDF, TXT, PPTX, JPG/JPEG, PNG, and XLSX.' },
        { status: 415 }
      );
    }
    if (file.size <= 0) return noStore({ error: 'The supporting document is empty.' }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) {
      return noStore({ error: 'Supporting document exceeds the current 8 MB limit.' }, { status: 413 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const actor = context.profile.name || context.profile.email;
    const institutionId = context.institution!.id;

    const uploaded = await uploadEvidenceVersion({
      institutionId,
      documentId: null,
      title: String(process.processId || '') + ' – ' + file.name,
      description: 'Supporting business-process document uploaded for Total ARC AI definition and user validation.',
      category: 'Business Process Supporting Document',
      sensitivity: 'Confidential',
      retentionClass: '7 Years',
      retentionUntil: null,
      legalHold: false,
      ownerName: String(process.ownerName || actor),
      sourceSystem: 'Total ARC BPM',
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
      entityType: 'PROCESS',
      entityId: processId,
      relationship: 'SUPPORTS',
      notes: 'Source document for AI-assisted business-process definition.',
      evidenceOwner: String(process.ownerName || actor)
    });

    const extracted = await extractProcessSupportingDocument({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      bytes
    });

    const systemPrompt = [
      'Anda adalah AI Total ARC yang membantu Pemilik Proses mendefinisikan proses bisnis dari dokumen pendukung yang diunggah.',
      'Perlakukan dokumen sebagai bukti, bukan sebagai kebenaran yang tidak dapat dipertanyakan.',
      'Gunakan hanya informasi yang didukung dokumen atau konteks proses saat ini yang diberikan.',
      'Jangan mengarang nama pelaksana, sistem, ambang persetujuan, frekuensi, KPI, KRI, SLA, regulasi, atau langkah proses.',
      'Jika suatu field tidak didukung sumber, gunakan null. Masukkan item yang belum terselesaikan ke gaps.',
      'Kembalikan urutan operasional sesuai urutan dokumen jika memungkinkan.',
      'Node keputusan hanya boleh digunakan untuk persetujuan, otorisasi, validasi, kondisi, atau cabang ya/tidak yang eksplisit.',
      'Jangan mengubah ID Proses. Kategori hanya berupa usulan dan tidak diterapkan secara otomatis.',
      'Relevansi ICOFR hanya boleh true/false jika didukung secara memadai; jika tidak, gunakan null.',
      'Kembalikan JSON saja dengan struktur berikut:',
      '{"master":{"name":string|null,"description":string|null,"ownerName":string|null,"categorySuggestion":string|null,"criticality":"Critical|High|Medium|Low|Not Assessed"|null,"classification":"Core|Finance|Technology|Governance|Support|Management"|null,"isIcofrRelevant":boolean|null},"objective":{"objective":string,"strategicGoal":string|null,"expectedOutcome":string|null,"kpi":string|null,"kri":string|null,"sla":string|null}|null,"sipoc":{"suppliers":string|null,"inputs":string|null,"processSteps":string|null,"outputs":string|null,"customers":string|null}|null,"activities":[{"activityId":string|null,"name":string,"description":string|null,"performer":string|null,"nature":string|null,"frequency":string|null,"inputData":string|null,"outputData":string|null,"systemUsed":string|null,"sla":string|null,"kind":"task|decision","flowNote":string|null}],"sourceSummary":string,"confidence":"High|Medium|Low","assumptions":[string],"gaps":[string]} Semua nilai teks yang ditampilkan kepada pengguna wajib menggunakan Bahasa Indonesia; token enum seperti criticality, classification, kind, dan confidence tetap menggunakan nilai yang ditentukan untuk kompatibilitas sistem.'
    ].join(' ');

    const result = await runAiGateway({
      task: 'process_document_analysis',
      sensitivity: 'confidential',
      systemPrompt,
      prompt:
        'KONTEKS PROSES SAAT INI\n' +
        JSON.stringify({
          id: process.id,
          processId: process.processId,
          name: process.name,
          description: process.description,
          ownerName: process.ownerName,
          criticality: process.criticality,
          classification: process.classification,
          isIcofrRelevant: process.isIcofrRelevant
        }) +
        '\n\nTEKS DOKUMEN YANG DIUNGGAH\n' +
        extracted.text,
      temperature: 0.1,
      maxOutputTokens: 5500,
      requireJson: true
    });

    const parsed = parseJsonObject(result.text);
    const draft = normalizeDraft(parsed);
    const analysis = await saveProcessDocumentAnalysis({
      institutionId,
      processId,
      evidenceDocumentId: uploaded.documentId,
      evidenceVersionId: uploaded.versionId,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      extractionMethod: extracted.method,
      sourceTextPreview: extracted.text,
      sourceTextTruncated: extracted.truncated,
      draft,
      aiProvider: result.provider,
      aiModel: result.model,
      aiRequestId: result.requestId,
      createdBy: actor
    });

    return noStore(
      {
        analysis,
        evidence: {
          documentId: uploaded.documentId,
          versionId: uploaded.versionId,
          evidenceId: uploaded.evidenceId,
          versionNo: uploaded.versionNo,
          sha256: uploaded.sha256,
          fileName: file.name,
          storage: 'cloudflare-d1-chunked'
        },
        extraction: {
          method: extracted.method,
          truncated: extracted.truncated
        },
        applyRequired: true,
        message: 'File telah disimpan dan dianalisis. Review draf AI sebelum menerapkannya ke Proses Bisnis.'
      },
      { status: 201 }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      PROCESS_NOT_FOUND: ['Proses bisnis tidak ditemukan pada institusi aktif.', 404],
      FILE_TYPE_NOT_ALLOWED: ['This supporting document type is not allowed by the Evidence Repository.', 415],
      FILE_TOO_LARGE: ['Supporting document exceeds the current 8 MB limit.', 413],
      DOCUMENT_CONVERTER_UNAVAILABLE: ['Document conversion is temporarily unavailable.', 503],
      DOCUMENT_CONVERSION_FAILED: ['The document could not be converted to readable text.', 422],
      DOCUMENT_TEXT_EMPTY: ['No readable text or process information could be extracted from this file.', 422],
      PPTX_INVALID_ZIP: ['The PPTX file is not a valid PowerPoint package.', 422],
      PPTX_TEXT_NOT_FOUND: ['No readable slide text was found in the PPTX file.', 422],
      AI_DOCUMENT_DRAFT_INVALID: ['AI returned an invalid business-process draft. The source file remains stored.', 502],
      AI_DOCUMENT_DRAFT_NO_ACTIVITIES: ['AI could not identify a defensible activity sequence. The source file remains stored.', 422],
      AI_DOCUMENT_DRAFT_INVALID_ACTIVITY: ['AI returned an invalid activity. The source file remains stored.', 502]
    };

    if (known[code]) {
      return noStore(
        {
          error: known[code][0],
          evidenceStored: Boolean(storedEvidence),
          evidence: storedEvidence
            ? {
                documentId: storedEvidence.documentId,
                versionId: storedEvidence.versionId,
                evidenceId: storedEvidence.evidenceId
              }
            : null
        },
        { status: known[code][1] }
      );
    }

    console.error('Process supporting-document AI analysis failed:', error);
    return noStore(
      {
        error: storedEvidence
          ? 'File telah disimpan dengan aman, tetapi analisis AI belum dapat diselesaikan. Anda dapat mencoba kembali dengan dokumen pendukung yang lebih jelas.'
          : 'Tidak dapat menyimpan dan menganalisis dokumen pendukung.',
        evidenceStored: Boolean(storedEvidence)
      },
      { status: 503 }
    );
  }
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const context = await access(request);
    if (!context) return noStore({ error: 'Active institution is required.' }, { status: 409 });
    const { id } = await routeContext.params;
    const processId = String(id || '').trim();
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = clean(body.actionType, 40);
    const analysisId = clean(body.analysisId, 120);
    if (!processId || !analysisId) {
      return noStore({ error: 'Process id and analysis id are required.' }, { status: 400 });
    }

    const actor = context.profile.name || context.profile.email;
    if (actionType === 'REJECT') {
      const result = await rejectProcessDocumentAnalysis({
        analysisId,
        processId,
        institutionId: context.institution!.id,
        actor
      });
      return noStore({ result });
    }

    if (actionType !== 'APPLY') {
      return noStore({ error: 'actionType must be APPLY or REJECT.' }, { status: 400 });
    }

    const result = await applyProcessDocumentAnalysis({
      analysisId,
      processId,
      institutionId: context.institution!.id,
      actor,
      replaceActivities: body.replaceActivities === true
    });
    return noStore({
      result,
      message:
        'Draf dokumen AI telah divalidasi dan diterapkan. Flowchart yang dihasilkan kini tersimpan dan dapat digunakan kembali tanpa pemanggilan AI berikutnya.'
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      PROCESS_NOT_FOUND: ['Proses bisnis tidak ditemukan pada institusi aktif.', 404],
      DOCUMENT_ANALYSIS_NOT_FOUND: ['Draf analisis dokumen pendukung tidak ditemukan.', 404],
      DOCUMENT_ANALYSIS_NOT_PENDING: ['Draf analisis ini tidak lagi menunggu validasi pengguna.', 409],
      DOCUMENT_ANALYSIS_ALREADY_APPLIED: ['Draf analisis ini sudah diterapkan.', 409],
      DOCUMENT_ANALYSIS_INVALID: ['Draf AI tersimpan tidak valid dan tidak dapat diterapkan.', 409],
      ACTIVITY_REPLACE_BLOCKED: [
        'Activity replacement is blocked because existing risks or controls reference current Activity Register records. Preserve the current activities or remap those dependencies first.',
        409
      ]
    };
    if (known[code]) return noStore({ error: known[code][0] }, { status: known[code][1] });

    console.error('Failed to review process supporting-document draft:', error);
    return noStore({ error: 'Tidak dapat menerapkan draf AI dari dokumen pendukung.' }, { status: 500 });
  }
}
