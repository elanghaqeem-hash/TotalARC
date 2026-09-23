import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureCoreDomainSchema } from '@/lib/d1-core';

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

type DraftDecision = 'APPROVE' | 'REJECT';

async function getDb(): Promise<D1DatabaseLike> {
  await ensureCoreDomainSchema();
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('Cloudflare D1 binding "DB" is not available.');
  return db;
}

async function all<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
): Promise<T[]> {
  const statement = db.prepare(sql);
  const result = values.length
    ? await statement.bind(...values).all<T>()
    : await statement.all<T>();
  return result.results || [];
}

async function first<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
): Promise<T | null> {
  const statement = db.prepare(sql);
  return values.length
    ? statement.bind(...values).first<T>()
    : statement.first<T>();
}

async function run(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const statement = db.prepare(sql);
  return values.length ? statement.bind(...values).run() : statement.run();
}

function nowIso() {
  return new Date().toISOString();
}

function bool(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function safeCode(value: unknown) {
  const normalized = String(value || 'PROCESS')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
  return normalized || 'PROCESS';
}

function derivedRiskCategory(categoryName: unknown) {
  const category = String(categoryName || '').toLowerCase();
  if (category.includes('technology') || category.includes('cyber')) return 'Technology & Cyber';
  if (category.includes('finance') || category.includes('treasury')) return 'Financial / Operational';
  if (category.includes('compliance') || category.includes('governance')) return 'Governance / Compliance';
  return 'Operational';
}

async function writeAudit(
  db: D1DatabaseLike,
  input: {
    institutionId: string;
    userName: string;
    action: string;
    recordId: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason: string;
  }
) {
  await run(
    db,
    `INSERT INTO AuditLog (
      id, institutionId, userName, userRole, action, entityType, recordId,
      oldValue, newValue, reason, ipAddress, timestamp
    ) VALUES (?, ?, ?, 'RCM Reviewer', ?, 'RCMDraft', ?, ?, ?, ?, NULL, ?)`,
    [
      crypto.randomUUID(),
      input.institutionId,
      input.userName || 'System',
      input.action,
      input.recordId,
      input.oldValue === undefined ? null : JSON.stringify(input.oldValue),
      input.newValue === undefined ? null : JSON.stringify(input.newValue),
      input.reason,
      nowIso()
    ]
  );
}

export async function listBpmWithoutRcm() {
  const db = await getDb();
  const rows = await all<Record<string, unknown>>(
    db,
    `SELECT
        p.id,
        p.institutionId,
        p.processId,
        p.name,
        p.description,
        p.ownerName,
        p.criticality,
        p.classification,
        p.isIcofrRelevant,
        p.status,
        pc.name AS categoryName,
        (SELECT COUNT(*) FROM ProcessActivity pa WHERE pa.processId = p.id) AS activityCount,
        (SELECT COUNT(*) FROM RiskMaster r WHERE r.processId = p.id) AS riskCount,
        (SELECT COUNT(*) FROM ControlMaster c WHERE c.processId = p.id) AS controlCount,
        (
          SELECT COUNT(*)
            FROM ControlRiskMapping m
            JOIN ControlMaster c ON c.id = m.controlId
           WHERE c.processId = p.id
        ) AS mappingCount,
        (
          SELECT COUNT(*)
            FROM RCMDraftReference d
           WHERE d.institutionId = p.institutionId
             AND d.referenceType = 'BPM_RCM_DRAFT'
             AND d.sourceRecordId = p.id
             AND d.sourceStatus = 'DRAFT_PENDING_VALIDATION'
        ) AS pendingDraftCount
       FROM BusinessProcess p
       LEFT JOIN ProcessCategory pc ON pc.id = p.categoryId
      WHERE NOT EXISTS (
        SELECT 1
          FROM ControlRiskMapping m
          JOIN ControlMaster c ON c.id = m.controlId
         WHERE c.processId = p.id
      )
      ORDER BY p.processId ASC`
  );

  return rows.map(row => {
    const controlCount = Number(row.controlCount || 0);
    const pendingDraftCount = Number(row.pendingDraftCount || 0);
    const coverageStatus =
      pendingDraftCount > 0
        ? 'PENDING_USER_VALIDATION'
        : controlCount > 0
          ? 'MAPPING_REVIEW_REQUIRED'
          : 'DRAFT_BUILD_READY';

    return {
      id: String(row.id),
      institutionId: String(row.institutionId),
      processId: String(row.processId),
      name: String(row.name),
      description: row.description || null,
      ownerName: row.ownerName || null,
      criticality: row.criticality || null,
      classification: row.classification || null,
      isIcofrRelevant: bool(row.isIcofrRelevant),
      status: row.status || null,
      categoryName: row.categoryName || 'Uncategorized',
      activityCount: Number(row.activityCount || 0),
      riskCount: Number(row.riskCount || 0),
      controlCount,
      mappingCount: Number(row.mappingCount || 0),
      pendingDraftCount,
      coverageStatus,
      generationEligible: coverageStatus === 'DRAFT_BUILD_READY',
      note:
        coverageStatus === 'MAPPING_REVIEW_REQUIRED'
          ? 'Existing controls are present without a complete risk-control mapping. Manual mapping review is required; Total ARC will not infer or overwrite those controls.'
          : coverageStatus === 'PENDING_USER_VALIDATION'
            ? 'BPM-derived RCM draft is waiting for user validation.'
            : 'No operational RCM mapping exists. A BPM-derived draft can be generated for user validation.'
    };
  });
}

function buildDerivedPair(input: {
  process: Record<string, unknown>;
  categoryName: string;
  objective: string | null;
  activity: Record<string, unknown> | null;
  risk: Record<string, unknown> | null;
  index: number;
}) {
  const { process, categoryName, objective, activity, risk, index } = input;
  const processCode = safeCode(process.processId);
  const sequence = String(index + 1).padStart(2, '0');
  const activityName = activity ? String(activity.name || 'Process activity') : null;
  const activityDescription = activity ? String(activity.description || '').trim() : '';
  const processName = String(process.name);
  const ownerName =
    String(activity?.performer || '').trim() ||
    String(process.ownerName || '').trim() ||
    'Pending user validation';
  const systemUsed = String(activity?.systemUsed || '').trim() || null;
  const frequency = String(activity?.frequency || '').trim() || 'Per Transaction';
  const nature = String(activity?.nature || '').trim() || 'Manual';

  const derivedRisk = risk
    ? {
        existingRiskId: String(risk.id),
        riskId: String(risk.riskId),
        name: String(risk.name),
        description: String(risk.description || ''),
        cause: String(risk.cause || ''),
        event: String(risk.event || ''),
        impact: String(risk.impact || ''),
        category: String(risk.category || 'Operational'),
        ownerName: String(risk.ownerName || ownerName),
        inherentLikelihood: Number(risk.inherentLikelihood || 0),
        inherentImpact: Number(risk.inherentImpact || 0),
        inherentScore: Number(risk.inherentScore || 0),
        inherentRating: String(risk.inherentRating || 'Not Assessed'),
        residualLikelihood: Number(risk.residualLikelihood || 0),
        residualImpact: Number(risk.residualImpact || 0),
        residualScore: Number(risk.residualScore || 0),
        residualRating: String(risk.residualRating || 'Not Assessed')
      }
    : {
        existingRiskId: null,
        riskId: `BPM-RSK-${processCode}-${sequence}`,
        name: activityName
          ? `Risiko kegagalan aktivitas ${activityName}`
          : `Risiko kegagalan proses ${processName}`,
        description: activityName
          ? `Draft risiko yang diturunkan dari BPM untuk aktivitas ${activityName}. Pernyataan ini wajib divalidasi user sebelum digunakan.`
          : `Draft risiko yang diturunkan dari BPM untuk proses ${processName}. Pernyataan ini wajib divalidasi user sebelum digunakan.`,
        cause: activityDescription
          ? `Ketidaktepatan pelaksanaan terhadap ketentuan aktivitas: ${activityDescription}`
          : `Ketidaktepatan pelaksanaan, data, otorisasi, atau dukungan sistem pada ${activityName || processName}`,
        event: `${activityName || processName} tidak dilaksanakan secara lengkap, akurat, tepat waktu, dan sesuai BPM/prosedur yang ditetapkan`,
        impact: `Tujuan proses ${processName} tidak tercapai dan dapat menimbulkan kesalahan proses, keterlambatan, ketidakakuratan data, atau ketidakpatuhan`,
        category: derivedRiskCategory(categoryName),
        ownerName,
        inherentLikelihood: 0,
        inherentImpact: 0,
        inherentScore: 0,
        inherentRating: 'Not Assessed',
        residualLikelihood: 0,
        residualImpact: 0,
        residualScore: 0,
        residualRating: 'Not Assessed'
      };

  const controlSubject = activityName || String(derivedRisk.name);
  const controlId = `BPM-CTL-${processCode}-${sequence}`;

  return {
    schemaVersion: 1,
    generatedAt: nowIso(),
    generatedBy: 'Total ARC BPM-to-RCM Draft Generator',
    validationRequired: true,
    process: {
      id: String(process.id),
      institutionId: String(process.institutionId),
      processId: String(process.processId),
      name: processName,
      description: process.description || null,
      ownerName: process.ownerName || null,
      criticality: process.criticality || null,
      classification: process.classification || null,
      isIcofrRelevant: bool(process.isIcofrRelevant),
      categoryName
    },
    processObjective: objective,
    activity: activity
      ? {
          id: String(activity.id),
          activityId: activity.activityId || null,
          name: activityName,
          description: activity.description || null,
          performer: activity.performer || null,
          nature,
          frequency,
          systemUsed,
          inputData: activity.inputData || null,
          outputData: activity.outputData || null
        }
      : null,
    risk: derivedRisk,
    control: {
      controlId,
      name: `Pengendalian ${controlSubject}`,
      description: `Pelaksana memastikan ${controlSubject} dijalankan sesuai BPM, dengan validasi kelengkapan, akurasi, otorisasi, ketepatan waktu, serta bukti pelaksanaan yang memadai. Desain kontrol ini merupakan draft dan wajib divalidasi user.`,
      objective:
        objective ||
        `Memastikan ${controlSubject} mendukung tujuan proses ${processName} secara lengkap, akurat, tepat waktu, dan terotorisasi.`,
      controlOwner: ownerName,
      type: 'Preventive',
      nature,
      method: 'Validation',
      frequency,
      isKeyControl: false,
      isIcofrKey: false,
      isItgc: false,
      evidenceRequirement: `Bukti pelaksanaan dan/atau otorisasi untuk ${controlSubject} sesuai BPM yang telah divalidasi.`,
      systemDependency: systemUsed
    }
  };
}

export async function generateBpmDerivedRcmDrafts(input: {
  processIds: string[];
  requestedBy?: string | null;
}) {
  const db = await getDb();
  const processIds = Array.from(
    new Set((input.processIds || []).map(value => String(value).trim()).filter(Boolean))
  );
  if (processIds.length === 0) throw new Error('PROCESS_IDS_REQUIRED');

  const requestedBy = String(input.requestedBy || 'System').trim() || 'System';
  const results: Array<Record<string, unknown>> = [];

  for (const processInternalId of processIds) {
    const process = await first<Record<string, unknown>>(
      db,
      `SELECT p.*, pc.name AS categoryName
         FROM BusinessProcess p
         LEFT JOIN ProcessCategory pc ON pc.id = p.categoryId
        WHERE p.id = ?
        LIMIT 1`,
      [processInternalId]
    );

    if (!process) {
      results.push({ processInternalId, status: 'SKIPPED', reason: 'PROCESS_NOT_FOUND' });
      continue;
    }

    const mapping = await first<Record<string, unknown>>(
      db,
      `SELECT m.id
         FROM ControlRiskMapping m
         JOIN ControlMaster c ON c.id = m.controlId
        WHERE c.processId = ?
        LIMIT 1`,
      [process.id]
    );
    if (mapping) {
      results.push({
        processInternalId,
        processId: process.processId,
        status: 'SKIPPED',
        reason: 'OPERATIONAL_RCM_ALREADY_EXISTS'
      });
      continue;
    }

    const existingControls = await first<{ count?: number }>(
      db,
      'SELECT COUNT(*) AS count FROM ControlMaster WHERE processId = ?',
      [process.id]
    );
    if (Number(existingControls?.count || 0) > 0) {
      results.push({
        processInternalId,
        processId: process.processId,
        status: 'SKIPPED',
        reason: 'MAPPING_REVIEW_REQUIRED'
      });
      continue;
    }

    const [objectiveRow, activities, risks] = await Promise.all([
      first<Record<string, unknown>>(
        db,
        'SELECT objective FROM ProcessObjective WHERE processId = ? ORDER BY createdAt ASC LIMIT 1',
        [process.id]
      ),
      all<Record<string, unknown>>(
        db,
        'SELECT * FROM ProcessActivity WHERE processId = ? ORDER BY orderIndex ASC, createdAt ASC',
        [process.id]
      ),
      all<Record<string, unknown>>(
        db,
        'SELECT * FROM RiskMaster WHERE processId = ? ORDER BY riskId ASC',
        [process.id]
      )
    ]);

    const objective = objectiveRow?.objective ? String(objectiveRow.objective) : null;
    const sourcePairs =
      risks.length > 0
        ? risks.map(risk => ({
            risk,
            activity:
              activities.find(activity => String(activity.id) === String(risk.activityId || '')) || null
          }))
        : activities.length > 0
          ? activities.map(activity => ({ risk: null, activity }))
          : [{ risk: null, activity: null }];

    let generated = 0;
    for (let index = 0; index < sourcePairs.length; index += 1) {
      const pair = sourcePairs[index];
      const payload = buildDerivedPair({
        process,
        categoryName: String(process.categoryName || 'Uncategorized'),
        objective,
        activity: pair.activity,
        risk: pair.risk,
        index
      });
      const referenceCode = `BPM-RCM-${safeCode(process.processId)}-${String(index + 1).padStart(2, '0')}`;
      const title = `Draft RCM - ${String(process.name)} - ${pair.activity?.name || pair.risk?.name || 'Process level'}`;
      const updatedAt = nowIso();

      await run(
        db,
        `INSERT INTO RCMDraftReference (
          id, institutionId, referenceType, referenceCode, title, payloadJson,
          sourceRecordId, sourceDocumentId, sourceReference, sourceStatus,
          validationRequired, operationalControlId, updatedAt
        ) VALUES (?, ?, 'BPM_RCM_DRAFT', ?, ?, ?, ?, NULL, ?, 'DRAFT_PENDING_VALIDATION', 1, NULL, ?)
        ON CONFLICT(institutionId, referenceType, referenceCode)
        DO UPDATE SET
          title = excluded.title,
          payloadJson = excluded.payloadJson,
          sourceRecordId = excluded.sourceRecordId,
          sourceReference = excluded.sourceReference,
          sourceStatus = 'DRAFT_PENDING_VALIDATION',
          validationRequired = 1,
          operationalControlId = NULL,
          updatedAt = excluded.updatedAt`,
        [
          crypto.randomUUID(),
          process.institutionId,
          referenceCode,
          title,
          JSON.stringify(payload),
          process.id,
          `BPM:${String(process.processId)}`,
          updatedAt
        ]
      );

      const draft = await first<Record<string, unknown>>(
        db,
        `SELECT id, referenceCode, sourceStatus
           FROM RCMDraftReference
          WHERE institutionId = ?
            AND referenceType = 'BPM_RCM_DRAFT'
            AND referenceCode = ?
          LIMIT 1`,
        [process.institutionId, referenceCode]
      );

      if (draft) {
        await writeAudit(db, {
          institutionId: String(process.institutionId),
          userName: requestedBy,
          action: 'GENERATE_DRAFT',
          recordId: String(draft.id),
          newValue: { referenceCode, processId: process.processId },
          reason:
            'RCM draft generated from persisted BPM context. User validation is required before operational use.'
        });
      }
      generated += 1;
    }

    results.push({
      processInternalId,
      processId: process.processId,
      processName: process.name,
      status: 'DRAFT_GENERATED',
      generated
    });
  }

  return {
    requested: processIds.length,
    generated: results.reduce((sum, item) => sum + Number(item.generated || 0), 0),
    processes: results
  };
}

export async function listBpmDraftRcmRows() {
  const db = await getDb();
  const refs = await all<Record<string, unknown>>(
    db,
    `SELECT *
       FROM RCMDraftReference
      WHERE referenceType = 'BPM_RCM_DRAFT'
        AND sourceStatus = 'DRAFT_PENDING_VALIDATION'
        AND validationRequired = 1
      ORDER BY sourceReference ASC, referenceCode ASC`
  );

  return refs.map(ref => {
    let payload: any = {};
    try {
      payload = JSON.parse(String(ref.payloadJson || '{}'));
    } catch {
      payload = {};
    }

    const risk = payload.risk || {};
    const control = payload.control || {};
    const process = payload.process || {};
    const activity = payload.activity || null;

    return {
      id: `draft:${String(ref.id)}`,
      draftReferenceId: String(ref.id),
      isDraftRcm: true,
      userValidationRequired: true,
      riskEditable: !risk.existingRiskId,
      lastEditedAt: payload.lastEditedAt || null,
      lastEditedBy: payload.lastEditedBy || null,
      processId: process.processId || String(ref.sourceReference || '').replace(/^BPM:/, ''),
      processName: process.name || 'BPM-derived draft',
      processCategory: process.categoryName || 'Uncategorized',
      activityName: activity?.name || 'Process-level draft',
      processObjective: payload.processObjective || process.description || 'Pending user validation',
      riskId: risk.riskId || 'DRAFT',
      riskName: risk.name || 'Draft risk pending validation',
      riskCause: risk.cause || null,
      riskEvent: risk.event || null,
      riskImpact: risk.impact || null,
      riskCategory: risk.category || 'Operational',
      inherentLikelihood: Number(risk.inherentLikelihood || 0),
      inherentImpact: Number(risk.inherentImpact || 0),
      inherentScore: Number(risk.inherentScore || 0),
      inherentRating: risk.inherentRating || 'Not Assessed',
      inherentSourceRating: null,
      inherentSourceStatus: null,
      inherentReviewRequired: true,
      inherentAssessmentStatus: 'DRAFT_PENDING_USER_VALIDATION',
      residualScore: Number(risk.residualScore || 0),
      residualRating: risk.residualRating || 'Not Assessed',
      controlId: control.controlId || String(ref.referenceCode),
      controlName: control.name || 'Draft control pending validation',
      controlDescription: control.description || null,
      controlObjective: control.objective || null,
      controlOwner: control.controlOwner || 'Pending user validation',
      performer: activity?.performer || null,
      reviewer: null,
      controlType: control.type || 'Preventive',
      controlNature: control.nature || 'Manual',
      controlMethod: control.method || 'Validation',
      controlFrequency: control.frequency || 'Per Transaction',
      evidenceRequirement: control.evidenceRequirement || 'Pending user validation',
      systemDependency: control.systemDependency || null,
      frameworkMapping: null,
      designAssessment: 'Not Assessed',
      operatingStatus: 'Not Assessed',
      controlStatus: 'Draft',
      isKeyControl: false,
      isIcofrKey: false,
      isItgc: false,
      sourceRecordType: 'BPM_DERIVED_DRAFT',
      sourceReference: ref.sourceReference || null,
      sourceCycle: 'BPM_DERIVED',
      taxonomyStatus: 'DRAFT_INFERRED_FROM_BPM',
      mappingStatus: 'DRAFT_PENDING_VALIDATION',
      validationStatus: 'PENDING_USER_VALIDATION',
      sourcePriority: 10,
      sourceNotes:
        'Generated from persisted BPM context. This RCM is a draft and must be reviewed, edited where necessary, and validated by a user before operational use.',
      csaStatus: 'Not Assessed',
      todConclusion: 'Blocked pending user validation',
      toeConclusion: 'Blocked pending user validation',
      toePassRatio: 'Not Tested',
      controlHealth: 'Not Assessed',
      issueId: null,
      issueTitle: null,
      issueSeverity: null,
      issueStatus: 'No Issue',
      mapId: null,
      mapAgreedAction: null,
      mapStatus: null,
      mapProgress: null,
      retestResult: null
    };
  });
}


export async function updateBpmDerivedRcmDraft(input: {
  draftReferenceId: string;
  updates: {
    processObjective?: string | null;
    risk?: Record<string, unknown>;
    control?: Record<string, unknown>;
  };
  updatedBy?: string | null;
}) {
  const db = await getDb();
  const updatedBy = String(input.updatedBy || 'User').trim() || 'User';
  const draft = await first<Record<string, unknown>>(
    db,
    `SELECT *
       FROM RCMDraftReference
      WHERE id = ?
        AND referenceType = 'BPM_RCM_DRAFT'
      LIMIT 1`,
    [input.draftReferenceId]
  );

  if (!draft) throw new Error('DRAFT_NOT_FOUND');
  if (String(draft.sourceStatus) !== 'DRAFT_PENDING_VALIDATION' || !bool(draft.validationRequired)) {
    throw new Error('DRAFT_ALREADY_REVIEWED');
  }

  let payload: any;
  try {
    payload = JSON.parse(String(draft.payloadJson || '{}'));
  } catch {
    throw new Error('INVALID_DRAFT_PAYLOAD');
  }

  const updates = input.updates || {};
  const riskUpdates = updates.risk && typeof updates.risk === 'object' ? updates.risk : {};
  const controlUpdates = updates.control && typeof updates.control === 'object' ? updates.control : {};
  const riskEditable = !payload?.risk?.existingRiskId;

  const riskFields = ['name', 'description', 'cause', 'event', 'impact', 'category', 'ownerName'];
  const controlFields = [
    'name',
    'description',
    'objective',
    'controlOwner',
    'type',
    'nature',
    'method',
    'frequency',
    'evidenceRequirement',
    'systemDependency'
  ];

  if (!riskEditable && riskFields.some(field => Object.prototype.hasOwnProperty.call(riskUpdates, field))) {
    throw new Error('EXISTING_RISK_LOCKED');
  }

  const cleanText = (value: unknown, allowNull = false) => {
    if (value === null && allowNull) return null;
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || (allowNull ? null : undefined);
  };

  const oldPayload = JSON.parse(JSON.stringify(payload));

  if (Object.prototype.hasOwnProperty.call(updates, 'processObjective')) {
    const objective = cleanText(updates.processObjective, true);
    if (objective !== undefined) payload.processObjective = objective;
  }

  payload.risk = payload.risk || {};
  if (riskEditable) {
    for (const field of riskFields) {
      if (!Object.prototype.hasOwnProperty.call(riskUpdates, field)) continue;
      const value = cleanText(riskUpdates[field], field === 'description');
      if (value !== undefined) payload.risk[field] = value;
    }
  }

  payload.control = payload.control || {};
  for (const field of controlFields) {
    if (!Object.prototype.hasOwnProperty.call(controlUpdates, field)) continue;
    const allowNull = field === 'systemDependency';
    const value = cleanText(controlUpdates[field], allowNull);
    if (value !== undefined) payload.control[field] = value;
  }

  const requiredRiskFields = riskEditable ? ['name', 'cause', 'event', 'impact', 'category', 'ownerName'] : [];
  const requiredControlFields = [
    'name',
    'description',
    'objective',
    'controlOwner',
    'type',
    'nature',
    'method',
    'frequency',
    'evidenceRequirement'
  ];

  if (
    requiredRiskFields.some(field => !String(payload.risk?.[field] || '').trim()) ||
    requiredControlFields.some(field => !String(payload.control?.[field] || '').trim())
  ) {
    throw new Error('DRAFT_REQUIRED_FIELD_MISSING');
  }

  payload.lastEditedAt = nowIso();
  payload.lastEditedBy = updatedBy;
  payload.validationRequired = true;

  await run(
    db,
    `UPDATE RCMDraftReference
        SET payloadJson = ?,
            updatedAt = ?
      WHERE id = ?`,
    [JSON.stringify(payload), payload.lastEditedAt, draft.id]
  );

  await writeAudit(db, {
    institutionId: String(draft.institutionId),
    userName: updatedBy,
    action: 'UPDATE_DRAFT',
    recordId: String(draft.id),
    oldValue: oldPayload,
    newValue: payload,
    reason: 'User updated BPM-derived RCM draft before validation.'
  });

  return {
    draftReferenceId: String(draft.id),
    status: 'DRAFT_UPDATED',
    validationStatus: 'PENDING_USER_VALIDATION',
    updatedAt: payload.lastEditedAt,
    updatedBy
  };
}

export async function reviewBpmDerivedRcmDraft(input: {
  draftReferenceId: string;
  decision: DraftDecision;
  reviewedBy?: string | null;
}) {
  const db = await getDb();
  const reviewedBy = String(input.reviewedBy || 'User').trim() || 'User';
  const draft = await first<Record<string, unknown>>(
    db,
    `SELECT *
       FROM RCMDraftReference
      WHERE id = ?
        AND referenceType = 'BPM_RCM_DRAFT'
      LIMIT 1`,
    [input.draftReferenceId]
  );

  if (!draft) throw new Error('DRAFT_NOT_FOUND');
  if (String(draft.sourceStatus) !== 'DRAFT_PENDING_VALIDATION' || !bool(draft.validationRequired)) {
    throw new Error('DRAFT_ALREADY_REVIEWED');
  }

  if (input.decision === 'REJECT') {
    await run(
      db,
      `UPDATE RCMDraftReference
          SET sourceStatus = 'REJECTED_BY_USER',
              validationRequired = 0,
              updatedAt = ?
        WHERE id = ?`,
      [nowIso(), draft.id]
    );
    await writeAudit(db, {
      institutionId: String(draft.institutionId),
      userName: reviewedBy,
      action: 'REJECT',
      recordId: String(draft.id),
      oldValue: { sourceStatus: draft.sourceStatus },
      newValue: { sourceStatus: 'REJECTED_BY_USER' },
      reason: 'User rejected BPM-derived RCM draft before operational use.'
    });
    return { draftReferenceId: draft.id, status: 'REJECTED_BY_USER' };
  }

  if (input.decision !== 'APPROVE') throw new Error('INVALID_DRAFT_DECISION');

  let payload: any;
  try {
    payload = JSON.parse(String(draft.payloadJson || '{}'));
  } catch {
    throw new Error('INVALID_DRAFT_PAYLOAD');
  }

  const process = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM BusinessProcess WHERE id = ? LIMIT 1',
    [payload?.process?.id]
  );
  if (!process) throw new Error('PROCESS_NOT_FOUND');

  const risk = payload?.risk || {};
  const control = payload?.control || {};
  const activityId = payload?.activity?.id || null;
  const now = nowIso();

  let riskInternalId = risk.existingRiskId ? String(risk.existingRiskId) : '';
  if (riskInternalId) {
    const existingRisk = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM RiskMaster WHERE id = ? LIMIT 1',
      [riskInternalId]
    );
    if (!existingRisk || String(existingRisk.processId) !== String(process.id)) {
      throw new Error('RISK_PROCESS_MISMATCH');
    }
  } else {
    const duplicateRisk = await first<Record<string, unknown>>(
      db,
      'SELECT id, processId FROM RiskMaster WHERE institutionId = ? AND riskId = ? LIMIT 1',
      [process.institutionId, risk.riskId]
    );
    if (duplicateRisk) {
      if (String(duplicateRisk.processId) !== String(process.id)) throw new Error('RISK_ID_CONFLICT');
      riskInternalId = String(duplicateRisk.id);
    } else {
      riskInternalId = crypto.randomUUID();
      await run(
        db,
        `INSERT INTO RiskMaster (
          id, institutionId, processId, activityId, riskId, name, description, cause,
          event, impact, category, ownerName, inherentLikelihood, inherentImpact,
          inherentScore, inherentRating, residualLikelihood, residualImpact,
          residualScore, residualRating, riskTreatment, status, version, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'Not Assessed', 0, 0, 0, 'Not Assessed', 'Not Assessed', 'Active', '1.0', ?, ?)`,
        [
          riskInternalId,
          process.institutionId,
          process.id,
          activityId,
          risk.riskId,
          risk.name,
          risk.description,
          risk.cause,
          risk.event,
          risk.impact,
          risk.category,
          risk.ownerName,
          now,
          now
        ]
      );
    }
  }

  const duplicateControl = await first<Record<string, unknown>>(
    db,
    'SELECT id, processId FROM ControlMaster WHERE institutionId = ? AND controlId = ? LIMIT 1',
    [process.institutionId, control.controlId]
  );

  let controlInternalId = '';
  if (duplicateControl) {
    const sourceMetadata = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM RCMControlSourceMetadata WHERE controlId = ? LIMIT 1',
      [duplicateControl.id]
    );
    const sameDraft =
      String(duplicateControl.processId) === String(process.id) &&
      String(sourceMetadata?.sourceReference || '') === String(draft.sourceReference || '') &&
      String(sourceMetadata?.sourceRecordType || '') === 'BPM_DERIVED_USER_VALIDATED';
    if (!sameDraft) throw new Error('CONTROL_ID_CONFLICT');
    controlInternalId = String(duplicateControl.id);
  } else {
    controlInternalId = crypto.randomUUID();
    await run(
      db,
      `INSERT INTO ControlMaster (
        id, institutionId, processId, activityId, controlId, name, description,
        objective, controlOwner, performer, reviewer, type, nature, method, frequency,
        isKeyControl, keyControlRationale, isIcofrKey, isItgc, evidenceRequirement,
        systemDependency, frameworkMapping, regulationMapping, designAssessment,
        operatingStatus, overallHealth, healthRationale, version, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 0, NULL, 0, 0, ?, ?, NULL, NULL, 'Not Assessed', 'Not Assessed', 'Not Assessed', NULL, '1.0', 'Active', ?, ?)`,
      [
        controlInternalId,
        process.institutionId,
        process.id,
        activityId,
        control.controlId,
        control.name,
        control.description,
        control.objective,
        control.controlOwner,
        payload?.activity?.performer || null,
        control.type,
        control.nature,
        control.method,
        control.frequency,
        control.evidenceRequirement || null,
        control.systemDependency || null,
        now,
        now
      ]
    );
  }

  await run(
    db,
    `INSERT OR IGNORE INTO ControlRiskMapping (id, controlId, riskId, createdAt)
     VALUES (?, ?, ?, ?)`,
    [crypto.randomUUID(), controlInternalId, riskInternalId, now]
  );

  await run(
    db,
    `INSERT INTO RCMControlSourceMetadata (
      controlId, institutionId, sourceRecordId, sourceDocumentId, sourceRecordType,
      sourceReference, sourceCycle, sourceProcess, sourceSubprocess, sourceLocation,
      sourceRawKey, sourceRawType, sourceRawNature, sourceRawFrequency,
      sourceRawApplication, sourceRawFunction, sourceRawPerformer,
      taxonomyStatus, mappingStatus, validationStatus, sourcePriority, notes,
      feedBatch, updatedAt
    ) VALUES (?, ?, ?, NULL, 'BPM_DERIVED_USER_VALIDATED', ?, 'BPM_DERIVED', ?, ?, NULL,
              ?, ?, ?, ?, ?, NULL, ?, 'USER_VALIDATED', 'MAPPED', 'USER_VALIDATED',
              10, ?, 'BPM_DRAFT_GENERATOR_V1', ?)
    ON CONFLICT(controlId) DO UPDATE SET
      sourceRecordType = 'BPM_DERIVED_USER_VALIDATED',
      sourceReference = excluded.sourceReference,
      sourceCycle = 'BPM_DERIVED',
      sourceProcess = excluded.sourceProcess,
      sourceSubprocess = excluded.sourceSubprocess,
      sourceRawKey = excluded.sourceRawKey,
      sourceRawType = excluded.sourceRawType,
      sourceRawNature = excluded.sourceRawNature,
      sourceRawFrequency = excluded.sourceRawFrequency,
      sourceRawApplication = excluded.sourceRawApplication,
      sourceRawPerformer = excluded.sourceRawPerformer,
      taxonomyStatus = 'USER_VALIDATED',
      mappingStatus = 'MAPPED',
      validationStatus = 'USER_VALIDATED',
      notes = excluded.notes,
      updatedAt = excluded.updatedAt`,
    [
      controlInternalId,
      process.institutionId,
      process.id,
      draft.sourceReference,
      process.name,
      payload?.activity?.name || null,
      control.controlId,
      control.type,
      control.nature,
      control.frequency,
      control.systemDependency || null,
      payload?.activity?.performer || null,
      `BPM-derived RCM draft validated by ${reviewedBy} before operational promotion.`,
      now
    ]
  );

  await run(
    db,
    `UPDATE RCMDraftReference
        SET sourceStatus = 'VALIDATED_PROMOTED',
            validationRequired = 0,
            operationalControlId = ?,
            updatedAt = ?
      WHERE id = ?`,
    [controlInternalId, now, draft.id]
  );

  await writeAudit(db, {
    institutionId: String(process.institutionId),
    userName: reviewedBy,
    action: 'APPROVE',
    recordId: String(draft.id),
    oldValue: { sourceStatus: draft.sourceStatus, validationRequired: true },
    newValue: {
      sourceStatus: 'VALIDATED_PROMOTED',
      validationRequired: false,
      riskInternalId,
      controlInternalId
    },
    reason:
      'User validated BPM-derived RCM draft. Risk/control mapping was promoted for operational use.'
  });

  return {
    draftReferenceId: draft.id,
    status: 'VALIDATED_PROMOTED',
    processId: process.processId,
    riskInternalId,
    controlInternalId
  };
}
