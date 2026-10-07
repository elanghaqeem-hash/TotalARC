# Policy & Regulatory Library — TotalARC

## Tujuan

Modul ini membantu fungsi Kepatuhan serta tim Policy/SOP mengelola siklus hidup ketentuan internal Bank dan perubahan regulasi eksternal.

Menu: **KELOLA → Policy & Regulatory Library**

## Kapabilitas

### 1. Library Ketentuan Internal
Mendaftarkan Kebijakan, SOP, Pedoman, Peraturan Direksi, Surat Edaran, Keputusan, Prosedur, Instruksi Kerja, dan Standar.

Metadata minimum yang dapat dikelola:
- kode/nomor ketentuan;
- jenis dan judul;
- unit pemilik dan PIC;
- versi;
- tanggal terbit dan efektif;
- review terakhir dan review berikutnya;
- siklus review;
- status;
- ruang lingkup dan ringkasan.

File yang sudah ada pada Source Library dapat dijadikan ketentuan tanpa menggandakan file.

### 2. Regulatory Watch
Regulasi eksternal yang telah divalidasi disimpan pada register tersendiri. Nomor, judul, tanggal, regulator, status, dan URL sumber resmi tetap menjadi atribut eksplisit dan tidak diisi sebagai fakta tervalidasi hanya berdasarkan hasil AI.

### 3. Regulatory Intelligence
Sumber resmi yang telah dikonfigurasi dapat dipindai untuk menemukan kandidat regulasi/perubahan.

Alur:
1. Scan portal resmi.
2. Simpan tautan yang relevan sebagai **kandidat**.
3. Tim Kepatuhan meninjau kandidat.
4. AI dapat melakukan screening awal terhadap:
   - ketentuan internal yang mungkin terdampak; dan
   - regulasi eksternal terdahulu yang mungkin diubah, digantikan, dicabut, dirujuk, atau terkait.
5. Kandidat hanya menjadi regulasi terdaftar setelah user melakukan validasi dan registrasi.

AI tidak menetapkan kesimpulan hukum atau status kepatuhan secara otomatis.

### 4. Relationship Map
Relasi disimpan terstruktur dan tenant-scoped.

Jenis entitas:
- **INTERNAL** — ketentuan internal Bank;
- **EXTERNAL** — regulasi pemerintah/regulator.

Jenis relasi:
- IMPLEMENTS — melaksanakan/implementasi;
- REFERENCES — merujuk;
- AMENDS — mengubah;
- SUPERSEDES — menggantikan;
- REVOKES — mencabut;
- RELATED_TO — terkait dengan;
- IMPACTED_BY — terdampak oleh;
- DERIVED_FROM — bersumber/diturunkan dari.

UI memisahkan relasi **Internal ↔ Internal** dan relasi yang melibatkan **External**.

## Sumber regulator standar

Seed bawaan hanya menunjuk portal pemerintah/regulator Indonesia dan tidak menyisipkan regulasi sebagai data operasional:
- OJK;
- Bank Indonesia;
- LPS JDIH dan PPID;
- PPATK;
- JDIH Kementerian Keuangan;
- JDIH Kementerian Komunikasi dan Digital.

Scanner hanya menerima HTTPS pada domain **`*.go.id`** untuk mengurangi risiko SSRF/generic server-side fetching.

## Scheduler

Endpoint terproteksi:

`/api/policy-library/intelligence/cron`

### Vercel
`vercel.json` menjalankan cron setiap hari:
- 01:00 UTC
- 08:00 WIB

Set environment variable server-side:

`CRON_SECRET=<random-secret-minimum-24-characters>`

Vercel Cron akan mengirim:
`Authorization: Bearer <CRON_SECRET>`

### GitHub Actions / deployment Cloudflare
Workflow fallback:
`.github/workflows/regulatory-monitor.yml`

Jadwal:
- 01:10 UTC
- 08:10 WIB

Repository secrets:
- `TOTALARC_REGULATORY_MONITOR_URL` — base URL produksi, tanpa path endpoint;
- `REGULATORY_MONITOR_CRON_SECRET` — random secret minimum 24 karakter.

Endpoint menerima header:
`x-totalarc-cron-secret: <secret>`

Jika secrets belum tersedia, workflow dijalankan tetapi scan otomatis dilewati secara aman.

## RBAC

Hak kelola:
- SystemAdmin
- Admin
- ComplianceOfficer

Hak baca:
- RiskManager
- InternalAuditor
- Executive
- ReadOnlyAuditor

Seluruh query menggunakan `institutionId` agar data antar institusi tidak bercampur.

## CI Gate

Jalankan:

`npm run verify:policy-intelligence`

Gate memeriksa antara lain:
- tidak ada `SELECT *` pada data layer Regulatory Intelligence;
- indeks D1 yang dibutuhkan tersedia;
- tenant scoping tersedia;
- scanner dibatasi ke `*.go.id`;
- AI endpoint menggunakan rate limiter;
- feature routing AI terdaftar di System Admin;
- relationship types dan UI terpasang;
- scheduler dan secret-auth contract tersedia.

