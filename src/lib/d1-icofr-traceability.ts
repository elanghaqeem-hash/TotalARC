import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureCoreDomainSchema } from '@/lib/d1-core';
import { ensureAssuranceSchema } from '@/lib/d1-assurance';
import { ensureIcofrDomainSchema } from '@/lib/d1-icofr-domains';

type D1DatabaseLike = {
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

export const STANDARD_ASSERTIONS = [
  'Existence / Occurrence',
  'Completeness',
  'Accuracy',
  'Valuation / Allocation',
  'Rights & Obligations',
  'Cut-off',
  'Classification',
  'Presentation & Disclosure'
] as const;

async function getDb(): Promise<D1DatabaseLike> {
  await ensureCoreDomainSchema();
  await ensureIcofrDomainSchema();
  await ensureAssuranceSchema();
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('Cloudflare D1 binding "DB" is not available.');
  return db;
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
  for (const statement of script.split(';').map(item => item.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }
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

let traceSchemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureIcofrTraceabilitySchema() {
  if (traceSchemaReady) return traceSchemaReady;
  traceSchemaReady = (async () => {
    const db = await getDb();
    await executeSchema(db, `
      CREATE TABLE IF NOT EXISTS ICOFRAssertion (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        financialItemId TEXT NOT NULL,
        assertion TEXT NOT NULL,
        inScope INTEGER NOT NULL DEFAULT 1,
        rationale TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_assertion_unique
        ON ICOFRAssertion(financialItemId, assertion);
      CREATE INDEX IF NOT EXISTS idx_icofr_assertion_institution
        ON ICOFRAssertion(institutionId, financialItemId);

      CREATE TABLE IF NOT EXISTS ICOFRTraceabilityLink (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        sourceType TEXT NOT NULL,
        sourceId TEXT NOT NULL,
        targetType TEXT NOT NULL,
        targetId TEXT NOT NULL,
        relationship TEXT NOT NULL,
        rationale TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_trace_link_unique
        ON ICOFRTraceabilityLink(sourceType, sourceId, targetType, targetId, relationship);
      CREATE INDEX IF NOT EXISTS idx_icofr_trace_link_source
        ON ICOFRTraceabilityLink(institutionId, sourceType, sourceId);
      CREATE INDEX IF NOT EXISTS idx_icofr_trace_link_target
        ON ICOFRTraceabilityLink(institutionId, targetType, targetId);

      CREATE TABLE IF NOT EXISTS ICOFRDesignAssessment (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        testId TEXT NOT NULL,
        controlDomainId TEXT NOT NULL,
        period TEXT NOT NULL,
        testerName TEXT NOT NULL,
        reviewerName TEXT,
        objectiveAlignment INTEGER NOT NULL DEFAULT 0,
        riskCoverage INTEGER NOT NULL DEFAULT 0,
        precisionAdequate INTEGER NOT NULL DEFAULT 0,
        evidenceSufficiency INTEGER NOT NULL DEFAULT 0,
        walkthroughComplete INTEGER NOT NULL DEFAULT 0,
        conclusion TEXT NOT NULL DEFAULT 'Not Assessed',
        status TEXT NOT NULL DEFAULT 'Draft',
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_design_test_id
        ON ICOFRDesignAssessment(institutionId, testId);
      CREATE INDEX IF NOT EXISTS idx_icofr_design_control
        ON ICOFRDesignAssessment(institutionId, controlDomainId);
    `);
    return db;
  })().catch(error => {
    traceSchemaReady = null;
    throw error;
  });
  return traceSchemaReady;
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
      'ICOFR end-to-end traceability maintenance.',
      null,
      nowIso()
    ]
  );
}

async function upsertLink(
  db: D1DatabaseLike,
  institutionId: string,
  sourceType: string,
  sourceId: string,
  targetType: string,
  targetId: string,
  relationship: string,
  rationale?: string | null
) {
  const existing = await first<Record<string, unknown>>(
    db,
    `SELECT * FROM ICOFRTraceabilityLink
      WHERE sourceType=? AND sourceId=? AND targetType=? AND targetId=? AND relationship=?
      LIMIT 1`,
    [sourceType, sourceId, targetType, targetId, relationship]
  );
  const now = nowIso();
  if (existing) {
    await run(
      db,
      'UPDATE ICOFRTraceabilityLink SET rationale=?, updatedAt=? WHERE id=?',
      [rationale || null, now, existing.id]
    );
    return { ...existing, rationale: rationale || null, updatedAt: now };
  }

  const id = crypto.randomUUID();
  const record = {
    id,
    institutionId,
    sourceType,
    sourceId,
    targetType,
    targetId,
    relationship,
    rationale: rationale || null,
    createdAt: now,
    updatedAt: now
  };
  await run(
    db,
    `INSERT INTO ICOFRTraceabilityLink (
      id,institutionId,sourceType,sourceId,targetType,targetId,relationship,rationale,createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      record.id, record.institutionId, record.sourceType, record.sourceId, record.targetType,
      record.targetId, record.relationship, record.rationale, record.createdAt, record.updatedAt
    ]
  );
  return record;
}

export async function saveTraceabilityChain(input: {
  financialItemId: string;
  assertion: string;
  riskId: string;
  controlDomainId: string;
  informationArtifactId?: string | null;
  sourceControlId?: string | null;
  rationale?: string | null;
}) {
  const db = await ensureIcofrTraceabilitySchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const [financialItem, risk, controlDomain] = await Promise.all([
    first<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRFinancialItem WHERE id=? AND institutionId=? LIMIT 1',
      [input.financialItemId, institution.id]
    ),
    first<Record<string, unknown>>(
      db,
      'SELECT * FROM RiskMaster WHERE id=? AND institutionId=? LIMIT 1',
      [input.riskId, institution.id]
    ),
    first<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRControlDomain WHERE id=? AND institutionId=? LIMIT 1',
      [input.controlDomainId, institution.id]
    )
  ]);
  if (!financialItem) throw new Error('FINANCIAL_ITEM_NOT_FOUND');
  if (!risk) throw new Error('RISK_NOT_FOUND');
  if (!controlDomain) throw new Error('CONTROL_DOMAIN_NOT_FOUND');
  if (!STANDARD_ASSERTIONS.includes(input.assertion as (typeof STANDARD_ASSERTIONS)[number])) {
    throw new Error('INVALID_ASSERTION');
  }

  let informationArtifact: Record<string, unknown> | null = null;
  if (input.informationArtifactId) {
    informationArtifact = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRInformationRegister WHERE id=? AND institutionId=? LIMIT 1',
      [input.informationArtifactId, institution.id]
    );
    if (!informationArtifact) throw new Error('INFORMATION_ARTIFACT_NOT_FOUND');
  }

  let sourceControl: Record<string, unknown> | null = null;
  if (input.sourceControlId) {
    sourceControl = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM ControlMaster WHERE id=? AND institutionId=? LIMIT 1',
      [input.sourceControlId, institution.id]
    );
    if (!sourceControl) throw new Error('SOURCE_CONTROL_NOT_FOUND');
  }

  let assertion = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRAssertion WHERE financialItemId=? AND assertion=? LIMIT 1',
    [input.financialItemId, input.assertion]
  );
  const now = nowIso();
  if (!assertion) {
    const assertionId = crypto.randomUUID();
    assertion = {
      id: assertionId,
      institutionId: String(institution.id),
      financialItemId: input.financialItemId,
      assertion: input.assertion,
      inScope: 1,
      rationale: clean(input.rationale),
      createdAt: now,
      updatedAt: now
    };
    await run(
      db,
      `INSERT INTO ICOFRAssertion (
        id,institutionId,financialItemId,assertion,inScope,rationale,createdAt,updatedAt
      ) VALUES (?,?,?,?,1,?,?,?)`,
      [
        assertion.id, assertion.institutionId, assertion.financialItemId, assertion.assertion,
        assertion.rationale, assertion.createdAt, assertion.updatedAt
      ]
    );
  } else {
    await run(
      db,
      'UPDATE ICOFRAssertion SET inScope=1, rationale=?, updatedAt=? WHERE id=?',
      [clean(input.rationale), now, assertion.id]
    );
  }

  const links = [];
  links.push(await upsertLink(
    db,
    String(institution.id),
    'ASSERTION',
    String(assertion.id),
    'RISK',
    String(risk.id),
    'ASSERTION_ADDRESSES_RISK',
    clean(input.rationale)
  ));
  links.push(await upsertLink(
    db,
    String(institution.id),
    'RISK',
    String(risk.id),
    'ICOFR_CONTROL',
    String(controlDomain.id),
    'RISK_MITIGATED_BY_CONTROL',
    clean(input.rationale)
  ));

  if (informationArtifact) {
    links.push(await upsertLink(
      db,
      String(institution.id),
      'ICOFR_CONTROL',
      String(controlDomain.id),
      'INFORMATION_ARTIFACT',
      String(informationArtifact.id),
      'CONTROL_RELIES_ON_INFORMATION',
      clean(input.rationale)
    ));
  }

  if (sourceControl) {
    await run(
      db,
      'UPDATE ICOFRControlDomain SET sourceControlId=?, updatedAt=? WHERE id=? AND institutionId=?',
      [sourceControl.id, now, controlDomain.id, institution.id]
    );
  }

  const result = {
    financialItemId: financialItem.id,
    assertionId: assertion.id,
    assertion: input.assertion,
    riskId: risk.id,
    controlDomainId: controlDomain.id,
    informationArtifactId: informationArtifact?.id || null,
    sourceControlId: sourceControl?.id || controlDomain.sourceControlId || null,
    links
  };
  await audit(db, String(institution.id), 'UPSERT', 'ICOFRTraceabilityChain', String(assertion.id), result);
  return result;
}

export async function saveDesignAssessment(input: Record<string, unknown>) {
  const db = await ensureIcofrTraceabilitySchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const controlDomainId = String(input.controlDomainId || '').trim();
  const period = String(input.period || '').trim();
  const testerName = String(input.testerName || '').trim();
  if (!controlDomainId || !period || !testerName) throw new Error('REQUIRED_FIELDS');

  const control = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRControlDomain WHERE id=? AND institutionId=? LIMIT 1',
    [controlDomainId, institution.id]
  );
  if (!control) throw new Error('CONTROL_DOMAIN_NOT_FOUND');

  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : crypto.randomUUID();
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRDesignAssessment WHERE id=? AND institutionId=? LIMIT 1',
    [id, institution.id]
  );
  const testId = typeof input.testId === 'string' && input.testId.trim()
    ? input.testId.trim().toUpperCase()
    : 'TOD-' + crypto.randomUUID().slice(0, 8).toUpperCase();

  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM ICOFRDesignAssessment WHERE institutionId=? AND testId=? AND id<>? LIMIT 1',
    [institution.id, testId, id]
  );
  if (duplicate) throw new Error('TEST_ID_CONFLICT');

  const record = {
    id,
    institutionId: String(institution.id),
    testId,
    controlDomainId,
    period,
    testerName,
    reviewerName: clean(input.reviewerName),
    objectiveAlignment: bool(input.objectiveAlignment),
    riskCoverage: bool(input.riskCoverage),
    precisionAdequate: bool(input.precisionAdequate),
    evidenceSufficiency: bool(input.evidenceSufficiency),
    walkthroughComplete: bool(input.walkthroughComplete),
    conclusion: String(input.conclusion || 'Not Assessed'),
    status: String(input.status || 'Draft'),
    notes: clean(input.notes),
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso()
  };

  if (existing) {
    await run(
      db,
      `UPDATE ICOFRDesignAssessment SET
        testId=?,controlDomainId=?,period=?,testerName=?,reviewerName=?,objectiveAlignment=?,
        riskCoverage=?,precisionAdequate=?,evidenceSufficiency=?,walkthroughComplete=?,
        conclusion=?,status=?,notes=?,updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        record.testId,record.controlDomainId,record.period,record.testerName,record.reviewerName,
        record.objectiveAlignment?1:0,record.riskCoverage?1:0,record.precisionAdequate?1:0,
        record.evidenceSufficiency?1:0,record.walkthroughComplete?1:0,record.conclusion,
        record.status,record.notes,record.updatedAt,id,institution.id
      ]
    );
  } else {
    await run(
      db,
      `INSERT INTO ICOFRDesignAssessment (
        id,institutionId,testId,controlDomainId,period,testerName,reviewerName,
        objectiveAlignment,riskCoverage,precisionAdequate,evidenceSufficiency,walkthroughComplete,
        conclusion,status,notes,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        record.id,record.institutionId,record.testId,record.controlDomainId,record.period,
        record.testerName,record.reviewerName,record.objectiveAlignment?1:0,record.riskCoverage?1:0,
        record.precisionAdequate?1:0,record.evidenceSufficiency?1:0,record.walkthroughComplete?1:0,
        record.conclusion,record.status,record.notes,record.createdAt,record.updatedAt
      ]
    );
  }

  await audit(db,String(institution.id),existing?'UPDATE':'CREATE','ICOFRDesignAssessment',id,record,existing||undefined);
  return record;
}

export async function listDesignAssessments() {
  const db = await ensureIcofrTraceabilitySchema();
  const institution = await primaryInstitution(db);
  if (!institution) return [];

  const rows = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRDesignAssessment WHERE institutionId=? ORDER BY createdAt DESC',
    [institution.id]
  );

  return Promise.all(rows.map(async row => {
    const controlDomain = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRControlDomain WHERE id=? LIMIT 1',
      [row.controlDomainId]
    );
    const sourceControl = controlDomain?.sourceControlId
      ? await first<Record<string, unknown>>(
          db,
          'SELECT * FROM ControlMaster WHERE id=? LIMIT 1',
          [controlDomain.sourceControlId]
        )
      : null;
    const process = sourceControl?.processId
      ? await first<Record<string, unknown>>(
          db,
          'SELECT * FROM BusinessProcess WHERE id=? LIMIT 1',
          [sourceControl.processId]
        )
      : null;

    return {
      ...row,
      objectiveAlignment: bool(row.objectiveAlignment),
      riskCoverage: bool(row.riskCoverage),
      precisionAdequate: bool(row.precisionAdequate),
      evidenceSufficiency: bool(row.evidenceSufficiency),
      walkthroughComplete: bool(row.walkthroughComplete),
      controlDomain,
      control: sourceControl
        ? { ...sourceControl, isKeyControl: bool(sourceControl.isKeyControl), isIcofrKey: bool(sourceControl.isIcofrKey) }
        : controlDomain
          ? { id: controlDomain.id, controlId: controlDomain.controlCode, name: controlDomain.name }
          : null,
      process
    };
  }));
}

async function downstreamForControl(db: D1DatabaseLike, controlDomain: Record<string, unknown>) {
  const designTests = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRDesignAssessment WHERE controlDomainId=? ORDER BY createdAt DESC',
    [controlDomain.id]
  );

  if (!controlDomain.sourceControlId) {
    return { designTests, toeTests: [], deficiencies: [], maps: [] };
  }

  const toeTests = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM ToETest WHERE controlId=? ORDER BY testedAt DESC',
    [controlDomain.sourceControlId]
  );
  if (toeTests.length === 0) return { designTests, toeTests: [], deficiencies: [], maps: [] };

  const toeIds = toeTests.map(item => String(item.id));
  const placeholders = toeIds.map(() => '?').join(',');
  const exceptions = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM TestingException WHERE toeTestId IN (${placeholders}) ORDER BY createdAt DESC`,
    toeIds
  );

  if (exceptions.length === 0) return { designTests, toeTests, deficiencies: [], maps: [] };

  const exceptionIds = exceptions.map(item => String(item.id));
  const deficiencyPlaceholders = exceptionIds.map(() => '?').join(',');
  const deficiencies = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM ControlDeficiency WHERE exceptionId IN (${deficiencyPlaceholders}) ORDER BY createdAt DESC`,
    exceptionIds
  );

  if (deficiencies.length === 0) return { designTests, toeTests, deficiencies: [], maps: [] };

  const deficiencyIds = deficiencies.map(item => String(item.id));
  const issuePlaceholders = deficiencyIds.map(() => '?').join(',');
  const issues = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM Issue WHERE deficiencyId IN (${issuePlaceholders}) ORDER BY createdAt DESC`,
    deficiencyIds
  );

  if (issues.length === 0) return { designTests, toeTests, deficiencies, maps: [] };

  const issueIds = issues.map(item => String(item.id));
  const mapPlaceholders = issueIds.map(() => '?').join(',');
  const maps = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM ManagementActionPlan WHERE issueId IN (${mapPlaceholders}) ORDER BY createdAt DESC`,
    issueIds
  );

  return { designTests, toeTests, deficiencies, maps };
}

export async function getTraceabilityData() {
  const db = await ensureIcofrTraceabilitySchema();
  const institution = await primaryInstitution(db);
  if (!institution) {
    return {
      institution: null,
      financialItems: [],
      assertions: [],
      risks: [],
      controls: [],
      enterpriseControls: [],
      informationArtifacts: [],
      designAssessments: [],
      chains: [],
      metrics: {}
    };
  }

  const [financialItems, assertions, risks, controls, enterpriseControls, informationArtifacts, designAssessments, links] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRFinancialItem WHERE institutionId=? ORDER BY recordType ASC, itemCode ASC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRAssertion WHERE institutionId=? ORDER BY financialItemId ASC, assertion ASC',
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
      'SELECT * FROM ControlMaster WHERE institutionId=? ORDER BY controlId ASC',
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
      'SELECT * FROM ICOFRTraceabilityLink WHERE institutionId=? ORDER BY createdAt ASC',
      [institution.id]
    )
  ]);

  const linkBySource = new Map<string, Record<string, unknown>[]>();
  for (const link of links) {
    const key = String(link.sourceType) + ':' + String(link.sourceId);
    const list = linkBySource.get(key) || [];
    list.push(link);
    linkBySource.set(key, list);
  }

  const riskById = new Map(risks.map(item => [String(item.id), item]));
  const controlById = new Map(controls.map(item => [String(item.id), item]));
  const artifactById = new Map(informationArtifacts.map(item => [String(item.id), item]));
  const financialById = new Map(financialItems.map(item => [String(item.id), item]));

  const chains: Record<string, unknown>[] = [];
  for (const assertionRow of assertions) {
    const assertionLinks = linkBySource.get('ASSERTION:' + String(assertionRow.id)) || [];
    for (const assertionLink of assertionLinks.filter(link => link.targetType === 'RISK')) {
      const risk = riskById.get(String(assertionLink.targetId));
      if (!risk) continue;
      const riskLinks = linkBySource.get('RISK:' + String(risk.id)) || [];
      for (const riskLink of riskLinks.filter(link => link.targetType === 'ICOFR_CONTROL')) {
        const control = controlById.get(String(riskLink.targetId));
        if (!control) continue;
        const controlLinks = linkBySource.get('ICOFR_CONTROL:' + String(control.id)) || [];
        const artifact = controlLinks
          .filter(link => link.targetType === 'INFORMATION_ARTIFACT')
          .map(link => artifactById.get(String(link.targetId)))
          .find(Boolean) || null;
        const downstream = await downstreamForControl(db, control);
        const complete =
          Boolean(financialById.get(String(assertionRow.financialItemId))) &&
          Boolean(risk) &&
          Boolean(control) &&
          downstream.designTests.length > 0 &&
          downstream.toeTests.length > 0;

        chains.push({
          id: String(assertionRow.id) + ':' + String(risk.id) + ':' + String(control.id),
          financialItem: financialById.get(String(assertionRow.financialItemId)) || null,
          assertion: { ...assertionRow, inScope: bool(assertionRow.inScope) },
          risk,
          control: { ...control, keyControl: bool(control.keyControl) },
          informationArtifact: artifact
            ? {
                ...artifact,
                accessRestricted: bool(artifact.accessRestricted),
                versionControlled: bool(artifact.versionControlled),
                keyReport: bool(artifact.keyReport)
              }
            : null,
          designTests: downstream.designTests.map(item => ({
            ...item,
            objectiveAlignment: bool(item.objectiveAlignment),
            riskCoverage: bool(item.riskCoverage),
            precisionAdequate: bool(item.precisionAdequate),
            evidenceSufficiency: bool(item.evidenceSufficiency),
            walkthroughComplete: bool(item.walkthroughComplete)
          })),
          toeTests: downstream.toeTests,
          deficiencies: downstream.deficiencies,
          maps: downstream.maps,
          complete
        });
      }
    }
  }

  const significantItems = financialItems.filter(item => bool(item.significant)).length;
  const linkedFinancialItemIds = new Set(chains.map(chain => String((chain.financialItem as Record<string, unknown> | null)?.id || '')));
  const linkedRiskIds = new Set(chains.map(chain => String((chain.risk as Record<string, unknown>)?.id || '')));
  const linkedControlIds = new Set(chains.map(chain => String((chain.control as Record<string, unknown>)?.id || '')));

  return {
    institution: { id: institution.id, name: institution.name, legalName: institution.legalName },
    financialItems: financialItems.map(item => ({ ...item, significant: bool(item.significant) })),
    assertions: assertions.map(item => ({ ...item, inScope: bool(item.inScope) })),
    risks,
    controls: controls.map(item => ({ ...item, keyControl: bool(item.keyControl) })),
    enterpriseControls: enterpriseControls.map(item => ({
      ...item,
      isKeyControl: bool(item.isKeyControl),
      isIcofrKey: bool(item.isIcofrKey),
      isItgc: bool(item.isItgc)
    })),
    informationArtifacts: informationArtifacts.map(item => ({
      ...item,
      accessRestricted: bool(item.accessRestricted),
      versionControlled: bool(item.versionControlled),
      keyReport: bool(item.keyReport)
    })),
    designAssessments: designAssessments.map(item => ({
      ...item,
      objectiveAlignment: bool(item.objectiveAlignment),
      riskCoverage: bool(item.riskCoverage),
      precisionAdequate: bool(item.precisionAdequate),
      evidenceSufficiency: bool(item.evidenceSufficiency),
      walkthroughComplete: bool(item.walkthroughComplete)
    })),
    chains,
    metrics: {
      significantItems,
      tracedFinancialItems: linkedFinancialItemIds.has('') ? linkedFinancialItemIds.size - 1 : linkedFinancialItemIds.size,
      tracedRisks: linkedRiskIds.has('') ? linkedRiskIds.size - 1 : linkedRiskIds.size,
      tracedControls: linkedControlIds.has('') ? linkedControlIds.size - 1 : linkedControlIds.size,
      completeChains: chains.filter(chain => chain.complete).length,
      totalChains: chains.length
    }
  };
}
