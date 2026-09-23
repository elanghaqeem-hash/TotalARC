import hashlib
import json
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

LEGAL_NAME = "PT. Bank Pembangunan Daerah Kalimantan Barat"
BATCH = "BANK_KALBAR_ITGC_ITAC_HARDENING_20260923"
SOURCE_REF = "SERAYA:1Lk6fLui8M6jFH20TuCEzZbergBDAqfBh#BPM-RCM-Walkthrough ITGC ver.3"

DOMAIN_BY_CODE = {
    "ITGC-APD-": "Access to Program and Data",
    "ITGC-PD-": "Program Development",
    "ITGC-PC-": "Program Changes",
    "ITGC-CO-": "Computer Operations",
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
    return "NULL" if v is None else "'" + str(v).replace("'","''") + "'"

def hid(*parts):
    return hashlib.sha256("|".join(map(str,parts)).encode()).hexdigest()[:40]

def execute(sql,path):
    Path(path).write_text(sql,encoding="utf-8")
    wr(["d1","execute",DB,"--remote","--file",path])

def clean(v):
    return str(v or "").strip()

def frequency(v):
    raw=clean(v)
    mapping={
        "Harian":"Daily",
        "Bulanan":"Monthly",
        "Semesteran":"Semi-Annual",
        "Ad-hoc (berdasarkan kejadian)":"Event Driven",
        "Ad-hoc/Sesuai Kejadian":"Event Driven",
        "-":"Pending Validation",
        "":"Pending Validation",
    }
    return mapping.get(raw,raw)

def nature(v):
    raw=clean(v)
    mapping={
        "Manual":"Manual",
        "Otomatis":"Automated",
        "ITDM-IPE":"ITDM-IPE",
        "ITDM-EUC":"ITDM-EUC",
        "MRC":"MRC",
    }
    return mapping.get(raw,raw or "Pending Validation")

def control_type(v):
    raw=clean(v)
    mapping={
        "Preventif":"Preventive",
        "Detektif":"Detective",
        "Preventif & Detektif":"Preventive & Detective",
    }
    return mapping.get(raw,raw or "Pending Validation")

def canonical_systems(v):
    raw=clean(v)
    if not raw:
        return None
    # RCM hardening already canonicalized OLIBS/Core Banking to ALFABITS.
    parts=[x.strip() for x in raw.split(",") if x.strip()]
    seen=set()
    out=[]
    for part in parts:
        key=part.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(part)
    return "; ".join(out) if out else None

def domain(code):
    for prefix,label in DOMAIN_BY_CODE.items():
        if code.startswith(prefix):
            return label
    raise RuntimeError("UNKNOWN_ITGC_DOMAIN_"+code)

now=datetime.now(timezone.utc).isoformat().replace("+00:00","Z")

inst=rows("SELECT id,name,legalName FROM Institution WHERE legalName="+q(LEGAL_NAME)+" LIMIT 2")
if len(inst)!=1:
    raise RuntimeError("BANK_KALBAR_INSTITUTION_COUNT_"+str(len(inst)))
iid=str(inst[0]["id"])

ddl="""
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
  ON ICOFRControlDomain(institutionId,category,controlCode);
CREATE INDEX IF NOT EXISTS idx_icofr_control_domain_category
  ON ICOFRControlDomain(institutionId,category);
"""
execute(ddl,"/tmp/itgc_domain_ddl.sql")

itgc=rows(f"""
SELECT c.id,c.controlId,c.name,c.description,c.objective,c.controlOwner,c.performer,c.reviewer,
       c.type,c.nature,c.frequency,c.isKeyControl,c.isIcofrKey,c.systemDependency,c.evidenceRequirement,
       c.status,bp.name processName,
       sm.validationStatus,sm.taxonomyStatus,sm.sourceRawApplication,sm.sourceRawFunction,sm.sourceRawPerformer
FROM ControlMaster c
JOIN BusinessProcess bp ON bp.id=c.processId
LEFT JOIN RCMControlSourceMetadata sm ON sm.controlId=c.id
WHERE c.institutionId={q(iid)} AND c.isItgc=1
ORDER BY c.controlId
""")
if len(itgc)!=10:
    raise RuntimeError("ITGC_CONTROLMASTER_COUNT_"+str(len(itgc))+"_10")

upserts=[]
for c in itgc:
    code=clean(c["controlId"])
    subcategory=domain(code)
    risk_rows=rows(f"""
SELECT r.riskId,r.name
FROM ControlRiskMapping m
JOIN RiskMaster r ON r.id=m.riskId
WHERE m.controlId={q(c["id"])}
ORDER BY r.riskId
""")
    risk_desc=" | ".join(clean(x.get("name")) for x in risk_rows if clean(x.get("name"))) or None
    owner=clean(c.get("controlOwner")) or clean(c.get("sourceRawFunction")) or "Divisi Teknologi Informasi"
    reviewer=clean(c.get("reviewer")) or clean(c.get("sourceRawPerformer")) or None
    status="Under Review" if clean(c.get("validationStatus"))=="WALKTHROUGH_PENDING" else "Draft"
    domain_id=hid(iid,"ICOFR-DOMAIN","ITGC",code)
    upserts.append(f"""
INSERT INTO ICOFRControlDomain(
 id,institutionId,category,controlCode,name,subcategory,objective,riskDescription,
 owner,reviewer,frequency,nature,controlType,systemName,processName,financialStatementArea,
 assertions,frameworkReference,sourceControlId,keyControl,status,createdAt,updatedAt
) VALUES(
 {q(domain_id)},{q(iid)},'ITGC',{q(code)},{q(c["name"])},{q(subcategory)},
 {q(clean(c.get("objective")) or "Support reliable financial reporting through effective general IT controls.")},
 {q(risk_desc)},{q(owner)},{q(reviewer)},{q(frequency(c.get("frequency")))},{q(nature(c.get("nature")))},
 {q(control_type(c.get("type")))},{q(canonical_systems(c.get("systemDependency")))},{q(c.get("processName"))},
 NULL,NULL,{q("SK-5/DKU.MBU/11/2024 · COBIT 2019 · "+SOURCE_REF)},{q(c["id"])},
 {1 if int(c.get("isKeyControl") or 0)==1 else 0},{q(status)},{q(now)},{q(now)}
)
ON CONFLICT(institutionId,category,controlCode) DO UPDATE SET
 name=excluded.name,subcategory=excluded.subcategory,objective=excluded.objective,
 riskDescription=excluded.riskDescription,owner=excluded.owner,reviewer=excluded.reviewer,
 frequency=excluded.frequency,nature=excluded.nature,controlType=excluded.controlType,
 systemName=excluded.systemName,processName=excluded.processName,
 frameworkReference=excluded.frameworkReference,sourceControlId=excluded.sourceControlId,
 keyControl=excluded.keyControl,status=excluded.status,updatedAt=excluded.updatedAt;
""")
execute("\n".join(upserts),"/tmp/itgc_domain_upsert.sql")

# ITAC stays candidate-only until Process Owner / walkthrough validation.
# Do not create ICOFRControlDomain ITAC records from contradictory legacy classifications.
itac_existing=rows(
    "SELECT id,controlCode,status FROM ICOFRControlDomain WHERE institutionId="+q(iid)+" AND category='ITAC'"
)
if itac_existing:
    raise RuntimeError("ITAC_ACTIVE_OR_DRAFT_REGISTER_ALREADY_POPULATED_REVIEW_REQUIRED")

candidates=rows(f"""
SELECT c.id,c.controlId,c.name,c.nature,c.type,c.method,c.frequency,c.systemDependency,c.status,
       bp.processId enterpriseProcessId,bp.name processName,
       sm.sourceRawNature,sm.sourceRawType,sm.sourceRawApplication,sm.validationStatus,sm.taxonomyStatus
FROM ControlMaster c
JOIN BusinessProcess bp ON bp.id=c.processId
LEFT JOIN RCMControlSourceMetadata sm ON sm.controlId=c.id
WHERE c.institutionId={q(iid)}
  AND c.isItgc=0
  AND c.status='Draft'
  AND (
    lower(COALESCE(c.nature,'')) LIKE '%automat%'
    OR lower(COALESCE(c.nature,'')) LIKE '%otomatis%'
    OR lower(COALESCE(c.method,'')) LIKE '%automat%'
    OR lower(COALESCE(c.method,'')) LIKE '%interface%'
  )
ORDER BY c.controlId
""")

candidate_summary=[]
for c in candidates:
    contradiction=(
        "tidak berlaku" in clean(c.get("systemDependency")).lower()
        or "pengendalian manual" in clean(c.get("systemDependency")).lower()
    )
    candidate_summary.append({
        "controlId":c["controlId"],
        "name":c["name"],
        "processId":c["enterpriseProcessId"],
        "systemDependency":c.get("systemDependency"),
        "method":c.get("method"),
        "validationStatus":c.get("validationStatus"),
        "candidateStatus":"CONTRADICTORY_SOURCE_CLASSIFICATION" if contradiction else "PROCESS_OWNER_REVIEW_PENDING",
    })

domain_records=rows(f"""
SELECT id,controlCode,subcategory,sourceControlId,status,systemName
FROM ICOFRControlDomain
WHERE institutionId={q(iid)} AND category='ITGC'
ORDER BY controlCode
""")
if len(domain_records)!=10:
    raise RuntimeError("DEDICATED_ITGC_COUNT_"+str(len(domain_records))+"_10")
if len({str(x["sourceControlId"]) for x in domain_records})!=10:
    raise RuntimeError("ITGC_SOURCE_LINK_UNIQUENESS_FAILED")

dist={}
for x in domain_records:
    dist[str(x["subcategory"])]=dist.get(str(x["subcategory"]),0)+1
expected={
    "Access to Program and Data":4,
    "Program Development":1,
    "Program Changes":1,
    "Computer Operations":4,
}
if dist!=expected:
    raise RuntimeError("ITGC_DOMAIN_DISTRIBUTION_"+json.dumps(dist,ensure_ascii=False))

olibs_count=sum(1 for x in domain_records if "olibs" in clean(x.get("systemName")).lower())
if olibs_count:
    raise RuntimeError("CANONICAL_ITGC_OLIBS_REFERENCE_REMAINS_"+str(olibs_count))

scope=rows(
    "SELECT id FROM ICOFRScope WHERE institutionId="+q(iid)+" AND fiscalYear=2026 ORDER BY updatedAt DESC LIMIT 1"
)
app_summary={"total":0,"inScope":0}
if scope:
    sid=str(scope[0]["id"])
    app_rows=rows(
        "SELECT inScope,COUNT(*) n FROM ICOFRScopeItem WHERE scopeId="+q(sid)+
        " AND itemType='IT System' GROUP BY inScope ORDER BY inScope"
    )
    app_summary["total"]=sum(int(x["n"]) for x in app_rows)
    app_summary["inScope"]=sum(int(x["n"]) for x in app_rows if int(x.get("inScope") or 0)==1)

summary={
    "dedicatedITGC":len(domain_records),
    "itgcFourDomainDistribution":dist,
    "itgcLinkedToControlMaster":len({str(x["sourceControlId"]) for x in domain_records}),
    "itgcCanonicalOlibsReferences":olibs_count,
    "itgcValidationStatus":"WALKTHROUGH_PENDING",
    "dedicatedITAC":len(itac_existing),
    "itacCandidates":candidate_summary,
    "itacCandidateCount":len(candidate_summary),
    "applicationScope":app_summary,
    "policy":"ITAC candidates are not promoted until source classification, actual application dependency and Process Owner/walkthrough evidence are validated.",
}
print("=== BANK KALBAR ITGC ITAC HARDENING RESULT ===")
print(json.dumps(summary,indent=2,ensure_ascii=False))
