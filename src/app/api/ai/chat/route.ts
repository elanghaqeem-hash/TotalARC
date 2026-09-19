import { NextResponse } from 'next/server';
import { runAiGateway } from '@/lib/ai/gateway';
import { guardAiPost } from '@/lib/ai/http-security';
import type { AiTask } from '@/lib/ai/types';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { recordMutationAudit } from '@/lib/d1-core';
import { guardMutationRequest, mutationActorFromRequest } from '@/lib/mutation-security';

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
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;
  const mutationGuard = guardMutationRequest(request);
  if (mutationGuard) return mutationGuard;
  const actor = mutationActorFromRequest(request, auth.user);

  try {
    const guarded = await guardAiPost(request, 'AI_CHAT_RATE_LIMIT');
    if (!guarded.ok) return guarded.response;

    const body = guarded.body;
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const context =
      body.context && typeof body.context === 'object'
        ? '\n\nTotal ARC context:\n' + JSON.stringify(body.context)
        : '';

    const result = await runAiGateway({
      task: taskFrom(body.task),
      sensitivity: 'confidential',
      systemPrompt: [
        'You are Total ARC AI, a Governance, Risk, Compliance, ICOFR and Internal Control copilot.',
        'Use supplied facts and context. Clearly distinguish evidence from suggestions.',
        'Do not fabricate regulations, evidence, control performance, test results or approvals.',
        'Never autonomously approve, reject, change ratings, close issues, or write to business records.',
        'Every recommendation must remain subject to human review.',
        'Reply in the language used by the user unless explicitly asked otherwise.'
      ].join(' '),
      prompt: message + context,
      temperature: 0.2,
      maxOutputTokens: 4096
    });

    await recordMutationAudit({
      institutionId: auth.user.institutionId,
      action: 'AI_CHAT',
      entityType: 'AIRequest',
      recordId: result.requestId,
      newValue: {
        provider: result.provider,
        model: result.model,
        task: taskFrom(body.task),
        fallbackUsed: result.fallbackUsed,
        redactionCount: result.redactions || 0
      },
      reason: 'Authenticated user invoked Total ARC AI chat. Prompt content is intentionally excluded from the audit record.'
    }, actor);

    return NextResponse.json({
      answer: result.text,
      disclaimer: 'AI Suggested — Human Review Required',
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
        error: 'AI assistant is unavailable.'
      },
      { status: 503 }
    );
  }
}
