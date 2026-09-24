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
      return noStore({ error: 'Select a Business Process first.' }, { status: 400 });
    }

    const process = await findBusinessProcessForAi({ processId }, context.institution!.id) as Record<string, any> | null;
    if (!process) {
      return noStore({ error: 'Selected Business Process was not found in the active institution.' }, { status: 404 });
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
    return noStore({ error: 'Unable to load AI risk suggestion history.' }, { status: 503 });
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
          error: 'Select a Business Process before pressing Generate AI Risks.',
          code: 'BPM_SELECTION_REQUIRED'
        },
        { status: 400 }
      );
    }

    const process = await findBusinessProcessForAi({ processId }, context.institution!.id) as Record<string, any> | null;
    if (!process) {
      return noStore({ error: 'Selected Business Process was not found in the active institution.' }, { status: 404 });
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
            'The selected BPM does not yet contain enough process information. Complete the BPM description, objective, SIPOC, or Activity Register first.'
        },
        { status: 409 }
      );
    }

    const fingerprint = await fingerprintAiRiskContext(fingerprintSource(bpmContext));

    const systemPrompt = [
      'You are Total ARC AI creating a draft Risk Register from one registered Business Process.',
      'The user has already selected the BPM. Analyze only that BPM context.',
      'Use Cause -> Event -> Impact syntax for every suggested risk.',
      'Do not invent regulations, thresholds, systems, roles, incidents, control failures, products, vendors, channels, or process steps that are not supported by the BPM.',
      'Do not duplicate an existing risk already present in existingRisks.',
      'Use only these risk categories: Operational, Financial Reporting, Compliance, Technology, Cybersecurity, Strategic, Fraud, Third Party.',
      'Propose multiple relevant risk types when the BPM evidence supports them. Aim for 5-12 useful suggestions and at least 2 categories when supported, but never add an irrelevant category merely for diversity.',
      'A process activity can support more than one risk when the risk events are materially different.',
      'sourceActivityIds must contain only exact activity id values supplied in the BPM context. Use an empty array when the risk is supported by process-level context rather than a specific activity.',
      'Confidence reflects how directly the BPM supports the suggestion, not the risk severity.',
      'Do not assign likelihood, impact scores, inherent rating, residual rating, or treatment. Those require human assessment after creation.',
      'The output is advisory and must remain selectable by the user before any Risk Register record is created.',
      'Return JSON only with this shape: {"analysisSummary":"string","suggestions":[{"category":"Operational|Financial Reporting|Compliance|Technology|Cybersecurity|Strategic|Fraud|Third Party","name":"string","cause":"string","event":"string","impact":"string","rationale":"string","sourceActivityIds":["exact-activity-id"],"confidence":"High|Medium|Low"}]}.'
    ].join(' ');

    const result = await runAiGateway({
      task: 'risk_identification',
      sensitivity: 'confidential',
      systemPrompt,
      prompt: 'Generate selectable risk-register suggestions from this BPM:\n' + JSON.stringify(bpmContext),
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
            'ARC AI could not produce evidence-grounded risk suggestions from this BPM. No Risk Register data was changed.'
        },
        { status: 422 }
      );
    }

    const analysisSummary =
      clean(parsed.analysisSummary, 1800) ||
      'ARC AI identified draft risk scenarios from the selected BPM. Human selection and assessment are required.';

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
        disclaimer: 'AI Suggested — User Selection & Human Assessment Required',
        nextAction: 'Select one or more proposed risks, provide/confirm Risk Owner, then create them as Draft / Not Assessed.'
      },
      { status: 201 }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'AI_RISK_RESPONSE_INVALID') {
      return noStore(
        { error: 'ARC AI returned an invalid risk suggestion structure. No Risk Register data was changed.' },
        { status: 502 }
      );
    }
    console.error('AI BPM risk identification failed:', error);
    return noStore(
      { error: 'Unable to generate BPM-based risk suggestions with the configured AI provider.' },
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
        { error: 'BPM, AI suggestion batch, and at least one selected risk are required.' },
        { status: 400 }
      );
    }
    if (!ownerName) {
      return noStore(
        { error: 'Confirm the accountable Risk Owner before creating selected risks.' },
        { status: 400 }
      );
    }

    const process = await findBusinessProcessForAi({ processId }, context.institution!.id) as Record<string, any> | null;
    if (!process) {
      return noStore({ error: 'Selected Business Process was not found in the active institution.' }, { status: 404 });
    }

    const batch = await getAiRiskSuggestionBatch(batchId, String(process.id), context.institution!.id);
    if (!batch) {
      return noStore({ error: 'AI risk suggestion batch was not found for the selected BPM.' }, { status: 404 });
    }

    const bpmContext = buildBpmRiskContext(process);
    const currentFingerprint = await fingerprintAiRiskContext(fingerprintSource(bpmContext));
    if (currentFingerprint !== batch.sourceFingerprint) {
      return noStore(
        {
          error:
            'The selected BPM has changed since these risks were generated. Generate a new AI risk batch before creating Risk Register entries.',
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
          ? result.created.length + ' selected AI risk(s) created as Draft / Not Assessed.'
          : 'No new risks were created. Selected suggestions were already applied or matched existing risks.',
      humanAssessmentRequired: true
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      PROCESS_NOT_FOUND: ['Selected Business Process was not found in the active institution.', 404],
      AI_RISK_BATCH_NOT_FOUND: ['AI risk suggestion batch was not found.', 404],
      AI_RISK_SELECTION_REQUIRED: ['Select at least one AI risk suggestion.', 400],
      AI_RISK_SELECTION_INVALID: ['One or more selected risks are not part of this saved AI batch.', 400],
      RISK_OWNER_REQUIRED: ['Confirm the accountable Risk Owner before creating risks.', 400]
    };
    if (known[code]) {
      return noStore({ error: known[code][0] }, { status: known[code][1] });
    }

    console.error('Failed to create selected AI BPM risks:', error);
    return noStore({ error: 'Unable to create selected AI risks in the Risk Register.' }, { status: 500 });
  }
}
