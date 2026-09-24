import { NextResponse } from 'next/server';
import { runAiGateway } from '@/lib/ai/gateway';
import { guardAiPost } from '@/lib/ai/http-security';
import { listRisks } from '@/lib/d1-core';
import { resolveInstitutionAccess } from '@/lib/institution-context';

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
    throw new Error('Respons AI bukan JSON yang valid');
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
    const context = await resolveInstitutionAccess(request);
    if (!context?.institution) {
      return NextResponse.json(
        { error: 'Institusi aktif wajib tersedia.' },
        { status: context ? 409 : 401 }
      );
    }
    const guarded = await guardAiPost(request, 'AI_ANALYZE_RATE_LIMIT');
    if (!guarded.ok) return guarded.response;

    const mode: HeatmapMode =
      guarded.body.mode === 'residual' ? 'residual' : 'inherent';

    const risks = await listRisks(context.institution.id);
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
      const category = String(risk.category || 'Belum Dikategorikan');
      const processName = String(risk.process?.name || 'Proses belum ditetapkan');
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
      'Anda adalah AI Total ARC, kopilot manajemen risiko perusahaan dan pengendalian internal.',
      'Jelaskan heatmap risiko 5x5 yang diberikan hanya menggunakan statistik yang berasal dari database.',
      'Jangan mengarang skor risiko, likelihood, impact, insiden, akar penyebab, kontrol, regulasi, ambang batas, atau kesimpulan manajemen.',
      'Risiko yang belum dinilai tidak boleh dianggap sebagai risiko rendah dan tidak boleh ditempatkan ke sel heatmap.',
      'Jika cakupan asesmen rendah, jadikan kualitas data dan penyelesaian asesmen tervalidasi sebagai pesan utama.',
      'Bedakan observasi dari rekomendasi.',
      'Untuk heatmap residual, bahas pergerakan inheren-ke-residual hanya jika comparisonEligible lebih besar dari nol.',
      'Gunakan Bahasa Indonesia profesional yang sesuai untuk manajemen dan pemilik risiko.',
      'Return JSON only with this shape: {"headline":"string","executiveSummary":"string","dataQuality":"string","concentrationInsights":["string"],"managementActions":["string"],"caution":"string"}.',
      'Maksimum 5 concentrationInsights dan 5 managementActions. Semua nilai teks yang ditampilkan kepada pengguna wajib menggunakan Bahasa Indonesia.'
    ].join(' ');

    const result = await runAiGateway({
      task: 'summarization',
      sensitivity: 'confidential',
      systemPrompt,
      prompt:
        'Analisis dataset heatmap risiko Total ARC berikut. Tampilan yang dipilih adalah ' +
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
            : 'Analisis heatmap risiko selesai.',
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
            : 'Analisis yang dihasilkan AI memerlukan review manusia sebelum digunakan dalam keputusan risiko.'
      },
      ai: {
        requestId: result.requestId,
        provider: result.provider,
        model: result.model,
        fallbackUsed: result.fallbackUsed,
        durationMs: result.durationMs
      },
      disclaimer: 'Usulan AI — Memerlukan Review Manusia'
    });
  } catch (error) {
    console.error('AI risk heatmap analysis failed:', error);
    return NextResponse.json(
      { error: 'Gagal menghasilkan analisis heatmap risiko dengan AI.' },
      { status: 503 }
    );
  }
}
