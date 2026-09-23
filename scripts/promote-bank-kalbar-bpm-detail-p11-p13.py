import hashlib, json, os, re, subprocess, time
from datetime import datetime, timezone
from pathlib import Path

LEGAL_NAME = "PT. Bank Pembangunan Daerah Kalimantan Barat"
BATCH = "BANK_KALBAR_BPM_DETAIL_P11_P13_20260923"

P11_SOURCE = {
    "role": "AURA_BASELINE",
    "reference": "AURA:1srKBLzglBVviqGq8iX3140pZi3cgcigNg3EQznAWqwg",
    "title": "Salinan PT BPD Kalbar - Business Proses Mapping (BPM)",
    "locator": "Dokumentasi Proses Bisnis!A280:G316",
    "note": "Source explicitly lists subprocess/activity names for Pelayanan Nasabah, but does not provide performer/unit, system, input/output, or SIPOC fields for this section."
}
P13_SOURCE = {
    "role": "SERAYA_UPDATE",
    "reference": "SERAYA:1Lk6fLui8M6jFH20TuCEzZbergBDAqfBh",
    "title": "Salinan BPM-RCM-Walkthrough ITGC - Bank Kalbar (ver.3).xlsx",
    "locator": "BPM - ITGC / BUSINESS PROCESS MAPPING rows 7-34",
    "note": "Source explicitly provides 4 ITGC subprocesses and BPM columns for activity, description, performer/unit, input, system/application, output, risk indication, and RCM reference. No source-specific SIPOC section is present."
}

P11 = {
    "parentCode": "JLN",
    "sourceCode": "P-11",
    "subprocesses": [
        {
            "code":"JLN-DPK-SERVICE",
            "name":"DPK — Pelayanan yang baik",
            "context":"Konvensional/Syariah — Akun terkait: Dana Pihak Ketiga",
            "activities":[
                "Penyambutan & Identifikasi Kebutuhan Nasabah",
                "Layanan Informasi Produk DPK",
                "Layanan Permintaan DPK",
                "Layanan Pengelolaan Keluhan DPK",
                "Layanan Edukasi & Literasi Keuangan",
            ]
        },
        {
            "code":"JLN-DPK-DIGITAL",
            "name":"DPK — Digitalisasi",
            "context":"Konvensional/Syariah — Akun terkait: Dana Pihak Ketiga",
            "activities":[
                "Registrasi & Aktivasi Digital Banking",
                "Layanan Transaksi Digital",
                "Layanan Administrasi Digital",
                "Helpdesk Digital / Layanan Contact Center",
                "Edukasi Digital",
            ]
        },
        {
            "code":"JLN-DPK-AFTER",
            "name":"DPK — Pelayanan Bantuan & After-Service",
            "context":"Konvensional/Syariah — Akun terkait: Dana Pihak Ketiga",
            "activities":[
                "Pemeliharaan Rekening Nasabah DPK",
                "Layanan Perubahan & Perpanjangan Deposito",
                "Manajemen Dokumen & Arsip",
                "Pengelolaan Gangguan Layanan",
                "Monitoring Kepuasan Nasabah",
            ]
        },
        {
            "code":"JLN-KRD-SERVICE",
            "name":"Kredit — Pelayanan yang baik",
            "context":"Konvensional/Syariah — Akun terkait: Kredit yang diberikan",
            "activities":[
                "Penyambutan & Identifikasi Kebutuhan Debitur",
                "Layanan Informasi Produk Kredit",
                "Layanan Pembayaran & Administrasi Kredit",
                "Layanan Perubahan & Permintaan Tambahan Kredit",
                "Layanan Keluhan Debitur (Complaint Handling)",
                "Layanan Edukasi, Literasi & Konsultasi Keuangan",
            ]
        },
        {
            "code":"JLN-KRD-DIGITAL",
            "name":"Kredit — Digitalisasi",
            "context":"Konvensional/Syariah — Akun terkait: Kredit yang diberikan",
            "activities":[
                "Layanan Pembayaran Angsuran Digital",
            ]
        },
        {
            "code":"JLN-KRD-AFTER",
            "name":"Kredit — Pelayanan Bantuan & After-Service",
            "context":"Konvensional/Syariah — Akun terkait: Kredit yang diberikan",
            "activities":[
                "Monitoring Kredit",
                "Layanan Restrukturisasi Kredit",
                "Layanan Pelunasan Kredit",
                "Pengarsipan & Administrasi Kredit",
            ]
        },
    ]
}

P13 = {
    "parentCode": "ITGC",
    "sourceCode": "P-13",
    "subprocesses": [
        {
            "code":"ITGC-APD",
            "name":"Access to Program and Data",
            "activities":[
                {"no":"1.1","name":"Pengajuan Permintaan Akses/User ID","description":"Business User mengajukan permintaan pembuatan User ID aplikasi melalui formulir permintaan, dilengkapi persetujuan Manager Bisnis Unit, deskripsi jabatan, akses yang dibutuhkan, dan tujuan penggunaan.","performer":"Business Unit","input":"Formulir Permintaan User ID","system":None,"output":"Formulir Permintaan User ID (terisi & disetujui atasan)","nature":"Not Assessed"},
                {"no":"1.2","name":"Reviu dan Persetujuan Permintaan Akses","description":"Fungsi TI memeriksa kelengkapan dan kewajaran permintaan, memastikan otorisasi Manager Bisnis Unit, lalu memberikan persetujuan atas permintaan pembuatan user aplikasi.","performer":"Divisi TI","input":"Formulir Permintaan User ID (terisi & disetujui atasan)","system":"Security 724 & E-Config 724","output":"Persetujuan Fungsi TI","nature":"Not Assessed"},
                {"no":"1.3","name":"Pembuatan User ID Aplikasi","description":"Fungsi TI membuat user aplikasi pada sistem terkait sesuai peran dan tanggung jawab yang diajukan dalam permintaan.","performer":"Divisi TI","input":"Persetujuan Fungsi TI","system":"Backend/Frontend Olibs 724, CMS 724, Security 724 & E-Config 724, Suronding, Core Banking","output":"User ID Aplikasi Aktif","nature":"Not Assessed"},
                {"no":"2.1","name":"Pembatasan Akses Perangkat Lunak Sistem","description":"Fungsi TI menetapkan dan menerapkan pembatasan akses ke perangkat lunak sistem berdasarkan tanggung jawab pekerjaan dan otorisasi yang berlaku, termasuk identifikasi dan otorisasi pengguna melalui pengendalian logis.","performer":"Divisi TI","input":"Kebijakan Akses Perangkat Lunak Sistem","system":"Security 724 & E-Config 724","output":"Konfigurasi Akses Perangkat Lunak Sistem","nature":"Not Assessed"},
                {"no":"2.2","name":"Pemantauan Akses dan Perubahan Perangkat Lunak Sistem","description":"Fungsi TI memantau akses dan penggunaan perangkat lunak sistem secara berkelanjutan, serta mengontrol dan memantau setiap perubahan yang dilakukan terhadap perangkat lunak sistem.","performer":"Divisi TI","input":"Log Akses & Perubahan Sistem","system":"Security 724 & E-Config 724","output":"Laporan Pemantauan Akses Perangkat Lunak Sistem","nature":"Not Assessed"},
                {"no":"3.1","name":"Reviu Kepatuhan Kebijakan Keamanan Data","description":"Fungsi TI memastikan karyawan dan pihak terkait mematuhi kebijakan keamanan data (password kuat, akses terbatas, prosedur penanganan data sensitif).","performer":"Divisi TI (Bidang Operasional)","input":"Kebijakan Keamanan Data","system":None,"output":"Hasil Reviu Kepatuhan Kebijakan","nature":"Not Assessed"},
                {"no":"3.2","name":"Reviu Matriks Hak Akses Data Sensitif","description":"Fungsi TI mereviu Matriks Hak Akses Pengguna untuk memastikan hanya personel berwenang yang memiliki akses ke data sensitif, dan memvalidasi keluar-masuknya data pada sistem.","performer":"Divisi TI (Bidang Operasional)","input":"Matriks Hak Akses Pengguna","system":"Security 724 & E-Config 724","output":"Matriks Hak Akses Tervalidasi","nature":"Not Assessed"},
                {"no":"4.1","name":"Penegakan Perlindungan Jaringan (Firewall & Enkripsi)","description":"Sistem keamanan jaringan menerapkan firewall dan enkripsi untuk memblokir akses tidak sah dan melindungi data sensitif yang melintasi jaringan internal-eksternal.","performer":"Divisi TI (Bidang Operasional IT)","input":"Kebijakan Keamanan Jaringan","system":"Firewall & Network Security Appliance","output":"Log Firewall/Enkripsi","nature":"Automated"},
                {"no":"4.2","name":"Pembaruan Keamanan dan Pemantauan Ancaman Siber","description":"Fungsi TI melakukan pembaruan perangkat lunak/sistem operasi secara berkala, memantau ancaman siber, menerapkan kebijakan kata sandi, dan melakukan simulasi serangan (penetration test) berkala.","performer":"Divisi TI (Bidang Operasional IT) & FKKS","input":"Jadwal Patching & Rencana Pentest","system":"Security 724 & E-Config 724","output":"Laporan Patching, Monitoring, dan Pentest","nature":"Not Assessed"},
            ]
        },
        {
            "code":"ITGC-PD",
            "name":"Program Development",
            "activities":[
                {"no":"1.1","name":"Penyusunan dan Persetujuan Kebutuhan Pengembangan (BRD)","description":"Bidang Pengembangan menyusun Business Requirement Document berdasarkan kebutuhan unit bisnis dan memperoleh persetujuan sebelum pengembangan dimulai.","performer":"Divisi TI (Bidang Pengembangan)","input":"Kebutuhan Unit Bisnis","system":None,"output":"BRD Disetujui","nature":"Not Assessed"},
                {"no":"1.2","name":"Pengembangan dengan Pembatasan Akses & Segregation of Duties","description":"Tim pengembang melakukan coding sesuai BRD dengan akses sumber daya (kode, database) dibatasi sesuai peran, memastikan fungsi permintaan, pengembangan, dan pengujian dilakukan oleh pihak yang berbeda.","performer":"Divisi TI (Bidang Pengembangan)","input":"BRD Disetujui","system":"Repository Kode/Development Environment","output":"Source Code Hasil Pengembangan","nature":"Not Assessed"},
                {"no":"1.3","name":"Pengujian SIT/UAT dan Persetujuan Implementasi","description":"Tim pengembang dan pengguna bisnis melakukan System Integration Test dan User Acceptance Test, memverifikasi kesesuaian kode dengan spesifikasi, sebelum Manager TI menyetujui implementasi ke lingkungan produksi.","performer":"Divisi TI (Bidang Pengembangan) & Business User","input":"Source Code Hasil Pengembangan","system":"SIT/UAT Environment","output":"Dokumen UAT/SIT & Persetujuan Implementasi","nature":"Not Assessed"},
            ]
        },
        {
            "code":"ITGC-PC",
            "name":"Program Changes",
            "activities":[
                {"no":"1.1","name":"Identifikasi Kebutuhan Pemeliharaan","description":"Fungsi TI mengidentifikasi sistem operasi dan perangkat lunak yang memerlukan pemeliharaan (patching, perbaikan bug, pembaruan keamanan).","performer":"Divisi TI (Bidang Operasional)","input":"Laporan Kondisi Sistem","system":None,"output":"Daftar Kebutuhan Pemeliharaan","nature":"Not Assessed"},
                {"no":"1.2","name":"Penjadwalan Pemeliharaan","description":"Fungsi TI menyusun jadwal pemeliharaan sistem operasi dan perangkat lunak secara teratur dan memperoleh otorisasi pelaksanaan.","performer":"Divisi TI (Bidang Operasional)","input":"Daftar Kebutuhan Pemeliharaan","system":None,"output":"Jadwal Pemeliharaan Disetujui","nature":"Not Assessed"},
                {"no":"1.3","name":"Pelaksanaan Pemeliharaan dengan Pembatasan Akses","description":"Fungsi TI melaksanakan pemeliharaan sesuai jadwal, dengan akses perubahan dibatasi pada pihak berwenang dan dipisahkan dari fungsi pengembangan (segregation of duties).","performer":"Divisi TI (Bidang Operasional)","input":"Jadwal Pemeliharaan Disetujui","system":"Server/User Root Environment","output":"Log Pelaksanaan Pemeliharaan","nature":"Not Assessed"},
                {"no":"1.4","name":"Verifikasi dan Berita Acara Hasil Pemeliharaan","description":"Manager TI memverifikasi hasil pemeliharaan, memastikan seluruh perubahan telah diotorisasi, direkam, dan diuji sebelum dinyatakan selesai, dituangkan dalam Berita Acara.","performer":"Manager TI","input":"Log Pelaksanaan Pemeliharaan","system":None,"output":"Berita Acara Pemeliharaan Server/User Root","nature":"Not Assessed"},
            ]
        },
        {
            "code":"ITGC-CO",
            "name":"Computer Operations",
            "activities":[
                {"no":"1.1","name":"Penentuan Cakupan dan Metode Backup","description":"Fungsi TI menentukan data yang perlu di-backup berdasarkan kritikalitas dan kebutuhan bisnis, serta memilih metode backup (full/incremental/differential).","performer":"Divisi TI","input":"Klasifikasi Kritikalitas Data","system":None,"output":"Kebijakan & Jadwal Backup","nature":"Not Assessed"},
                {"no":"1.2","name":"Eksekusi dan Pencatatan Backup End of Day","description":"Sistem menjalankan proses backup data secara otomatis pada akhir hari (End of Day) melalui Vendor Sigma dan Xlink, dengan pencatatan nama file, tanggal, dan waktu backup pada media penyimpanan yang aman.","performer":"Divisi TI (Vendor Sigma dan Xlink)","input":"Kebijakan & Jadwal Backup","system":"Backend/Frontend Olibs 724, CMS 724, Security 724 & E-Config 724","output":"Laporan Data Backup End of Day","nature":"Automated"},
                {"no":"2.1","name":"Validasi Input Data","description":"Sistem melakukan validasi atas data yang dimasukkan untuk memastikan data valid, akurat, dan lengkap sebelum diproses lebih lanjut.","performer":"Divisi TI","input":"Data Transaksi Masuk","system":"Core Banking/Olibs 724","output":"Data Tervalidasi","nature":"Automated"},
                {"no":"2.2","name":"Pengendalian Proses dan Output","description":"Sistem memproses data sesuai logika program (dengan pengecekan rumus/urutan untuk mencegah kesalahan logika) dan memvalidasi laporan/output sebelum didistribusikan kepada pengguna.","performer":"Divisi TI (Vendor Sigma dan Xlink)","input":"Data Tervalidasi","system":"Core Banking/Olibs 724","output":"Laporan/Output Tervalidasi","nature":"Automated"},
                {"no":"3.1","name":"Pemantauan Sistem dan Deteksi Anomali","description":"FKKS memantau sistem, jaringan, dan aplikasi secara berkelanjutan melalui Security Operation Center (SOC) menggunakan analisis log dan deteksi anomali untuk mengidentifikasi aktivitas mencurigakan.","performer":"FKKS","input":"Log Sistem, Jaringan, Aplikasi","system":"SOC Tools","output":"Alert/Indikasi Ancaman Keamanan","nature":"Not Assessed"},
                {"no":"3.2","name":"Respons dan Tindak Lanjut Insiden","description":"FKKS melakukan investigasi atas alert yang terdeteksi dan mengeksekusi respons cepat sesuai jenis ancaman (isolasi jaringan, pemberitahuan pengguna, tindakan korektif).","performer":"FKKS","input":"Alert/Indikasi Ancaman Keamanan","system":"SOC Tools","output":"Laporan Security Operation Center (SOC)","nature":"Not Assessed"},
                {"no":"4.1","name":"Replikasi dan Pemantauan Data Cadangan Offsite","description":"Data cadangan direplikasi/dikirim ke lokasi terpisah (Disaster Recovery Center) dari lokasi utama, dengan pemantauan reguler dan validasi keamanan atas proses penyimpanan.","performer":"Divisi TI (Bidang Operasional IT)","input":"Laporan Data Backup End of Day","system":"DRC Replication Tools","output":"Data Cadangan Tersimpan di DRC","nature":"Not Assessed"},
                {"no":"4.2","name":"Uji Pemulihan (Recovery Test) Data Cadangan","description":"Fungsi TI melakukan uji pemulihan atas data cadangan di DRC untuk memastikan data dapat dipulihkan secara cepat dan lengkap jika terjadi bencana atau gangguan pada lokasi utama.","performer":"Divisi TI (Bidang Operasional IT)","input":"Data Cadangan Tersimpan di DRC","system":"DRC Environment","output":"Laporan Disaster Recovery Center (DRC)","nature":"Not Assessed"},
            ]
        },
    ]
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
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'","''") + "'"

def hid(*parts):
    return hashlib.sha256("|".join(map(str,parts)).encode()).hexdigest()[:40]

def execute(sql,path="/tmp/bpm_detail.sql"):
    Path(path).write_text(sql,encoding="utf-8")
    wr(["d1","execute",DB,"--remote","--file",path])

now=datetime.now(timezone.utc).isoformat().replace("+00:00","Z")
effective=now[:10]

ddl="""
CREATE TABLE IF NOT EXISTS BPMSourceEvidence (
  id TEXT PRIMARY KEY NOT NULL,
  institutionId TEXT NOT NULL,
  processId TEXT NOT NULL,
  recordType TEXT NOT NULL,
  sourceReference TEXT NOT NULL,
  sourceTitle TEXT NOT NULL,
  sourceLocator TEXT,
  sourceRole TEXT NOT NULL,
  sourceStatus TEXT NOT NULL,
  payloadJson TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bpm_source_evidence_unique
  ON BPMSourceEvidence(processId,recordType,sourceReference,sourceLocator);

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
execute(ddl,"/tmp/bpm_detail_ddl.sql")

inst=rows("SELECT * FROM Institution WHERE legalName="+q(LEGAL_NAME)+" LIMIT 1")
if len(inst)!=1:
    raise RuntimeError("BANK_KALBAR_INSTITUTION_NOT_FOUND")
iid=str(inst[0]["id"])

parents={}
for code in ("JLN","ITGC"):
    found=rows("SELECT * FROM BusinessProcess WHERE institutionId="+q(iid)+" AND processId="+q(code)+" LIMIT 2")
    if len(found)!=1:
        raise RuntimeError("PARENT_PROCESS_"+code+"_COUNT_"+str(len(found)))
    parents[code]=found[0]

def merge_parent_tags(parent, patch):
    raw=parent.get("tags")
    try:
        tags=json.loads(raw) if raw else {}
    except Exception:
        tags={}
    tags.update(patch)
    return json.dumps(tags,ensure_ascii=False,separators=(",",":"))

parent_updates = {
    "JLN": {
        "detailStatus":"PARTIAL_SOURCE_DETAIL",
        "l3Loaded":True,
        "activityDetailLoaded":True,
        "performerSystemInputOutputStatus":"NOT_AVAILABLE_IN_P11_SOURCE",
        "sipocStatus":"NOT_AVAILABLE_IN_SOURCE",
        "detailSource":P11_SOURCE["reference"],
    },
    "ITGC": {
        "detailStatus":"SOURCE_DETAIL_LOADED",
        "l3Loaded":True,
        "activityDetailLoaded":True,
        "performerSystemInputOutputStatus":"SOURCE_EXPLICIT",
        "sipocStatus":"NOT_AVAILABLE_IN_SOURCE",
        "detailSource":P13_SOURCE["reference"],
    }
}
for code,parent in parents.items():
    tags=merge_parent_tags(parent,parent_updates[code])
    execute(
        "UPDATE BusinessProcess SET tags="+q(tags)+",updatedAt="+q(now)+" WHERE id="+q(parent["id"])+";",
        "/tmp/bpm_parent_tags.sql"
    )

created_subprocesses=[]
activity_count=0
source_evidence_count=0

def upsert_subprocess(parent, source_code, sp, source, classification, category_id):
    global activity_count, source_evidence_count
    child_id=hid(iid,BATCH,source_code,sp["code"])
    tags=json.dumps({
        "sourceBacked":True,
        "feedBatch":BATCH,
        "icoFrScopingCode":source_code,
        "sourceReference":source["reference"],
        "sourceLocator":source["locator"],
        "sourceRole":source["role"],
        "sourceStatus":"SOURCE_CONFIRMED",
        "sipocStatus":"NOT_AVAILABLE_IN_SOURCE",
        "activityFieldPolicy":"SOURCE_ONLY_NO_INFERENCE"
    },ensure_ascii=False,separators=(",",":"))
    desc=sp.get("context") or ("Source-confirmed subprocess of "+str(parent["name"]))
    execute(f"""
INSERT INTO BusinessProcess(
  id,institutionId,legalEntityId,orgUnitId,categoryId,processId,name,level,parentProcessId,
  description,ownerName,ownerEmail,managerName,criticality,classification,isIcofrRelevant,
  status,version,effectiveDate,reviewDate,tags,createdAt,updatedAt
) VALUES(
  {q(child_id)},{q(iid)},{q(parent.get('legalEntityId'))},{q(parent.get('orgUnitId'))},
  {q(category_id)},{q(sp['code'])},{q(sp['name'])},3,{q(parent['id'])},
  {q(desc)},'',NULL,NULL,'Not Assessed',{q(classification)},1,
  'Draft','1.0',{q(effective)},NULL,{q(tags)},{q(now)},{q(now)}
)
ON CONFLICT(id) DO UPDATE SET
  categoryId=excluded.categoryId,name=excluded.name,level=3,parentProcessId=excluded.parentProcessId,
  description=excluded.description,isIcofrRelevant=1,status='Draft',tags=excluded.tags,updatedAt=excluded.updatedAt;
""","/tmp/bpm_subprocess_upsert.sql")
    created_subprocesses.append(sp["code"])

    activities=sp["activities"]
    for idx,act in enumerate(activities,1):
        if isinstance(act,str):
            record={
                "no":str(idx),
                "name":act,
                "description":None,
                "performer":None,
                "input":None,
                "system":None,
                "output":None,
                "nature":"Not Assessed"
            }
        else:
            record=act
        activity_id=hid(iid,BATCH,sp["code"],record["no"],record["name"])
        enterprise_activity_id=f"{sp['code']}-{idx:02d}"
        execute(f"""
INSERT INTO ProcessActivity(
  id,processId,activityId,name,description,performer,nature,frequency,
  inputData,outputData,systemUsed,sla,orderIndex,createdAt
) VALUES(
  {q(activity_id)},{q(child_id)},{q(enterprise_activity_id)},{q(record['name'])},{q(record.get('description'))},
  {q(record.get('performer'))},{q(record.get('nature') or 'Not Assessed')},'Not Assessed',
  {q(record.get('input'))},{q(record.get('output'))},{q(record.get('system'))},NULL,{idx},{q(now)}
)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name,description=excluded.description,performer=excluded.performer,
  nature=excluded.nature,frequency=excluded.frequency,inputData=excluded.inputData,
  outputData=excluded.outputData,systemUsed=excluded.systemUsed,orderIndex=excluded.orderIndex;
""","/tmp/bpm_activity_upsert.sql")
        activity_count += 1

        ev_id=hid(iid,BATCH,"ACTIVITY_EVIDENCE",sp["code"],enterprise_activity_id)
        payload={
            "sourceCode":source_code,
            "subprocessCode":sp["code"],
            "sourceActivityNo":record["no"],
            "activityName":record["name"],
            "performer":record.get("performer"),
            "input":record.get("input"),
            "system":record.get("system"),
            "output":record.get("output"),
            "fieldAvailability":{
                "performer":record.get("performer") is not None,
                "input":record.get("input") is not None,
                "system":record.get("system") is not None,
                "output":record.get("output") is not None,
            }
        }
        execute(f"""
INSERT INTO BPMSourceEvidence(
  id,institutionId,processId,recordType,sourceReference,sourceTitle,sourceLocator,
  sourceRole,sourceStatus,payloadJson,createdAt,updatedAt
) VALUES(
  {q(ev_id)},{q(iid)},{q(child_id)},'ACTIVITY',{q(source['reference'])},{q(source['title'])},
  {q(source['locator'])},{q(source['role'])},'SOURCE_CONFIRMED',
  {q(json.dumps(payload,ensure_ascii=False,separators=(",",":")))},{q(now)},{q(now)}
)
ON CONFLICT(id) DO UPDATE SET
  sourceStatus='SOURCE_CONFIRMED',payloadJson=excluded.payloadJson,updatedAt=excluded.updatedAt;
""","/tmp/bpm_activity_evidence.sql")
        source_evidence_count += 1

    ev_id=hid(iid,BATCH,"SUBPROCESS_EVIDENCE",sp["code"])
    execute(f"""
INSERT INTO BPMSourceEvidence(
  id,institutionId,processId,recordType,sourceReference,sourceTitle,sourceLocator,
  sourceRole,sourceStatus,payloadJson,createdAt,updatedAt
) VALUES(
  {q(ev_id)},{q(iid)},{q(child_id)},'SUBPROCESS',{q(source['reference'])},{q(source['title'])},
  {q(source['locator'])},{q(source['role'])},'SOURCE_CONFIRMED',
  {q(json.dumps({"sourceCode":source_code,"subprocessCode":sp["code"],"name":sp["name"],"sourceNote":source["note"]},ensure_ascii=False,separators=(",",":")))},
  {q(now)},{q(now)}
)
ON CONFLICT(id) DO UPDATE SET
  sourceStatus='SOURCE_CONFIRMED',payloadJson=excluded.payloadJson,updatedAt=excluded.updatedAt;
""","/tmp/bpm_subprocess_evidence.sql")
    source_evidence_count += 1
    return child_id

p11_parent=parents["JLN"]
for sp in P11["subprocesses"]:
    upsert_subprocess(
        p11_parent,P11["sourceCode"],sp,P11_SOURCE,
        str(p11_parent.get("classification") or "Core"),
        str(p11_parent["categoryId"])
    )

p13_parent=parents["ITGC"]
for sp in P13["subprocesses"]:
    upsert_subprocess(
        p13_parent,P13["sourceCode"],sp,P13_SOURCE,
        str(p13_parent.get("classification") or "Technology"),
        str(p13_parent["categoryId"])
    )

# Explicitly preserve absence of source-specific SIPOC rather than generate one.
for code,parent in parents.items():
    source=P11_SOURCE if code=="JLN" else P13_SOURCE
    ev_id=hid(iid,BATCH,"SIPOC_GAP",code)
    payload={
        "status":"NOT_AVAILABLE_IN_SOURCE",
        "action":"LEFT_EMPTY_NO_INFERENCE",
        "reason":"No source-specific SIPOC table/fields were found in the governing BPM artifact used for this process."
    }
    execute(f"""
INSERT INTO BPMSourceEvidence(
  id,institutionId,processId,recordType,sourceReference,sourceTitle,sourceLocator,
  sourceRole,sourceStatus,payloadJson,createdAt,updatedAt
) VALUES(
  {q(ev_id)},{q(iid)},{q(parent['id'])},'SIPOC',{q(source['reference'])},{q(source['title'])},
  {q(source['locator'])},{q(source['role'])},'NOT_AVAILABLE_IN_SOURCE',
  {q(json.dumps(payload,ensure_ascii=False,separators=(",",":")))},{q(now)},{q(now)}
)
ON CONFLICT(id) DO UPDATE SET
 sourceStatus='NOT_AVAILABLE_IN_SOURCE',payloadJson=excluded.payloadJson,updatedAt=excluded.updatedAt;
""","/tmp/bpm_sipoc_evidence.sql")
    source_evidence_count += 1

# Validation
children=rows(f"""
SELECT id,processId,name,parentProcessId
FROM BusinessProcess
WHERE institutionId={q(iid)}
  AND parentProcessId IN ({q(p11_parent['id'])},{q(p13_parent['id'])})
  AND processId IN ({",".join(q(x["code"]) for x in P11["subprocesses"]+P13["subprocesses"])})
ORDER BY processId
""")
if len(children)!=10:
    raise RuntimeError("EXPECTED_10_SOURCE_SUBPROCESSES_GOT_"+str(len(children)))

p11_ids=[str(x["id"]) for x in children if str(x["processId"]).startswith("JLN-")]
p13_ids=[str(x["id"]) for x in children if str(x["processId"]).startswith("ITGC-")]
if len(p11_ids)!=6 or len(p13_ids)!=4:
    raise RuntimeError("SUBPROCESS_SPLIT_VERIFY_FAILED")

def count_activities(ids):
    return int(rows("SELECT COUNT(*) AS n FROM ProcessActivity WHERE processId IN ("+",".join(q(x) for x in ids)+")")[0]["n"])

p11_activity_count=count_activities(p11_ids)
p13_activity_count=count_activities(p13_ids)
if p11_activity_count!=26:
    raise RuntimeError("P11_ACTIVITY_COUNT_"+str(p11_activity_count)+"_EXPECTED_26")
if p13_activity_count!=24:
    raise RuntimeError("P13_ACTIVITY_COUNT_"+str(p13_activity_count)+"_EXPECTED_24")

p11_field_counts=rows("SELECT COUNT(*) AS n, SUM(CASE WHEN performer IS NOT NULL AND trim(performer)<>'' THEN 1 ELSE 0 END) AS performer, SUM(CASE WHEN systemUsed IS NOT NULL AND trim(systemUsed)<>'' THEN 1 ELSE 0 END) AS systemUsed, SUM(CASE WHEN inputData IS NOT NULL AND trim(inputData)<>'' THEN 1 ELSE 0 END) AS inputData, SUM(CASE WHEN outputData IS NOT NULL AND trim(outputData)<>'' THEN 1 ELSE 0 END) AS outputData FROM ProcessActivity WHERE processId IN ("+",".join(q(x) for x in p11_ids)+")")[0]
p13_field_counts=rows("SELECT COUNT(*) AS n, SUM(CASE WHEN performer IS NOT NULL AND trim(performer)<>'' THEN 1 ELSE 0 END) AS performer, SUM(CASE WHEN systemUsed IS NOT NULL AND trim(systemUsed)<>'' THEN 1 ELSE 0 END) AS systemUsed, SUM(CASE WHEN inputData IS NOT NULL AND trim(inputData)<>'' THEN 1 ELSE 0 END) AS inputData, SUM(CASE WHEN outputData IS NOT NULL AND trim(outputData)<>'' THEN 1 ELSE 0 END) AS outputData FROM ProcessActivity WHERE processId IN ("+",".join(q(x) for x in p13_ids)+")")[0]

if any(int(p11_field_counts.get(k) or 0)!=0 for k in ("performer","systemUsed","inputData","outputData")):
    raise RuntimeError("P11_UNSUPPORTED_FIELDS_WERE_POPULATED")
if any(int(p13_field_counts.get(k) or 0)!=24 for k in ("performer","inputData","outputData")):
    raise RuntimeError("P13_SOURCE_FIELDS_INCOMPLETE")
# Some P13 activities explicitly have '-' system in source and therefore remain null.
if int(p13_field_counts.get("systemUsed") or 0) < 14:
    raise RuntimeError("P13_SYSTEM_FIELD_UNEXPECTEDLY_LOW")

sipocs=rows("SELECT COUNT(*) AS n FROM SIPOC WHERE processId IN ("+",".join(q(x) for x in p11_ids+p13_ids+[str(p11_parent['id']),str(p13_parent['id'])])+")")
if int(sipocs[0]["n"])!=0:
    raise RuntimeError("SIPOC_FOUND_WHERE_SOURCE_HAS_NONE")

summary={
    "parents":{"P-11":p11_parent["id"],"P-13":p13_parent["id"]},
    "subprocesses":{"P-11":6,"P-13":4,"total":10},
    "activities":{"P-11":p11_activity_count,"P-13":p13_activity_count,"total":p11_activity_count+p13_activity_count},
    "sourceFieldCoverage":{
        "P-11":{
            "performer":0,"system":0,"input":0,"output":0,
            "reason":"Not supplied in the Pelayanan Nasabah section of the source BPM artifact."
        },
        "P-13":{
            "performer":int(p13_field_counts.get("performer") or 0),
            "system":int(p13_field_counts.get("systemUsed") or 0),
            "input":int(p13_field_counts.get("inputData") or 0),
            "output":int(p13_field_counts.get("outputData") or 0),
            "reason":"Loaded only where explicitly populated in the ITGC BPM source."
        }
    },
    "sipoc":{"P-11":"NOT_AVAILABLE_IN_SOURCE","P-13":"NOT_AVAILABLE_IN_SOURCE"},
    "flowFabricated":False,
    "nonBpmModulesModified":False,
    "sources":[P11_SOURCE,P13_SOURCE]
}
feed_id=hid(iid,BATCH)
execute(f"""
INSERT INTO OperationalDataFeedRun(
 id,institutionId,batchCode,module,sourceRole,sourceReferencesJson,recordsUpserted,status,summaryJson,completedAt
) VALUES(
 {q(feed_id)},{q(iid)},{q(BATCH)},'Business Process Management','SOURCE_GOVERNED',
 {q(json.dumps([P11_SOURCE,P13_SOURCE],ensure_ascii=False,separators=(",",":")))},
 {10+50+source_evidence_count},'Completed',{q(json.dumps(summary,ensure_ascii=False,separators=(",",":")))},{q(now)}
)
ON CONFLICT(institutionId,batchCode) DO UPDATE SET
 sourceReferencesJson=excluded.sourceReferencesJson,recordsUpserted=excluded.recordsUpserted,
 status='Completed',summaryJson=excluded.summaryJson,completedAt=excluded.completedAt;
""","/tmp/bpm_detail_feed.sql")

audit_id=hid(iid,BATCH,"AUDIT")
execute(f"""
INSERT OR REPLACE INTO AuditLog(
 id,institutionId,userName,userRole,action,entityType,recordId,oldValue,newValue,reason,ipAddress,timestamp
) VALUES(
 {q(audit_id)},{q(iid)},'System','System','UPSERT','Process',
 {q(str(p11_parent['id'])+'|'+str(p13_parent['id']))},NULL,
 {q(json.dumps(summary,ensure_ascii=False,separators=(",",":")))},
 'Load source-supported L3 BPM and activity detail for Bank Kalbar P-11 and P-13 without inferring missing performer/system/input/output/SIPOC fields.',
 NULL,{q(now)}
);
""","/tmp/bpm_detail_audit.sql")

print("=== BANK KALBAR BPM P11 P13 SOURCE DETAIL ===")
print(json.dumps(summary,indent=2,ensure_ascii=False))
