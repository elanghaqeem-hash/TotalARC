import { NextResponse } from 'next/server';
import { runAiGateway } from '@/lib/ai/gateway';
import { guardAiPost } from '@/lib/ai/http-security';
import { listRisks } from '@/lib/d1-core';

export const dynamic = 'force-dynamic';

type HeatmapMode = 'inherent' | 'residual';

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

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

function stringList(value: unknown, limit = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, limit)
    .map(item => item.trim());
}

function ratingBand(score: number) {
  if (score >= 15) return 'Critical';
  if (score >= 10) return 'High';
  if (score >= 5) return 'Medium';
  if (score >= 1) return 'Low';
  return 'Not Assessed';
}

export async function POST(request: Request) {
  try {
    const guarded = await guardAiPost(request, 'AI_RISK_HEATMAP_RATE_LIMIT');
    if (!guarded.ok) return guarded.response;

    const mode: HeatmapMode =
      guarded.body.mode === 'residual' ? 'residual' : 'inherent';

    const risks = await listRisks();
    const likelihoodField =
      mode === 'inherent' ? 'inherentLikelihood' : 'residualLikelihood';
    const impactField =
      mode === 'inherent' ? 'inherentImpact' : 'residualImpact';
    const scoreField =
      mode === 'inherent' ? 'inherentScore' : 'residualScore';

    const cells: Array<{
      likelihood: number;
      impact: number;
      score: number;
      count: number;
    }> = [];

    const assessedRisks: Array<Record<string, unknown>> = [];
    const bandCounts = { Low: 0, Medium: 0, High: 0, Critical: 0 };

    for (let likelihood = 5; likelihood >= 1; likelihood -= 1) {
      for (let impact = 1; impact <= 5; impact += 1) {
        const score = likelihood * impact;
        const matching = risks.filter((risk: any) => {
          return (
            Number(risk[likelihoodField] || 0) === likelihood &&
            Number(risk[impactField] || 0) === impact
          );
        });

        cells.push({ likelihood, impact, score, count: matching.length });
      }
    }

    for (const risk of risks as any[]) {
      const likelihood = Number(risk[likelihoodField] || 0);
      const impact = Number(risk[impactField] || 0);
      const score = Number(risk[scoreField] || 0);
      if (
        likelihood >= 1 &&
        likelihood <= 5 &&
        impact >= 1 &&
        impact <= 5 &&
        score > 0
      ) {
        assessedRisks.push(risk);
        const band = ratingBand(score);
        if (band !== 'Not Assessed') {
          bandCounts[band as keyof typeof bandCounts] += 1;
        }
      }
    }

    const total = risks.length;
    const assessed = assessedRisks.length;
    const unassessed = Math.max(0, total - assessed);
    const coveragePct = total > 0 ? Math.round((assessed / total) * 1000) / 10 : 0;

    const byCategory = new Map<string, number>();
    const byProcess = new Map<string, number>();
    for (const risk of risks as any[]) {
      const category = String(risk.category || 'Uncategorized');
      const processName = String(risk.process?.name || 'Unassigned process');
      byCategory.set(category, (byCategory.get(category) || 0) + 1);
      byProcess.set(processName, (byProcess.get(processName) || 0) + 1);
    }

    const sortedCounts = (map: Map<string, number>) =>
      Array.from(map.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 8)
        .map(([name, count]) => ({ name, count }));

    const topAssessed = assessedRisks
      .slice()
      .sort(
        (a: any, b: any) =>
          Number(b[scoreField] || 0) - Number(a[scoreField] || 0)
      )
      .slice(0, 12)
      .map((risk: any) => ({
        riskId: risk.riskId,
        name: risk.name,
        category: risk.category,
        processName: risk.process?.name || null,
        likelihood: Number(risk[likelihoodField] || 0),
        impact: Number(risk[impactField] || 0),
        score: Number(risk[scoreField] || 0),
        rating: risk[mode === 'inherent' ? 'inherentRating' : 'residualRating']
      }));

    let improved = 0;
    let unchanged = 0;
    let worsened = 0;
    let comparisonEligible = 0;
    for (const risk of risks as any[]) {
      const inherentScore = Number(risk.inherentScore || 0);
      const residualScore = Number(risk.residualScore || 0);
      if (inherentScore <= 0 || residualScore <= 0) continue;
      comparisonEligible += 1;
      if (residualScore < inherentScore) improved += 1;
      else if (residualScore > inherentScore) worsened += 1;
      else unchanged += 1;
    }

    const heatmapContext = {
      mode,
      totalRisks: total,
      assessedRisks: assessed,
      unassessedRisks: unassessed,
      assessmentCoveragePct: coveragePct,
      bandCounts,
      cells,
      topAssessed,
      categoryDistribution: sortedCounts(byCategory),
      processDistribution: sortedCounts(byProcess),
      inherentVsResidual: {
        comparisonEligible,
        improved,
        unchanged,
        worsened
      }
    };

    const systemPrompt = [
      'You are Total ARC AI, an enterprise risk management and internal control copilot.',
      'Explain the supplied 5x5 risk heatmap using only the supplied database-derived statistics.',
      'Do not invent risk scores, likelihoods, impacts, incidents, root causes, controls, regulations, thresholds, or management conclusions.',
      'Unassessed risks must never be treated as low risk and must not be placed into heatmap cells.',
      'When assessment coverage is low, make data quality and completion of validated assessment the primary message.',
      'Differentiate observation from recommendation.',
      'For residual heatmaps, only discuss inherent-to-residual movement when comparisonEligible is greater than zero.',
      'Keep wording suitable for management and risk owners.',
      'Return JSON only with this shape: {"headline":"string","executiveSummary":"string","dataQuality":"string","concentrationInsights":["string"],"managementActions":["string"],"caution":"string"}.',
      'Maximum 5 concentrationInsights and 5 managementActions.'
    ].join(' ');

    const result = await runAiGateway({
      task: 'summarization',
      sensitivity: 'confidential',
      systemPrompt,
      prompt:
        'Analyze this Total ARC risk heatmap dataset. The selected view is ' +
        mode +
        '.\n' +
        JSON.stringify(heatmapContext),
      temperature: 0.1,
      maxOutputTokens: 1800,
      requireJson: true
    });

    const parsed = parseJsonObject(result.text);

    return NextResponse.json({
      mode,
      generatedAt: new Date().toISOString(),
      metrics: {
        total,
        assessed,
        unassessed,
        coveragePct,
        bandCounts,
        comparisonEligible,
        improved,
        unchanged,
        worsened
      },
      analysis: {
        headline:
          typeof parsed.headline === 'string'
            ? parsed.headline
            : 'Risk heatmap analysis completed.',
        executiveSummary:
          typeof parsed.executiveSummary === 'string'
            ? parsed.executiveSummary
            : '',
        dataQuality:
          typeof parsed.dataQuality === 'string'
            ? parsed.dataQuality
            : '',
        concentrationInsights: stringList(parsed.concentrationInsights, 5),
        managementActions: stringList(parsed.managementActions, 5),
        caution:
          typeof parsed.caution === 'string'
            ? parsed.caution
            : 'AI-generated analysis requires human review before use in risk decisions.'
      },
      ai: {
        requestId: result.requestId,
        provider: result.provider,
        model: result.model,
        fallbackUsed: result.fallbackUsed,
        durationMs: result.durationMs
      },
      disclaimer: 'AI Suggested — Human Review Required'
    });
  } catch (error) {
    console.error('AI risk heatmap analysis failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate AI risk heatmap analysis.' },
      { status: 503 }
    );
  }
}
