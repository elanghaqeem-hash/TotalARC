import type { AuthUserProfile } from '@/lib/auth';

export type WorkpaperType = 'ToD' | 'ToE';
export type GovernanceDb = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
      all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
      run(): Promise<unknown>;
    };
  };
};

export async function readIcofrJson(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length') || 0)>32000) throw new Error('PAYLOAD_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('INVALID_JSON');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size>32000) { await reader.cancel(); throw new Error('PAYLOAD_TOO_LARGE'); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.byteLength; }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || Array.isArray(value) || typeof value!=='object') throw new Error('INVALID_JSON');
  return value as Record<string, unknown>;
}

const columns: Record<WorkpaperType, string[]> = {
  ToD: ['id', 'controlDomainId', 'period', 'testerName', 'reviewerName',
    'objectiveAlignment', 'riskCoverage', 'precisionAdequate', 'evidenceSufficiency',
    'walkthroughComplete', 'conclusion', 'status', 'notes'],
  ToE: ['id', 'controlId', 'processId', 'riskId', 'period', 'testerName', 'reviewerName',
    'populationSize', 'populationSource', 'samplingMethod', 'sampleSize', 'passCount',
    'failCount', 'testerConclusion', 'finalConclusion', 'status', 'notes', 'testedAt', 'sampleSnapshot']
};

export function sampleSnapshotSql(alias = 't') {
  const keys = ['id','sampleNumber','transactionRef','transactionDate','amount','attributesTested','result','failureReason','evidenceRef'];
  return "(SELECT json_group_array(json_object(" + keys.map(key=>"'"+key+"',s."+key).join(',') +
    ")) FROM (SELECT * FROM TestSample WHERE toeTestId=" + alias + ".id ORDER BY sampleNumber,id) s)";
}

export function testSnapshotSql(type: WorkpaperType, alias = 't') {
  return 'json_object(' + columns[type].map(key => key==='sampleSnapshot' ? `'sampleSnapshot',(${sampleSnapshotSql(alias)})||''` : `'${key}',${alias}.${key}`).join(',') + ')';
}

export function testSnapshot(type: WorkpaperType, row: Record<string, unknown>) {
  return JSON.stringify(Object.fromEntries(columns[type].map(key => [key, row[key] ?? null])));
}

// This predicate is shared by the UI and the production verifier. A draft,
// a forged display name, stale test contents or missing file bytes cannot qualify.
function approvedPredicate(type: WorkpaperType, tenant: string) {
  return `t.status='Approved' AND TRIM(t.period)<>'' AND EXISTS (
    SELECT 1 FROM ICOFRTestGovernance g
    JOIN ICOFRWorkpaperReview w ON w.id=g.reviewId AND w.institutionId=g.institutionId
      AND w.workpaperType=g.workpaperType AND w.workpaperId=g.workpaperId
    WHERE g.institutionId=${tenant} AND g.workpaperType='${type}' AND g.workpaperId=t.id
      AND g.preparerUserId<>g.reviewerUserId AND TRIM(g.preparerUserId)<>''
      AND TRIM(g.reviewerUserId)<>'' AND g.reviewerRole='Reviewer'
      AND g.approvedSnapshot=${testSnapshotSql(type)}
      AND w.status='Approved' AND w.reviewerDecision='Approved' AND w.period=t.period
      AND w.preparedBy=g.preparerName AND w.reviewerName=g.reviewerName
      AND w.reviewedAt=g.approvedAt
      AND w.scopeObjectiveComplete=1 AND w.proceduresComplete=1 AND w.evidenceIndexed=1
      AND w.exceptionsEvaluated=1 AND w.crossReferencesComplete=1 AND w.conclusionSupported=1
      AND NOT EXISTS (SELECT 1 FROM ICOFRWorkpaperReviewNote n WHERE n.reviewId=w.id
        AND n.institutionId=w.institutionId AND n.status NOT IN ('Cleared','Waived'))
      AND (SELECT COUNT(*) FROM ICOFRWorkpaperEvidenceIndex i WHERE i.reviewId=w.id AND i.institutionId=w.institutionId)
        =(SELECT COUNT(*) FROM ICOFRTestEvidence e WHERE e.institutionId=g.institutionId
          AND e.workpaperType=g.workpaperType AND e.workpaperId=g.workpaperId)
      AND EXISTS (SELECT 1 FROM ICOFRTestEvidence e WHERE e.institutionId=g.institutionId
        AND e.workpaperType=g.workpaperType AND e.workpaperId=g.workpaperId)
      AND NOT EXISTS (
        SELECT 1 FROM ICOFRTestEvidence e
        LEFT JOIN ICOFRWorkpaperEvidenceIndex i ON i.id=e.evidenceIndexId
          AND i.institutionId=e.institutionId AND i.reviewId=g.reviewId
        LEFT JOIN EvidenceVersion v ON v.id=e.versionId AND v.institutionId=e.institutionId
        LEFT JOIN EvidenceDocument d ON d.id=v.documentId AND d.institutionId=v.institutionId
        WHERE e.institutionId=g.institutionId AND e.workpaperType=g.workpaperType
          AND e.workpaperId=g.workpaperId AND (
            i.id IS NULL OR i.reviewerDecision<>'Accepted' OR i.reviewedAt IS NOT e.evidenceReviewedAt
            OR v.id IS NULL OR v.sha256 IS NOT e.sha256 OR length(v.sha256)<>64
            OR v.sha256 GLOB '*[^0-9a-fA-F]*' OR v.sizeBytes<=0 OR v.isCurrent<>1
            OR d.id IS NULL OR d.status<>'Active' OR d.currentVersionId IS NOT v.id
            OR NOT EXISTS (SELECT 1 FROM EvidenceLink l WHERE l.institutionId=e.institutionId
              AND l.entityType='WORKPAPER_EVIDENCE' AND l.entityId=i.id
              AND l.versionId=v.id AND l.documentId=d.id)
            OR NOT EXISTS (SELECT 1 FROM EvidenceBinaryChunk b WHERE b.versionId=v.id)
            OR (SELECT COALESCE(SUM(b.byteLength),0) FROM EvidenceBinaryChunk b WHERE b.versionId=v.id)<>v.sizeBytes
          ))
  )`;
}

export const TEST_GOVERNANCE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS ICOFRTestGovernance (
    institutionId TEXT NOT NULL, workpaperType TEXT NOT NULL, workpaperId TEXT NOT NULL,
    preparerUserId TEXT NOT NULL, preparerName TEXT NOT NULL,
    reviewerUserId TEXT, reviewerName TEXT, reviewerRole TEXT, reviewId TEXT,
    approvedSnapshot TEXT, approvedAt TEXT,
    PRIMARY KEY(institutionId,workpaperType,workpaperId)
  );
  CREATE TABLE IF NOT EXISTS ICOFRTestEvidence (
    institutionId TEXT NOT NULL, workpaperType TEXT NOT NULL, workpaperId TEXT NOT NULL,
    evidenceIndexId TEXT NOT NULL, versionId TEXT NOT NULL, sha256 TEXT NOT NULL,
    evidenceReviewedAt TEXT NOT NULL,
    PRIMARY KEY(institutionId,workpaperType,workpaperId,evidenceIndexId)
  );
  CREATE VIEW IF NOT EXISTS ICOFRApprovedToDV1 AS
    SELECT t.* FROM ICOFRDesignAssessment t WHERE ${approvedPredicate('ToD', 't.institutionId')}
      AND t.conclusion IN ('Effective','Partially Effective','Ineffective')
      AND (t.conclusion<>'Effective' OR (t.objectiveAlignment=1 AND t.riskCoverage=1
        AND t.precisionAdequate=1 AND t.evidenceSufficiency=1 AND t.walkthroughComplete=1));
  CREATE VIEW IF NOT EXISTS ICOFRApprovedToEV1 AS
    SELECT t.*,c.institutionId FROM ToETest t JOIN ControlMaster c ON c.id=t.controlId
    WHERE ${approvedPredicate('ToE', 'c.institutionId')}
      AND t.sampleSize>0 AND t.populationSize>=t.sampleSize
      AND TRIM(t.populationSource) NOT IN ('','Not Provided')
      AND TRIM(t.samplingMethod) NOT IN ('','Not Selected')
      AND t.finalConclusion IN ('Effective','Partially Effective','Ineffective')
      AND t.sampleSize=(SELECT COUNT(*) FROM TestSample s WHERE s.toeTestId=t.id)
      AND t.passCount=(SELECT COUNT(*) FROM TestSample s WHERE s.toeTestId=t.id AND s.result='Pass')
      AND t.failCount=(SELECT COUNT(*) FROM TestSample s WHERE s.toeTestId=t.id AND s.result='Fail')
      AND t.sampleSize=t.passCount+t.failCount
      AND NOT EXISTS (SELECT 1 FROM TestSample s WHERE s.toeTestId=t.id AND
        (s.result NOT IN ('Pass','Fail') OR TRIM(COALESCE(s.evidenceRef,''))='' OR
          (s.result='Fail' AND NOT EXISTS (SELECT 1 FROM TestingException x
            WHERE x.toeTestId=t.id AND x.sampleRef=s.transactionRef))));
  CREATE VIEW IF NOT EXISTS ICOFRPublishedMappingV1 AS
    SELECT m.* FROM ICOFRMappingProposal m
    JOIN SourceDocument s ON s.id=m.sourceDocumentId AND s.institutionId=m.institutionId
      AND s.rawSha256=m.sourceHash
    JOIN SourceStructuredRecord r ON r.sourceDocumentId=s.id AND r.institutionId=s.institutionId
      AND r.recordKey=m.sourceRecordKey AND r.recordType='ICOFR_SIGNIFICANT_ACCOUNT' AND r.status<>'RETIRED'
    JOIN ICOFRControlDomain c ON c.id=m.controlDomainId AND c.institutionId=m.institutionId
      AND c.sourceControlId=m.controlMasterId AND c.category='PLC' AND c.status IN ('Approved','Active','Validated')
    JOIN ControlRiskMapping cr ON cr.controlId=m.controlMasterId AND cr.riskId=m.riskId
    JOIN RiskMaster risk ON risk.id=m.riskId AND risk.institutionId=m.institutionId
    JOIN ControlMaster control ON control.id=m.controlMasterId AND control.institutionId=m.institutionId
    WHERE EXISTS (SELECT 1 FROM ICOFRScopeItem fi
      JOIN ICOFRScopeItem pi ON pi.scopeId=fi.scopeId AND pi.itemType='Business Process' AND pi.sourceId=risk.processId
      JOIN ICOFRScopeLink sl ON sl.scopeId=fi.scopeId AND sl.fromItemId=fi.id AND sl.toItemId=pi.id AND sl.relationType='FSLI_TO_PROCESS'
      JOIN ICOFRScope sc ON sc.id=fi.scopeId AND sc.institutionId=m.institutionId
      WHERE fi.sourceId=m.financialItemId AND fi.itemType='Financial Account')
      AND m.status='PUBLISHED' AND TRIM(COALESCE(m.createdBy,''))<>''
      AND TRIM(COALESCE(m.ownerReviewedBy,''))<>'' AND TRIM(COALESCE(m.icofrReviewedBy,''))<>''
      AND TRIM(COALESCE(m.approvedBy,''))<>'' AND length(m.sourceHash)=64
      AND m.createdBy<>m.ownerReviewedBy AND m.createdBy<>m.icofrReviewedBy AND m.createdBy<>m.approvedBy
      AND m.ownerReviewedBy<>m.icofrReviewedBy AND m.ownerReviewedBy<>m.approvedBy AND m.icofrReviewedBy<>m.approvedBy
`;

export function validateTodInput(input: Record<string, unknown>) {
  if (input.status === null || input.conclusion === null) throw new Error('TOD_INVALID_FIELD_TYPE');
  for (const key of ['status', 'conclusion', 'period', 'controlDomainId', 'testId', 'id',
    'testerName', 'reviewerName', 'notes']) {
    if (input[key] !== undefined && input[key] !== null && typeof input[key] !== 'string')
      throw new Error('TOD_INVALID_FIELD_TYPE');
  }
  for (const key of ['objectiveAlignment', 'riskCoverage', 'precisionAdequate',
    'evidenceSufficiency', 'walkthroughComplete']) {
    if (input[key] !== undefined && typeof input[key] !== 'boolean')
      throw new Error('TOD_INVALID_FIELD_TYPE');
  }
  const status = input.status ?? 'Draft', conclusion = input.conclusion ?? 'Not Assessed';
  if (!['Draft', 'Under Review', 'Approved'].includes(status as string)) throw new Error('TOD_INVALID_STATUS');
  if (!['Not Assessed', 'Effective', 'Partially Effective', 'Ineffective'].includes(conclusion as string))
    throw new Error('TOD_INVALID_CONCLUSION');
  return { ...input, status, conclusion };
}

export function assertDesignConclusion(row: Record<string, unknown>, conclusion: string) {
  if (!['Effective', 'Partially Effective', 'Ineffective'].includes(conclusion))
    throw new Error('TOD_ASSESSMENT_REQUIRED');
  if (conclusion === 'Effective' && !['objectiveAlignment', 'riskCoverage', 'precisionAdequate',
    'evidenceSufficiency', 'walkthroughComplete'].every(key => row[key] === true || row[key] === 1))
    throw new Error('TOD_EFFECTIVENESS_CRITERIA_REQUIRED');
}

export async function bindTestPreparer(db: GovernanceDb, institutionId: string, type: WorkpaperType,
  workpaperId: string, actor: AuthUserProfile, testerName: string) {
  if (!actor?.id || (actor.role !== 'SystemAdmin' && actor.institutionId !== institutionId))
    throw new Error('TEST_ACTOR_REQUIRED');
  const existing = await db.prepare(`SELECT * FROM ICOFRTestGovernance
    WHERE institutionId=? AND workpaperType=? AND workpaperId=?`)
    .bind(institutionId, type, workpaperId).first<Record<string, unknown>>();
  if (existing?.approvedSnapshot) throw new Error('REVIEW_LOCKED');
  if (existing && existing.preparerUserId !== actor.id) throw new Error('TEST_PREPARER_REQUIRED');
  if (!existing && ![actor.name, actor.email].some(v => v.trim().toLowerCase() === testerName.trim().toLowerCase()))
    throw new Error('TEST_PREPARER_REQUIRED');
  await db.prepare(`INSERT INTO ICOFRTestGovernance
    (institutionId,workpaperType,workpaperId,preparerUserId,preparerName) VALUES (?,?,?,?,?)
    ON CONFLICT(institutionId,workpaperType,workpaperId) DO UPDATE SET preparerName=excluded.preparerName
      WHERE ICOFRTestGovernance.preparerUserId=excluded.preparerUserId AND ICOFRTestGovernance.approvedSnapshot IS NULL`)
    .bind(institutionId, type, workpaperId, actor.id, actor.name).run();
  const bound = await db.prepare(`SELECT preparerUserId FROM ICOFRTestGovernance
    WHERE institutionId=? AND workpaperType=? AND workpaperId=?`)
    .bind(institutionId, type, workpaperId).first<{ preparerUserId: string }>();
  if (bound?.preparerUserId !== actor.id) throw new Error('TEST_PREPARER_REQUIRED');
}

export async function assertIndependentReviewer(db: GovernanceDb, institutionId: string,
  type: WorkpaperType, workpaperId: string, actor: AuthUserProfile) {
  if (!actor?.id || actor.role !== 'Reviewer' || actor.institutionId !== institutionId)
    throw new Error('TEST_REVIEWER_REQUIRED');
  const identity = await db.prepare(`SELECT * FROM ICOFRTestGovernance
    WHERE institutionId=? AND workpaperType=? AND workpaperId=?`)
    .bind(institutionId, type, workpaperId).first<Record<string, unknown>>();
  if (!identity?.preparerUserId) throw new Error('TEST_PREPARER_REQUIRED');
  if (identity.preparerUserId === actor.id) throw new Error('TOD_SEGREGATION_REQUIRED');
  return identity;
}
