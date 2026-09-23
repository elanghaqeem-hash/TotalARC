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
BATCH = "BANK_KALBAR_BPM_HARDENING_20260923"
SOURCE_PROCESS_LIST = "USER_UPLOAD:Proses Bisnis Kalbar 2026 ver.7 (SEND NEW).xlsx"
SOURCE_MEMO = "USER_UPLOAD:Dokumen 1. Memo Reviu 2025&Scoping_2026 (send new).pdf"
SOURCE_META = "REPO:data/bank-kalbar-icofr-scoping-2026-meta.json"

def wr(args, retries=5):
    last = None
    for attempt in range(retries):
        p = subprocess.run(
            ["npx", "wrangler", *args],
            text=True,
            env=os.environ,
            capture_output=True,
        )
        if p.returncode == 0:
            return p.stdout
        last = p
        time.sleep(2 + attempt * 2)
    print((last.stdout if last else "")[-5000:])
    print((last.stderr if last else "")[-5000:])
    raise RuntimeError("WRANGLER_COMMAND_FAILED")

dbs = json.loads(wr(["d1", "list", "--json"]))
db = next((x for x in dbs if re.search(r"total.?arc", x["name"], re.I)), None)
if not db:
    db = dbs[0] if len(dbs) == 1 else None
if not db:
    raise RuntimeError("TOTAL_ARC_D1_NOT_FOUND")
DB = db["name"]

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

def execute(sql, path="/tmp/bpm_hardening.sql"):
    Path(path).write_text(sql, encoding="utf-8")
    wr(["d1", "execute", DB, "--remote", "--file", path])

def json_tags(raw):
    if not raw:
        return {}
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}

now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
effective_date = now[:10]

inst = rows("SELECT * FROM Institution WHERE legalName=" + q(LEGAL_NAME) + " LIMIT 1")
if len(inst) != 1:
    raise RuntimeError("BANK_KALBAR_INSTITUTION_NOT_FOUND")
iid = str(inst[0]["id"])

entity = rows(
    "SELECT id FROM LegalEntity WHERE institutionId=" + q(iid) +
    " AND code='BANK-KALBAR' LIMIT 1"
)
if len(entity) != 1:
    raise RuntimeError("BANK_KALBAR_ENTITY_NOT_FOUND")
entity_id = str(entity[0]["id"])

scope = rows(
    "SELECT id FROM ICOFRScope WHERE institutionId=" + q(iid) +
    " AND fiscalYear=2026 AND scopeName=" + q(SCOPE_NAME) + " LIMIT 1"
)
if len(scope) != 1:
    raise RuntimeError("BANK_KALBAR_ICOFR_2026_SCOPE_NOT_FOUND")
scope_id = str(scope[0]["id"])

cats = {str(x["code"]): x for x in rows("SELECT id,code,name FROM ProcessCategory")}
if "CAT-FIN" not in cats:
    raise RuntimeError("CAT_FIN_NOT_FOUND")
cat_fin_id = str(cats["CAT-FIN"]["id"])

existing = rows(
    "SELECT * FROM BusinessProcess WHERE institutionId=" + q(iid) +
    " ORDER BY level,processId"
)
by_code = {str(x["processId"]): x for x in existing}

required_codes = [
    "TRY", "MRA-SP-2EFA79E", "OBB", "OPB", "PGD", "UUS", "JLN", "ITGC"
]
missing = [code for code in required_codes if code not in by_code]
if missing:
    raise RuntimeError("REQUIRED_BPM_RECORDS_MISSING_" + ",".join(missing))

ecl = by_code["MRA-SP-2EFA79E"]
if str(ecl.get("name") or "") != "Perhitungan Expected Credit Loss":
    raise RuntimeError("ECL_SUBPROCESS_NAME_CHANGED_REVIEW_REQUIRED")

# 1) Canonical L2 CKPN master for FY2026 source process P-05.
ckpn_existing = rows(
    "SELECT * FROM BusinessProcess WHERE institutionId=" + q(iid) +
    " AND processId='CKPN' LIMIT 2"
)
if len(ckpn_existing) > 1:
    raise RuntimeError("DUPLICATE_CKPN_MASTER")

ckpn_id = str(ckpn_existing[0]["id"]) if ckpn_existing else hid(iid, "ICOFR-BPM-2026", "P-05", "CKPN")
ckpn_tags = {
    "sourceBacked": True,
    "feedBatch": BATCH,
    "icoFrScopingCode": "P-05",
    "icoFrFiscalYear": 2026,
    "sourceReference": SOURCE_PROCESS_LIST,
    "memoReference": SOURCE_MEMO,
    "sourceGovernanceReference": SOURCE_META,
    "scopeApproved": True,
    "detailStatus": "SOURCE_CONFIRMED_FLOW_DETAIL_PENDING",
    "sourceRequestStatus": "PARTIALLY_RECEIVED",
    "sourceRequestNo": 12,
    "reviewRequired": True,
    "activitiesFabricated": False,
    "sipocFabricated": False,
    "canonicalHierarchy": True,
}
ckpn_description = (
    "Source-confirmed FY2026 ICOFR process P-05 for Cadangan Kerugian Penurunan Nilai (CKPN/ECL). "
    "The existing source-backed subprocess 'Perhitungan Expected Credit Loss' is retained beneath this L2 master. "
    "Detailed CKPN flow, model inputs/parameters, staging, validation, monthly movement analysis, management review, "
    "and journal steps remain Draft pending readable Bank SOP PSAK 71 and ECL workpapers; no missing flow steps are fabricated."
)

if ckpn_existing:
    execute(f"""
UPDATE BusinessProcess
SET legalEntityId=COALESCE(legalEntityId,{q(entity_id)}),
    categoryId={q(cat_fin_id)},
    processId='CKPN',
    name='Cadangan Kerugian Penurunan Nilai (CKPN/ECL)',
    level=2,
    parentProcessId=NULL,
    description={q(ckpn_description)},
    criticality=COALESCE(NULLIF(criticality,''),'Not Assessed'),
    classification='Finance',
    isIcofrRelevant=1,
    status='Draft',
    tags={q(json.dumps(ckpn_tags,ensure_ascii=False,separators=(',',':')))},
    updatedAt={q(now)}
WHERE id={q(ckpn_id)};
""", "/tmp/bpm_ckpn_update.sql")
else:
    execute(f"""
INSERT INTO BusinessProcess(
  id,institutionId,legalEntityId,orgUnitId,categoryId,processId,name,level,parentProcessId,
  description,ownerName,ownerEmail,managerName,criticality,classification,isIcofrRelevant,
  status,version,effectiveDate,reviewDate,tags,createdAt,updatedAt
) VALUES(
  {q(ckpn_id)},{q(iid)},{q(entity_id)},NULL,{q(cat_fin_id)},'CKPN',
  'Cadangan Kerugian Penurunan Nilai (CKPN/ECL)',2,NULL,
  {q(ckpn_description)},'',NULL,NULL,'Not Assessed','Finance',1,
  'Draft','1.0',{q(effective_date)},NULL,
  {q(json.dumps(ckpn_tags,ensure_ascii=False,separators=(',',':')))},{q(now)},{q(now)}
);
""", "/tmp/bpm_ckpn_insert.sql")

# Re-parent the existing exact source-backed ECL subprocess to canonical CKPN L2.
ecl_tags = json_tags(ecl.get("tags"))
ecl_tags.update({
    "sourceBacked": True,
    "feedBatch": BATCH,
    "icoFrScopingCode": "P-05",
    "canonicalParentProcessId": ckpn_id,
    "hierarchyStatus": "VERIFIED_SOURCE_ALIGNMENT",
    "detailStatus": "SOURCE_BACKED_SUBPROCESS_EXISTING",
    "reviewRequired": True,
})
execute(f"""
UPDATE BusinessProcess
SET parentProcessId={q(ckpn_id)},
    categoryId={q(cat_fin_id)},
    level=3,
    tags={q(json.dumps(ecl_tags,ensure_ascii=False,separators=(',',':')))},
    updatedAt={q(now)}
WHERE id={q(str(ecl['id']))};
""", "/tmp/bpm_ecl_reparent.sql")

# Scope P-05 must point to the canonical L2 process, not directly to L3.
execute(
    "UPDATE ICOFRScopeItem SET sourceId=" + q(ckpn_id) + ",updatedAt=" + q(now) +
    " WHERE scopeId=" + q(scope_id) +
    " AND itemType='Business Process' AND code='P-05';",
    "/tmp/bpm_scope_p05.sql",
)

# 2) Reverse Repo: source-confirmed missing business subprocess under Treasury.
try_master = by_code["TRY"]
reverse_existing = rows(
    "SELECT * FROM BusinessProcess WHERE institutionId=" + q(iid) +
    " AND (processId='TRY-SP-REVREPO' OR lower(name) LIKE '%reverse repo%') LIMIT 3"
)
if len(reverse_existing) > 1:
    raise RuntimeError("DUPLICATE_REVERSE_REPO_SUBPROCESS")

reverse_id = (
    str(reverse_existing[0]["id"])
    if reverse_existing
    else hid(iid, "BPM-L3", "TRY-SP-REVREPO")
)
reverse_tags = {
    "sourceBacked": True,
    "feedBatch": BATCH,
    "icoFrScopingCode": "P-04",
    "icoFrFiscalYear": 2026,
    "sourceReference": SOURCE_MEMO,
    "sourceGovernanceReference": SOURCE_META,
    "sourceRequestNo": 25,
    "sourceRequestStatus": "NOT_RECEIVED",
    "detailStatus": "SOURCE_CONFIRMED_PROCESS_DETAIL_PENDING",
    "reviewRequired": True,
    "activitiesFabricated": False,
    "sipocFabricated": False,
    "sourceBalanceDate": "2025-12-31",
    "sourceBalanceAmountIdr": 289920000000,
}
reverse_description = (
    "Source-confirmed Treasury subprocess for reverse repo (efek yang dibeli dengan janji dijual kembali). "
    "The FY2026 review identified the instrument as a material new 2025 exposure and required business process/BPM/RCM "
    "before testing. Detailed steps, systems, approvals, accounting entries, settlement, collateral handling, and controls "
    "are intentionally not populated because the requested Bank policy/workpaper remains unavailable."
)
reverse_owner = str(try_master.get("ownerName") or "")
reverse_org = try_master.get("orgUnitId")
reverse_category = str(try_master.get("categoryId") or cat_fin_id)
reverse_classification = str(try_master.get("classification") or "Finance")

if reverse_existing:
    execute(f"""
UPDATE BusinessProcess
SET legalEntityId=COALESCE(legalEntityId,{q(entity_id)}),
    orgUnitId=COALESCE(orgUnitId,{q(reverse_org)}),
    categoryId={q(reverse_category)},
    processId='TRY-SP-REVREPO',
    name='Transaksi Reverse Repo (Efek Dibeli dengan Janji Dijual Kembali)',
    level=3,
    parentProcessId={q(str(try_master['id']))},
    description={q(reverse_description)},
    ownerName=CASE WHEN trim(COALESCE(ownerName,''))='' THEN {q(reverse_owner)} ELSE ownerName END,
    criticality='Not Assessed',
    classification={q(reverse_classification)},
    isIcofrRelevant=1,
    status='Draft',
    tags={q(json.dumps(reverse_tags,ensure_ascii=False,separators=(',',':')))},
    updatedAt={q(now)}
WHERE id={q(reverse_id)};
""", "/tmp/bpm_reverse_update.sql")
else:
    execute(f"""
INSERT INTO BusinessProcess(
  id,institutionId,legalEntityId,orgUnitId,categoryId,processId,name,level,parentProcessId,
  description,ownerName,ownerEmail,managerName,criticality,classification,isIcofrRelevant,
  status,version,effectiveDate,reviewDate,tags,createdAt,updatedAt
) VALUES(
  {q(reverse_id)},{q(iid)},{q(entity_id)},{q(reverse_org)},{q(reverse_category)},'TRY-SP-REVREPO',
  'Transaksi Reverse Repo (Efek Dibeli dengan Janji Dijual Kembali)',3,{q(str(try_master['id']))},
  {q(reverse_description)},{q(reverse_owner)},NULL,NULL,'Not Assessed',{q(reverse_classification)},1,
  'Draft','1.0',{q(effective_date)},NULL,
  {q(json.dumps(reverse_tags,ensure_ascii=False,separators=(',',':')))},{q(now)},{q(now)}
);
""", "/tmp/bpm_reverse_insert.sql")

# 3) Source-governance tags for known source-vs-master breadth/detail gaps.
def patch_tags(code, patch):
    row = by_code[code]
    tags = json_tags(row.get("tags"))
    tags.update(patch)
    execute(
        "UPDATE BusinessProcess SET tags=" +
        q(json.dumps(tags,ensure_ascii=False,separators=(',',':'))) +
        ",updatedAt=" + q(now) + " WHERE id=" + q(str(row["id"])) + ";",
        "/tmp/bpm_tag_" + re.sub(r"[^A-Za-z0-9]+","_",code) + ".sql",
    )

patch_tags("OBB", {
    "icoFrScopingCode": "P-08",
    "icoFrFiscalYear": 2026,
    "sourceReference": SOURCE_PROCESS_LIST,
    "scopeSourceName": "Otomatisasi Pengakuan Pendapatan dan Beban Bunga atau Bagi Hasil (untuk bisnis syariah)",
    "scopeMappingStatus": "COMPOSITE_SOURCE_PROCESS_REVIEW_REQUIRED",
    "relatedExistingProcessId": str(by_code["OPB"]["id"]),
    "detailStatus": "SOURCE_SCOPE_BROADER_THAN_CURRENT_MASTER",
    "reviewRequired": True,
})
patch_tags("OPB", {
    "relatedIcofrScopingCode": "P-08",
    "sourceReference": SOURCE_PROCESS_LIST,
    "scopeMappingRole": "RELATED_EXISTING_PROCESS",
    "reviewRequired": True,
})
patch_tags("PGD", {
    "icoFrScopingCode": "P-09",
    "icoFrFiscalYear": 2026,
    "sourceReference": SOURCE_PROCESS_LIST,
    "scopeSourceName": "Pengadaan Barang dan Jasa serta Pengelolaan Aset Tetap",
    "scopeMappingStatus": "SOURCE_SCOPE_BROADER_THAN_CURRENT_MASTER_REVIEW_REQUIRED",
    "detailStatus": "ASSET_FIXED_DETAIL_PENDING_PROCESS_OWNER_VALIDATION",
    "reviewRequired": True,
})
patch_tags("UUS", {
    "icoFrScopingCode": "P-03",
    "sourceReference": SOURCE_PROCESS_LIST,
    "sourceRequestNo": 11,
    "sourceRequestStatus": "NOT_RECEIVED",
    "detailStatus": "SOURCE_REQUEST_PENDING_FOR_FULL_SYARIAH_BPM",
    "reviewRequired": True,
})
for code, scope_code in [("JLN","P-11"),("ITGC","P-13")]:
    row = by_code[code]
    tags = json_tags(row.get("tags"))
    tags.update({
        "icoFrScopingCode": scope_code,
        "sourceReference": SOURCE_PROCESS_LIST,
        "detailStatus": "L2_SOURCE_CONFIRMED_FLOW_DETAIL_PENDING",
        "reviewRequired": True,
        "activitiesFabricated": False,
        "sipocFabricated": False,
    })
    execute(
        "UPDATE BusinessProcess SET tags=" +
        q(json.dumps(tags,ensure_ascii=False,separators=(',',':'))) +
        ",updatedAt=" + q(now) + " WHERE id=" + q(str(row["id"])) + ";",
        "/tmp/bpm_tag_" + code + ".sql",
    )

# Audit trail.
audit_payload = {
    "batch": BATCH,
    "canonicalCkpn": {"id": ckpn_id, "scopeCode": "P-05", "childEclId": str(ecl["id"])},
    "reverseRepo": {"id": reverse_id, "parentProcessId": str(try_master["id"])},
    "governanceFlags": ["P-03","P-08","P-09","P-11","P-13"],
    "fabricatedActivities": 0,
    "fabricatedSipoc": 0,
}
execute(f"""
INSERT OR REPLACE INTO AuditLog(
  id,institutionId,userName,userRole,action,entityType,recordId,oldValue,newValue,reason,ipAddress,timestamp
) VALUES(
  {q(hid(iid,BATCH,'AUDIT'))},{q(iid)},'System','System','UPSERT','BusinessProcessHierarchy',
  {q(BATCH)},NULL,{q(json.dumps(audit_payload,ensure_ascii=False,separators=(',',':')))},
  'Harden Bank Kalbar FY2026 BPM hierarchy from approved process scope and documented review gaps without fabricating unavailable process-flow detail.',
  NULL,{q(now)}
);
""", "/tmp/bpm_hardening_audit.sql")

# Feed-run summary.
summary = {
    "scopeId": scope_id,
    "fiscalYear": 2026,
    "canonicalCkpnL2": "CKPN",
    "ckpnEclSubprocessReparented": "MRA-SP-2EFA79E",
    "reverseRepoSubprocess": "TRY-SP-REVREPO",
    "reverseRepoParent": "TRY",
    "governanceReviewFlags": {
        "P-03": "full Syariah BPM source request pending",
        "P-08": "source scope is broader/composite versus current OBB/OPB masters",
        "P-09": "source scope includes fixed assets; process-owner detail validation pending",
        "P-11": "L2 source identity confirmed; flow/SIPOC pending",
        "P-13": "L2 source identity confirmed; flow/SIPOC pending",
    },
    "activitiesFabricated": 0,
    "sipocFabricated": 0,
    "nonBpmModulesModified": False,
}
execute(f"""
INSERT INTO OperationalDataFeedRun(
 id,institutionId,batchCode,module,sourceRole,sourceReferencesJson,recordsUpserted,status,summaryJson,completedAt
) VALUES(
 {q(hid(iid,BATCH))},{q(iid)},{q(BATCH)},'Business Process Management',
 'SOURCE_GOVERNED_BPM_HARDENING',
 {q(json.dumps([SOURCE_PROCESS_LIST,SOURCE_MEMO,SOURCE_META],ensure_ascii=False,separators=(',',':')))},
 8,'Completed',{q(json.dumps(summary,ensure_ascii=False,separators=(',',':')))},{q(now)}
)
ON CONFLICT(institutionId,batchCode) DO UPDATE SET
 sourceReferencesJson=excluded.sourceReferencesJson,
 recordsUpserted=excluded.recordsUpserted,
 status='Completed',
 summaryJson=excluded.summaryJson,
 completedAt=excluded.completedAt;
""", "/tmp/bpm_hardening_feed.sql")

# Verification.
ckpn = rows(
    "SELECT * FROM BusinessProcess WHERE institutionId=" + q(iid) +
    " AND processId='CKPN' LIMIT 1"
)
reverse = rows(
    "SELECT * FROM BusinessProcess WHERE institutionId=" + q(iid) +
    " AND processId='TRY-SP-REVREPO' LIMIT 1"
)
ecl_after = rows(
    "SELECT * FROM BusinessProcess WHERE institutionId=" + q(iid) +
    " AND processId='MRA-SP-2EFA79E' LIMIT 1"
)
p05 = rows(
    "SELECT sourceId FROM ICOFRScopeItem WHERE scopeId=" + q(scope_id) +
    " AND itemType='Business Process' AND code='P-05' LIMIT 1"
)
if not ckpn or int(ckpn[0]["level"]) != 2:
    raise RuntimeError("CKPN_L2_VERIFY_FAILED")
if not ecl_after or str(ecl_after[0].get("parentProcessId") or "") != ckpn_id or int(ecl_after[0]["level"]) != 3:
    raise RuntimeError("ECL_REPARENT_VERIFY_FAILED")
if not reverse or str(reverse[0].get("parentProcessId") or "") != str(try_master["id"]) or int(reverse[0]["level"]) != 3:
    raise RuntimeError("REVERSE_REPO_VERIFY_FAILED")
if not p05 or str(p05[0].get("sourceId") or "") != ckpn_id:
    raise RuntimeError("P05_SCOPE_LINK_VERIFY_FAILED")

for pid, label in [(ckpn_id,"CKPN"),(reverse_id,"REVERSE_REPO")]:
    detail = rows(f"""
SELECT
 (SELECT COUNT(*) FROM ProcessObjective WHERE processId={q(pid)}) AS objectives,
 (SELECT COUNT(*) FROM SIPOC WHERE processId={q(pid)}) AS sipoc,
 (SELECT COUNT(*) FROM ProcessActivity WHERE processId={q(pid)}) AS activities
""")
    if detail and any(int(detail[0].get(k) or 0) for k in ("objectives","sipoc","activities")):
        raise RuntimeError(label + "_FABRICATED_DETAIL_DETECTED")

scope_processes = rows(
    "SELECT code,sourceId FROM ICOFRScopeItem WHERE scopeId=" + q(scope_id) +
    " AND itemType='Business Process' AND inScope=1 ORDER BY code"
)
level_by_id = {
    str(x["id"]): int(x["level"])
    for x in rows("SELECT id,level FROM BusinessProcess WHERE institutionId=" + q(iid))
}
non_l2_scope = [
    {"code": x["code"], "sourceId": x.get("sourceId"), "level": level_by_id.get(str(x.get("sourceId")))}
    for x in scope_processes
    if level_by_id.get(str(x.get("sourceId"))) != 2
]
if non_l2_scope:
    raise RuntimeError("NON_L2_SCOPE_LINKS_REMAIN_" + json.dumps(non_l2_scope,ensure_ascii=False))

print("=== BANK KALBAR BPM HARDENING RESULT ===")
print(json.dumps({
    "institutionId": iid,
    "scopeId": scope_id,
    "inScopeBusinessProcesses": len(scope_processes),
    "allScopeLinksCanonicalL2": True,
    "ckpn": {
        "id": ckpn_id,
        "processId": "CKPN",
        "level": 2,
        "eclChild": "MRA-SP-2EFA79E",
        "detailPending": True,
    },
    "reverseRepo": {
        "id": reverse_id,
        "processId": "TRY-SP-REVREPO",
        "level": 3,
        "parent": "TRY",
        "detailPending": True,
    },
    "governanceReviewFlags": summary["governanceReviewFlags"],
    "activitiesFabricated": 0,
    "sipocFabricated": 0,
}, indent=2, ensure_ascii=False))
