# PRD — Absensi Volunteer Pelayanan Minggu (Ketepatan Waktu)

**Status:** Draft v1
**Penulis:** (diisi)
**Tanggal:** 2026-06-19
**Produk:** PWA ESC Siantan

---

## 1. Latar Belakang & Masalah
Setiap hari Minggu, sejumlah **Volunteer** bertugas melayani (mis. musik, multimedia,
usher, doa, dll). Saat ini tidak ada rekap terstruktur mengenai **siapa yang hadir
tepat waktu dan siapa yang telat**. Akibatnya koordinator sulit mengevaluasi
kedisiplinan, menyiapkan pengganti, dan memberi apresiasi/teguran yang adil.

## 2. Tujuan
- Merekap kehadiran Volunteer pelayanan Minggu beserta **status ketepatan waktu**
  (Tepat Waktu / Telat / Tidak Hadir).
- Menyediakan ringkasan per tanggal dan per Volunteer untuk evaluasi koordinator.
- Proses absensi cepat (< 10 detik per orang) dan minim friksi.

### Metrik keberhasilan
- ≥ 90% pelayanan Minggu memiliki data absensi lengkap.
- Koordinator dapat melihat rekap telat/tepat waktu per bulan tanpa hitung manual.

## 3. Pengguna & Peran
| Peran | Kebutuhan |
|---|---|
| **Volunteer** | Melakukan check-in saat hadir melayani (atau di-absen oleh koordinator). |
| **Koordinator/PKS/Admin** | Mengatur jadwal, batas waktu, dan melihat rekap. |
| **Super Admin** | Akses penuh + konfigurasi (batas jam, hari layanan). |

## 4. Ruang Lingkup
**Termasuk:** absensi khusus pelayanan **hari Minggu** untuk role **Volunteer**;
penentuan status tepat waktu vs telat berdasarkan **batas jam** yang dikonfigurasi;
rekap & laporan.

**Tidak termasuk (out of scope v1):** absensi jemaat umum, ibadah non-Minggu,
penggajian/insentif, notifikasi WA otomatis (bisa fase berikutnya).

## 5. Konsep & Aturan Bisnis
- Setiap pelayanan Minggu punya **sesi** dengan **waktu mulai** (mis. 08:00) dan
  **batas toleransi** (mis. 10 menit). 
- **Tepat Waktu**: check-in ≤ (waktu mulai + toleransi).
- **Telat**: check-in setelah batas toleransi (selisih menit dicatat).
- **Tidak Hadir**: tidak ada check-in s/d sesi ditutup.
- Konfigurasi default: hari = Minggu, jam mulai & toleransi diatur Admin/Super Admin.
- Satu Volunteer = satu catatan per sesi (tidak boleh dobel).

## 6. Kebutuhan Fungsional
### 6.1 Metode absensi (pilih saat implementasi)
1. **Self check-in via QR** (mengikuti pola scan absensi yang sudah ada): koordinator
   menampilkan QR sesi; Volunteer scan → status dihitung otomatis dari jam scan.
2. **Absen manual oleh koordinator**: daftar Volunteer terjadwal + tombol
   Tepat Waktu / Telat / Tidak Hadir (cocok bila HP Volunteer terbatas).
> Rekomendasi v1: dukung **keduanya** — QR untuk mandiri, manual sebagai cadangan.

### 6.2 Penjadwalan
- Admin/koordinator membuat **sesi pelayanan Minggu** (tanggal, jam mulai, toleransi,
  ministry terkait) dan menetapkan daftar Volunteer yang bertugas.

### 6.3 Rekap & laporan
- Per **tanggal**: jumlah Tepat Waktu / Telat / Tidak Hadir + daftar nama.
- Per **Volunteer**: riwayat kehadiran & persentase ketepatan dalam rentang tanggal.
- Filter: rentang tanggal, ministry, status.
- Ekspor/cetak (mengikuti pola laporan yang sudah ada di Evaluasi & Persembahan).

## 7. Rancangan Data (usulan)
```
service_sessions (
  session_id   text pk,
  service_date date,          -- harus hari Minggu (validasi)
  start_time   time,          -- mis. 08:00
  grace_minutes int default 10,
  ministry_id  text null,
  note         text,
  created_at   timestamptz
)

volunteer_attendance (
  id            text pk,
  session_id    text fk -> service_sessions,
  user_id       text fk -> users,            -- role Volunteer
  status        text check (Tepat Waktu | Telat | Tidak Hadir),
  late_minutes  int default 0,
  checked_in_at timestamptz null,
  recorded_by   text null,                    -- null bila self check-in
  unique (session_id, user_id)
)
```
RLS: Volunteer hanya boleh insert miliknya (self check-in & sudah terjadwal);
koordinator/Admin/Super Admin baca-tulis semua (mengikuti pola helper
`auth_user_role()` yang sudah ada).

## 8. Alur UX (ringkas)
1. Koordinator membuat sesi Minggu + pilih Volunteer bertugas.
2. Hari-H: Volunteer scan QR sesi (atau diabsen koordinator).
3. Sistem hitung status otomatis dari jam check-in vs (start + grace).
4. Koordinator buka rekap untuk evaluasi.

## 9. Edge Case
- Check-in sebelum sesi dibuka → tetap dihitung Tepat Waktu (atau tolak; perlu keputusan).
- Volunteer hadir tapi lupa scan → koordinator bisa koreksi manual.
- Pergantian tugas mendadak (Volunteer pengganti) → koordinator tambah manual.
- Zona waktu: gunakan waktu lokal perangkat/server konsisten.

## 10. Pertanyaan Terbuka
- Metode utama: QR mandiri, manual koordinator, atau keduanya?
- Apakah perlu daftar "terjadwal" dulu, atau siapa pun Volunteer boleh check-in?
- Apakah toleransi & jam berbeda per ministry?
- Perlukah notifikasi pengingat sebelum pelayanan?

## 11. Rencana Rilis (saran)
- **Fase 1:** sesi + absensi manual koordinator + rekap dasar.
- **Fase 2:** self check-in via QR + perhitungan telat otomatis.
- **Fase 3:** laporan lanjutan (tren ketepatan, ekspor PDF) + pengingat.
