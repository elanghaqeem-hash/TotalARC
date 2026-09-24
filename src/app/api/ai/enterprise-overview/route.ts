import { NextResponse } from 'next/server';
import { runAiGateway } from '@/lib/ai/gateway';
import { guardAiPost } from '@/lib/ai/http-security';
import { getRcsaWorkspaceData } from '@/lib/d1-rcsa';
import {
  listMonitoringRules,
  listRemediationData,
  listToeTests
} from '@/lib/d1-assurance';
import { listDesignAssessments } from '@/lib/d1-icofr-traceability';
import {
  listFinancialItems,
  listInformationRegister
} from '@/lib/d1-icofr-domains';
import { getTestingPlanData } from '@/lib/d1-icofr-testing-plan';
import { getCertificationData } from '@/lib/d1-icofr-certification';

export const dynamic = 'force-dynamic';

type OverviewAnalysis = {
  headline: string;
  executiveSummary: string;
  icofrInsight: string;
  riskInsight: string;
  complianceInsight: string;
  priorityInsight: string;
  recommendations: string[];
  caution: string;
};

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

function stringList(value: unknown, limit = 5): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, limit)
    .map(item => item.trim());
}

function textValue(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function ratioPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, numerator / denominator)) * 1000) / 10;
}

function isClosed(status: unknown) {
  return ['Closed', 'Completed', 'Cancelled', 'Accepted'].includes(String(status || ''));
}

function isCompletedTest(test: Record<string, unknown>, type: 'tod' | 'toe') {
  if (type === 'tod') {
    return (
      test.status === 'Approved' ||
      test.status === 'Completed' ||
      ['Effective', 'Ineffective', 'Partially Effective'].includes(String(test.conclusion || ''))
    );
  }

  return (
    test.status === 'Completed' ||
    test.status === 'Reviewed' ||
    ['Effective', 'Effective with Minor Exception', 'Partially Effective', 'Ineffective'].includes(
      String(test.finalConclusion || test.testerConclusion || '')
    )
  );
}

function readinessSignal(input: {
  processCount: number;
  riskCount: number;
  riskAssessedPct: number;
  controlCount: number;
  controlAssessedPct: number;
  rcsaCampaigns: number;
  keyControlCount: number;
  todCompleted: number;
  toeCompleted: number;
  testingPlanItems: number;
  testingPlanCompleted: number;
  attestationCount: number;
  evidencePackCount: number;
}) {
  const {
    processCount,
    riskCount,
    riskAssessedPct,
    controlCount,
    controlAssessedPct,
    rcsaCampaigns,
    keyControlCount,
    todCompleted,
    toeCompleted,
    testingPlanItems,
    testingPlanCompleted,
    attestationCount,
    evidencePackCount
  } = input;

  if (processCount === 0 && riskCount === 0 && controlCount === 0) {
    return {
      score: 0,
      label: 'Insufficient Data',
      description: 'Data persisted belum cukup untuk membentuk readiness signal.'
    };
  }

  let score = 0;
  if (processCount > 0) score += 5;
  if (riskCount > 0) score += 5;
  if (controlCount > 0) score += 5;
  score += Math.round((riskAssessedPct / 100) * 15);
  score += Math.round((controlAssessedPct / 100) * 10);

  if (rcsaCampaigns > 0) score += 10;

  if (keyControlCount > 0) {
    score += Math.round(Math.min(1, todCompleted / keyControlCount) * 10);
    score += Math.round(Math.min(1, toeCompleted / keyControlCount) * 15);
  }

  if (testingPlanItems > 0) {
    score += Math.round(Math.min(1, testingPlanCompleted / testingPlanItems) * 15);
  }

  if (attestationCount > 0) score += 5;
  if (evidencePackCount > 0) score += 5;

  score = Math.min(100, score);

  if (score >= 80) {
    return {
      score,
      label: 'Strong',
      description: 'Coverage data dan aktivitas assurance relatif matang.'
    };
  }
  if (score >= 55) {
    return {
      score,
      label: 'Moderate',
      description: 'Fondasi tersedia, tetapi masih terdapat area yang perlu diperkuat.'
    };
  }
  if (score >= 30) {
    return {
      score,
      label: 'Needs Attention',
      description: 'Coverage assurance masih terbatas dan membutuhkan prioritas tindak lanjut.'
    };
  }
  return {
    score,
    label: 'Early Stage',
    description: 'Fondasi awal tersedia, namun evidence dan aktivitas assurance masih sangat terbatas.'
  };
}

function fallbackAnalysis(metrics: Record<string, any>, readiness: ReturnType<typeof readinessSignal>): OverviewAnalysis {
  const recommendations: string[] = [];

  if (metrics.rcsa.campaigns === 0) {
    recommendations.push('Lengkapi dan jalankan kampanye RCSA / CSA pada unit dan proses yang relevan.');
  }
  if (metrics.icofr.todCompleted === 0 || metrics.icofr.toeCompleted === 0) {
    recommendations.push('Prioritaskan penyusunan, pelaksanaan, dan review ToD serta ToE untuk key controls.');
  }
  if (metrics.icofr.evidencePacks === 0) {
    recommendations.push('Lengkapi evidence repository dan evidence pack untuk kontrol serta periode ICOFR yang relevan.');
  }
  if (metrics.remediation.openMaps > 0 || metrics.remediation.openIssues > 0) {
    recommendations.push('Pantau open issues dan MAP sampai closure serta retest yang memadai.');
  }
  if (metrics.compliance.regulatoryMappedControls < metrics.controls.total) {
    recommendations.push('Perkuat regulatory mapping pada control library dan dokumentasikan dasar kepatuhan yang relevan.');
  }
  if (recommendations.length < 5) {
    recommendations.push('Gunakan executive reporting secara periodik untuk review manajemen, Komite Audit, dan fungsi assurance.');
  }

  const highResidual = metrics.risks.highResidual + metrics.risks.criticalResidual;
  const assessmentMessage =
    metrics.risks.total > 0
      ? `${metrics.risks.assessed} dari ${metrics.risks.total} risiko memiliki residual assessment yang terisi; ${highResidual} berada pada residual High/Critical.`
      : 'Belum ada risk register persisted yang dapat dianalisis.';

  const testingMessage =
    metrics.controls.keyControls > 0
      ? `Key controls: ${metrics.controls.keyControls}; ToD completed: ${metrics.icofr.todCompleted}; ToE completed: ${metrics.icofr.toeCompleted}.`
      : 'Key control belum teridentifikasi pada data persisted.';

  return {
    headline: `Readiness signal: ${readiness.label}`,
    executiveSummary:
      `Total ARC menemukan ${metrics.processes.total} proses, ${metrics.risks.total} risiko, dan ${metrics.controls.total} kontrol pada data persisted. ` +
      `${assessmentMessage} ${testingMessage} Readiness signal ini mengukur kelengkapan data dan coverage assurance, bukan opini audit.`,
    icofrInsight:
      `ICOFR memiliki ${metrics.icofr.significantFinancialItems} significant financial item(s), ${metrics.controls.icoFrKeyControls} ICOFR key control(s), ${metrics.icofr.testingPlanItems} testing plan item(s), dan ${metrics.icofr.evidencePacks} evidence pack(s).`,
    riskInsight:
      `${assessmentMessage} Risk assessment coverage sebesar ${metrics.risks.assessmentCoveragePct}% berdasarkan residual score yang tersedia.`,
    complianceInsight:
      `${metrics.compliance.regulatoryMappedControls} dari ${metrics.controls.total} kontrol memiliki explicit regulation mapping dan ${metrics.compliance.frameworkMappedControls} memiliki framework mapping. Lensa kepatuhan dibatasi pada data mapping dan evidence yang tersimpan di Total ARC.`,
    priorityInsight:
      metrics.rcsa.campaigns === 0 || metrics.icofr.todCompleted === 0 || metrics.icofr.toeCompleted === 0
        ? 'Prioritas utama adalah mengaktifkan RCSA/CSA, testing, evidencing, dan review berkelanjutan sebelum menarik kesimpulan assurance yang lebih kuat.'
        : 'Prioritaskan closure exception, konsistensi evidence, dan monitoring periodik agar coverage assurance tetap terjaga.',
    recommendations: recommendations.slice(0, 5),
    caution:
      'Analisis ini tidak menyatakan opini audit atau kesimpulan kepatuhan hukum. Validasi manusia dan review oleh fungsi yang berwenang tetap diperlukan.'
  };
}

export async function POST(request: Request) {
  try {
    const guarded = await guardAiPost(request, 'AI_ANALYZE_RATE_LIMIT');
    if (!guarded.ok) return guarded.response;

    const [
      rcsa,
      todTests,
      toeTests,
      remediation,
      monitoringRules,
      financialItems,
      informationRegister,
      testingPlan,
      certification
    ] = await Promise.all([
      getRcsaWorkspaceData(),
      listDesignAssessments(),
      listToeTests(),
      listRemediationData(),
      listMonitoringRules(),
      listFinancialItems(),
      listInformationRegister(),
      getTestingPlanData(),
      getCertificationData()
    ]);

    const institutionId = String(rcsa.institution?.id || '');
    const controlRows = (rcsa.controls || []) as Array<Record<string, any>>;
    const riskRows = (rcsa.risks || []) as Array<Record<string, any>>;
    const todRows = todTests as Array<Record<string, any>>;
    const toeRows = (toeTests as Array<Record<string, any>>).filter(
      test =>
        !institutionId ||
        String(test.control?.institutionId || '') === institutionId
    );
    const issueRows = (remediation.issues || []).filter(
      (item: any) => !institutionId || String(item.institutionId || '') === institutionId
    );
    const mapRows = (remediation.maps || []).filter(
      (item: any) =>
        !institutionId ||
        String(item.issue?.institutionId || '') === institutionId
    );
    const monitoringRows = (monitoringRules || []).filter(
      (rule: any) =>
        !institutionId ||
        String(rule.control?.institutionId || '') === institutionId
    );

    const assessedRisks = riskRows.filter(risk => Number(risk.residualScore || 0) > 0);
    const highResidual = riskRows.filter(risk => String(risk.residualRating || '').toLowerCase() === 'high').length;
    const criticalResidual = riskRows.filter(risk => String(risk.residualRating || '').toLowerCase() === 'critical').length;
    const keyControls = controlRows.filter(control => Boolean(control.isKeyControl));
    const icoFrKeyControls = controlRows.filter(control => Boolean(control.isIcofrKey));
    const assessedControls = controlRows.filter(control => {
      const design = String(control.designAssessment || 'Not Assessed');
      const operating = String(control.operatingStatus || 'Not Assessed');
      const health = String(control.overallHealth || 'Not Assessed');
      return design !== 'Not Assessed' || operating !== 'Not Assessed' || health !== 'Not Assessed';
    });
    const attentionControls = controlRows.filter(control =>
      ['Attention Required', 'Deficient', 'Ineffective'].includes(String(control.overallHealth || ''))
    );
    const regulatoryMappedControls = controlRows.filter(control =>
      textValue(control.regulationMapping).length > 0
    );
    const frameworkMappedControls = controlRows.filter(control =>
      textValue(control.frameworkMapping).length > 0
    );
    const complianceRisks = riskRows.filter(risk =>
      /(compliance|regulatory|kepatuhan)/i.test(String(risk.category || ''))
    );
    const highComplianceRisks = complianceRisks.filter(risk =>
      ['High', 'Critical'].includes(String(risk.residualRating || ''))
    );

    const completedTod = todRows.filter(test => isCompletedTest(test, 'tod')).length;
    const completedToe = toeRows.filter(test => isCompletedTest(test, 'toe')).length;
    const openIssues = issueRows.filter((item: any) => !isClosed(item.status)).length;
    const openMaps = mapRows.filter((item: any) => !isClosed(item.status)).length;
    const overduePlanItems = Number((testingPlan.metrics as any)?.overdue || 0);
    const completedPlanItems = Number((testingPlan.metrics as any)?.completed || 0);
    const testingPlanItems = Number((testingPlan.metrics as any)?.totalPlanItems || testingPlan.planItems?.length || 0);
    const significantFinancialItems = (financialItems.records || []).filter((item: any) => Boolean(item.significant)).length;
    const completedMonitoringRuns = monitoringRows.flatMap((rule: any) => rule.runs || []);
    const monitoringExceptions = completedMonitoringRuns.filter((run: any) =>
      Number(run.exceptionsFound || 0) > 0 || String(run.status || '') === 'Exception Detected'
    ).length;

    const metrics = {
      institution: {
        name: rcsa.institution?.name || certification.institution?.name || financialItems.institution?.name || null
      },
      processes: {
        total: rcsa.processes?.length || 0
      },
      risks: {
        total: riskRows.length,
        assessed: assessedRisks.length,
        unassessed: Math.max(0, riskRows.length - assessedRisks.length),
        assessmentCoveragePct: ratioPercent(assessedRisks.length, riskRows.length),
        highResidual,
        criticalResidual
      },
      controls: {
        total: controlRows.length,
        keyControls: keyControls.length,
        icoFrKeyControls: icoFrKeyControls.length,
        assessed: assessedControls.length,
        assessedPct: ratioPercent(assessedControls.length, controlRows.length),
        attentionRequired: attentionControls.length
      },
      rcsa: {
        campaigns: rcsa.campaigns?.length || 0
      },
      icofr: {
        financialItems: financialItems.records?.length || 0,
        significantFinancialItems,
        informationItems: informationRegister.records?.length || 0,
        todTests: todRows.length,
        todCompleted: completedTod,
        toeTests: toeRows.length,
        toeCompleted: completedToe,
        testingPlanItems,
        testingPlanCompleted: completedPlanItems,
        testingPlanOverdue: overduePlanItems,
        attestations: certification.attestations?.length || 0,
        evidencePacks: certification.evidencePacks?.length || 0
      },
      compliance: {
        regulatoryMappedControls: regulatoryMappedControls.length,
        regulatoryMappingCoveragePct: ratioPercent(regulatoryMappedControls.length, controlRows.length),
        frameworkMappedControls: frameworkMappedControls.length,
        frameworkMappingCoveragePct: ratioPercent(frameworkMappedControls.length, controlRows.length),
        complianceRisks: complianceRisks.length,
        highOrCriticalComplianceRisks: highComplianceRisks.length
      },
      remediation: {
        openIssues,
        openMaps,
        totalDeficiencies: new Set(
          issueRows.map((item: any) => String(item.deficiencyId || '')).filter(Boolean)
        ).size
      },
      monitoring: {
        rules: monitoringRows.length,
        runs: completedMonitoringRuns.length,
        runsWithException: monitoringExceptions
      }
    };

    const readiness = readinessSignal({
      processCount: metrics.processes.total,
      riskCount: metrics.risks.total,
      riskAssessedPct: metrics.risks.assessmentCoveragePct,
      controlCount: metrics.controls.total,
      controlAssessedPct: metrics.controls.assessedPct,
      rcsaCampaigns: metrics.rcsa.campaigns,
      keyControlCount: metrics.controls.keyControls,
      todCompleted: metrics.icofr.todCompleted,
      toeCompleted: metrics.icofr.toeCompleted,
      testingPlanItems: metrics.icofr.testingPlanItems,
      testingPlanCompleted: metrics.icofr.testingPlanCompleted,
      attestationCount: metrics.icofr.attestations,
      evidencePackCount: metrics.icofr.evidencePacks
    });

    const baseline = fallbackAnalysis(metrics, readiness);

    const systemPrompt = [
      'You are ARC AI, an enterprise GRC, banking risk, internal control, ICOFR and compliance assurance copilot inside Total ARC.',
      'Analyze only the database-derived metrics supplied by the application. Do not invent regulations, incidents, audit findings, control failures, monetary exposure, root causes or management conclusions.',
      'Treat zero workpapers, zero campaigns, zero evidence packs or zero open items as absence of persisted records, not proof that risk is low or that control is effective.',
      'The readiness score is a transparent data-and-assurance coverage signal, not an audit opinion. Never call the bank compliant or non-compliant based on these metrics alone.',
      'The compliance lens is limited to explicit regulation/framework mappings, compliance-category risks and available assurance evidence in Total ARC.',
      'Prioritize material gaps in assessment coverage, key-control testing, evidence, remediation, certification and monitoring.',
      'Use concise professional Indonesian suitable for bank management, risk management, compliance, internal audit and audit committee readers.',
      'Return JSON only with this shape: {"headline":"string","executiveSummary":"string","icofrInsight":"string","riskInsight":"string","complianceInsight":"string","priorityInsight":"string","recommendations":["string"],"caution":"string"}.',
      'Maximum 5 recommendations.'
    ].join(' ');

    try {
      const result = await runAiGateway({
        task: 'summarization',
        sensitivity: 'confidential',
        systemPrompt,
        prompt:
          'Buat analisis menyeluruh kondisi ICOFR, risiko dan kepatuhan bank dari perspektif Total ARC. ' +
          'Berikut metrik persisted yang telah dihitung server-side:\n' +
          JSON.stringify({ metrics, readiness }),
        temperature: 0.1,
        maxOutputTokens: 2200,
        requireJson: true
      });

      const parsed = parseJsonObject(result.text);
      const analysis: OverviewAnalysis = {
        headline: textValue(parsed.headline, baseline.headline),
        executiveSummary: textValue(parsed.executiveSummary, baseline.executiveSummary),
        icofrInsight: textValue(parsed.icofrInsight, baseline.icofrInsight),
        riskInsight: textValue(parsed.riskInsight, baseline.riskInsight),
        complianceInsight: textValue(parsed.complianceInsight, baseline.complianceInsight),
        priorityInsight: textValue(parsed.priorityInsight, baseline.priorityInsight),
        recommendations: stringList(parsed.recommendations, 5).length
          ? stringList(parsed.recommendations, 5)
          : baseline.recommendations,
        caution: textValue(parsed.caution, baseline.caution)
      };

      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        analysisMode: 'ai',
        readiness,
        metrics,
        analysis,
        ai: {
          requestId: result.requestId,
          provider: result.provider,
          model: result.model,
          fallbackUsed: result.fallbackUsed,
          durationMs: result.durationMs
        },
        disclaimer: 'AI Suggested — Human Review Required'
      });
    } catch (aiError) {
      console.error('Total ARC enterprise overview AI provider failed; using deterministic fallback:', aiError);

      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        analysisMode: 'data-rules-fallback',
        readiness,
        metrics,
        analysis: baseline,
        ai: null,
        disclaimer: 'Data-derived fallback — AI provider unavailable; Human Review Required'
      });
    }
  } catch (error) {
    console.error('Total ARC enterprise overview analysis failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate Total ARC enterprise analysis.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
