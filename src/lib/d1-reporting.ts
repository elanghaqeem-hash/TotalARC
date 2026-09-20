import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureAssuranceSchema } from '@/lib/d1-assurance';
import { recordMutationAudit } from '@/lib/d1-core';
import { getRegulatoryReportTemplate } from '@/lib/regulatory-report-templates';
import type { MutationActor } from '@/lib/mutation-security';

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
  await ensureAssuranceSchema();
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('Cloudflare D1 binding "DB" is not available.');
  return db;
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

async function run(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const statement = db.prepare(sql);
  return values.length ? statement.bind(...values).run() : statement.run();
}

async function executeSchemaScript(db: D1DatabaseLike, script: string) {
  const statements = script
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

function nowIso() {
  return new Date().toISOString();
}

function nullable(value: unknown) {
  return value === undefined || value === '' ? null : value;
}

let reportingSchemaPromise: Promise<D1DatabaseLike> | null = null;

async function initializeReportingSchema() {
  const db = await getDb();

  await executeSchemaScript(db, `
    CREATE TABLE IF NOT EXISTS RegulatoryReport (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      legalEntityId TEXT,
      orgUnitId TEXT,
      templateCode TEXT NOT NULL,
      title TEXT NOT NULL,
      period TEXT NOT NULL,
      reportingDate TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'Bahasa Indonesia',
      reportOwner TEXT NOT NULL,
      reviewerName TEXT,
      status TEXT NOT NULL DEFAULT 'Draft',
      overallRating TEXT,
      executiveSummary TEXT,
      conclusion TEXT,
      aiAnalysis TEXT,
      aiProvider TEXT,
      aiModel TEXT,
      aiGeneratedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reg_report_institution
      ON RegulatoryReport(institutionId, updatedAt);
    CREATE INDEX IF NOT EXISTS idx_reg_report_org
      ON RegulatoryReport(institutionId, orgUnitId);
    CREATE INDEX IF NOT EXISTS idx_reg_report_template
      ON RegulatoryReport(institutionId, templateCode);

    CREATE TABLE IF NOT EXISTS RegulatoryReportSection (
      id TEXT PRIMARY KEY NOT NULL,
      reportId TEXT NOT NULL,
      sectionKey TEXT NOT NULL,
      orderIndex INTEGER NOT NULL,
      title TEXT NOT NULL,
      guidance TEXT NOT NULL,
      regulatoryReference TEXT NOT NULL,
      content TEXT,
      analysisSummary TEXT,
      keyFindings TEXT,
      rootCause TEXT,
      impactAnalysis TEXT,
      recommendation TEXT,
      managementResponse TEXT,
      actionPlan TEXT,
      ownerName TEXT,
      targetDate TEXT,
      rating TEXT,
      evidenceReference TEXT,
      aiDraft TEXT,
      reviewStatus TEXT NOT NULL DEFAULT 'Draft',
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_section_unique
      ON RegulatoryReportSection(reportId, sectionKey);
    CREATE INDEX IF NOT EXISTS idx_reg_section_report
      ON RegulatoryReportSection(reportId, orderIndex);

    CREATE TABLE IF NOT EXISTS RegulatoryReportSourceSnapshot (
      id TEXT PRIMARY KEY NOT NULL,
      reportId TEXT NOT NULL,
      snapshotJson TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reg_snapshot_report
      ON RegulatoryReportSourceSnapshot(reportId, createdAt);
  `);

  return db;
}

export async function ensureReportingSchema() {
  if (!reportingSchemaPromise) {
    reportingSchemaPromise = initializeReportingSchema().catch(error => {
      reportingSchemaPromise = null;
      throw error;
    });
  }
  return reportingSchemaPromise;
}

function parseAiAnalysis(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return { narrative: value };
  }
}

function mapReport(
  row: Record<string, unknown>
): Record<string, unknown> & { aiAnalysis: Record<string, unknown> | null } {
  return {
    ...row,
    aiAnalysis: parseAiAnalysis(row.aiAnalysis)
  };
}

export async function getReportingSourceCounts(
  institutionId: string,
  authorizedOrgUnitIds: string[] | null
) {
  const db = await ensureReportingSchema();

  const processValues: unknown[] = [institutionId];
  let processScope = 'p.institutionId = ?';

  const directScope = (alias: string) => {
    const values: unknown[] = [institutionId];
    let sql = `${alias}.institutionId = ?`;

    if (authorizedOrgUnitIds !== null) {
      if (authorizedOrgUnitIds.length === 0) {
        sql += ' AND 1 = 0';
      } else {
        sql += ` AND ${alias}.orgUnitId IN (SELECT value FROM json_each(?))`;
        values.push(JSON.stringify(authorizedOrgUnitIds));
      }
    }

    return { sql, values };
  };

  if (authorizedOrgUnitIds !== null) {
    if (authorizedOrgUnitIds.length === 0) {
      processScope += ' AND 1 = 0';
    } else {
      processScope += ' AND p.orgUnitId IN (SELECT value FROM json_each(?))';
      processValues.push(JSON.stringify(authorizedOrgUnitIds));
    }
  }

  const campaignScope = directScope('a');
  const accountScope = directScope('f');
  const attestationScope = directScope('ma');

  const [toe, issues, certifications, attestations, campaigns, accounts] =
    await Promise.all([
      first<{ count?: number }>(
        db,
        `SELECT COUNT(*) AS count
           FROM ToETest t
           JOIN BusinessProcess p ON p.id = t.processId
          WHERE ${processScope}`,
        processValues
      ),
      first<{ count?: number }>(
        db,
        `SELECT COUNT(*) AS count
           FROM Issue i
           JOIN BusinessProcess p ON p.id = i.processId
          WHERE ${processScope}`,
        processValues
      ),
      first<{ count?: number }>(
        db,
        `SELECT COUNT(*) AS count
           FROM ControlCertification cert
           JOIN ControlMaster c ON c.id = cert.controlId
           JOIN BusinessProcess p ON p.id = c.processId
          WHERE ${processScope}`,
        processValues
      ),
      first<{ count?: number }>(
        db,
        `SELECT COUNT(*) AS count
           FROM ManagementAttestation ma
          WHERE ${attestationScope.sql}`,
        attestationScope.values
      ),
      first<{ count?: number }>(
        db,
        `SELECT COUNT(*) AS count
           FROM AssessmentCampaign a
          WHERE ${campaignScope.sql}`,
        campaignScope.values
      ),
      first<{ count?: number }>(
        db,
        `SELECT COUNT(*) AS count
           FROM FinancialAccount f
          WHERE ${accountScope.sql}`,
        accountScope.values
      )
    ]);

  return {
    toeWorkpapers: Number(toe?.count || 0),
    issuesRemediation: Number(issues?.count || 0),
    controlCertifications: Number(certifications?.count || 0),
    managementAttestations: Number(attestations?.count || 0),
    rcsaCampaigns: Number(campaigns?.count || 0),
    icofrFinancialAccounts: Number(accounts?.count || 0)
  };
}

export async function listRegulatoryReports(
  institutionId: string,
  authorizedOrgUnitIds: string[] | null
) {
  const db = await ensureReportingSchema();
  const values: unknown[] = [institutionId];
  let scopeSql = '';

  if (authorizedOrgUnitIds !== null) {
    if (authorizedOrgUnitIds.length === 0) {
      scopeSql = ' AND 1 = 0';
    } else {
      scopeSql =
        ' AND orgUnitId IN (SELECT value FROM json_each(?))';
      values.push(JSON.stringify(authorizedOrgUnitIds));
    }
  }

  const rows = await all<Record<string, unknown>>(
    db,
    `SELECT *
       FROM RegulatoryReport
      WHERE institutionId = ?${scopeSql}
      ORDER BY updatedAt DESC`,
    values
  );

  return rows.map(mapReport);
}

export async function getRegulatoryReport(
  reportId: string,
  institutionId: string
): Promise<
  | (Record<string, unknown> & {
      aiAnalysis: Record<string, unknown> | null;
      sections: Record<string, unknown>[];
    })
  | null
> {
  const db = await ensureReportingSchema();
  const report = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM RegulatoryReport WHERE id = ? AND institutionId = ? LIMIT 1',
    [reportId, institutionId]
  );

  if (!report) return null;

  const sections = await all<Record<string, unknown>>(
    db,
    `SELECT *
       FROM RegulatoryReportSection
      WHERE reportId = ?
      ORDER BY orderIndex ASC`,
    [reportId]
  );

  return {
    ...mapReport(report),
    sections
  };
}

export async function createRegulatoryReport(
  input: {
    templateCode: string;
    title?: string | null;
    period: string;
    reportingDate: string;
    legalEntityId?: string | null;
    orgUnitId?: string | null;
    reportOwner: string;
    reviewerName?: string | null;
  },
  institutionId: string,
  actor: MutationActor
) {
  const db = await ensureReportingSchema();
  const template = getRegulatoryReportTemplate(input.templateCode);
  if (!template) throw new Error('REPORT_TEMPLATE_NOT_FOUND');

  const id = crypto.randomUUID();
  const now = nowIso();
  const title = input.title?.trim() || template.name;

  await run(
    db,
    `INSERT INTO RegulatoryReport (
      id, institutionId, legalEntityId, orgUnitId, templateCode, title, period,
      reportingDate, language, reportOwner, reviewerName, status, overallRating,
      executiveSummary, conclusion, aiAnalysis, aiProvider, aiModel, aiGeneratedAt,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Bahasa Indonesia', ?, ?, 'Draft', NULL,
              NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
    [
      id,
      institutionId,
      nullable(input.legalEntityId),
      nullable(input.orgUnitId),
      template.code,
      title,
      input.period,
      input.reportingDate,
      input.reportOwner,
      nullable(input.reviewerName),
      now,
      now
    ]
  );

  for (let index = 0; index < template.sections.length; index += 1) {
    const section = template.sections[index];
    await run(
      db,
      `INSERT INTO RegulatoryReportSection (
        id, reportId, sectionKey, orderIndex, title, guidance, regulatoryReference,
        content, analysisSummary, keyFindings, rootCause, impactAnalysis,
        recommendation, managementResponse, actionPlan, ownerName, targetDate,
        rating, evidenceReference, aiDraft, reviewStatus, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
                NULL, NULL, NULL, NULL, NULL, NULL, 'Draft', ?)`,
      [
        crypto.randomUUID(),
        id,
        section.key,
        index + 1,
        section.title,
        section.guidance,
        section.regulatoryReference,
        now
      ]
    );
  }

  const created = await getRegulatoryReport(id, institutionId);
  if (!created) throw new Error('REPORT_CREATE_FAILED');

  await recordMutationAudit(
    {
      institutionId,
      action: 'CREATE',
      entityType: 'RegulatoryReport',
      recordId: id,
      newValue: {
        templateCode: template.code,
        title,
        period: input.period,
        orgUnitId: input.orgUnitId || null
      },
      reason: 'OJK-aligned regulatory report workspace created.'
    },
    actor
  );

  return created;
}

export async function updateRegulatoryReport(
  reportId: string,
  institutionId: string,
  input: {
    title?: string;
    period?: string;
    reportingDate?: string;
    reportOwner?: string;
    reviewerName?: string | null;
    status?: string;
    overallRating?: string | null;
    executiveSummary?: string | null;
    conclusion?: string | null;
  },
  actor: MutationActor
) {
  const db = await ensureReportingSchema();
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM RegulatoryReport WHERE id = ? AND institutionId = ? LIMIT 1',
    [reportId, institutionId]
  );
  if (!existing) throw new Error('REPORT_NOT_FOUND');

  const next = {
    title: input.title ?? String(existing.title || ''),
    period: input.period ?? String(existing.period || ''),
    reportingDate: input.reportingDate ?? String(existing.reportingDate || ''),
    reportOwner: input.reportOwner ?? String(existing.reportOwner || ''),
    reviewerName:
      input.reviewerName === undefined
        ? existing.reviewerName
        : nullable(input.reviewerName),
    status: input.status ?? String(existing.status || 'Draft'),
    overallRating:
      input.overallRating === undefined
        ? existing.overallRating
        : nullable(input.overallRating),
    executiveSummary:
      input.executiveSummary === undefined
        ? existing.executiveSummary
        : nullable(input.executiveSummary),
    conclusion:
      input.conclusion === undefined
        ? existing.conclusion
        : nullable(input.conclusion)
  };

  await run(
    db,
    `UPDATE RegulatoryReport
        SET title = ?, period = ?, reportingDate = ?, reportOwner = ?,
            reviewerName = ?, status = ?, overallRating = ?,
            executiveSummary = ?, conclusion = ?, updatedAt = ?
      WHERE id = ? AND institutionId = ?`,
    [
      next.title,
      next.period,
      next.reportingDate,
      next.reportOwner,
      next.reviewerName,
      next.status,
      next.overallRating,
      next.executiveSummary,
      next.conclusion,
      nowIso(),
      reportId,
      institutionId
    ]
  );

  const updated = await getRegulatoryReport(reportId, institutionId);
  await recordMutationAudit(
    {
      institutionId,
      action: 'UPDATE',
      entityType: 'RegulatoryReport',
      recordId: reportId,
      oldValue: existing,
      newValue: next,
      reason: 'Regulatory report header and conclusion fields updated.'
    },
    actor
  );

  return updated;
}

export async function updateRegulatoryReportSection(
  reportId: string,
  sectionId: string,
  institutionId: string,
  input: {
    content?: string | null;
    analysisSummary?: string | null;
    keyFindings?: string | null;
    rootCause?: string | null;
    impactAnalysis?: string | null;
    recommendation?: string | null;
    managementResponse?: string | null;
    actionPlan?: string | null;
    ownerName?: string | null;
    targetDate?: string | null;
    rating?: string | null;
    evidenceReference?: string | null;
    reviewStatus?: string;
  },
  actor: MutationActor
) {
  const db = await ensureReportingSchema();
  const existing = await first<Record<string, unknown>>(
    db,
    `SELECT s.*
       FROM RegulatoryReportSection s
       JOIN RegulatoryReport r ON r.id = s.reportId
      WHERE s.id = ? AND s.reportId = ? AND r.institutionId = ?
      LIMIT 1`,
    [sectionId, reportId, institutionId]
  );
  if (!existing) throw new Error('REPORT_SECTION_NOT_FOUND');

  const field = (name: keyof typeof input) =>
    input[name] === undefined ? existing[name] : nullable(input[name]);

  const next = {
    content: field('content'),
    analysisSummary: field('analysisSummary'),
    keyFindings: field('keyFindings'),
    rootCause: field('rootCause'),
    impactAnalysis: field('impactAnalysis'),
    recommendation: field('recommendation'),
    managementResponse: field('managementResponse'),
    actionPlan: field('actionPlan'),
    ownerName: field('ownerName'),
    targetDate: field('targetDate'),
    rating: field('rating'),
    evidenceReference: field('evidenceReference'),
    reviewStatus:
      input.reviewStatus === undefined
        ? existing.reviewStatus
        : input.reviewStatus
  };

  await run(
    db,
    `UPDATE RegulatoryReportSection
        SET content = ?, analysisSummary = ?, keyFindings = ?, rootCause = ?,
            impactAnalysis = ?, recommendation = ?, managementResponse = ?,
            actionPlan = ?, ownerName = ?, targetDate = ?, rating = ?,
            evidenceReference = ?, reviewStatus = ?, updatedAt = ?
      WHERE id = ? AND reportId = ?`,
    [
      next.content,
      next.analysisSummary,
      next.keyFindings,
      next.rootCause,
      next.impactAnalysis,
      next.recommendation,
      next.managementResponse,
      next.actionPlan,
      next.ownerName,
      next.targetDate,
      next.rating,
      next.evidenceReference,
      next.reviewStatus,
      nowIso(),
      sectionId,
      reportId
    ]
  );

  const updated = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM RegulatoryReportSection WHERE id = ? AND reportId = ? LIMIT 1',
    [sectionId, reportId]
  );

  await run(
    db,
    'UPDATE RegulatoryReport SET updatedAt = ? WHERE id = ? AND institutionId = ?',
    [nowIso(), reportId, institutionId]
  );

  await recordMutationAudit(
    {
      institutionId,
      action: 'UPDATE',
      entityType: 'RegulatoryReportSection',
      recordId: sectionId,
      oldValue: existing,
      newValue: updated,
      reason: 'Editable regulatory report analysis section updated.'
    },
    actor
  );

  return updated;
}

function processScope(
  report: Record<string, unknown>,
  alias = 'p'
): { sql: string; values: unknown[] } {
  const values: unknown[] = [report.institutionId];
  let sql = `${alias}.institutionId = ?`;

  if (report.orgUnitId) {
    sql += ` AND ${alias}.orgUnitId = ?`;
    values.push(report.orgUnitId);
  } else if (report.legalEntityId) {
    sql += ` AND ${alias}.legalEntityId = ?`;
    values.push(report.legalEntityId);
  }

  return { sql, values };
}

function directScope(
  report: Record<string, unknown>,
  alias: string
): { sql: string; values: unknown[] } {
  const values: unknown[] = [report.institutionId];
  let sql = `${alias}.institutionId = ?`;

  if (report.orgUnitId) {
    sql += ` AND ${alias}.orgUnitId = ?`;
    values.push(report.orgUnitId);
  } else if (report.legalEntityId) {
    sql += ` AND ${alias}.legalEntityId = ?`;
    values.push(report.legalEntityId);
  }

  return { sql, values };
}

export async function getRegulatoryReportEvidence(
  reportId: string,
  institutionId: string
) {
  const db = await ensureReportingSchema();
  const report = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM RegulatoryReport WHERE id = ? AND institutionId = ? LIMIT 1',
    [reportId, institutionId]
  );
  if (!report) throw new Error('REPORT_NOT_FOUND');

  const pScope = processScope(report, 'p');
  const campaignScope = directScope(report, 'a');
  const accountScope = directScope(report, 'f');
  const ipeScope = directScope(report, 'i');
  const attestationScope = directScope(report, 'ma');

  const [
    processCount,
    riskSummary,
    controlSummary,
    toeSummary,
    todSummary,
    issueSummary,
    mapSummary,
    certificationSummary,
    rcsaSummary,
    accountSummary,
    ipeSummary,
    attestationSummary,
    topRisks,
    topIssues
  ] = await Promise.all([
    first<{ count?: number }>(
      db,
      `SELECT COUNT(*) AS count FROM BusinessProcess p WHERE ${pScope.sql}`,
      pScope.values
    ),
    first<Record<string, unknown>>(
      db,
      `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN r.inherentRating IN ('Critical','High') THEN 1 ELSE 0 END) AS highCritical,
          SUM(CASE WHEN r.residualRating IN ('Critical','High') THEN 1 ELSE 0 END) AS residualHighCritical
         FROM RiskMaster r
         JOIN BusinessProcess p ON p.id = r.processId
        WHERE ${pScope.sql}`,
      pScope.values
    ),
    first<Record<string, unknown>>(
      db,
      `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN c.isKeyControl = 1 THEN 1 ELSE 0 END) AS keyControls,
          SUM(CASE WHEN c.isIcofrKey = 1 THEN 1 ELSE 0 END) AS icofrKeyControls,
          SUM(CASE WHEN c.isItgc = 1 THEN 1 ELSE 0 END) AS itgcControls
         FROM ControlMaster c
         JOIN BusinessProcess p ON p.id = c.processId
        WHERE ${pScope.sql}`,
      pScope.values
    ),
    first<Record<string, unknown>>(
      db,
      `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN t.failCount > 0 OR t.finalConclusion IN ('Ineffective','Failed') THEN 1 ELSE 0 END) AS withFailures,
          SUM(t.failCount) AS failedSamples
         FROM ToETest t
         JOIN BusinessProcess p ON p.id = t.processId
        WHERE ${pScope.sql}`,
      pScope.values
    ),
    first<Record<string, unknown>>(
      db,
      `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN t.conclusion NOT IN ('Effective','Not Assessed') THEN 1 ELSE 0 END) AS exceptions
         FROM ToDTest t
         JOIN BusinessProcess p ON p.id = t.processId
        WHERE ${pScope.sql}`,
      pScope.values
    ),
    first<Record<string, unknown>>(
      db,
      `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN i.status NOT IN ('Closed','Completed') THEN 1 ELSE 0 END) AS open,
          SUM(CASE WHEN i.status NOT IN ('Closed','Completed') AND i.severity IN ('Critical','High') THEN 1 ELSE 0 END) AS openHighCritical
         FROM Issue i
         JOIN BusinessProcess p ON p.id = i.processId
        WHERE ${pScope.sql}`,
      pScope.values
    ),
    first<Record<string, unknown>>(
      db,
      `SELECT
          COUNT(*) AS total,
          SUM(CASE
            WHEN m.status NOT IN ('Completed','Closed')
             AND COALESCE(m.revisedDueDate, m.originalDueDate) < ?
            THEN 1 ELSE 0 END
          ) AS overdue
         FROM ManagementActionPlan m
         JOIN Issue i ON i.id = m.issueId
         JOIN BusinessProcess p ON p.id = i.processId
        WHERE ${pScope.sql}`,
      [new Date().toISOString().slice(0, 10), ...pScope.values]
    ),
    first<Record<string, unknown>>(
      db,
      `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN cert.status = 'Certified' THEN 1 ELSE 0 END) AS certified,
          SUM(CASE WHEN cert.status = 'Certified with Exception' THEN 1 ELSE 0 END) AS certifiedWithException
         FROM ControlCertification cert
         JOIN ControlMaster c ON c.id = cert.controlId
         JOIN BusinessProcess p ON p.id = c.processId
        WHERE ${pScope.sql}`,
      pScope.values
    ),
    first<Record<string, unknown>>(
      db,
      `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN a.status IN ('Completed','Closed') THEN 1 ELSE 0 END) AS completed
         FROM AssessmentCampaign a
        WHERE ${campaignScope.sql}`,
      campaignScope.values
    ),
    first<Record<string, unknown>>(
      db,
      `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN f.isSignificant = 1 THEN 1 ELSE 0 END) AS significant
         FROM FinancialAccount f
        WHERE ${accountScope.sql}`,
      accountScope.values
    ),
    first<Record<string, unknown>>(
      db,
      `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN i.completenessTested = 1 AND i.accuracyTested = 1 THEN 1 ELSE 0 END) AS fullyTested
         FROM IPERegister i
        WHERE ${ipeScope.sql}`,
      ipeScope.values
    ),
    first<Record<string, unknown>>(
      db,
      `SELECT COUNT(*) AS total
         FROM ManagementAttestation ma
        WHERE ${attestationScope.sql}`,
      attestationScope.values
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT r.riskId, r.name, r.category, r.inherentScore, r.inherentRating,
              r.residualScore, r.residualRating, r.ownerName, p.processId, p.name AS processName
         FROM RiskMaster r
         JOIN BusinessProcess p ON p.id = r.processId
        WHERE ${pScope.sql}
        ORDER BY r.residualScore DESC, r.inherentScore DESC
        LIMIT 12`,
      pScope.values
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT i.issueId, i.title, i.severity, i.status, i.ownerName, i.targetDate,
              p.processId, p.name AS processName
         FROM Issue i
         JOIN BusinessProcess p ON p.id = i.processId
        WHERE ${pScope.sql}
          AND i.status NOT IN ('Closed','Completed')
        ORDER BY
          CASE i.severity
            WHEN 'Critical' THEN 1
            WHEN 'High' THEN 2
            WHEN 'Medium' THEN 3
            ELSE 4
          END,
          i.targetDate ASC
        LIMIT 12`,
      pScope.values
    )
  ]);

  return {
    generatedAt: nowIso(),
    reportScope: {
      institutionId,
      legalEntityId: report.legalEntityId || null,
      orgUnitId: report.orgUnitId || null,
      period: report.period,
      reportingDate: report.reportingDate,
      templateCode: report.templateCode
    },
    counts: {
      processes: Number(processCount?.count || 0),
      risks: Number(riskSummary?.total || 0),
      highCriticalRisks: Number(riskSummary?.highCritical || 0),
      residualHighCriticalRisks: Number(riskSummary?.residualHighCritical || 0),
      controls: Number(controlSummary?.total || 0),
      keyControls: Number(controlSummary?.keyControls || 0),
      icofrKeyControls: Number(controlSummary?.icofrKeyControls || 0),
      itgcControls: Number(controlSummary?.itgcControls || 0),
      toeTests: Number(toeSummary?.total || 0),
      toeTestsWithFailures: Number(toeSummary?.withFailures || 0),
      failedToeSamples: Number(toeSummary?.failedSamples || 0),
      todTests: Number(todSummary?.total || 0),
      todExceptions: Number(todSummary?.exceptions || 0),
      issues: Number(issueSummary?.total || 0),
      openIssues: Number(issueSummary?.open || 0),
      openHighCriticalIssues: Number(issueSummary?.openHighCritical || 0),
      maps: Number(mapSummary?.total || 0),
      overdueMaps: Number(mapSummary?.overdue || 0),
      certifications: Number(certificationSummary?.total || 0),
      certifiedControls: Number(certificationSummary?.certified || 0),
      certificationsWithException: Number(certificationSummary?.certifiedWithException || 0),
      rcsaCampaigns: Number(rcsaSummary?.total || 0),
      completedRcsaCampaigns: Number(rcsaSummary?.completed || 0),
      financialAccounts: Number(accountSummary?.total || 0),
      significantAccounts: Number(accountSummary?.significant || 0),
      ipeReports: Number(ipeSummary?.total || 0),
      fullyTestedIpeReports: Number(ipeSummary?.fullyTested || 0),
      managementAttestations: Number(attestationSummary?.total || 0)
    },
    topRisks,
    topOpenIssues: topIssues
  };
}

type AiSectionDraft = {
  sectionKey: string;
  content?: string;
  analysisSummary?: string;
  keyFindings?: string;
  rootCause?: string;
  impactAnalysis?: string;
  recommendation?: string;
  rating?: string;
  evidenceReference?: string;
};

export async function applyAiRegulatoryDraft(
  reportId: string,
  institutionId: string,
  input: {
    executiveSummary?: string | null;
    conclusion?: string | null;
    overallRating?: string | null;
    overallAnalysis?: string | null;
    evidenceGaps?: string[] | null;
    sections: AiSectionDraft[];
    provider: string;
    model: string;
    requestId: string;
    evidenceSnapshot: Record<string, unknown>;
    applyToContent: boolean;
  },
  actor: MutationActor
) {
  const db = await ensureReportingSchema();
  const report = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM RegulatoryReport WHERE id = ? AND institutionId = ? LIMIT 1',
    [reportId, institutionId]
  );
  if (!report) throw new Error('REPORT_NOT_FOUND');

  const sectionRows = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM RegulatoryReportSection WHERE reportId = ?',
    [reportId]
  );
  const sectionMap = new Map(sectionRows.map(row => [String(row.sectionKey), row]));

  for (const draft of input.sections.slice(0, 40)) {
    const existing = sectionMap.get(draft.sectionKey);
    if (!existing) continue;

    const aiDraft = JSON.stringify({
      content: draft.content || null,
      analysisSummary: draft.analysisSummary || null,
      keyFindings: draft.keyFindings || null,
      rootCause: draft.rootCause || null,
      impactAnalysis: draft.impactAnalysis || null,
      recommendation: draft.recommendation || null,
      rating: draft.rating || null,
      evidenceReference: draft.evidenceReference || null,
      requestId: input.requestId
    });

    await run(
      db,
      `UPDATE RegulatoryReportSection
          SET aiDraft = ?,
              content = ?,
              analysisSummary = ?,
              keyFindings = ?,
              rootCause = ?,
              impactAnalysis = ?,
              recommendation = ?,
              rating = ?,
              evidenceReference = ?,
              reviewStatus = ?,
              updatedAt = ?
        WHERE id = ? AND reportId = ?`,
      [
        aiDraft,
        input.applyToContent && draft.content
          ? draft.content
          : existing.content,
        input.applyToContent && draft.analysisSummary
          ? draft.analysisSummary
          : existing.analysisSummary,
        input.applyToContent && draft.keyFindings
          ? draft.keyFindings
          : existing.keyFindings,
        input.applyToContent && draft.rootCause
          ? draft.rootCause
          : existing.rootCause,
        input.applyToContent && draft.impactAnalysis
          ? draft.impactAnalysis
          : existing.impactAnalysis,
        input.applyToContent && draft.recommendation
          ? draft.recommendation
          : existing.recommendation,
        input.applyToContent && draft.rating
          ? draft.rating
          : existing.rating,
        input.applyToContent && draft.evidenceReference
          ? draft.evidenceReference
          : existing.evidenceReference,
        input.applyToContent ? 'AI Draft — Human Review Required' : existing.reviewStatus,
        nowIso(),
        existing.id,
        reportId
      ]
    );
  }

  const analysisPayload = {
    overallAnalysis: input.overallAnalysis || null,
    evidenceGaps: input.evidenceGaps || [],
    requestId: input.requestId,
    humanReviewRequired: true
  };

  await run(
    db,
    `UPDATE RegulatoryReport
        SET executiveSummary = ?,
            conclusion = ?,
            overallRating = ?,
            aiAnalysis = ?,
            aiProvider = ?,
            aiModel = ?,
            aiGeneratedAt = ?,
            updatedAt = ?
      WHERE id = ? AND institutionId = ?`,
    [
      input.applyToContent && input.executiveSummary
        ? input.executiveSummary
        : report.executiveSummary,
      input.applyToContent && input.conclusion
        ? input.conclusion
        : report.conclusion,
      input.applyToContent && input.overallRating
        ? input.overallRating
        : report.overallRating,
      JSON.stringify(analysisPayload),
      input.provider,
      input.model,
      nowIso(),
      nowIso(),
      reportId,
      institutionId
    ]
  );

  await run(
    db,
    `INSERT INTO RegulatoryReportSourceSnapshot
      (id, reportId, snapshotJson, createdBy, createdAt)
     VALUES (?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      reportId,
      JSON.stringify(input.evidenceSnapshot),
      actor.email,
      nowIso()
    ]
  );

  await recordMutationAudit(
    {
      institutionId,
      action: 'AI_ANALYZE',
      entityType: 'RegulatoryReport',
      recordId: reportId,
      newValue: {
        requestId: input.requestId,
        provider: input.provider,
        model: input.model,
        sectionsDrafted: input.sections.length,
        applyToContent: input.applyToContent,
        humanReviewRequired: true
      },
      reason:
        'AI generated an advisory OJK-aligned report draft from persisted Total ARC evidence; human review remains mandatory.'
    },
    actor
  );

  return getRegulatoryReport(reportId, institutionId);
}
