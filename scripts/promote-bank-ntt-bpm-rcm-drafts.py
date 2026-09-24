import hashlib, json, os, re, subprocess, sys, time
from datetime import datetime, timezone
from pathlib import Path

SOURCE = Path(sys.argv[1] if len(sys.argv) > 1 else 'data/bank-ntt-bpm-rcm-draft-20260924.json')
data = json.loads(SOURCE.read_text())
LEGAL_NAME = data['institutionLegalName']
BATCH = data['batch']
source = data['source']
bpm = data['bpm']

def wr(args, retries=5):
    last = None
    for attempt in range(retries):
        p = subprocess.run(['npx','wrangler',*args], text=True, env=os.environ, capture_output=True)
        if p.returncode == 0:
            return p.stdout
        last = p
        time.sleep(2 + attempt * 2)
    print((last.stdout if last else '')[-4000:])
    print((last.stderr if last else '')[-4000:])
    raise RuntimeError('WRANGLER_COMMAND_FAILED')

dbs = json.loads(wr(['d1','list','--json']))
db = next((x for x in dbs if re.search(r'total.?arc', x['name'], re.I)), None)
if not db:
    db = dbs[0] if len(dbs) == 1 else None
if not db:
    raise RuntimeError('TOTAL_ARC_D1_NOT_FOUND')
DB = db['name']
now = datetime.now(timezone.utc).isoformat().replace('+00:00','Z')

def q(value):
    if value is None: return 'NULL'
    return "'" + str(value).replace("'", "''") + "'"

def hid(*parts):
    return hashlib.sha256('|'.join(map(str, parts)).encode()).hexdigest()[:40]

def rows(sql):
    raw = json.loads(wr(['d1','execute',DB,'--remote','--json','--command',sql]))
    raw = raw if isinstance(raw, list) else [raw]
    return [row for block in raw for row in (block.get('results') or [])]

def runfile(sql, name):
    path = '/tmp/' + name
    Path(path).write_text(sql)
    wr(['d1','execute',DB,'--remote','--file',path])

def table_exists(name):
    return int(rows("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name="+q(name))[0]['n']) > 0

required = ['Institution','OrganizationUnit','ProcessCategory','BusinessProcess','ProcessObjective','ProcessActivity','RCMDraftReference','RiskMaster','ControlMaster','AuditLog']
for name in required:
    if not table_exists(name):
        raise RuntimeError('REQUIRED_TABLE_MISSING_'+name)

institution = rows('SELECT * FROM Institution WHERE legalName='+q(LEGAL_NAME)+' LIMIT 1')
if len(institution) != 1:
    raise RuntimeError('BANK_NTT_INSTITUTION_NOT_FOUND')
institution_id = str(institution[0]['id'])

kalbar = rows("SELECT id FROM Institution WHERE legalName='PT. Bank Pembangunan Daerah Kalimantan Barat' LIMIT 1")
kalbar_id = str(kalbar[0]['id']) if kalbar else None

def tenant_counts(iid):
    if not iid:
        return None
    return {
        'BusinessProcess': int(rows('SELECT COUNT(*) AS n FROM BusinessProcess WHERE institutionId='+q(iid))[0]['n']),
        'ProcessActivity': int(rows('SELECT COUNT(*) AS n FROM ProcessActivity pa JOIN BusinessProcess p ON p.id=pa.processId WHERE p.institutionId='+q(iid))[0]['n']),
        'ProcessObjective': int(rows('SELECT COUNT(*) AS n FROM ProcessObjective po JOIN BusinessProcess p ON p.id=po.processId WHERE p.institutionId='+q(iid))[0]['n']),
        'RiskMaster': int(rows('SELECT COUNT(*) AS n FROM RiskMaster WHERE institutionId='+q(iid))[0]['n']),
        'ControlMaster': int(rows('SELECT COUNT(*) AS n FROM ControlMaster WHERE institutionId='+q(iid))[0]['n']),
        'RCMDraftReference': int(rows('SELECT COUNT(*) AS n FROM RCMDraftReference WHERE institutionId='+q(iid))[0]['n'])
    }

kalbar_before = tenant_counts(kalbar_id)

category = rows('SELECT * FROM ProcessCategory WHERE code='+q(bpm['categoryCode'])+' LIMIT 1')
if len(category) != 1:
    raise RuntimeError('PROCESS_CATEGORY_NOT_FOUND_'+bpm['categoryCode'])
category_id = str(category[0]['id'])
category_name = str(category[0]['name'])

org = rows('SELECT * FROM OrganizationUnit WHERE institutionId='+q(institution_id)+' AND code='+q(bpm['orgUnitCode'])+' LIMIT 1')
if len(org) != 1:
    raise RuntimeError('BANK_NTT_ORG_UNIT_NOT_FOUND_'+bpm['orgUnitCode'])
org_unit_id = str(org[0]['id'])
legal_entity = rows("SELECT id FROM LegalEntity WHERE institutionId="+q(institution_id)+" AND code='BANK-NTT' LIMIT 1")
legal_entity_id = str(legal_entity[0]['id']) if legal_entity else None

existing = rows('SELECT * FROM BusinessProcess WHERE institutionId='+q(institution_id)+' AND processId='+q(bpm['processId'])+' LIMIT 1')
process_internal_id = str(existing[0]['id']) if existing else hid(institution_id,bpm['processId'],'BUSINESS-PROCESS')
created_at = str(existing[0].get('createdAt') or now) if existing else now
existing_tags = {}
if existing and existing[0].get('tags'):
    try: existing_tags = json.loads(str(existing[0]['tags']))
    except Exception: existing_tags = {}
protected = existing_tags.get('sourceValidationStatus') in ('USER_VALIDATED','REJECTED_BY_USER')

tags = {
    'sourceBacked': True,
    'sourceValidationStatus': 'PENDING_USER_VALIDATION',
    'sourceFileName': source['name'],
    'sourceSha256': source['sha256'],
    'sourceReference': source['reference'],
    'sourceTitle': source['title'],
    'sourceLanes': source['lanes'],
    'draftDerivedFields': bpm['inferredFields'],
    'draftNote': 'Atribut yang tidak dinyatakan eksplisit pada source file diperlakukan sebagai draft/pending validation dan tidak boleh dianggap sebagai fakta tervalidasi.'
}
if not protected:
    runfile(f"""
INSERT INTO BusinessProcess(
  id,institutionId,legalEntityId,orgUnitId,categoryId,processId,name,level,parentProcessId,description,
  ownerName,ownerEmail,managerName,criticality,classification,isIcofrRelevant,status,version,
  effectiveDate,reviewDate,tags,createdAt,updatedAt
) VALUES(
  {q(process_internal_id)},{q(institution_id)},{q(legal_entity_id)},{q(org_unit_id)},{q(category_id)},
  {q(bpm['processId'])},{q(bpm['name'])},2,NULL,{q(bpm['description'])},{q(bpm['ownerName'])},NULL,NULL,
  {q(bpm['criticality'])},{q(bpm['classification'])},{1 if bpm['isIcofrRelevant'] else 0},'Draft','0.1',
  {q(now)},NULL,{q(json.dumps(tags,ensure_ascii=False,separators=(',',':')))},{q(created_at)},{q(now)}
)
ON CONFLICT(institutionId,processId) DO UPDATE SET
  legalEntityId=excluded.legalEntityId,
  orgUnitId=excluded.orgUnitId,
  categoryId=excluded.categoryId,
  name=excluded.name,
  description=excluded.description,
  ownerName=excluded.ownerName,
  criticality=excluded.criticality,
  classification=excluded.classification,
  isIcofrRelevant=excluded.isIcofrRelevant,
  status='Draft',
  version='0.1',
  tags=excluded.tags,
  updatedAt=excluded.updatedAt;
""",'bank_ntt_bpm.sql')

    runfile('DELETE FROM ProcessObjective WHERE processId='+q(process_internal_id)+';','bank_ntt_bpm_objective_reset.sql')
    runfile(f"""
INSERT INTO ProcessObjective(id,processId,objective,strategicGoal,expectedOutcome,kpi,kri,sla,createdAt)
VALUES({q(hid(process_internal_id,'OBJECTIVE-01'))},{q(process_internal_id)},{q(bpm['processObjective'])},
'Draft - Pending User Validation','Draft - Pending User Validation',NULL,NULL,NULL,{q(now)});
""",'bank_ntt_bpm_objective.sql')

    runfile('DELETE FROM ProcessActivity WHERE processId='+q(process_internal_id)+';','bank_ntt_bpm_activity_reset.sql')
    activity_sql = []
    for a in bpm['activities']:
        activity_sql.append(f"""
INSERT INTO ProcessActivity(
 id,processId,activityId,name,description,performer,nature,frequency,inputData,outputData,systemUsed,sla,orderIndex,createdAt
) VALUES(
 {q(hid(process_internal_id,a['activityId']))},{q(process_internal_id)},{q(a['activityId'])},{q(a['name'])},
 {q('Source-backed activity from the uploaded BPM diagram. Attributes beyond the diagram text require user validation.')},
 {q(a.get('performer'))},{q(a.get('nature'))},{q(a.get('frequency'))},NULL,NULL,{q(a.get('systemUsed'))},NULL,
 {int(a['orderIndex'])},{q(now)}
);
""")
    runfile('\n'.join(activity_sql),'bank_ntt_bpm_activities.sql')

activity_rows = rows('SELECT * FROM ProcessActivity WHERE processId='+q(process_internal_id)+' ORDER BY orderIndex')
activity_by_code = {str(x['activityId']): x for x in activity_rows}
if len(activity_by_code) != 9:
    raise RuntimeError('BANK_NTT_BPM_ACTIVITY_COUNT_'+str(len(activity_by_code))+'_EXPECTED_9')

controls = data['controls']
draft_sql = []
for risk_spec in data['risks']:
    group = risk_spec['group']
    control = controls[group.replace('R','C')]
    activity = activity_by_code.get(control['activityId'])
    if not activity:
        raise RuntimeError('ACTIVITY_NOT_FOUND_FOR_'+group)

    risk_id = f"BNTT-{group}-RSK-{risk_spec['seq']}"
    reference_code = f"BNTT-RCM-{group}-{risk_spec['seq']}"
    control_description = '; '.join(control['items'])
    payload = {
        'schemaVersion': 1,
        'generatedAt': now,
        'generatedBy': 'Total ARC Bank NTT Source Draft Importer',
        'validationRequired': True,
        'source': {
            'fileName': source['name'],
            'sha256': source['sha256'],
            'reference': source['reference'],
            'riskGroup': group,
            'controlGroup': group.replace('R','C'),
            'sourceFactBoundary': 'Risk name and listed control activities are source-backed. Cause/event/impact, classification, control attributes and evidence requirements are draft placeholders pending user validation.'
        },
        'process': {
            'id': process_internal_id,
            'institutionId': institution_id,
            'processId': bpm['processId'],
            'name': bpm['name'],
            'description': bpm['description'],
            'ownerName': bpm['ownerName'],
            'criticality': bpm['criticality'],
            'classification': bpm['classification'],
            'isIcofrRelevant': bpm['isIcofrRelevant'],
            'categoryName': category_name
        },
        'processObjective': bpm['processObjective'],
        'activity': {
            'id': str(activity['id']),
            'activityId': str(activity['activityId']),
            'name': str(activity['name']),
            'description': activity.get('description'),
            'performer': activity.get('performer'),
            'nature': activity.get('nature'),
            'frequency': activity.get('frequency'),
            'systemUsed': activity.get('systemUsed'),
            'inputData': None,
            'outputData': None
        },
        'risk': {
            'existingRiskId': None,
            'riskId': risk_id,
            'name': risk_spec['name'],
            'description': f"Risiko tercantum eksplisit pada source workbook sebagai {group}. Rincian cause/event/impact belum dinyatakan pada source dan wajib divalidasi user.",
            'cause': 'Belum dinyatakan dalam source file - wajib dilengkapi/validasi user.',
            'event': 'Belum dinyatakan dalam source file - wajib dilengkapi/validasi user.',
            'impact': 'Belum dinyatakan dalam source file - wajib dilengkapi/validasi user.',
            'category': 'Operational - Draft Classification',
            'ownerName': str(activity.get('performer') or bpm['ownerName']),
            'inherentLikelihood': 0,
            'inherentImpact': 0,
            'inherentScore': 0,
            'inherentRating': 'Not Assessed',
            'residualLikelihood': 0,
            'residualImpact': 0,
            'residualScore': 0,
            'residualRating': 'Not Assessed'
        },
        'control': {
            'controlId': control['controlId'],
            'name': control['name'],
            'description': control_description,
            'objective': 'Draft control objective inferred from the source control list - wajib divalidasi user sebelum digunakan.',
            'controlOwner': control['owner'],
            'type': 'Pending User Validation',
            'nature': 'Pending User Validation',
            'method': 'Pending User Validation',
            'frequency': 'Pending User Validation',
            'isKeyControl': False,
            'isIcofrKey': False,
            'isItgc': False,
            'evidenceRequirement': 'Belum dinyatakan dalam source file - wajib dilengkapi/validasi user.',
            'systemDependency': control.get('systemDependency')
        }
    }
    draft_sql.append(f"""
INSERT INTO RCMDraftReference(
 id,institutionId,referenceType,referenceCode,title,payloadJson,sourceRecordId,sourceDocumentId,
 sourceReference,sourceStatus,validationRequired,operationalControlId,updatedAt
) VALUES(
 {q(hid(institution_id,reference_code,'RCM-DRAFT'))},{q(institution_id)},'BPM_RCM_DRAFT',{q(reference_code)},
 {q('Draft RCM - '+risk_spec['name'])},{q(json.dumps(payload,ensure_ascii=False,separators=(',',':')))},
 {q(process_internal_id)},{q(source['sha256'])},{q('BPM:'+bpm['processId'])},
 'DRAFT_PENDING_VALIDATION',1,NULL,{q(now)}
)
ON CONFLICT(institutionId,referenceType,referenceCode) DO UPDATE SET
 title=excluded.title,
 payloadJson=excluded.payloadJson,
 sourceRecordId=excluded.sourceRecordId,
 sourceDocumentId=excluded.sourceDocumentId,
 sourceReference=excluded.sourceReference,
 validationRequired=1,
 operationalControlId=NULL,
 updatedAt=excluded.updatedAt
WHERE RCMDraftReference.sourceStatus='DRAFT_PENDING_VALIDATION';
""")
runfile('\n'.join(draft_sql),'bank_ntt_rcm_drafts.sql')

audit_payload = {
    'institution': LEGAL_NAME,
    'processId': bpm['processId'],
    'sourceFile': source['name'],
    'sourceSha256': source['sha256'],
    'bpmStatus': 'PENDING_USER_VALIDATION' if not protected else existing_tags.get('sourceValidationStatus'),
    'activities': 9,
    'sourceRiskCount': 12,
    'sourceControlGroups': 3,
    'rcmDraftRows': 12,
    'operationalRiskControlPromotion': False,
    'bankKalbarMutationAllowed': False
}
runfile(f"""
INSERT OR REPLACE INTO AuditLog(
 id,institutionId,userName,userRole,action,entityType,recordId,oldValue,newValue,reason,ipAddress,timestamp
) VALUES(
 {q(hid(institution_id,BATCH,'AUDIT'))},{q(institution_id)},'System','System','GENERATE_DRAFT',
 'BankNTTBpmRcmDraft',{q(BATCH)},NULL,{q(json.dumps(audit_payload,ensure_ascii=False,separators=(',',':')))},
 'Source-backed Bank NTT BPM and RCM drafts created from uploaded workbook. User validation required before operational use.',
 NULL,{q(now)}
);
""",'bank_ntt_draft_audit.sql')

if table_exists('OperationalDataFeedRun'):
    runfile(f"""
INSERT INTO OperationalDataFeedRun(
 id,institutionId,batchCode,module,sourceRole,sourceReferencesJson,recordsUpserted,status,summaryJson,completedAt
) VALUES(
 {q(hid(institution_id,BATCH))},{q(institution_id)},{q(BATCH)},'Bank NTT BPM + RCM Draft',
 'SOURCE_BACKED_DRAFT',{q(json.dumps([source['reference']],ensure_ascii=False,separators=(',',':')))},
 22,'Completed',{q(json.dumps(audit_payload,ensure_ascii=False,separators=(',',':')))},{q(now)}
)
ON CONFLICT(institutionId,batchCode) DO UPDATE SET
 status='Completed',summaryJson=excluded.summaryJson,completedAt=excluded.completedAt;
""",'bank_ntt_draft_feed.sql')

process_check = rows('SELECT id,institutionId,status,tags FROM BusinessProcess WHERE institutionId='+q(institution_id)+' AND processId='+q(bpm['processId'])+' LIMIT 1')
if len(process_check) != 1:
    raise RuntimeError('BANK_NTT_BPM_NOT_FOUND_AFTER_IMPORT')
pid = str(process_check[0]['id'])
activity_count = int(rows('SELECT COUNT(*) AS n FROM ProcessActivity WHERE processId='+q(pid))[0]['n'])
objective_count = int(rows('SELECT COUNT(*) AS n FROM ProcessObjective WHERE processId='+q(pid))[0]['n'])
draft_total = int(rows("SELECT COUNT(*) AS n FROM RCMDraftReference WHERE institutionId="+q(institution_id)+" AND referenceType='BPM_RCM_DRAFT' AND sourceRecordId="+q(pid))[0]['n'])
pending_draft = int(rows("SELECT COUNT(*) AS n FROM RCMDraftReference WHERE institutionId="+q(institution_id)+" AND referenceType='BPM_RCM_DRAFT' AND sourceRecordId="+q(pid)+" AND sourceStatus='DRAFT_PENDING_VALIDATION'")[0]['n'])
risk_count = int(rows('SELECT COUNT(*) AS n FROM RiskMaster WHERE institutionId='+q(institution_id)+' AND processId='+q(pid))[0]['n'])
control_count = int(rows('SELECT COUNT(*) AS n FROM ControlMaster WHERE institutionId='+q(institution_id)+' AND processId='+q(pid))[0]['n'])
cross_tenant = int(rows('SELECT COUNT(*) AS n FROM BusinessProcess WHERE institutionId<>'+q(institution_id)+' AND processId='+q(bpm['processId']))[0]['n'])

kalbar_after = tenant_counts(kalbar_id)
verification = {
    'bankNttInstitutionId': institution_id,
    'processInternalId': pid,
    'bpmStatus': process_check[0]['status'],
    'activityCount': activity_count,
    'objectiveCount': objective_count,
    'rcmDraftTotal': draft_total,
    'pendingRcmDraftTotal': pending_draft,
    'operationalRiskCount': risk_count,
    'operationalControlCount': control_count,
    'crossTenantProcessCount': cross_tenant,
    'bankKalbarBefore': kalbar_before,
    'bankKalbarAfter': kalbar_after,
    'bankKalbarUnchanged': kalbar_before == kalbar_after
}
if activity_count != 9: raise RuntimeError('BANK_NTT_ACTIVITY_COUNT_'+str(activity_count))
if objective_count != 1: raise RuntimeError('BANK_NTT_OBJECTIVE_COUNT_'+str(objective_count))
if draft_total != 12: raise RuntimeError('BANK_NTT_RCM_DRAFT_COUNT_'+str(draft_total))
if risk_count != 0 or control_count != 0: raise RuntimeError('BANK_NTT_DRAFTS_PROMOTED_PREMATURELY')
if cross_tenant != 0: raise RuntimeError('BANK_NTT_PROCESS_CROSS_TENANT_LEAKAGE')
if not verification['bankKalbarUnchanged']: raise RuntimeError('BANK_KALBAR_CHANGED_DURING_BANK_NTT_DRAFT_IMPORT')

print(json.dumps({'batch':BATCH,'verification':verification},indent=2,ensure_ascii=False))
