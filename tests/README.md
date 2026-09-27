# Pemeriksaan kualitas yang dapat diulang

Jalankan dari root proyek memakai Node.js 22 atau lebih baru:

```sh
npm ci
npm run check
```

`check` menjalankan lint → tes browser → build. Tahap berikutnya tidak dijalankan jika tahap sebelumnya gagal.

Pada Windows, tes memakai Microsoft Edge yang sudah terpasang. Pada Linux/macOS, instal browser pengujian satu kali:

```sh
npx playwright install --with-deps chromium
```

Untuk executable browser khusus, isi environment variable `QA_BROWSER_PATH` dengan path absolut. CI GitHub Actions menggunakan Node 22 dan Chromium pada Linux; workflow baru dapat diverifikasi di GitHub setelah commit/push disetujui. Workflow tidak otomatis menjadi syarat merge dan tidak menahan auto-deploy Vercel yang sudah ada; branch protection/deployment gate belum diatur oleh tugas ini.

Perintah terpisah:

- `npm run lint`: kesalahan seperti variabel tidak terdefinisi, assignment tidak sah, dan aturan pemanggilan hooks. Impor tidak terpakai serta exhaustive-deps belum menjadi gerbang pada adopsi awal ini. Beberapa aturan gaya yang tidak menunjukkan kesalahan runtime sengaja tidak diaktifkan.
- `npm test`: tes browser dengan data fiktif, tanpa kredensial.
- `npm run build`: build production sesuai konfigurasi proyek.

## Isolasi

Harness Vite menggunakan `envFile: false` dan mendefinisikan URL/key Supabase dummy. Setiap request nonlokal diintersep. Browser tidak memakai sesi operator, tidak menyimpan storage state, dan memblokir service worker. Tidak perlu memasukkan email/password pribadi ke file tes, CI secrets, atau environment tes. Jangan mengganti URL fixture menjadi production.

Tes ini memeriksa UI, logika routing, dan penanganan respons service. Role disimulasikan; hasilnya **bukan verifikasi RLS atau transaksi database production**. Pemanggilan tulis di fixture hanya menghasilkan respons lokal dan tidak diteruskan ke server. Font eksternal diblokir sehingga rendering tes memakai font fallback.

## Cakupan

- Form SOP admin dapat dibuka; halaman penolakan SOP untuk Jemaat, Volunteer, dan PKS tidak crash.
- Gagal mengambil SOP menampilkan error dan retry, lalu dapat pulih.
- Gagal mengambil izin tidak berubah menjadi akses penuh atau daftar admin kosong.
- Admin hanya membuka halaman yang diizinkan; izin kosong tidak menyebabkan loop redirect; default izin NULL tetap berlaku sesuai perilaku proyek.
- Admin dengan peran Volunteer masih dapat kembali ke aplikasi.
- Login: field required, label, toggle sandi melalui keyboard, serta error login.
- Onboarding: klik ganda dan penyelesaian satu kali.
- Registrasi: validasi field dan fokus kesalahan.
- Peringkat: poin seri memakai nomor unik dari server, 10 besar tidak bertambah, dan posisi pengguna di luar 10 besar tetap global. Fixture ini tidak mengeksekusi SQL; Migrasi v92 harus diverifikasi setelah dijalankan operator.
- Tampilan login mobile/desktop, terang/gelap, id/en dan teks 200%.

Jika tes gagal, baca assertion dan error browser. Sesuaikan locator hanya ketika label UI memang berubah; jangan melonggarkan assertion untuk menutupi bug.
