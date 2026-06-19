# Panduan Pengguna — Admin & Super Admin

Panduan ini untuk **Admin** dan **Super Admin**. Panel admin diakses di
**/admin** (otomatis terbuka setelah login bila peran Anda Admin/Super Admin).

- **Admin**: mengelola konten & pelayanan. Halaman yang bisa diakses dapat
  dibatasi oleh Super Admin (lihat Hak Akses).
- **Super Admin**: akses penuh + fitur sistem (Hak Akses, Tampilan, indikator
  penyimpanan).

---

## 1. Dashboard
Ringkasan: total jemaat, akun baru menunggu, events aktif, antrian baptis/nikah,
evaluasi minggu ini, jemaat terbaru, dan **Ulang Tahun** (pilih bulan).
Super Admin juga melihat **indikator Penyimpanan Supabase** (pemakaian terhadap
kuota 1 GB) dengan peringatan saat hampir penuh.

## 2. Jemaat
- Lihat & cari jemaat, filter status.
- Setujui **akun baru** (status *Menunggu Persetujuan* → *Aktif*).
- Edit data jemaat, atur **ministry** & **komsel**, tetapkan **PKS**.
- Kelola tingkat **Surat Peringatan (SP)**.

## 3. Konten
- **Berita & Info**: buat/edit/hapus pengumuman (dengan gambar sampul);
  mengirim **notifikasi push** ke jemaat saat dipublikasikan.
- **Events**: buat kegiatan, lihat **QR absensi**, dan **rekap pendaftar/hadir**.
- **Kelas**: buat kelas + **jumlah sesi**, tampilkan **QR per sesi**, lihat
  **daftar hadir**.

## 4. Tugas & Form
- Buat **template tugas**: judul, deskripsi, target & periode, hari/jam aktif,
  ministry yang boleh mengisi, dan **field formulir** (teks, angka, tanggal,
  pilihan, checkbox, upload foto/file).
- **Background form**: pilih *Tidak ada / Preset / Gambar* sebagai latar form.
- Lihat **Jawaban** yang masuk per tugas (dengan filter tanggal).

## 5. Evaluasi & Laporan
- Pantau pemenuhan target tugas per jemaat/volunteer.
- Filter: tanggal, form, role, ministry, komsel, nama.
- **Cetak Laporan** (PDF) sesuai filter aktif.

## 6. Persembahan
- **Rekap**: verifikasi/ tolak/ hapus catatan persembahan; ringkasan terverifikasi
  & menunggu.
- **Rekening & QRIS**: kelola rekening bank dan unggah gambar **QRIS**.
- **Arsip PDF**: cetak rekap + lampiran bukti.

## 7. Baptisan & Pemberkatan Nikah
- Tinjau pengajuan, ubah status (Ditinjau → Disetujui → **Terjadwal** → Selesai
  / Ditolak), beri catatan & jadwal.

## 8. Ministry & Komsel
- **Ministry**: kelola daftar ministry pelayanan.
- **Komsel**: kelola komsel, lihat anggota, dan **Kelola PKS** (tetapkan/cabut
  pemimpin komsel — satu komsel bisa banyak PKS, satu orang bisa pimpin banyak
  komsel).

## 9. Khusus Super Admin

### 9.1 Hak Akses (`/admin/hak-akses`)
- Jadikan jemaat sebagai **Admin** atau cabut aksesnya.
- Atur **halaman mana saja** yang boleh diakses tiap admin (per-orang).

### 9.2 Tampilan (`/admin/tampilan`)
- Atur **background halaman Login**: pilih **preset** gradien atau **unggah
  gambar** sendiri. Pratinjau tersedia. Ketuk **Simpan**.

### 9.3 Penyimpanan
- Indikator di Dashboard menampilkan perkiraan pemakaian storage. Bila mendekati
  penuh, hapus file lama (mis. bukti/lampiran yang tak perlu) atau tingkatkan
  paket Supabase.

---

## Catatan Teknis (untuk pengurus IT)
- **Database**: skema lengkap ada di `supabase/schema.sql`. Untuk fitur baru
  (mis. background login & background form), jalankan SQL terkait di Supabase
  SQL Editor bila diminta.
- **Storage buckets**: `profile-photos` (publik: foto, QRIS, background),
  `task-files` (lampiran tugas), `documents` (privat). Pastikan policy upload
  sudah dipasang.
- **Deploy**: push ke branch `master` memicu deploy Vercel otomatis.
- **Bahasa & tema**: aplikasi mendukung ID/EN dan mode terang/gelap.

---
*Dokumen ini dapat diperbarui seiring penambahan fitur.*
