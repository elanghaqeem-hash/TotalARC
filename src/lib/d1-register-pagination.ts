import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureCoreDomainSchema } from '@/lib/d1-core';
import { ensureAssuranceSchema } from '@/lib/d1-assurance';
import { paginationMeta, type PaginationInput } from '@/lib/pagination';

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

type RegisterScope = {
  authorizedOrgUnitIds: string[] | null;
  orgUnitId?: string | null;
};

type RegisterFilters = PaginationInput & RegisterScope & {
  categoryId?: string | null;
  filterType?: string | null;
};

async function getDb(coreOnly = true): Promise<D1DatabaseLike> {
  if (coreOnly) {
    await ensureCoreDomainSchema();
  } else {
    await ensureAssuranceSchema();
  }

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

function bool(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function idsJson(rows: Array<Record<string, unknown>>, field = 'id') {
  return JSON.stringify(rows.map(row => String(row[field] || '')).filter(Boolean));
}

function uniqueJson(values: unknown[]) {
  return JSON.stringify([...new Set(values.map(value => String(value || '')).filter(Boolean))]);
}

function scopeSql(
  alias: string,
  scope: RegisterScope,
  values: unknown[]
) {
  const clauses: string[] = [];

  if (scope.authorizedOrgUnitIds !== null) {
    if (scope.authorizedOrgUnitIds.length === 0) {
      clauses.push('1 = 0');
    } else {
      clauses.push(
        `${alias}.orgUnitId IN (SELECT value FROM json_each(?))`
      );
      values.push(JSON.stringify(scope.authorizedOrgUnitIds));
    }
  }

  if (scope.orgUnitId) {
    clauses.push(`${alias}.orgUnitId = ?`);
    values.push(scope.orgUnitId);
  }

  return clauses;
}

function searchLike(search: string) {
  return `%${search.toLowerCase()}%`;
}

function groupRows(
  rows: Array<Record<string, unknown>>,
  keyField: string
) {
  const map = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = String(row[keyField] || '');
    const current = map.get(key) || [];
    current.push(row);
    map.set(key, current);
  }
  return map;
}

export async function getProcessScopeById(
  institutionId: string,
  processRecordId: string
) {
  const db = await getDb();
  return first<Record<string, unknown>>(
    db,
    `SELECT p.id, p.processId, p.name, p.legalEntityId, p.orgUnitId,
            p.criticality, p.classification
       FROM BusinessProcess p
      WHERE p.institutionId = ? AND p.id = ?
      LIMIT 1`,
    [institutionId, processRecordId]
  );
}

export async function getControlScopeById(
  institutionId: string,
  controlRecordId: string
) {
  const db = await getDb();
  return first<Record<string, unknown>>(
    db,
    `SELECT c.id, c.controlId, c.name, c.processId,
            p.processId AS enterpriseProcessId, p.name AS processName,
            p.legalEntityId, p.orgUnitId
       FROM ControlMaster c
       JOIN BusinessProcess p ON p.id = c.processId
      WHERE c.institutionId = ? AND p.institutionId = ? AND c.id = ?
      LIMIT 1`,
    [institutionId, institutionId, controlRecordId]
  );
}

export async function getToeTestScopeById(
  institutionId: string,
  toeTestId: string
) {
  const db = await getDb(false);
  return first<Record<string, unknown>>(
    db,
    `SELECT t.id, t.testId, t.controlId, t.processId,
            p.legalEntityId, p.orgUnitId
       FROM ToETest t
       JOIN BusinessProcess p ON p.id = t.processId
      WHERE p.institutionId = ? AND t.id = ?
      LIMIT 1`,
    [institutionId, toeTestId]
  );
}

export async function getToeSampleScopeById(
  institutionId: string,
  sampleId: string
) {
  const db = await getDb(false);
  return first<Record<string, unknown>>(
    db,
    `SELECT s.id, s.toeTestId, t.processId,
            p.legalEntityId, p.orgUnitId
       FROM TestSample s
       JOIN ToETest t ON t.id = s.toeTestId
       JOIN BusinessProcess p ON p.id = t.processId
      WHERE p.institutionId = ? AND s.id = ?
      LIMIT 1`,
    [institutionId, sampleId]
  );
}

export async function listProcessRegisterPage(
  institutionId: string,
  filters: RegisterFilters
) {
  const db = await getDb();
  const where: string[] = ['p.institutionId = ?'];
  const values: unknown[] = [institutionId];

  where.push(...scopeSql('p', filters, values));

  if (filters.categoryId) {
    where.push('p.categoryId = ?');
    values.push(filters.categoryId);
  }

  if (filters.search) {
    where.push(`(
      lower(p.processId) LIKE ?
      OR lower(p.name) LIKE ?
      OR lower(COALESCE(p.ownerName, '')) LIKE ?
      OR lower(COALESCE(p.description, '')) LIKE ?
    )`);
    const term = searchLike(filters.search);
    values.push(term, term, term, term);
  }

  const whereSql = where.join(' AND ');
  const offset = (filters.page - 1) * filters.pageSize;

  const [countRow, categories, rows] = await Promise.all([
    first<{ count?: number }>(
      db,
      `SELECT COUNT(*) AS count FROM BusinessProcess p WHERE ${whereSql}`,
      values
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ProcessCategory ORDER BY orderIndex ASC, name ASC'
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT p.*
         FROM BusinessProcess p
        WHERE ${whereSql}
        ORDER BY p.processId ASC
        LIMIT ? OFFSET ?`,
      [...values, filters.pageSize, offset]
    )
  ]);

  const total = Number(countRow?.count || 0);
  if (rows.length === 0) {
    return {
      processes: [],
      categories,
      pagination: paginationMeta(filters.page, filters.pageSize, total)
    };
  }

  const processIds = idsJson(rows);
  const [objectives, sipocs, activities, risks, controls, units, entities] =
    await Promise.all([
      all<Record<string, unknown>>(
        db,
        `SELECT * FROM ProcessObjective
          WHERE processId IN (SELECT value FROM json_each(?))
          ORDER BY createdAt ASC`,
        [processIds]
      ),
      all<Record<string, unknown>>(
        db,
        `SELECT * FROM SIPOC
          WHERE processId IN (SELECT value FROM json_each(?))`,
        [processIds]
      ),
      all<Record<string, unknown>>(
        db,
        `SELECT * FROM ProcessActivity
          WHERE processId IN (SELECT value FROM json_each(?))
          ORDER BY orderIndex ASC, createdAt ASC`,
        [processIds]
      ),
      all<Record<string, unknown>>(
        db,
        `SELECT * FROM RiskMaster
          WHERE processId IN (SELECT value FROM json_each(?))
          ORDER BY riskId ASC`,
        [processIds]
      ),
      all<Record<string, unknown>>(
        db,
        `SELECT * FROM ControlMaster
          WHERE processId IN (SELECT value FROM json_each(?))
          ORDER BY controlId ASC`,
        [processIds]
      ),
      all<Record<string, unknown>>(
        db,
        `SELECT id, code, name, type, legalEntityId, parentId, status
           FROM OrganizationUnit
          WHERE institutionId = ?
            AND id IN (SELECT value FROM json_each(?))`,
        [institutionId, uniqueJson(rows.map(row => row.orgUnitId))]
      ),
      all<Record<string, unknown>>(
        db,
        `SELECT id, code, name, entityType, country, status
           FROM LegalEntity
          WHERE institutionId = ?
            AND id IN (SELECT value FROM json_each(?))`,
        [institutionId, uniqueJson(rows.map(row => row.legalEntityId))]
      )
    ]);

  const categoryMap = new Map(categories.map(row => [String(row.id), row]));
  const sipocMap = new Map(sipocs.map(row => [String(row.processId), row]));
  const objectiveMap = groupRows(objectives, 'processId');
  const activityMap = groupRows(activities, 'processId');
  const riskMap = groupRows(risks, 'processId');
  const controlMap = groupRows(controls, 'processId');
  const unitMap = new Map(units.map(row => [String(row.id), row]));
  const entityMap = new Map(entities.map(row => [String(row.id), row]));

  const processes = rows.map(row => ({
    ...row,
    level: Number(row.level || 0),
    isIcofrRelevant: bool(row.isIcofrRelevant),
    category: categoryMap.get(String(row.categoryId)) || null,
    legalEntity: row.legalEntityId
      ? entityMap.get(String(row.legalEntityId)) || null
      : null,
    orgUnit: row.orgUnitId
      ? unitMap.get(String(row.orgUnitId)) || null
      : null,
    objectives: objectiveMap.get(String(row.id)) || [],
    sipoc: sipocMap.get(String(row.id)) || null,
    activities: activityMap.get(String(row.id)) || [],
    risks: (riskMap.get(String(row.id)) || []).map(risk => ({
      ...risk,
      inherentLikelihood: Number(risk.inherentLikelihood || 0),
      inherentImpact: Number(risk.inherentImpact || 0),
      inherentScore: Number(risk.inherentScore || 0),
      residualLikelihood: Number(risk.residualLikelihood || 0),
      residualImpact: Number(risk.residualImpact || 0),
      residualScore: Number(risk.residualScore || 0)
    })),
    controls: (controlMap.get(String(row.id)) || []).map(control => ({
      ...control,
      isKeyControl: bool(control.isKeyControl),
      isIcofrKey: bool(control.isIcofrKey),
      isItgc: bool(control.isItgc)
    }))
  }));

  return {
    processes,
    categories,
    pagination: paginationMeta(filters.page, filters.pageSize, total)
  };
}

export async function listProcessOptions(
  institutionId: string,
  scope: RegisterScope,
  search = ''
) {
  const db = await getDb();
  const where = ['p.institutionId = ?'];
  const values: unknown[] = [institutionId];
  where.push(...scopeSql('p', scope, values));

  if (search) {
    const term = searchLike(search);
    where.push('(lower(p.processId) LIKE ? OR lower(p.name) LIKE ?)');
    values.push(term, term);
  }

  const rows = await all<Record<string, unknown>>(
    db,
    `SELECT p.id, p.processId, p.name, p.categoryId, p.legalEntityId, p.orgUnitId,
            p.ownerName, p.criticality, p.classification,
            ou.code AS orgUnitCode, ou.name AS orgUnitName,
            le.code AS legalEntityCode, le.name AS legalEntityName
       FROM BusinessProcess p
       LEFT JOIN OrganizationUnit ou ON ou.id = p.orgUnitId AND ou.institutionId = p.institutionId
       LEFT JOIN LegalEntity le ON le.id = p.legalEntityId AND le.institutionId = p.institutionId
      WHERE ${where.join(' AND ')}
      ORDER BY p.processId ASC`,
    values
  );

  return rows.map(row => ({
    ...row,
    orgUnit: row.orgUnitId
      ? { id: row.orgUnitId, code: row.orgUnitCode, name: row.orgUnitName }
      : null,
    legalEntity: row.legalEntityId
      ? { id: row.legalEntityId, code: row.legalEntityCode, name: row.legalEntityName }
      : null
  }));
}

export async function listRiskRegisterPage(
  institutionId: string,
  filters: RegisterFilters
) {
  const db = await getDb();
  const where = ['r.institutionId = ?', 'p.institutionId = ?'];
  const values: unknown[] = [institutionId, institutionId];
  where.push(...scopeSql('p', filters, values));

  if (filters.search) {
    const term = searchLike(filters.search);
    where.push(`(
      lower(r.riskId) LIKE ?
      OR lower(r.name) LIKE ?
      OR lower(r.category) LIKE ?
      OR lower(COALESCE(r.ownerName, '')) LIKE ?
      OR lower(p.name) LIKE ?
    )`);
    values.push(term, term, term, term, term);
  }

  const whereSql = where.join(' AND ');
  const offset = (filters.page - 1) * filters.pageSize;

  const [countRow, rows] = await Promise.all([
    first<{ count?: number }>(
      db,
      `SELECT COUNT(*) AS count
         FROM RiskMaster r
         JOIN BusinessProcess p ON p.id = r.processId
        WHERE ${whereSql}`,
      values
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT r.*
         FROM RiskMaster r
         JOIN BusinessProcess p ON p.id = r.processId
        WHERE ${whereSql}
        ORDER BY r.riskId ASC
        LIMIT ? OFFSET ?`,
      [...values, filters.pageSize, offset]
    )
  ]);

  const total = Number(countRow?.count || 0);
  if (rows.length === 0) {
    return {
      risks: [],
      pagination: paginationMeta(filters.page, filters.pageSize, total)
    };
  }

  const riskIds = idsJson(rows);
  const processIds = uniqueJson(rows.map(row => row.processId));
  const activityIds = uniqueJson(rows.map(row => row.activityId));

  const [processes, activities, mappings] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      `SELECT id, processId, name, categoryId, legalEntityId, orgUnitId,
              criticality, classification
         FROM BusinessProcess
        WHERE institutionId = ?
          AND id IN (SELECT value FROM json_each(?))`,
      [institutionId, processIds]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT *
         FROM ProcessActivity
        WHERE id IN (SELECT value FROM json_each(?))`,
      [activityIds]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT m.id, m.controlId, m.riskId, m.createdAt,
              c.controlId AS enterpriseControlId, c.name AS controlName,
              c.description AS controlDescription, c.objective AS controlObjective,
              c.controlOwner, c.type, c.nature, c.frequency,
              c.isKeyControl, c.isIcofrKey, c.overallHealth
         FROM ControlRiskMapping m
         JOIN ControlMaster c ON c.id = m.controlId
        WHERE m.riskId IN (SELECT value FROM json_each(?))
          AND c.institutionId = ?
        ORDER BY c.controlId ASC`,
      [riskIds, institutionId]
    )
  ]);

  const processMap = new Map(processes.map(row => [String(row.id), row]));
  const activityMap = new Map(activities.map(row => [String(row.id), row]));
  const mappingMap = groupRows(mappings, 'riskId');

  return {
    risks: rows.map(row => ({
      ...row,
      inherentLikelihood: Number(row.inherentLikelihood || 0),
      inherentImpact: Number(row.inherentImpact || 0),
      inherentScore: Number(row.inherentScore || 0),
      residualLikelihood: Number(row.residualLikelihood || 0),
      residualImpact: Number(row.residualImpact || 0),
      residualScore: Number(row.residualScore || 0),
      process: processMap.get(String(row.processId)) || null,
      activity: row.activityId
        ? activityMap.get(String(row.activityId)) || null
        : null,
      controls: (mappingMap.get(String(row.id)) || []).map(mapping => ({
        id: mapping.id,
        controlId: mapping.controlId,
        riskId: mapping.riskId,
        createdAt: mapping.createdAt,
        control: {
          id: mapping.controlId,
          controlId: mapping.enterpriseControlId,
          name: mapping.controlName,
          description: mapping.controlDescription,
          objective: mapping.controlObjective,
          controlOwner: mapping.controlOwner,
          type: mapping.type,
          nature: mapping.nature,
          frequency: mapping.frequency,
          isKeyControl: bool(mapping.isKeyControl),
          isIcofrKey: bool(mapping.isIcofrKey),
          overallHealth: mapping.overallHealth
        }
      })),
      issues: []
    })),
    pagination: paginationMeta(filters.page, filters.pageSize, total)
  };
}

export async function listRiskOptions(
  institutionId: string,
  scope: RegisterScope,
  processId?: string | null,
  search = ''
) {
  const db = await getDb();
  const where = ['r.institutionId = ?', 'p.institutionId = ?'];
  const values: unknown[] = [institutionId, institutionId];
  where.push(...scopeSql('p', scope, values));

  if (processId) {
    where.push('r.processId = ?');
    values.push(processId);
  }

  if (search) {
    const term = searchLike(search);
    where.push('(lower(r.riskId) LIKE ? OR lower(r.name) LIKE ?)');
    values.push(term, term);
  }

  return all<Record<string, unknown>>(
    db,
    `SELECT r.id, r.riskId, r.name, r.processId, r.category,
            r.inherentLikelihood, r.inherentImpact, r.inherentScore, r.inherentRating,
            r.residualLikelihood, r.residualImpact, r.residualScore, r.residualRating
       FROM RiskMaster r
       JOIN BusinessProcess p ON p.id = r.processId
      WHERE ${where.join(' AND ')}
      ORDER BY r.riskId ASC`,
    values
  );
}

export async function listControlRegisterPage(
  institutionId: string,
  filters: RegisterFilters
) {
  const db = await getDb();
  const where = ['c.institutionId = ?', 'p.institutionId = ?'];
  const values: unknown[] = [institutionId, institutionId];
  where.push(...scopeSql('p', filters, values));

  if (filters.search) {
    const term = searchLike(filters.search);
    where.push(`(
      lower(c.controlId) LIKE ?
      OR lower(c.name) LIKE ?
      OR lower(COALESCE(c.controlOwner, '')) LIKE ?
      OR lower(c.type) LIKE ?
      OR lower(p.name) LIKE ?
    )`);
    values.push(term, term, term, term, term);
  }

  const whereSql = where.join(' AND ');
  const offset = (filters.page - 1) * filters.pageSize;

  const [countRow, rows] = await Promise.all([
    first<{ count?: number }>(
      db,
      `SELECT COUNT(*) AS count
         FROM ControlMaster c
         JOIN BusinessProcess p ON p.id = c.processId
        WHERE ${whereSql}`,
      values
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT c.*
         FROM ControlMaster c
         JOIN BusinessProcess p ON p.id = c.processId
        WHERE ${whereSql}
        ORDER BY c.controlId ASC
        LIMIT ? OFFSET ?`,
      [...values, filters.pageSize, offset]
    )
  ]);

  const total = Number(countRow?.count || 0);
  if (rows.length === 0) {
    return {
      controls: [],
      pagination: paginationMeta(filters.page, filters.pageSize, total)
    };
  }

  const controlIds = idsJson(rows);
  const processIds = uniqueJson(rows.map(row => row.processId));
  const activityIds = uniqueJson(rows.map(row => row.activityId));

  const [processes, activities, mappings] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      `SELECT id, processId, name, categoryId, legalEntityId, orgUnitId,
              criticality, classification
         FROM BusinessProcess
        WHERE institutionId = ?
          AND id IN (SELECT value FROM json_each(?))`,
      [institutionId, processIds]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT *
         FROM ProcessActivity
        WHERE id IN (SELECT value FROM json_each(?))`,
      [activityIds]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT m.id, m.controlId, m.riskId, m.createdAt,
              r.riskId AS enterpriseRiskId, r.name AS riskName,
              r.description AS riskDescription, r.category AS riskCategory,
              r.inherentScore, r.inherentRating, r.residualScore, r.residualRating
         FROM ControlRiskMapping m
         JOIN RiskMaster r ON r.id = m.riskId
        WHERE m.controlId IN (SELECT value FROM json_each(?))
          AND r.institutionId = ?
        ORDER BY r.riskId ASC`,
      [controlIds, institutionId]
    )
  ]);

  const processMap = new Map(processes.map(row => [String(row.id), row]));
  const activityMap = new Map(activities.map(row => [String(row.id), row]));
  const mappingMap = groupRows(mappings, 'controlId');

  return {
    controls: rows.map(row => ({
      ...row,
      isKeyControl: bool(row.isKeyControl),
      isIcofrKey: bool(row.isIcofrKey),
      isItgc: bool(row.isItgc),
      process: processMap.get(String(row.processId)) || null,
      activity: row.activityId
        ? activityMap.get(String(row.activityId)) || null
        : null,
      risks: (mappingMap.get(String(row.id)) || []).map(mapping => ({
        id: mapping.id,
        controlId: mapping.controlId,
        riskId: mapping.riskId,
        createdAt: mapping.createdAt,
        risk: {
          id: mapping.riskId,
          riskId: mapping.enterpriseRiskId,
          name: mapping.riskName,
          description: mapping.riskDescription,
          category: mapping.riskCategory,
          inherentScore: Number(mapping.inherentScore || 0),
          inherentRating: mapping.inherentRating,
          residualScore: Number(mapping.residualScore || 0),
          residualRating: mapping.residualRating
        }
      })),
      todTests: [],
      toeTests: [],
      monitoringRules: [],
      certifications: []
    })),
    pagination: paginationMeta(filters.page, filters.pageSize, total)
  };
}

export async function listControlOptions(
  institutionId: string,
  scope: RegisterScope,
  search = ''
) {
  const db = await getDb();
  const where = ['c.institutionId = ?', 'p.institutionId = ?'];
  const values: unknown[] = [institutionId, institutionId];
  where.push(...scopeSql('p', scope, values));

  if (search) {
    const term = searchLike(search);
    where.push('(lower(c.controlId) LIKE ? OR lower(c.name) LIKE ?)');
    values.push(term, term);
  }

  return all<Record<string, unknown>>(
    db,
    `SELECT c.id, c.controlId, c.name, c.processId, c.controlOwner,
            c.isKeyControl, c.isIcofrKey, c.isItgc,
            p.processId AS enterpriseProcessId, p.name AS processName,
            p.legalEntityId, p.orgUnitId
       FROM ControlMaster c
       JOIN BusinessProcess p ON p.id = c.processId
      WHERE ${where.join(' AND ')}
      ORDER BY c.controlId ASC`,
    values
  ).then(rows => rows.map(row => ({
    ...row,
    isKeyControl: bool(row.isKeyControl),
    isIcofrKey: bool(row.isIcofrKey),
    isItgc: bool(row.isItgc),
    process: {
      id: row.processId,
      processId: row.enterpriseProcessId,
      name: row.processName,
      legalEntityId: row.legalEntityId,
      orgUnitId: row.orgUnitId
    }
  })));
}

export async function listRcmRegisterPage(
  institutionId: string,
  filters: RegisterFilters
) {
  const db = await getDb(false);
  const where = [
    'p.institutionId = ?',
    'r.institutionId = ?',
    'c.institutionId = ?'
  ];
  const values: unknown[] = [institutionId, institutionId, institutionId];
  where.push(...scopeSql('p', filters, values));

  if (filters.search) {
    const term = searchLike(filters.search);
    where.push(`(
      lower(p.processId) LIKE ?
      OR lower(p.name) LIKE ?
      OR lower(r.riskId) LIKE ?
      OR lower(r.name) LIKE ?
      OR lower(c.controlId) LIKE ?
      OR lower(c.name) LIKE ?
      OR lower(COALESCE(c.controlOwner, '')) LIKE ?
    )`);
    values.push(term, term, term, term, term, term, term);
  }

  const countWhereSql = where.join(' AND ');
  const countValues = [...values];

  const filterType = filters.filterType || 'ALL';
  if (filterType === 'KEY_ONLY') {
    where.push('c.isKeyControl = 1');
  } else if (filterType === 'ICOFR_ONLY') {
    where.push('c.isIcofrKey = 1');
  } else if (filterType === 'ISSUES_ONLY') {
    where.push(`EXISTS (
      SELECT 1 FROM Issue issueFilter
      WHERE issueFilter.controlId = c.id
        AND issueFilter.institutionId = ?
    )`);
    values.push(institutionId);
  }

  const whereSql = where.join(' AND ');
  const offset = (filters.page - 1) * filters.pageSize;

  const baseJoinSql = `
    FROM ControlRiskMapping m
    JOIN RiskMaster r ON r.id = m.riskId
    JOIN BusinessProcess p ON p.id = r.processId
    LEFT JOIN ProcessCategory pc ON pc.id = p.categoryId
    JOIN ControlMaster c ON c.id = m.controlId
  `;
  const baseSql = `${baseJoinSql} WHERE ${whereSql}`;

  const [countRow, filterCountRow, rows] = await Promise.all([
    first<{ count?: number }>(
      db,
      `SELECT COUNT(*) AS count ${baseSql}`,
      values
    ),
    first<{
      total?: number;
      keyControls?: number;
      icofr?: number;
      issues?: number;
    }>(
      db,
      `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN c.isKeyControl = 1 THEN 1 ELSE 0 END) AS keyControls,
          SUM(CASE WHEN c.isIcofrKey = 1 THEN 1 ELSE 0 END) AS icofr,
          SUM(CASE WHEN EXISTS (
            SELECT 1 FROM Issue issueCount
            WHERE issueCount.controlId = c.id
              AND issueCount.institutionId = ?
          ) THEN 1 ELSE 0 END) AS issues
        ${baseJoinSql}
        WHERE ${countWhereSql}`,
      [institutionId, ...countValues]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT
          m.id AS mappingId,
          p.id AS internalProcessId,
          p.processId AS enterpriseProcessId,
          p.name AS processName,
          p.legalEntityId AS processLegalEntityId,
          p.orgUnitId AS processOrgUnitId,
          pc.name AS processCategory,
          r.id AS internalRiskId,
          r.riskId AS enterpriseRiskId,
          r.name AS riskName,
          r.cause AS riskCause,
          r.event AS riskEvent,
          r.impact AS riskImpact,
          r.category AS riskCategory,
          r.activityId,
          r.inherentScore,
          r.inherentRating,
          r.residualScore,
          r.residualRating,
          c.id AS internalControlId,
          c.controlId AS enterpriseControlId,
          c.name AS controlName,
          c.description AS controlDescription,
          c.objective AS controlObjective,
          c.controlOwner,
          c.type AS controlType,
          c.nature AS controlNature,
          c.frequency AS controlFrequency,
          c.evidenceRequirement,
          c.isKeyControl,
          c.isIcofrKey,
          c.overallHealth
        ${baseSql}
        ORDER BY p.processId ASC, r.riskId ASC, c.controlId ASC
        LIMIT ? OFFSET ?`,
      [...values, filters.pageSize, offset]
    )
  ]);

  const total = Number(countRow?.count || 0);
  if (rows.length === 0) {
    return {
      rcm: [],
      filterCounts: {
        all: Number(filterCountRow?.total || 0),
        keyControls: Number(filterCountRow?.keyControls || 0),
        icofr: Number(filterCountRow?.icofr || 0),
        issues: Number(filterCountRow?.issues || 0)
      },
      pagination: paginationMeta(filters.page, filters.pageSize, total)
    };
  }

  const processIds = uniqueJson(rows.map(row => row.internalProcessId));
  const activityIds = uniqueJson(rows.map(row => row.activityId));
  const controlIds = uniqueJson(rows.map(row => row.internalControlId));

  const [objectives, activities, toes, issues, maps, retests] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      `SELECT processId, objective, createdAt
         FROM ProcessObjective
        WHERE processId IN (SELECT value FROM json_each(?))
        ORDER BY createdAt ASC`,
      [processIds]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT id, name
         FROM ProcessActivity
        WHERE id IN (SELECT value FROM json_each(?))`,
      [activityIds]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT *
         FROM ToETest
        WHERE controlId IN (SELECT value FROM json_each(?))
        ORDER BY testedAt DESC`,
      [controlIds]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT *
         FROM Issue
        WHERE institutionId = ?
          AND controlId IN (SELECT value FROM json_each(?))
        ORDER BY createdAt DESC`,
      [institutionId, controlIds]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT m.*, i.controlId
         FROM ManagementActionPlan m
         JOIN Issue i ON i.id = m.issueId
        WHERE i.institutionId = ?
          AND i.controlId IN (SELECT value FROM json_each(?))
        ORDER BY m.createdAt DESC`,
      [institutionId, controlIds]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT rr.*, i.controlId
         FROM RetestRecord rr
         JOIN ManagementActionPlan m ON m.id = rr.mapId
         JOIN Issue i ON i.id = m.issueId
        WHERE i.institutionId = ?
          AND i.controlId IN (SELECT value FROM json_each(?))
        ORDER BY rr.retestedAt DESC`,
      [institutionId, controlIds]
    )
  ]);

  const firstObjective = new Map<string, Record<string, unknown>>();
  for (const row of objectives) {
    const key = String(row.processId);
    if (!firstObjective.has(key)) firstObjective.set(key, row);
  }
  const activityMap = new Map(activities.map(row => [String(row.id), row]));

  const latestToe = new Map<string, Record<string, unknown>>();
  for (const row of toes) {
    const key = String(row.controlId);
    if (!latestToe.has(key)) latestToe.set(key, row);
  }
  const latestIssue = new Map<string, Record<string, unknown>>();
  for (const row of issues) {
    const key = String(row.controlId);
    if (!latestIssue.has(key)) latestIssue.set(key, row);
  }
  const latestMap = new Map<string, Record<string, unknown>>();
  for (const row of maps) {
    const key = String(row.controlId);
    if (!latestMap.has(key)) latestMap.set(key, row);
  }
  const latestRetest = new Map<string, Record<string, unknown>>();
  for (const row of retests) {
    const key = String(row.controlId);
    if (!latestRetest.has(key)) latestRetest.set(key, row);
  }

  const rcm = rows.map((row, index) => {
    const controlKey = String(row.internalControlId);
    const toe = latestToe.get(controlKey);
    const issue = latestIssue.get(controlKey);
    const map = latestMap.get(controlKey);
    const retest = latestRetest.get(controlKey);

    return {
      id: row.mappingId,
      rowNumber: offset + index + 1,
      processId: row.enterpriseProcessId,
      processName: row.processName,
      legalEntityId: row.processLegalEntityId || null,
      orgUnitId: row.processOrgUnitId || null,
      processCategory: row.processCategory || 'Uncategorized',
      activityName:
        (row.activityId
          ? activityMap.get(String(row.activityId))?.name
          : null) || 'Process-level risk',
      processObjective:
        firstObjective.get(String(row.internalProcessId))?.objective || 'Not provided',
      riskId: row.enterpriseRiskId,
      riskName: row.riskName,
      riskCause: row.riskCause,
      riskEvent: row.riskEvent,
      riskImpact: row.riskImpact,
      riskCategory: row.riskCategory,
      inherentScore: Number(row.inherentScore || 0),
      inherentRating: row.inherentRating,
      residualScore: Number(row.residualScore || 0),
      residualRating: row.residualRating,
      controlId: row.enterpriseControlId,
      controlName: row.controlName,
      controlDescription: row.controlDescription,
      controlObjective: row.controlObjective,
      controlOwner: row.controlOwner,
      controlType: row.controlType,
      controlNature: row.controlNature,
      controlFrequency: row.controlFrequency,
      evidenceRequirement: row.evidenceRequirement || 'Not provided',
      isKeyControl: bool(row.isKeyControl),
      isIcofrKey: bool(row.isIcofrKey),
      csaStatus: 'Not Assessed',
      todConclusion: 'Not Assessed',
      toeConclusion: toe?.finalConclusion || 'Not Tested',
      toePassRatio: toe
        ? `${Number(toe.passCount || 0)}/${Number(toe.sampleSize || 0)} Pass`
        : 'Not Tested',
      controlHealth: row.overallHealth || 'Not Assessed',
      issueId: issue?.issueId || null,
      issueTitle: issue?.title || null,
      issueSeverity: issue?.severity || null,
      issueStatus: issue?.status || 'No Issue',
      mapId: map?.mapId || null,
      mapAgreedAction: map?.agreedAction || null,
      mapStatus: map?.status || null,
      mapProgress: map ? `${Number(map.progressPercent || 0)}%` : null,
      retestResult: retest?.result || null
    };
  });

  return {
    rcm,
    filterCounts: {
      all: Number(filterCountRow?.total || 0),
      keyControls: Number(filterCountRow?.keyControls || 0),
      icofr: Number(filterCountRow?.icofr || 0),
      issues: Number(filterCountRow?.issues || 0)
    },
    pagination: paginationMeta(filters.page, filters.pageSize, total)
  };
}

export async function listToeRegisterPage(
  institutionId: string,
  filters: RegisterFilters
) {
  const db = await getDb(false);
  const where = ['p.institutionId = ?'];
  const values: unknown[] = [institutionId];
  where.push(...scopeSql('p', filters, values));

  if (filters.search) {
    const term = searchLike(filters.search);
    where.push(`(
      lower(t.testId) LIKE ?
      OR lower(COALESCE(t.period, '')) LIKE ?
      OR lower(COALESCE(t.testerName, '')) LIKE ?
      OR lower(c.controlId) LIKE ?
      OR lower(c.name) LIKE ?
      OR lower(p.name) LIKE ?
    )`);
    values.push(term, term, term, term, term, term);
  }

  const whereSql = where.join(' AND ');
  const offset = (filters.page - 1) * filters.pageSize;

  const [countRow, rows] = await Promise.all([
    first<{ count?: number }>(
      db,
      `SELECT COUNT(*) AS count
         FROM ToETest t
         JOIN BusinessProcess p ON p.id = t.processId
         JOIN ControlMaster c ON c.id = t.controlId
        WHERE ${whereSql}`,
      values
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT t.*
         FROM ToETest t
         JOIN BusinessProcess p ON p.id = t.processId
         JOIN ControlMaster c ON c.id = t.controlId
        WHERE ${whereSql}
        ORDER BY t.testedAt DESC, t.testId ASC
        LIMIT ? OFFSET ?`,
      [...values, filters.pageSize, offset]
    )
  ]);

  const total = Number(countRow?.count || 0);
  if (rows.length === 0) {
    return {
      tests: [],
      pagination: paginationMeta(filters.page, filters.pageSize, total)
    };
  }

  const testIds = idsJson(rows);
  const controlIds = uniqueJson(rows.map(row => row.controlId));
  const processIds = uniqueJson(rows.map(row => row.processId));
  const riskIds = uniqueJson(rows.map(row => row.riskId));

  const [controls, processes, risks, samples, exceptions, deficiencies] =
    await Promise.all([
      all<Record<string, unknown>>(
        db,
        `SELECT *
           FROM ControlMaster
          WHERE institutionId = ?
            AND id IN (SELECT value FROM json_each(?))`,
        [institutionId, controlIds]
      ),
      all<Record<string, unknown>>(
        db,
        `SELECT *
           FROM BusinessProcess
          WHERE institutionId = ?
            AND id IN (SELECT value FROM json_each(?))`,
        [institutionId, processIds]
      ),
      all<Record<string, unknown>>(
        db,
        `SELECT *
           FROM RiskMaster
          WHERE institutionId = ?
            AND id IN (SELECT value FROM json_each(?))`,
        [institutionId, riskIds]
      ),
      all<Record<string, unknown>>(
        db,
        `SELECT *
           FROM TestSample
          WHERE toeTestId IN (SELECT value FROM json_each(?))
          ORDER BY sampleNumber ASC`,
        [testIds]
      ),
      all<Record<string, unknown>>(
        db,
        `SELECT *
           FROM TestingException
          WHERE toeTestId IN (SELECT value FROM json_each(?))
          ORDER BY createdAt ASC`,
        [testIds]
      ),
      all<Record<string, unknown>>(
        db,
        `SELECT d.*
           FROM ControlDeficiency d
           JOIN TestingException e ON e.id = d.exceptionId
          WHERE e.toeTestId IN (SELECT value FROM json_each(?))
          ORDER BY d.createdAt ASC`,
        [testIds]
      )
    ]);

  const controlMap = new Map(
    controls.map(row => [
      String(row.id),
      {
        ...row,
        isKeyControl: bool(row.isKeyControl),
        isIcofrKey: bool(row.isIcofrKey),
        isItgc: bool(row.isItgc)
      }
    ])
  );
  const processMap = new Map(processes.map(row => [String(row.id), row]));
  const riskMap = new Map(risks.map(row => [String(row.id), row]));
  const samplesByTest = groupRows(samples, 'toeTestId');
  const exceptionsByTest = groupRows(exceptions, 'toeTestId');
  const deficienciesByException = groupRows(deficiencies, 'exceptionId');

  const tests = rows.map(test => ({
    ...test,
    populationSize: Number(test.populationSize || 0),
    sampleSize: Number(test.sampleSize || 0),
    passCount: Number(test.passCount || 0),
    failCount: Number(test.failCount || 0),
    control: controlMap.get(String(test.controlId)) || null,
    process: processMap.get(String(test.processId)) || null,
    risk: test.riskId ? riskMap.get(String(test.riskId)) || null : null,
    samples: samplesByTest.get(String(test.id)) || [],
    exceptions: (exceptionsByTest.get(String(test.id)) || []).map(exception => ({
      ...exception,
      deficiencies: deficienciesByException.get(String(exception.id)) || []
    }))
  }));

  return {
    tests,
    pagination: paginationMeta(filters.page, filters.pageSize, total)
  };
}

export async function listAuditRegisterPage(
  institutionId: string,
  pagination: PaginationInput
) {
  const db = await getDb();
  const where = ['institutionId = ?'];
  const values: unknown[] = [institutionId];

  if (pagination.search) {
    const term = searchLike(pagination.search);
    where.push(`(
      lower(COALESCE(userName, '')) LIKE ?
      OR lower(COALESCE(userRole, '')) LIKE ?
      OR lower(COALESCE(action, '')) LIKE ?
      OR lower(COALESCE(entityType, '')) LIKE ?
      OR lower(COALESCE(recordId, '')) LIKE ?
      OR lower(COALESCE(reason, '')) LIKE ?
    )`);
    values.push(term, term, term, term, term, term);
  }

  const whereSql = where.join(' AND ');
  const offset = (pagination.page - 1) * pagination.pageSize;
  const [countRow, rows] = await Promise.all([
    first<{ count?: number }>(
      db,
      `SELECT COUNT(*) AS count FROM AuditLog WHERE ${whereSql}`,
      values
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT id, userName, userRole, action, entityType, recordId,
              reason, ipAddress, timestamp
         FROM AuditLog
        WHERE ${whereSql}
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?`,
      [...values, pagination.pageSize, offset]
    )
  ]);

  const total = Number(countRow?.count || 0);
  return {
    auditLogs: rows,
    pagination: paginationMeta(pagination.page, pagination.pageSize, total)
  };
}
