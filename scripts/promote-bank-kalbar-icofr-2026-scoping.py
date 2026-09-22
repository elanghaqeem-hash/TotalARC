import base64
import gzip
import hashlib
import json
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

LEGAL_NAME = "PT. Bank Pembangunan Daerah Kalimantan Barat"
SCOPE_NAME = "Bank Kalbar ICOFR Tahun Buku 2026"
BATCH = "BANK_KALBAR_ICOFR_SCOPING_2026_20260923_6FILES"

ROOT = Path(__file__).resolve().parents[1]
META_PATH = ROOT / "data" / "bank-kalbar-icofr-scoping-2026-meta.json"
DATA_PATH = ROOT / "data" / "bank-kalbar-icofr-scoping-2026-data.json.gz.b64"

PROCESS_ALIASES = {
    "P-01": ["Dana Pihak Ketiga", "DPK", "Penghimpunan Dana Masyarakat"],
    "P-02": ["Perkreditan", "Kredit", "Penyaluran Dana", "Penyaluran Kredit"],
    "P-03": ["Unit Usaha Syariah", "UUS", "Pembiayaan Syariah"],
    "P-04": ["Treasury", "Tresuri", "Penempatan", "Surat Berharga"],
    "P-05": ["CKPN", "Cadangan Kerugian Penurunan Nilai", "Expected Credit Loss"],
    "P-06": ["Perpajakan", "Pajak"],
    "P-07": ["Pelaporan", "Tutup Buku", "Rekonsiliasi"],
    "P-08": ["Otomatisasi Pendapatan Bunga", "Otomatisasi Beban Bunga", "Otomatisasi Bunga", "Bunga"],
    "P-09": ["Pengadaan Barang dan Jasa", "Pengadaan", "Aset Tetap"],
    "P-10": ["Penggajian", "Payroll", "SDM"],
    "P-11": ["Jasa dan Layanan Nasabah", "Pelayanan Nasabah", "Pendapatan Berbasis Komisi"],
    "P-12": ["Kepatuhan", "AML", "APU PPT", "Know Your Customer"],
    "P-13": ["Teknologi Informasi", "ITGC", "Information Technology General Control"],
    "P-14": ["Manajemen Risiko Operasional", "Risiko Operasional"],
    "P-15": ["Pengelolaan Ekuitas dan Aksi Korporasi", "Ekuitas", "Aksi Korporasi"],
    "P-16": ["Komitmen Kontinjensi", "Komitmen, Kontinjensi, dan Bank Garansi", "Bank Garansi"],
}


def load_sources():
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    compressed = base64.b64decode(DATA_PATH.read_text(encoding="utf-8").strip())
    payload = json.loads(gzip.decompress(compressed).decode("utf-8"))
    accounts = payload.get("accounts") or payload.get("financialItems") or []
    processes = payload.get("processes") or payload.get("businessProcesses") or []
    applications = payload.get("applications") or payload.get("systems") or []
    if len(accounts) != 52:
        raise RuntimeError(f"SOURCE_ACCOUNT_COUNT_{len(accounts)}_EXPECTED_52")
    if len(processes) != 16:
        raise RuntimeError(f"SOURCE_PROCESS_COUNT_{len(processes)}_EXPECTED_16")
    if len(applications) != 62:
        raise RuntimeError(f"SOURCE_APPLICATION_COUNT_{len(applications)}_EXPECTED_62")
    return meta, payload, accounts, processes, applications


META, PAYLOAD, ACCOUNTS, PROCESSES, APPLICATIONS = load_sources()
MAT = META["materiality"]
POPS = META["populations"]
ISSUES = META["issues"]
SOURCE_FILES = META["sources"]
SOURCE_REFERENCE = "USER_UPLOAD_6_FILES_20260923"
now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def wr(args, retries=5):
    last = None
    for attempt in range(retries):
        proc = subprocess.run(
            ["npx", "wrangler", *args],
            text=True,
            env=os.environ,
            capture_output=True,
        )
        if proc.returncode == 0:
            return proc.stdout
        last = proc
        time.sleep(2 + attempt * 2)
    print((last.stdout if last else "")[-5000:])
    print((last.stderr if last else "")[-5000:])
    raise RuntimeError("WRANGLER_COMMAND_FAILED")


dbs = json.loads(wr(["d1", "list", "--json"]))
dbinfo = next((x for x in dbs if re.search(r"total.?arc", x["name"], re.I)), None)
if not dbinfo:
    dbinfo = dbs[0] if len(dbs) == 1 else None
if not dbinfo:
    raise RuntimeError("TOTAL_ARC_D1_NOT_FOUND")
DB = dbinfo["name"]


def rows(sql):
    raw = json.loads(wr(["d1", "execute", DB, "--remote", "--json", "--command", sql]))
    raw = raw if isinstance(raw, list) else [raw]
    return [r for block in raw for r in (block.get("results") or [])]


def q(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def hid(*parts):
    return hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()[:40]


def execute(sql, path="/tmp/icofr_scoping.sql"):
    Path(path).write_text(sql, encoding="utf-8")
    wr(["d1", "execute", DB, "--remote", "--file", path])


def norm(value):
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def bool_int(value):
    return 1 if bool(value) else 0


def amount(value):
    if value is None or value == "":
        return None
    return int(round(float(value)))


DDL = """
CREATE TABLE IF NOT EXISTS ICOFRScope (
  id TEXT PRIMARY KEY NOT NULL,
  institutionId TEXT NOT NULL,
  scopeName TEXT NOT NULL,
  fiscalYear INTEGER NOT NULL,
  reportingPeriod TEXT NOT NULL,
  currency TEXT NOT NULL,
  consolidationBasis TEXT NOT NULL,
  accountingFramework TEXT,
  benchmarkType TEXT NOT NULL,
  benchmarkAmount REAL NOT NULL,
  overallMaterialityPercent REAL NOT NULL,
  overallMaterialityAmount REAL NOT NULL,
  performanceMaterialityPercent REAL NOT NULL,
  performanceMaterialityAmount REAL NOT NULL,
  clearlyTrivialPercent REAL,
  clearlyTrivialAmount REAL,
  componentMaterialityAmount REAL,
  scopeApproach TEXT NOT NULL,
  quantitativeCriteria TEXT,
  qualitativeCriteria TEXT,
  exclusions TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  preparedBy TEXT NOT NULL,
  reviewedBy TEXT,
  approvedBy TEXT,
  notes TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_icofr_scope_institution ON ICOFRScope(institutionId);
CREATE INDEX IF NOT EXISTS idx_icofr_scope_year_period ON ICOFRScope(fiscalYear,reportingPeriod);

CREATE TABLE IF NOT EXISTS ICOFRScopeItem (
  id TEXT PRIMARY KEY NOT NULL,
  scopeId TEXT NOT NULL,
  itemType TEXT NOT NULL,
  sourceId TEXT,
  code TEXT,
  name TEXT NOT NULL,
  inScope INTEGER NOT NULL DEFAULT 1,
  amount REAL,
  rationale TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_icofr_scope_item_scope ON ICOFRScopeItem(scopeId);
CREATE INDEX IF NOT EXISTS idx_icofr_scope_item_source ON ICOFRScopeItem(sourceId);

CREATE TABLE IF NOT EXISTS ICOFRScopeParameter (
  id TEXT PRIMARY KEY NOT NULL,
  scopeId TEXT NOT NULL,
  parameterCode TEXT NOT NULL,
  label TEXT NOT NULL,
  numericValue REAL,
  percentValue REAL,
  formula TEXT,
  basis TEXT,
  status TEXT NOT NULL,
  sourceReference TEXT NOT NULL,
  sourceNote TEXT,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  updatedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_scope_parameter_code
  ON ICOFRScopeParameter(scopeId,parameterCode);

CREATE TABLE IF NOT EXISTS ICOFRScopingPopulationSummary (
  id TEXT PRIMARY KEY NOT NULL,
  scopeId TEXT NOT NULL,
  populationType TEXT NOT NULL,
  assessedCount INTEGER,
  significantCount INTEGER,
  quantitativeSignificantCount INTEGER,
  qualitativeOnlyCount INTEGER,
  notSignificantCount INTEGER,
  sourceStatus TEXT NOT NULL,
  sourceReference TEXT NOT NULL,
  sourceNote TEXT,
  updatedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_population_scope_type
  ON ICOFRScopingPopulationSummary(scopeId,populationType);

CREATE TABLE IF NOT EXISTS ICOFRScopeItemMetadata (
  scopeItemId TEXT PRIMARY KEY NOT NULL,
  scopeId TEXT NOT NULL,
  sourceKey TEXT,
  sourceConclusion TEXT,
  decisionStatus TEXT NOT NULL,
  sourceReference TEXT NOT NULL,
  payloadJson TEXT,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_icofr_scope_item_meta_scope
  ON ICOFRScopeItemMetadata(scopeId);
CREATE INDEX IF NOT EXISTS idx_icofr_scope_item_meta_key
  ON ICOFRScopeItemMetadata(scopeId,sourceKey);

CREATE TABLE IF NOT EXISTS ICOFRScopeLink (
  id TEXT PRIMARY KEY NOT NULL,
  scopeId TEXT NOT NULL,
  fromItemId TEXT NOT NULL,
  toItemId TEXT NOT NULL,
  relationType TEXT NOT NULL,
  sourceReference TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_scope_link_unique
  ON ICOFRScopeLink(scopeId,fromItemId,toItemId,relationType);

CREATE TABLE IF NOT EXISTS ICOFRScopingIssue (
  id TEXT PRIMARY KEY NOT NULL,
  scopeId TEXT NOT NULL,
  issueCode TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  description TEXT NOT NULL,
  activeDecision TEXT,
  affectedJson TEXT,
  sourceReference TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_scope_issue_code
  ON ICOFRScopingIssue(scopeId,issueCode);

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
  ON ICOFRFinancialItem(institutionId,recordType,itemCode);

CREATE TABLE IF NOT EXISTS OperationalDataFeedRun (
  id TEXT PRIMARY KEY NOT NULL,
  institutionId TEXT NOT NULL,
  batchCode TEXT NOT NULL,
  module TEXT NOT NULL,
  sourceRole TEXT NOT NULL,
  sourceReferencesJson TEXT NOT NULL,
  recordsUpserted INTEGER NOT NULL,
  status TEXT NOT NULL,
  summaryJson TEXT,
  completedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_operational_feed_batch
  ON OperationalDataFeedRun(institutionId,batchCode);

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
"""
execute(DDL, "/tmp/icofr_scoping_ddl.sql")

inst = rows("SELECT * FROM Institution WHERE legalName=" + q(LEGAL_NAME) + " LIMIT 1")
if len(inst) != 1:
    raise RuntimeError("BANK_KALBAR_INSTITUTION_NOT_FOUND")
iid = str(inst[0]["id"])

entity = rows("SELECT id,code,name FROM LegalEntity WHERE institutionId=" + q(iid) + " AND code='BANK-KALBAR' LIMIT 1")
if len(entity) != 1:
    raise RuntimeError("BANK_KALBAR_ENTITY_NOT_FOUND")

existing = rows("SELECT * FROM ICOFRScope WHERE institutionId=" + q(iid) + " AND fiscalYear=2026 AND scopeName=" + q(SCOPE_NAME) + " LIMIT 1")
scope_id = str(existing[0]["id"]) if existing else hid(iid, "ICOFR-SCOPE", "2026")
created_at = str(existing[0].get("createdAt") or now) if existing else now

benchmark = int(round(float(MAT["benchmarkAmount"])))
om_pct = float(MAT["overallMaterialityPercent"])
om_amt = int(round(float(MAT["overallMaterialityAmount"])))
pm_pct = float(MAT["performanceMaterialityPercent"])
pm_amt = int(round(float(MAT["performanceMaterialityAmount"])))
trivial_pct = float(MAT["clearlyTrivialPercentOfPm"])
trivial_amt = int(round(float(MAT["clearlyTrivialAmount"])))
tolerance_haircut = float(MAT["toleranceHaircutPercent"])
tolerable = int(round(float(MAT["tolerableThresholdAmount"])))

quant_criteria = (
    "Scoping FSLI menggunakan hasil klasifikasi pada workbook Daftar Akun Signifikan v10. "
    "Populasi 52: 36 signifikan kuantitatif, 1 signifikan kualitatif, "
    "1 borderline yang tetap provisionally in-scope, dan 14 tidak signifikan. "
    "Lokasi Bank Kalbar adalah single entity dengan cakupan 100%."
)
qual_criteria = (
    "Faktor kualitatif mengikuti workbook scoping sumber, termasuk kerentanan salah saji/fraud, "
    "volume dan kompleksitas, judgment/estimasi, kewajiban kontinjensi, pihak berelasi, "
    "perubahan akun/pengungkapan, serta relevansi regulasi dan sistem."
)
notes = (
    "FY2026 scoping diperbarui hanya dari enam file pengguna tanggal 23-09-2026 dan artefak scoping sebelumnya. "
    "Workbook materialitas v9 menjadi sumber aktif OM/PM: normalized PBT 3 tahun, "
    "OM Rp31.904.933.333 dan PM Rp15.952.466.667. Nilai OM Rp33.669.050.000 pada tracker permintaan data "
    "dipertahankan sebagai source conflict, bukan sebagai nilai aktif. Populasi proses lengkap 16/16. "
    "Aplikasi tetap Under Review/Revalidation karena daftar formal dan volume/nilai transaksi aktual belum diterima."
)

scope_sql = f"""
INSERT INTO ICOFRScope(
 id,institutionId,scopeName,fiscalYear,reportingPeriod,currency,consolidationBasis,
 accountingFramework,benchmarkType,benchmarkAmount,overallMaterialityPercent,
 overallMaterialityAmount,performanceMaterialityPercent,performanceMaterialityAmount,
 clearlyTrivialPercent,clearlyTrivialAmount,componentMaterialityAmount,scopeApproach,
 quantitativeCriteria,qualitativeCriteria,exclusions,status,preparedBy,reviewedBy,
 approvedBy,notes,createdAt,updatedAt
) VALUES(
 {q(scope_id)},{q(iid)},{q(SCOPE_NAME)},2026,'Annual','IDR','Standalone',
 'PSAK / OJK reporting',{q(MAT['benchmarkType'])},{benchmark},{om_pct},{om_amt},
 {pm_pct},{pm_amt},{trivial_pct},{trivial_amt},NULL,
 'Top-down risk-based',{q(quant_criteria)},{q(qual_criteria)},
 {q("Tidak ada proses dari daftar P-01 s.d. P-16 yang dikeluarkan. Aplikasi berstatus source Tidak Signifikan tetap out-of-scope kecuali provisional in-scope yang telah ditetapkan pada artefak scoping sebelumnya; seluruh pengecualian aplikasi direview melalui issue register.")},
 'Under Review',{q(MAT.get('preparedBy') or 'Task Force ICOFR Bank Kalbar')},
 {q(' / '.join(x for x in [MAT.get('reviewer1'), MAT.get('reviewer2')] if x))},
 NULL,{q(notes)},{q(created_at)},{q(now)}
)
ON CONFLICT(id) DO UPDATE SET
 scopeName=excluded.scopeName,fiscalYear=2026,reportingPeriod='Annual',currency='IDR',
 consolidationBasis='Standalone',accountingFramework=excluded.accountingFramework,
 benchmarkType=excluded.benchmarkType,benchmarkAmount=excluded.benchmarkAmount,
 overallMaterialityPercent=excluded.overallMaterialityPercent,
 overallMaterialityAmount=excluded.overallMaterialityAmount,
 performanceMaterialityPercent=excluded.performanceMaterialityPercent,
 performanceMaterialityAmount=excluded.performanceMaterialityAmount,
 clearlyTrivialPercent=excluded.clearlyTrivialPercent,
 clearlyTrivialAmount=excluded.clearlyTrivialAmount,
 scopeApproach=excluded.scopeApproach,quantitativeCriteria=excluded.quantitativeCriteria,
 qualitativeCriteria=excluded.qualitativeCriteria,exclusions=excluded.exclusions,
 status='Under Review',preparedBy=excluded.preparedBy,reviewedBy=excluded.reviewedBy,
 approvedBy=NULL,notes=excluded.notes,updatedAt=excluded.updatedAt;
"""
execute(scope_sql, "/tmp/icofr_scope.sql")

managed_prefixes = ["SC-", "FSLI-", "APP-", "LOC-", "LE-", "P-"]
execute(
    "DELETE FROM ICOFRScopeItem WHERE scopeId=" + q(scope_id)
    + " AND (" + " OR ".join("code LIKE " + q(p + "%") for p in managed_prefixes) + ");",
    "/tmp/icofr_scope_cleanup.sql",
)
execute(
    "DELETE FROM ICOFRScopeItemMetadata WHERE scopeId=" + q(scope_id) + ";"
    "DELETE FROM ICOFRScopeLink WHERE scopeId=" + q(scope_id) + ";"
    "DELETE FROM ICOFRScopingIssue WHERE scopeId=" + q(scope_id) + ";"
    "DELETE FROM ICOFRScopeParameter WHERE scopeId=" + q(scope_id) + ";"
    "DELETE FROM ICOFRScopingPopulationSummary WHERE scopeId=" + q(scope_id) + ";",
    "/tmp/icofr_scoping_meta_cleanup.sql",
)
execute("DELETE FROM ICOFRFinancialItem WHERE institutionId=" + q(iid) + " AND itemCode LIKE 'FSLI-%';", "/tmp/icofr_financial_cleanup.sql")

bp_rows = rows("SELECT id,processId,name,level FROM BusinessProcess WHERE institutionId=" + q(iid) + " ORDER BY level,processId")


def best_process(process):
    aliases = [process.get("name"), process.get("code")] + PROCESS_ALIASES.get(process.get("code"), [])
    scored = []
    for row in bp_rows:
        n = norm(row.get("name"))
        pid = norm(row.get("processId"))
        score = 0
        for alias in aliases:
            a = norm(alias)
            if not a:
                continue
            if n == a or pid == a:
                score = max(score, 100)
            elif a in n or n in a:
                score = max(score, 80)
            else:
                overlap = len(set(a.split()) & set(n.split()))
                if overlap:
                    score = max(score, overlap * 10)
        if score:
            scored.append((score, -int(row.get("level") or 0), row))
    if not scored:
        return None
    scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return scored[0][2]


scope_items = []
metadata = []
account_item_ids = {}
process_item_ids = {}
application_item_ids = {}


def add_item(item_type, code, name, in_scope, rationale, source_id=None, item_amount=None,
             source_key=None, source_conclusion=None, decision_status="SOURCE_CONFIRMED",
             payload=None, source_reference=SOURCE_REFERENCE):
    item_id = hid(scope_id, "SCOPEITEM", item_type, code)
    scope_items.append({
        "id": item_id, "itemType": item_type, "sourceId": source_id, "code": code,
        "name": name, "inScope": bool_int(in_scope), "amount": item_amount, "rationale": rationale,
    })
    metadata.append({
        "scopeItemId": item_id, "sourceKey": source_key, "sourceConclusion": source_conclusion,
        "decisionStatus": decision_status, "sourceReference": source_reference,
        "payloadJson": json.dumps(payload or {}, ensure_ascii=False, separators=(",", ":")),
    })
    return item_id


add_item("Legal Entity", "LE-BANK-KALBAR", str(entity[0]["name"]), True,
         "Bank Kalbar is a single legal entity; location coverage is 100%.",
         source_id=str(entity[0]["id"]), source_key="BANK-KALBAR", source_conclusion="In Scope",
         decision_status="FINAL_SINGLE_ENTITY", payload={"coveragePercent": 100})
add_item("Other", "LOC-100-PCT", "Lokasi - 100% Bank Kalbar (single entity)", True,
         "Single-entity scoping; location coverage 100%.", source_key="LOCATION-100",
         source_conclusion="In Scope", decision_status="FINAL_100_PERCENT_COVERAGE",
         payload={"coveragePercent": 100})
add_item("Other", "SC-ELC", "Entity Level Control", True,
         "ELC remains part of the ICOFR scoping perimeter and is separate from the 16 process-level cycles.",
         source_key="ELC", source_conclusion="In Scope", decision_status="SOURCE_CONFIRMED_IN_SCOPE")

for proc in PROCESSES:
    code = str(proc.get("code") or proc.get("processCode") or "").strip()
    if not code:
        raise RuntimeError("PROCESS_CODE_MISSING")
    matched = best_process(proc)
    proc_id = add_item(
        "Business Process", code, str(proc.get("name") or proc.get("processName") or code), True,
        str(proc.get("significanceCriteria") or proc.get("rationale") or proc.get("description") or "Source-confirmed significant process."),
        source_id=str(matched["id"]) if matched else None, source_key=code,
        source_conclusion="Significant / In Scope", decision_status="SOURCE_COMPLETE_16_PROCESS_SCOPE",
        payload={**proc, "matchedBusinessProcess": {
            "id": matched.get("id"), "processId": matched.get("processId"), "name": matched.get("name"),
        } if matched else None},
        source_reference="USER_UPLOAD:Proses Bisnis Kalbar 2026 ver.7 (SEND NEW).xlsx",
    )
    process_item_ids[code] = proc_id

for acct in ACCOUNTS:
    source_key = str(acct.get("sourceKey") or acct.get("code") or "").strip()
    if not source_key:
        raise RuntimeError("ACCOUNT_SOURCE_KEY_MISSING")
    code = "FSLI-" + source_key
    classification = str(acct.get("sourceConclusion") or acct.get("classification") or "").strip()
    decision = str(acct.get("decisionStatus") or "").strip()
    in_scope = bool(acct.get("inScope"))
    acct_id = add_item(
        "Financial Account", code, str(acct.get("name") or acct.get("accountName") or source_key), in_scope,
        f"Source classification: {classification or 'Not stated'}. Decision: {decision or ('IN_SCOPE' if in_scope else 'OUT_OF_SCOPE')}.",
        item_amount=amount(acct.get("balance2025Amount")), source_key=source_key,
        source_conclusion=classification, decision_status=decision or ("SOURCE_IN_SCOPE" if in_scope else "SOURCE_OUT_OF_SCOPE"),
        payload=acct,
        source_reference="USER_UPLOAD:Daftar Akun Signifikan dan Pemetaan Aplikasi TI - Bank Kalbar 2025 v10 (update dengan kalbar).xlsx",
    )
    account_item_ids[source_key] = acct_id

for app in APPLICATIONS:
    sid_raw = app.get("sourceId")
    try:
        sid_num = int(sid_raw)
    except Exception:
        raise RuntimeError(f"APPLICATION_SOURCE_ID_INVALID_{sid_raw}")
    code = f"APP-{sid_num:02d}"
    source_sig = bool(app.get("sourceSignificant"))
    previous_provisional = bool(app.get("previousArtifactProvisionalInScope"))
    contradictory = bool(app.get("contradictoryRationale"))
    linked = bool(app.get("linkedToInScopeAccount"))
    if source_sig:
        app_in_scope = True
        decision = "REVALIDATE_CONTRADICTORY_RATIONALE" if contradictory else "SOURCE_SIGNIFICANT_REVALIDATION_REQUIRED"
    elif previous_provisional:
        app_in_scope = True
        decision = "PROVISIONAL_IN_SCOPE_PREVIOUS_ARTIFACT_REVALIDATE"
    elif linked:
        app_in_scope = False
        decision = "SOURCE_NOT_SIGNIFICANT_LINKED_TO_IN_SCOPE_FSLI_REVIEW"
    else:
        app_in_scope = False
        decision = "SOURCE_NOT_SIGNIFICANT"
    app_id = add_item(
        "IT System", code, str(app.get("name") or app.get("applicationName") or code), app_in_scope,
        f"Source conclusion: {app.get('sourceConclusion') or ('Signifikan' if source_sig else 'Tidak Signifikan')}. Decision status: {decision}.",
        source_key=str(sid_num),
        source_conclusion=str(app.get("sourceConclusion") or ("Signifikan" if source_sig else "Tidak Signifikan")),
        decision_status=decision, payload=app,
        source_reference="USER_UPLOAD:Permintaan Data IT - Identifikasi System Signifikan (ver 7).xlsx",
    )
    application_item_ids[sid_num] = app_id

item_sql = []
for item in scope_items:
    item_sql.append(f"""
INSERT INTO ICOFRScopeItem(id,scopeId,itemType,sourceId,code,name,inScope,amount,rationale,createdAt,updatedAt)
VALUES({q(item['id'])},{q(scope_id)},{q(item['itemType'])},{q(item['sourceId'])},{q(item['code'])},{q(item['name'])},
{item['inScope']},{'NULL' if item['amount'] is None else item['amount']},{q(item['rationale'])},{q(now)},{q(now)})
ON CONFLICT(id) DO UPDATE SET sourceId=excluded.sourceId,code=excluded.code,name=excluded.name,
inScope=excluded.inScope,amount=excluded.amount,rationale=excluded.rationale,updatedAt=excluded.updatedAt;
""")
execute("\n".join(item_sql), "/tmp/icofr_scope_items.sql")

meta_sql = []
for m in metadata:
    meta_sql.append(f"""
INSERT INTO ICOFRScopeItemMetadata(scopeItemId,scopeId,sourceKey,sourceConclusion,decisionStatus,sourceReference,payloadJson,updatedAt)
VALUES({q(m['scopeItemId'])},{q(scope_id)},{q(m['sourceKey'])},{q(m['sourceConclusion'])},{q(m['decisionStatus'])},
{q(m['sourceReference'])},{q(m['payloadJson'])},{q(now)})
ON CONFLICT(scopeItemId) DO UPDATE SET sourceKey=excluded.sourceKey,sourceConclusion=excluded.sourceConclusion,
decisionStatus=excluded.decisionStatus,sourceReference=excluded.sourceReference,payloadJson=excluded.payloadJson,
updatedAt=excluded.updatedAt;
""")
execute("\n".join(meta_sql), "/tmp/icofr_scope_item_meta.sql")

links = []
for proc in PROCESSES:
    pcode = str(proc.get("code") or proc.get("processCode") or "")
    to_id = process_item_ids[pcode]
    for source_key in proc.get("accountSourceKeys") or []:
        source_key = str(source_key)
        from_id = account_item_ids.get(source_key)
        if not from_id:
            raise RuntimeError(f"PROCESS_ACCOUNT_REFERENCE_MISSING_{pcode}_{source_key}")
        links.append((from_id, to_id, "FSLI_TO_PROCESS", "USER_UPLOAD:Proses Bisnis Kalbar 2026 ver.7 (SEND NEW).xlsx"))

for acct in ACCOUNTS:
    source_key = str(acct.get("sourceKey") or acct.get("code") or "")
    from_id = account_item_ids[source_key]
    for app_ref in acct.get("applicationRefs") or []:
        try:
            app_id_num = int(app_ref)
        except Exception:
            raise RuntimeError(f"APPLICATION_REFERENCE_INVALID_{source_key}_{app_ref}")
        to_id = application_item_ids.get(app_id_num)
        if not to_id:
            raise RuntimeError(f"APPLICATION_REFERENCE_MISSING_{source_key}_{app_id_num}")
        links.append((from_id, to_id, "FSLI_TO_APPLICATION",
                      "USER_UPLOAD:Daftar Akun Signifikan dan Pemetaan Aplikasi TI - Bank Kalbar 2025 v10 (update dengan kalbar).xlsx"))

links = list(dict.fromkeys(links))
link_sql = []
for from_id, to_id, relation, source_ref in links:
    link_id = hid(scope_id, "LINK", from_id, to_id, relation)
    link_sql.append(f"""
INSERT INTO ICOFRScopeLink(id,scopeId,fromItemId,toItemId,relationType,sourceReference,updatedAt)
VALUES({q(link_id)},{q(scope_id)},{q(from_id)},{q(to_id)},{q(relation)},{q(source_ref)},{q(now)})
ON CONFLICT(scopeId,fromItemId,toItemId,relationType) DO UPDATE SET
sourceReference=excluded.sourceReference,updatedAt=excluded.updatedAt;
""")
execute("\n".join(link_sql), "/tmp/icofr_scope_links.sql")

params = [
    ("PBT_NORMALIZED_3Y", "Normalized PBT 3-year average (2023-2025)", benchmark, None, None,
     "Profit Before Tax - normalized 3-year average", "UNDER_REVIEW_DRAFT_WORKPAPER",
     "USER_UPLOAD:Kertas Kerja Penentuan Materialitas ICoFR - Bank Buku 2 (Bank Kalbar) v9 - revisian brhw-kalbar.xlsx",
     "Active benchmark used by the dedicated materiality workpaper."),
    ("PBT_2025", "Profit Before Tax TB 2025", int(MAT["currentYearPbt"]), None, None,
     "Audited TB 2025", "SOURCE_CONTEXT",
     "USER_UPLOAD:Kertas Kerja Penentuan Materialitas ICoFR - Bank Buku 2 (Bank Kalbar) v9 - revisian brhw-kalbar.xlsx",
     "Current-year PBT is context; active OM uses normalized 3-year PBT."),
    ("OM_PERCENT", "Overall Materiality percentage", None, om_pct, "Normalized PBT × 5%",
     "Normalized PBT 3-year average", "UNDER_REVIEW_DRAFT_WORKPAPER", SOURCE_REFERENCE,
     "Source-confirmed workpaper percentage."),
    ("OM_AMOUNT", "Overall Materiality", om_amt, None, "Normalized PBT × 5%",
     "Normalized PBT 3-year average", "UNDER_REVIEW_DRAFT_WORKPAPER", SOURCE_REFERENCE, "Active workpaper OM."),
    ("PM_FACTOR", "Performance Materiality factor", None, pm_pct, "OM × 50%",
     "Overall Materiality", "UNDER_REVIEW_DRAFT_WORKPAPER", SOURCE_REFERENCE, "Active workpaper PM factor."),
    ("PM_AMOUNT", "Performance Materiality", pm_amt, None, "OM × 50%",
     "Overall Materiality", "UNDER_REVIEW_DRAFT_WORKPAPER", SOURCE_REFERENCE, "Active workpaper PM."),
    ("TOLERANCE_HAIRCUT", "Tolerable-threshold haircut", None, tolerance_haircut, "PM × (100% - 17.5%)",
     "Performance Materiality", "UNDER_REVIEW_DRAFT_WORKPAPER", SOURCE_REFERENCE,
     "Haircut risk category: " + str(MAT.get("haircutRiskCategory")) + "."),
    ("TOLERABLE_THRESHOLD", "Tolerable threshold", tolerable, None, "PM × 82.5%",
     "Performance Materiality", "UNDER_REVIEW_DRAFT_WORKPAPER", SOURCE_REFERENCE,
     "Account/process evaluation threshold."),
    ("CLEARLY_TRIVIAL_PERCENT", "Clearly trivial percentage", None, trivial_pct, "PM × 5%",
     "Performance Materiality", "UNDER_REVIEW_DRAFT_WORKPAPER", SOURCE_REFERENCE, "Percentage is based on PM."),
    ("CLEARLY_TRIVIAL_AMOUNT", "Clearly trivial amount", trivial_amt, None, "PM × 5%",
     "Performance Materiality", "UNDER_REVIEW_DRAFT_WORKPAPER", SOURCE_REFERENCE, "Source-confirmed workpaper threshold."),
    ("REQUEST_TRACKER_OM_ALTERNATE", "OM in Fase-1 request tracker", 33669050000, None, "PBT 2025 × 5%",
     "Single-year PBT 2025", "SOURCE_CONFLICT_NOT_ACTIVE", "USER_UPLOAD:Daftar_Permintaan_Data_Fase1.xlsx",
     "Conflicts with the dedicated materiality workpaper; retained for reconciliation and not used as active OM."),
    ("LOCATION_COVERAGE", "Location coverage", None, 100.0, None, "Single legal entity", "FINAL",
     SOURCE_REFERENCE, "100% single-entity coverage."),
]
param_sql = []
for order, p in enumerate(params, 1):
    code, label, num, pct, formula, basis, status, source, note = p
    param_sql.append(f"""
INSERT INTO ICOFRScopeParameter(id,scopeId,parameterCode,label,numericValue,percentValue,formula,basis,status,
sourceReference,sourceNote,sortOrder,updatedAt)
VALUES({q(hid(scope_id,'PARAM',code))},{q(scope_id)},{q(code)},{q(label)},{'NULL' if num is None else num},
{'NULL' if pct is None else pct},{q(formula)},{q(basis)},{q(status)},{q(source)},{q(note)},{order},{q(now)})
ON CONFLICT(scopeId,parameterCode) DO UPDATE SET label=excluded.label,numericValue=excluded.numericValue,
percentValue=excluded.percentValue,formula=excluded.formula,basis=excluded.basis,status=excluded.status,
sourceReference=excluded.sourceReference,sourceNote=excluded.sourceNote,sortOrder=excluded.sortOrder,
updatedAt=excluded.updatedAt;
""")
execute("\n".join(param_sql), "/tmp/icofr_scope_params.sql")

flsi = POPS["financialItems"]
process_pop = POPS["businessProcesses"]
app_pop = POPS["applications"]
loc_pop = POPS["locations"]
populations = [
    ("FSLI", flsi["assessed"], flsi["quantitativeSignificant"] + flsi["qualitativeSignificant"],
     flsi["quantitativeSignificant"], flsi["qualitativeSignificant"], flsi["notSignificant"],
     "COMPLETE_SOURCE_ENUMERATION",
     "USER_UPLOAD:Daftar Akun Signifikan dan Pemetaan Aplikasi TI - Bank Kalbar 2025 v10 (update dengan kalbar).xlsx",
     f"borderlineCount={flsi['borderline']}; inScopeIncludingBorderline={flsi['inScopeIncludingBorderline']}; all 52 rows loaded."),
    ("BUSINESS_PROCESS", process_pop["assessed"], process_pop["inScope"], None, None, 0,
     "COMPLETE_SOURCE_ENUMERATION", "USER_UPLOAD:Proses Bisnis Kalbar 2026 ver.7 (SEND NEW).xlsx",
     "All P-01 through P-16 are source-enumerated and in scope."),
    ("APPLICATION", app_pop["assessed"], app_pop["sourceSignificant"], None, None, app_pop["sourceNotSignificant"],
     "REVALIDATION_REQUIRED", "USER_UPLOAD:Permintaan Data IT - Identifikasi System Signifikan (ver 7).xlsx",
     f"sourceSignificant={app_pop['sourceSignificant']}; contradictorySignificant={app_pop['contradictorySignificant']}; nonSignificantLinkedToInScopeFSLI={app_pop['nonSignificantLinkedToInScopeFSLI']}; all 62 rows loaded."),
    ("LOCATION", loc_pop["assessed"], loc_pop["inScope"], loc_pop["inScope"], 0, 0, "FINAL",
     SOURCE_REFERENCE, "Single entity; 100% location coverage."),
]
pop_sql = []
for ptype, assessed, significant, quant, qual, not_sig, status, source, note in populations:
    pop_sql.append(f"""
INSERT INTO ICOFRScopingPopulationSummary(id,scopeId,populationType,assessedCount,significantCount,
quantitativeSignificantCount,qualitativeOnlyCount,notSignificantCount,sourceStatus,sourceReference,sourceNote,updatedAt)
VALUES({q(hid(scope_id,'POP',ptype))},{q(scope_id)},{q(ptype)},{assessed},{significant},
{'NULL' if quant is None else quant},{'NULL' if qual is None else qual},{not_sig},{q(status)},{q(source)},{q(note)},{q(now)})
ON CONFLICT(scopeId,populationType) DO UPDATE SET assessedCount=excluded.assessedCount,
significantCount=excluded.significantCount,quantitativeSignificantCount=excluded.quantitativeSignificantCount,
qualitativeOnlyCount=excluded.qualitativeOnlyCount,notSignificantCount=excluded.notSignificantCount,
sourceStatus=excluded.sourceStatus,sourceReference=excluded.sourceReference,sourceNote=excluded.sourceNote,
updatedAt=excluded.updatedAt;
""")
execute("\n".join(pop_sql), "/tmp/icofr_scope_population.sql")

issue_sql = []
for issue in ISSUES:
    issue_code = issue["code"]
    affected = {k: v for k, v in issue.items() if k not in {
        "code", "category", "severity", "status", "description", "activeDecision"
    }}
    issue_sql.append(f"""
INSERT INTO ICOFRScopingIssue(id,scopeId,issueCode,category,severity,status,description,activeDecision,
affectedJson,sourceReference,updatedAt)
VALUES({q(hid(scope_id,'ISSUE',issue_code))},{q(scope_id)},{q(issue_code)},{q(issue['category'])},
{q(issue['severity'])},{q(issue['status'])},{q(issue['description'])},{q(issue.get('activeDecision'))},
{q(json.dumps(affected,ensure_ascii=False,separators=(',',':')))},{q(SOURCE_REFERENCE)},{q(now)})
ON CONFLICT(scopeId,issueCode) DO UPDATE SET category=excluded.category,severity=excluded.severity,
status=excluded.status,description=excluded.description,activeDecision=excluded.activeDecision,
affectedJson=excluded.affectedJson,sourceReference=excluded.sourceReference,updatedAt=excluded.updatedAt;
""")
execute("\n".join(issue_sql), "/tmp/icofr_scope_issues.sql")

account_to_processes = {key: [] for key in account_item_ids}
for proc in PROCESSES:
    pcode = str(proc.get("code") or proc.get("processCode") or "")
    pname = str(proc.get("name") or proc.get("processName") or pcode)
    for source_key in proc.get("accountSourceKeys") or []:
        account_to_processes.setdefault(str(source_key), []).append(f"{pcode} {pname}")

financial_sql = []
for acct in ACCOUNTS:
    source_key = str(acct.get("sourceKey") or acct.get("code") or "")
    code = "FSLI-" + source_key
    classification = str(acct.get("sourceConclusion") or acct.get("classification") or "")
    decision = str(acct.get("decisionStatus") or "")
    is_borderline = "borderline" in classification.lower() or "borderline" in decision.lower()
    significant = bool(acct.get("inScope")) and not is_borderline
    status = "Under Review - Borderline" if is_borderline else ("In Scope - Source Significant" if significant else "Out of Scope - Source")
    stmt = str(acct.get("statementType") or acct.get("category") or "")
    financial_sql.append(f"""
INSERT INTO ICOFRFinancialItem(id,institutionId,recordType,itemCode,name,financialStatement,balanceAmount,currency,
significant,scopingRationale,assertions,riskFactors,processReference,owner,status,createdAt,updatedAt)
VALUES({q(hid(iid,'ICOFR-FSLI',source_key))},{q(iid)},'Account',{q(code)},
{q(acct.get('name') or acct.get('accountName') or source_key)},{q(stmt)},
{'NULL' if amount(acct.get('balance2025Amount')) is None else amount(acct.get('balance2025Amount'))},'IDR',
{bool_int(significant)},{q('Source classification: '+classification+'. Decision status: '+decision+'.')},NULL,
{q(json.dumps(acct.get('qualitativeFactors') or [],ensure_ascii=False,separators=(',',':')))},
{q('; '.join(account_to_processes.get(source_key) or []))},{q(acct.get('owner'))},{q(status)},{q(now)},{q(now)})
ON CONFLICT(institutionId,recordType,itemCode) DO UPDATE SET name=excluded.name,
financialStatement=excluded.financialStatement,balanceAmount=excluded.balanceAmount,currency='IDR',
significant=excluded.significant,scopingRationale=excluded.scopingRationale,riskFactors=excluded.riskFactors,
processReference=excluded.processReference,owner=excluded.owner,status=excluded.status,updatedAt=excluded.updatedAt;
""")
execute("\n".join(financial_sql), "/tmp/icofr_financial_items.sql")

scope_counts = rows("SELECT itemType,COUNT(*) n,SUM(CASE WHEN inScope=1 THEN 1 ELSE 0 END) inScope "
                    "FROM ICOFRScopeItem WHERE scopeId=" + q(scope_id) + " GROUP BY itemType ORDER BY itemType")
count_map = {str(r["itemType"]): (int(r["n"]), int(r.get("inScope") or 0)) for r in scope_counts}
expected = {
    "Financial Account": (52, 38),
    "Business Process": (16, 16),
    "IT System": (62, sum(1 for a in APPLICATIONS if bool(a.get("sourceSignificant")) or bool(a.get("previousArtifactProvisionalInScope")))),
    "Legal Entity": (1, 1),
    "Other": (2, 2),
}
for key, value in expected.items():
    if count_map.get(key) != value:
        raise RuntimeError(f"SCOPE_ITEM_COUNT_{key}_{count_map.get(key)}_EXPECTED_{value}")

process_link_count = sum(1 for link in links if link[2] == "FSLI_TO_PROCESS")
app_link_count = sum(1 for link in links if link[2] == "FSLI_TO_APPLICATION")
db_link_counts = rows("SELECT relationType,COUNT(*) n FROM ICOFRScopeLink WHERE scopeId=" + q(scope_id) + " GROUP BY relationType")
db_link_map = {str(r["relationType"]): int(r["n"]) for r in db_link_counts}
if db_link_map.get("FSLI_TO_PROCESS") != process_link_count:
    raise RuntimeError("FSLI_PROCESS_LINK_VERIFY_FAILED")
if db_link_map.get("FSLI_TO_APPLICATION") != app_link_count:
    raise RuntimeError("FSLI_APPLICATION_LINK_VERIFY_FAILED")

issue_counts = rows("SELECT status,COUNT(*) n FROM ICOFRScopingIssue WHERE scopeId=" + q(scope_id) + " GROUP BY status")
issue_map = {str(r["status"]): int(r["n"]) for r in issue_counts}
if issue_map.get("OPEN") != 6 or issue_map.get("CLOSED") != 1:
    raise RuntimeError(f"ISSUE_COUNT_VERIFY_FAILED_{issue_map}")

fin_counts = rows("SELECT COUNT(*) total,SUM(CASE WHEN significant=1 THEN 1 ELSE 0 END) significant,"
                  "SUM(CASE WHEN status='Under Review - Borderline' THEN 1 ELSE 0 END) borderline "
                  "FROM ICOFRFinancialItem WHERE institutionId=" + q(iid) + " AND itemCode LIKE 'FSLI-%'")
fv = fin_counts[0] if fin_counts else {}
if int(fv.get("total") or 0) != 52 or int(fv.get("significant") or 0) != 37 or int(fv.get("borderline") or 0) != 1:
    raise RuntimeError(f"FINANCIAL_ITEM_VERIFY_FAILED_{fv}")

matched_process_count = sum(
    1 for m in metadata
    if m.get("sourceKey") in process_item_ids and json.loads(m["payloadJson"]).get("matchedBusinessProcess")
)
app_source_sig = sum(1 for a in APPLICATIONS if bool(a.get("sourceSignificant")))
app_scope_in = sum(1 for a in APPLICATIONS if bool(a.get("sourceSignificant")) or bool(a.get("previousArtifactProvisionalInScope")))
if app_source_sig != 31 or app_scope_in < 31:
    raise RuntimeError("APPLICATION_CLASSIFICATION_VERIFY_FAILED")

summary = {
    "scopeId": scope_id, "fiscalYear": 2026, "sourceFiles": len(SOURCE_FILES),
    "materiality": {
        "benchmark": benchmark, "omPercent": om_pct, "omAmount": om_amt, "pmPercent": pm_pct,
        "pmAmount": pm_amt, "toleranceHaircutPercent": tolerance_haircut,
        "tolerableThreshold": tolerable, "clearlyTrivial": trivial_amt, "status": MAT.get("workpaperStatus"),
    },
    "financialItems": {"assessed": 52, "sourceSignificant": 37, "borderline": 1, "inScope": 38, "notSignificant": 14},
    "businessProcesses": {"complete": True, "assessed": 16, "inScope": 16, "matchedToExistingMaster": matched_process_count},
    "applications": {
        "assessed": 62, "sourceSignificant": 31,
        "provisionalInScopeFromPreviousArtifact": sum(1 for a in APPLICATIONS if bool(a.get("previousArtifactProvisionalInScope")) and not bool(a.get("sourceSignificant"))),
        "scopeIn": app_scope_in, "sourceNotSignificant": 31, "contradictorySignificant": 5,
        "nonSignificantLinkedToInScopeFSLI": 12, "status": "REVALIDATION_REQUIRED",
    },
    "links": {"FSLI_TO_PROCESS": process_link_count, "FSLI_TO_APPLICATION": app_link_count},
    "issues": issue_map, "nonScopingModulesModified": False, "csaIllustrativeRowsImported": False,
}

feed_id = hid(iid, BATCH)
execute(f"""
INSERT INTO OperationalDataFeedRun(id,institutionId,batchCode,module,sourceRole,sourceReferencesJson,recordsUpserted,
status,summaryJson,completedAt)
VALUES({q(feed_id)},{q(iid)},{q(BATCH)},'ICOFR Scoping','USER_UPLOAD_6_FILES',
{q(json.dumps(SOURCE_FILES,ensure_ascii=False,separators=(',',':')))},
{len(scope_items)+len(metadata)+len(links)+len(params)+len(populations)+len(ISSUES)+52},
'Completed',{q(json.dumps(summary,ensure_ascii=False,separators=(',',':')))},{q(now)})
ON CONFLICT(institutionId,batchCode) DO UPDATE SET sourceReferencesJson=excluded.sourceReferencesJson,
recordsUpserted=excluded.recordsUpserted,status='Completed',summaryJson=excluded.summaryJson,completedAt=excluded.completedAt;
""", "/tmp/icofr_feed.sql")

audit_id = hid(iid, BATCH, "AUDIT")
execute(f"""
INSERT OR REPLACE INTO AuditLog(id,institutionId,userName,userRole,action,entityType,recordId,oldValue,newValue,
reason,ipAddress,timestamp)
VALUES({q(audit_id)},{q(iid)},'System','System','UPSERT','ICOFRScope',{q(scope_id)},NULL,
{q(json.dumps(summary,ensure_ascii=False,separators=(',',':')))},
'Complete Bank Kalbar FY2026 ICOFR scoping only from six user-uploaded workbooks and prior scoping artefacts; no CSA/RCM/ToD/ToE operational data promoted.',
NULL,{q(now)});
""", "/tmp/icofr_audit.sql")

print("=== BANK KALBAR ICOFR 2026 SIX-FILE SCOPING PROMOTION ===")
print(json.dumps(summary, indent=2, ensure_ascii=False))
print("scopeItemCounts=" + json.dumps(count_map, ensure_ascii=False))
print("issueCounts=" + json.dumps(issue_map, ensure_ascii=False))
