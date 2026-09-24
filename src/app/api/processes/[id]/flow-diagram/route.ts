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
      return noStore({ error: 'Business process was not found in the active institution.' }, { status: 404 });
    }
    console.error('Failed to load process flow workspace:', error);
    return noStore({ error: 'Failed to load saved process flow.' }, { status: 503 });
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
          error: 'Activity Register is empty. Add or validate process activities before generating a flow.'
        },
        { status: 409 }
      );
    }

    const systemPrompt = [
      'You are Total ARC AI preparing structured business-process content for the Total ARC deterministic flow renderer.',
      'Return structured JSON only; never draw SVG, HTML, Mermaid, ASCII diagrams, coordinates, colors, typography, or layout instructions.',
      'Use only the supplied Activity Register source data.',
      'Do not invent steps, roles, systems, controls, approvals, thresholds, regulations, events, branches, exceptions, or missing facts.',
      'Preserve the exact number and order of source activities.',
      'For every step, return the exact sourceActivityId from the input.',
      'Keep each step title concise and mobile-friendly: preferably 3-9 words and never more than 90 characters; shorten wording only when meaning is preserved.',
      'Classify kind as decision only when the source wording clearly represents a decision, approval, authorization, validation, or conditional check; otherwise use task.',
      'Keep note concise: one plain-language sentence grounded only in the source activity, preferably under 140 characters. Use an empty string when the source does not support a useful note.',
      'Do not repeat performer, system, status, sequence number, or process name inside title or note because Total ARC renders those fields separately.',
      'If a source value is missing, leave it missing; do not replace it with assumptions.',
      'The renderer will enforce dynamic card height, separate status chips, safe text wrapping, non-overlapping connectors, and mobile spacing.',
      'Return JSON only: {"title":"string","summary":"string","steps":[{"sourceActivityId":"string","activityId":"string","order":1,"title":"string","kind":"task|decision","note":"string"}]}.'
    ].join(' ');

    const result = await runAiGateway({
      task: 'process_flow',
      sensitivity: 'confidential',
      systemPrompt,
      prompt:
        'Create concise structured flow content from this registered Total ARC BPM source. The visual layout is rendered by Total ARC, not by the AI.\n' +
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
      return noStore({ error: 'Business process was not found in the active institution.' }, { status: 404 });
    }
    if (code === 'PROCESS_SOURCE_CHANGED') {
      return noStore(
        { error: 'Activity Register changed while the flow was being generated. Please generate again.' },
        { status: 409 }
      );
    }
    if (code === 'AI_FLOW_INVALID') {
      return noStore(
        { error: 'AI returned an invalid flow structure. The existing saved flow was not changed.' },
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
      return noStore({ error: 'Business process was not found in the active institution.' }, { status: 404 });
    }
    if (code === 'FLOW_NOT_FOUND') {
      return noStore({ error: 'Saved flow version was not found in the active institution.' }, { status: 404 });
    }
    console.error('Failed to activate saved process flow:', error);
    return noStore({ error: 'Failed to activate the saved process-flow version.' }, { status: 500 });
  }
}
