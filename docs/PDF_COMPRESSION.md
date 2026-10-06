# Kompres PDF sebelum upload

Tersedia pada upload dokumen pendukung proses, laporan keuangan ICOFR, dan Evidence Repository. Pilih PDF, pilih kualitas Tinggi/Seimbang/Ukuran terkecil, lalu tekan Kompres PDF. Ukuran sebelum dan sesudah ditampilkan. Unduh hasil untuk diperiksa, lalu pilih Gunakan hasil kompresi agar file tersebut dipakai untuk upload berikutnya. File asli di perangkat tidak diubah.

Kompresi berlangsung di browser menggunakan PDF.js dan pdf-lib. Halaman tanpa teks dirender sebagai JPEG sesuai kualitas yang dipilih. Halaman dengan teks tetap berupa teks; PDF dengan form, anotasi, bookmark, struktur aksesibilitas, atau named resources hanya dioptimalkan tanpa konversi gambar agar struktur tersebut tetap tersedia. PDF bertanda tangan digital ditolak agar pengguna tetap memakai file asli.

Jika hasil tidak lebih kecil, file asli dipertahankan. Batas praproses 100 MB dan 100 halaman; batas upload modul tetap berlaku setelah kompresi. Periksa kualitas teks kecil, tabel, dan hasil OCR sebelum digunakan. Pemrosesan dapat dibatalkan; upload dinonaktifkan selama kompresi berlangsung.

Pengujian: PDF campuran scan dan teks digital di Chromium berkurang dari 4.879.900 menjadi 379.301 byte dengan dua halaman tetap utuh dan teks digital rekening 125000 tetap terbaca. Hasil scan diperiksa secara visual. Pengujian pembatalan, TypeScript, build Next.js, dan audit dependensi produksi lulus. Belum diuji dengan dokumen atau sesi produksi.
