# Panduan Pengguna — Admin & Super Admin

Panduan ini untuk **Admin** dan **Super Admin**. Panel admin diakses di
**/admin** (otomatis terbuka setelah login bila peran Anda Admin/Super
Admin — tersedia tombol pindah panel ke tampilan aplikasi biasa).

- **Admin**: mengelola konten & pelayanan. Halaman yang bisa diakses dapat
  dibatasi oleh Super Admin lewat **Hak Akses**.
- **Super Admin**: akses penuh ke semua halaman, termasuk **Hak Akses** dan
  **Kategori Tugas**, plus dapat mengubah **biodata pribadi jemaat lain**
  (nama, kontak, alamat, NIK, dll) dan **role** pengguna — kewenangan yang
  sengaja dibatasi dari Admin biasa demi keamanan data.
- Sejak pembaruan terbaru, **Admin & Super Admin boleh merangkap PKS** —
  tidak ada lagi batasan eksklusif antara peran admin dan PKS.

---

## 1. Dashboard

Ringkasan: total jemaat, akun baru menunggu persetujuan, events aktif,
jumlah template tugas, jemaat ber-SP, antrean baptisan, dan antrean
pemberkatan nikah — tiap kartu dapat diketuk untuk langsung ke halaman
terkait. Tersedia juga daftar **Ulang Tahun** bulan berjalan (bisa pilih
bulan lain) dan, khusus **Super Admin**, indikator **pemakaian Storage
Supabase** (kuota gratis 1 GB) dengan peringatan warna saat mendekati penuh.

## 2. Jemaat

- Cari & filter jemaat berdasarkan nama, role, status, ministry, atau
  komsel.
- Tombol **Tambah Jemaat** membuat profil jemaat baru langsung tanpa perlu
  pendaftaran mandiri — isi nama, HP (wajib), email, data pribadi, lalu
  simpan. Akun otomatis berstatus **Aktif** namun **belum punya kata
  sandi** — jemaat tersebut mengaktifkan sendiri akunnya lewat halaman
  **Aktivasi Akun** (nomor HP + kode OTP WhatsApp), pola yang sama dengan
  data jemaat lama yang diimpor. NIK dan pilihan Role hanya muncul di form
  ini untuk **Super Admin**.
- Ketuk salah satu jemaat untuk membuka detail: ubah status, role
  (Super Admin saja), komsel, ministry, dan Surat Peringatan (SP).
- Pendaftaran baru berstatus **Menunggu Persetujuan** disetujui/ditolak
  dari halaman detail jemaat tersebut.
- Menghapus akun jemaat (permanen, termasuk akses login) tersedia di
  halaman detail — Admin biasa tidak dapat menghapus sesama Admin/Super
  Admin maupun akun sendiri.

## 3. Berita & Info

Buat, edit, atau hapus pengumuman/berita yang tampil di halaman Info
jemaat.

## 4. Events

- Kelola event: buat baru, edit, atau nonaktifkan.
- Tombol **Pendaftar** (ikon orang) pada tiap event menampilkan daftar
  pendaftar beserta status kehadiran, dengan filter tanggal dan tombol
  **Export Excel** (.xlsx).

## 5. Kelas

- Kelola kelas/pembinaan: buat, edit, atur jumlah sesi.
- Tombol **Pendaftar** menampilkan jemaat yang mendaftar kelas tersebut
  beserta jumlah sesi yang sudah dihadiri — dapat diekspor ke Excel.
- Tombol **Daftar Hadir** menampilkan rekap kehadiran per sesi/tanggal,
  dapat difilter (sesi & tanggal) dan diekspor ke Excel.

## 6. Tugas & Form

- Buat template tugas baru dengan field kustom (teks, angka, tanggal,
  pilihan dropdown, checkbox, upload foto/file), atur target pengisian
  & periode (minggu/bulan), hari & jam aktif, batasan role, batasan
  ministry, opsi "Batasi 1x per Hari", dan **Pengingat Otomatis** (push
  terjadwal di hari tertentu).
- Setiap tugas **wajib** memilih satu **Kategori Tugas** — menentukan
  folder tempat tugas tersebut dikelompokkan di aplikasi jemaat, dan bisa
  menjadi gerbang akses tambahan (lihat bagian 7).
- **Background Form**: pilih Tidak ada / Preset / Gambar sebagai latar
  formulir saat diisi jemaat.
- Tombol **Jawaban** pada tiap tugas menampilkan seluruh respons yang masuk
  (dengan filter tanggal).

## 7. Kategori Tugas — khusus Super Admin

- Buat kategori tugas (mis. "Komsel Youth", "Komsel Kids") dan opsional
  centang ministry yang dibatasi — hanya anggota ministry tersebut yang
  bisa mengakses tugas dalam kategori itu, **selain** batasan role/ministry
  per-tugas yang sudah ada (gerbang tambahan, bukan pengganti).
- Kategori **"Umum"** (tanpa batasan ministry) terbuka untuk semua orang —
  semua tugas lama otomatis berada di kategori ini.
- Menu ini hanya muncul di sidebar untuk Super Admin (bagian "Sistem").

## 8. Evaluasi & Laporan

Rekap keaktifan pengisian tugas lintas periode, dengan filter tugas,
ministry, komsel, role, dan nama — dapat dicetak sebagai laporan PDF.

## 9. Izin / Sakit

Setujui atau tolak pengajuan izin/sakit dari Volunteer (wajib ada bukti
foto). Pengajuan yang disetujui tidak dihitung "Kosong" pada Evaluasi.

## 10. Persembahan

- **Tab Rekap**: lihat & verifikasi/tolak persembahan perorangan; ekspor ke
  file Excel (.xlsx) lengkap dengan baris judul nama gereja & periode di
  atas tabel data (bukan CSV flat).
- **Tab Komsel**: verifikasi persembahan yang diinput PKS dari Dashboard
  PKS masing-masing.
- **Tab Rekening**: kelola daftar QRIS dan rekening bank yang ditampilkan
  ke jemaat di halaman Persembahan.

## 11. Baptisan / Pemberkatan Nikah / Penyerahan Anak

Tiga jenis pendaftaran sakral dikelola dengan pola yang sama:

- Lihat daftar pendaftaran, filter berdasarkan status.
- Ketuk satu pendaftaran untuk meninjau data lengkap & dokumen yang
  diunggah jemaat.
- Ubah status: Menunggu → Sedang Ditinjau → Disetujui → Terjadwal →
  Selesai (atau Ditolak), tetapkan jadwal, tulis catatan untuk jemaat
  (jemaat menerima notifikasi push saat status berubah).
- Cetak **Arsip PDF** berisi data lengkap & lampiran dokumen.

## 12. Sertifikat

Cari jemaat (lewat kotak pencarian nama), isi judul sertifikat, unggah file
(gambar/PDF), lalu ketuk **Terbitkan Sertifikat**. Sertifikat langsung
muncul di menu "Sertifikat Saya" milik jemaat tersebut. Daftar sertifikat
yang sudah diterbitkan dapat dilihat & dihapus di halaman yang sama.
Sertifikat diterbitkan **manual** oleh Admin — tidak ada penerbitan
otomatis.

## 13. Surat Peringatan (SP)

Kelola status SP (Aman / SP 1 / SP 2 / SP 3) beserta catatannya, dapat
difilter per level dari halaman ini maupun dari halaman detail jemaat.

## 14. Ministry

Kelola daftar ministry/pelayanan (Music, Worship, Kids, Usher, dll) yang
dapat dipilih saat mengatur data jemaat atau membatasi akses tugas/kategori
tugas.

## 15. Komsel

- Tombol **Kelola Kategori** membuat kategori komsel (mis. "Komsel Youth",
  "Komsel Kids") — dikelola bersama oleh Admin & Super Admin. Setelah ada
  kategori, baris **chip filter** berwarna muncul di atas daftar komsel
  (Semua / per kategori / Tanpa kategori), masing-masing menampilkan
  jumlah komsel — ketuk untuk memfilter cepat.
- Tambah/edit komsel: nama, kategori, kapasitas maksimal.
- Ikon **mahkota** mengelola siapa saja PKS dari sebuah komsel (satu komsel
  bisa punya beberapa PKS, satu orang bisa memimpin beberapa komsel).
- Ikon **+orang** (Tambah Anggota Cepat) memasukkan jemaat ke komsel
  langsung dari halaman ini — cari nama, ketuk untuk menambahkan, tanpa
  perlu membuka halaman Jemaat satu per satu.

## 16. Khusus Super Admin

### 16.1 Hak Akses (`/admin/hak-akses`)
Jadikan jemaat sebagai Admin atau cabut aksesnya. Atur halaman Admin mana
saja yang boleh diakses tiap akun Admin biasa (per-orang) — Super Admin
selalu memiliki akses penuh tanpa pembatasan ini.

### 16.2 Kategori Tugas
Lihat bagian 7 di atas — menu ini hanya tampil untuk Super Admin.

### 16.3 Biodata & Role Jemaat Lain
Hanya Super Admin yang dapat mengubah nama, kontak, alamat, tanggal lahir,
NIK, dan role pengguna lain. Admin biasa tetap dapat mengubah status,
komsel, ministry, dan SP tanpa batasan ini.

### 16.4 Penyimpanan
Indikator di Dashboard menampilkan perkiraan pemakaian storage Supabase
terhadap kuota 1 GB. Bila mendekati penuh, hapus file lama yang tidak
diperlukan (mis. bukti transfer/lampiran lama) atau tingkatkan paket
Supabase.

---

## Catatan Teknis (untuk pengurus IT)

- **Database**: skema lengkap & seluruh riwayat migrasi (bernomor `v1`
  hingga seterusnya) ada di `supabase/schema.sql`. Migrasi baru harus
  dijalankan manual sekali di Supabase SQL Editor sebelum fitur terkait
  aktif — lihat header tiap blok untuk keterangannya.
- **Storage buckets**: `profile-photos` (publik — foto profil, QRIS,
  background event/form), `task-files` (lampiran jawaban tugas &
  background form), `documents` (privat — dokumen baptisan, nikah,
  penyerahan anak, dan sertifikat).
- **Akun tanpa kata sandi**: baris jemaat yang dibuat lewat Tambah Jemaat
  atau data impor lama menunggu diaktivasi sendiri oleh pemiliknya lewat
  halaman Aktivasi Akun (HP + OTP WhatsApp) — bukan bug, ini alur yang
  disengaja.
- **Deploy**: push ke branch `master` memicu deploy Vercel otomatis (push
  ke `main` akan membuat preview URL terpisah yang membingungkan).
- **Bahasa & tema**: aplikasi mendukung Indonesia/English dan mode
  terang/gelap, dapat diganti tiap pengguna lewat menu Pengaturan.

---
*Dokumen ini mengikuti perkembangan fitur aplikasi ESC Siantan — perbarui
seiring fitur baru ditambahkan.*
