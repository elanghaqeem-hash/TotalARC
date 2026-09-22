import hashlib, json, os, re, subprocess, time
from datetime import datetime, timezone
from pathlib import Path

LEGAL_NAME = "PT. Bank Pembangunan Daerah Kalimantan Barat"
MIGRATION = "BANK_KALBAR_COMPLETE_ORG_20260922"

SOURCES = {
    "central": "AURA:1NWZMKg1JNPZlrd3hyPrwjziqqdx6doEG#DIR/PP-0003/2026 tanggal 29 Januari 2026 Lampiran halaman 11",
    "branch": "AURA:1qGRMYziU7V3Z4HXhUGNx8mFullqaVoFK#DIR/PP-0024/2026 tanggal 9 Juni 2026 Lampiran halaman 14,19-20",
    "seraya": "SERAYA:1PP3k6wnVdYEWQCtxcGtw-dCpmHfjYutf#Daftar Fungsi/Unit Kerja Bank Kalbar",
    "icofr": "SERAYA:1tbpwcCpsYIgAKzp0sSAByS-X8D_vtYaL#Kerangka Metodologi ICOFR 2026",
    "network": "https://bankkalbar.co.id/jaringan_kantor.php",
    "management": "https://bankkalbar.co.id/jajaran_manajemen.php",
}

CENTRAL_PARENT_MAP = {
    "DIV-UUS": "DIR-PEMASARAN-UUS",
    "DIV-TREASURY": "DIR-PEMASARAN-UUS",
    "DIV-KREDIT": "DIR-PEMASARAN-UUS",
    "DIV-CREDIT-RECOVERY": "DIR-PEMASARAN-UUS",
    "DIV-EBANK": "DIR-PEMASARAN-UUS",
    "DIV-TI": "DIR-UMUM",
    "DIV-AKUNTANSI": "DIR-UMUM",
    "DIV-UMUM": "DIR-UMUM",
    "DIV-SDM": "DIR-UMUM",
    "DIV-KEPATUHAN": "DIR-KEPATUHAN",
    "DIV-MR": "DIR-KEPATUHAN",
    "DIV-STRATEGI": "DIR-UTAMA",
    "FUNC-SKAI": "DIR-UTAMA",
    "FUNC-CORSEC": "DIR-UTAMA",
    "FUNC-ICOFR": "EXEC-DIREKSI",
}

CONVENTIONAL = [
    "BR-KCU-PONTIANAK","BR-FLAMBOYAN","BR-KUBU-RAYA","BR-MEMPAWAH",
    "BR-SINGKAWANG","BR-SAMBAS","BR-PEMANGKAT","BR-BENGKAYANG","BR-NGABANG",
    "BR-SANGGAU","BR-BALAI-KARANGAN","BR-SEKADAU","BR-SINTANG","BR-NANGA-PINOH",
    "BR-PUTUSSIBAU","BR-SEMITAU","BR-KETAPANG","BR-SUKADANA","BR-JAKARTA"
]
SHARIA = [
    "BR-SYARIAH-PONTIANAK","BR-SYARIAH-SINGKAWANG",
    "BR-SYARIAH-SAMBAS","BR-SYARIAH-KETAPANG"
]

CONVENTIONAL_STRUCTURE = [
    {"nodeCode":"PEMIMPIN-CABANG","parentNodeCode":None,"type":"Position","name":"Pemimpin Cabang","relationshipType":"Branch leadership","conditional":False},
    {"nodeCode":"WAKIL-PEMIMPIN","parentNodeCode":"PEMIMPIN-CABANG","type":"Position","name":"Wakil Pemimpin Cabang","relationshipType":"Direct","conditional":True},
    {"nodeCode":"KCP","parentNodeCode":"PEMIMPIN-CABANG","type":"Office","name":"Kantor Cabang Pembantu","relationshipType":"Direct","conditional":True},
    {"nodeCode":"UUM","parentNodeCode":"PEMIMPIN-CABANG","type":"Unit","name":"Unit Usaha Mikro","relationshipType":"Direct","conditional":True},
    {"nodeCode":"SEKSI-KREDIT","parentNodeCode":"PEMIMPIN-CABANG","type":"Unit","name":"Seksi Kredit","relationshipType":"Direct","conditional":True},
    {"nodeCode":"SEKSI-PENAGIHAN","parentNodeCode":"PEMIMPIN-CABANG","type":"Unit","name":"Seksi Penagihan & Pemulihan Kredit","relationshipType":"Direct","conditional":True},
    {"nodeCode":"SEKSI-PENGHIMPUNAN","parentNodeCode":"PEMIMPIN-CABANG","type":"Unit","name":"Seksi Penghimpunan Dana","relationshipType":"Direct","conditional":True},
    {"nodeCode":"SEKSI-UMUM","parentNodeCode":"PEMIMPIN-CABANG","type":"Unit","name":"Seksi Umum dan Personalia","relationshipType":"Direct","conditional":True},
    {"nodeCode":"KCP-KAS","parentNodeCode":"PEMIMPIN-CABANG","type":"Office","name":"Kantor Cabang Pembantu Kas","relationshipType":"Direct","conditional":True},
    {"nodeCode":"KCP-KELILING","parentNodeCode":"PEMIMPIN-CABANG","type":"Office","name":"Kantor Cabang Pembantu Keliling","relationshipType":"Direct","conditional":True},
    {"nodeCode":"SEKSI-PELAYANAN","parentNodeCode":"PEMIMPIN-CABANG","type":"Unit","name":"Seksi Pelayanan Nasabah","relationshipType":"Indirect supervision","conditional":True},
    {"nodeCode":"SEKSI-AKUNTANSI","parentNodeCode":"PEMIMPIN-CABANG","type":"Unit","name":"Seksi Akuntansi","relationshipType":"Indirect supervision","conditional":True},
    {"nodeCode":"KONTROL-INTERN","parentNodeCode":None,"type":"Control Function","name":"Kontrol Intern Cabang","relationshipType":"Control line","conditional":False},
]
SHARIA_STRUCTURE = [
    {"nodeCode":"CABANG-PEMBANTU-SYARIAH","parentNodeCode":None,"type":"Office","name":"Cabang Pembantu Syariah","relationshipType":"Network child","conditional":True},
    {"nodeCode":"KANTOR-KAS-SYARIAH","parentNodeCode":None,"type":"Office","name":"Kantor Kas Syariah","relationshipType":"Network child","conditional":True},
    {"nodeCode":"KAS-MOBIL-SYARIAH","parentNodeCode":None,"type":"Office","name":"Kas Mobil Syariah","relationshipType":"Network child","conditional":True},
    {"nodeCode":"LAYANAN-SYARIAH","parentNodeCode":None,"type":"Service","name":"Layanan Syariah","relationshipType":"Network child","conditional":True},
]

def wr(args, retries=5):
    last = None
    for attempt in range(retries):
        p = subprocess.run(["npx","wrangler",*args], text=True, env=os.environ, capture_output=True)
        if p.returncode == 0:
            return p.stdout
        last = p
        time.sleep(2 + attempt * 2)
    print(last.stdout[-4000:] if last else "")
    print(last.stderr[-4000:] if last else "")
    raise RuntimeError("WRANGLER_COMMAND_FAILED")

dbs = json.loads(wr(["d1","list","--json"]))
db = next((x for x in dbs if re.search(r"total.?arc", x["name"], re.I)), None)
if not db:
    db = dbs[0] if len(dbs) == 1 else None
if not db:
    raise RuntimeError("TOTAL_ARC_D1_NOT_FOUND")
DB = db["name"]

def rows(sql):
    raw = json.loads(wr(["d1","execute",DB,"--remote","--json","--command",sql]))
    raw = raw if isinstance(raw, list) else [raw]
    return [r for block in raw for r in (block.get("results") or [])]

def q(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'","''") + "'"

def execute(sql, filename="/tmp/totalarc_complete_org.sql"):
    Path(filename).write_text(sql)
    wr(["d1","execute",DB,"--remote","--file",filename])

def hid(*parts):
    return hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()[:40]

now = datetime.now(timezone.utc).isoformat().replace("+00:00","Z")

execute("""
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
""", "/tmp/complete_org_ddl.sql")

inst = rows("SELECT * FROM Institution WHERE legalName="+q(LEGAL_NAME)+" LIMIT 1")
if len(inst) != 1:
    raise RuntimeError("BANK_KALBAR_INSTITUTION_NOT_FOUND")
institution_id = str(inst[0]["id"])

entity = rows("SELECT id FROM LegalEntity WHERE institutionId="+q(institution_id)+" AND code='BANK-KALBAR' LIMIT 1")
if len(entity) != 1:
    raise RuntimeError("BANK_KALBAR_LEGAL_ENTITY_NOT_FOUND")
entity_id = str(entity[0]["id"])

units = rows("SELECT * FROM OrganizationUnit WHERE institutionId="+q(institution_id))
by_code = {str(x["code"]): x for x in units}
required = set(CENTRAL_PARENT_MAP.keys()) | set(CENTRAL_PARENT_MAP.values()) | set(CONVENTIONAL) | set(SHARIA)
required.discard("DIR-UMUM")
missing = sorted(code for code in required if code not in by_code)
if missing:
    raise RuntimeError("BANK_KALBAR_REQUIRED_UNITS_MISSING_"+",".join(missing))

direksi_id = str(by_code["EXEC-DIREKSI"]["id"])
existing_du = by_code.get("DIR-UMUM")
dir_umum_id = str(existing_du["id"]) if existing_du else hid(institution_id,"DIR-UMUM","ORG-UNIT")
created_at = str(existing_du.get("createdAt") or now) if existing_du else now

execute(f"""
INSERT INTO OrganizationUnit
(id,institutionId,legalEntityId,parentId,type,code,name,headName,headEmail,status,createdAt,updatedAt)
VALUES({q(dir_umum_id)},{q(institution_id)},{q(entity_id)},{q(direksi_id)},'Directorate','DIR-UMUM','Direktur Umum',
NULL,NULL,'Active',{q(created_at)},{q(now)})
ON CONFLICT(institutionId,code) DO UPDATE SET
  legalEntityId=excluded.legalEntityId,
  parentId=excluded.parentId,
  type=excluded.type,
  name=excluded.name,
  status='Active',
  updatedAt=excluded.updatedAt;
""", "/tmp/complete_org_dir_umum.sql")

units = rows("SELECT * FROM OrganizationUnit WHERE institutionId="+q(institution_id))
by_code = {str(x["code"]): x for x in units}

updates = []
for child, parent in CENTRAL_PARENT_MAP.items():
    updates.append(
        "UPDATE OrganizationUnit SET parentId="+q(str(by_code[parent]["id"]))+
        ",updatedAt="+q(now)+" WHERE institutionId="+q(institution_id)+" AND code="+q(child)+";"
    )
for code in CONVENTIONAL:
    updates.append(
        "UPDATE OrganizationUnit SET parentId="+q(direksi_id)+
        ",updatedAt="+q(now)+" WHERE institutionId="+q(institution_id)+" AND code="+q(code)+";"
    )
for code in SHARIA:
    updates.append(
        "UPDATE OrganizationUnit SET parentId="+q(str(by_code["DIV-UUS"]["id"]))+
        ",updatedAt="+q(now)+" WHERE institutionId="+q(institution_id)+" AND code="+q(code)+";"
    )
execute("\n".join(updates), "/tmp/complete_org_parents.sql")

def evidence_sql(code, source_status, hierarchy_status, refs, note):
    unit_id = str(by_code[code]["id"]) if code in by_code else dir_umum_id
    return f"""
INSERT INTO OrganizationHierarchyEvidence
(unitId,institutionId,sourceStatus,hierarchyStatus,sourceReferencesJson,sourceNote,asOfDate,updatedAt)
VALUES({q(unit_id)},{q(institution_id)},{q(source_status)},{q(hierarchy_status)},
{q(json.dumps(refs,ensure_ascii=False,separators=(",",":")))},{q(note)},'2026-09-22',{q(now)})
ON CONFLICT(unitId) DO UPDATE SET
sourceStatus=excluded.sourceStatus,
hierarchyStatus=excluded.hierarchyStatus,
sourceReferencesJson=excluded.sourceReferencesJson,
sourceNote=excluded.sourceNote,
asOfDate=excluded.asOfDate,
updatedAt=excluded.updatedAt;
"""

evidence = [
    evidence_sql(
        "DIR-UMUM","VERIFIED_FORMAL_POSITION","VERIFIED_PARENT",
        [SOURCES["central"],SOURCES["management"]],
        "Direktur Umum is a formal structural position in DIR/PP-0003/2026. No incumbent is asserted because the current management source does not verify one."
    )
]
for child in CENTRAL_PARENT_MAP:
    if child == "FUNC-ICOFR":
        evidence.append(evidence_sql(
            child,"VERIFIED_GOVERNANCE_FUNCTION","VERIFIED_GOVERNANCE_PARENT",
            [SOURCES["seraya"],SOURCES["icofr"]],
            "Fungsi/UKK ICOFR is source-confirmed as a Line-2 governance function. Total ARC normalizes its accountable parent to Direksi without inventing a specific director reporting line."
        ))
    else:
        evidence.append(evidence_sql(
            child,"VERIFIED_FORMAL_STRUCTURE","VERIFIED_PARENT",
            [SOURCES["central"],SOURCES["seraya"]],
            "Parent is supported by the formal Kantor Pusat organization chart DIR/PP-0003/2026 dated 29 January 2026."
        ))
for code in CONVENTIONAL:
    evidence.append(evidence_sql(
        code,"VERIFIED_CURRENT_OFFICE_AND_FORMAL_CLASS","VERIFIED_COLLEGIAL_PARENT",
        [SOURCES["central"],SOURCES["branch"],SOURCES["network"]],
        "The formal Kantor Pusat chart places conventional branch classes on the Direksi-collegial line. The single-parent model normalizes this to Direksi rather than assigning an unsupported single director."
    ))
for code in SHARIA:
    evidence.append(evidence_sql(
        code,"VERIFIED_CURRENT_OFFICE","VERIFIED_FUNCTIONAL_PARENT",
        [SOURCES["central"],SOURCES["network"]],
        "The formal Kantor Pusat chart places Cabang Syariah under Unit Usaha Syariah."
    ))
execute("\n".join(evidence), "/tmp/complete_org_evidence.sql")

branches = rows(
    "SELECT id,code,name FROM OrganizationUnit WHERE institutionId="+q(institution_id)+
    " AND code IN ("+",".join(q(x) for x in CONVENTIONAL+SHARIA)+")"
)
by_branch = {str(x["code"]): x for x in branches}
if len(by_branch) != 23:
    raise RuntimeError("BANK_KALBAR_BRANCH_COUNT_"+str(len(by_branch))+"_EXPECTED_23")

expansion_sql = []
for code in CONVENTIONAL:
    branch = by_branch[code]
    expansion_sql.append(f"""
INSERT INTO OrganizationBranchExpansion
(id,institutionId,branchUnitId,branchCode,branchName,structureType,nodeCount,structureJson,sourceReferencesJson,status,updatedAt)
VALUES({q(hid(institution_id,code,"BRANCH-EXPANSION"))},{q(institution_id)},{q(branch["id"])},{q(code)},{q(branch["name"])},
'CONVENTIONAL_2026',{len(CONVENTIONAL_STRUCTURE)},
{q(json.dumps(CONVENTIONAL_STRUCTURE,ensure_ascii=False,separators=(",",":")))},
{q(json.dumps([SOURCES["branch"],SOURCES["central"],SOURCES["network"]],ensure_ascii=False,separators=(",",":")))},
'Source Governed',{q(now)})
ON CONFLICT(institutionId,branchUnitId) DO UPDATE SET
branchCode=excluded.branchCode,
branchName=excluded.branchName,
structureType=excluded.structureType,
nodeCount=excluded.nodeCount,
structureJson=excluded.structureJson,
sourceReferencesJson=excluded.sourceReferencesJson,
status=excluded.status,
updatedAt=excluded.updatedAt;
""")
for code in SHARIA:
    branch = by_branch[code]
    expansion_sql.append(f"""
INSERT INTO OrganizationBranchExpansion
(id,institutionId,branchUnitId,branchCode,branchName,structureType,nodeCount,structureJson,sourceReferencesJson,status,updatedAt)
VALUES({q(hid(institution_id,code,"BRANCH-EXPANSION"))},{q(institution_id)},{q(branch["id"])},{q(code)},{q(branch["name"])},
'SHARIA_2026',{len(SHARIA_STRUCTURE)},
{q(json.dumps(SHARIA_STRUCTURE,ensure_ascii=False,separators=(",",":")))},
{q(json.dumps([SOURCES["central"],SOURCES["network"]],ensure_ascii=False,separators=(",",":")))},
'Source Governed',{q(now)})
ON CONFLICT(institutionId,branchUnitId) DO UPDATE SET
branchCode=excluded.branchCode,
branchName=excluded.branchName,
structureType=excluded.structureType,
nodeCount=excluded.nodeCount,
structureJson=excluded.structureJson,
sourceReferencesJson=excluded.sourceReferencesJson,
status=excluded.status,
updatedAt=excluded.updatedAt;
""")
execute("\n".join(expansion_sql), "/tmp/complete_org_expansions.sql")

summary = {
    "formerPendingParentsResolved": 33,
    "centralFormalParentMappings": 14,
    "conventionalBranchesNormalizedToDireksi": 19,
    "shariaBranchesUnderUUS": 4,
    "branchExpansions": 23,
    "conventionalNodesPerBranch": len(CONVENTIONAL_STRUCTURE),
    "shariaNodesPerBranch": len(SHARIA_STRUCTURE),
    "conditionalNodesAreNotActualStaffingClaims": True,
    "directorUmumIncumbentAsserted": False,
    "dmrkExcluded": True,
}
execute(f"""
INSERT INTO OrganizationDataMigration(institutionId,migrationCode,completedAt,summaryJson)
VALUES({q(institution_id)},{q(MIGRATION)},{q(now)},{q(json.dumps(summary,ensure_ascii=False,separators=(",",":")))})
ON CONFLICT(institutionId,migrationCode) DO UPDATE SET
completedAt=excluded.completedAt,
summaryJson=excluded.summaryJson;
""", "/tmp/complete_org_marker.sql")

pending = rows(
    "SELECT COUNT(*) AS n FROM OrganizationHierarchyEvidence WHERE institutionId="+q(institution_id)+
    " AND hierarchyStatus='PENDING_PARENT'"
)
expansions = rows(
    "SELECT COUNT(*) AS n FROM OrganizationBranchExpansion WHERE institutionId="+q(institution_id)
)
dmrk = rows(
    "SELECT COUNT(*) AS n FROM OrganizationUnit WHERE institutionId="+q(institution_id)+
    " AND (lower(name) LIKE '%direktorat manajemen risiko dan kepatuhan%' OR code='DIR-MR-KEPATUHAN')"
)
snapshot = rows(
    "SELECT c.code,c.name,p.code AS parentCode,p.name AS parentName,e.hierarchyStatus "
    "FROM OrganizationUnit c LEFT JOIN OrganizationUnit p ON p.id=c.parentId "
    "LEFT JOIN OrganizationHierarchyEvidence e ON e.unitId=c.id "
    "WHERE c.institutionId="+q(institution_id)+
    " AND c.code IN ("+",".join(q(x) for x in list(CENTRAL_PARENT_MAP.keys())+CONVENTIONAL+SHARIA+["DIR-UMUM"])+") "
    "ORDER BY c.code"
)

result = {
    "institutionId": institution_id,
    "pendingParentCount": int(pending[0]["n"]),
    "branchExpansionCount": int(expansions[0]["n"]),
    "dmrkCount": int(dmrk[0]["n"]),
    "summary": summary,
    "snapshot": snapshot,
}
print("=== BANK KALBAR COMPLETE ORGANIZATION PROMOTION ===")
print(json.dumps(result, indent=2, ensure_ascii=False))

if result["pendingParentCount"] != 0:
    raise RuntimeError("PENDING_PARENT_REMAINS_"+str(result["pendingParentCount"]))
if result["branchExpansionCount"] != 23:
    raise RuntimeError("BRANCH_EXPANSION_COUNT_"+str(result["branchExpansionCount"]))
if result["dmrkCount"] != 0:
    raise RuntimeError("REMOVED_DMRK_REAPPEARED")
