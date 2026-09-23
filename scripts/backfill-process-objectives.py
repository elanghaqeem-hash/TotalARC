#!/usr/bin/env python3
import hashlib
import json
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

BATCH = "PROCESS_OBJECTIVE_BACKFILL_V1"

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
db = next((x for x in dbs if re.search(r"total.?arc", str(x.get("name", "")), re.I)), None)
if not db:
    db = dbs[0] if len(dbs) == 1 else None
if not db:
    raise RuntimeError("TOTAL_ARC_D1_NOT_FOUND")
DB = db["name"]

def rows(sql):
    raw = json.loads(wr(["d1", "execute", DB, "--remote", "--json", "--command", sql]))
    raw = raw if isinstance(raw, list) else [raw]
    return [r for block in raw for r in (block.get("results") or [])]

def execute(sql, path="/tmp/process_objective_backfill.sql"):
    Path(path).write_text(sql, encoding="utf-8")
    wr(["d1", "execute", DB, "--remote", "--file", path])

def q(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"

def hid(*parts):
    return hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()[:40]

def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()

def norm(value):
    return clean(value).lower()

def has(text, *needles):
    return any(needle in text for needle in needles)

def objective_for(process):
    code = clean(process.get("processId")).upper()
    name = clean(process.get("name"))
    description = clean(process.get("description"))
    category = clean(process.get("categoryName"))
    text = norm(" ".join([code, name, description, category]))

    if has(text, "ckpn", "expected credit loss", "ecl", "penurunan nilai"):
        return (
            "Memastikan CKPN/ECL ditetapkan, dihitung, direviu, dan dibukukan secara lengkap, akurat, "
            "konsisten, dan tepat waktu berdasarkan data, staging, parameter/model, serta asumsi yang "
            "telah divalidasi; perubahan material dan jurnal memperoleh otorisasi yang memadai; serta "
            "penyajian dan pengungkapan mendukung kepatuhan PSAK 71 dan kebijakan Bank."
        )

    if has(text, "penambahan modal disetor", "modal disetor") or code.startswith("EQT"):
        return (
            "Memastikan setiap transaksi ekuitas, termasuk penambahan modal disetor, telah memperoleh "
            "persetujuan yang sah, didukung dokumen yang memadai, diterima dan direkonsiliasi secara "
            "lengkap, dicatat secara akurat dan tepat waktu pada ekuitas, serta disajikan dengan benar "
            "dalam laporan keuangan dan pelaporan regulator."
        )

    if code.startswith("DPK") or has(text, "dana pihak ketiga", "tabungan", "deposito", "giro", "simpanan"):
        return (
            "Memastikan pembukaan, pemeliharaan, transaksi, perhitungan bunga atau bagi hasil, dan "
            "penutupan produk Dana Pihak Ketiga diproses secara lengkap, akurat, terotorisasi, dan tepat "
            "waktu; dana serta data nasabah terlindungi; dan saldo, biaya, pendapatan/beban, serta "
            "pelaporannya tercatat sesuai ketentuan dan kebijakan Bank."
        )

    if code.startswith("KRD") or has(text, "kredit", "pembiayaan", "loan", "pinjaman"):
        return (
            "Memastikan proses kredit/pembiayaan sejak pengajuan, analisis, persetujuan, pengikatan, "
            "pencairan, pemantauan, pembayaran, sampai penyelesaian dilakukan sesuai kewenangan dan "
            "kebijakan; data dan agunan memadai; transaksi dicatat lengkap dan akurat; serta kualitas "
            "aset, pendapatan, dan eksposur risiko dipantau secara tepat waktu."
        )

    if code.startswith("TRY-SP-REVREPO") or has(text, "reverse repo", "reverse-repo"):
        return (
            "Memastikan transaksi reverse repo dilaksanakan sesuai kewenangan dan limit, dikonfirmasi "
            "dan diselesaikan secara tepat waktu, instrumen serta collateral dipantau dan dinilai secara "
            "memadai, transaksi direkonsiliasi, dan pengakuan, pengukuran, pendapatan, serta pencatatan "
            "akuntansinya lengkap dan akurat."
        )

    if code.startswith("TRY") or has(text, "treasury", "likuiditas", "valuta asing", "valas", "pasar uang", "surat berharga"):
        return (
            "Memastikan aktivitas treasury, pendanaan, likuiditas, pasar uang, valuta asing, dan/atau "
            "surat berharga dilakukan dalam limit dan kewenangan yang disetujui, memperoleh konfirmasi "
            "serta settlement yang tepat waktu, dinilai dan direkonsiliasi secara akurat, dan dicatat "
            "serta dilaporkan secara lengkap sesuai kebijakan Bank."
        )

    if code.startswith("UUS") or has(text, "syariah", "unit usaha syariah", "bagi hasil"):
        return (
            "Memastikan transaksi dan operasional Unit Usaha Syariah dilaksanakan sesuai akad, prinsip "
            "syariah, kewenangan, dan kebijakan Bank; perhitungan bagi hasil/margin serta transaksi "
            "terkait dilakukan lengkap dan akurat; dan pencatatan serta pelaporan dilakukan tepat waktu "
            "dengan bukti dan rekonsiliasi yang memadai."
        )

    if code.startswith("OBB") or code.startswith("OPB") or has(text, "pengakuan pendapatan", "beban bunga", "pendapatan bunga", "pendapatan dan beban"):
        return (
            "Memastikan pendapatan dan beban, termasuk bunga atau bagi hasil yang relevan, dihitung, "
            "diakui, diakru, direkonsiliasi, dan dibukukan pada periode yang tepat secara lengkap dan "
            "akurat, berdasarkan parameter yang sah serta memperoleh review dan otorisasi yang memadai."
        )

    if code.startswith("PGD") or has(text, "pengadaan", "procurement", "vendor", "pemasok"):
        if has(text, "aset tetap", "fixed asset"):
            return (
                "Memastikan pengadaan barang/jasa dan pengelolaan aset tetap dilakukan berdasarkan "
                "kebutuhan dan kewenangan yang disetujui, proses vendor transparan dan terdokumentasi, "
                "penerimaan serta pembayaran tervalidasi, dan aset dikapitalisasi, diamankan, "
                "disusutkan, direkonsiliasi, serta dilepas secara lengkap dan akurat."
            )
        return (
            "Memastikan pengadaan barang dan jasa dilakukan berdasarkan kebutuhan dan anggaran yang "
            "disetujui, pemilihan vendor transparan dan terdokumentasi, kontrak serta penerimaan "
            "divalidasi, pembayaran hanya dilakukan atas transaksi yang sah, dan seluruh transaksi "
            "dicatat lengkap, akurat, dan tepat waktu."
        )

    if has(text, "aset tetap", "fixed asset", "inventaris"):
        return (
            "Memastikan aset tetap diperoleh dengan persetujuan yang sah, dicatat dan diklasifikasikan "
            "secara lengkap dan akurat, diamankan secara fisik, disusutkan dan diuji penurunan nilainya "
            "secara tepat, direkonsiliasi berkala, serta setiap mutasi dan pelepasan memperoleh "
            "otorisasi dan pencatatan yang memadai."
        )

    if code.startswith("PLP") or has(text, "pelaporan keuangan", "financial reporting", "tutup buku", "closing", "general ledger", "rekonsiliasi"):
        return (
            "Memastikan proses penutupan buku, rekonsiliasi, konsolidasi, dan penyusunan laporan "
            "keuangan menghasilkan informasi yang lengkap, akurat, tepat waktu, konsisten antar-sumber, "
            "didukung jurnal dan bukti yang sah, serta melalui review dan approval sesuai standar "
            "akuntansi dan kebijakan Bank."
        )

    if has(text, "jurnal", "journal", "posting"):
        return (
            "Memastikan setiap jurnal disusun berdasarkan transaksi dan bukti yang sah, menggunakan "
            "akun dan periode yang tepat, dihitung serta dibukukan secara lengkap dan akurat, memperoleh "
            "review/otorisasi sesuai kewenangan, dan dapat direkonsiliasi ke sumber transaksi serta "
            "laporan keuangan."
        )

    if code.startswith("TAX") or has(text, "pajak", "tax"):
        return (
            "Memastikan kewajiban perpajakan dihitung berdasarkan data yang lengkap dan akurat, "
            "direkonsiliasi dengan pembukuan, direviu dan disetujui sesuai kewenangan, serta dibayar dan "
            "dilaporkan tepat waktu sesuai ketentuan perpajakan yang berlaku."
        )

    if code.startswith("PAY") or has(text, "penggajian", "payroll", "gaji"):
        return (
            "Memastikan penggajian dan manfaat pegawai dihitung dari data pegawai yang valid, perubahan "
            "memperoleh otorisasi, pembayaran dilakukan kepada penerima yang berhak secara tepat waktu, "
            "potongan dan kewajiban terkait dihitung benar, serta seluruh transaksi direkonsiliasi dan "
            "dibukukan secara lengkap dan akurat."
        )

    if has(text, "sumber daya manusia", "human resources", "kepegawaian", "rekrut", "talent"):
        return (
            "Memastikan proses pengelolaan sumber daya manusia dilaksanakan berdasarkan data pegawai "
            "yang valid, kewenangan dan kebijakan yang berlaku, setiap perubahan terdokumentasi dan "
            "terotorisasi, hak serta kewajiban pegawai diproses tepat waktu, dan data personal dijaga "
            "kerahasiaan serta integritasnya."
        )

    if code.startswith("ITGC") or has(text, "teknologi informasi", "information technology", "itgc", "cyber", "akses logis", "change management", "backup"):
        return (
            "Memastikan pengendalian umum TI atas akses logis, perubahan aplikasi/infrastruktur, operasi "
            "TI, backup dan recovery, serta keamanan sistem dirancang dan dijalankan secara konsisten "
            "untuk menjaga kerahasiaan, integritas, ketersediaan, dan keandalan sistem serta data yang "
            "mendukung proses bisnis dan pelaporan keuangan."
        )

    if code.startswith("KPT") or has(text, "kepatuhan", "compliance", "aml", "apu ppt", "kyc", "legal", "hukum"):
        return (
            "Memastikan kewajiban kepatuhan, KYC/CDD/EDD, APU-PPT, pemantauan transaksi, pelaporan, dan "
            "persyaratan hukum yang relevan diidentifikasi serta dipenuhi secara lengkap dan tepat waktu, "
            "exception ditindaklanjuti, dan bukti pemenuhan terdokumentasi serta dapat ditelusuri."
        )

    if code.startswith("MRO") or has(text, "risiko operasional", "operational risk", "rcsa", "kri", "loss event", "led"):
        return (
            "Memastikan risiko operasional diidentifikasi, dinilai, dimonitor, dan dimitigasi secara "
            "konsisten melalui RCSA, KRI, pencatatan loss event, action plan, dan eskalasi yang tepat "
            "waktu sehingga eksposur berada dalam risk appetite dan informasi risiko dapat diandalkan."
        )

    if code.startswith("MRA") or has(text, "manajemen risiko", "risk management"):
        return (
            "Memastikan risiko material diidentifikasi, diukur, dipantau, dikendalikan, dan dilaporkan "
            "secara konsisten menggunakan metodologi dan data yang dapat diandalkan, dengan limit, "
            "eskalasi, mitigasi, dan tindak lanjut yang selaras dengan risk appetite serta kebijakan Bank."
        )

    if code.startswith("KKB") or has(text, "komitmen", "kontinjensi", "bank garansi", "guarantee"):
        return (
            "Memastikan transaksi komitmen, kontinjensi, dan bank garansi diterbitkan sesuai kewenangan "
            "dan limit, didukung dokumen serta agunan yang memadai, fee dan kewajiban dihitung benar, "
            "jatuh tempo dimonitor, dan seluruh eksposur serta pencatatan off/on-balance sheet lengkap, "
            "akurat, dan tepat waktu."
        )

    if has(text, "transfer", "pembayaran", "payment", "kliring", "clearing", "settlement"):
        return (
            "Memastikan transaksi pembayaran, transfer, kliring, dan settlement hanya diproses atas "
            "instruksi yang sah dan terotorisasi, divalidasi secara lengkap dan akurat, diselesaikan "
            "tepat waktu, direkonsiliasi dengan sistem serta rekening terkait, dan exception ditangani "
            "serta didokumentasikan secara memadai."
        )

    if has(text, "pembukaan rekening", "nasabah", "customer onboarding", "rekening"):
        return (
            "Memastikan pembukaan dan pemeliharaan hubungan/rekening nasabah didasarkan pada identitas "
            "dan dokumen yang valid, persyaratan KYC serta kewenangan terpenuhi, data nasabah dicatat "
            "lengkap dan akurat, perubahan terdokumentasi, dan akses serta data nasabah terlindungi."
        )

    if has(text, "teller", "kas", "cash", "cabang", "branch operation"):
        return (
            "Memastikan aktivitas kas dan operasional cabang dilaksanakan sesuai kewenangan, transaksi "
            "didukung bukti yang sah dan dicatat lengkap serta akurat, posisi kas dijaga dalam limit, "
            "rekonsiliasi dilakukan tepat waktu, dan selisih atau exception segera diinvestigasi serta "
            "ditindaklanjuti."
        )

    if has(text, "audit", "satuan kerja audit intern", "internal audit"):
        return (
            "Memastikan kegiatan audit direncanakan berbasis risiko, dilaksanakan secara independen dan "
            "terdokumentasi dengan bukti yang memadai, temuan serta akar masalah dikomunikasikan secara "
            "tepat, dan tindak lanjut dipantau sampai penyelesaian untuk mendukung efektivitas governance, "
            "risk management, dan internal control."
        )

    if has(text, "fraud", "anti fraud"):
        return (
            "Memastikan risiko fraud dicegah, dideteksi, diinvestigasi, dilaporkan, dan ditindaklanjuti "
            "secara konsisten melalui pengendalian, monitoring indikator, mekanisme pelaporan, analisis "
            "akar masalah, serta remediasi yang memadai."
        )

    if has(text, "strategi", "governance", "tata kelola", "rencana bisnis"):
        return (
            "Memastikan arah strategi, tata kelola, target, kebijakan, dan keputusan manajemen ditetapkan "
            "melalui proses yang terotorisasi dan terdokumentasi, mempertimbangkan risiko serta kepatuhan, "
            "dipantau dengan informasi yang andal, dan ditindaklanjuti secara tepat waktu."
        )

    if "information technology" in norm(category) or "technology" in norm(category):
        return (
            f"Memastikan proses {name} dilaksanakan secara aman, terotorisasi, terdokumentasi, dan tepat "
            "waktu dengan menjaga integritas, ketersediaan, dan kerahasiaan sistem/data serta mendukung "
            "keandalan proses bisnis dan pelaporan."
        )

    if "finance" in norm(category):
        return (
            f"Memastikan proses {name} menghasilkan transaksi dan informasi keuangan yang lengkap, "
            "akurat, terotorisasi, tepat waktu, dapat direkonsiliasi, dan didukung bukti yang memadai "
            "sesuai kebijakan, standar akuntansi, dan ketentuan yang berlaku."
        )

    return (
        f"Memastikan proses {name} dilaksanakan secara lengkap, akurat, tepat waktu, terotorisasi, "
        "terdokumentasi, dan sesuai kebijakan serta ketentuan yang berlaku; exception ditangani secara "
        "memadai; dan hasil proses dapat ditelusuri serta mendukung tujuan bisnis dan pengendalian internal."
    )

now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
processes = rows("""
SELECT p.id, p.institutionId, p.processId, p.name, p.description, p.level,
       pc.name AS categoryName
FROM BusinessProcess p
LEFT JOIN ProcessCategory pc ON pc.id = p.categoryId
ORDER BY p.institutionId, p.level, p.processId
""")
objectives = rows("""
SELECT id, processId, objective, createdAt
FROM ProcessObjective
ORDER BY createdAt ASC
""")

by_process = {}
for item in objectives:
    by_process.setdefault(str(item.get("processId") or ""), []).append(item)

sql = []
inserted = 0
updated_blank = 0
skipped_existing = 0
for process in processes:
    pid = str(process["id"])
    existing = by_process.get(pid, [])
    nonblank = [x for x in existing if clean(x.get("objective"))]
    if nonblank:
        skipped_existing += 1
        continue

    objective = objective_for(process)
    if existing:
        target = existing[0]
        sql.append(
            "UPDATE ProcessObjective SET objective=" + q(objective) +
            " WHERE id=" + q(target["id"]) + ";"
        )
        objective_id = str(target["id"])
        updated_blank += 1
        action = "BACKFILL_BLANK_PROCESS_OBJECTIVE"
    else:
        objective_id = hid(pid, BATCH)
        sql.append(f"""
INSERT OR IGNORE INTO ProcessObjective(
  id, processId, objective, strategicGoal, expectedOutcome, kpi, kri, sla, createdAt
) VALUES(
  {q(objective_id)},{q(pid)},{q(objective)},NULL,NULL,NULL,NULL,NULL,{q(now)}
);
""")
        inserted += 1
        action = "BACKFILL_PROCESS_OBJECTIVE"

    audit_id = hid(process.get("institutionId"), objective_id, action)
    sql.append(f"""
INSERT OR IGNORE INTO AuditLog(
  id,institutionId,userName,userRole,action,entityType,recordId,
  oldValue,newValue,reason,ipAddress,timestamp
) VALUES(
  {q(audit_id)},{q(process.get("institutionId"))},'System','System',{q(action)},
  'ProcessObjective',{q(objective_id)},NULL,
  {q(json.dumps({"processId": process.get("processId"), "processName": process.get("name"), "objective": objective}, ensure_ascii=False, separators=(",", ":")))},
  'System-derived process objective based on Business Process context. Existing nonblank objectives are never overwritten.',
  NULL,{q(now)}
);
""")

if sql:
    execute("\n".join(sql))

verification = rows("""
SELECT
  COUNT(*) AS totalProcesses,
  SUM(CASE WHEN EXISTS (
    SELECT 1 FROM ProcessObjective po
    WHERE po.processId = p.id AND trim(COALESCE(po.objective,'')) <> ''
  ) THEN 1 ELSE 0 END) AS withObjective,
  SUM(CASE WHEN NOT EXISTS (
    SELECT 1 FROM ProcessObjective po
    WHERE po.processId = p.id AND trim(COALESCE(po.objective,'')) <> ''
  ) THEN 1 ELSE 0 END) AS missingObjective
FROM BusinessProcess p
""")
summary = verification[0] if verification else {}
if int(summary.get("missingObjective") or 0) != 0:
    raise RuntimeError("PROCESS_OBJECTIVE_BACKFILL_INCOMPLETE_" + json.dumps(summary))

print("=== PROCESS OBJECTIVE BACKFILL ===")
print(json.dumps({
    "database": DB,
    "totalProcesses": int(summary.get("totalProcesses") or 0),
    "withObjective": int(summary.get("withObjective") or 0),
    "missingObjective": int(summary.get("missingObjective") or 0),
    "inserted": inserted,
    "updatedBlank": updated_blank,
    "preservedExisting": skipped_existing,
    "policy": "Fill missing only; never overwrite existing nonblank ProcessObjective."
}, ensure_ascii=False, indent=2))
