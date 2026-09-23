import hashlib, json, os, re, subprocess, time
from datetime import datetime, timezone
from pathlib import Path

LEGAL_NAME = "PT. Bank Pembangunan Daerah Kalimantan Barat"
SCOPE_NAME = "Bank Kalbar ICOFR Tahun Buku 2026"
BATCH = "BANK_KALBAR_ICOFR_BPM_COMPLETION_20260923"
SOURCE_REFERENCE = "USER_UPLOAD:Proses Bisnis Kalbar 2026 ver.7 (SEND NEW).xlsx"
MEMO_REFERENCE = "USER_UPLOAD:Dokumen 1. Memo Reviu 2025&Scoping_2026 (send new).pdf"

TARGETS = {
    "P-11": {
        "processId": "JLN",
        "name": "Jasa dan Layanan Nasabah (Pendapatan Berbasis Komisi)",
        "categoryCode": "CAT-CORE",
        "classification": "Core",
        "description": (
            "Source-confirmed FY2026 ICOFR business process from the approved scoping population. "
            "The prior review memorandum notes that Pelayanan Nasabah had BPM documentation but no RCM "
            "or walkthrough validation. This master records only the supported L2 process identity; "
            "activity flow, SIPOC, owner, and detailed BPM steps remain subject to source/process-owner validation."
        ),
    },
    "P-13": {
        "processId": "ITGC",
        "name": "Teknologi Informasi (Information Technology General Control)",
        "categoryCode": "CAT-IT",
        "classification": "Technology",
        "description": (
            "Source-confirmed FY2026 ICOFR business process for Information Technology General Control. "
            "The prior review memorandum states that the 2025 ITGC BPM was only a summary and required "
            "alignment to the four standard ITGC domains. This master records only the supported L2 process identity; "
            "no activity flow, SIPOC, control, or testing detail is fabricated by this BPM completion."
        ),
    },
}

CATEGORY_META = {
    "CAT-CORE": ("Core Business Operation", 2),
    "CAT-IT": ("Information Technology & Cyber", 4),
}

def wr(args, retries=5):
    last=None
    for attempt in range(retries):
        p=subprocess.run(["npx","wrangler",*args],text=True,env=os.environ,capture_output=True)
        if p.returncode==0:
            return p.stdout
        last=p
        time.sleep(2+attempt*2)
    print((last.stdout if last else "")[-5000:])
    print((last.stderr if last else "")[-5000:])
    raise RuntimeError("WRANGLER_COMMAND_FAILED")

dbs=json.loads(wr(["d1","list","--json"]))
db=next((x for x in dbs if re.search(r"total.?arc",x["name"],re.I)),None)
if not db:
    db=dbs[0] if len(dbs)==1 else None
if not db:
    raise RuntimeError("TOTAL_ARC_D1_NOT_FOUND")
DB=db["name"]

def rows(sql):
    raw=json.loads(wr(["d1","execute",DB,"--remote","--json","--command",sql]))
    raw=raw if isinstance(raw,list) else [raw]
    return [r for b in raw for r in (b.get("results") or [])]

def q(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'","''") + "'"

def hid(*parts):
    return hashlib.sha256("|".join(map(str,parts)).encode()).hexdigest()[:40]

def execute(sql,path="/tmp/bpm_completion.sql"):
    Path(path).write_text(sql,encoding="utf-8")
    wr(["d1","execute",DB,"--remote","--file",path])

now=datetime.now(timezone.utc).isoformat().replace("+00:00","Z")
effective_date=now[:10]

ddl="""
CREATE TABLE IF NOT EXISTS ProcessCategory (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  orderIndex INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS BusinessProcess (
  id TEXT PRIMARY KEY NOT NULL,
  institutionId TEXT NOT NULL,
  legalEntityId TEXT,
  orgUnitId TEXT,
  categoryId TEXT NOT NULL,
  processId TEXT NOT NULL,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 2,
  parentProcessId TEXT,
  description TEXT,
  ownerName TEXT NOT NULL,
  ownerEmail TEXT,
  managerName TEXT,
  criticality TEXT NOT NULL DEFAULT 'Not Assessed',
  classification TEXT NOT NULL DEFAULT 'Core',
  isIcofrRelevant INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Draft',
  version TEXT NOT NULL DEFAULT '1.0',
  effectiveDate TEXT NOT NULL,
  reviewDate TEXT,
  tags TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_process_institution_process_id
  ON BusinessProcess(institutionId,processId);
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
execute(ddl,"/tmp/bpm_completion_ddl.sql")

inst=rows("SELECT * FROM Institution WHERE legalName="+q(LEGAL_NAME)+" LIMIT 1")
if len(inst)!=1:
    raise RuntimeError("BANK_KALBAR_INSTITUTION_NOT_FOUND")
iid=str(inst[0]["id"])

entity=rows("SELECT id FROM LegalEntity WHERE institutionId="+q(iid)+" AND code='BANK-KALBAR' LIMIT 1")
if len(entity)!=1:
    raise RuntimeError("BANK_KALBAR_ENTITY_NOT_FOUND")
entity_id=str(entity[0]["id"])

scope=rows(
    "SELECT id FROM ICOFRScope WHERE institutionId="+q(iid)+
    " AND fiscalYear=2026 AND scopeName="+q(SCOPE_NAME)+" LIMIT 1"
)
if len(scope)!=1:
    raise RuntimeError("BANK_KALBAR_ICOFR_2026_SCOPE_NOT_FOUND")
scope_id=str(scope[0]["id"])

# Keep only taxonomy reference data aligned with the existing process UI.
cat_sql=[]
for code,(name,order_idx) in CATEGORY_META.items():
    cat_sql.append(f"""
INSERT INTO ProcessCategory(id,code,name,description,orderIndex,createdAt)
VALUES({q('ref:'+code)},{q(code)},{q(name)},NULL,{order_idx},{q(now)})
ON CONFLICT(code) DO UPDATE SET name=excluded.name,orderIndex=excluded.orderIndex;
""")
execute("\n".join(cat_sql),"/tmp/bpm_completion_categories.sql")
cats={str(x["code"]):x for x in rows("SELECT id,code,name FROM ProcessCategory")}

created=[]
updated=[]
process_ids={}

for source_code,target in TARGETS.items():
    category=cats.get(target["categoryCode"])
    if not category:
        raise RuntimeError("PROCESS_CATEGORY_MISSING_"+target["categoryCode"])

    existing_by_code=rows(
        "SELECT * FROM BusinessProcess WHERE institutionId="+q(iid)+
        " AND processId="+q(target["processId"])+" LIMIT 2"
    )
    existing_by_name=rows(
        "SELECT * FROM BusinessProcess WHERE institutionId="+q(iid)+
        " AND lower(name)=lower("+q(target["name"])+") LIMIT 2"
    )
    if len(existing_by_code)>1 or len(existing_by_name)>1:
        raise RuntimeError("DUPLICATE_BPM_MASTER_"+source_code)

    existing=(existing_by_code or existing_by_name)
    tags=json.dumps({
        "sourceBacked":True,
        "feedBatch":BATCH,
        "icoFrScopingCode":source_code,
        "icoFrFiscalYear":2026,
        "sourceReference":SOURCE_REFERENCE,
        "memoReference":MEMO_REFERENCE,
        "scopeApproved":True,
        "detailStatus":"L2_SOURCE_CONFIRMED_FLOW_DETAIL_PENDING",
        "reviewRequired":True,
        "activitiesFabricated":False,
        "sipocFabricated":False
    },ensure_ascii=False,separators=(",",":"))

    if existing:
        row=existing[0]
        pid=str(row["id"])
        # Preserve any owner/org-unit or richer status already confirmed by another source;
        # update only source-supported identity/taxonomy/ICOFR flags and tags.
        sql=f"""
UPDATE BusinessProcess
SET legalEntityId=COALESCE(legalEntityId,{q(entity_id)}),
    categoryId={q(category['id'])},
    processId={q(target['processId'])},
    name={q(target['name'])},
    level=2,
    parentProcessId=NULL,
    description=CASE
      WHEN description IS NULL OR trim(description)='' THEN {q(target['description'])}
      ELSE description
    END,
    criticality=COALESCE(NULLIF(criticality,''),'Not Assessed'),
    classification={q(target['classification'])},
    isIcofrRelevant=1,
    tags={q(tags)},
    updatedAt={q(now)}
WHERE id={q(pid)};
"""
        execute(sql,"/tmp/bpm_completion_update.sql")
        updated.append(source_code)
    else:
        pid=hid(iid,"ICOFR-BPM-2026",source_code,target["processId"])
        sql=f"""
INSERT INTO BusinessProcess(
  id,institutionId,legalEntityId,orgUnitId,categoryId,processId,name,level,parentProcessId,
  description,ownerName,ownerEmail,managerName,criticality,classification,isIcofrRelevant,
  status,version,effectiveDate,reviewDate,tags,createdAt,updatedAt
) VALUES(
  {q(pid)},{q(iid)},{q(entity_id)},NULL,{q(category['id'])},{q(target['processId'])},{q(target['name'])},2,NULL,
  {q(target['description'])},'',NULL,NULL,'Not Assessed',{q(target['classification'])},1,
  'Draft','1.0',{q(effective_date)},NULL,{q(tags)},{q(now)},{q(now)}
);
"""
        execute(sql,"/tmp/bpm_completion_insert.sql")
        created.append(source_code)

    process_ids[source_code]=pid

    # Connect the source-confirmed scope item to the new/existing BPM master immediately.
    execute(
        "UPDATE ICOFRScopeItem SET sourceId="+q(pid)+",updatedAt="+q(now)+
        " WHERE scopeId="+q(scope_id)+" AND itemType='Business Process' AND code="+q(source_code)+";",
        "/tmp/bpm_completion_scope_link.sql"
    )

    audit_id=hid(iid,BATCH,source_code,"AUDIT")
    audit_payload=json.dumps({
        "sourceCode":source_code,
        "processId":target["processId"],
        "name":target["name"],
        "sourceReference":SOURCE_REFERENCE,
        "flowDetailImported":False,
        "status":"Draft"
    },ensure_ascii=False,separators=(",",":"))
    execute(f"""
INSERT OR REPLACE INTO AuditLog(
  id,institutionId,userName,userRole,action,entityType,recordId,oldValue,newValue,reason,ipAddress,timestamp
) VALUES(
  {q(audit_id)},{q(iid)},'System','System','UPSERT','Process',{q(pid)},NULL,{q(audit_payload)},
  'Complete FY2026 ICOFR BPM master linkage from approved scoping without fabricating process-flow detail.',
  NULL,{q(now)}
);
""","/tmp/bpm_completion_audit.sql")

# Verify no invented detailed BPM components were created for the two completion masters.
detail_counts={}
for source_code,pid in process_ids.items():
    c=rows(f"""
SELECT
  (SELECT COUNT(*) FROM ProcessObjective WHERE processId={q(pid)}) AS objectives,
  (SELECT COUNT(*) FROM SIPOC WHERE processId={q(pid)}) AS sipoc,
  (SELECT COUNT(*) FROM ProcessActivity WHERE processId={q(pid)}) AS activities
""")
    detail_counts[source_code]={
        "objectives":int(c[0].get("objectives") or 0),
        "sipoc":int(c[0].get("sipoc") or 0),
        "activities":int(c[0].get("activities") or 0)
    }
    if any(detail_counts[source_code].values()):
        # Existing confirmed detail is allowed only when the process pre-existed.
        if source_code in created:
            raise RuntimeError("FABRICATED_DETAIL_DETECTED_"+source_code)

linked=rows(
    "SELECT COUNT(*) AS n FROM ICOFRScopeItem WHERE scopeId="+q(scope_id)+
    " AND itemType='Business Process' AND inScope=1 AND sourceId IS NOT NULL"
)
linked_count=int(linked[0]["n"])
if linked_count!=16:
    raise RuntimeError("ICOFR_BPM_LINK_COUNT_"+str(linked_count)+"_EXPECTED_16")

masters=rows(
    "SELECT processId,name,status,isIcofrRelevant,categoryId,tags FROM BusinessProcess WHERE institutionId="+q(iid)+
    " AND processId IN ('JLN','ITGC') ORDER BY processId"
)
if len(masters)!=2:
    raise RuntimeError("BPM_COMPLETION_MASTER_COUNT_"+str(len(masters))+"_EXPECTED_2")

summary={
    "scopeId":scope_id,
    "fiscalYear":2026,
    "scopedProcesses":16,
    "linkedToBpmMaster":linked_count,
    "newOrCompletedMasters":2,
    "created":created,
    "updated":updated,
    "targets":TARGETS,
    "detailCounts":detail_counts,
    "flowDetailsFabricated":False,
    "nonBpmModulesModified":False
}
feed_id=hid(iid,BATCH)
execute(f"""
INSERT INTO OperationalDataFeedRun(
 id,institutionId,batchCode,module,sourceRole,sourceReferencesJson,recordsUpserted,status,summaryJson,completedAt
) VALUES(
 {q(feed_id)},{q(iid)},{q(BATCH)},'Business Process Management',
 'APPROVED_ICOFR_SCOPING',
 {q(json.dumps([SOURCE_REFERENCE,MEMO_REFERENCE],ensure_ascii=False,separators=(",",":")))},
 2,'Completed',{q(json.dumps(summary,ensure_ascii=False,separators=(",",":")))},{q(now)}
)
ON CONFLICT(institutionId,batchCode) DO UPDATE SET
 sourceReferencesJson=excluded.sourceReferencesJson,
 recordsUpserted=excluded.recordsUpserted,
 status='Completed',
 summaryJson=excluded.summaryJson,
 completedAt=excluded.completedAt;
""","/tmp/bpm_completion_feed.sql")

print("=== BANK KALBAR ICOFR BPM COMPLETION ===")
print(json.dumps({
    "institutionId":iid,
    "summary":summary,
    "masters":masters
},indent=2,ensure_ascii=False))
