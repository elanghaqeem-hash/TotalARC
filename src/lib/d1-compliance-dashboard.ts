import { ensureRegulatoryObligationSchema } from '@/lib/d1-regulatory-obligations';

/**
 * Read-only compliance command-center projection from existing governed D1 records.
 * Every query is tenant-scoped, aggregate-first, and bounded for mobile clients.
 * No cross-tenant cache or inferred/AI compliance scores are used.
 */

type D1Database = Awaited<ReturnType<typeof ensureRegulatoryObligationSchema>>;

type CountRow = {
  total: number | null;
  active: number | null;
  draft: number | null;
  compliant: number | null;
  partial: number | null;
  nonCompliant: number | null;
  notAssessed: number | null;
  notApplicable: number | null;
  ownerMissing: number | null;
  linked: number | null;
  overdueAssessment: number | null;
  dueSoon: number | null;
  highRiskGaps: number | null;
  reporting: number | null;
  lastUpdated: string | null;
};
type CatalogRow = {
  policies: number | null;
  regulations: number | null;
  openPolicyActions: number | null;
  highImpactPolicyActions: number | null;
};
type ActionRow = { openActions: number | null; overdueActions: number | null };
export type CompliancePriority = {
  id: string;
  obligationCode: string;
  requirementText: string;
  criticality: string;
  complianceStatus: string;
  ownerName: string | null;
  dueDate: string | null;
  nextAssessmentDate: string | null;
  regulationCode: string | null;
  regulator: string | null;
};
export type ComplianceOwnerBreakdown = {
  owner: string;
  total: number;
  gaps: number;
  unassessed: number;
};

const numeric = (input: unknown) => Math.max(0, Number(input || 0) || 0);

function businessDate() {
  // Indonesian banks report deadlines against the bank's local business date.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function plusDays(dateText: string, days: number) {
  const instant = new Date(dateText + 'T00:00:00.000Z');
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

export async function getComplianceDashboard(institutionId: string) {
  if (!institutionId.trim()) throw new Error('COMPLIANCE_INSTITUTION_REQUIRED');
  const db: D1Database = await ensureRegulatoryObligationSchema();
  const today = businessDate();
  const in30Days = plusDays(today, 30);

  // Active and draft obligations are counted separately; draft assessments are
  // NEVER represented as bank-wide compliance results.
  const [summary, catalog, actions, priorities, owners] = await Promise.all([
    db.prepare(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN o.status = 'Active' THEN 1 ELSE 0 END),0) AS active,
        COALESCE(SUM(CASE WHEN o.status != 'Active' THEN 1 ELSE 0 END),0) AS draft,
        COALESCE(SUM(CASE WHEN o.status = 'Active' AND o.complianceStatus = 'COMPLIANT' THEN 1 ELSE 0 END),0) AS compliant,
        COALESCE(SUM(CASE WHEN o.status = 'Active' AND o.complianceStatus = 'PARTIAL' THEN 1 ELSE 0 END),0) AS partial,
        COALESCE(SUM(CASE WHEN o.status = 'Active' AND o.complianceStatus = 'NON_COMPLIANT' THEN 1 ELSE 0 END),0) AS nonCompliant,
        COALESCE(SUM(CASE WHEN o.status = 'Active' AND o.complianceStatus = 'NOT_ASSESSED' THEN 1 ELSE 0 END),0) AS notAssessed,
        COALESCE(SUM(CASE WHEN o.status = 'Active' AND o.complianceStatus = 'NOT_APPLICABLE' THEN 1 ELSE 0 END),0) AS notApplicable,
        COALESCE(SUM(CASE WHEN o.status = 'Active' AND o.ownerUnitId IS NULL
                         AND (o.ownerName IS NULL OR TRIM(o.ownerName) = '') THEN 1 ELSE 0 END),0) AS ownerMissing,
        COALESCE(SUM(CASE WHEN o.status = 'Active' AND EXISTS (
          SELECT 1 FROM RegulatoryObligationLink l
          WHERE l.institutionId = o.institutionId AND l.obligationId = o.id
        ) THEN 1 ELSE 0 END),0) AS linked,
        COALESCE(SUM(CASE WHEN o.status = 'Active' AND o.nextAssessmentDate < ? THEN 1 ELSE 0 END),0) AS overdueAssessment,
        COALESCE(SUM(CASE WHEN o.status = 'Active' AND o.nextAssessmentDate >= ?
                            AND o.nextAssessmentDate <= ? THEN 1 ELSE 0 END),0) AS dueSoon,
        COALESCE(SUM(CASE WHEN o.status = 'Active'
                            AND o.criticality IN ('Tinggi','Kritis')
                            AND o.complianceStatus IN ('PARTIAL','NON_COMPLIANT')
                         THEN 1 ELSE 0 END),0) AS highRiskGaps,
        COALESCE(SUM(CASE WHEN o.status = 'Active' AND o.requirementType = 'REPORTING'
                         THEN 1 ELSE 0 END),0) AS reporting,
        MAX(o.updatedAt) AS lastUpdated
      FROM RegulatoryObligation o
      WHERE o.institutionId = ?
    `).bind(today, today, in30Days, institutionId).first<CountRow>(),
    db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM PolicyDocument WHERE institutionId = ?) AS policies,
        (SELECT COUNT(*) FROM ExternalRegulationWatch WHERE institutionId = ?) AS regulations,
        (SELECT COUNT(*) FROM PolicyRegulationImpact
          WHERE institutionId = ? AND changeRequired = 1 AND actionStatus != 'Selesai') AS openPolicyActions,
        (SELECT COUNT(*) FROM PolicyRegulationImpact
          WHERE institutionId = ? AND changeRequired = 1 AND actionStatus != 'Selesai'
            AND impactLevel IN ('Tinggi','Kritis')) AS highImpactPolicyActions
    `).bind(institutionId, institutionId, institutionId, institutionId).first<CatalogRow>(),
    db.prepare(`
      SELECT
        COUNT(*) AS openActions,
        COALESCE(SUM(CASE WHEN a.dueDate < ? THEN 1 ELSE 0 END),0) AS overdueActions
      FROM RegulatoryObligationAssessment a
      JOIN RegulatoryObligation o ON o.id = a.obligationId AND o.institutionId = a.institutionId
      WHERE a.institutionId = ?
        AND o.status = 'Active'
        AND o.complianceStatus IN ('PARTIAL','NON_COMPLIANT')
        AND a.remediationRequired = 1
        AND a.id = (
          SELECT a2.id FROM RegulatoryObligationAssessment a2
          WHERE a2.institutionId = a.institutionId AND a2.obligationId = a.obligationId
          ORDER BY a2.assessmentDate DESC, a2.createdAt DESC LIMIT 1
        )
    `).bind(today, institutionId).first<ActionRow>(),
    db.prepare(`
      SELECT o.id, o.obligationCode, SUBSTR(o.requirementText,1,280) AS requirementText,
             o.criticality, o.complianceStatus, o.ownerName, o.dueDate,
             o.nextAssessmentDate, r.regulationCode, r.regulator
      FROM RegulatoryObligation o
      LEFT JOIN ExternalRegulationWatch r
        ON r.id = o.regulationId AND r.institutionId = o.institutionId
      WHERE o.institutionId = ? AND o.status = 'Active'
        AND (o.complianceStatus IN ('NON_COMPLIANT','PARTIAL','NOT_ASSESSED')
             OR o.nextAssessmentDate < ?)
      ORDER BY
        CASE o.complianceStatus WHEN 'NON_COMPLIANT' THEN 0
          WHEN 'PARTIAL' THEN 1 WHEN 'NOT_ASSESSED' THEN 2 ELSE 3 END,
        CASE WHEN o.criticality = 'Kritis' THEN 0
          WHEN o.criticality = 'Tinggi' THEN 1 ELSE 2 END,
        COALESCE(o.nextAssessmentDate,o.dueDate,'9999-12-31') ASC
      LIMIT 12
    `).bind(institutionId, today).all<CompliancePriority>(),
    db.prepare(`
      SELECT COALESCE(NULLIF(TRIM(u.name),''), NULLIF(TRIM(o.ownerName),''), '(Belum ditetapkan)') AS owner,
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN o.complianceStatus IN ('PARTIAL','NON_COMPLIANT')
                     THEN 1 ELSE 0 END),0) AS gaps,
        COALESCE(SUM(CASE WHEN o.complianceStatus = 'NOT_ASSESSED'
                     THEN 1 ELSE 0 END),0) AS unassessed
      FROM RegulatoryObligation o
      LEFT JOIN OrganizationUnit u ON u.id = o.ownerUnitId AND u.institutionId = o.institutionId
      WHERE o.institutionId = ? AND o.status = 'Active'
      GROUP BY COALESCE(NULLIF(TRIM(u.name),''), NULLIF(TRIM(o.ownerName),''), '(Belum ditetapkan)')
      ORDER BY gaps DESC, unassessed DESC, total DESC, owner ASC
      LIMIT 8
    `).bind(institutionId).all<ComplianceOwnerBreakdown>()
  ]);

  const active = numeric(summary?.active);
  const na = numeric(summary?.notApplicable);
  const applicable = Math.max(0, active - na);
  const compliant = numeric(summary?.compliant);
  const linked = numeric(summary?.linked);

  return {
    asOfDate: today,
    dataUpdatedAt: summary?.lastUpdated || null,
    metrics: {
      totalObligations: numeric(summary?.total),
      activeObligations: active,
      draftObligations: numeric(summary?.draft),
      compliant,
      partial: numeric(summary?.partial),
      nonCompliant: numeric(summary?.nonCompliant),
      notAssessed: numeric(summary?.notAssessed),
      notApplicable: na,
      mapped: linked,
      unmapped: Math.max(0, active - linked),
      ownerMissing: numeric(summary?.ownerMissing),
      overdueAssessments: numeric(summary?.overdueAssessment),
      assessmentsNext30Days: numeric(summary?.dueSoon),
      highRiskGaps: numeric(summary?.highRiskGaps),
      reportingObligations: numeric(summary?.reporting),
      openAssessmentActions: numeric(actions?.openActions),
      overdueAssessmentActions: numeric(actions?.overdueActions),
      policies: numeric(catalog?.policies),
      regulations: numeric(catalog?.regulations),
      openPolicyActions: numeric(catalog?.openPolicyActions),
      highImpactPolicyActions: numeric(catalog?.highImpactPolicyActions),
      // Denominator excludes NOT_APPLICABLE; null denotes no assessable scope.
      complianceRate: applicable > 0 ? Math.round((compliant / applicable) * 1000) / 10 : null,
      mappingRate: active > 0 ? Math.round((linked / active) * 1000) / 10 : null
    },
    priorities: priorities.results || [],
    byOwner: (owners.results || []).map(row => ({
      owner: row.owner,
      total: numeric(row.total),
      gaps: numeric(row.gaps),
      unassessed: numeric(row.unassessed)
    })),
    methodology: {
      source: 'Cloudflare D1 - existing Compliance Universe, Regulatory Watch and Policy Library',
      note: 'Indikator adalah agregasi status yang tersimpan, bukan opini kepatuhan atau hasil audit. Draft dikecualikan dari rasio. Satu relasi tidak berarti traceability lengkap.',
      limitations: 'Rencana monitoring, compliance testing, dan pelaporan regulator yang belum teregister dalam modul khusus tidak dihitung sebagai selesai atau patuh.'
    }
  };
}
