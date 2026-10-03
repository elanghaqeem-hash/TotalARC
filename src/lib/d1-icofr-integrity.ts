import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureIcofrTraceabilitySchema } from '@/lib/d1-icofr-traceability';

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
  await ensureIcofrTraceabilitySchema();
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

  const orphanCount = checks.reduce((total, check) => total + check.count, 0);
  const criticalFailures = checks.filter(check => check.count > 0 && check.severity === 'Critical');
  const crossTenantCount = checks
    .filter(check => check.code.includes('CROSS_TENANT'))
    .reduce((total, check) => total + check.count, 0);

  return {
    ok: criticalFailures.length === 0,
    test: 'ICOFR_END_TO_END_REFERENTIAL_INTEGRITY',
    storage: 'cloudflare-d1',
    checkedAt: new Date().toISOString(),
    checkedInstitutions: (institutions.results || []).length,
    chain: [
      'Financial Item',
      'Assertion',
      'Risk',
      'ICOFR Control',
      'Control Master',
      'ToD',
      'ToE',
      'Exception',
      'Deficiency',
      'Issue',
      'Management Action Plan'
    ],
    orphanCount,
    crossTenantCount,
    checks
  };
}
