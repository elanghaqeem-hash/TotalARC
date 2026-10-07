import { ensureCoreDomainSchema } from '@/lib/d1-core';
import { ensureEvidenceRepositorySchema } from '@/lib/d1-evidence-repository';
import { ensurePolicyLibrarySchema } from '@/lib/d1-policy-library';

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

export const OBLIGATION_TARGET_TYPES = [
  'INTERNAL_POLICY',
  'PROCESS',
  'RISK',
  'CONTROL',
  'EVIDENCE'
] as const;

export type ObligationTargetType = typeof OBLIGATION_TARGET_TYPES[number];

export type RegulatoryObligation = {
  id: string;
  institutionId: string;
  regulationId: string;
  obligationCode: string;
  sourceArticle: string | null;
  requirementText: string;
  requirementType: string;
  applicability: string;
  frequency: string | null;
  ownerUnitId: string | null;
  ownerName: string | null;
  criticality: string;
  effectiveDate: string | null;
  dueDate: string | null;
  reviewDate: string | null;
  status: string;
  complianceStatus: string;
  lastAssessmentDate: string | null;
  nextAssessmentDate: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type RegulatoryObligationLink = {
  id: string;
  institutionId: string;
  obligationId: string;
  targetType: ObligationTargetType;
  targetId: string;
  relationship: string;
  rationale: string | null;
  createdBy: string;
  createdAt: string;
};

export type RegulatoryObligationAssessment = {
  id: string;
  institutionId: string;
  obligationId: string;
  complianceStatus: string;
  assessmentDate: string;
  assessedBy: string;
  conclusion: string | null;
  gapSummary: string | null;
  remediationRequired: number;
  actionOwner: string | null;
  dueDate: string | null;
  nextAssessmentDate: string | null;
  createdAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function clean(value: unknown) {
  const result = String(value ?? '').trim();
  return result || null;
}

function normalizeDate(value: unknown) {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

async function executeSchemaScript(db: D1DatabaseLike, script: string) {
  for (const statement of script.split(';').map(item => item.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }
}

let schemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureRegulatoryObligationSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const coreDb = await ensureCoreDomainSchema();
    await ensurePolicyLibrarySchema();
    await ensureEvidenceRepositorySchema();
    const db = coreDb as D1DatabaseLike;

    await executeSchemaScript(db, `
      CREATE TABLE IF NOT EXISTS RegulatoryObligation (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        regulationId TEXT NOT NULL,
        obligationCode TEXT NOT NULL,
        sourceArticle TEXT,
        requirementText TEXT NOT NULL,
        requirementType TEXT NOT NULL DEFAULT 'OTHER',
        applicability TEXT NOT NULL DEFAULT 'Berlaku',
        frequency TEXT,
        ownerUnitId TEXT,
        ownerName TEXT,
        criticality TEXT NOT NULL DEFAULT 'Sedang',
        effectiveDate TEXT,
        dueDate TEXT,
        reviewDate TEXT,
        status TEXT NOT NULL DEFAULT 'Draft',
        complianceStatus TEXT NOT NULL DEFAULT 'NOT_ASSESSED',
        lastAssessmentDate TEXT,
        nextAssessmentDate TEXT,
        notes TEXT,
        createdBy TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_obligation_code
        ON RegulatoryObligation(institutionId, obligationCode);
      CREATE INDEX IF NOT EXISTS idx_reg_obligation_regulation
        ON RegulatoryObligation(institutionId, regulationId, status);
      CREATE INDEX IF NOT EXISTS idx_reg_obligation_compliance
        ON RegulatoryObligation(institutionId, complianceStatus, criticality);
      CREATE INDEX IF NOT EXISTS idx_reg_obligation_due
        ON RegulatoryObligation(institutionId, dueDate, nextAssessmentDate);

      CREATE TABLE IF NOT EXISTS RegulatoryObligationLink (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        obligationId TEXT NOT NULL,
        targetType TEXT NOT NULL,
        targetId TEXT NOT NULL,
        relationship TEXT NOT NULL,
        rationale TEXT,
        createdBy TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_obligation_link_unique
        ON RegulatoryObligationLink(institutionId, obligationId, targetType, targetId, relationship);
      CREATE INDEX IF NOT EXISTS idx_reg_obligation_link_obligation
        ON RegulatoryObligationLink(institutionId, obligationId, targetType);
      CREATE INDEX IF NOT EXISTS idx_reg_obligation_link_target
        ON RegulatoryObligationLink(institutionId, targetType, targetId);

      CREATE TABLE IF NOT EXISTS RegulatoryObligationAssessment (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        obligationId TEXT NOT NULL,
        complianceStatus TEXT NOT NULL,
        assessmentDate TEXT NOT NULL,
        assessedBy TEXT NOT NULL,
        conclusion TEXT,
        gapSummary TEXT,
        remediationRequired INTEGER NOT NULL DEFAULT 0,
        actionOwner TEXT,
        dueDate TEXT,
        nextAssessmentDate TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_reg_obligation_assessment
        ON RegulatoryObligationAssessment(institutionId, obligationId, assessmentDate);
      CREATE INDEX IF NOT EXISTS idx_reg_obligation_assessment_gap
        ON RegulatoryObligationAssessment(institutionId, complianceStatus, dueDate);
    `);

    return db;
  })().catch(error => {
    schemaReady = null;
    throw error;
  });

  return schemaReady;
}

async function regulationExists(db: D1DatabaseLike, institutionId: string, regulationId: string) {
  return Boolean(await db.prepare(`
    SELECT id
    FROM ExternalRegulationWatch
    WHERE id = ? AND institutionId = ?
    LIMIT 1
  `).bind(regulationId, institutionId).first<{ id: string }>());
}

async function obligationExists(db: D1DatabaseLike, institutionId: string, obligationId: string) {
  return Boolean(await db.prepare(`
    SELECT id
    FROM RegulatoryObligation
    WHERE id = ? AND institutionId = ?
    LIMIT 1
  `).bind(obligationId, institutionId).first<{ id: string }>());
}

async function targetExists(
  db: D1DatabaseLike,
  institutionId: string,
  targetType: ObligationTargetType,
  targetId: string
) {
  const queries: Record<ObligationTargetType, string> = {
    INTERNAL_POLICY:
      'SELECT id FROM PolicyDocument WHERE id = ? AND institutionId = ? LIMIT 1',
    PROCESS:
      'SELECT id FROM BusinessProcess WHERE id = ? AND institutionId = ? LIMIT 1',
    RISK:
      'SELECT id FROM RiskMaster WHERE id = ? AND institutionId = ? LIMIT 1',
    CONTROL:
      'SELECT id FROM ControlMaster WHERE id = ? AND institutionId = ? LIMIT 1',
    EVIDENCE:
      'SELECT id FROM EvidenceDocument WHERE id = ? AND institutionId = ? LIMIT 1'
  };

  return Boolean(await db.prepare(queries[targetType])
    .bind(targetId, institutionId)
    .first<{ id: string }>());
}

export async function createRegulatoryObligation(
  institutionId: string,
  input: {
    regulationId: string;
    obligationCode: string;
    sourceArticle?: string | null;
    requirementText: string;
    requirementType?: string | null;
    applicability?: string | null;
    frequency?: string | null;
    ownerUnitId?: string | null;
    ownerName?: string | null;
    criticality?: string | null;
    effectiveDate?: string | null;
    dueDate?: string | null;
    reviewDate?: string | null;
    status?: string | null;
    notes?: string | null;
  },
  actorName: string
) {
  const db = await ensureRegulatoryObligationSchema();
  const regulationId = String(input.regulationId || '').trim();
  const obligationCode = String(input.obligationCode || '').trim();
  const requirementText = String(input.requirementText || '').trim();

  if (!regulationId || !obligationCode || !requirementText) {
    throw new Error('REG_OBLIGATION_REQUIRED');
  }
  if (!(await regulationExists(db, institutionId, regulationId))) {
    throw new Error('REG_OBLIGATION_REGULATION_NOT_FOUND');
  }

  const ownerUnitId = clean(input.ownerUnitId);
  if (ownerUnitId) {
    const unit = await db.prepare(`
      SELECT id FROM OrganizationUnit
      WHERE id = ? AND institutionId = ?
      LIMIT 1
    `).bind(ownerUnitId, institutionId).first<{ id: string }>();
    if (!unit) throw new Error('REG_OBLIGATION_OWNER_UNIT_NOT_FOUND');
  }

  const id = crypto.randomUUID();
  const now = nowIso();

  try {
    await db.prepare(`
      INSERT INTO RegulatoryObligation (
        id,institutionId,regulationId,obligationCode,sourceArticle,requirementText,
        requirementType,applicability,frequency,ownerUnitId,ownerName,criticality,
        effectiveDate,dueDate,reviewDate,status,complianceStatus,lastAssessmentDate,
        nextAssessmentDate,notes,createdBy,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'NOT_ASSESSED',NULL,NULL,?,?,?,?)
    `).bind(
      id,
      institutionId,
      regulationId,
      obligationCode,
      clean(input.sourceArticle),
      requirementText,
      clean(input.requirementType) || 'OTHER',
      clean(input.applicability) || 'Berlaku',
      clean(input.frequency),
      ownerUnitId,
      clean(input.ownerName),
      clean(input.criticality) || 'Sedang',
      normalizeDate(input.effectiveDate),
      normalizeDate(input.dueDate),
      normalizeDate(input.reviewDate),
      clean(input.status) || 'Draft',
      clean(input.notes),
      actorName,
      now,
      now
    ).run();
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('unique')) throw new Error('REG_OBLIGATION_DUPLICATE_CODE');
    throw error;
  }

  return getRegulatoryObligation(institutionId, id);
}

export async function updateRegulatoryObligation(
  institutionId: string,
  obligationId: string,
  input: {
    sourceArticle?: string | null;
    requirementText?: string | null;
    requirementType?: string | null;
    applicability?: string | null;
    frequency?: string | null;
    ownerUnitId?: string | null;
    ownerName?: string | null;
    criticality?: string | null;
    effectiveDate?: string | null;
    dueDate?: string | null;
    reviewDate?: string | null;
    status?: string | null;
    notes?: string | null;
  }
) {
  const db = await ensureRegulatoryObligationSchema();
  const existing = await getRegulatoryObligation(institutionId, obligationId);
  if (!existing) throw new Error('REG_OBLIGATION_NOT_FOUND');

  const ownerUnitId = input.ownerUnitId === undefined
    ? existing.ownerUnitId
    : clean(input.ownerUnitId);

  if (ownerUnitId) {
    const unit = await db.prepare(`
      SELECT id FROM OrganizationUnit
      WHERE id = ? AND institutionId = ?
      LIMIT 1
    `).bind(ownerUnitId, institutionId).first<{ id: string }>();
    if (!unit) throw new Error('REG_OBLIGATION_OWNER_UNIT_NOT_FOUND');
  }

  const requirementText = input.requirementText === undefined
    ? existing.requirementText
    : String(input.requirementText || '').trim();
  if (!requirementText) throw new Error('REG_OBLIGATION_REQUIRED');

  await db.prepare(`
    UPDATE RegulatoryObligation
    SET sourceArticle = ?, requirementText = ?, requirementType = ?, applicability = ?,
        frequency = ?, ownerUnitId = ?, ownerName = ?, criticality = ?,
        effectiveDate = ?, dueDate = ?, reviewDate = ?, status = ?, notes = ?, updatedAt = ?
    WHERE id = ? AND institutionId = ?
  `).bind(
    input.sourceArticle === undefined ? existing.sourceArticle : clean(input.sourceArticle),
    requirementText,
    input.requirementType === undefined ? existing.requirementType : (clean(input.requirementType) || 'OTHER'),
    input.applicability === undefined ? existing.applicability : (clean(input.applicability) || 'Berlaku'),
    input.frequency === undefined ? existing.frequency : clean(input.frequency),
    ownerUnitId,
    input.ownerName === undefined ? existing.ownerName : clean(input.ownerName),
    input.criticality === undefined ? existing.criticality : (clean(input.criticality) || 'Sedang'),
    input.effectiveDate === undefined ? existing.effectiveDate : normalizeDate(input.effectiveDate),
    input.dueDate === undefined ? existing.dueDate : normalizeDate(input.dueDate),
    input.reviewDate === undefined ? existing.reviewDate : normalizeDate(input.reviewDate),
    input.status === undefined ? existing.status : (clean(input.status) || 'Draft'),
    input.notes === undefined ? existing.notes : clean(input.notes),
    nowIso(),
    obligationId,
    institutionId
  ).run();

  return getRegulatoryObligation(institutionId, obligationId);
}

export async function getRegulatoryObligation(institutionId: string, obligationId: string) {
  const db = await ensureRegulatoryObligationSchema();
  return db.prepare(`
    SELECT id,institutionId,regulationId,obligationCode,sourceArticle,requirementText,
           requirementType,applicability,frequency,ownerUnitId,ownerName,criticality,
           effectiveDate,dueDate,reviewDate,status,complianceStatus,lastAssessmentDate,
           nextAssessmentDate,notes,createdBy,createdAt,updatedAt
    FROM RegulatoryObligation
    WHERE id = ? AND institutionId = ?
    LIMIT 1
  `).bind(obligationId, institutionId).first<RegulatoryObligation>();
}

export async function createRegulatoryObligationLink(
  institutionId: string,
  input: {
    obligationId: string;
    targetType: string;
    targetId: string;
    relationship?: string | null;
    rationale?: string | null;
  },
  actorName: string
) {
  const db = await ensureRegulatoryObligationSchema();
  const obligationId = String(input.obligationId || '').trim();
  const targetType = String(input.targetType || '').trim().toUpperCase() as ObligationTargetType;
  const targetId = String(input.targetId || '').trim();

  if (
    !obligationId ||
    !targetId ||
    !OBLIGATION_TARGET_TYPES.includes(targetType)
  ) {
    throw new Error('REG_OBLIGATION_LINK_REQUIRED');
  }
  if (!(await obligationExists(db, institutionId, obligationId))) {
    throw new Error('REG_OBLIGATION_NOT_FOUND');
  }
  if (!(await targetExists(db, institutionId, targetType, targetId))) {
    throw new Error('REG_OBLIGATION_TARGET_NOT_FOUND');
  }

  const id = crypto.randomUUID();
  const relationship = clean(input.relationship) || (
    targetType === 'INTERNAL_POLICY' ? 'IMPLEMENTED_BY' :
    targetType === 'PROCESS' ? 'APPLIES_TO' :
    targetType === 'RISK' ? 'DRIVES_RISK' :
    targetType === 'CONTROL' ? 'SATISFIED_BY' :
    'EVIDENCED_BY'
  );

  try {
    await db.prepare(`
      INSERT INTO RegulatoryObligationLink (
        id,institutionId,obligationId,targetType,targetId,relationship,rationale,createdBy,createdAt
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `).bind(
      id,
      institutionId,
      obligationId,
      targetType,
      targetId,
      relationship,
      clean(input.rationale),
      actorName,
      nowIso()
    ).run();
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('unique')) throw new Error('REG_OBLIGATION_LINK_DUPLICATE');
    throw error;
  }

  return db.prepare(`
    SELECT id,institutionId,obligationId,targetType,targetId,relationship,rationale,createdBy,createdAt
    FROM RegulatoryObligationLink
    WHERE id = ? AND institutionId = ?
    LIMIT 1
  `).bind(id, institutionId).first<RegulatoryObligationLink>();
}

export async function deleteRegulatoryObligationLink(
  institutionId: string,
  linkId: string
) {
  const db = await ensureRegulatoryObligationSchema();
  const existing = await db.prepare(`
    SELECT id
    FROM RegulatoryObligationLink
    WHERE id = ? AND institutionId = ?
    LIMIT 1
  `).bind(linkId, institutionId).first<{ id: string }>();
  if (!existing) throw new Error('REG_OBLIGATION_LINK_NOT_FOUND');

  await db.prepare(`
    DELETE FROM RegulatoryObligationLink
    WHERE id = ? AND institutionId = ?
  `).bind(linkId, institutionId).run();

  return { id: linkId, deleted: true };
}

export async function recordRegulatoryObligationAssessment(
  institutionId: string,
  input: {
    obligationId: string;
    complianceStatus: string;
    assessmentDate?: string | null;
    assessedBy: string;
    conclusion?: string | null;
    gapSummary?: string | null;
    remediationRequired?: boolean;
    actionOwner?: string | null;
    dueDate?: string | null;
    nextAssessmentDate?: string | null;
  }
) {
  const db = await ensureRegulatoryObligationSchema();
  const obligationId = String(input.obligationId || '').trim();
  const assessedBy = String(input.assessedBy || '').trim();
  const complianceStatus = String(input.complianceStatus || '').trim().toUpperCase();
  const allowedStatuses = [
    'NOT_ASSESSED',
    'COMPLIANT',
    'PARTIAL',
    'NON_COMPLIANT',
    'NOT_APPLICABLE'
  ];

  if (!obligationId || !assessedBy || !allowedStatuses.includes(complianceStatus)) {
    throw new Error('REG_OBLIGATION_ASSESSMENT_REQUIRED');
  }
  if (!(await obligationExists(db, institutionId, obligationId))) {
    throw new Error('REG_OBLIGATION_NOT_FOUND');
  }

  const assessmentDate = normalizeDate(input.assessmentDate) || nowIso().slice(0, 10);
  const nextAssessmentDate = normalizeDate(input.nextAssessmentDate);
  const dueDate = normalizeDate(input.dueDate);
  const remediationRequired =
    input.remediationRequired === true ||
    complianceStatus === 'PARTIAL' ||
    complianceStatus === 'NON_COMPLIANT';

  if (remediationRequired && !clean(input.actionOwner)) {
    throw new Error('REG_OBLIGATION_ACTION_OWNER_REQUIRED');
  }
  if (remediationRequired && !normalizeDate(input.dueDate)) {
    throw new Error('REG_OBLIGATION_ACTION_DUE_REQUIRED');
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();

  await db.prepare(`
    INSERT INTO RegulatoryObligationAssessment (
      id,institutionId,obligationId,complianceStatus,assessmentDate,assessedBy,
      conclusion,gapSummary,remediationRequired,actionOwner,dueDate,nextAssessmentDate,createdAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id,
    institutionId,
    obligationId,
    complianceStatus,
    assessmentDate,
    assessedBy,
    clean(input.conclusion),
    clean(input.gapSummary),
    remediationRequired ? 1 : 0,
    clean(input.actionOwner),
    dueDate,
    nextAssessmentDate,
    createdAt
  ).run();

  await db.prepare(`
    UPDATE RegulatoryObligation
    SET complianceStatus = ?, lastAssessmentDate = ?, nextAssessmentDate = ?, updatedAt = ?
    WHERE id = ? AND institutionId = ?
  `).bind(
    complianceStatus,
    assessmentDate,
    nextAssessmentDate,
    createdAt,
    obligationId,
    institutionId
  ).run();

  return db.prepare(`
    SELECT id,institutionId,obligationId,complianceStatus,assessmentDate,assessedBy,
           conclusion,gapSummary,remediationRequired,actionOwner,dueDate,nextAssessmentDate,createdAt
    FROM RegulatoryObligationAssessment
    WHERE id = ? AND institutionId = ?
    LIMIT 1
  `).bind(id, institutionId).first<RegulatoryObligationAssessment>();
}

export async function getRegulatoryComplianceUniverse(institutionId: string) {
  const db = await ensureRegulatoryObligationSchema();

  const [
    obligationsResult,
    linksResult,
    assessmentsResult,
    regulationsResult,
    policiesResult,
    processesResult,
    risksResult,
    controlsResult,
    evidenceResult,
    orgUnitsResult,
    controlRiskMappingsResult
  ] = await Promise.all([
    db.prepare(`
      SELECT id,institutionId,regulationId,obligationCode,sourceArticle,requirementText,
             requirementType,applicability,frequency,ownerUnitId,ownerName,criticality,
             effectiveDate,dueDate,reviewDate,status,complianceStatus,lastAssessmentDate,
             nextAssessmentDate,notes,createdBy,createdAt,updatedAt
      FROM RegulatoryObligation
      WHERE institutionId = ?
      ORDER BY regulationId ASC, obligationCode ASC
      LIMIT 5000
    `).bind(institutionId).all<RegulatoryObligation>(),
    db.prepare(`
      SELECT id,institutionId,obligationId,targetType,targetId,relationship,rationale,createdBy,createdAt
      FROM RegulatoryObligationLink
      WHERE institutionId = ?
      ORDER BY createdAt DESC
      LIMIT 10000
    `).bind(institutionId).all<RegulatoryObligationLink>(),
    db.prepare(`
      SELECT id,institutionId,obligationId,complianceStatus,assessmentDate,assessedBy,
             conclusion,gapSummary,remediationRequired,actionOwner,dueDate,nextAssessmentDate,createdAt
      FROM RegulatoryObligationAssessment
      WHERE institutionId = ?
      ORDER BY assessmentDate DESC, createdAt DESC
      LIMIT 10000
    `).bind(institutionId).all<RegulatoryObligationAssessment>(),
    db.prepare(`
      SELECT id,regulator,regulationCode,title,category,issueDate,effectiveDate,status,sourceUrl
      FROM ExternalRegulationWatch
      WHERE institutionId = ?
      ORDER BY COALESCE(issueDate,createdAt) DESC, updatedAt DESC
      LIMIT 1000
    `).bind(institutionId).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT id,documentCode,documentType,title,ownerUnit,ownerName,status,version
      FROM PolicyDocument
      WHERE institutionId = ?
      ORDER BY documentCode ASC
      LIMIT 3000
    `).bind(institutionId).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT id,processId,name,ownerName,criticality,classification,status
      FROM BusinessProcess
      WHERE institutionId = ?
      ORDER BY processId ASC
      LIMIT 3000
    `).bind(institutionId).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT id,processId,riskId,name,category,ownerName,inherentRating,residualRating,status
      FROM RiskMaster
      WHERE institutionId = ?
      ORDER BY riskId ASC
      LIMIT 5000
    `).bind(institutionId).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT id,processId,controlId,name,controlOwner,type,nature,frequency,isKeyControl,overallHealth,status
      FROM ControlMaster
      WHERE institutionId = ?
      ORDER BY controlId ASC
      LIMIT 5000
    `).bind(institutionId).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT id,evidenceId,title,category,ownerName,status,currentVersionId,updatedAt
      FROM EvidenceDocument
      WHERE institutionId = ?
      ORDER BY evidenceId ASC
      LIMIT 5000
    `).bind(institutionId).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT id,code,name,type,status
      FROM OrganizationUnit
      WHERE institutionId = ? AND status = 'Active'
      ORDER BY code ASC
      LIMIT 3000
    `).bind(institutionId).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT m.controlId,m.riskId
      FROM ControlRiskMapping m
      JOIN ControlMaster c ON c.id = m.controlId
      JOIN RiskMaster r ON r.id = m.riskId
      WHERE c.institutionId = ? AND r.institutionId = ?
      LIMIT 10000
    `).bind(institutionId, institutionId).all<{ controlId: string; riskId: string }>()
  ]);

  const obligations = obligationsResult.results || [];
  const links = linksResult.results || [];
  const assessments = assessmentsResult.results || [];

  const linkTypesByObligation = new Map<string, Set<string>>();
  for (const link of links) {
    const current = linkTypesByObligation.get(link.obligationId) || new Set<string>();
    current.add(link.targetType);
    linkTypesByObligation.set(link.obligationId, current);
  }

  const today = new Date().toISOString().slice(0, 10);
  const gapStatuses = new Set(['PARTIAL', 'NON_COMPLIANT']);
  const processByRisk = new Map(
    (risksResult.results || []).map(item => [String(item.id), String(item.processId || '')])
  );
  const processByControl = new Map(
    (controlsResult.results || []).map(item => [String(item.id), String(item.processId || '')])
  );
  const riskIdsByControl = new Map<string, Set<string>>();
  for (const mapping of controlRiskMappingsResult.results || []) {
    const set = riskIdsByControl.get(String(mapping.controlId)) || new Set<string>();
    set.add(String(mapping.riskId));
    riskIdsByControl.set(String(mapping.controlId), set);
  }

  const linksByObligation = new Map<string, RegulatoryObligationLink[]>();
  for (const link of links) {
    const current = linksByObligation.get(link.obligationId) || [];
    current.push(link);
    linksByObligation.set(link.obligationId, current);
  }

  const coherentChain = (obligationId: string) => {
    const obligationLinks = linksByObligation.get(obligationId) || [];
    const policyLinks = obligationLinks.filter(item => item.targetType === 'INTERNAL_POLICY');
    const processLinks = obligationLinks.filter(item => item.targetType === 'PROCESS');
    const riskLinks = obligationLinks.filter(item => item.targetType === 'RISK');
    const controlLinks = obligationLinks.filter(item => item.targetType === 'CONTROL');
    const evidenceLinks = obligationLinks.filter(item => item.targetType === 'EVIDENCE');

    if (!policyLinks.length || !processLinks.length || !riskLinks.length ||
        !controlLinks.length || !evidenceLinks.length) return false;

    const processIds = new Set(processLinks.map(item => item.targetId));
    for (const riskLink of riskLinks) {
      const riskProcessId = processByRisk.get(riskLink.targetId);
      if (!riskProcessId || !processIds.has(riskProcessId)) continue;

      for (const controlLink of controlLinks) {
        const controlProcessId = processByControl.get(controlLink.targetId);
        const mappedRisks = riskIdsByControl.get(controlLink.targetId);
        if (
          controlProcessId === riskProcessId &&
          mappedRisks?.has(riskLink.targetId)
        ) {
          return true;
        }
      }
    }
    return false;
  };

  const latestAssessmentByObligation = new Map<string, RegulatoryObligationAssessment>();
  for (const assessment of assessments) {
    if (!latestAssessmentByObligation.has(assessment.obligationId)) {
      latestAssessmentByObligation.set(assessment.obligationId, assessment);
    }
  }

  const metrics = {
    totalObligations: obligations.length,
    activeObligations: obligations.filter(item => item.status === 'Active').length,
    compliant: obligations.filter(item => item.complianceStatus === 'COMPLIANT').length,
    partial: obligations.filter(item => item.complianceStatus === 'PARTIAL').length,
    nonCompliant: obligations.filter(item => item.complianceStatus === 'NON_COMPLIANT').length,
    notAssessed: obligations.filter(item => item.complianceStatus === 'NOT_ASSESSED').length,
    gapObligations: obligations.filter(item => gapStatuses.has(item.complianceStatus)).length,
    overdueActions: Array.from(latestAssessmentByObligation.values()).filter(
      item => item.remediationRequired === 1 &&
        Boolean(item.dueDate) &&
        String(item.dueDate) < today &&
        gapStatuses.has(item.complianceStatus)
    ).length,
    completeTraceability: obligations.filter(item => coherentChain(item.id)).length,
    unmapped: obligations.filter(item => !linkTypesByObligation.get(item.id)?.size).length
  };

  return {
    metrics,
    obligations,
    links,
    assessments,
    lookups: {
      regulations: regulationsResult.results || [],
      policies: policiesResult.results || [],
      processes: processesResult.results || [],
      risks: risksResult.results || [],
      controls: controlsResult.results || [],
      evidence: evidenceResult.results || [],
      orgUnits: orgUnitsResult.results || []
    }
  };
}
