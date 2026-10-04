import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureCoreDomainSchema } from '@/lib/d1-core';
import { ensureIcofrScopeSchema } from '@/lib/d1-icofr';
import { ensureIcofrDomainSchema } from '@/lib/d1-icofr-domains';
import { ensureIcofrTraceabilitySchema } from '@/lib/d1-icofr-traceability';
import { ensureIcofrTestingPlanSchema } from '@/lib/d1-icofr-testing-plan';
import { ensureAssuranceSchema } from '@/lib/d1-assurance';
import { ensureIcofrCertificationSchema } from '@/lib/d1-icofr-certification';

type D1DatabaseLike = {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      first: <T = Record<string, unknown>>() => Promise<T | null>;
      all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
    };
    first: <T = Record<string, unknown>>() => Promise<T | null>;
    all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
  };
};

type IntegrityCheck = {
  code: string;
  description: string;
  count: number;
  severity: 'Critical' | 'High';
};

async function getDb(): Promise<D1DatabaseLike> {
  // The integrity report references records owned by multiple ICOFR/assurance
  // schemas. Initialize every referenced schema before issuing read-only
  // integrity queries so a fresh production isolate cannot fail with
  // "no such table" merely because the corresponding UI module has not run yet.
  await ensureCoreDomainSchema();
  await ensureIcofrScopeSchema();
  await ensureIcofrDomainSchema();
  await ensureIcofrTraceabilitySchema();
  await ensureAssuranceSchema();
  await ensureIcofrTestingPlanSchema();
  await ensureIcofrCertificationSchema();

  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('Cloudflare D1 binding "DB" is not available.');
  return db;
}

async function count(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const statement = db.prepare(sql);
  const row = values.length
    ? await statement.bind(...values).first<{ count?: number }>()
    : await statement.first<{ count?: number }>();
  return Number(row?.count || 0);
}

async function firstRow<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
): Promise<T | null> {
  const statement = db.prepare(sql);
  return values.length
    ? statement.bind(...values).first<T>()
    : statement.first<T>();
}

type CompletenessMetrics = {
  significantFinancialItems: number;
  significantFinancialItemsWithAssertion: number;
  inScopeAssertions: number;
  assertionsWithProcess: number;
  assertionsWithRisk: number;
  assertionsWithControl: number;
  controlsWithToD: number;
  controlsWithToE: number;
  exceptionsWithDeficiency: number;
  deficienciesWithIssue: number;
  issuesWithMAP: number;
  completeChains: number;
  incompleteChains: number;
  coveragePercent: number;
};

type CompletenessCheck = {
  code: string;
  description: string;
  count: number;
  severity: 'Critical' | 'High';
};

export async function getIcofrReferentialIntegrityReport() {
  const db = await getDb();
  const institutions = await db.prepare(
    'SELECT id, name, legalName FROM Institution ORDER BY createdAt ASC'
  ).all<Record<string, unknown>>();

  const checks: IntegrityCheck[] = [];
  const add = async (
    code: string,
    description: string,
    sql: string,
    values: unknown[] = [],
    severity: IntegrityCheck['severity'] = 'Critical'
  ) => {
    checks.push({ code, description, count: await count(db, sql, values), severity });
  };

  await add(
    'ASSERTION_FINANCIAL_ITEM_ORPHAN',
    'ICOFR assertions must reference an existing financial item in the same institution.',
    `SELECT COUNT(*) AS count
       FROM ICOFRAssertion a
       LEFT JOIN ICOFRFinancialItem f
         ON f.id = a.financialItemId AND f.institutionId = a.institutionId
      WHERE f.id IS NULL`
  );

  await add(
    'TRACE_UNSUPPORTED_ENTITY_TYPE',
    'Traceability links must use supported entity types.',
    `SELECT COUNT(*) AS count
       FROM ICOFRTraceabilityLink
      WHERE sourceType NOT IN ('ASSERTION','RISK','ICOFR_CONTROL','INFORMATION_ARTIFACT')
         OR targetType NOT IN ('ASSERTION','RISK','ICOFR_CONTROL','INFORMATION_ARTIFACT')`
  );

  const entityChecks: Array<[string, string, string]> = [
    ['ASSERTION', 'ICOFRAssertion', 'assertion'],
    ['RISK', 'RiskMaster', 'risk'],
    ['ICOFR_CONTROL', 'ICOFRControlDomain', 'ICOFR control'],
    ['INFORMATION_ARTIFACT', 'ICOFRInformationRegister', 'information artifact']
  ];

  for (const [type, table, label] of entityChecks) {
    await add(
      'TRACE_SOURCE_' + type + '_ORPHAN',
      'Traceability source ' + label + ' must exist in the same institution.',
      `SELECT COUNT(*) AS count
         FROM ICOFRTraceabilityLink l
         LEFT JOIN ${table} e ON e.id = l.sourceId AND e.institutionId = l.institutionId
        WHERE l.sourceType = ? AND e.id IS NULL`,
      [type]
    );
    await add(
      'TRACE_TARGET_' + type + '_ORPHAN',
      'Traceability target ' + label + ' must exist in the same institution.',
      `SELECT COUNT(*) AS count
         FROM ICOFRTraceabilityLink l
         LEFT JOIN ${table} e ON e.id = l.targetId AND e.institutionId = l.institutionId
        WHERE l.targetType = ? AND e.id IS NULL`,
      [type]
    );
  }

  await add(
    'RISK_PROCESS_ORPHAN',
    'RiskMaster must reference a BusinessProcess in the same institution.',
    `SELECT COUNT(*) AS count
       FROM RiskMaster r
       LEFT JOIN BusinessProcess p ON p.id = r.processId AND p.institutionId = r.institutionId
      WHERE p.id IS NULL`
  );

  await add(
    'CONTROL_PROCESS_ORPHAN',
    'ControlMaster must reference a BusinessProcess in the same institution.',
    `SELECT COUNT(*) AS count
       FROM ControlMaster c
       LEFT JOIN BusinessProcess p ON p.id = c.processId AND p.institutionId = c.institutionId
      WHERE p.id IS NULL`
  );

  await add(
    'CONTROL_RISK_MAPPING_ORPHAN',
    'Control-risk mappings must resolve both sides.',
    `SELECT COUNT(*) AS count
       FROM ControlRiskMapping m
       LEFT JOIN ControlMaster c ON c.id = m.controlId
       LEFT JOIN RiskMaster r ON r.id = m.riskId
      WHERE c.id IS NULL OR r.id IS NULL`
  );

  await add(
    'CONTROL_RISK_MAPPING_CROSS_TENANT',
    'Control-risk mappings may not join records from different institutions.',
    `SELECT COUNT(*) AS count
       FROM ControlRiskMapping m
       JOIN ControlMaster c ON c.id = m.controlId
       JOIN RiskMaster r ON r.id = m.riskId
      WHERE c.institutionId <> r.institutionId`
  );

  await add(
    'ICOFR_CONTROL_MASTER_ORPHAN',
    'ICOFR controls linked to Control Master must resolve in the same institution.',
    `SELECT COUNT(*) AS count
       FROM ICOFRControlDomain d
       LEFT JOIN ControlMaster c
         ON c.id = d.sourceControlId AND c.institutionId = d.institutionId
      WHERE d.sourceControlId IS NOT NULL AND TRIM(d.sourceControlId) <> '' AND c.id IS NULL`
  );

  await add(
    'TOD_CONTROL_ORPHAN',
    'ICOFR Test of Design must reference an ICOFR control in the same institution.',
    `SELECT COUNT(*) AS count
       FROM ICOFRDesignAssessment t
       LEFT JOIN ICOFRControlDomain d
         ON d.id = t.controlDomainId AND d.institutionId = t.institutionId
      WHERE d.id IS NULL`
  );

  await add(
    'TOE_CONTROL_ORPHAN',
    'ToE must reference an existing enterprise control.',
    `SELECT COUNT(*) AS count
       FROM ToETest t
       LEFT JOIN ControlMaster c ON c.id = t.controlId
      WHERE c.id IS NULL`
  );

  await add(
    'TOE_PROCESS_ORPHAN',
    'ToE must reference an existing business process.',
    `SELECT COUNT(*) AS count
       FROM ToETest t
       LEFT JOIN BusinessProcess p ON p.id = t.processId
      WHERE p.id IS NULL`
  );

  await add(
    'TOE_CROSS_TENANT',
    'ToE control/process/risk references must resolve within the same institution.',
    `SELECT COUNT(*) AS count
       FROM ToETest t
       JOIN ControlMaster c ON c.id = t.controlId
       JOIN BusinessProcess p ON p.id = t.processId
       LEFT JOIN RiskMaster r ON r.id = t.riskId
      WHERE c.institutionId <> p.institutionId
         OR (t.riskId IS NOT NULL AND (r.id IS NULL OR r.institutionId <> c.institutionId))`
  );

  await add(
    'TEST_EXCEPTION_ORPHAN',
    'Testing exceptions must reference an existing ToE.',
    `SELECT COUNT(*) AS count
       FROM TestingException e
       LEFT JOIN ToETest t ON t.id = e.toeTestId
      WHERE t.id IS NULL`
  );

  await add(
    'DEFICIENCY_EXCEPTION_ORPHAN',
    'Control deficiencies with exception references must resolve to an exception.',
    `SELECT COUNT(*) AS count
       FROM ControlDeficiency d
       LEFT JOIN TestingException e ON e.id = d.exceptionId
      WHERE d.exceptionId IS NOT NULL AND TRIM(d.exceptionId) <> '' AND e.id IS NULL`
  );

  await add(
    'ISSUE_PROCESS_ORPHAN',
    'Issues must reference a process in the same institution.',
    `SELECT COUNT(*) AS count
       FROM Issue i
       LEFT JOIN BusinessProcess p ON p.id = i.processId AND p.institutionId = i.institutionId
      WHERE p.id IS NULL`
  );

  await add(
    'ISSUE_RISK_ORPHAN',
    'Issue risk references must resolve in the same institution.',
    `SELECT COUNT(*) AS count
       FROM Issue i
       LEFT JOIN RiskMaster r ON r.id = i.riskId AND r.institutionId = i.institutionId
      WHERE i.riskId IS NOT NULL AND TRIM(i.riskId) <> '' AND r.id IS NULL`
  );

  await add(
    'ISSUE_CONTROL_ORPHAN',
    'Issue control references must resolve in the same institution.',
    `SELECT COUNT(*) AS count
       FROM Issue i
       LEFT JOIN ControlMaster c ON c.id = i.controlId AND c.institutionId = i.institutionId
      WHERE i.controlId IS NOT NULL AND TRIM(i.controlId) <> '' AND c.id IS NULL`
  );

  await add(
    'ISSUE_DEFICIENCY_ORPHAN',
    'Issue deficiency references must resolve.',
    `SELECT COUNT(*) AS count
       FROM Issue i
       LEFT JOIN ControlDeficiency d ON d.id = i.deficiencyId
      WHERE i.deficiencyId IS NOT NULL AND TRIM(i.deficiencyId) <> '' AND d.id IS NULL`
  );

  await add(
    'MAP_ISSUE_ORPHAN',
    'Management action plans must reference an existing issue.',
    `SELECT COUNT(*) AS count
       FROM ManagementActionPlan m
       LEFT JOIN Issue i ON i.id = m.issueId
      WHERE i.id IS NULL`
  );


  await add(
    'SUBCERT_SCOPE_ORPHAN',
    'ICOFR sub-certifications must reference a scope in the same institution.',
    `SELECT COUNT(*) AS count
       FROM ICOFRSubCertification s
       LEFT JOIN ICOFRScope sc
         ON sc.id = s.scopeId AND sc.institutionId = s.institutionId
      WHERE s.scopeId IS NOT NULL AND TRIM(s.scopeId) <> '' AND sc.id IS NULL`
  );

  await add(
    'SUBCERT_SCOPE_CROSS_TENANT',
    'ICOFR sub-certifications may not reference a scope owned by another institution.',
    `SELECT COUNT(*) AS count
       FROM ICOFRSubCertification s
       JOIN ICOFRScope sc ON sc.id = s.scopeId
      WHERE sc.institutionId <> s.institutionId`
  );

  await add(
    'SUBCERT_CYCLE_ORPHAN',
    'ICOFR sub-certification testing cycles must resolve in the same institution and scope.',
    `SELECT COUNT(*) AS count
       FROM ICOFRSubCertification s
       LEFT JOIN ICOFRTestingCycle c
         ON c.id = s.testingCycleId
        AND c.institutionId = s.institutionId
        AND c.scopeId = s.scopeId
      WHERE s.testingCycleId IS NOT NULL
        AND TRIM(s.testingCycleId) <> ''
        AND c.id IS NULL`
  );

  await add(
    'SUBCERT_SUBJECT_ORPHAN',
    'ICOFR sub-certification subjects must resolve to the selected legal entity or organization unit in the same institution.',
    `SELECT COUNT(*) AS count
       FROM ICOFRSubCertification s
      WHERE (s.subjectType = 'Legal Entity' AND NOT EXISTS (
               SELECT 1 FROM LegalEntity le
                WHERE le.id = s.subjectId AND le.institutionId = s.institutionId
             ))
         OR (s.subjectType = 'Organization Unit' AND NOT EXISTS (
               SELECT 1 FROM OrganizationUnit ou
                WHERE ou.id = s.subjectId AND ou.institutionId = s.institutionId
             ))
         OR s.subjectType NOT IN ('Legal Entity','Organization Unit')`
  );

  await add(
    'ATTESTATION_SCOPE_ORPHAN',
    'Management attestations must reference a scope in the same institution.',
    `SELECT COUNT(*) AS count
       FROM ICOFRManagementAttestation a
       LEFT JOIN ICOFRScope sc
         ON sc.id = a.scopeId AND sc.institutionId = a.institutionId
      WHERE sc.id IS NULL`
  );

  await add(
    'ATTESTATION_SCOPE_CROSS_TENANT',
    'Management attestations may not reference a scope owned by another institution.',
    `SELECT COUNT(*) AS count
       FROM ICOFRManagementAttestation a
       JOIN ICOFRScope sc ON sc.id = a.scopeId
      WHERE sc.institutionId <> a.institutionId`
  );

  await add(
    'ATTESTATION_CYCLE_ORPHAN',
    'Management attestation testing cycles must resolve in the same institution and scope.',
    `SELECT COUNT(*) AS count
       FROM ICOFRManagementAttestation a
       LEFT JOIN ICOFRTestingCycle c
         ON c.id = a.testingCycleId
        AND c.institutionId = a.institutionId
        AND c.scopeId = a.scopeId
      WHERE a.testingCycleId IS NOT NULL
        AND TRIM(a.testingCycleId) <> ''
        AND c.id IS NULL`
  );

  await add(
    'EVIDENCE_PACK_ATTESTATION_ORPHAN',
    'Certification evidence packs must reference an attestation in the same institution.',
    `SELECT COUNT(*) AS count
       FROM ICOFREvidencePack p
       LEFT JOIN ICOFRManagementAttestation a
         ON a.id = p.attestationId AND a.institutionId = p.institutionId
      WHERE a.id IS NULL`
  );

  await add(
    'EVIDENCE_PACK_ATTESTATION_CROSS_TENANT',
    'Certification evidence packs may not reference an attestation owned by another institution.',
    `SELECT COUNT(*) AS count
       FROM ICOFREvidencePack p
       JOIN ICOFRManagementAttestation a ON a.id = p.attestationId
      WHERE a.institutionId <> p.institutionId`
  );

  await add(
    'EVIDENCE_PACK_PERIOD_MISMATCH',
    'Certification evidence pack periods must match the referenced management attestation.',
    `SELECT COUNT(*) AS count
       FROM ICOFREvidencePack p
       JOIN ICOFRManagementAttestation a
         ON a.id = p.attestationId AND a.institutionId = p.institutionId
      WHERE p.period <> a.period`,
    [],
    'High'
  );

  const completenessSql = `
    WITH
    significant_financial AS (
      SELECT f.id, f.institutionId
        FROM ICOFRFinancialItem f
       WHERE f.significant = 1
         AND COALESCE(f.status, 'Draft') <> 'Retired'
    ),
    in_scope AS (
      SELECT a.id, a.institutionId, a.financialItemId
        FROM ICOFRAssertion a
       WHERE a.inScope = 1
    ),
    assertion_risk AS (
      SELECT DISTINCT
        a.id AS assertionId,
        a.institutionId AS institutionId,
        r.id AS riskId
      FROM in_scope a
      JOIN ICOFRTraceabilityLink l
        ON l.institutionId = a.institutionId
       AND l.sourceType = 'ASSERTION'
       AND l.sourceId = a.id
       AND l.targetType = 'RISK'
       AND l.relationship = 'ASSERTION_ADDRESSES_RISK'
      JOIN RiskMaster r
        ON r.id = l.targetId
       AND r.institutionId = a.institutionId
    ),
    assertion_process AS (
      SELECT DISTINCT
        ar.assertionId,
        ar.institutionId,
        p.id AS processId
      FROM assertion_risk ar
      JOIN RiskMaster r
        ON r.id = ar.riskId
       AND r.institutionId = ar.institutionId
      JOIN BusinessProcess p
        ON p.id = r.processId
       AND p.institutionId = ar.institutionId
    ),
    assertion_control AS (
      SELECT DISTINCT
        ar.assertionId,
        ar.institutionId,
        ar.riskId,
        d.id AS controlDomainId,
        d.sourceControlId,
        CASE
          WHEN d.keyControl = 1
            OR COALESCE(cm.isIcofrKey, 0) = 1
            OR COALESCE(cm.isKeyControl, 0) = 1
          THEN 1 ELSE 0
        END AS requiresTesting
      FROM assertion_risk ar
      JOIN ICOFRTraceabilityLink l
        ON l.institutionId = ar.institutionId
       AND l.sourceType = 'RISK'
       AND l.sourceId = ar.riskId
       AND l.targetType = 'ICOFR_CONTROL'
       AND l.relationship = 'RISK_MITIGATED_BY_CONTROL'
      JOIN ICOFRControlDomain d
        ON d.id = l.targetId
       AND d.institutionId = ar.institutionId
      LEFT JOIN ControlMaster cm
        ON cm.id = d.sourceControlId
       AND cm.institutionId = ar.institutionId
    ),
    control_tod AS (
      SELECT DISTINCT ac.assertionId, ac.controlDomainId
        FROM assertion_control ac
        JOIN ICOFRDesignAssessment tod
          ON tod.institutionId = ac.institutionId
         AND tod.controlDomainId = ac.controlDomainId
    ),
    control_toe AS (
      SELECT DISTINCT ac.assertionId, ac.controlDomainId, toe.id AS toeId
        FROM assertion_control ac
        JOIN ToETest toe
          ON ac.sourceControlId IS NOT NULL
         AND toe.controlId = ac.sourceControlId
    ),
    relevant_toe AS (
      SELECT DISTINCT ac.assertionId, ac.institutionId, toe.id AS toeId
        FROM assertion_control ac
        JOIN ToETest toe
          ON ac.sourceControlId IS NOT NULL
         AND toe.controlId = ac.sourceControlId
    ),
    relevant_exception AS (
      SELECT DISTINCT rt.assertionId, rt.institutionId, e.id AS exceptionId
        FROM relevant_toe rt
        JOIN TestingException e ON e.toeTestId = rt.toeId
    ),
    relevant_deficiency AS (
      SELECT DISTINCT
        re.assertionId,
        re.institutionId,
        re.exceptionId,
        d.id AS deficiencyId,
        d.humanApproved
        FROM relevant_exception re
        JOIN ControlDeficiency d ON d.exceptionId = re.exceptionId
    ),
    relevant_issue AS (
      SELECT DISTINCT rd.assertionId, rd.institutionId, rd.deficiencyId, i.id AS issueId
        FROM relevant_deficiency rd
        JOIN Issue i
          ON i.deficiencyId = rd.deficiencyId
         AND i.institutionId = rd.institutionId
    ),
    relevant_map AS (
      SELECT DISTINCT ri.assertionId, ri.issueId, m.id AS mapId
        FROM relevant_issue ri
        JOIN ManagementActionPlan m ON m.issueId = ri.issueId
    ),
    financial_assertion_missing AS (
      SELECT sf.id AS financialItemId
        FROM significant_financial sf
       WHERE NOT EXISTS (
         SELECT 1
           FROM in_scope a
          WHERE a.financialItemId = sf.id
            AND a.institutionId = sf.institutionId
       )
    ),
    risk_missing AS (
      SELECT i.id AS assertionId
        FROM in_scope i
       WHERE NOT EXISTS (
         SELECT 1 FROM assertion_risk ar WHERE ar.assertionId = i.id
       )
    ),
    process_missing AS (
      SELECT i.id AS assertionId
        FROM in_scope i
       WHERE EXISTS (
         SELECT 1 FROM assertion_risk ar WHERE ar.assertionId = i.id
       )
         AND NOT EXISTS (
           SELECT 1 FROM assertion_process ap WHERE ap.assertionId = i.id
         )
    ),
    control_missing AS (
      SELECT DISTINCT ar.assertionId, ar.riskId
        FROM assertion_risk ar
       WHERE NOT EXISTS (
         SELECT 1
           FROM assertion_control ac
          WHERE ac.assertionId = ar.assertionId
            AND ac.riskId = ar.riskId
       )
    ),
    tod_missing AS (
      SELECT DISTINCT ac.assertionId, ac.controlDomainId
        FROM assertion_control ac
       WHERE ac.requiresTesting = 1
         AND NOT EXISTS (
           SELECT 1
             FROM control_tod ct
            WHERE ct.assertionId = ac.assertionId
              AND ct.controlDomainId = ac.controlDomainId
         )
    ),
    toe_missing AS (
      SELECT DISTINCT ac.assertionId, ac.controlDomainId
        FROM assertion_control ac
       WHERE ac.requiresTesting = 1
         AND NOT EXISTS (
           SELECT 1
             FROM control_toe ct
            WHERE ct.assertionId = ac.assertionId
              AND ct.controlDomainId = ac.controlDomainId
         )
    ),
    exception_deficiency_missing AS (
      SELECT DISTINCT re.assertionId, re.exceptionId
        FROM relevant_exception re
       WHERE NOT EXISTS (
         SELECT 1 FROM ControlDeficiency d WHERE d.exceptionId = re.exceptionId
       )
    ),
    approved_deficiency_issue_missing AS (
      SELECT DISTINCT rd.assertionId, rd.deficiencyId
        FROM relevant_deficiency rd
       WHERE rd.humanApproved = 1
         AND NOT EXISTS (
           SELECT 1
             FROM Issue i
            WHERE i.deficiencyId = rd.deficiencyId
              AND i.institutionId = rd.institutionId
         )
    ),
    issue_map_missing AS (
      SELECT DISTINCT ri.assertionId, ri.issueId
        FROM relevant_issue ri
        JOIN relevant_deficiency rd
          ON rd.assertionId = ri.assertionId
         AND rd.deficiencyId = ri.deficiencyId
       WHERE rd.humanApproved = 1
         AND NOT EXISTS (
           SELECT 1 FROM ManagementActionPlan m WHERE m.issueId = ri.issueId
         )
    ),
    incomplete_assertions AS (
      SELECT assertionId FROM risk_missing
      UNION
      SELECT assertionId FROM process_missing
      UNION
      SELECT assertionId FROM control_missing
      UNION
      SELECT assertionId FROM tod_missing
      UNION
      SELECT assertionId FROM toe_missing
      UNION
      SELECT assertionId FROM exception_deficiency_missing
      UNION
      SELECT assertionId FROM approved_deficiency_issue_missing
      UNION
      SELECT assertionId FROM issue_map_missing
    )
    SELECT
      (SELECT COUNT(*) FROM significant_financial) AS significantFinancialItems,
      (SELECT COUNT(*) FROM significant_financial)
        - (SELECT COUNT(*) FROM financial_assertion_missing) AS significantFinancialItemsWithAssertion,
      (SELECT COUNT(*) FROM in_scope) AS inScopeAssertions,
      (SELECT COUNT(DISTINCT assertionId) FROM assertion_process) AS assertionsWithProcess,
      (SELECT COUNT(DISTINCT assertionId) FROM assertion_risk) AS assertionsWithRisk,
      (SELECT COUNT(DISTINCT assertionId) FROM assertion_control) AS assertionsWithControl,
      (SELECT COUNT(DISTINCT controlDomainId) FROM control_tod) AS controlsWithToD,
      (SELECT COUNT(DISTINCT controlDomainId) FROM control_toe) AS controlsWithToE,
      (SELECT COUNT(DISTINCT exceptionId) FROM relevant_deficiency) AS exceptionsWithDeficiency,
      (SELECT COUNT(DISTINCT deficiencyId) FROM relevant_issue) AS deficienciesWithIssue,
      (SELECT COUNT(DISTINCT issueId) FROM relevant_map) AS issuesWithMAP,
      (SELECT COUNT(*) FROM in_scope) - (SELECT COUNT(*) FROM incomplete_assertions) AS completeChains,
      (SELECT COUNT(*) FROM incomplete_assertions) AS incompleteChains,
      (SELECT COUNT(*) FROM financial_assertion_missing) AS financialAssertionMissing,
      (SELECT COUNT(*) FROM risk_missing) AS assertionRiskMissing,
      (SELECT COUNT(*) FROM process_missing) AS assertionProcessMissing,
      (SELECT COUNT(*) FROM control_missing) AS riskControlMissing,
      (SELECT COUNT(*) FROM tod_missing) AS keyControlToDMissing,
      (SELECT COUNT(*) FROM toe_missing) AS keyControlToEMissing,
      (SELECT COUNT(*) FROM exception_deficiency_missing) AS exceptionDeficiencyMissing,
      (SELECT COUNT(*) FROM approved_deficiency_issue_missing) AS approvedDeficiencyIssueMissing,
      (SELECT COUNT(*) FROM issue_map_missing) AS issueMapMissing
  `;

  const completenessRow = await firstRow<Record<string, unknown>>(db, completenessSql);
  const inScopeAssertions = Number(completenessRow?.inScopeAssertions || 0);
  const completeChains = Number(completenessRow?.completeChains || 0);
  const incompleteChains = Number(completenessRow?.incompleteChains || 0);
  const coveragePercent =
    inScopeAssertions > 0
      ? Math.round((completeChains / inScopeAssertions) * 10000) / 100
      : 0;

  const metrics: CompletenessMetrics = {
    significantFinancialItems: Number(completenessRow?.significantFinancialItems || 0),
    significantFinancialItemsWithAssertion: Number(completenessRow?.significantFinancialItemsWithAssertion || 0),
    inScopeAssertions,
    assertionsWithProcess: Number(completenessRow?.assertionsWithProcess || 0),
    assertionsWithRisk: Number(completenessRow?.assertionsWithRisk || 0),
    assertionsWithControl: Number(completenessRow?.assertionsWithControl || 0),
    controlsWithToD: Number(completenessRow?.controlsWithToD || 0),
    controlsWithToE: Number(completenessRow?.controlsWithToE || 0),
    exceptionsWithDeficiency: Number(completenessRow?.exceptionsWithDeficiency || 0),
    deficienciesWithIssue: Number(completenessRow?.deficienciesWithIssue || 0),
    issuesWithMAP: Number(completenessRow?.issuesWithMAP || 0),
    completeChains,
    incompleteChains,
    coveragePercent
  };

  const completenessChecks: CompletenessCheck[] = [
    {
      code: 'SIGNIFICANT_FINANCIAL_ITEM_ASSERTION_MISSING',
      description: 'Every significant financial account/disclosure must have at least one in-scope assertion.',
      count: Number(completenessRow?.financialAssertionMissing || 0),
      severity: 'Critical'
    },
    {
      code: 'IN_SCOPE_ASSERTION_RISK_MISSING',
      description: 'Every in-scope assertion must link to at least one risk.',
      count: Number(completenessRow?.assertionRiskMissing || 0),
      severity: 'Critical'
    },
    {
      code: 'ASSERTION_BPM_PATH_MISSING',
      description: 'Every in-scope assertion with a linked risk must resolve through that risk to a Business Process in the same institution.',
      count: Number(completenessRow?.assertionProcessMissing || 0),
      severity: 'Critical'
    },
    {
      code: 'ASSERTION_RISK_CONTROL_MISSING',
      description: 'Every risk linked from an in-scope assertion must link to an ICOFR control.',
      count: Number(completenessRow?.riskControlMissing || 0),
      severity: 'Critical'
    },
    {
      code: 'KEY_CONTROL_TOD_MISSING',
      description: 'Every key/ICOFR-key control in an in-scope assertion chain must have a Test of Design.',
      count: Number(completenessRow?.keyControlToDMissing || 0),
      severity: 'Critical'
    },
    {
      code: 'KEY_CONTROL_TOE_MISSING',
      description: 'Every key/ICOFR-key control in an in-scope assertion chain must have a Test of Effectiveness.',
      count: Number(completenessRow?.keyControlToEMissing || 0),
      severity: 'Critical'
    },
    {
      code: 'EXCEPTION_DEFICIENCY_MISSING',
      description: 'Every testing exception in an in-scope assertion chain must resolve to a control deficiency.',
      count: Number(completenessRow?.exceptionDeficiencyMissing || 0),
      severity: 'Critical'
    },
    {
      code: 'APPROVED_DEFICIENCY_ISSUE_MISSING',
      description: 'A human-approved deficiency is treated as remediation-required and must resolve to an Issue.',
      count: Number(completenessRow?.approvedDeficiencyIssueMissing || 0),
      severity: 'Critical'
    },
    {
      code: 'ISSUE_MAP_MISSING',
      description: 'Every remediation Issue arising from a human-approved deficiency must have a Management Action Plan.',
      count: Number(completenessRow?.issueMapMissing || 0),
      severity: 'Critical'
    }
  ];

  const certificationMetricsRow = await firstRow<Record<string, unknown>>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM ICOFRSubCertification) AS subCertifications,
       (SELECT COUNT(*) FROM ICOFRSubCertification WHERE status IN ('Submitted','Approved')) AS submittedOrApprovedSubCertifications,
       (SELECT COUNT(*) FROM ICOFRManagementAttestation) AS managementAttestations,
       (SELECT COUNT(*) FROM ICOFRManagementAttestation WHERE status IN ('Submitted','Approved','Signed')) AS progressedAttestations,
       (SELECT COUNT(*) FROM ICOFREvidencePack) AS evidencePacks`
  );

  const certificationMetrics = {
    subCertifications: Number(certificationMetricsRow?.subCertifications || 0),
    submittedOrApprovedSubCertifications: Number(certificationMetricsRow?.submittedOrApprovedSubCertifications || 0),
    managementAttestations: Number(certificationMetricsRow?.managementAttestations || 0),
    progressedAttestations: Number(certificationMetricsRow?.progressedAttestations || 0),
    evidencePacks: Number(certificationMetricsRow?.evidencePacks || 0)
  };

  const mandatoryChainGapCount = completenessChecks.reduce(
    (total, check) => total + check.count,
    0
  );

  const orphanCount = checks.reduce((total, check) => total + check.count, 0);
  const criticalFailures = checks.filter(check => check.count > 0 && check.severity === 'Critical');
  const crossTenantCount = checks
    .filter(check => check.code.includes('CROSS_TENANT'))
    .reduce((total, check) => total + check.count, 0);

  return {
    ok: criticalFailures.length === 0 && mandatoryChainGapCount === 0,
    test: 'ICOFR_END_TO_END_REFERENTIAL_INTEGRITY',
    storage: 'cloudflare-d1',
    checkedAt: new Date().toISOString(),
    checkedInstitutions: (institutions.results || []).length,
    chain: [
      'Financial Account / Disclosure',
      'Assertion',
      'Business Process (via linked Risk.processId)',
      'Risk',
      'ICOFR Control',
      'Control Master',
      'ToD',
      'ToE',
      'Exception (when present)',
      'Deficiency (when exception exists)',
      'Issue (when human-approved deficiency requires remediation)',
      'Management Action Plan',
      'Sub-Certification / Management Attestation / Evidence Pack'
    ],
    orphanCount,
    crossTenantCount,
    mandatoryChainGapCount,
    completenessTest: 'ICOFR_TRACEABILITY_COMPLETENESS',
    certificationTraceabilityTest: 'ICOFR_CERTIFICATION_REFERENTIAL_INTEGRITY',
    completenessPolicy: {
      financialItemToAssertion: 'mandatory for significant financial accounts/disclosures',
      assertionToBusinessProcess: 'mandatory through the linked risk BusinessProcess reference',
      assertionToRisk: 'mandatory',
      riskToControl: 'mandatory',
      testing: 'mandatory for ICOFRControlDomain.keyControl, ControlMaster.isIcofrKey, or ControlMaster.isKeyControl',
      exceptionToDeficiency: 'mandatory when an exception exists',
      deficiencyToIssue: 'mandatory when ControlDeficiency.humanApproved = 1',
      issueToMAP: 'mandatory for remediation issues arising from human-approved deficiencies',
      certification: 'certification records are referentially validated against institution, scope, testing cycle, subject, attestation and evidence-pack period'
    },
    metrics,
    certificationMetrics,
    completenessChecks,
    checks
  };
}
