import { NextResponse } from 'next/server';
import { authorizeTenantApi } from '@/lib/api-auth';
import { isOrgUnitAuthorized, resolveAuthorizedOrgUnitIds } from '@/lib/auth';
import { runAiGateway } from '@/lib/ai/gateway';
import { guardAiPost } from '@/lib/ai/http-security';
import {
  applyAiRegulatoryDraft,
  getRegulatoryReport,
  getRegulatoryReportEvidence
} from '@/lib/d1-reporting';
import { getRegulatoryReportTemplate } from '@/lib/regulatory-report-templates';
import { guardMutationRequest, mutationActorFromRequest } from '@/lib/mutation-security';

export const dynamic = 'force-dynamic';

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

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

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, 20)
    : [];
}

function normalizeSections(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 40)
    .map(item => {
      const row = item && typeof item === 'object'
        ? item as Record<string, unknown>
        : {};
      return {
        sectionKey: text(row.sectionKey),
        content: text(row.content),
        analysisSummary: text(row.analysisSummary),
        keyFindings: text(row.keyFindings),
        rootCause: text(row.rootCause),
        impactAnalysis: text(row.impactAnalysis),
        recommendation: text(row.recommendation),
        rating: text(row.rating),
        evidenceReference: text(row.evidenceReference)
      };
    })
    .filter(item => Boolean(item.sectionKey));
}

export async function POST(request: Request) {
  const auth = await authorizeTenantApi(
    request,
    ['Admin', 'Reviewer', 'Executive', 'Auditor']
  );
  if (auth.response) return auth.response;

  const mutationGuard = guardMutationRequest(request);
  if (mutationGuard) return mutationGuard;

  const actor = mutationActorFromRequest(request, auth.user);

  try {
    const guarded = await guardAiPost(request, 'AI_ANALYZE_RATE_LIMIT');
    if (!guarded.ok) return guarded.response;

    const body = guarded.body;
    const reportId = text(body.reportId);
    const applyToContent = body.applyToContent !== false;

    if (!reportId) {
      return NextResponse.json({ error: 'reportId is required.' }, { status: 400 });
    }

    const [report, authorizedOrgUnitIds] = await Promise.all([
      getRegulatoryReport(reportId, auth.user.institutionId),
      resolveAuthorizedOrgUnitIds(auth.user)
    ]);

    if (!report) {
      return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
    }

    if (
      !isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        typeof report.orgUnitId === 'string' ? report.orgUnitId : null
      )
    ) {
      return NextResponse.json(
        {
          error: 'Your account is not authorized for this report organization scope.',
          code: 'REPORT_ORGANIZATION_SCOPE_FORBIDDEN'
        },
        { status: 403 }
      );
    }

    const template = getRegulatoryReportTemplate(String(report.templateCode || ''));
    if (!template) {
      return NextResponse.json({ error: 'Report template not found.' }, { status: 404 });
    }

    const evidence = await getRegulatoryReportEvidence(
      reportId,
      auth.user.institutionId
    );

    const sectionContext = (report.sections || []).map((section: Record<string, unknown>) => ({
      sectionKey: section.sectionKey,
      title: section.title,
      guidance: section.guidance,
      regulatoryReference: section.regulatoryReference,
      existingContent: section.content || null,
      existingAnalysisSummary: section.analysisSummary || null,
      existingKeyFindings: section.keyFindings || null,
      existingRootCause: section.rootCause || null,
      existingImpactAnalysis: section.impactAnalysis || null,
      existingRecommendation: section.recommendation || null,
      existingEvidenceReference: section.evidenceReference || null
    }));

    const systemPrompt = [
      'You are Total ARC AI acting as an advisory regulatory reporting analyst for Indonesian financial institutions.',
      'Draft only from the supplied persisted Total ARC evidence, the existing human-entered report text, and the supplied OJK template references.',
      'Do not invent financial figures, compliance status, incidents, regulations, dates, management approvals, control effectiveness, audit conclusions, or OJK ratings.',
      'When evidence is insufficient, explicitly write "Data/evidence belum memadai dan memerlukan validasi manusia" instead of guessing.',
      'Separate facts from analysis. Every material statement should identify its evidence basis using the supplied counts, risk IDs, issue IDs, process IDs, or existing report content.',
      'For OJK publication templates that require official annex/Excel formats, do not generate missing financial numbers; state that official reconciled financial data is required.',
      'AI output is a draft only. It cannot approve, certify, finalize, or submit a regulatory report.',
      'Return JSON only in this exact structure:',
      '{"overallAnalysis":"string","executiveSummary":"string","conclusion":"string","overallRating":"string","evidenceGaps":["string"],"sections":[{"sectionKey":"string","content":"string","analysisSummary":"string","keyFindings":"string","rootCause":"string","impactAnalysis":"string","recommendation":"string","rating":"string","evidenceReference":"string"}]}.',
      'Return one section object for every supplied sectionKey. Keep narrative concise, formal, auditable, and suitable for later human editing.'
    ].join(' ');

    const prompt = JSON.stringify({
      report: {
        id: report.id,
        title: report.title,
        templateCode: report.templateCode,
        period: report.period,
        reportingDate: report.reportingDate,
        status: report.status,
        overallRating: report.overallRating,
        executiveSummary: report.executiveSummary,
        conclusion: report.conclusion,
        legalEntityId: report.legalEntityId,
        orgUnitId: report.orgUnitId
      },
      template: {
        name: template.name,
        institutionScope: template.institutionScope,
        regulationReferences: template.regulationReferences,
        effectiveFrom: template.effectiveFrom,
        verifiedAsOf: template.verifiedAsOf,
        officialAnnexRequired: template.officialAnnexRequired,
        submissionNote: template.submissionNote
      },
      evidence,
      sections: sectionContext
    });

    const result = await runAiGateway({
      task: 'report_drafting',
      sensitivity: 'confidential',
      systemPrompt,
      prompt,
      temperature: 0.1,
      maxOutputTokens: 8192,
      requireJson: true
    });

    const parsed = parseJsonObject(result.text);
    const sections = normalizeSections(parsed.sections);

    if (sections.length === 0) {
      return NextResponse.json(
        { error: 'AI returned no structured report sections.' },
        { status: 502 }
      );
    }

    const updated = await applyAiRegulatoryDraft(
      reportId,
      auth.user.institutionId,
      {
        overallAnalysis: text(parsed.overallAnalysis) || null,
        executiveSummary: text(parsed.executiveSummary) || null,
        conclusion: text(parsed.conclusion) || null,
        overallRating: text(parsed.overallRating) || null,
        evidenceGaps: stringArray(parsed.evidenceGaps),
        sections,
        provider: result.provider,
        model: result.model,
        requestId: result.requestId,
        evidenceSnapshot: evidence,
        applyToContent
      },
      actor
    );

    return NextResponse.json({
      report: updated,
      disclaimer: 'AI Draft — Human Review Required',
      evidence,
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
    console.error('Regulatory report AI drafting failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate regulatory report analysis with configured AI providers.' },
      { status: 503 }
    );
  }
}
