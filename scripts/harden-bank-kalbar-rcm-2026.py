import hashlib
import json
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

LEGAL_NAME = "PT. Bank Pembangunan Daerah Kalimantan Barat"
BATCH = "BANK_KALBAR_RCM_HARDENING_20260923"

CKPN_REQUIREMENTS = [
    ("CKPN-REQ-01","Input data ECL/CKPN","Pengendalian atas kelengkapan, akurasi, dan validitas data input yang digunakan dalam perhitungan ECL/CKPN."),
    ("CKPN-REQ-02","Parameter model","Pengendalian atas penetapan, perubahan, persetujuan, dan dokumentasi parameter model CKPN."),
    ("CKPN-REQ-03","Validasi model","Pengendalian atas validasi independen model/metodologi CKPN dan tindak lanjut hasil validasi."),
    ("CKPN-REQ-04","Penetapan staging","Pengendalian atas penetapan Stage 1, Stage 2, dan Stage 3 sesuai kriteria yang berlaku."),
    ("CKPN-REQ-05","Analisis pergerakan CKPN bulanan","Pengendalian atas analisis movement CKPN bulanan dan investigasi perubahan signifikan."),
    ("CKPN-REQ-06","Management review CKPN","Pengendalian reviu manajemen atas hasil perhitungan CKPN sebelum pencatatan/pelaporan."),
    ("CKPN-REQ-07","Jurnal pembentukan CKPN","Pengendalian atas penyusunan, persetujuan, posting, dan rekonsiliasi jurnal CKPN."),
    ("CKPN-REQ-08","Uji model bisnis empat langkah","Pengendalian atas pelaksanaan dan dokumentasi pengujian model bisnis empat langkah."),
    ("CKPN-REQ-09","Uji SPPI dan retest aktivitas penjualan","Pengendalian atas uji SPPI dan pengujian ulang aktivitas penjualan portofolio yang dikelola untuk memperoleh arus kas kontraktual."),
]
REVERSE_REPO_REQUIREMENTS = [
    ("REVREPO-REQ-01","RCM transaksi Reverse Repo","RCM transaksi reverse repo wajib divalidasi sebelum pengujian TB 2026; detail aktivitas kontrol, otorisasi, sistem, jurnal, settlement, collateral, evidence, dan frequency menunggu sumber/proses-owner validation.")
]

LEGACY_PROCESS_MAP = {
    "DPK":"DPK",
    "KRD":"KRD",
    "Pengadaan Barang dn Jasa":"PGD",
    "Treasury":"TRY",
    "SYH":"UUS",
    "Kep-AML":"KPT-AML",
    "Otomatisasi Pengakuan Beban Bunga":"OBB",
    "Otomatisasi Pengakuan Pendapatan Bunga":"OPB",
    "Pajak":"TAX",
    "Pelaporan":"PLP",
    "Penggajian":"PAY",
}

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

def hid(*parts):
    return hashlib.sha256("|".join(map(str,parts)).encode()).hexdigest()[:40]

def execute(sql,path):
    Path(path).write_text(sql,encoding="utf-8")
    wr(["d1","execute",DB,"--remote","--file",path])

def clean(v):
    return str(v or "").strip()

def truthy(v):
    return clean(v).lower() in {"ya","yes","y","true","1","key"}

def process_code_from_name(name):
    n=clean(name).lower()
    if not n:
        return None
    exact={
      "dana pihak ketiga":"DPK",
      "penghimpunan dana":"DPK",
      "kredit":"KRD",
      "perkreditan":"KRD",
      "kredit (lending)":"KRD",
      "treasury":"TRY",
      "treasury & likuiditas":"TRY",
      "unit usaha syariah":"UUS",
      "penggajian":"PAY",
      "sdm & penggajian":"PAY",
      "perpajakan":"TAX",
      "pajak":"TAX",
      "pelaporan":"PLP",
      "tutup buku & pelaporan":"PLP",
      "pengadaan":"PGD",
      "pengadaan barang dan jasa":"PGD",
      "pengadaan barang dn jasa":"PGD",
      "aset tetap":"PGD",
      "kepatuhan-aml":"KPT-AML",
      "kepatuhan & hukum":"KPT-AML",
      "teknologi informasi":"ITGC",
      "itgc":"ITGC",
      "manajemen risiko operasional":"MRO",
      "manajemen risiko / akuntansi":"MRA",
      "pengelolaan ekuitas dan aksi korporasi":"EQT",
      "komitmen, kontinjensi, dan bank garansi":"KKB",
    }
    if n in exact:
        return exact[n]
    if "syariah" in n: return "UUS"
    if "itgc" in n or "teknologi informasi" in n: return "ITGC"
    if "treasury" in n: return "TRY"
    if "penggajian" in n or "sumber daya manusia" in n: return "PAY"
    if "pajak" in n: return "TAX"
    if "pelaporan" in n or "tutup buku" in n: return "PLP"
    if "pengadaan" in n or "aset tetap" in n: return "PGD"
    if "dana pihak ketiga" in n or "penghimpunan dana" in n: return "DPK"
    if "kredit" in n: return "KRD"
    if "kepatuhan" in n or "aml" in n: return "KPT-AML"
    if "ekuitas" in n: return "EQT"
    if "komitmen" in n or "kontinjensi" in n or "garansi" in n: return "KKB"
    if "manajemen risiko operasional" in n: return "MRO"
    if "manajemen risiko" in n: return "MRA"
    return None

now=datetime.now(timezone.utc).isoformat().replace("+00:00","Z")

inst=rows("SELECT id,name,legalName FROM Institution WHERE legalName="+q(LEGAL_NAME)+" LIMIT 2")
if len(inst)!=1:
    raise RuntimeError("BANK_KALBAR_INSTITUTION_COUNT_"+str(len(inst)))
iid=str(inst[0]["id"])

ddl="""
CREATE TABLE IF NOT EXISTS RCMControlSourceMetadata (
  controlId TEXT PRIMARY KEY NOT NULL,
  institutionId TEXT NOT NULL,
  sourceRecordId TEXT,
  sourceDocumentId TEXT,
  sourceRecordType TEXT NOT NULL,
  sourceReference TEXT,
  sourceCycle TEXT,
  sourceProcess TEXT,
  sourceSubprocess TEXT,
  sourceLocation TEXT,
  sourceRawKey TEXT,
  sourceRawType TEXT,
  sourceRawNature TEXT,
  sourceRawFrequency TEXT,
  sourceRawApplication TEXT,
  sourceRawFunction TEXT,
  sourceRawPerformer TEXT,
  taxonomyStatus TEXT NOT NULL,
  mappingStatus TEXT NOT NULL,
  validationStatus TEXT NOT NULL,
  sourcePriority INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  feedBatch TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rcm_source_meta_institution ON RCMControlSourceMetadata(institutionId);
CREATE INDEX IF NOT EXISTS idx_rcm_source_meta_status ON RCMControlSourceMetadata(mappingStatus,validationStatus);

CREATE TABLE IF NOT EXISTS RCMLegacyControlRegister (
  id TEXT PRIMARY KEY NOT NULL,
  institutionId TEXT NOT NULL,
  sourceNo INTEGER NOT NULL,
  sourceCycle TEXT NOT NULL,
  processCode TEXT NOT NULL,
  businessProcess TEXT,
  subprocess TEXT,
  location TEXT,
  controlActivity TEXT NOT NULL,
  sourceKey TEXT,
  sourceType TEXT,
  sourceNature TEXT,
  sourceFrequency TEXT,
  sourceApplication TEXT,
  sourceFunction TEXT,
  sourcePerformer TEXT,
  fraudRiskMissing INTEGER NOT NULL DEFAULT 0,
  riskRatingMissing INTEGER NOT NULL DEFAULT 0,
  evidenceMissing INTEGER NOT NULL DEFAULT 0,
  brokenLanguage INTEGER NOT NULL DEFAULT 0,
  applicationPlaceholder INTEGER NOT NULL DEFAULT 0,
  functionPlaceholder INTEGER NOT NULL DEFAULT 0,
  repairFlagCount INTEGER NOT NULL DEFAULT 0,
  reconciliationStatus TEXT NOT NULL,
  operationalControlId TEXT,
  sourceReference TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rcm_legacy_source_no ON RCMLegacyControlRegister(institutionId,sourceNo);
CREATE INDEX IF NOT EXISTS idx_rcm_legacy_cycle ON RCMLegacyControlRegister(sourceCycle,reconciliationStatus);

CREATE TABLE IF NOT EXISTS RCMDesignRequirement (
  id TEXT PRIMARY KEY NOT NULL,
  institutionId TEXT NOT NULL,
  requirementCode TEXT NOT NULL,
  processId TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  sourceReference TEXT NOT NULL,
  sourceStatus TEXT NOT NULL,
  validationStatus TEXT NOT NULL,
  status TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rcm_requirement_code ON RCMDesignRequirement(institutionId,requirementCode);

CREATE TABLE IF NOT EXISTS RCMDraftReference (
  id TEXT PRIMARY KEY NOT NULL,
  institutionId TEXT NOT NULL,
  referenceType TEXT NOT NULL,
  referenceCode TEXT NOT NULL,
  title TEXT,
  payloadJson TEXT NOT NULL,
  sourceRecordId TEXT,
  sourceDocumentId TEXT,
  sourceReference TEXT NOT NULL,
  sourceStatus TEXT NOT NULL,
  validationRequired INTEGER NOT NULL DEFAULT 1,
  operationalControlId TEXT,
  updatedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rcm_draft_ref ON RCMDraftReference(institutionId,referenceType,referenceCode);

CREATE TABLE IF NOT EXISTS RCMIntegrityRun (
  id TEXT PRIMARY KEY NOT NULL,
  institutionId TEXT NOT NULL,
  batchCode TEXT NOT NULL,
  runAt TEXT NOT NULL,
  status TEXT NOT NULL,
  summaryJson TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rcm_integrity_batch ON RCMIntegrityRun(institutionId,batchCode);
"""
execute(ddl,"/tmp/rcm_hardening_ddl.sql")

process_rows=rows("SELECT id,processId,name,level,parentProcessId FROM BusinessProcess WHERE institutionId="+q(iid))
process_by_code={str(x["processId"]):x for x in process_rows}
required_processes={"DPK","KRD","PGD","TRY","UUS","KPT-AML","OBB","OPB","TAX","PLP","PAY","ITGC","CKPN","TRY-SP-REVREPO"}
missing=sorted(required_processes-set(process_by_code))
if missing:
    raise RuntimeError("REQUIRED_BPM_MISSING_"+",".join(missing))

# ---------------------------------------------------------------------------
# 1) Reconcile the exact 124-control legacy register from the Gap Analysis.
#    Legacy classifications are preserved as source values only, never canonical.
# ---------------------------------------------------------------------------
gap_docs=rows(f"""
SELECT id,title
FROM SourceDocument
WHERE institutionId={q(iid)} AND status='Active'
  AND lower(title) LIKE '%dokumen 3 gap_analysis_bpm_rcm%'
ORDER BY sourceModifiedAt DESC
""")
if not gap_docs:
    raise RuntimeError("GAP_ANALYSIS_SOURCE_NOT_FOUND")
gap_doc=gap_docs[0]
gap_chunks=rows("SELECT textContent FROM SourceTextChunk WHERE documentId="+q(gap_doc["id"])+" ORDER BY chunkIndex")
gap_text="".join(clean(x.get("textContent"))+"\n" for x in gap_chunks)
lines=[line for line in gap_text.splitlines() if line.strip()]
header_index=next((i for i,line in enumerate(lines) if "Berkas RCM" in line and "Nama Aktivitas Pengendalian" in line),None)
if header_index is None:
    raise RuntimeError("LEGACY_RCM_HEADER_NOT_FOUND")
header=lines[header_index].split("\t")
def find_header(label):
    return next((i for i,v in enumerate(header) if clean(v)==label),None)
header_labels=[
  "No","Berkas RCM","Proses Bisnis","Sub Proses","Lokasi","Nama Aktivitas Pengendalian",
  "Key (2025)","Preventif/Detektif (2025)","Sifat (2025)","Frekuensi (2025)",
  "Aplikasi (2025)","Fungsi Pelaksana (2025)","Pelaku (2025)","Risiko Fraud kosong",
  "Penilaian Risiko kosong","Dokumen kosong","Bahasa rusak","Placeholder aplikasi",
  "Placeholder fungsi","JUMLAH TANDA PERBAIKAN","Status Pemutakhiran [ISI]"
]
idx={label:find_header(label) for label in header_labels}
if any(v is None for v in idx.values()):
    raise RuntimeError("LEGACY_RCM_HEADER_COLUMNS_MISSING_"+json.dumps(idx,ensure_ascii=False))

legacy=[]
for line in lines[header_index+1:]:
    parts=line.split("\t")+[""]*80
    raw_no=clean(parts[idx["No"]])
    if not re.fullmatch(r"\d+",raw_no):
        continue
    cycle=clean(parts[idx["Berkas RCM"]])
    if cycle not in LEGACY_PROCESS_MAP:
        continue
    legacy.append({
      "no":int(raw_no),"cycle":cycle,"processCode":LEGACY_PROCESS_MAP[cycle],
      "businessProcess":clean(parts[idx["Proses Bisnis"]]) or None,
      "subprocess":clean(parts[idx["Sub Proses"]]) or None,
      "location":clean(parts[idx["Lokasi"]]) or None,
      "activity":clean(parts[idx["Nama Aktivitas Pengendalian"]]) or None,
      "key":clean(parts[idx["Key (2025)"]]) or None,
      "type":clean(parts[idx["Preventif/Detektif (2025)"]]) or None,
      "nature":clean(parts[idx["Sifat (2025)"]]) or None,
      "frequency":clean(parts[idx["Frekuensi (2025)"]]) or None,
      "application":clean(parts[idx["Aplikasi (2025)"]]) or None,
      "function":clean(parts[idx["Fungsi Pelaksana (2025)"]]) or None,
      "performer":clean(parts[idx["Pelaku (2025)"]]) or None,
      "fraudMissing":clean(parts[idx["Risiko Fraud kosong"]]).lower()=="ya",
      "ratingMissing":clean(parts[idx["Penilaian Risiko kosong"]]).lower()=="ya",
      "evidenceMissing":clean(parts[idx["Dokumen kosong"]]).lower()=="ya",
      "brokenLanguage":clean(parts[idx["Bahasa rusak"]]).lower()=="ya",
      "appPlaceholder":clean(parts[idx["Placeholder aplikasi"]]).lower()=="ya",
      "functionPlaceholder":clean(parts[idx["Placeholder fungsi"]]).lower()=="ya",
      "repairFlags":int(clean(parts[idx["JUMLAH TANDA PERBAIKAN"]]) or 0),
      "status2026":clean(parts[idx["Status Pemutakhiran [ISI]"]]) or None,
    })
if len(legacy)!=124:
    raise RuntimeError("LEGACY_RCM_COUNT_"+str(len(legacy))+"_124")

legacy_sql=[]
for item in legacy:
    lid=hid(iid,"LEGACY-RCM-2025",item["no"])
    ref=f"SERAYA:{gap_doc['id']}#03_Daftar_Kendali_RCM:ROW-{item['no']}"
    legacy_sql.append(f"""
INSERT INTO RCMLegacyControlRegister(
 id,institutionId,sourceNo,sourceCycle,processCode,businessProcess,subprocess,location,controlActivity,
 sourceKey,sourceType,sourceNature,sourceFrequency,sourceApplication,sourceFunction,sourcePerformer,
 fraudRiskMissing,riskRatingMissing,evidenceMissing,brokenLanguage,applicationPlaceholder,functionPlaceholder,
 repairFlagCount,reconciliationStatus,operationalControlId,sourceReference,updatedAt
) VALUES(
 {q(lid)},{q(iid)},{item['no']},{q(item['cycle'])},{q(item['processCode'])},{q(item['businessProcess'])},
 {q(item['subprocess'])},{q(item['location'])},{q(item['activity'])},{q(item['key'])},{q(item['type'])},
 {q(item['nature'])},{q(item['frequency'])},{q(item['application'])},{q(item['function'])},{q(item['performer'])},
 {1 if item['fraudMissing'] else 0},{1 if item['ratingMissing'] else 0},{1 if item['evidenceMissing'] else 0},
 {1 if item['brokenLanguage'] else 0},{1 if item['appPlaceholder'] else 0},{1 if item['functionPlaceholder'] else 0},
 {item['repairFlags']},'LEGACY_REASSESSMENT_REQUIRED',NULL,{q(ref)},{q(now)}
)
ON CONFLICT(institutionId,sourceNo) DO UPDATE SET
 sourceCycle=excluded.sourceCycle,processCode=excluded.processCode,businessProcess=excluded.businessProcess,
 subprocess=excluded.subprocess,location=excluded.location,controlActivity=excluded.controlActivity,
 sourceKey=excluded.sourceKey,sourceType=excluded.sourceType,sourceNature=excluded.sourceNature,
 sourceFrequency=excluded.sourceFrequency,sourceApplication=excluded.sourceApplication,
 sourceFunction=excluded.sourceFunction,sourcePerformer=excluded.sourcePerformer,
 fraudRiskMissing=excluded.fraudRiskMissing,riskRatingMissing=excluded.riskRatingMissing,
 evidenceMissing=excluded.evidenceMissing,brokenLanguage=excluded.brokenLanguage,
 applicationPlaceholder=excluded.applicationPlaceholder,functionPlaceholder=excluded.functionPlaceholder,
 repairFlagCount=excluded.repairFlagCount,reconciliationStatus='LEGACY_REASSESSMENT_REQUIRED',
 sourceReference=excluded.sourceReference,updatedAt=excluded.updatedAt;
""")
execute("\n".join(legacy_sql),"/tmp/rcm_legacy.sql")

# Promote the 42 UUS legacy controls as Draft, taxonomy reset, walkthrough pending.
uus_controls=[x for x in legacy if x["cycle"]=="SYH"]
if len(uus_controls)!=42:
    raise RuntimeError("LEGACY_UUS_COUNT_"+str(len(uus_controls))+"_42")
uus_pid=str(process_by_code["UUS"]["id"])
uus_sql=[]
for item in uus_controls:
    enterprise_id=f"RCM25-SYH-{item['no']:03d}"
    cid=hid(iid,"CONTROL",enterprise_id)
    app=None if item["appPlaceholder"] or clean(item["application"]).lower()=="relevan" else item["application"]
    performer=item["performer"] or ""
    description=(
      "Source-backed legacy UUS RCM control carried forward for 2026 reconciliation. "
      "Canonical key/non-key, preventive/detective, nature and frequency were reset because the 2025 review found "
      "systematic classification defects. Walkthrough validation is still required."
    )
    uus_sql.append(f"""
INSERT INTO ControlMaster(
 id,institutionId,processId,activityId,controlId,name,description,objective,controlOwner,performer,reviewer,
 type,nature,method,frequency,isKeyControl,keyControlRationale,isIcofrKey,isItgc,evidenceRequirement,
 systemDependency,frameworkMapping,regulationMapping,designAssessment,operatingStatus,overallHealth,
 healthRationale,version,status,createdAt,updatedAt
) VALUES(
 {q(cid)},{q(iid)},{q(uus_pid)},NULL,{q(enterprise_id)},{q(item['activity'])},{q(description)},
 'Pending process-owner validation','',{q(performer)},NULL,
 'Pending Reassessment','Pending Reassessment','Pending Validation','Pending Reassessment',0,
 '2025 source marked all controls key; FY2026 reclassification required.',0,0,NULL,{q(app)},
 'ICOFR TLC','Source: legacy UUS RCM 2025','Not Assessed','Not Assessed','Not Assessed',
 'Draft source-backed legacy control; walkthrough and taxonomy reassessment required.','1.0','Draft',{q(now)},{q(now)}
)
ON CONFLICT(institutionId,controlId) DO UPDATE SET
 processId=excluded.processId,name=excluded.name,description=excluded.description,performer=excluded.performer,
 type='Pending Reassessment',nature='Pending Reassessment',method='Pending Validation',
 frequency='Pending Reassessment',isKeyControl=0,isIcofrKey=0,isItgc=0,
 evidenceRequirement=NULL,systemDependency=excluded.systemDependency,designAssessment='Not Assessed',
 operatingStatus='Not Assessed',overallHealth='Not Assessed',status='Draft',updatedAt=excluded.updatedAt;
INSERT INTO RCMControlSourceMetadata(
 controlId,institutionId,sourceRecordId,sourceDocumentId,sourceRecordType,sourceReference,sourceCycle,
 sourceProcess,sourceSubprocess,sourceLocation,sourceRawKey,sourceRawType,sourceRawNature,sourceRawFrequency,
 sourceRawApplication,sourceRawFunction,sourceRawPerformer,taxonomyStatus,mappingStatus,validationStatus,
 sourcePriority,notes,feedBatch,updatedAt
) VALUES(
 {q(cid)},{q(iid)},NULL,{q(gap_doc['id'])},'LEGACY_RCM_2025',{q(f"ROW-{item['no']}")},'SYH',
 {q(item['businessProcess'])},{q(item['subprocess'])},{q(item['location'])},{q(item['key'])},{q(item['type'])},
 {q(item['nature'])},{q(item['frequency'])},{q(item['application'])},{q(item['function'])},{q(item['performer'])},
 'PENDING_REASSESSMENT','PENDING_RISK_MAPPING','WALKTHROUGH_PENDING',10,
 'Legacy UUS control promoted as Draft only; 2025 systematic classifications are retained as source metadata, not canonical attributes.',
 {q(BATCH)},{q(now)}
)
ON CONFLICT(controlId) DO UPDATE SET
 sourceRawKey=excluded.sourceRawKey,sourceRawType=excluded.sourceRawType,sourceRawNature=excluded.sourceRawNature,
 sourceRawFrequency=excluded.sourceRawFrequency,sourceRawApplication=excluded.sourceRawApplication,
 sourceRawFunction=excluded.sourceRawFunction,sourceRawPerformer=excluded.sourceRawPerformer,
 taxonomyStatus='PENDING_REASSESSMENT',mappingStatus='PENDING_RISK_MAPPING',
 validationStatus='WALKTHROUGH_PENDING',notes=excluded.notes,feedBatch=excluded.feedBatch,updatedAt=excluded.updatedAt;
UPDATE RCMLegacyControlRegister SET operationalControlId={q(cid)},
 reconciliationStatus='PROMOTED_DRAFT_REASSESSMENT_REQUIRED',updatedAt={q(now)}
 WHERE institutionId={q(iid)} AND sourceNo={item['no']};
""")
execute("\n".join(uus_sql),"/tmp/rcm_uus.sql")

# ---------------------------------------------------------------------------
# 2) Promote 65 source-backed FY2026 TLC candidate rows from the approved
#    working-paper standard as Draft, with exact source risk-to-control linkage.
# ---------------------------------------------------------------------------
tlc_source=rows(f"""
SELECT id,sourceDocumentId,recordKey,recordTitle,payloadJson,precedencePriority
FROM SourceStructuredRecord
WHERE institutionId={q(iid)} AND status='Active' AND recordType='RCM_TLC_UPDATE_CANDIDATE'
ORDER BY recordKey
""")
if len(tlc_source)!=65:
    raise RuntimeError("RCM_TLC_SOURCE_COUNT_"+str(len(tlc_source))+"_65")

def upsert_source_risk_and_control(rec,record_type,priority,force_process_code=None,is_itgc=False):
    p=json.loads(rec.get("payloadJson") or "{}")
    ref=clean(p.get("controlReference")) or clean(rec.get("recordTitle"))
    process_code=force_process_code or process_code_from_name(p.get("businessProcess") or p.get("process"))
    if not process_code or process_code not in process_by_code:
        return None,"PROCESS_MAPPING_PENDING"
    pid=str(process_by_code[process_code]["id"])
    risk_statement=clean(p.get("riskStatement"))
    risk_id=None
    if risk_statement:
        exact=rows(
          "SELECT id,riskId FROM RiskMaster WHERE institutionId="+q(iid)+" AND processId="+q(pid)+
          " AND name="+q(risk_statement)+" LIMIT 2"
        )
        if exact:
            risk_id=str(exact[0]["id"])
        else:
            risk_enterprise=("ITGC-RISK-"+ref) if is_itgc else ("RCM26-RISK-"+ref)
            risk_id=hid(iid,"RCM-SOURCE-RISK",record_type,ref)
            impact=clean(p.get("financialStatementItem")) or "Financial reporting impact requires Process Owner validation."
            fraud=clean(p.get("fraudRisk"))
            category="IT Risk" if is_itgc else ("Fraud Risk" if fraud and fraud.lower() not in {"tidak","no","n"} else "Financial Reporting")
            risk_sql=f"""
INSERT INTO RiskMaster(
 id,institutionId,processId,activityId,riskId,name,description,cause,event,impact,category,ownerName,
 inherentLikelihood,inherentImpact,inherentScore,inherentRating,residualLikelihood,residualImpact,
 residualScore,residualRating,riskTreatment,status,version,createdAt,updatedAt
) VALUES(
 {q(risk_id)},{q(iid)},{q(pid)},NULL,{q(risk_enterprise)},{q(risk_statement)},{q(risk_statement)},
 'Source cause pending Process Owner validation',{q(risk_statement)},{q(impact)},{q(category)},'',
 0,0,0,'Not Assessed',0,0,0,'Not Assessed','Not Assessed','Draft','1.0',{q(now)},{q(now)}
)
ON CONFLICT(institutionId,riskId) DO UPDATE SET
 processId=excluded.processId,name=excluded.name,description=excluded.description,cause=excluded.cause,
 event=excluded.event,impact=excluded.impact,category=excluded.category,status='Draft',updatedAt=excluded.updatedAt;
"""
            execute(risk_sql,"/tmp/rcm_risk_one.sql")

    cid=hid(iid,"RCM-SOURCE-CONTROL",record_type,ref)
    name=clean(p.get("controlActivity")) or ref
    desc=clean(p.get("controlDescription")) or name
    key_value=p.get("keyControl") if p.get("keyControl") is not None else p.get("isKeyControl")
    control_type=clean(p.get("preventiveDetective") or p.get("purposeType")) or "Pending Validation"
    nature=clean(p.get("nature")) or "Pending Validation"
    frequency=clean(p.get("frequency")) or "Pending Validation"
    evidence=clean(p.get("evidence") or p.get("supportingDocument")) or None
    raw_system=clean(p.get("supportingSystem")) or None
    system=raw_system
    if raw_system and re.search(r"olibs\s*724|core banking",raw_system,re.I):
        system=re.sub(r"Backend Olibs 724|Frontend Olibs 724|Core Banking","ALFABITS",raw_system,flags=re.I)
        system=re.sub(r"(ALFABITS\s*,\s*)+","ALFABITS, ",system)
    pic=clean(p.get("pic")) or ""
    performer=clean(p.get("performer")) or ""
    auto_type=clean(p.get("automatedControlType") or p.get("automaticControlType"))
    method=auto_type or "Pending Validation"
    source_status="SOURCE_CONFIRMED_DRAFT"
    validation="WALKTHROUGH_PENDING" if is_itgc else "PROCESS_OWNER_REVIEW_PENDING"
    mapping="MAPPED_SOURCE_RISK" if risk_id else "PENDING_RISK_MAPPING"
    control_sql=f"""
INSERT INTO ControlMaster(
 id,institutionId,processId,activityId,controlId,name,description,objective,controlOwner,performer,reviewer,
 type,nature,method,frequency,isKeyControl,keyControlRationale,isIcofrKey,isItgc,evidenceRequirement,
 systemDependency,frameworkMapping,regulationMapping,designAssessment,operatingStatus,overallHealth,
 healthRationale,version,status,createdAt,updatedAt
) VALUES(
 {q(cid)},{q(iid)},{q(pid)},NULL,{q(ref)},{q(name)},{q(desc)},
 'Source-defined control objective; validate with Process Owner.',{q(pic)},{q(performer)},NULL,
 {q(control_type)},{q(nature)},{q(method)},{q(frequency)},{1 if truthy(key_value) else 0},
 'Source classification preserved; final key-control conclusion remains review-gated.',
 {1 if truthy(key_value) else 0},{1 if is_itgc else 0},{q(evidence)},{q(system)},
 {q('COBIT 2019 / ITGC' if is_itgc else 'ICOFR TLC')},NULL,'Not Assessed','Not Assessed','Not Assessed',
 {q(source_status+'; effectiveness not inferred from design source.')},'1.0','Draft',{q(now)},{q(now)}
)
ON CONFLICT(institutionId,controlId) DO UPDATE SET
 processId=excluded.processId,name=excluded.name,description=excluded.description,objective=excluded.objective,
 controlOwner=excluded.controlOwner,performer=excluded.performer,type=excluded.type,nature=excluded.nature,
 method=excluded.method,frequency=excluded.frequency,isKeyControl=excluded.isKeyControl,
 keyControlRationale=excluded.keyControlRationale,isIcofrKey=excluded.isIcofrKey,isItgc=excluded.isItgc,
 evidenceRequirement=excluded.evidenceRequirement,systemDependency=excluded.systemDependency,
 frameworkMapping=excluded.frameworkMapping,designAssessment='Not Assessed',operatingStatus='Not Assessed',
 overallHealth='Not Assessed',healthRationale=excluded.healthRationale,status='Draft',updatedAt=excluded.updatedAt;
INSERT INTO RCMControlSourceMetadata(
 controlId,institutionId,sourceRecordId,sourceDocumentId,sourceRecordType,sourceReference,sourceCycle,
 sourceProcess,sourceSubprocess,sourceLocation,sourceRawKey,sourceRawType,sourceRawNature,sourceRawFrequency,
 sourceRawApplication,sourceRawFunction,sourceRawPerformer,taxonomyStatus,mappingStatus,validationStatus,
 sourcePriority,notes,feedBatch,updatedAt
) VALUES(
 {q(cid)},{q(iid)},{q(rec['id'])},{q(rec['sourceDocumentId'])},{q(record_type)},{q(ref)},NULL,
 {q(p.get('businessProcess') or ('ITGC' if is_itgc else None))},{q(p.get('subprocess'))},{q(p.get('location'))},
 {q(key_value)},{q(p.get('preventiveDetective') or p.get('purposeType'))},{q(p.get('nature'))},
 {q(p.get('frequency'))},{q(raw_system)},{q(p.get('pic'))},{q(p.get('performer'))},
 'SOURCE_2026_REVIEW_GATED',{q(mapping)},{q(validation)},{priority},
 {q('Canonical attributes use the newer 2026 source; source raw values remain traceable. Effectiveness is not inferred.')},
 {q(BATCH)},{q(now)}
)
ON CONFLICT(controlId) DO UPDATE SET
 sourceRecordId=excluded.sourceRecordId,sourceDocumentId=excluded.sourceDocumentId,
 sourceRecordType=excluded.sourceRecordType,sourceReference=excluded.sourceReference,
 sourceProcess=excluded.sourceProcess,sourceSubprocess=excluded.sourceSubprocess,
 sourceLocation=excluded.sourceLocation,sourceRawKey=excluded.sourceRawKey,
 sourceRawType=excluded.sourceRawType,sourceRawNature=excluded.sourceRawNature,
 sourceRawFrequency=excluded.sourceRawFrequency,sourceRawApplication=excluded.sourceRawApplication,
 sourceRawFunction=excluded.sourceRawFunction,sourceRawPerformer=excluded.sourceRawPerformer,
 taxonomyStatus=excluded.taxonomyStatus,mappingStatus=excluded.mappingStatus,
 validationStatus=excluded.validationStatus,sourcePriority=excluded.sourcePriority,
 notes=excluded.notes,feedBatch=excluded.feedBatch,updatedAt=excluded.updatedAt;
"""
    if risk_id:
        mid=hid(iid,"RCM-MAP",cid,risk_id)
        control_sql+=f"""
INSERT INTO ControlRiskMapping(id,controlId,riskId,createdAt)
VALUES({q(mid)},{q(cid)},{q(risk_id)},{q(now)})
ON CONFLICT(controlId,riskId) DO NOTHING;
"""
    execute(control_sql,"/tmp/rcm_control_one.sql")
    return cid,mapping

promoted_tlc=0
pending_tlc=0
for rec in tlc_source:
    cid,status=upsert_source_risk_and_control(rec,"RCM_TLC_UPDATE_CANDIDATE",30)
    if cid:
        promoted_tlc+=1
    else:
        pending_tlc+=1
        p=json.loads(rec.get("payloadJson") or "{}")
        ref=clean(p.get("controlReference")) or clean(rec.get("recordTitle"))
        draft_sql=f"""
INSERT INTO RCMDraftReference(
 id,institutionId,referenceType,referenceCode,title,payloadJson,sourceRecordId,sourceDocumentId,
 sourceReference,sourceStatus,validationRequired,operationalControlId,updatedAt
) VALUES(
 {q(hid(iid,'RCM-DRAFT-REF','RCM_TLC_UPDATE_CANDIDATE',ref))},{q(iid)},
 'RCM_TLC_UPDATE_CANDIDATE',{q(ref)},{q(rec.get('recordTitle'))},{q(rec.get('payloadJson') or '{}')},
 {q(rec['id'])},{q(rec['sourceDocumentId'])},{q('SERAYA:'+str(rec.get('recordKey') or ref))},
 'PROCESS_MAPPING_PENDING',1,NULL,{q(now)}
)
ON CONFLICT(institutionId,referenceType,referenceCode) DO UPDATE SET
 title=excluded.title,payloadJson=excluded.payloadJson,sourceRecordId=excluded.sourceRecordId,
 sourceDocumentId=excluded.sourceDocumentId,sourceReference=excluded.sourceReference,
 sourceStatus='PROCESS_MAPPING_PENDING',validationRequired=1,operationalControlId=NULL,updatedAt=excluded.updatedAt;
"""
        execute(draft_sql,"/tmp/rcm_tlc_pending_one.sql")

# 15 higher-priority detailed controls. Exact linked R-risk is already operational.
detail_source=rows(f"""
SELECT id,sourceDocumentId,recordKey,recordTitle,payloadJson,precedencePriority
FROM SourceStructuredRecord
WHERE institutionId={q(iid)} AND status='Active' AND recordType='ICOFR_CONTROL_DETAIL_UPDATE_CANDIDATE'
ORDER BY recordKey
""")
if len(detail_source)!=15:
    raise RuntimeError("DETAIL_CONTROL_SOURCE_COUNT_"+str(len(detail_source))+"_15")
promoted_detail=0
for rec in detail_source:
    p=json.loads(rec.get("payloadJson") or "{}")
    code=process_code_from_name(p.get("businessProcess"))
    if not code or code not in process_by_code:
        continue
    ref=clean(p.get("controlReference"))
    pid=str(process_by_code[code]["id"])
    linked_ref=clean(p.get("linkedRiskReference"))
    risk=rows("SELECT id,processId FROM RiskMaster WHERE institutionId="+q(iid)+" AND riskId="+q(linked_ref)+" LIMIT 2")
    if len(risk)!=1:
        continue
    risk_pid=str(risk[0]["processId"])
    risk_process=next((x for x in process_rows if str(x.get("id"))==risk_pid),None)
    if not risk_process:
        continue
    # Keep the control on exactly the same process as the existing source-backed risk.
    # Accept either the mapped canonical L2 or one of its direct L3 children.
    hierarchy_aligned = (
        risk_pid==pid or
        (int(risk_process.get("level") or 0)==3 and str(risk_process.get("parentProcessId") or "")==pid)
    )
    if not hierarchy_aligned:
        continue
    force_pid=risk_pid

    cid=hid(iid,"RCM-SOURCE-CONTROL","ICOFR_CONTROL_DETAIL_UPDATE_CANDIDATE",ref)
    name=clean(p.get("controlActivity")) or ref
    desc=clean(p.get("controlDescription")) or name
    system=clean(p.get("supportingSystem")) or None
    if system and re.search(r"olibs\s*724|core banking",system,re.I):
        system=re.sub(r"Backend Olibs 724|Frontend Olibs 724|Core Banking","ALFABITS",system,flags=re.I)
    sql=f"""
INSERT INTO ControlMaster(
 id,institutionId,processId,activityId,controlId,name,description,objective,controlOwner,performer,reviewer,
 type,nature,method,frequency,isKeyControl,keyControlRationale,isIcofrKey,isItgc,evidenceRequirement,
 systemDependency,frameworkMapping,regulationMapping,designAssessment,operatingStatus,overallHealth,
 healthRationale,version,status,createdAt,updatedAt
) VALUES(
 {q(cid)},{q(iid)},{q(force_pid)},NULL,{q(ref)},{q(name)},{q(desc)},
 'Mitigate the source-linked financial reporting risk.',{q(clean(p.get('pic')))},{q(clean(p.get('performer')))},NULL,
 {q(clean(p.get('preventiveDetective')) or 'Pending Validation')},{q(clean(p.get('nature')) or 'Pending Validation')},
 {q(clean(p.get('automatedControlType')) or 'Pending Validation')},{q(clean(p.get('frequency')) or 'Pending Validation')},
 {1 if truthy(p.get('keyControl')) else 0},'Source 2026 classification; final approval remains pending.',
 {1 if truthy(p.get('keyControl')) else 0},0,{q(clean(p.get('evidence')) or None)},{q(system)},
 'ICOFR TLC',NULL,'Not Assessed','Not Assessed','Not Assessed',
 'Source-backed 2026 control detail; Process Owner validation required.','1.0','Draft',{q(now)},{q(now)}
)
ON CONFLICT(institutionId,controlId) DO UPDATE SET
 processId=excluded.processId,name=excluded.name,description=excluded.description,controlOwner=excluded.controlOwner,
 performer=excluded.performer,type=excluded.type,nature=excluded.nature,method=excluded.method,
 frequency=excluded.frequency,isKeyControl=excluded.isKeyControl,isIcofrKey=excluded.isIcofrKey,
 evidenceRequirement=excluded.evidenceRequirement,systemDependency=excluded.systemDependency,
 designAssessment='Not Assessed',operatingStatus='Not Assessed',overallHealth='Not Assessed',
 healthRationale=excluded.healthRationale,status='Draft',updatedAt=excluded.updatedAt;
INSERT INTO RCMControlSourceMetadata(
 controlId,institutionId,sourceRecordId,sourceDocumentId,sourceRecordType,sourceReference,sourceCycle,
 sourceProcess,sourceSubprocess,sourceLocation,sourceRawKey,sourceRawType,sourceRawNature,sourceRawFrequency,
 sourceRawApplication,sourceRawFunction,sourceRawPerformer,taxonomyStatus,mappingStatus,validationStatus,
 sourcePriority,notes,feedBatch,updatedAt
) VALUES(
 {q(cid)},{q(iid)},{q(rec['id'])},{q(rec['sourceDocumentId'])},'ICOFR_CONTROL_DETAIL_UPDATE_CANDIDATE',{q(ref)},NULL,
 {q(p.get('businessProcess'))},{q(p.get('subprocess'))},{q(p.get('location'))},{q(p.get('keyControl'))},
 {q(p.get('preventiveDetective'))},{q(p.get('nature'))},{q(p.get('frequency'))},{q(p.get('supportingSystem'))},
 {q(p.get('pic'))},{q(p.get('performer'))},'SOURCE_2026_REVIEW_GATED','MAPPED_EXACT_SOURCE_RISK',
 'PROCESS_OWNER_REVIEW_PENDING',40,'Higher-priority 2026 detail source with exact risk reference.',
 {q(BATCH)},{q(now)}
)
ON CONFLICT(controlId) DO UPDATE SET
 sourceRecordId=excluded.sourceRecordId,sourceDocumentId=excluded.sourceDocumentId,
 sourceRecordType=excluded.sourceRecordType,sourcePriority=40,mappingStatus='MAPPED_EXACT_SOURCE_RISK',
 validationStatus='PROCESS_OWNER_REVIEW_PENDING',notes=excluded.notes,feedBatch=excluded.feedBatch,updatedAt=excluded.updatedAt;
INSERT INTO ControlRiskMapping(id,controlId,riskId,createdAt)
VALUES({q(hid(iid,'RCM-MAP',cid,risk[0]['id']))},{q(cid)},{q(risk[0]['id'])},{q(now)})
ON CONFLICT(controlId,riskId) DO NOTHING;
"""
    execute(sql,"/tmp/rcm_detail_one.sql")
    promoted_detail+=1

if promoted_detail!=15:
    raise RuntimeError("DETAIL_CONTROL_PROMOTION_COUNT_"+str(promoted_detail)+"_15")

# ---------------------------------------------------------------------------
# 3) ITGC: promote exact 10 source rows as Draft in four standard domains.
# ---------------------------------------------------------------------------
itgc_source=rows(f"""
SELECT id,sourceDocumentId,recordKey,recordTitle,payloadJson,precedencePriority
FROM SourceStructuredRecord
WHERE institutionId={q(iid)} AND status='Active' AND recordType='ITGC_CONTROL_UPDATE_CANDIDATE'
ORDER BY recordKey
""")
if len(itgc_source)!=10:
    raise RuntimeError("ITGC_SOURCE_COUNT_"+str(len(itgc_source))+"_10")
promoted_itgc=0
for rec in itgc_source:
    cid,status=upsert_source_risk_and_control(rec,"ITGC_CONTROL_UPDATE_CANDIDATE",35,force_process_code="ITGC",is_itgc=True)
    if cid: promoted_itgc+=1

# ---------------------------------------------------------------------------
# 4) CKPN + Reverse Repo requirement shells: requirements, never fake controls.
# ---------------------------------------------------------------------------
req_sql=[]
for code,title,description in CKPN_REQUIREMENTS:
    req_sql.append(f"""
INSERT INTO RCMDesignRequirement(
 id,institutionId,requirementCode,processId,category,title,description,sourceReference,
 sourceStatus,validationStatus,status,updatedAt
) VALUES(
 {q(hid(iid,'RCM-REQ',code))},{q(iid)},{q(code)},{q(process_by_code['CKPN']['id'])},'CKPN',
 {q(title)},{q(description)},'SERAYA:Memo Reviu 2025&Scoping_2026#Prioritas Fase 1',
 'SOURCE_CONFIRMED_REQUIREMENT','SOURCE_DETAIL_PENDING','Draft',{q(now)}
)
ON CONFLICT(institutionId,requirementCode) DO UPDATE SET
 processId=excluded.processId,title=excluded.title,description=excluded.description,
 sourceStatus=excluded.sourceStatus,validationStatus=excluded.validationStatus,status='Draft',updatedAt=excluded.updatedAt;
""")
for code,title,description in REVERSE_REPO_REQUIREMENTS:
    req_sql.append(f"""
INSERT INTO RCMDesignRequirement(
 id,institutionId,requirementCode,processId,category,title,description,sourceReference,
 sourceStatus,validationStatus,status,updatedAt
) VALUES(
 {q(hid(iid,'RCM-REQ',code))},{q(iid)},{q(code)},{q(process_by_code['TRY-SP-REVREPO']['id'])},'Reverse Repo',
 {q(title)},{q(description)},'SERAYA:Memo Reviu 2025&Scoping_2026#Prioritas Fase 1',
 'SOURCE_CONFIRMED_REQUIREMENT','SOURCE_DETAIL_PENDING','Draft',{q(now)}
)
ON CONFLICT(institutionId,requirementCode) DO UPDATE SET
 processId=excluded.processId,title=excluded.title,description=excluded.description,
 sourceStatus=excluded.sourceStatus,validationStatus=excluded.validationStatus,status='Draft',updatedAt=excluded.updatedAt;
""")
execute("\n".join(req_sql),"/tmp/rcm_requirements.sql")

# ---------------------------------------------------------------------------
# 5) ELC: reference-only. Never insert illustrative ELC rows into ControlMaster.
# ---------------------------------------------------------------------------
elc_source=rows(f"""
SELECT id,sourceDocumentId,recordKey,recordTitle,payloadJson,recordType
FROM SourceStructuredRecord
WHERE institutionId={q(iid)} AND status='Active'
  AND recordType IN ('ELC_PRINCIPLE_TEMPLATE_REFERENCE','ELC_BPM_NARRATIVE_REFERENCE')
ORDER BY recordType,recordKey
""")
if len(elc_source)<17:
    raise RuntimeError("ELC_REFERENCE_SOURCE_TOO_SMALL_"+str(len(elc_source)))
elc_sql=[]
for rec in elc_source:
    code=clean(rec.get("recordKey")).split(":")[-1] or clean(rec.get("recordTitle"))
    elc_sql.append(f"""
INSERT INTO RCMDraftReference(
 id,institutionId,referenceType,referenceCode,title,payloadJson,sourceRecordId,sourceDocumentId,
 sourceReference,sourceStatus,validationRequired,operationalControlId,updatedAt
) VALUES(
 {q(hid(iid,'RCM-DRAFT-REF',rec['recordType'],code))},{q(iid)},{q(rec['recordType'])},{q(code)},
 {q(rec.get('recordTitle'))},{q(rec.get('payloadJson') or '{}')},{q(rec['id'])},{q(rec['sourceDocumentId'])},
 {q('SERAYA:'+str(rec['recordKey']))},'ILLUSTRATIVE_DRAFT',1,NULL,{q(now)}
)
ON CONFLICT(institutionId,referenceType,referenceCode) DO UPDATE SET
 title=excluded.title,payloadJson=excluded.payloadJson,sourceRecordId=excluded.sourceRecordId,
 sourceDocumentId=excluded.sourceDocumentId,sourceReference=excluded.sourceReference,
 sourceStatus='ILLUSTRATIVE_DRAFT',validationRequired=1,operationalControlId=NULL,updatedAt=excluded.updatedAt;
""")
execute("\n".join(elc_sql),"/tmp/rcm_elc_refs.sql")

# ---------------------------------------------------------------------------
# 6) Legacy reconciliation against promoted 2026 controls using normalized text.
#    No fuzzy auto-match: exact normalized name within canonical process only.
# ---------------------------------------------------------------------------
operational=rows(f"""
SELECT c.id,c.controlId,c.name,bp.processId enterpriseProcessId
FROM ControlMaster c JOIN BusinessProcess bp ON bp.id=c.processId
WHERE c.institutionId={q(iid)}
""")
def norm(s):
    return re.sub(r"\s+"," ",re.sub(r"[^a-z0-9]+"," ",clean(s).lower())).strip()
by_process_name={}
for row in operational:
    by_process_name.setdefault((clean(row["enterpriseProcessId"]),norm(row["name"])),[]).append(row)
reconcile_sql=[]
matched=0
for item in legacy:
    candidates=by_process_name.get((item["processCode"],norm(item["activity"])),[])
    if len(candidates)==1:
        matched+=1
        reconcile_sql.append(
          "UPDATE RCMLegacyControlRegister SET reconciliationStatus='MATCHED_EXACT_TO_2026',"+
          "operationalControlId="+q(candidates[0]["id"])+",updatedAt="+q(now)+
          " WHERE institutionId="+q(iid)+" AND sourceNo="+str(item["no"])+";"
        )
execute("\n".join(reconcile_sql) if reconcile_sql else "SELECT 1;","/tmp/rcm_reconcile.sql")

# ---------------------------------------------------------------------------
# 7) Integrity checks. Pending mappings are allowed only when explicitly governed.
# ---------------------------------------------------------------------------
control_count=int(rows("SELECT COUNT(*) n FROM ControlMaster WHERE institutionId="+q(iid))[0]["n"])
legacy_count=int(rows("SELECT COUNT(*) n FROM RCMLegacyControlRegister WHERE institutionId="+q(iid))[0]["n"])
uus_count=int(rows("""
SELECT COUNT(*) n FROM RCMControlSourceMetadata
WHERE institutionId="""+q(iid)+""" AND sourceCycle='SYH'
  AND validationStatus='WALKTHROUGH_PENDING'
""")[0]["n"])
itgc_count=int(rows("SELECT COUNT(*) n FROM ControlMaster WHERE institutionId="+q(iid)+" AND isItgc=1")[0]["n"])
req_count=int(rows("SELECT COUNT(*) n FROM RCMDesignRequirement WHERE institutionId="+q(iid))[0]["n"])
elc_active=int(rows("SELECT COUNT(*) n FROM ControlMaster WHERE institutionId="+q(iid)+" AND controlId LIKE 'ELC-%'")[0]["n"])
elc_refs=int(rows("SELECT COUNT(*) n FROM RCMDraftReference WHERE institutionId="+q(iid)+" AND sourceStatus='ILLUSTRATIVE_DRAFT'")[0]["n"])
invalid_process=int(rows("""
SELECT COUNT(*) n FROM ControlMaster c
LEFT JOIN BusinessProcess p ON p.id=c.processId
WHERE c.institutionId="""+q(iid)+""" AND p.id IS NULL
""")[0]["n"])
invalid_mapping=int(rows("""
SELECT COUNT(*) n FROM ControlRiskMapping m
LEFT JOIN ControlMaster c ON c.id=m.controlId
LEFT JOIN RiskMaster r ON r.id=m.riskId
WHERE (c.institutionId="""+q(iid)+""" OR r.institutionId="""+q(iid)+""")
  AND (c.id IS NULL OR r.id IS NULL)
""")[0]["n"])
cross_process=int(rows("""
SELECT COUNT(*) n
FROM ControlRiskMapping m
JOIN ControlMaster c ON c.id=m.controlId
JOIN RiskMaster r ON r.id=m.riskId
WHERE c.institutionId="""+q(iid)+""" AND r.institutionId="""+q(iid)+"""
  AND c.processId<>r.processId
""")[0]["n"])
false_effective=int(rows("""
SELECT COUNT(*) n FROM ControlMaster
WHERE institutionId="""+q(iid)+""" AND status='Draft'
  AND (designAssessment NOT IN ('Not Assessed','') OR operatingStatus NOT IN ('Not Assessed','')
       OR overallHealth NOT IN ('Not Assessed',''))
""")[0]["n"])
ungoverned_rows=rows("""
SELECT COUNT(*) n FROM (
  SELECT c.id
  FROM ControlMaster c
  LEFT JOIN ControlRiskMapping m ON m.controlId=c.id
  LEFT JOIN RCMControlSourceMetadata sm ON sm.controlId=c.id
  WHERE c.institutionId="""+q(iid)+"""
  GROUP BY c.id
  HAVING COUNT(m.riskId)=0
     AND (MAX(sm.mappingStatus) IS NULL OR MAX(sm.mappingStatus) NOT LIKE 'PENDING%')
)
""")
ungoverned_unmapped=int(ungoverned_rows[0]["n"] if ungoverned_rows else 0)

if legacy_count!=124: raise RuntimeError("VERIFY_LEGACY_124_FAILED")
if uus_count!=42: raise RuntimeError("VERIFY_UUS_42_FAILED_"+str(uus_count))
if itgc_count!=10: raise RuntimeError("VERIFY_ITGC_10_FAILED_"+str(itgc_count))
if req_count!=10: raise RuntimeError("VERIFY_REQUIREMENTS_10_FAILED_"+str(req_count))
if elc_active!=0: raise RuntimeError("ELC_ILLUSTRATIVE_PROMOTED_ACTIVE")
if invalid_process or invalid_mapping or cross_process or false_effective or ungoverned_unmapped:
    raise RuntimeError("RCM_INTEGRITY_FAILED_"+json.dumps({
      "invalidProcess":invalid_process,"invalidMapping":invalid_mapping,"crossProcess":cross_process,
      "falseEffective":false_effective,"ungovernedUnmapped":ungoverned_unmapped
    }))

mapping_stats=rows(f"""
SELECT COALESCE(sm.mappingStatus,'NO_METADATA') status,COUNT(DISTINCT c.id) controls
FROM ControlMaster c
LEFT JOIN RCMControlSourceMetadata sm ON sm.controlId=c.id
WHERE c.institutionId={q(iid)}
GROUP BY COALESCE(sm.mappingStatus,'NO_METADATA')
ORDER BY status
""")
source_stats=rows(f"""
SELECT sourceRecordType,validationStatus,taxonomyStatus,COUNT(*) controls
FROM RCMControlSourceMetadata
WHERE institutionId={q(iid)}
GROUP BY sourceRecordType,validationStatus,taxonomyStatus
ORDER BY sourceRecordType,validationStatus
""")
legacy_stats=rows(f"""
SELECT sourceCycle,reconciliationStatus,COUNT(*) controls
FROM RCMLegacyControlRegister
WHERE institutionId={q(iid)}
GROUP BY sourceCycle,reconciliationStatus
ORDER BY sourceCycle,reconciliationStatus
""")

summary={
  "controlMasterCount":control_count,
  "legacyControlsReconciled":legacy_count,
  "legacyExactMatchesTo2026":matched,
  "uusDraftControls":uus_count,
  "tlc2026Promoted":promoted_tlc,
  "tlc2026ProcessMappingPending":pending_tlc,
  "detail2026Promoted":promoted_detail,
  "itgcControls":itgc_count,
  "ckpnRequirements":len(CKPN_REQUIREMENTS),
  "reverseRepoRequirements":len(REVERSE_REPO_REQUIREMENTS),
  "elcIllustrativeReferences":elc_refs,
  "elcIllustrativeActiveControls":elc_active,
  "mappingStats":mapping_stats,
  "sourceStats":source_stats,
  "legacyStats":legacy_stats,
  "integrity":{
    "invalidProcess":invalid_process,
    "invalidMapping":invalid_mapping,
    "crossProcessMapping":cross_process,
    "falseEffectiveDraftControls":false_effective,
    "ungovernedUnmappedControls":ungoverned_unmapped,
    "status":"PASS"
  }
}
execute(f"""
INSERT INTO RCMIntegrityRun(id,institutionId,batchCode,runAt,status,summaryJson)
VALUES({q(hid(iid,BATCH))},{q(iid)},{q(BATCH)},{q(now)},'PASS',
       {q(json.dumps(summary,ensure_ascii=False,separators=(',',':')))})
ON CONFLICT(institutionId,batchCode) DO UPDATE SET
 runAt=excluded.runAt,status='PASS',summaryJson=excluded.summaryJson;
""","/tmp/rcm_integrity.sql")

feed_table=rows("SELECT name FROM sqlite_master WHERE type='table' AND name='OperationalDataFeedRun'")
if feed_table:
    execute(f"""
INSERT INTO OperationalDataFeedRun(
 id,institutionId,batchCode,module,sourceRole,sourceReferencesJson,recordsUpserted,status,summaryJson,completedAt
) VALUES(
 {q(hid(iid,BATCH,'FEED'))},{q(iid)},{q(BATCH)},'RCM','SOURCE_GOVERNED_MULTI_SOURCE',
 {q(json.dumps(['Seraya Gap Analysis 2025/2026','Seraya RCM TLC 2026','Seraya control detail 2026','Seraya ITGC 2026','Seraya ELC reference'],separators=(',',':')))},
 {control_count+legacy_count+req_count+elc_refs},'Completed',
 {q(json.dumps(summary,ensure_ascii=False,separators=(',',':')))},{q(now)}
)
ON CONFLICT(institutionId,batchCode) DO UPDATE SET
 recordsUpserted=excluded.recordsUpserted,status='Completed',summaryJson=excluded.summaryJson,
 sourceReferencesJson=excluded.sourceReferencesJson,completedAt=excluded.completedAt;
""","/tmp/rcm_feed.sql")

print("=== BANK KALBAR RCM HARDENING RESULT ===")
print(json.dumps(summary,indent=2,ensure_ascii=False))
