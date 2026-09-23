import json
import os
import re
import subprocess
import time

LEGAL_NAME = "PT. Bank Pembangunan Daerah Kalimantan Barat"

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

inst=rows("SELECT id,name,legalName FROM Institution WHERE legalName="+q(LEGAL_NAME)+" LIMIT 2")
if len(inst)!=1:
    raise RuntimeError("BANK_KALBAR_INSTITUTION_COUNT_"+str(len(inst)))
iid=str(inst[0]["id"])

tables={str(x["name"]) for x in rows("SELECT name FROM sqlite_master WHERE type='table'")}
required={"ControlMaster","ControlRiskMapping","RiskMaster","BusinessProcess"}
missing=sorted(required-tables)
if missing:
    raise RuntimeError("MISSING_CORE_TABLES_"+",".join(missing))

summary={}
summary["controls"]=rows(f"""
SELECT
  COUNT(*) total,
  SUM(CASE WHEN isKeyControl=1 THEN 1 ELSE 0 END) keyControls,
  SUM(CASE WHEN isIcofrKey=1 THEN 1 ELSE 0 END) icofrKeyControls,
  SUM(CASE WHEN isItgc=1 THEN 1 ELSE 0 END) itgcControls,
  SUM(CASE WHEN trim(COALESCE(evidenceRequirement,''))='' THEN 1 ELSE 0 END) missingEvidence,
  SUM(CASE WHEN trim(COALESCE(systemDependency,''))='' THEN 1 ELSE 0 END) missingSystem,
  SUM(CASE WHEN lower(COALESCE(systemDependency,'')) LIKE '%olibs%' THEN 1 ELSE 0 END) olibsReferences,
  SUM(CASE WHEN lower(COALESCE(systemDependency,'')) LIKE '%alfabits%' THEN 1 ELSE 0 END) alfabitsReferences
FROM ControlMaster
WHERE institutionId={q(iid)}
""")[0]
summary["mappings"]=rows(f"""
SELECT
  COUNT(*) totalMappings,
  COUNT(DISTINCT controlId) mappedControls,
  COUNT(DISTINCT riskId) mappedRisks
FROM ControlRiskMapping
WHERE controlId IN (SELECT id FROM ControlMaster WHERE institutionId={q(iid)})
""")[0]
summary["risks"]=rows(f"""
SELECT
  COUNT(*) totalRisks,
  SUM(CASE WHEN status='Draft' THEN 1 ELSE 0 END) draftRisks,
  SUM(CASE WHEN inherentRating='Not Assessed' THEN 1 ELSE 0 END) unassessedRisks
FROM RiskMaster
WHERE institutionId={q(iid)}
""")[0]

for label,column in [
    ("byProcess","bp.processId,bp.name"),
    ("byType","c.type"),
    ("byNature","c.nature"),
    ("byFrequency","c.frequency"),
    ("byStatus","c.status"),
]:
    if label=="byProcess":
        summary[label]=rows(f"""
SELECT bp.processId,bp.name,COUNT(*) controls,
       SUM(CASE WHEN c.isKeyControl=1 THEN 1 ELSE 0 END) keyControls,
       SUM(CASE WHEN c.isItgc=1 THEN 1 ELSE 0 END) itgcControls
FROM ControlMaster c
JOIN BusinessProcess bp ON bp.id=c.processId
WHERE c.institutionId={q(iid)}
GROUP BY bp.processId,bp.name
ORDER BY controls DESC,bp.processId
""")
    else:
        col=column
        summary[label]=rows(f"""
SELECT COALESCE(NULLIF(trim({col}),''),'(blank)') value,COUNT(*) records
FROM ControlMaster c
WHERE c.institutionId={q(iid)}
GROUP BY COALESCE(NULLIF(trim({col}),''),'(blank)')
ORDER BY records DESC,value
""")

summary["duplicates"]=rows(f"""
SELECT controlId,COUNT(*) records
FROM ControlMaster
WHERE institutionId={q(iid)}
GROUP BY controlId
HAVING COUNT(*)>1
ORDER BY records DESC,controlId
""")

targets=[
    "R-012","R-013","R-014","R-015","R-016","R-017",
    "R-018","R-019","R-020","R-021","R-022",
    "R-023","R-024","R-025","R-026",
    "ITGC-APD-01","ITGC-APD-02","ITGC-APD-03","ITGC-APD-04",
    "ITGC-PD-01","ITGC-PC-01",
    "ITGC-CO-01","ITGC-CO-02","ITGC-CO-03","ITGC-CO-04",
]
target_list=",".join(q(x) for x in targets)
summary["targetControls"]=rows(f"""
SELECT c.id,c.controlId,c.name,c.processId,bp.processId enterpriseProcessId,bp.name processName,
       c.type,c.nature,c.frequency,c.isKeyControl,c.isIcofrKey,c.isItgc,c.status,
       c.evidenceRequirement,c.systemDependency
FROM ControlMaster c
LEFT JOIN BusinessProcess bp ON bp.id=c.processId
WHERE c.institutionId={q(iid)} AND c.controlId IN ({target_list})
ORDER BY c.controlId
""")

summary["targetRiskLike"]=rows(f"""
SELECT r.id,r.riskId,r.name,bp.processId enterpriseProcessId,bp.name processName,r.status
FROM RiskMaster r
JOIN BusinessProcess bp ON bp.id=r.processId
WHERE r.institutionId={q(iid)}
  AND (
    r.riskId IN ({target_list})
    OR lower(r.name) LIKE '%loss event%'
    OR lower(r.name) LIKE '%komitmen%'
    OR lower(r.name) LIKE '%ekuitas%'
    OR lower(r.name) LIKE '%user id%'
    OR lower(r.name) LIKE '%backup%'
  )
ORDER BY r.riskId
LIMIT 120
""")

if "OperationalControlMetadata" in tables:
    summary["controlMetadata"]=rows(f"""
SELECT feedBatch,COUNT(*) records,
       SUM(CASE WHEN reviewRequired=1 THEN 1 ELSE 0 END) reviewRequired
FROM OperationalControlMetadata
WHERE institutionId={q(iid)}
GROUP BY feedBatch
ORDER BY feedBatch
""")
else:
    summary["controlMetadata"]="TABLE_NOT_PRESENT"

if "SourceStructuredRecord" in tables:
    summary["sourceControlCandidates"]=rows(f"""
SELECT recordType,COUNT(*) records
FROM SourceStructuredRecord
WHERE institutionId={q(iid)} AND status='Active'
  AND (
    lower(recordType) LIKE '%control%'
    OR lower(recordType) LIKE '%rcm%'
    OR lower(recordTitle) LIKE '%control%'
  )
GROUP BY recordType
ORDER BY records DESC,recordType
""")
else:
    summary["sourceControlCandidates"]="TABLE_NOT_PRESENT"

print("=== BANK KALBAR RCM LIVE AUDIT ===")
print(json.dumps({
    "institution":inst[0],
    "database":DB,
    "summary":summary,
},indent=2,ensure_ascii=False))
