# Analisis PDF hasil scan

Upload PDF di dokumen pendukung proses atau penetapan akun signifikan ICOFR. Halaman dengan kurang dari 80 karakter teks terbaca menjalankan OCR otomatis. Untuk PDF campuran atau lapisan teks yang rusak, centang **PDF hasil scan / campuran: gunakan OCR pada seluruh halaman** sebelum analisis.

OCR Bahasa Indonesia dan Inggris berjalan per halaman di browser. Mesin, worker, font PDF dan data bahasa disajikan dari domain TotalARC, tanpa CDN atau API key OCR tambahan. PDF asli tetap dikirim ke Evidence Repository dan hasil OCR menjadi sumber analisis yang membutuhkan validasi pengguna. Urutan provider analisis AI mengikuti konfigurasi yang ada.

Indikator menampilkan halaman dan kemajuan OCR. Teks hasil OCR diberi nomor halaman; halaman kosong/tidak terbaca dan keyakinan OCR rendah ditandai. Periksa kembali angka, tabel, nama, dan scan buram sebelum validasi. Batas praproses: 300 halaman. Teks hasil OCR dipertahankan berdasarkan nomor halaman dan, untuk dokumen panjang, dibagi menjadi beberapa page-range chunk yang dianalisis satu per satu lalu digabungkan secara deterministik. Preview yang disimpan dapat dipersingkat, tetapi bagian tengah dokumen tidak dibuang dari analisis AI. Upload tetap mengikuti batas ukuran modul. PDF di atas 300 halaman atau teks yang sangat padat di atas kapasitas analisis lengkap harus dipisahkan agar tidak ada isi yang diabaikan.

`next.config.mjs` menjalankan `scripts/prepare-ocr-assets.cjs` pada build/dev untuk menyalin aset dari dependency yang dikunci versinya ke `public/ocr`. Direktori hasil build ini tidak disimpan ke Git. CSP mengizinkan WebAssembly; endpoint API tetap memakai autentikasi dan pembatasan institusi. Teks browser diperlakukan sebagai masukan pengguna, bukan ekstraksi server yang terpercaya.

Validasi otomatis: `node scripts/verify-pdf-ocr.cjs`, pemeriksaan TypeScript, verifikasi upload proses/ICOFR, dan build Next.js. Uji produksi perlu mencakup PDF scan, PDF digital, PDF campuran, file berkunci dan hasil OCR yang buram.
