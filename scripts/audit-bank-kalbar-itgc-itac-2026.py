import json, os, re, subprocess, time

LEGAL_NAME="PT. Bank Pembangunan Daerah Kalimantan Barat"

def wr(args,retries=5):
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

inst=rows("SELECT id,name,legalName FROM Institution WHERE legalName="+q(LEGAL_NAME)+" LIMIT 2")
if len(inst)!=1:
    raise RuntimeError("BANK_KALBAR_INSTITUTION_COUNT_"+str(len(inst)))
iid=str(inst[0]["id"])

tables={str(x["name"]) for x in rows("SELECT name FROM sqlite_master WHERE type='table'")}
required={"ControlMaster","BusinessProcess","ICOFRControlDomain","ICOFRScope","ICOFRScopeItem"}
missing=sorted(required-tables)
if missing:
    raise RuntimeError("MISSING_TABLES_"+",".join(missing))

summary={}
summary["controlMasterITGC"]=rows(f"""
SELECT c.controlId,c.name,c.type,c.nature,c.frequency,c.isKeyControl,c.isIcofrKey,c.status,
       c.systemDependency,c.evidenceRequirement,bp.processId enterpriseProcessId,bp.name processName,
       sm.mappingStatus,sm.validationStatus,sm.taxonomyStatus,sm.sourceRawApplication
FROM ControlMaster c
JOIN BusinessProcess bp ON bp.id=c.processId
LEFT JOIN RCMControlSourceMetadata sm ON sm.controlId=c.id
WHERE c.institutionId={q(iid)} AND c.isItgc=1
ORDER BY c.controlId
""")

summary["domainCounts"]=rows(f"""
SELECT category,status,COUNT(*) records,
       SUM(CASE WHEN keyControl=1 THEN 1 ELSE 0 END) keyControls,
       SUM(CASE WHEN sourceControlId IS NOT NULL AND trim(sourceControlId)<>'' THEN 1 ELSE 0 END) linkedToMaster,
       SUM(CASE WHEN systemName IS NOT NULL AND trim(systemName)<>'' THEN 1 ELSE 0 END) withSystem
FROM ICOFRControlDomain
WHERE institutionId={q(iid)} AND category IN ('ITGC','ITAC')
GROUP BY category,status
ORDER BY category,status
""")

summary["domainRecords"]=rows(f"""
SELECT category,controlCode,name,subcategory,owner,frequency,nature,controlType,systemName,processName,
       financialStatementArea,assertions,sourceControlId,keyControl,status
FROM ICOFRControlDomain
WHERE institutionId={q(iid)} AND category IN ('ITGC','ITAC')
ORDER BY category,controlCode
""")

if "ICOFRControlDependency" in tables:
    summary["dependencies"]=rows(f"""
SELECT d.id,d.dependencyType,d.status,d.rationale,
       s.controlCode sourceCode,s.name sourceName,s.category sourceCategory,
       g.controlCode dependencyCode,g.name dependencyName,g.category dependencyCategory
FROM ICOFRControlDependency d
LEFT JOIN ICOFRControlDomain s ON s.id=d.sourceControlId
LEFT JOIN ICOFRControlDomain g ON g.id=d.dependencyControlId
WHERE d.institutionId={q(iid)}
ORDER BY s.controlCode,g.controlCode
""")
else:
    summary["dependencies"]=[]

latest_scope=rows(f"""
SELECT id,fiscalYear,scopeName,status,updatedAt
FROM ICOFRScope
WHERE institutionId={q(iid)} AND fiscalYear=2026
ORDER BY updatedAt DESC
LIMIT 1
""")
summary["latestScope"]=latest_scope
if latest_scope:
    sid=str(latest_scope[0]["id"])
    summary["applicationScope"]=rows(f"""
SELECT code,name,inScope,rationale
FROM ICOFRScopeItem
WHERE scopeId={q(sid)} AND itemType='IT System'
ORDER BY code,name
""")
else:
    summary["applicationScope"]=[]

summary["candidateITACByCanonicalNature"]=rows(f"""
SELECT c.controlId,c.name,c.nature,c.type,c.method,c.frequency,c.systemDependency,c.status,
       bp.processId enterpriseProcessId,bp.name processName,
       sm.sourceRawNature,sm.sourceRawType,sm.sourceRawApplication,sm.validationStatus,sm.taxonomyStatus
FROM ControlMaster c
JOIN BusinessProcess bp ON bp.id=c.processId
LEFT JOIN RCMControlSourceMetadata sm ON sm.controlId=c.id
WHERE c.institutionId={q(iid)}
  AND c.isItgc=0
  AND (
    lower(COALESCE(c.nature,'')) LIKE '%automat%'
    OR lower(COALESCE(c.nature,'')) LIKE '%otomatis%'
    OR lower(COALESCE(c.method,'')) LIKE '%automat%'
    OR lower(COALESCE(c.method,'')) LIKE '%system%'
  )
ORDER BY c.controlId
""")

summary["itgcSystemNaming"]=rows(f"""
SELECT
 SUM(CASE WHEN lower(COALESCE(systemDependency,'')) LIKE '%olibs%' THEN 1 ELSE 0 END) olibsReferences,
 SUM(CASE WHEN lower(COALESCE(systemDependency,'')) LIKE '%alfabits%' THEN 1 ELSE 0 END) alfabitsReferences,
 SUM(CASE WHEN trim(COALESCE(systemDependency,''))='' THEN 1 ELSE 0 END) missingSystem
FROM ControlMaster
WHERE institutionId={q(iid)} AND isItgc=1
""")[0]

summary["itgcDomainDistribution"]={}
for prefix,label in [("ITGC-APD-","Access to Program and Data"),("ITGC-PD-","Program Development"),("ITGC-PC-","Program Changes"),("ITGC-CO-","Computer Operations")]:
    n=rows("SELECT COUNT(*) n FROM ControlMaster WHERE institutionId="+q(iid)+" AND isItgc=1 AND controlId LIKE "+q(prefix+"%"))[0]["n"]
    summary["itgcDomainDistribution"][label]=int(n)

summary["counts"]={
    "controlMasterITGC":len(summary["controlMasterITGC"]),
    "dedicatedITGC":sum(int(x["records"]) for x in summary["domainCounts"] if x["category"]=="ITGC"),
    "dedicatedITAC":sum(int(x["records"]) for x in summary["domainCounts"] if x["category"]=="ITAC"),
    "itacItgcDependencies":len(summary["dependencies"]),
    "applicationScopeTotal":len(summary["applicationScope"]),
    "applicationScopeIn":sum(1 for x in summary["applicationScope"] if int(x.get("inScope") or 0)==1),
    "candidateITACByCanonicalNature":len(summary["candidateITACByCanonicalNature"]),
}

summary["integrity"]={
    "itgcCountExpected10":len(summary["controlMasterITGC"])==10,
    "fourDomainsCovered":summary["itgcDomainDistribution"]=={
        "Access to Program and Data":4,
        "Program Development":1,
        "Program Changes":1,
        "Computer Operations":4,
    },
    "itacDependenciesValid":all(x.get("sourceCategory")=="ITAC" and x.get("dependencyCategory")=="ITGC" for x in summary["dependencies"]),
}

print("=== BANK KALBAR ITGC ITAC AUDIT ===")
print(json.dumps(summary,indent=2,ensure_ascii=False))
