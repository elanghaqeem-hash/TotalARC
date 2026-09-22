import hashlib, json, os, re, subprocess, time
from datetime import datetime, timezone
from pathlib import Path

LEGAL_NAME = "PT. Bank Pembangunan Daerah Kalimantan Barat"
BATCH = "BANK_KALBAR_ICOFR_SCOPING_2026_20260922"
SCOPE_NAME = "Bank Kalbar ICOFR Tahun Buku 2026"

SOURCE_MEMO = "USER_UPLOAD:Dokumen 1. Memo Reviu 2025&Scoping_2026 (send new).pdf"
SOURCE_METHOD = "USER_UPLOAD:Dokumen 10 Memo_Kerangka_Metodologi_ICOFR_2026 (send new).pdf"
SOURCE_SCOPE_WORKPAPER = "SERAYA:1ceXuBoo3gLLMKREbY9Ysm3a8tcg7w3wb#Kertas Kerja Penentuan Materialitas"
SOURCE_METHOD_WORKPAPER = "SERAYA:1tbpwcCpsYIgAKzp0sSAByS-X8D_vtYaL#Kerangka Metodologi ICOFR 2026"

# The two uploaded memoranda are the governing source for values below.
# A deliberate source-reconciliation flag is persisted because the memo states
# PBT 2025 = Rp673.381bn and OM%=5%, while its stated OM is Rp31.9049bn.
# The feed does NOT silently recalculate or overwrite either document-literal value.
BENCHMARK_AMOUNT = 673_381_000_000
OM_PERCENT = 5.0
OM_AMOUNT = 31_904_900_000
PM_PERCENT = 50.0
PM_AMOUNT = 15_952_500_000
TOLERANCE_HAIRCUT_PERCENT = 17.5
TOLERABLE_THRESHOLD = 13_160_800_000
CLEARLY_TRIVIAL_PERCENT_OF_PM = 5.0
CLEARLY_TRIVIAL_AMOUNT = 797_620_000

PROCESS_SCOPE = [
    {
        "code":"SC-BP-CKPN","name":"Akuntansi - CKPN","aliases":["CKPN","Cadangan Kerugian Penurunan Nilai"],
        "priority":"High","rationale":"Prioritas utama; BPM tersedia namun RCM belum tersedia dan beban CKPN TB 2025 naik 298,2%."
    },
    {
        "code":"SC-BP-UUS","name":"Unit Usaha Syariah","aliases":["Unit Usaha Syariah","UUS","Syariah"],
        "priority":"High","rationale":"Dipertahankan sebagai proses terpisah; RCM 2025 memiliki 42 pengendalian namun BPM belum memadai."
    },
    {
        "code":"SC-BP-KREDIT","name":"Penyaluran Kredit","aliases":["Penyaluran Kredit","Kredit","Perkreditan","Kredit/Pembiayaan"],
        "priority":"High","rationale":"Akun terbesar dan cakupan walkthrough/pengujian 2025 belum proporsional."
    },
    {
        "code":"SC-BP-CLOSE","name":"Rekonsiliasi, Tutup Buku dan Pelaporan","aliases":["Tutup Buku","Pelaporan","Rekonsiliasi","Rekonsiliasi, Tutup Buku dan Pelaporan"],
        "priority":"Medium","rationale":"Perlu pengendalian jurnal manual, akun ekuitas dan pengungkapan."
    },
    {
        "code":"SC-BP-TREASURY","name":"Treasury","aliases":["Treasury","Tresuri"],
        "priority":"Medium","rationale":"Perlu pemutakhiran atribut RCM dan mencakup perubahan komposisi portofolio."
    },
    {
        "code":"SC-BP-DPK","name":"Dana Pihak Ketiga (DPK)","aliases":["Dana Pihak Ketiga","DPK","Funding"],
        "priority":"Medium","rationale":"Proses signifikan; atribut RCM perlu diperbaiki."
    },
    {
        "code":"SC-BP-TAX","name":"Perpajakan","aliases":["Perpajakan","Pajak"],
        "priority":"Medium","rationale":"Proses signifikan dan pemilik untuk akun Beban Pajak Kini."
    },
    {
        "code":"SC-BP-PROC","name":"Pengadaan","aliases":["Pengadaan","Pengadaan Barang dan Jasa"],
        "priority":"Medium","rationale":"Proses signifikan; atribut RCM perlu diperbaiki."
    },
    {
        "code":"SC-BP-PAYROLL","name":"SDM dan Penggajian","aliases":["Penggajian","SDM","SDM dan Penggajian","Sumber Daya Manusia"],
        "priority":"Medium","rationale":"Proses signifikan dan pemilik untuk Liabilitas Imbalan Kerja."
    },
    {
        "code":"SC-BP-INT","name":"Otomatisasi Bunga","aliases":["Otomatisasi Bunga","Otomatisasi Pendapatan Bunga","Otomatisasi Beban Bunga"],
        "priority":"Medium","rationale":"Proses signifikan; parameter dan rekonsiliasi bunga memengaruhi laporan keuangan."
    },
    {
        "code":"SC-BP-AML","name":"Kepatuhan APU PPT","aliases":["Kepatuhan APU PPT","APU PPT","Kepatuhan","AML"],
        "priority":"Low","rationale":"Dampak terhadap laporan keuangan bersifat tidak langsung namun tetap relevan."
    },
    {
        "code":"SC-BP-RREPO","name":"Transaksi Reverse Repo","aliases":["Reverse Repo","Transaksi Reverse Repo"],
        "priority":"High","rationale":"Instrumen baru TB 2025 senilai Rp289,920 juta; belum memiliki proses bisnis/BPM/pengendalian."
    },
]

OTHER_SCOPE = [
    {
        "code":"SC-ELC","name":"Entity Level Control","inScope":1,
        "rationale":"Prioritas tinggi; belum didokumentasikan pada 2025 dan harus disusun berbasis 5 komponen/17 prinsip COSO."
    },
    {
        "code":"SC-ITGC","name":"IT General Controls (ITGC)","inScope":1,
        "rationale":"Prioritas tinggi; perlu disusun ulang dalam 4 domain dan dipetakan ke aplikasi signifikan."
    },
    {
        "code":"SC-CUSTOMER-SERVICE","name":"Pelayanan Nasabah","inScope":0,
        "rationale":"Keputusan Steering Committee masih diperlukan: digabung ke DPK atau dikeluarkan dari ruang lingkup dengan rasional tertulis."
    },
]

FINANCIAL_ITEMS = [
    {
      "code":"FSLI-CURRENT-TAX-EXPENSE","name":"Beban Pajak Kini","amount":166_065_424_000,
      "process":"Perpajakan","rationale":"Akun signifikan berisiko tinggi yang pada reviu 2025 belum memiliki process owner; nilai adalah angka pada kertas kerja reviu 2025."
    },
    {
      "code":"FSLI-EMPLOYEE-BENEFIT-LIAB","name":"Liabilitas Imbalan Kerja","amount":42_543_670_000,
      "process":"SDM dan Penggajian","rationale":"Akun signifikan berisiko tinggi yang pada reviu 2025 belum memiliki process owner; nilai adalah angka pada kertas kerja reviu 2025."
    },
    {
      "code":"FSLI-RETAINED-EARNINGS","name":"Saldo Laba","amount":2_510_558_276_000,
      "process":"Rekonsiliasi, Tutup Buku dan Pelaporan","rationale":"Akun signifikan berisiko tinggi yang pada reviu 2025 belum memiliki process owner; dipetakan ke tutup buku/pelaporan."
    },
    {
      "code":"FSLI-SHARE-CAPITAL","name":"Modal Saham","amount":1_779_390_000_000,
      "process":"Rekonsiliasi, Tutup Buku dan Pelaporan","rationale":"Akun signifikan berisiko tinggi yang pada reviu 2025 belum memiliki process owner; dipetakan ke tutup buku/pelaporan."
    },
    {
      "code":"FSLI-OCI","name":"Penghasilan Komprehensif Lainnya","amount":14_860_932_000,
      "process":"Rekonsiliasi, Tutup Buku dan Pelaporan","rationale":"Akun signifikan berisiko tinggi yang pada reviu 2025 belum memiliki process owner; signifikansi bersifat source-governed dan tidak disimpulkan ulang dari nilai."
    },
    {
      "code":"FSLI-REVERSE-REPO","name":"Tagihan atas Surat Berharga Reverse Repo","amount":289_920_000_000,
      "process":"Transaksi Reverse Repo","rationale":"Instrumen baru TB 2025, material dan belum memiliki BPM/RCM pada hasil reviu."
    },
    {
      "code":"FSLI-CKPN-EXPENSE","name":"Beban CKPN","amount":102_040_000_000,
      "process":"Akuntansi - CKPN","rationale":"Beban CKPN TB 2025 naik 298,2%; area estimasi prioritas utama scoping 2026."
    },
]

APPLICATION_ITEMS = [
    {"code":"APP-ALFABITS","name":"ALFABITS","inScope":1,"rationale":"Nama resmi core banking telah dikonfirmasi Bank; penyebutan harus diseragamkan."},
    {"code":"APP-ANTASENA","name":"Antasena","inScope":1,"rationale":"Aplikasi pelaporan regulator; memo menyatakan perlu diperlakukan signifikan."},
    {"code":"APP-GOAML-SY","name":"GOAML Syariah","inScope":1,"rationale":"Aplikasi pelaporan regulator/PPATK; memo menyatakan perlu diperlakukan signifikan."},
    {"code":"APP-GOAML-CONV","name":"GOAML Konvensional","inScope":1,"rationale":"Aplikasi pelaporan regulator/PPATK; memo menyatakan perlu diperlakukan signifikan."},
    {"code":"APP-OBOX","name":"Sistem Pelaporan Regulator (OBOX)","inScope":1,"rationale":"Aplikasi pelaporan regulator; memo menyatakan perlu diperlakukan signifikan."},
    {"code":"APP-PSAK","name":"Aplikasi PSAK / OLIBS 724","inScope":1,"rationale":"Aplikasi terkait PSAK/estimasi; nama/modul perlu distandardisasi dan dipetakan terhadap ALFABITS."},
    {"code":"APP-XTELLER","name":"X Teller","inScope":1,"rationale":"Sumber 2025 menyimpulkan signifikan tetapi rasionalnya kontradiktif; tetap ditandai in-scope untuk revalidation, bukan dianggap final."},
    {"code":"APP-REK-KORAN","name":"Aplikasi Rekening Koran","inScope":1,"rationale":"Sumber 2025 menyimpulkan signifikan tetapi rasionalnya kontradiktif; revalidation diperlukan."},
    {"code":"APP-ATI-GEN2","name":"Aplikasi Aktiva Tetap (ATI) Gen 2","inScope":1,"rationale":"Sumber 2025 menyimpulkan signifikan tetapi rasionalnya kontradiktif; revalidation diperlukan."},
    {"code":"APP-LAKU-PANDAI","name":"Laku Pandai","inScope":1,"rationale":"Sumber 2025 menyimpulkan signifikan tetapi rasionalnya kontradiktif; revalidation diperlukan."},
    {"code":"APP-SAMSAT","name":"Samsat Online Daerah","inScope":1,"rationale":"Sumber 2025 menyimpulkan signifikan tetapi rasionalnya kontradiktif; revalidation diperlukan."},
]

def wr(args, retries=5):
    last = None
    for attempt in range(retries):
        p = subprocess.run(["npx","wrangler",*args], text=True, env=os.environ, capture_output=True)
        if p.returncode == 0:
            return p.stdout
        last = p
        time.sleep(2 + attempt * 2)
    print((last.stdout if last else "")[-5000:])
    print((last.stderr if last else "")[-5000:])
    raise RuntimeError("WRANGLER_COMMAND_FAILED")

dbs = json.loads(wr(["d1","list","--json"]))
db = next((x for x in dbs if re.search(r"total.?arc", x["name"], re.I)), None)
if not db:
    db = dbs[0] if len(dbs) == 1 else None
if not db:
    raise RuntimeError("TOTAL_ARC_D1_NOT_FOUND")
DB = db["name"]

def rows(sql):
    raw = json.loads(wr(["d1","execute",DB,"--remote","--json","--command",sql]))
    raw = raw if isinstance(raw, list) else [raw]
    return [r for block in raw for r in (block.get("results") or [])]

def q(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'","''") + "'"

def hid(*parts):
    return hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()[:40]

def execute(sql, path="/tmp/icofr_scoping.sql"):
    Path(path).write_text(sql)
    wr(["d1","execute",DB,"--remote","--file",path])

def norm(value):
    return re.sub(r"[^a-z0-9]+"," ",str(value or "").lower()).strip()

now = datetime.now(timezone.utc).isoformat().replace("+00:00","Z")

ddl = """
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
execute(ddl, "/tmp/icofr_scoping_ddl.sql")

inst = rows("SELECT * FROM Institution WHERE legalName="+q(LEGAL_NAME)+" LIMIT 1")
if len(inst) != 1:
    raise RuntimeError("BANK_KALBAR_INSTITUTION_NOT_FOUND")
iid = str(inst[0]["id"])

entity = rows("SELECT id,code,name FROM LegalEntity WHERE institutionId="+q(iid)+" AND code='BANK-KALBAR' LIMIT 1")
if len(entity) != 1:
    raise RuntimeError("BANK_KALBAR_ENTITY_NOT_FOUND")

existing = rows(
    "SELECT * FROM ICOFRScope WHERE institutionId="+q(iid)+
    " AND fiscalYear=2026 AND scopeName="+q(SCOPE_NAME)+" LIMIT 1"
)
scope_id = str(existing[0]["id"]) if existing else hid(iid,"ICOFR-SCOPE","2026")
created_at = str(existing[0].get("createdAt") or now) if existing else now

quant_criteria = (
    "FSLI signifikan apabila nilai sama dengan atau melebihi PM; uji cakupan mensyaratkan "
    "minimal dua per tiga nilai per FSLI dan minimal dua per tiga nilai operasi/posisi keuangan. "
    "Bank Kalbar merupakan entitas tunggal sehingga cakupan lokasi dinyatakan 100%."
)
qual_criteria = (
    "Delapan faktor kualitatif: kerentanan terhadap salah catat/kecurangan; volume aktivitas; "
    "kompleksitas aktivitas; karakteristik bawaan/paparan kerugian; kerumitan akuntansi/pelaporan; "
    "kewajiban kontinjensi signifikan; pihak berelasi; perubahan komponen atau penyajian akun."
)
notes = (
    "Source-governed baseline from the two user-attached 2026 ICOFR memoranda. "
    "The memo states PBT 2025 Rp673,381,000,000, OM 5%, and OM Rp31,904,900,000; "
    "these literals do not arithmetically reconcile. Total ARC preserves the document values and "
    "flags the discrepancy for Steering Committee confirmation rather than silently recalculating. "
    "PM Rp15,952,500,000 is retained as Under Review/Provisional pending confirmation of the "
    "management letter and 2025 audit adjustments. Detailed rows for all 38 significant FSLIs and "
    "all applications are not enumerated in the attached PDFs; only source-explicit named items are promoted."
)
scope_sql = f"""
INSERT INTO ICOFRScope (
 id,institutionId,scopeName,fiscalYear,reportingPeriod,currency,consolidationBasis,
 accountingFramework,benchmarkType,benchmarkAmount,overallMaterialityPercent,
 overallMaterialityAmount,performanceMaterialityPercent,performanceMaterialityAmount,
 clearlyTrivialPercent,clearlyTrivialAmount,componentMaterialityAmount,scopeApproach,
 quantitativeCriteria,qualitativeCriteria,exclusions,status,preparedBy,reviewedBy,
 approvedBy,notes,createdAt,updatedAt
) VALUES (
 {q(scope_id)},{q(iid)},{q(SCOPE_NAME)},2026,'Annual','IDR','Standalone',
 'PSAK / OJK reporting','Profit Before Tax',{BENCHMARK_AMOUNT},{OM_PERCENT},{OM_AMOUNT},
 {PM_PERCENT},{PM_AMOUNT},{CLEARLY_TRIVIAL_PERCENT_OF_PM},{CLEARLY_TRIVIAL_AMOUNT},NULL,
 'Top-down risk-based',{q(quant_criteria)},{q(qual_criteria)},
 {q("Pelayanan Nasabah belum ditetapkan final: Steering Committee perlu memutuskan digabung ke DPK atau dikeluarkan dengan rasional tertulis.")},
 'Under Review','Fungsi ICOFR / Task Force Bank Kalbar','Divisi Manajemen Risiko',NULL,
 {q(notes)},{q(created_at)},{q(now)}
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

# Remove only source-managed items so reruns are idempotent without deleting manual additions.
managed_prefixes = ["SC-","FSLI-","APP-","LOC-","LE-"]
execute(
    "DELETE FROM ICOFRScopeItem WHERE scopeId="+q(scope_id)+
    " AND ("+" OR ".join("code LIKE "+q(p+"%") for p in managed_prefixes)+");",
    "/tmp/icofr_scope_cleanup.sql"
)

bp = rows("SELECT id,processId,name,level FROM BusinessProcess WHERE institutionId="+q(iid)+" ORDER BY level,processId")
def best_process(aliases):
    scored=[]
    for row in bp:
        n=norm(row.get("name"))
        pid=norm(row.get("processId"))
        score=0
        for alias in aliases:
            a=norm(alias)
            if n == a or pid == a: score=max(score,100)
            elif a and (a in n or n in a): score=max(score,80)
            else:
                at=set(a.split()); nt=set(n.split())
                overlap=len(at & nt)
                if overlap: score=max(score,overlap*10)
        if score:
            scored.append((score,int(row.get("level") or 0),row))
    if not scored: return None
    scored.sort(key=lambda x:(x[0],x[1]), reverse=True)
    return scored[0][2]

items=[]
# Single legal entity / 100% location coverage
items.append({
    "itemType":"Legal Entity","sourceId":str(entity[0]["id"]),"code":"LE-BANK-KALBAR",
    "name":str(entity[0]["name"]),"inScope":1,"amount":None,
    "rationale":"Bank Kalbar is a single entity; the memo states location coverage is 100% and the two-thirds coverage test is met."
})
items.append({
    "itemType":"Other","sourceId":None,"code":"LOC-100-PCT",
    "name":"Lokasi - 100% Bank Kalbar (single entity)","inScope":1,"amount":None,
    "rationale":"No consolidated subsidiary population; location coverage is 100% according to the 2026 scoping memorandum."
})

matched_processes=[]
unmatched_processes=[]
for p in PROCESS_SCOPE:
    m=best_process(p["aliases"])
    source_id=str(m["id"]) if m else None
    code=str(m.get("processId") or p["code"]) if m else p["code"]
    name=str(m.get("name") or p["name"]) if m else p["name"]
    rationale=f"{p['priority']} priority. {p['rationale']} Source label: {p['name']}."
    items.append({
        "itemType":"Business Process","sourceId":source_id,"code":code,"name":name,
        "inScope":1,"amount":None,"rationale":rationale
    })
    (matched_processes if m else unmatched_processes).append({
        "sourceName":p["name"],"matchedProcessId":m.get("processId") if m else None,
        "matchedName":m.get("name") if m else None
    })

for o in OTHER_SCOPE:
    items.append({
        "itemType":"Other","sourceId":None,"code":o["code"],"name":o["name"],
        "inScope":o["inScope"],"amount":None,"rationale":o["rationale"]
    })

for f in FINANCIAL_ITEMS:
    items.append({
        "itemType":"Financial Account","sourceId":None,"code":f["code"],"name":f["name"],
        "inScope":1,"amount":f["amount"],"rationale":f["rationale"]
    })

for app in APPLICATION_ITEMS:
    items.append({
        "itemType":"IT System","sourceId":None,"code":app["code"],"name":app["name"],
        "inScope":app["inScope"],"amount":None,"rationale":app["rationale"]
    })

item_sql=[]
for ix,item in enumerate(items,1):
    item_id=hid(scope_id,item["itemType"],item["code"])
    item_sql.append(f"""
INSERT INTO ICOFRScopeItem(id,scopeId,itemType,sourceId,code,name,inScope,amount,rationale,createdAt,updatedAt)
VALUES({q(item_id)},{q(scope_id)},{q(item['itemType'])},{q(item['sourceId'])},{q(item['code'])},{q(item['name'])},
{int(item['inScope'])},{'NULL' if item['amount'] is None else item['amount']},{q(item['rationale'])},{q(now)},{q(now)})
ON CONFLICT(id) DO UPDATE SET
sourceId=excluded.sourceId,code=excluded.code,name=excluded.name,inScope=excluded.inScope,
amount=excluded.amount,rationale=excluded.rationale,updatedAt=excluded.updatedAt;
""")
execute("\n".join(item_sql), "/tmp/icofr_scope_items.sql")

params = [
    ("BENCHMARK_PBT_2025","Laba Sebelum Pajak TB 2025",BENCHMARK_AMOUNT,None,None,"PBT TB 2025","SOURCE_LITERAL",SOURCE_MEMO,
     "The uploaded memo states PBT TB 2025 Rp673.381bn."),
    ("OM_PERCENT","Overall Materiality percentage",None,OM_PERCENT,"PBT × 5%","Profit Before Tax","SOURCE_LITERAL",SOURCE_MEMO,
     "Percentage stated in the uploaded memo."),
    ("OM_AMOUNT","Overall Materiality",OM_AMOUNT,None,None,"Document-literal OM","UNDER_REVIEW_RECONCILIATION",SOURCE_MEMO,
     "Document states Rp31.9049bn although 5% of the stated PBT amount is not equal to this value; preserved without silent correction."),
    ("PM_FACTOR","Performance Materiality factor",None,PM_PERCENT,"OM × 50%","Overall Materiality","PROVISIONAL",SOURCE_METHOD,
     "PM remains provisional/under review pending management letter and 2025 audit adjustment confirmation."),
    ("PM_AMOUNT","Performance Materiality",PM_AMOUNT,None,"OM × 50%","Overall Materiality","PROVISIONAL",SOURCE_METHOD,
     "Document-literal PM for 2026."),
    ("TOLERANCE_HAIRCUT","Tolerable-threshold haircut",None,TOLERANCE_HAIRCUT_PERCENT,"PM × (100% - 17.5%)","Performance Materiality","SOURCE_LITERAL",SOURCE_MEMO,
     "Separate from the 50% PM factor/haircut terminology used in the memo."),
    ("TOLERABLE_THRESHOLD","Tolerable threshold",TOLERABLE_THRESHOLD,None,"PM × 82.5%","Performance Materiality","SOURCE_LITERAL",SOURCE_MEMO,
     "Document-literal threshold."),
    ("CLEARLY_TRIVIAL_PERCENT","Clearly trivial percentage",None,CLEARLY_TRIVIAL_PERCENT_OF_PM,"PM × 5%","Performance Materiality","SOURCE_LITERAL",SOURCE_MEMO,
     "Percent basis is PM, not OM."),
    ("CLEARLY_TRIVIAL_AMOUNT","Clearly trivial amount",CLEARLY_TRIVIAL_AMOUNT,None,"PM × 5%","Performance Materiality","SOURCE_LITERAL",SOURCE_MEMO,
     "Document-literal threshold."),
    ("LOCATION_COVERAGE","Location coverage",None,100.0,None,"Single entity","FINAL",SOURCE_MEMO,
     "Bank Kalbar is a single entity; location coverage is stated as 100%."),
    ("PROCESS_TARGET_COUNT","Business-process target count",16,None,None,"2026 scoping workbook referenced by memo","DETAIL_PARTIAL_IN_PDF",SOURCE_MEMO,
     "The memo states 16 business processes, but the two attached PDFs do not enumerate all 16 process names. Only named/source-explicit processes are promoted; missing detail is not invented."),
]
param_sql=[]
for order,p in enumerate(params,1):
    code,label,num,pct,formula,basis,status,source,note=p
    pid=hid(scope_id,"PARAM",code)
    param_sql.append(f"""
INSERT INTO ICOFRScopeParameter(id,scopeId,parameterCode,label,numericValue,percentValue,formula,basis,status,sourceReference,sourceNote,sortOrder,updatedAt)
VALUES({q(pid)},{q(scope_id)},{q(code)},{q(label)},{'NULL' if num is None else num},{'NULL' if pct is None else pct},
{q(formula)},{q(basis)},{q(status)},{q(source)},{q(note)},{order},{q(now)})
ON CONFLICT(scopeId,parameterCode) DO UPDATE SET
label=excluded.label,numericValue=excluded.numericValue,percentValue=excluded.percentValue,
formula=excluded.formula,basis=excluded.basis,status=excluded.status,sourceReference=excluded.sourceReference,
sourceNote=excluded.sourceNote,sortOrder=excluded.sortOrder,updatedAt=excluded.updatedAt;
""")
execute("\n".join(param_sql), "/tmp/icofr_scope_params.sql")

pops = [
    ("FSLI",52,38,36,2,14,"SOURCE_SUMMARY_COMPLETE_DETAIL_PARTIAL",SOURCE_MEMO,
     "52 accounts/positions assessed: 36 quantitatively significant, 2 significant solely by qualitative factors, 14 not significant. The attached PDFs do not enumerate all 52 rows."),
    ("BUSINESS_PROCESS",16,16,None,None,0,"SOURCE_TARGET_DETAIL_PARTIAL",SOURCE_MEMO,
     "The memo states 16 business processes for 2026 plus Entity Level Control. Not all 16 process names are enumerated in the attached PDFs."),
    ("APPLICATION",62,31,None,None,31,"REVALIDATION_REQUIRED",SOURCE_MEMO,
     "2025 review population: 62 applications, 31 concluded significant. Memo identifies conclusion/rationale contradictions and regulator-reporting apps that require reassessment before final approval."),
    ("LOCATION",1,1,1,0,0,"FINAL",SOURCE_MEMO,
     "Single entity, 100% location coverage."),
]
pop_sql=[]
for ptype,assessed,sig,quant,qual,not_sig,status,source,note in pops:
    pid=hid(scope_id,"POP",ptype)
    pop_sql.append(f"""
INSERT INTO ICOFRScopingPopulationSummary(
id,scopeId,populationType,assessedCount,significantCount,quantitativeSignificantCount,
qualitativeOnlyCount,notSignificantCount,sourceStatus,sourceReference,sourceNote,updatedAt
) VALUES(
{q(pid)},{q(scope_id)},{q(ptype)},{'NULL' if assessed is None else assessed},{'NULL' if sig is None else sig},
{'NULL' if quant is None else quant},{'NULL' if qual is None else qual},{'NULL' if not_sig is None else not_sig},
{q(status)},{q(source)},{q(note)},{q(now)}
)
ON CONFLICT(scopeId,populationType) DO UPDATE SET
assessedCount=excluded.assessedCount,significantCount=excluded.significantCount,
quantitativeSignificantCount=excluded.quantitativeSignificantCount,qualitativeOnlyCount=excluded.qualitativeOnlyCount,
notSignificantCount=excluded.notSignificantCount,sourceStatus=excluded.sourceStatus,
sourceReference=excluded.sourceReference,sourceNote=excluded.sourceNote,updatedAt=excluded.updatedAt;
""")
execute("\n".join(pop_sql), "/tmp/icofr_scope_population.sql")

# Promote only named FSLIs explicitly supported by the memoranda into the financial-item register.
fin_sql=[]
for f in FINANCIAL_ITEMS:
    fid=hid(iid,"ICOFR-FSLI",f["code"])
    rationale=f["rationale"]+" This is a source-explicit row only; it does not represent the entire 38-item significant population."
    fin_sql.append(f"""
INSERT INTO ICOFRFinancialItem(
id,institutionId,recordType,itemCode,name,financialStatement,balanceAmount,currency,significant,
scopingRationale,assertions,riskFactors,processReference,owner,status,createdAt,updatedAt
) VALUES(
{q(fid)},{q(iid)},'Account',{q(f['code'])},{q(f['name'])},NULL,{f['amount']},'IDR',1,
{q(rationale)},NULL,{q("Source-explicit significant/high-risk item for 2026 scoping; assertions require detailed source/workpaper validation.")},
{q(f['process'])},NULL,'Under Review',{q(now)},{q(now)}
)
ON CONFLICT(institutionId,recordType,itemCode) DO UPDATE SET
name=excluded.name,balanceAmount=excluded.balanceAmount,currency='IDR',significant=1,
scopingRationale=excluded.scopingRationale,riskFactors=excluded.riskFactors,
processReference=excluded.processReference,status='Under Review',updatedAt=excluded.updatedAt;
""")
execute("\n".join(fin_sql), "/tmp/icofr_financial_items.sql")

summary = {
    "scopeId":scope_id,
    "fiscalYear":2026,
    "benchmarkLiteral":BENCHMARK_AMOUNT,
    "omPercent":OM_PERCENT,
    "omAmount":OM_AMOUNT,
    "pmPercent":PM_PERCENT,
    "pmAmount":PM_AMOUNT,
    "pmStatus":"Provisional / Under Review",
    "tolerableThreshold":TOLERABLE_THRESHOLD,
    "clearlyTrivial":CLEARLY_TRIVIAL_AMOUNT,
    "flsiPopulation":{"assessed":52,"significant":38,"quantitative":36,"qualitativeOnly":2,"notSignificant":14},
    "applicationPopulation":{"assessed":62,"sourceSignificant":31,"status":"Revalidation Required"},
    "processTargetCount":16,
    "sourceExplicitProcessItems":len(PROCESS_SCOPE),
    "matchedProcessItems":len(matched_processes),
    "unmatchedProcessItems":len(unmatched_processes),
    "sourceArithmeticMismatchPreserved":True,
    "manualOrUnenumeratedRowsFabricated":False
}
feed_id=hid(iid,BATCH)
execute(f"""
INSERT INTO OperationalDataFeedRun(
id,institutionId,batchCode,module,sourceRole,sourceReferencesJson,recordsUpserted,status,summaryJson,completedAt
) VALUES(
{q(feed_id)},{q(iid)},{q(BATCH)},'ICOFR Scoping','PRIMARY_USER_UPLOAD',
{q(json.dumps([SOURCE_MEMO,SOURCE_METHOD,SOURCE_SCOPE_WORKPAPER,SOURCE_METHOD_WORKPAPER],ensure_ascii=False,separators=(",",":")))},
{1+len(items)+len(params)+len(pops)+len(FINANCIAL_ITEMS)},'Completed',
{q(json.dumps(summary,ensure_ascii=False,separators=(",",":")))},{q(now)}
)
ON CONFLICT(institutionId,batchCode) DO UPDATE SET
sourceReferencesJson=excluded.sourceReferencesJson,recordsUpserted=excluded.recordsUpserted,
status='Completed',summaryJson=excluded.summaryJson,completedAt=excluded.completedAt;
""", "/tmp/icofr_feed.sql")

audit_id=hid(iid,BATCH,"AUDIT")
execute(f"""
INSERT OR REPLACE INTO AuditLog(
id,institutionId,userName,userRole,action,entityType,recordId,oldValue,newValue,reason,ipAddress,timestamp
) VALUES(
{q(audit_id)},{q(iid)},'System','System','UPSERT','ICOFRScope',{q(scope_id)},NULL,
{q(json.dumps(summary,ensure_ascii=False,separators=(",",":")))},
'Promote Bank Kalbar FY2026 OM/PM and source-governed ICOFR scoping from user-attached memoranda without inventing unenumerated source rows.',
NULL,{q(now)}
);
""", "/tmp/icofr_audit.sql")

verify_scope=rows("SELECT * FROM ICOFRScope WHERE id="+q(scope_id)+" LIMIT 1")
verify_params=rows("SELECT COUNT(*) AS n FROM ICOFRScopeParameter WHERE scopeId="+q(scope_id))
verify_pops=rows("SELECT COUNT(*) AS n FROM ICOFRScopingPopulationSummary WHERE scopeId="+q(scope_id))
verify_items=rows("SELECT itemType,COUNT(*) AS n,SUM(CASE WHEN inScope=1 THEN 1 ELSE 0 END) AS inScope FROM ICOFRScopeItem WHERE scopeId="+q(scope_id)+" GROUP BY itemType ORDER BY itemType")
verify_fin=rows("SELECT COUNT(*) AS n FROM ICOFRFinancialItem WHERE institutionId="+q(iid)+" AND itemCode LIKE 'FSLI-%' AND significant=1")
if len(verify_scope)!=1:
    raise RuntimeError("SCOPE_VERIFY_FAILED")
s=verify_scope[0]
if int(s["fiscalYear"])!=2026 or float(s["overallMaterialityAmount"])!=OM_AMOUNT or float(s["performanceMaterialityAmount"])!=PM_AMOUNT:
    raise RuntimeError("MATERIALITY_VERIFY_FAILED")
if int(verify_params[0]["n"])!=len(params):
    raise RuntimeError("PARAMETER_VERIFY_FAILED")
if int(verify_pops[0]["n"])!=len(pops):
    raise RuntimeError("POPULATION_VERIFY_FAILED")
if int(verify_fin[0]["n"])<len(FINANCIAL_ITEMS):
    raise RuntimeError("FINANCIAL_ITEM_VERIFY_FAILED")

print("=== BANK KALBAR ICOFR 2026 SCOPING PROMOTION ===")
print(json.dumps({
    "institutionId":iid,
    "summary":summary,
    "scope":{"id":s["id"],"status":s["status"],"benchmarkAmount":s["benchmarkAmount"],
             "omPercent":s["overallMaterialityPercent"],"omAmount":s["overallMaterialityAmount"],
             "pmPercent":s["performanceMaterialityPercent"],"pmAmount":s["performanceMaterialityAmount"],
             "clearlyTrivialAmount":s["clearlyTrivialAmount"]},
    "scopeItems":verify_items,
    "matchedProcesses":matched_processes,
    "unmatchedProcesses":unmatched_processes
},indent=2,ensure_ascii=False))
