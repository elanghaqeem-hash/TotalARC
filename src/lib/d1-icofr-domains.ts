import { getTenantDb } from '@/lib/tenant-context';
import { ensureCoreDomainSchema } from '@/lib/d1-core';

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

export const ICOFR_CONTROL_CATEGORIES = ['ELC', 'ITGC', 'ITAC', 'PLC'] as const;
export type IcofrControlCategory = (typeof ICOFR_CONTROL_CATEGORIES)[number];

async function getDb(): Promise<D1DatabaseLike> {
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

function clean(value: unknown) {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next || null;
}

function bool(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function nowIso() {
  return new Date().toISOString();
}

let schemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureIcofrDomainSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    await ensureCoreDomainSchema();
    const db = await getDb();

    await executeSchema(db, `
      CREATE TABLE IF NOT EXISTS ICOFRControlDomain (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        category TEXT NOT NULL,
        controlCode TEXT NOT NULL,
        name TEXT NOT NULL,
        subcategory TEXT,
        objective TEXT NOT NULL,
        riskDescription TEXT,
        owner TEXT NOT NULL,
        reviewer TEXT,
        frequency TEXT NOT NULL,
        nature TEXT NOT NULL,
        controlType TEXT NOT NULL,
        systemName TEXT,
        processName TEXT,
        financialStatementArea TEXT,
        assertions TEXT,
        frameworkReference TEXT,
        sourceControlId TEXT,
        keyControl INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Draft',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_control_domain_code
        ON ICOFRControlDomain(institutionId, category, controlCode);
      CREATE INDEX IF NOT EXISTS idx_icofr_control_domain_category
        ON ICOFRControlDomain(institutionId, category);

      CREATE TABLE IF NOT EXISTS ICOFRInformationRegister (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        artifactType TEXT NOT NULL,
        itemCode TEXT NOT NULL,
        name TEXT NOT NULL,
        sourceSystem TEXT,
        owner TEXT NOT NULL,
        purpose TEXT NOT NULL,
        frequency TEXT,
        logicDescription TEXT,
        parameters TEXT,
        dataSource TEXT,
        completenessMethod TEXT,
        accuracyMethod TEXT,
        accessRestricted INTEGER NOT NULL DEFAULT 0,
        versionControlled INTEGER NOT NULL DEFAULT 0,
        keyReport INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Draft',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_information_code
        ON ICOFRInformationRegister(institutionId, artifactType, itemCode);
      CREATE INDEX IF NOT EXISTS idx_icofr_information_type
        ON ICOFRInformationRegister(institutionId, artifactType);

      CREATE TABLE IF NOT EXISTS ICOFRFinancialItem (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        recordType TEXT NOT NULL,
        itemCode TEXT NOT NULL,
        name TEXT NOT NULL,
        financialStatement TEXT,
        balanceAmount REAL,
        currency TEXT,
        significant INTEGER NOT NULL DEFAULT 0,
        scopingRationale TEXT,
        assertions TEXT,
        riskFactors TEXT,
        processReference TEXT,
        owner TEXT,
        status TEXT NOT NULL DEFAULT 'Draft',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_financial_item_code
        ON ICOFRFinancialItem(institutionId, recordType, itemCode);
      CREATE INDEX IF NOT EXISTS idx_icofr_financial_item_type
        ON ICOFRFinancialItem(institutionId, recordType);

      CREATE TABLE IF NOT EXISTS ICOFRDeficiency (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        deficiencyCode TEXT NOT NULL,
        title TEXT NOT NULL,
        controlDomain TEXT,
        controlReference TEXT,
        description TEXT NOT NULL,
        financialStatementImpact TEXT,
        likelihood TEXT,
        severity TEXT NOT NULL,
        aggregationConsidered INTEGER NOT NULL DEFAULT 0,
        compensatingControls TEXT,
        conclusion TEXT,
        owner TEXT NOT NULL,
        dueDate TEXT,
        status TEXT NOT NULL DEFAULT 'Open',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_deficiency_code
        ON ICOFRDeficiency(institutionId, deficiencyCode);
      CREATE INDEX IF NOT EXISTS idx_icofr_deficiency_severity
        ON ICOFRDeficiency(institutionId, severity, status);
    `);

    return db;
  })().catch(error => {
    schemaReady = null;
    throw error;
  });

  return schemaReady;
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
      'ICOFR register maintenance.',
      null,
      nowIso()
    ]
  );
}

export async function listIcofrControls(category: IcofrControlCategory) {
  const db = await ensureIcofrDomainSchema();
  const institution = await primaryInstitution(db);
  if (!institution) return { institution: null, records: [] };

  const records = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRControlDomain WHERE institutionId = ? AND category = ? ORDER BY controlCode ASC',
    [institution.id, category]
  );

  return {
    institution: { id: institution.id, name: institution.name, legalName: institution.legalName },
    records: records.map(row => ({ ...row, keyControl: bool(row.keyControl) }))
  };
}

export async function saveIcofrControl(input: Record<string, unknown>) {
  const db = await ensureIcofrDomainSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const category = String(input.category || '').toUpperCase() as IcofrControlCategory;
  if (!ICOFR_CONTROL_CATEGORIES.includes(category)) throw new Error('INVALID_CATEGORY');

  const controlCode = String(input.controlCode || '').trim().toUpperCase();
  const name = String(input.name || '').trim();
  const objective = String(input.objective || '').trim();
  const owner = String(input.owner || '').trim();
  const frequency = String(input.frequency || '').trim();
  const nature = String(input.nature || '').trim();
  const controlType = String(input.controlType || '').trim();

  if (!controlCode || !name || !objective || !owner || !frequency || !nature || !controlType) {
    throw new Error('REQUIRED_FIELDS');
  }

  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : crypto.randomUUID();
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRControlDomain WHERE id = ? AND institutionId = ? LIMIT 1',
    [id, institution.id]
  );
  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM ICOFRControlDomain WHERE institutionId = ? AND category = ? AND controlCode = ? AND id <> ? LIMIT 1',
    [institution.id, category, controlCode, id]
  );
  if (duplicate) throw new Error('CODE_CONFLICT');

  const now = nowIso();
  const record = {
    id,
    institutionId: String(institution.id),
    category,
    controlCode,
    name,
    subcategory: clean(input.subcategory),
    objective,
    riskDescription: clean(input.riskDescription),
    owner,
    reviewer: clean(input.reviewer),
    frequency,
    nature,
    controlType,
    systemName: clean(input.systemName),
    processName: clean(input.processName),
    financialStatementArea: clean(input.financialStatementArea),
    assertions: clean(input.assertions),
    frameworkReference: clean(input.frameworkReference),
    sourceControlId: clean(input.sourceControlId),
    keyControl: bool(input.keyControl),
    status: String(input.status || 'Draft').trim() || 'Draft',
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    await run(
      db,
      `UPDATE ICOFRControlDomain SET
        category=?, controlCode=?, name=?, subcategory=?, objective=?, riskDescription=?,
        owner=?, reviewer=?, frequency=?, nature=?, controlType=?, systemName=?, processName=?,
        financialStatementArea=?, assertions=?, frameworkReference=?, sourceControlId=?,
        keyControl=?, status=?, updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        record.category, record.controlCode, record.name, record.subcategory, record.objective,
        record.riskDescription, record.owner, record.reviewer, record.frequency, record.nature,
        record.controlType, record.systemName, record.processName, record.financialStatementArea,
        record.assertions, record.frameworkReference, record.sourceControlId, record.keyControl ? 1 : 0,
        record.status, now, id, institution.id
      ]
    );
  } else {
    await run(
      db,
      `INSERT INTO ICOFRControlDomain (
        id,institutionId,category,controlCode,name,subcategory,objective,riskDescription,
        owner,reviewer,frequency,nature,controlType,systemName,processName,
        financialStatementArea,assertions,frameworkReference,sourceControlId,keyControl,
        status,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        record.id, record.institutionId, record.category, record.controlCode, record.name,
        record.subcategory, record.objective, record.riskDescription, record.owner, record.reviewer,
        record.frequency, record.nature, record.controlType, record.systemName, record.processName,
        record.financialStatementArea, record.assertions, record.frameworkReference,
        record.sourceControlId, record.keyControl ? 1 : 0, record.status, record.createdAt, record.updatedAt
      ]
    );
  }

  await audit(db, String(institution.id), existing ? 'UPDATE' : 'CREATE', `ICOFR_${category}`, id, record, existing || undefined);
  return record;
}

export async function listInformationRegister(artifactType?: string) {
  const db = await ensureIcofrDomainSchema();
  const institution = await primaryInstitution(db);
  if (!institution) return { institution: null, records: [] };
  const normalized = artifactType ? artifactType.trim().toUpperCase() : '';

  const records = normalized
    ? await all<Record<string, unknown>>(
        db,
        'SELECT * FROM ICOFRInformationRegister WHERE institutionId = ? AND artifactType = ? ORDER BY itemCode ASC',
        [institution.id, normalized]
      )
    : await all<Record<string, unknown>>(
        db,
        'SELECT * FROM ICOFRInformationRegister WHERE institutionId = ? ORDER BY artifactType ASC, itemCode ASC',
        [institution.id]
      );

  return {
    institution: { id: institution.id, name: institution.name },
    records: records.map(row => ({
      ...row,
      accessRestricted: bool(row.accessRestricted),
      versionControlled: bool(row.versionControlled),
      keyReport: bool(row.keyReport)
    }))
  };
}

export async function saveInformationRegister(input: Record<string, unknown>) {
  const db = await ensureIcofrDomainSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const artifactType = String(input.artifactType || '').trim().toUpperCase();
  const itemCode = String(input.itemCode || '').trim().toUpperCase();
  const name = String(input.name || '').trim();
  const owner = String(input.owner || '').trim();
  const purpose = String(input.purpose || '').trim();
  if (!['IPE', 'EUC'].includes(artifactType)) throw new Error('INVALID_ARTIFACT_TYPE');
  if (!itemCode || !name || !owner || !purpose) throw new Error('REQUIRED_FIELDS');

  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : crypto.randomUUID();
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRInformationRegister WHERE id = ? AND institutionId = ? LIMIT 1',
    [id, institution.id]
  );
  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM ICOFRInformationRegister WHERE institutionId=? AND artifactType=? AND itemCode=? AND id<>? LIMIT 1',
    [institution.id, artifactType, itemCode, id]
  );
  if (duplicate) throw new Error('CODE_CONFLICT');

  const now = nowIso();
  const record = {
    id,
    institutionId: String(institution.id),
    artifactType,
    itemCode,
    name,
    sourceSystem: clean(input.sourceSystem),
    owner,
    purpose,
    frequency: clean(input.frequency),
    logicDescription: clean(input.logicDescription),
    parameters: clean(input.parameters),
    dataSource: clean(input.dataSource),
    completenessMethod: clean(input.completenessMethod),
    accuracyMethod: clean(input.accuracyMethod),
    accessRestricted: bool(input.accessRestricted),
    versionControlled: bool(input.versionControlled),
    keyReport: bool(input.keyReport),
    status: String(input.status || 'Draft').trim() || 'Draft',
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    await run(
      db,
      `UPDATE ICOFRInformationRegister SET
        artifactType=?,itemCode=?,name=?,sourceSystem=?,owner=?,purpose=?,frequency=?,
        logicDescription=?,parameters=?,dataSource=?,completenessMethod=?,accuracyMethod=?,
        accessRestricted=?,versionControlled=?,keyReport=?,status=?,updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        record.artifactType,record.itemCode,record.name,record.sourceSystem,record.owner,record.purpose,
        record.frequency,record.logicDescription,record.parameters,record.dataSource,
        record.completenessMethod,record.accuracyMethod,record.accessRestricted?1:0,
        record.versionControlled?1:0,record.keyReport?1:0,record.status,now,id,institution.id
      ]
    );
  } else {
    await run(
      db,
      `INSERT INTO ICOFRInformationRegister (
        id,institutionId,artifactType,itemCode,name,sourceSystem,owner,purpose,frequency,
        logicDescription,parameters,dataSource,completenessMethod,accuracyMethod,
        accessRestricted,versionControlled,keyReport,status,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        record.id,record.institutionId,record.artifactType,record.itemCode,record.name,record.sourceSystem,
        record.owner,record.purpose,record.frequency,record.logicDescription,record.parameters,
        record.dataSource,record.completenessMethod,record.accuracyMethod,record.accessRestricted?1:0,
        record.versionControlled?1:0,record.keyReport?1:0,record.status,record.createdAt,record.updatedAt
      ]
    );
  }

  await audit(db,String(institution.id),existing?'UPDATE':'CREATE',`ICOFR_${artifactType}`,id,record,existing||undefined);
  return record;
}

export async function listFinancialItems() {
  const db = await ensureIcofrDomainSchema();
  const institution = await primaryInstitution(db);
  if (!institution) return { institution: null, records: [] };
  const records = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRFinancialItem WHERE institutionId = ? ORDER BY recordType ASC, itemCode ASC',
    [institution.id]
  );
  return {
    institution: { id: institution.id, name: institution.name },
    records: records.map(row => ({ ...row, significant: bool(row.significant) }))
  };
}

export async function saveFinancialItem(input: Record<string, unknown>) {
  const db = await ensureIcofrDomainSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const recordType = String(input.recordType || '').trim();
  const itemCode = String(input.itemCode || '').trim().toUpperCase();
  const name = String(input.name || '').trim();
  if (!['Account', 'Disclosure'].includes(recordType)) throw new Error('INVALID_RECORD_TYPE');
  if (!itemCode || !name) throw new Error('REQUIRED_FIELDS');

  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : crypto.randomUUID();
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRFinancialItem WHERE id=? AND institutionId=? LIMIT 1',
    [id,institution.id]
  );
  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM ICOFRFinancialItem WHERE institutionId=? AND recordType=? AND itemCode=? AND id<>? LIMIT 1',
    [institution.id,recordType,itemCode,id]
  );
  if (duplicate) throw new Error('CODE_CONFLICT');

  const amountRaw = input.balanceAmount;
  const balanceAmount = amountRaw === '' || amountRaw === null || amountRaw === undefined ? null : Number(amountRaw);
  if (balanceAmount !== null && !Number.isFinite(balanceAmount)) throw new Error('INVALID_AMOUNT');

  const now=nowIso();
  const record={
    id,
    institutionId:String(institution.id),
    recordType,
    itemCode,
    name,
    financialStatement:clean(input.financialStatement),
    balanceAmount,
    currency:clean(input.currency),
    significant:bool(input.significant),
    scopingRationale:clean(input.scopingRationale),
    assertions:clean(input.assertions),
    riskFactors:clean(input.riskFactors),
    processReference:clean(input.processReference),
    owner:clean(input.owner),
    status:String(input.status||'Draft').trim()||'Draft',
    createdAt:existing?.createdAt||now,
    updatedAt:now
  };

  if(existing){
    await run(db,`UPDATE ICOFRFinancialItem SET
      recordType=?,itemCode=?,name=?,financialStatement=?,balanceAmount=?,currency=?,significant=?,
      scopingRationale=?,assertions=?,riskFactors=?,processReference=?,owner=?,status=?,updatedAt=?
      WHERE id=? AND institutionId=?`,[
        record.recordType,record.itemCode,record.name,record.financialStatement,record.balanceAmount,
        record.currency,record.significant?1:0,record.scopingRationale,record.assertions,record.riskFactors,
        record.processReference,record.owner,record.status,now,id,institution.id
      ]);
  }else{
    await run(db,`INSERT INTO ICOFRFinancialItem (
      id,institutionId,recordType,itemCode,name,financialStatement,balanceAmount,currency,significant,
      scopingRationale,assertions,riskFactors,processReference,owner,status,createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
      record.id,record.institutionId,record.recordType,record.itemCode,record.name,record.financialStatement,
      record.balanceAmount,record.currency,record.significant?1:0,record.scopingRationale,record.assertions,
      record.riskFactors,record.processReference,record.owner,record.status,record.createdAt,record.updatedAt
    ]);
  }

  await audit(db,String(institution.id),existing?'UPDATE':'CREATE','ICOFR_FinancialItem',id,record,existing||undefined);
  return record;
}

export async function listDeficiencies() {
  const db = await ensureIcofrDomainSchema();
  const institution = await primaryInstitution(db);
  if (!institution) return { institution: null, records: [] };
  const records=await all<Record<string,unknown>>(
    db,
    'SELECT * FROM ICOFRDeficiency WHERE institutionId=? ORDER BY createdAt DESC',
    [institution.id]
  );
  return {
    institution:{id:institution.id,name:institution.name},
    records:records.map(row=>({...row,aggregationConsidered:bool(row.aggregationConsidered)}))
  };
}

export async function saveDeficiency(input:Record<string,unknown>){
  const db=await ensureIcofrDomainSchema();
  const institution=await primaryInstitution(db);
  if(!institution) throw new Error('INSTITUTION_REQUIRED');

  const deficiencyCode=String(input.deficiencyCode||'').trim().toUpperCase();
  const title=String(input.title||'').trim();
  const description=String(input.description||'').trim();
  const severity=String(input.severity||'').trim();
  const owner=String(input.owner||'').trim();
  if(!deficiencyCode||!title||!description||!severity||!owner) throw new Error('REQUIRED_FIELDS');

  const id=typeof input.id==='string'&&input.id.trim()?input.id.trim():crypto.randomUUID();
  const existing=await first<Record<string,unknown>>(db,'SELECT * FROM ICOFRDeficiency WHERE id=? AND institutionId=? LIMIT 1',[id,institution.id]);
  const duplicate=await first<Record<string,unknown>>(db,'SELECT id FROM ICOFRDeficiency WHERE institutionId=? AND deficiencyCode=? AND id<>? LIMIT 1',[institution.id,deficiencyCode,id]);
  if(duplicate) throw new Error('CODE_CONFLICT');

  const now=nowIso();
  const record={
    id,
    institutionId:String(institution.id),
    deficiencyCode,
    title,
    controlDomain:clean(input.controlDomain),
    controlReference:clean(input.controlReference),
    description,
    financialStatementImpact:clean(input.financialStatementImpact),
    likelihood:clean(input.likelihood),
    severity,
    aggregationConsidered:bool(input.aggregationConsidered),
    compensatingControls:clean(input.compensatingControls),
    conclusion:clean(input.conclusion),
    owner,
    dueDate:clean(input.dueDate),
    status:String(input.status||'Open').trim()||'Open',
    createdAt:existing?.createdAt||now,
    updatedAt:now
  };

  if(existing){
    await run(db,`UPDATE ICOFRDeficiency SET
      deficiencyCode=?,title=?,controlDomain=?,controlReference=?,description=?,financialStatementImpact=?,
      likelihood=?,severity=?,aggregationConsidered=?,compensatingControls=?,conclusion=?,owner=?,dueDate=?,status=?,updatedAt=?
      WHERE id=? AND institutionId=?`,[
        record.deficiencyCode,record.title,record.controlDomain,record.controlReference,record.description,
        record.financialStatementImpact,record.likelihood,record.severity,record.aggregationConsidered?1:0,
        record.compensatingControls,record.conclusion,record.owner,record.dueDate,record.status,now,id,institution.id
      ]);
  }else{
    await run(db,`INSERT INTO ICOFRDeficiency (
      id,institutionId,deficiencyCode,title,controlDomain,controlReference,description,financialStatementImpact,
      likelihood,severity,aggregationConsidered,compensatingControls,conclusion,owner,dueDate,status,createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
      record.id,record.institutionId,record.deficiencyCode,record.title,record.controlDomain,record.controlReference,
      record.description,record.financialStatementImpact,record.likelihood,record.severity,record.aggregationConsidered?1:0,
      record.compensatingControls,record.conclusion,record.owner,record.dueDate,record.status,record.createdAt,record.updatedAt
    ]);
  }

  await audit(db,String(institution.id),existing?'UPDATE':'CREATE','ICOFR_Deficiency',id,record,existing||undefined);
  return record;
}
