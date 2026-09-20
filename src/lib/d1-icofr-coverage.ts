import { getTenantDb, getTenantContext } from '@/lib/tenant-context';
import { ensureIcofrTraceabilitySchema } from '@/lib/d1-icofr-traceability';

type D1DatabaseLike = {
  exec: (sql: string) => Promise<unknown>;
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      first: <T = Record<string, unknown>>() => Promise<T | null>;
      run: () => Promise<unknown>;
      all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
    };
    first: <T = Record<string, unknown>>() => Promise<T | null>;
    run: () => Promise<unknown>;
    all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
  };
};

async function getDb(): Promise<D1DatabaseLike> {
  await ensureIcofrTraceabilitySchema();
  return getTenantDb();
}

async function all<T = Record<string, unknown>>(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const stmt = db.prepare(sql);
  const result = values.length ? await stmt.bind(...values).all<T>() : await stmt.all<T>();
  return result.results || [];
}

async function first<T = Record<string, unknown>>(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const stmt = db.prepare(sql);
  return values.length ? stmt.bind(...values).first<T>() : stmt.first<T>();
}

async function run(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const stmt = db.prepare(sql);
  return values.length ? stmt.bind(...values).run() : stmt.run();
}

async function executeSchema(db: D1DatabaseLike, script: string) {
  await db.exec(script);
}

function nowIso() {
  return new Date().toISOString();
}

function clean(value: unknown) {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next || null;
}

function bool(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

const coverageSchemaReadyByBinding = new Map<string, Promise<D1DatabaseLike>>();

export async function ensureIcofrCoverageSchema() {
  const { databaseBinding } = await getTenantContext();
  const cached = coverageSchemaReadyByBinding.get(databaseBinding);
  if (cached) return cached;

  const schemaPromise = (async () => {
    const db = await getDb();

    await executeSchema(db, `
      CREATE TABLE IF NOT EXISTS ICOFRControlDependency (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        sourceControlId TEXT NOT NULL,
        dependencyControlId TEXT NOT NULL,
        dependencyType TEXT NOT NULL DEFAULT 'ITGC Dependency',
        rationale TEXT,
        status TEXT NOT NULL DEFAULT 'Active',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_control_dependency_unique
        ON ICOFRControlDependency(institutionId, sourceControlId, dependencyControlId);
      CREATE INDEX IF NOT EXISTS idx_icofr_control_dependency_source
        ON ICOFRControlDependency(institutionId, sourceControlId);

      CREATE TABLE IF NOT EXISTS ICOFRGapAction (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        gapKey TEXT NOT NULL,
        gapType TEXT NOT NULL,
        sourceType TEXT,
        sourceId TEXT,
        title TEXT NOT NULL,
        actionPlan TEXT NOT NULL,
        owner TEXT NOT NULL,
        reviewer TEXT,
        dueDate TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'Medium',
        status TEXT NOT NULL DEFAULT 'Open',
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_gap_action_key
        ON ICOFRGapAction(institutionId, gapKey);
      CREATE INDEX IF NOT EXISTS idx_icofr_gap_action_status
        ON ICOFRGapAction(institutionId, status, dueDate);
    `);

    return db;
  })().catch(error => {
    coverageSchemaReadyByBinding.delete(databaseBinding);
    throw error;
  });

  coverageSchemaReadyByBinding.set(databaseBinding, schemaPromise);
  return schemaPromise;
}

async function primaryInstitution(db: D1DatabaseLike) {
  return first<Record<string, unknown>>(db, 'SELECT * FROM Institution ORDER BY createdAt ASC LIMIT 1');
}

async function audit(
  db: D1DatabaseLike,
  institutionId: string,
  action: string,
  entityType: string,
  recordId: string,
  newValue: unknown,
  oldValue?: unknown
) {
  await run(
    db,
    `INSERT INTO AuditLog (
      id, institutionId, userName, userRole, action, entityType, recordId,
      oldValue, newValue, reason, ipAddress, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      institutionId,
      'System',
      'System',
      action,
      entityType,
      recordId,
      oldValue === undefined ? null : JSON.stringify(oldValue),
      JSON.stringify(newValue),
      'ICOFR coverage, dependency and gap action maintenance.',
      null,
      nowIso()
    ]
  );
}

export async function saveControlDependency(input: Record<string, unknown>) {
  const db = await ensureIcofrCoverageSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const sourceControlId = String(input.sourceControlId || '').trim();
  const dependencyControlId = String(input.dependencyControlId || '').trim();
  const dependencyType = String(input.dependencyType || 'ITGC Dependency').trim();
  if (!sourceControlId || !dependencyControlId) throw new Error('DEPENDENCY_REQUIRED');

  const [source, dependency] = await Promise.all([
    first<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRControlDomain WHERE id=? AND institutionId=? LIMIT 1',
      [sourceControlId, institution.id]
    ),
    first<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRControlDomain WHERE id=? AND institutionId=? LIMIT 1',
      [dependencyControlId, institution.id]
    )
  ]);

  if (!source || String(source.category) !== 'ITAC') throw new Error('SOURCE_NOT_ITAC');
  if (!dependency || String(dependency.category) !== 'ITGC') throw new Error('DEPENDENCY_NOT_ITGC');

  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRControlDependency WHERE institutionId=? AND sourceControlId=? AND dependencyControlId=? LIMIT 1',
    [institution.id, sourceControlId, dependencyControlId]
  );

  const now = nowIso();
  if (existing) {
    await run(
      db,
      'UPDATE ICOFRControlDependency SET dependencyType=?, rationale=?, status=?, updatedAt=? WHERE id=?',
      [
        dependencyType,
        clean(input.rationale),
        String(input.status || 'Active'),
        now,
        existing.id
      ]
    );
    const updated = {
      ...existing,
      dependencyType,
      rationale: clean(input.rationale),
      status: String(input.status || 'Active'),
      updatedAt: now
    };
    await audit(db, String(institution.id), 'UPDATE', 'ICOFRControlDependency', String(existing.id), updated, existing);
    return updated;
  }

  const id = crypto.randomUUID();
  const record = {
    id,
    institutionId: String(institution.id),
    sourceControlId,
    dependencyControlId,
    dependencyType,
    rationale: clean(input.rationale),
    status: String(input.status || 'Active'),
    createdAt: now,
    updatedAt: now
  };

  await run(
    db,
    `INSERT INTO ICOFRControlDependency (
      id,institutionId,sourceControlId,dependencyControlId,dependencyType,rationale,status,createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      record.id,
      record.institutionId,
      record.sourceControlId,
      record.dependencyControlId,
      record.dependencyType,
      record.rationale,
      record.status,
      record.createdAt,
      record.updatedAt
    ]
  );

  await audit(db, String(institution.id), 'CREATE', 'ICOFRControlDependency', id, record);
  return record;
}

export async function removeControlDependency(id: string) {
  const db = await ensureIcofrCoverageSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRControlDependency WHERE id=? AND institutionId=? LIMIT 1',
    [id, institution.id]
  );
  if (!existing) throw new Error('DEPENDENCY_NOT_FOUND');

  await run(db, 'DELETE FROM ICOFRControlDependency WHERE id=?', [id]);
  await audit(db, String(institution.id), 'DELETE', 'ICOFRControlDependency', id, { deleted: true }, existing);
  return { success: true };
}

export async function saveGapAction(input: Record<string, unknown>) {
  const db = await ensureIcofrCoverageSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const gapKey = String(input.gapKey || '').trim();
  const gapType = String(input.gapType || '').trim();
  const title = String(input.title || '').trim();
  const actionPlan = String(input.actionPlan || '').trim();
  const owner = String(input.owner || '').trim();
  const dueDate = String(input.dueDate || '').trim();
  const priority = String(input.priority || 'Medium').trim();
  const status = String(input.status || 'Open').trim();
  if (!gapKey || !gapType || !title || !actionPlan || !owner || !dueDate) throw new Error('ACTION_REQUIRED');

  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : crypto.randomUUID();
  const existingById = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRGapAction WHERE id=? AND institutionId=? LIMIT 1',
    [id, institution.id]
  );
  const existingByGap = existingById
    ? existingById
    : await first<Record<string, unknown>>(
        db,
        'SELECT * FROM ICOFRGapAction WHERE gapKey=? AND institutionId=? LIMIT 1',
        [gapKey, institution.id]
      );
  const targetId = existingByGap ? String(existingByGap.id) : id;
  const now = nowIso();

  const record = {
    id: targetId,
    institutionId: String(institution.id),
    gapKey,
    gapType,
    sourceType: clean(input.sourceType),
    sourceId: clean(input.sourceId),
    title,
    actionPlan,
    owner,
    reviewer: clean(input.reviewer),
    dueDate,
    priority,
    status,
    notes: clean(input.notes),
    createdAt: existingByGap?.createdAt || now,
    updatedAt: now
  };

  if (existingByGap) {
    await run(
      db,
      `UPDATE ICOFRGapAction SET
        gapKey=?,gapType=?,sourceType=?,sourceId=?,title=?,actionPlan=?,owner=?,reviewer=?,
        dueDate=?,priority=?,status=?,notes=?,updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        record.gapKey,
        record.gapType,
        record.sourceType,
        record.sourceId,
        record.title,
        record.actionPlan,
        record.owner,
        record.reviewer,
        record.dueDate,
        record.priority,
        record.status,
        record.notes,
        record.updatedAt,
        targetId,
        institution.id
      ]
    );
    await audit(db, String(institution.id), 'UPDATE', 'ICOFRGapAction', targetId, record, existingByGap);
  } else {
    await run(
      db,
      `INSERT INTO ICOFRGapAction (
        id,institutionId,gapKey,gapType,sourceType,sourceId,title,actionPlan,owner,reviewer,
        dueDate,priority,status,notes,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        record.id,
        record.institutionId,
        record.gapKey,
        record.gapType,
        record.sourceType,
        record.sourceId,
        record.title,
        record.actionPlan,
        record.owner,
        record.reviewer,
        record.dueDate,
        record.priority,
        record.status,
        record.notes,
        record.createdAt,
        record.updatedAt
      ]
    );
    await audit(db, String(institution.id), 'CREATE', 'ICOFRGapAction', targetId, record);
  }

  return record;
}

function gap(
  gapKey: string,
  gapType: string,
  severity: 'Critical' | 'High' | 'Medium' | 'Low',
  title: string,
  detail: string,
  sourceType: string,
  sourceId: string,
  relatedHref: string,
  relatedLabel: string
) {
  return {
    gapKey,
    gapType,
    severity,
    title,
    detail,
    sourceType,
    sourceId,
    relatedHref,
    relatedLabel
  };
}

export async function getIcofrCoverageData() {
  const db = await ensureIcofrCoverageSchema();
  const institution = await primaryInstitution(db);
  if (!institution) {
    return {
      institution: null,
      metrics: {},
      gaps: [],
      actions: [],
      dependencies: [],
      selectors: { itac: [], itgc: [] }
    };
  }

  const [
    financialItems,
    assertions,
    links,
    risks,
    controls,
    artifacts,
    designAssessments,
    toeTests,
    testDeficiencies,
    issues,
    maps,
    dependencies,
    actions
  ] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRFinancialItem WHERE institutionId=? ORDER BY itemCode ASC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRAssertion WHERE institutionId=? ORDER BY assertion ASC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRTraceabilityLink WHERE institutionId=?',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM RiskMaster WHERE institutionId=? ORDER BY riskId ASC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRControlDomain WHERE institutionId=? ORDER BY category ASC, controlCode ASC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRInformationRegister WHERE institutionId=? ORDER BY artifactType ASC, itemCode ASC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRDesignAssessment WHERE institutionId=? ORDER BY createdAt DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT t.*
         FROM ToETest t
         JOIN ControlMaster c ON c.id = t.controlId
        WHERE c.institutionId = ?
        ORDER BY t.testedAt DESC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT d.*
         FROM ControlDeficiency d
         JOIN TestingException e ON e.id = d.exceptionId
         JOIN ToETest t ON t.id = e.toeTestId
         JOIN ControlMaster c ON c.id = t.controlId
        WHERE c.institutionId = ?
        ORDER BY d.createdAt DESC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM Issue WHERE institutionId=? ORDER BY createdAt DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ManagementActionPlan ORDER BY createdAt DESC'
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRControlDependency WHERE institutionId=? ORDER BY createdAt DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRGapAction WHERE institutionId=? ORDER BY dueDate ASC, createdAt DESC',
      [institution.id]
    )
  ]);

  const gaps: ReturnType<typeof gap>[] = [];

  const assertionsByFinancialItem = new Map<string, Record<string, unknown>[]>();
  for (const item of assertions) {
    const key = String(item.financialItemId);
    const list = assertionsByFinancialItem.get(key) || [];
    list.push(item);
    assertionsByFinancialItem.set(key, list);
  }

  const assertionRiskLinks = links.filter(
    item => item.sourceType === 'ASSERTION' && item.targetType === 'RISK'
  );
  const riskControlLinks = links.filter(
    item => item.sourceType === 'RISK' && item.targetType === 'ICOFR_CONTROL'
  );

  const riskIdsFromAssertions = new Set(assertionRiskLinks.map(item => String(item.targetId)));
  const assertionIdsWithRisk = new Set(assertionRiskLinks.map(item => String(item.sourceId)));
  const riskIdsWithControl = new Set(riskControlLinks.map(item => String(item.sourceId)));
  const designControlIds = new Set(designAssessments.map(item => String(item.controlDomainId)));
  const toeControlIds = new Set(toeTests.map(item => String(item.controlId)));
  const dependencyItacIds = new Set(
    dependencies
      .filter(item => item.status !== 'Inactive')
      .map(item => String(item.sourceControlId))
  );

  const significantItems = financialItems.filter(item => bool(item.significant));
  for (const item of significantItems) {
    const itemAssertions = assertionsByFinancialItem.get(String(item.id)) || [];
    if (itemAssertions.length === 0) {
      gaps.push(
        gap(
          'FS_NO_ASSERTION:' + String(item.id),
          'Financial Statement Coverage',
          'High',
          'Significant item has no structured assertion',
          `${String(item.itemCode)} · ${String(item.name)} is significant but no in-scope assertion has been registered in the traceability model.`,
          'FINANCIAL_ITEM',
          String(item.id),
          '/icofr/traceability',
          'Create assertion mapping'
        )
      );
    }
  }

  for (const assertion of assertions) {
    if (!bool(assertion.inScope)) continue;
    if (!assertionIdsWithRisk.has(String(assertion.id))) {
      const financialItem = financialItems.find(item => String(item.id) === String(assertion.financialItemId));
      gaps.push(
        gap(
          'ASSERTION_NO_RISK:' + String(assertion.id),
          'Assertion-Risk Coverage',
          'High',
          'Assertion has no risk mapping',
          `${financialItem ? String(financialItem.itemCode) + ' · ' : ''}${String(assertion.assertion)} is in scope but is not mapped to a financial reporting risk.`,
          'ASSERTION',
          String(assertion.id),
          '/icofr/traceability',
          'Map assertion to risk'
        )
      );
    }
  }

  for (const riskId of Array.from(riskIdsFromAssertions)) {
    if (riskIdsWithControl.has(riskId)) continue;
    const risk = risks.find(item => String(item.id) === riskId);
    if (!risk) continue;
    gaps.push(
      gap(
        'RISK_NO_CONTROL:' + riskId,
        'Risk-Control Coverage',
        'High',
        'Mapped financial reporting risk has no ICOFR control',
        `${String(risk.riskId)} · ${String(risk.name)} is linked to an assertion but not to an ELC, PLC, ITGC or ITAC control.`,
        'RISK',
        riskId,
        '/icofr/traceability',
        'Map risk to ICOFR control'
      )
    );
  }

  const keyControls = controls.filter(item => bool(item.keyControl));
  for (const control of keyControls) {
    const controlId = String(control.id);
    if (!control.sourceControlId) {
      gaps.push(
        gap(
          'KEY_NO_MASTER:' + controlId,
          'Control Integration',
          'High',
          'Key ICOFR control is not linked to Control Master',
          `${String(control.category)} · ${String(control.controlCode)} cannot reuse enterprise ToE and remediation records until it is linked to the Single Control Library.`,
          'ICOFR_CONTROL',
          controlId,
          '/icofr/traceability',
          'Link to Control Master'
        )
      );
    }

    if (!designControlIds.has(controlId)) {
      gaps.push(
        gap(
          'KEY_NO_TOD:' + controlId,
          'Test of Design',
          'High',
          'Key ICOFR control has no Test of Design',
          `${String(control.category)} · ${String(control.controlCode)} is designated as a key control but no persisted design assessment exists.`,
          'ICOFR_CONTROL',
          controlId,
          '/icofr/traceability',
          'Register ToD'
        )
      );
    }

    if (control.sourceControlId && !toeControlIds.has(String(control.sourceControlId))) {
      gaps.push(
        gap(
          'KEY_NO_TOE:' + controlId,
          'Operating Effectiveness',
          'High',
          'Key ICOFR control has no ToE record',
          `${String(control.category)} · ${String(control.controlCode)} is linked to Control Master but has no operating effectiveness test.`,
          'ICOFR_CONTROL',
          controlId,
          '/toe',
          'Register ToE'
        )
      );
    }
  }

  const itacControls = controls.filter(item => String(item.category) === 'ITAC');
  for (const control of itacControls) {
    if (dependencyItacIds.has(String(control.id))) continue;
    gaps.push(
      gap(
        'ITAC_NO_ITGC:' + String(control.id),
        'ITAC-ITGC Dependency',
        'High',
        'ITAC has no supporting ITGC dependency',
        `${String(control.controlCode)} · ${String(control.name)} has no documented dependency on an ITGC supporting access, change, operations or other relevant technology controls.`,
        'ICOFR_CONTROL',
        String(control.id),
        '/icofr/coverage',
        'Map ITAC to ITGC'
      )
    );
  }

  const keyArtifacts = artifacts.filter(item => bool(item.keyReport));
  for (const artifact of keyArtifacts) {
    const completeness = typeof artifact.completenessMethod === 'string' && artifact.completenessMethod.trim();
    const accuracy = typeof artifact.accuracyMethod === 'string' && artifact.accuracyMethod.trim();
    if (completeness && accuracy) continue;
    gaps.push(
      gap(
        'INFO_NOT_VALIDATED:' + String(artifact.id),
        'IPE/EUC Reliability',
        'Medium',
        'Key IPE/EUC lacks completeness or accuracy validation',
        `${String(artifact.artifactType)} · ${String(artifact.itemCode)} · ${String(artifact.name)} does not have both validation methods documented.`,
        'INFORMATION_ARTIFACT',
        String(artifact.id),
        '/icofr/information',
        'Complete IPE/EUC validation'
      )
    );
  }

  const issuesByDeficiency = new Map<string, Record<string, unknown>[]>();
  for (const issue of issues) {
    if (!issue.deficiencyId) continue;
    const key = String(issue.deficiencyId);
    const list = issuesByDeficiency.get(key) || [];
    list.push(issue);
    issuesByDeficiency.set(key, list);
  }

  const mapsByIssue = new Map<string, Record<string, unknown>[]>();
  for (const actionMap of maps) {
    const key = String(actionMap.issueId);
    const list = mapsByIssue.get(key) || [];
    list.push(actionMap);
    mapsByIssue.set(key, list);
  }

  for (const deficiency of testDeficiencies) {
    const deficiencyIssues = issuesByDeficiency.get(String(deficiency.id)) || [];
    if (deficiencyIssues.length === 0) {
      gaps.push(
        gap(
          'DEFICIENCY_NO_ISSUE:' + String(deficiency.id),
          'Deficiency Workflow',
          'High',
          'Testing deficiency has no remediation issue',
          `${String(deficiency.deficiencyId)} · ${String(deficiency.title)} has not been converted into an accountable remediation issue.`,
          'CONTROL_DEFICIENCY',
          String(deficiency.id),
          '/remediation',
          'Create remediation issue'
        )
      );
      continue;
    }

    const hasMap = deficiencyIssues.some(issue => (mapsByIssue.get(String(issue.id)) || []).length > 0);
    if (!hasMap) {
      gaps.push(
        gap(
          'DEFICIENCY_NO_MAP:' + String(deficiency.id),
          'Remediation Coverage',
          'High',
          'Testing deficiency has no Management Action Plan',
          `${String(deficiency.deficiencyId)} · ${String(deficiency.title)} has an issue but no persisted MAP.`,
          'CONTROL_DEFICIENCY',
          String(deficiency.id),
          '/remediation',
          'Create MAP'
        )
      );
    }
  }

  const financialItemsWithAssertion = new Set(
    assertions
      .filter(item => bool(item.inScope))
      .map(item => String(item.financialItemId))
  );
  const inScopeAssertions = assertions.filter(item => bool(item.inScope));
  const tracedRiskIds = new Set(riskControlLinks.map(item => String(item.sourceId)));
  const keyControlsWithTod = keyControls.filter(item => designControlIds.has(String(item.id)));
  const keyControlsWithToe = keyControls.filter(
    item => item.sourceControlId && toeControlIds.has(String(item.sourceControlId))
  );
  const itacWithItgc = itacControls.filter(item => dependencyItacIds.has(String(item.id)));
  const validKeyArtifacts = keyArtifacts.filter(
    item =>
      typeof item.completenessMethod === 'string' &&
      item.completenessMethod.trim() &&
      typeof item.accuracyMethod === 'string' &&
      item.accuracyMethod.trim()
  );
  const deficienciesWithMap = testDeficiencies.filter(deficiency => {
    const deficiencyIssues = issuesByDeficiency.get(String(deficiency.id)) || [];
    return deficiencyIssues.some(issue => (mapsByIssue.get(String(issue.id)) || []).length > 0);
  });

  const today = new Date().toISOString().slice(0, 10);
  const openActions = actions.filter(item => item.status !== 'Closed' && item.status !== 'Cancelled');
  const overdueActions = openActions.filter(
    item => typeof item.dueDate === 'string' && item.dueDate < today
  );

  const actionByGapKey = new Map(actions.map(item => [String(item.gapKey), item]));
  const enrichedGaps = gaps.map(item => ({
    ...item,
    action: actionByGapKey.get(item.gapKey) || null
  }));

  const controlById = new Map(controls.map(item => [String(item.id), item]));
  const enrichedDependencies = dependencies.map(item => ({
    ...item,
    sourceControl: controlById.get(String(item.sourceControlId)) || null,
    dependencyControl: controlById.get(String(item.dependencyControlId)) || null
  }));

  return {
    institution: {
      id: institution.id,
      name: institution.name,
      legalName: institution.legalName
    },
    metrics: {
      financialStatementCoverage: {
        covered: significantItems.filter(item => financialItemsWithAssertion.has(String(item.id))).length,
        total: significantItems.length,
        percent: percentage(
          significantItems.filter(item => financialItemsWithAssertion.has(String(item.id))).length,
          significantItems.length
        )
      },
      assertionRiskCoverage: {
        covered: inScopeAssertions.filter(item => assertionIdsWithRisk.has(String(item.id))).length,
        total: inScopeAssertions.length,
        percent: percentage(
          inScopeAssertions.filter(item => assertionIdsWithRisk.has(String(item.id))).length,
          inScopeAssertions.length
        )
      },
      riskControlCoverage: {
        covered: Array.from(riskIdsFromAssertions).filter(id => tracedRiskIds.has(id)).length,
        total: riskIdsFromAssertions.size,
        percent: percentage(
          Array.from(riskIdsFromAssertions).filter(id => tracedRiskIds.has(id)).length,
          riskIdsFromAssertions.size
        )
      },
      todCoverage: {
        covered: keyControlsWithTod.length,
        total: keyControls.length,
        percent: percentage(keyControlsWithTod.length, keyControls.length)
      },
      toeCoverage: {
        covered: keyControlsWithToe.length,
        total: keyControls.length,
        percent: percentage(keyControlsWithToe.length, keyControls.length)
      },
      itacItgcCoverage: {
        covered: itacWithItgc.length,
        total: itacControls.length,
        percent: percentage(itacWithItgc.length, itacControls.length)
      },
      informationValidationCoverage: {
        covered: validKeyArtifacts.length,
        total: keyArtifacts.length,
        percent: percentage(validKeyArtifacts.length, keyArtifacts.length)
      },
      remediationCoverage: {
        covered: deficienciesWithMap.length,
        total: testDeficiencies.length,
        percent: percentage(deficienciesWithMap.length, testDeficiencies.length)
      },
      openGaps: enrichedGaps.length,
      gapsWithActions: enrichedGaps.filter(item => item.action).length,
      openActions: openActions.length,
      overdueActions: overdueActions.length
    },
    gaps: enrichedGaps,
    actions,
    dependencies: enrichedDependencies,
    selectors: {
      itac: itacControls.map(item => ({ ...item, keyControl: bool(item.keyControl) })),
      itgc: controls
        .filter(item => String(item.category) === 'ITGC')
        .map(item => ({ ...item, keyControl: bool(item.keyControl) }))
    }
  };
}
