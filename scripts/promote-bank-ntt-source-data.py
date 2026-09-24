import hashlib, json, os, re, subprocess, sys, time
from datetime import datetime, timezone
from pathlib import Path

SOURCE = Path(sys.argv[1] if len(sys.argv) > 1 else 'data/bank-ntt-source-2025.json')
data = json.loads(SOURCE.read_text())
inst = data['institution']; legal_name = inst['legalName']; batch = data['batch']
annual_src = data['sources']['annualReport']; bpm_src = data['sources']['businessProcess']

def wr(args, retries=5):
    last = None
    for attempt in range(retries):
        p = subprocess.run(['npx','wrangler',*args], text=True, env=os.environ, capture_output=True)
        if p.returncode == 0: return p.stdout
        last = p; time.sleep(2 + attempt * 2)
    print((last.stdout if last else '')[-3000:]); print((last.stderr if last else '')[-3000:])
    raise RuntimeError('WRANGLER_COMMAND_FAILED')
def q(v): return 'NULL' if v is None else "'" + str(v).replace("'", "''") + "'"
def hid(*parts): return hashlib.sha256('|'.join(map(str,parts)).encode()).hexdigest()[:40]

dbs = json.loads(wr(['d1','list','--json']))
db = next((x for x in dbs if re.search(r'total.?arc', x['name'], re.I)), None) or (dbs[0] if len(dbs)==1 else None)
if not db: raise RuntimeError('TOTAL_ARC_D1_NOT_FOUND')
DB = db['name']; now = datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
def rows(sql):
    raw = json.loads(wr(['d1','execute',DB,'--remote','--json','--command',sql])); raw = raw if isinstance(raw,list) else [raw]
    return [r for block in raw for r in (block.get('results') or [])]
def runfile(sql, name):
    path = '/tmp/' + name; Path(path).write_text(sql); wr(['d1','execute',DB,'--remote','--file',path])
def table_exists(name): return int(rows("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name="+q(name))[0]['n']) > 0
def count(table, iid): return 0 if not iid or not table_exists(table) else int(rows(f'SELECT COUNT(*) AS n FROM {table} WHERE institutionId={q(iid)}')[0]['n'])

for required in ['Institution','LegalEntity','OrganizationUnit']:
    if not table_exists(required): raise RuntimeError('CORE_TABLE_MISSING_'+required)
runfile('''
CREATE TABLE IF NOT EXISTS InstitutionSourceSnapshot(id TEXT PRIMARY KEY NOT NULL,institutionId TEXT NOT NULL,sourceCode TEXT NOT NULL,sourceType TEXT NOT NULL,sourceName TEXT NOT NULL,sourceSha256 TEXT,asOfDate TEXT,payloadJson TEXT NOT NULL,validationStatus TEXT NOT NULL,importedAt TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_institution_source_snapshot ON InstitutionSourceSnapshot(institutionId,sourceCode);
CREATE TABLE IF NOT EXISTS OrganizationHierarchyEvidence(unitId TEXT PRIMARY KEY NOT NULL,institutionId TEXT NOT NULL,sourceStatus TEXT NOT NULL,hierarchyStatus TEXT NOT NULL,sourceReferencesJson TEXT NOT NULL,sourceNote TEXT,asOfDate TEXT,updatedAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS OperationalDataFeedRun(id TEXT PRIMARY KEY NOT NULL,institutionId TEXT NOT NULL,batchCode TEXT NOT NULL,module TEXT NOT NULL,sourceRole TEXT NOT NULL,sourceReferencesJson TEXT NOT NULL,recordsUpserted INTEGER NOT NULL,status TEXT NOT NULL,summaryJson TEXT,completedAt TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_operational_feed_batch ON OperationalDataFeedRun(institutionId,batchCode);
''','ntt_ddl.sql')

kalbar = rows("SELECT id FROM Institution WHERE legalName='PT. Bank Pembangunan Daerah Kalimantan Barat' LIMIT 1")
kalbar_id = str(kalbar[0]['id']) if kalbar else None
tracked = ['LegalEntity','OrganizationUnit','BusinessProcess','RiskMaster','ControlMaster']
before = {t:count(t,kalbar_id) for t in tracked} if kalbar_id else None

existing = rows('SELECT * FROM Institution WHERE legalName='+q(legal_name)+' LIMIT 1')
iid = str(existing[0]['id']) if existing else hid('TOTALARC','BANK-NTT','INSTITUTION')
created = str(existing[0].get('createdAt') or now) if existing else now
cols = ['id','name','legalName','shortName','institutionType','country','provinceState','city','registeredAddress','operationalAddress','website','generalEmail','telephone','yearEstablished','registrationNumber','taxId','parentCompany','holdingCompany','stockExchange','ticker','logo','employeeCount','revenueRange','businessModel','operatingModel','createdAt','updatedAt']
vals = [iid,inst['name'],legal_name,inst['shortName'],inst['institutionType'],inst['country'],inst.get('provinceState'),inst.get('city'),inst.get('registeredAddress'),inst.get('operationalAddress'),inst.get('website'),inst.get('generalEmail'),inst.get('telephone'),inst.get('yearEstablished'),inst.get('registrationNumber'),inst.get('taxId'),None,None,None,None,None,inst.get('employeeCount'),None,inst.get('businessModel'),inst.get('operatingModel'),created,now]
updates = ','.join(f'{c}=excluded.{c}' for c in cols[1:-2]) + ',updatedAt=excluded.updatedAt'
runfile(f"INSERT INTO Institution({','.join(cols)}) VALUES({','.join(q(v) for v in vals)}) ON CONFLICT(id) DO UPDATE SET {updates};",'ntt_institution.sql')

entity_code = data['legalEntity']['code']; entity = rows('SELECT * FROM LegalEntity WHERE institutionId='+q(iid)+' AND code='+q(entity_code)+' LIMIT 1')
eid = str(entity[0]['id']) if entity else hid(iid,entity_code,'LEGAL'); ecreated = str(entity[0].get('createdAt') or now) if entity else now
runfile(f"INSERT INTO LegalEntity(id,institutionId,code,name,country,taxId,createdAt,updatedAt) VALUES({q(eid)},{q(iid)},{q(entity_code)},{q(legal_name)},{q(inst['country'])},{q(inst.get('taxId'))},{q(ecreated)},{q(now)}) ON CONFLICT(institutionId,code) DO UPDATE SET name=excluded.name,country=excluded.country,taxId=excluded.taxId,updatedAt=excluded.updatedAt;",'ntt_entity.sql')
eid = str(rows('SELECT id FROM LegalEntity WHERE institutionId='+q(iid)+' AND code='+q(entity_code)+' LIMIT 1')[0]['id'])

units = data['organizationUnits']; branches = data['branches']; unit_ids = {u['code']:hid(iid,u['code']) for u in units}
for n in range(1,len(branches)+1): unit_ids[f'NTT-BR-{n:02d}'] = hid(iid,f'NTT-BR-{n:02d}')
refs = json.dumps([annual_src['ref']],ensure_ascii=False,separators=(',',':')); stm=[]
for u in units:
    parent_id = unit_ids.get(u.get('parentCode')) if u.get('parentCode') else None
    stm.append(f"INSERT INTO OrganizationUnit(id,institutionId,legalEntityId,parentId,type,code,name,headName,headEmail,status,createdAt,updatedAt) VALUES({q(unit_ids[u['code']])},{q(iid)},{q(eid)},{q(parent_id)},{q(u['type'])},{q(u['code'])},{q(u['name'])},{q(u.get('headName'))},NULL,'Active',{q(now)},{q(now)}) ON CONFLICT(institutionId,code) DO UPDATE SET legalEntityId=excluded.legalEntityId,parentId=excluded.parentId,type=excluded.type,name=excluded.name,headName=excluded.headName,status='Active',updatedAt=excluded.updatedAt;")
    stm.append(f"INSERT INTO OrganizationHierarchyEvidence(unitId,institutionId,sourceStatus,hierarchyStatus,sourceReferencesJson,sourceNote,asOfDate,updatedAt) VALUES({q(unit_ids[u['code']])},{q(iid)},'SOURCE_VERIFIED','SOURCE_BACKED_PARENT',{q(refs)},'Annual Report 2025 organization structure pp.110-111; ICoFR placement pp.29-30 where applicable.',{q(annual_src['asOfDate'])},{q(now)}) ON CONFLICT(unitId) DO UPDATE SET institutionId=excluded.institutionId,sourceStatus=excluded.sourceStatus,hierarchyStatus=excluded.hierarchyStatus,sourceReferencesJson=excluded.sourceReferencesJson,sourceNote=excluded.sourceNote,asOfDate=excluded.asOfDate,updatedAt=excluded.updatedAt;")
for n,name in enumerate(branches,1):
    code=f'NTT-BR-{n:02d}'; uid=unit_ids[code]
    stm.append(f"INSERT INTO OrganizationUnit(id,institutionId,legalEntityId,parentId,type,code,name,headName,headEmail,status,createdAt,updatedAt) VALUES({q(uid)},{q(iid)},{q(eid)},{q(unit_ids['NTT-EXEC-DIREKSI'])},'Branch',{q(code)},{q(name)},NULL,NULL,'Active',{q(now)},{q(now)}) ON CONFLICT(institutionId,code) DO UPDATE SET legalEntityId=excluded.legalEntityId,parentId=excluded.parentId,type='Branch',name=excluded.name,status='Active',updatedAt=excluded.updatedAt;")
    stm.append(f"INSERT INTO OrganizationHierarchyEvidence(unitId,institutionId,sourceStatus,hierarchyStatus,sourceReferencesJson,sourceNote,asOfDate,updatedAt) VALUES({q(uid)},{q(iid)},'SOURCE_VERIFIED','SOURCE_BACKED_NETWORK',{q(refs)},'Annual Report 2025 office network p.118; branch normalized under Direksi because no specific director reporting line is asserted by the source.',{q(annual_src['asOfDate'])},{q(now)}) ON CONFLICT(unitId) DO UPDATE SET institutionId=excluded.institutionId,sourceStatus=excluded.sourceStatus,hierarchyStatus=excluded.hierarchyStatus,sourceReferencesJson=excluded.sourceReferencesJson,sourceNote=excluded.sourceNote,asOfDate=excluded.asOfDate,updatedAt=excluded.updatedAt;")
runfile('\n'.join(stm),'ntt_org.sql')

annual = data['annualReportSnapshot']; bpm = data['businessProcessSnapshot']
annual = {'institutionMaster':inst, **annual}
snap = f"""INSERT INTO InstitutionSourceSnapshot(id,institutionId,sourceCode,sourceType,sourceName,sourceSha256,asOfDate,payloadJson,validationStatus,importedAt) VALUES({q(hid(iid,'AR2025'))},{q(iid)},'BNTT-AR-2025','Annual Report',{q(annual_src['name'])},{q(annual_src['sha256'])},{q(annual_src['asOfDate'])},{q(json.dumps(annual,ensure_ascii=False,separators=(',',':')))},'SOURCE_VERIFIED',{q(now)}) ON CONFLICT(institutionId,sourceCode) DO UPDATE SET sourceSha256=excluded.sourceSha256,payloadJson=excluded.payloadJson,validationStatus=excluded.validationStatus,importedAt=excluded.importedAt;
INSERT INTO InstitutionSourceSnapshot(id,institutionId,sourceCode,sourceType,sourceName,sourceSha256,asOfDate,payloadJson,validationStatus,importedAt) VALUES({q(hid(iid,'BPM-LK-CBS'))},{q(iid)},'BNTT-BPM-LK-CBS','Business Process Workbook',{q(bpm_src['name'])},{q(bpm_src['sha256'])},NULL,{q(json.dumps(bpm,ensure_ascii=False,separators=(',',':')))},'SOURCE_BACKED_PENDING_USER_VALIDATION',{q(now)}) ON CONFLICT(institutionId,sourceCode) DO UPDATE SET sourceSha256=excluded.sourceSha256,payloadJson=excluded.payloadJson,validationStatus=excluded.validationStatus,importedAt=excluded.importedAt;"""
runfile(snap,'ntt_snapshots.sql')

summary={'institution':legal_name,'institutionId':iid,'legalEntityCode':entity_code,'centralUnits':len(units),'branchUnits':len(branches),'sourceSnapshots':2,'annualReportSha256':annual_src['sha256'],'businessProcessWorkbookSha256':bpm_src['sha256'],'bpmPromotionStatus':'STAGED_SOURCE_BACKED_PENDING_USER_VALIDATION','tenantIsolation':{'orgPrefix':'NTT-','sourceCodePrefix':'BNTT-','bankKalbarRowsMutated':False}}
runfile(f"INSERT INTO OperationalDataFeedRun(id,institutionId,batchCode,module,sourceRole,sourceReferencesJson,recordsUpserted,status,summaryJson,completedAt) VALUES({q(hid(iid,batch))},{q(iid)},{q(batch)},'Institution + Organization + Source Data','SOURCE_BACKED_IMPORT',{q(json.dumps([annual_src['ref'],bpm_src['ref']],ensure_ascii=False,separators=(',',':')))}, {1+1+len(units)+len(branches)+2},'Completed',{q(json.dumps(summary,ensure_ascii=False,separators=(',',':')))}, {q(now)}) ON CONFLICT(institutionId,batchCode) DO UPDATE SET recordsUpserted=excluded.recordsUpserted,status='Completed',summaryJson=excluded.summaryJson,completedAt=excluded.completedAt;",'ntt_feed.sql')

verify={
 'institutionCount':int(rows('SELECT COUNT(*) AS n FROM Institution WHERE legalName='+q(legal_name))[0]['n']),
 'legalEntityCount':count('LegalEntity',iid),
 'managedOrgCount':int(rows("SELECT COUNT(*) AS n FROM OrganizationUnit WHERE institutionId="+q(iid)+" AND code LIKE 'NTT-%'")[0]['n']),
 'branchCount':int(rows("SELECT COUNT(*) AS n FROM OrganizationUnit WHERE institutionId="+q(iid)+" AND type='Branch' AND code LIKE 'NTT-BR-%'")[0]['n']),
 'snapshotCount':int(rows('SELECT COUNT(*) AS n FROM InstitutionSourceSnapshot WHERE institutionId='+q(iid))[0]['n']),
 'crossTenantOrg':int(rows("SELECT COUNT(*) AS n FROM OrganizationUnit WHERE institutionId<>"+q(iid)+" AND code LIKE 'NTT-%'")[0]['n'])}
after={t:count(t,kalbar_id) for t in tracked} if kalbar_id else None
verify.update(bankKalbarBefore=before,bankKalbarAfter=after,bankKalbarUnchanged=(before==after))
expected={'institutionCount':1,'legalEntityCount':1,'managedOrgCount':len(units)+len(branches),'branchCount':len(branches),'snapshotCount':2,'crossTenantOrg':0}
for key,value in expected.items():
    if verify[key] != value: raise RuntimeError(f'BANK_NTT_VERIFY_{key}_{verify[key]}_EXPECTED_{value}')
if not verify['bankKalbarUnchanged']: raise RuntimeError('BANK_KALBAR_CHANGED_DURING_BANK_NTT_IMPORT')
print(json.dumps({'summary':summary,'verification':verify},indent=2,ensure_ascii=False))
