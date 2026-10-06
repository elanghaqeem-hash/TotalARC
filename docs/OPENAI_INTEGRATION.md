# OpenAI untuk Total ARC

OpenAI tersedia sebagai provider pada Admin → Pengaturan AI (`/admin/ai-settings`).
Integrasi menggunakan Responses API dari backend dan gateway AI yang sudah dipakai fitur analisis Total ARC.

## Aktivasi melalui Admin

1. Pilih institusi yang benar, lalu buka Pengaturan AI dengan akun Admin yang berwenang.
2. Pada kartu OpenAI (ChatGPT), masukkan API key OpenAI dan model yang tersedia pada akun API.
3. Aktifkan provider, pilih fitur analisis, lalu atur prioritas (angka lebih kecil didahulukan).
4. Untuk data confidential/restricted, izinkan data sensitif hanya jika kebijakan institusi membolehkan pengiriman ke provider eksternal. Redaksi gateway tetap berlaku.
5. Simpan dan tekan Uji Koneksi. Jalankan analisis dari fitur terpilih setelah hasil uji PASS.

API key Admin disimpan oleh vault terenkripsi yang sudah ada dan terikat institusi. Vault membutuhkan `AI_CONFIG_MASTER_KEY` atau `AUTH_TOKEN_SECRET` pada server.

## Konfigurasi server alternatif

- `OPENAI_API_KEY`: secret server, jangan gunakan variabel `NEXT_PUBLIC_`.
- `OPENAI_MODEL`: ID model yang tersedia pada akun; default kompatibilitas `gpt-4.1`.
- Deployment Cloudflare meneruskan GitHub Actions secret `OPENAI_API_KEY` ke Worker. Untuk Hostinger, pasang environment variable pada proses Node lalu restart aplikasi.
- Routing default menempatkan OpenAI sebagai pilihan pertama untuk chat dan analisis kompleks jika key tersedia. Klasifikasi/ringkasan mempertahankan urutan provider lokal/cepat.
- Routing data confidential/restricted tetap privat secara default. Environment key saja tidak mengizinkan pengiriman data sensitif ke OpenAI.

Langganan ChatGPT bukan kredensial API. Aktivasi memerlukan akun API dengan model dan penagihan yang tersedia.
Permintaan memakai `store: false`; ini bukan jaminan zero data retention. Kebijakan retensi akun/provider perlu diperiksa oleh institusi.
Integrasi provider tidak menambahkan proses validasi baru: hasil tetap mengikuti alur review/validasi tiap modul yang sudah ada.

## Pemeriksaan

`node scripts/verify-openai-adapter.cjs` memeriksa format JSON, parsing output setelah reasoning, dan penolakan hasil kosong/tidak lengkap/error tanpa panggilan API berbayar.
Uji langsung membutuhkan API key pada lingkungan yang menjalankan Total ARC.

Dokumentasi API: https://developers.openai.com/api/reference/typescript/resources/responses/methods/create
