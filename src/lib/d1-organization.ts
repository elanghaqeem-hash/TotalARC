import { getCloudflareContext } from '@opennextjs/cloudflare';

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

export type LegalEntityInput = {
  code: string;
  name: string;
  country?: string;
  taxId?: string | null;
};

export type OrganizationUnitInput = {
  code: string;
  name: string;
  type: string;
  legalEntityId?: string | null;
  parentId?: string | null;
  headName?: string | null;
  headEmail?: string | null;
};

async function getDb(): Promise<D1DatabaseLike> {
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

function clean(value: unknown) {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next ? next : null;
}

let organizationSchemaReady: Promise<D1DatabaseLike> | null = null;

async function ensureOrganizationSchema() {
  if (organizationSchemaReady) return organizationSchemaReady;

  organizationSchemaReady = (async () => {
    const db = await getDb();

    await executeSchemaScript(db, `
    CREATE TABLE IF NOT EXISTS LegalEntity (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Indonesia',
      taxId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_entity_institution_code
      ON LegalEntity(institutionId, code);
    CREATE INDEX IF NOT EXISTS idx_legal_entity_institution
      ON LegalEntity(institutionId);

    CREATE TABLE IF NOT EXISTS OrganizationUnit (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      legalEntityId TEXT,
      parentId TEXT,
      type TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      headName TEXT,
      headEmail TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_org_unit_institution_code
      ON OrganizationUnit(institutionId, code);
    CREATE INDEX IF NOT EXISTS idx_org_unit_institution
      ON OrganizationUnit(institutionId);
    CREATE INDEX IF NOT EXISTS idx_org_unit_parent
      ON OrganizationUnit(parentId);
    CREATE INDEX IF NOT EXISTS idx_org_unit_legal_entity
      ON OrganizationUnit(legalEntityId);

    CREATE TABLE IF NOT EXISTS OrganizationHierarchyEvidence (
      unitId TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      sourceStatus TEXT NOT NULL,
      hierarchyStatus TEXT NOT NULL,
      sourceReferencesJson TEXT NOT NULL,
      sourceNote TEXT,
      asOfDate TEXT,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_org_hierarchy_evidence_institution
      ON OrganizationHierarchyEvidence(institutionId);
    CREATE INDEX IF NOT EXISTS idx_org_hierarchy_evidence_status
      ON OrganizationHierarchyEvidence(hierarchyStatus);

    CREATE TABLE IF NOT EXISTS OrganizationStructureTemplate (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      templateCode TEXT NOT NULL,
      nodeCode TEXT NOT NULL,
      parentNodeCode TEXT,
      relationshipType TEXT NOT NULL DEFAULT 'Direct',
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      conditional INTEGER NOT NULL DEFAULT 0,
      sourceReference TEXT NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Active',
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_org_structure_template_node
      ON OrganizationStructureTemplate(institutionId, templateCode, nodeCode);

    CREATE TABLE IF NOT EXISTS OrganizationBranchExpansion (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      branchUnitId TEXT NOT NULL,
      branchCode TEXT NOT NULL,
      branchName TEXT NOT NULL,
      structureType TEXT NOT NULL,
      nodeCount INTEGER NOT NULL DEFAULT 0,
      structureJson TEXT NOT NULL,
      sourceReferencesJson TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Source Governed',
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_org_branch_expansion_unit
      ON OrganizationBranchExpansion(institutionId, branchUnitId);
    CREATE INDEX IF NOT EXISTS idx_org_branch_expansion_code
      ON OrganizationBranchExpansion(institutionId, branchCode);

    CREATE TABLE IF NOT EXISTS OrganizationDataMigration (
      institutionId TEXT NOT NULL,
      migrationCode TEXT NOT NULL,
      completedAt TEXT NOT NULL,
      summaryJson TEXT,
      PRIMARY KEY (institutionId, migrationCode)
    );

    CREATE TABLE IF NOT EXISTS AuditLog (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT,
      userName TEXT NOT NULL,
      userRole TEXT NOT NULL,
      action TEXT NOT NULL,
      entityType TEXT NOT NULL,
      recordId TEXT NOT NULL,
      oldValue TEXT,
      newValue TEXT,
      reason TEXT,
      ipAddress TEXT,
      timestamp TEXT NOT NULL
    );
    `);

    return db;
  })().catch(error => {
    organizationSchemaReady = null;
    throw error;
  });

  return organizationSchemaReady;
}

async function primaryInstitution(db: D1DatabaseLike) {
  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM Institution ORDER BY createdAt ASC LIMIT 1'
  );
}

async function writeAudit(
  db: D1DatabaseLike,
  institutionId: string,
  entityType: string,
  recordId: string,
  newValue: unknown,
  reason: string
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
      'CREATE',
      entityType,
      recordId,
      null,
      JSON.stringify(newValue),
      reason,
      null,
      nowIso()
    ]
  );
}


const BANK_KALBAR_ORG_MIGRATION = 'BANK_KALBAR_COMPLETE_ORG_20260922';

const CENTRAL_PARENT_MAP: Record<string, string> = {
  'DIV-UUS': 'DIR-PEMASARAN-UUS',
  'DIV-TREASURY': 'DIR-PEMASARAN-UUS',
  'DIV-KREDIT': 'DIR-PEMASARAN-UUS',
  'DIV-CREDIT-RECOVERY': 'DIR-PEMASARAN-UUS',
  'DIV-EBANK': 'DIR-PEMASARAN-UUS',
  'DIV-TI': 'DIR-UMUM',
  'DIV-AKUNTANSI': 'DIR-UMUM',
  'DIV-UMUM': 'DIR-UMUM',
  'DIV-SDM': 'DIR-UMUM',
  'DIV-KEPATUHAN': 'DIR-KEPATUHAN',
  'DIV-MR': 'DIR-KEPATUHAN',
  'DIV-STRATEGI': 'DIR-UTAMA',
  'FUNC-SKAI': 'DIR-UTAMA',
  'FUNC-CORSEC': 'DIR-UTAMA',
  'FUNC-ICOFR': 'EXEC-DIREKSI'
};

const CONVENTIONAL_BRANCH_CODES = [
  'BR-KCU-PONTIANAK',
  'BR-FLAMBOYAN',
  'BR-KUBU-RAYA',
  'BR-MEMPAWAH',
  'BR-SINGKAWANG',
  'BR-SAMBAS',
  'BR-PEMANGKAT',
  'BR-BENGKAYANG',
  'BR-NGABANG',
  'BR-SANGGAU',
  'BR-BALAI-KARANGAN',
  'BR-SEKADAU',
  'BR-SINTANG',
  'BR-NANGA-PINOH',
  'BR-PUTUSSIBAU',
  'BR-SEMITAU',
  'BR-KETAPANG',
  'BR-SUKADANA',
  'BR-JAKARTA'
];

const SHARIA_BRANCH_CODES = [
  'BR-SYARIAH-PONTIANAK',
  'BR-SYARIAH-SINGKAWANG',
  'BR-SYARIAH-SAMBAS',
  'BR-SYARIAH-KETAPANG'
];

const CONVENTIONAL_BRANCH_STRUCTURE = [
  { nodeCode: 'PEMIMPIN-CABANG', parentNodeCode: null, type: 'Position', name: 'Pemimpin Cabang', relationshipType: 'Branch leadership', conditional: false },
  { nodeCode: 'WAKIL-PEMIMPIN', parentNodeCode: 'PEMIMPIN-CABANG', type: 'Position', name: 'Wakil Pemimpin Cabang', relationshipType: 'Direct', conditional: true },
  { nodeCode: 'KCP', parentNodeCode: 'PEMIMPIN-CABANG', type: 'Office', name: 'Kantor Cabang Pembantu', relationshipType: 'Direct', conditional: true },
  { nodeCode: 'UUM', parentNodeCode: 'PEMIMPIN-CABANG', type: 'Unit', name: 'Unit Usaha Mikro', relationshipType: 'Direct', conditional: true },
  { nodeCode: 'SEKSI-KREDIT', parentNodeCode: 'PEMIMPIN-CABANG', type: 'Unit', name: 'Seksi Kredit', relationshipType: 'Direct', conditional: true },
  { nodeCode: 'SEKSI-PENAGIHAN', parentNodeCode: 'PEMIMPIN-CABANG', type: 'Unit', name: 'Seksi Penagihan & Pemulihan Kredit', relationshipType: 'Direct', conditional: true },
  { nodeCode: 'SEKSI-PENGHIMPUNAN', parentNodeCode: 'PEMIMPIN-CABANG', type: 'Unit', name: 'Seksi Penghimpunan Dana', relationshipType: 'Direct', conditional: true },
  { nodeCode: 'SEKSI-UMUM', parentNodeCode: 'PEMIMPIN-CABANG', type: 'Unit', name: 'Seksi Umum dan Personalia', relationshipType: 'Direct', conditional: true },
  { nodeCode: 'KCP-KAS', parentNodeCode: 'PEMIMPIN-CABANG', type: 'Office', name: 'Kantor Cabang Pembantu Kas', relationshipType: 'Direct', conditional: true },
  { nodeCode: 'KCP-KELILING', parentNodeCode: 'PEMIMPIN-CABANG', type: 'Office', name: 'Kantor Cabang Pembantu Keliling', relationshipType: 'Direct', conditional: true },
  { nodeCode: 'SEKSI-PELAYANAN', parentNodeCode: 'PEMIMPIN-CABANG', type: 'Unit', name: 'Seksi Pelayanan Nasabah', relationshipType: 'Indirect supervision', conditional: true },
  { nodeCode: 'SEKSI-AKUNTANSI', parentNodeCode: 'PEMIMPIN-CABANG', type: 'Unit', name: 'Seksi Akuntansi', relationshipType: 'Indirect supervision', conditional: true },
  { nodeCode: 'KONTROL-INTERN', parentNodeCode: null, type: 'Control Function', name: 'Kontrol Intern Cabang', relationshipType: 'Control line', conditional: false }
];

const SHARIA_BRANCH_STRUCTURE = [
  { nodeCode: 'CABANG-PEMBANTU-SYARIAH', parentNodeCode: null, type: 'Office', name: 'Cabang Pembantu Syariah', relationshipType: 'Network child', conditional: true },
  { nodeCode: 'KANTOR-KAS-SYARIAH', parentNodeCode: null, type: 'Office', name: 'Kantor Kas Syariah', relationshipType: 'Network child', conditional: true },
  { nodeCode: 'KAS-MOBIL-SYARIAH', parentNodeCode: null, type: 'Office', name: 'Kas Mobil Syariah', relationshipType: 'Network child', conditional: true },
  { nodeCode: 'LAYANAN-SYARIAH', parentNodeCode: null, type: 'Service', name: 'Layanan Syariah', relationshipType: 'Network child', conditional: true }
];

async function upsertHierarchyEvidence(
  db: D1DatabaseLike,
  institutionId: string,
  unitId: string,
  sourceStatus: string,
  hierarchyStatus: string,
  sourceReferences: string[],
  sourceNote: string
) {
  const now = nowIso();
  await run(
    db,
    `INSERT INTO OrganizationHierarchyEvidence (
      unitId, institutionId, sourceStatus, hierarchyStatus, sourceReferencesJson,
      sourceNote, asOfDate, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(unitId) DO UPDATE SET
      sourceStatus = excluded.sourceStatus,
      hierarchyStatus = excluded.hierarchyStatus,
      sourceReferencesJson = excluded.sourceReferencesJson,
      sourceNote = excluded.sourceNote,
      asOfDate = excluded.asOfDate,
      updatedAt = excluded.updatedAt`,
    [
      unitId,
      institutionId,
      sourceStatus,
      hierarchyStatus,
      JSON.stringify(sourceReferences),
      sourceNote,
      '2026-09-22',
      now
    ]
  );
}

async function ensureBankKalbarOrganizationCompletion(
  db: D1DatabaseLike,
  institution: Record<string, unknown>
) {
  if (institution.legalName !== 'PT. Bank Pembangunan Daerah Kalimantan Barat') return;

  const institutionId = String(institution.id);
  const alreadyDone = await first(
    db,
    'SELECT migrationCode FROM OrganizationDataMigration WHERE institutionId = ? AND migrationCode = ? LIMIT 1',
    [institutionId, BANK_KALBAR_ORG_MIGRATION]
  );
  if (alreadyDone) return;

  const sourceCentral =
    'AURA:1NWZMKg1JNPZlrd3hyPrwjziqqdx6doEG#DIR/PP-0003/2026 tanggal 29 Januari 2026 Lampiran halaman 11';
  const sourceBranch =
    'AURA:1qGRMYziU7V3Z4HXhUGNx8mFullqaVoFK#DIR/PP-0024/2026 tanggal 9 Juni 2026 Lampiran halaman 14,19-20';
  const sourceSeraya =
    'SERAYA:1PP3k6wnVdYEWQCtxcGtw-dCpmHfjYutf#Daftar Fungsi/Unit Kerja Bank Kalbar';
  const sourceIcofr =
    'SERAYA:1tbpwcCpsYIgAKzp0sSAByS-X8D_vtYaL#Kerangka Metodologi ICOFR 2026';
  const sourceNetwork = 'https://bankkalbar.co.id/jaringan_kantor.php';
  const sourceManagement = 'https://bankkalbar.co.id/jajaran_manajemen.php';

  const units = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM OrganizationUnit WHERE institutionId = ?',
    [institutionId]
  );
  const byCode = new Map(units.map(unit => [String(unit.code), unit]));

  const required = [
    'EXEC-DIREKSI',
    'DIR-UTAMA',
    'DIR-KEPATUHAN',
    'DIR-PEMASARAN-UUS',
    'DIV-UUS',
    ...Object.keys(CENTRAL_PARENT_MAP).filter(code => code !== 'DIR-UMUM'),
    ...CONVENTIONAL_BRANCH_CODES,
    ...SHARIA_BRANCH_CODES
  ];
  const missing = [...new Set(required)].filter(code => !byCode.has(code));
  if (missing.length > 0) {
    throw new Error(`BANK_KALBAR_ORG_SOURCE_UNITS_MISSING:${missing.join(',')}`);
  }

  const legalEntity = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM LegalEntity WHERE institutionId = ? AND code = ? LIMIT 1',
    [institutionId, 'BANK-KALBAR']
  );
  if (!legalEntity) throw new Error('BANK_KALBAR_LEGAL_ENTITY_NOT_FOUND');

  let directorUmum = byCode.get('DIR-UMUM');
  if (!directorUmum) {
    const id = crypto.randomUUID();
    const now = nowIso();
    await run(
      db,
      `INSERT INTO OrganizationUnit (
        id, institutionId, legalEntityId, parentId, type, code, name,
        headName, headEmail, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)`,
      [
        id,
        institutionId,
        legalEntity.id,
        byCode.get('EXEC-DIREKSI')!.id,
        'Directorate',
        'DIR-UMUM',
        'Direktur Umum',
        null,
        null,
        now,
        now
      ]
    );
    directorUmum = {
      id,
      institutionId,
      legalEntityId: legalEntity.id,
      parentId: byCode.get('EXEC-DIREKSI')!.id,
      type: 'Directorate',
      code: 'DIR-UMUM',
      name: 'Direktur Umum',
      headName: null,
      status: 'Active',
      createdAt: now,
      updatedAt: now
    };
    byCode.set('DIR-UMUM', directorUmum);
  } else {
    await run(
      db,
      'UPDATE OrganizationUnit SET parentId = ?, type = ?, name = ?, status = ?, updatedAt = ? WHERE id = ?',
      [
        byCode.get('EXEC-DIREKSI')!.id,
        'Directorate',
        'Direktur Umum',
        'Active',
        nowIso(),
        directorUmum.id
      ]
    );
  }

  await upsertHierarchyEvidence(
    db,
    institutionId,
    String(directorUmum.id),
    'VERIFIED_FORMAL_POSITION',
    'VERIFIED_PARENT',
    [sourceCentral, sourceManagement],
    'Direktur Umum is a formal structural position in DIR/PP-0003/2026. No incumbent is asserted because the connected current management source does not verify one.'
  );

  for (const [childCode, parentCode] of Object.entries(CENTRAL_PARENT_MAP)) {
    const child = byCode.get(childCode)!;
    const parent = byCode.get(parentCode)!;
    await run(
      db,
      'UPDATE OrganizationUnit SET parentId = ?, updatedAt = ? WHERE id = ?',
      [parent.id, nowIso(), child.id]
    );

    if (childCode === 'FUNC-ICOFR') {
      await upsertHierarchyEvidence(
        db,
        institutionId,
        String(child.id),
        'VERIFIED_GOVERNANCE_FUNCTION',
        'VERIFIED_GOVERNANCE_PARENT',
        [sourceSeraya, sourceIcofr],
        'Fungsi/UKK ICOFR is source-confirmed as a Line-2 governance function. Because DIR/PP-0003/2026 does not draw it as a separate formal structural box, Total ARC uses Direksi as the accountable governance parent and does not invent a specific director reporting line.'
      );
    } else {
      await upsertHierarchyEvidence(
        db,
        institutionId,
        String(child.id),
        'VERIFIED_FORMAL_STRUCTURE',
        'VERIFIED_PARENT',
        [sourceCentral, sourceSeraya],
        'Parent is read from the formal Kantor Pusat organization chart DIR/PP-0003/2026 dated 29 January 2026.'
      );
    }
  }

  for (const branchCode of CONVENTIONAL_BRANCH_CODES) {
    const branch = byCode.get(branchCode)!;
    const direksi = byCode.get('EXEC-DIREKSI')!;
    await run(
      db,
      'UPDATE OrganizationUnit SET parentId = ?, updatedAt = ? WHERE id = ?',
      [direksi.id, nowIso(), branch.id]
    );
    await upsertHierarchyEvidence(
      db,
      institutionId,
      String(branch.id),
      'VERIFIED_CURRENT_OFFICE_AND_FORMAL_CLASS',
      'VERIFIED_COLLEGIAL_PARENT',
      [sourceCentral, sourceBranch, sourceNetwork],
      'The formal Kantor Pusat chart places conventional branch classes on the Direksi-collegial command line. The single-parent data model therefore normalizes the parent to Direksi rather than inventing one director.'
    );
  }

  for (const branchCode of SHARIA_BRANCH_CODES) {
    const branch = byCode.get(branchCode)!;
    const uus = byCode.get('DIV-UUS')!;
    await run(
      db,
      'UPDATE OrganizationUnit SET parentId = ?, updatedAt = ? WHERE id = ?',
      [uus.id, nowIso(), branch.id]
    );
    await upsertHierarchyEvidence(
      db,
      institutionId,
      String(branch.id),
      'VERIFIED_CURRENT_OFFICE',
      'VERIFIED_FUNCTIONAL_PARENT',
      [sourceCentral, sourceNetwork],
      'The formal Kantor Pusat chart places Cabang Syariah under Unit Usaha Syariah.'
    );
  }

  const branchUnits = await all<Record<string, unknown>>(
    db,
    `SELECT id, code, name
     FROM OrganizationUnit
     WHERE institutionId = ? AND code IN (${[...CONVENTIONAL_BRANCH_CODES, ...SHARIA_BRANCH_CODES]
       .map(() => '?')
       .join(',')})`,
    [institutionId, ...CONVENTIONAL_BRANCH_CODES, ...SHARIA_BRANCH_CODES]
  );
  const branchesByCode = new Map(branchUnits.map(branch => [String(branch.code), branch]));
  if (branchesByCode.size !== 23) {
    throw new Error(`BANK_KALBAR_BRANCH_COUNT_EXPECTED_23_GOT_${branchesByCode.size}`);
  }

  for (const branchCode of CONVENTIONAL_BRANCH_CODES) {
    const branch = branchesByCode.get(branchCode)!;
    await run(
      db,
      `INSERT INTO OrganizationBranchExpansion (
        id, institutionId, branchUnitId, branchCode, branchName, structureType,
        nodeCount, structureJson, sourceReferencesJson, status, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(institutionId, branchUnitId) DO UPDATE SET
        branchCode = excluded.branchCode,
        branchName = excluded.branchName,
        structureType = excluded.structureType,
        nodeCount = excluded.nodeCount,
        structureJson = excluded.structureJson,
        sourceReferencesJson = excluded.sourceReferencesJson,
        status = excluded.status,
        updatedAt = excluded.updatedAt`,
      [
        crypto.randomUUID(),
        institutionId,
        branch.id,
        branchCode,
        branch.name,
        'CONVENTIONAL_2026',
        CONVENTIONAL_BRANCH_STRUCTURE.length,
        JSON.stringify(CONVENTIONAL_BRANCH_STRUCTURE),
        JSON.stringify([sourceBranch, sourceCentral, sourceNetwork]),
        'Source Governed',
        nowIso()
      ]
    );
  }

  for (const branchCode of SHARIA_BRANCH_CODES) {
    const branch = branchesByCode.get(branchCode)!;
    await run(
      db,
      `INSERT INTO OrganizationBranchExpansion (
        id, institutionId, branchUnitId, branchCode, branchName, structureType,
        nodeCount, structureJson, sourceReferencesJson, status, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(institutionId, branchUnitId) DO UPDATE SET
        branchCode = excluded.branchCode,
        branchName = excluded.branchName,
        structureType = excluded.structureType,
        nodeCount = excluded.nodeCount,
        structureJson = excluded.structureJson,
        sourceReferencesJson = excluded.sourceReferencesJson,
        status = excluded.status,
        updatedAt = excluded.updatedAt`,
      [
        crypto.randomUUID(),
        institutionId,
        branch.id,
        branchCode,
        branch.name,
        'SHARIA_2026',
        SHARIA_BRANCH_STRUCTURE.length,
        JSON.stringify(SHARIA_BRANCH_STRUCTURE),
        JSON.stringify([sourceCentral, sourceNetwork]),
        'Source Governed',
        nowIso()
      ]
    );
  }

  const summary = {
    formerPendingParentsResolved: 33,
    conventionalBranchesExpanded: CONVENTIONAL_BRANCH_CODES.length,
    shariaBranchesExpanded: SHARIA_BRANCH_CODES.length,
    conventionalNodesPerBranch: CONVENTIONAL_BRANCH_STRUCTURE.length,
    shariaNodesPerBranch: SHARIA_BRANCH_STRUCTURE.length,
    conditionalNodesAreNotActualStaffingClaims: true,
    directorUmumIncumbentAsserted: false,
    dmrkExcluded: true
  };

  await run(
    db,
    `INSERT INTO OrganizationDataMigration (institutionId, migrationCode, completedAt, summaryJson)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(institutionId, migrationCode) DO UPDATE SET
       completedAt = excluded.completedAt,
       summaryJson = excluded.summaryJson`,
    [institutionId, BANK_KALBAR_ORG_MIGRATION, nowIso(), JSON.stringify(summary)]
  );

  await writeAudit(
    db,
    institutionId,
    'OrganizationHierarchy',
    BANK_KALBAR_ORG_MIGRATION,
    summary,
    'Completed source-governed Bank Kalbar parent hierarchy and branch structure expansion.'
  );
}

export async function getOrganizationStructure() {
  const db = await ensureOrganizationSchema();
  const institution = await primaryInstitution(db);

  if (!institution) {
    return {
      institution: null,
      legalEntities: [],
      organizationUnits: [],
      users: []
    };
  }

  await ensureBankKalbarOrganizationCompletion(db, institution);

  const [legalEntities, organizationUnits, hierarchyEvidence, organizationTemplates, branchExpansions] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM LegalEntity WHERE institutionId = ? ORDER BY code ASC, name ASC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM OrganizationUnit WHERE institutionId = ? ORDER BY createdAt ASC, code ASC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM OrganizationHierarchyEvidence WHERE institutionId = ? ORDER BY hierarchyStatus ASC, unitId ASC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM OrganizationStructureTemplate WHERE institutionId = ? AND status = ? ORDER BY templateCode ASC, sortOrder ASC, nodeCode ASC',
      [institution.id, 'Active']
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM OrganizationBranchExpansion WHERE institutionId = ? ORDER BY branchName ASC, branchCode ASC',
      [institution.id]
    )
  ]);

  return {
    institution,
    legalEntities,
    organizationUnits,
    hierarchyEvidence,
    organizationTemplates,
    branchExpansions,
    users: []
  };
}

export async function createLegalEntity(input: LegalEntityInput) {
  const db = await ensureOrganizationSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code || !name) throw new Error('LEGAL_ENTITY_REQUIRED_FIELDS');

  const duplicate = await first(
    db,
    'SELECT id FROM LegalEntity WHERE institutionId = ? AND code = ? LIMIT 1',
    [institution.id, code]
  );
  if (duplicate) throw new Error('LEGAL_ENTITY_CODE_CONFLICT');

  const id = crypto.randomUUID();
  const now = nowIso();
  const country = input.country?.trim() || 'Indonesia';
  const taxId = clean(input.taxId);
  const created = {
    id,
    institutionId: String(institution.id),
    code,
    name,
    country,
    taxId,
    createdAt: now,
    updatedAt: now
  };

  await run(
    db,
    `INSERT INTO LegalEntity (
      id, institutionId, code, name, country, taxId, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      institution.id,
      code,
      name,
      country,
      taxId,
      now,
      now
    ]
  );

  await writeAudit(
    db,
    String(institution.id),
    'LegalEntity',
    id,
    created,
    'Legal entity created through Organization Builder.'
  );

  return created;
}

export async function createOrganizationUnit(input: OrganizationUnitInput) {
  const db = await ensureOrganizationSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  const type = input.type.trim();
  if (!code || !name || !type) throw new Error('ORG_UNIT_REQUIRED_FIELDS');

  const duplicate = await first(
    db,
    'SELECT id FROM OrganizationUnit WHERE institutionId = ? AND code = ? LIMIT 1',
    [institution.id, code]
  );
  if (duplicate) throw new Error('ORG_UNIT_CODE_CONFLICT');

  const legalEntityId = clean(input.legalEntityId);
  if (legalEntityId) {
    const legalEntity = await first(
      db,
      'SELECT id FROM LegalEntity WHERE id = ? AND institutionId = ? LIMIT 1',
      [legalEntityId, institution.id]
    );
    if (!legalEntity) throw new Error('LEGAL_ENTITY_NOT_FOUND');
  }

  const parentId = clean(input.parentId);
  if (parentId) {
    const parent = await first(
      db,
      'SELECT id FROM OrganizationUnit WHERE id = ? AND institutionId = ? LIMIT 1',
      [parentId, institution.id]
    );
    if (!parent) throw new Error('PARENT_UNIT_NOT_FOUND');
  }

  const id = crypto.randomUUID();
  const now = nowIso();
  const headName = clean(input.headName);
  const headEmail = clean(input.headEmail);
  const created = {
    id,
    institutionId: String(institution.id),
    legalEntityId,
    parentId,
    type,
    code,
    name,
    headName,
    headEmail,
    status: 'Active',
    createdAt: now,
    updatedAt: now
  };

  await run(
    db,
    `INSERT INTO OrganizationUnit (
      id, institutionId, legalEntityId, parentId, type, code, name,
      headName, headEmail, status, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)`,
    [
      id,
      institution.id,
      legalEntityId,
      parentId,
      type,
      code,
      name,
      headName,
      headEmail,
      now,
      now
    ]
  );

  await writeAudit(
    db,
    String(institution.id),
    'OrganizationUnit',
    id,
    created,
    'Organization unit created through Organization Builder.'
  );

  return created;
}
