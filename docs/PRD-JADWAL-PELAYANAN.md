# PRD - Sistem Jadwal Pelayanan

Status: **SIAP RILIS - migrasi dikonfirmasi operator; tes manual production masih diperlukan**
Tanggal: 1 Oktober 2026
Lingkup: roster pelayanan, grant pengelola per ministry, PDF, dan notifikasi. Tidak termasuk deploy.

## 1. Ringkasan

Sistem ini membantu Ministry Head dan Wakil menyusun roster pelayanan untuk sebuah ibadah atau sesi kelas, lalu memberi setiap pelayan satu tempat untuk mengecek tugasnya dan menerima pengingat.

Keputusan operator tambahan: akses Ministry Head/Wakil diberikan Admin per ministry dan **tidak mengubah** `users.role` atau `role_secondary`. Grant ini hanya membuka panel pengelola jadwal pada `/admin/jadwal-pelayanan` untuk ministry yang diberikan; tidak membuka kemampuan Admin lainnya. Admin yang mengelola fitur ini tetap tunduk pada Hak Akses halaman tersebut. Menu `Jadwal Pelayanan` di aplikasi jemaat ditujukan khusus Volunteer, termasuk `role_secondary` Volunteer bila role utama bukan Admin/Super Admin.

[Pasti] Aplikasi saat ini sudah memiliki fondasi `Absen Pelayanan`: sesi bertanggal dan berjam, daftar nama pelayan, QR, status tepat waktu/terlambat, rekap, serta kartu jadwal pribadi di Beranda. Fondasi ini belum memiliki:

- posisi pelayanan seperti WL, Singer, Drum, Sound, atau Pengajar;
- kepemilikan jadwal oleh Ministry Head/Wakil;
- hubungan eksplisit dengan sebuah ibadah atau sesi kelas;
- status Draft/Terbit agar perubahan tidak langsung dianggap final;
- pengingat otomatis khusus jadwal pelayanan;
- deteksi bentrok jadwal;
- tampilan roster bulanan yang setara dengan manfaat spreadsheet contoh.

Fitur baru akan mengembangkan fondasi tersebut dan mempertahankan riwayat absensi lama.

## 2. Masalah pengguna

### Ministry Head/Wakil

- Menyusun roster di spreadsheet memerlukan banyak salin-tempel.
- Sulit mengetahui posisi yang belum terisi.
- Sulit mengetahui anggota yang bentrok, izin, atau sudah bertugas di waktu yang sama.
- Perubahan jadwal harus diberitahukan manual melalui beberapa kanal.

### Pelayan

- Jadwal pribadi bercampur dengan seluruh isi spreadsheet.
- Perubahan posisi atau jam mudah terlewat.
- Tidak ada satu halaman yang memperlihatkan semua tugas mendatang.

### Admin/Super Admin

- Belum ada pengaturan siapa yang sah mengelola setiap ministry.
- Belum ada katalog posisi pelayanan yang konsisten per ministry.
- Riwayat penyusunan roster dan pengiriman pengingat belum mudah diaudit.

## 3. Sasaran produk

1. Ministry Head/Wakil dapat membuat roster satu ibadah/kelas tanpa mengedit data ministry lain.
2. Posisi kosong dan bentrok terlihat sebelum jadwal diterbitkan.
3. Volunteer dapat membuka Jadwal Pelayanan dari aplikasi jemaat meskipun belum mendapat tugas, lalu menemukan tugas mendatang dalam paling banyak dua ketukan dari Beranda.
4. Saat jadwal diterbitkan atau dibatalkan, pelayan yang terdampak mendapat notifikasi dalam aplikasi; push dikirim bila sudah diaktifkan.
5. Sistem absensi pelayanan yang ada tetap dapat dipakai tanpa kehilangan riwayat.
6. Pengelola dapat mencetak roster per kegiatan dan rekap bulanan sebagai PDF dari panel pengelola.

Indikator keberhasilan setelah rilis:

- minimal 90% slot wajib terisi sebelum roster diterbitkan;
- tidak ada jadwal terbit dengan bentrok keras yang tidak dikonfirmasi pengelola;
- minimal 80% pelayan membuka detail jadwal sebelum hari pelayanan;
- jumlah pengumuman jadwal yang harus dikirim manual menurun;
- tidak ada akses tulis lintas-ministry oleh Head/Wakil.

## 4. Bukan sasaran versi pertama

- pertukaran jadwal mandiri antar pelayan;
- persetujuan/penolakan tugas oleh pelayan;
- rekomendasi roster otomatis berdasarkan frekuensi pelayanan;
- integrasi WhatsApp atau layanan pihak ketiga;
- kalender eksternal, honor, konsumsi, atau penggantian sistem absensi jemaat umum.

## 5. Peran dan hak akses

| Peran | Menu Jadwal Pelayanan di aplikasi jemaat | Panel `/admin/jadwal-pelayanan` | Lingkup kelola | Ekspor PDF |
|---|---:|---:|---|---:|
| Volunteer (role utama/sekunder, bukan Admin/Super Admin) | Ya, selalu termasuk saat kosong | Hanya bila diberi grant Head/Wakil | Ministry yang diberikan | Jika mendapat grant |
| Jemaat/PKS tanpa Volunteer atau grant | Tidak | Tidak | Tidak ada | Tidak |
| Head/Wakil dengan grant aktif | Hanya jika juga Volunteer | Ya | Ministry yang diberikan | Ya, untuk lingkupnya |
| Admin dengan izin halaman | Tidak | Ya | Semua ministry | Ya |
| Super Admin | Tidak | Ya | Semua ministry | Ya |

[Diputuskan] Panel pengelola di `/admin/jadwal-pelayanan` dapat dibuka oleh Admin/Super Admin atau Head/Wakil yang memiliki grant aktif. Untuk Head/Wakil, panel hanya memuat halaman jadwal dan data ministry yang diizinkan; akses panel ini **bukan** kenaikan role Admin. Akun Admin/Super Admin memakai panel pengelola, tanpa pintasan `Kelola` ataupun menu `Jadwal Pelayanan` di aplikasi jemaat. Hak baca roster Terbit yang sudah ada tidak otomatis menjadi hak mengelola.

## 6. Istilah produk

- **Kegiatan**: satu kejadian konkret yang membutuhkan pelayanan, berupa Ibadah atau Sesi Kelas.
- **Roster**: daftar posisi dan pelayan untuk satu kegiatan.
- **Bagian Ministry**: potongan roster yang hanya dapat diedit Head/Wakil ministry tersebut.
- **Posisi**: tugas pelayanan seperti WL, Singer, Drum, Operator Media, atau Pengajar.
- **Slot**: satu tempat pada posisi. Singer dapat memiliki dua slot; WL dapat memiliki satu.
- **Terbit**: roster sudah final, dapat dilihat pengguna yang berhak, dan memicu notifikasi.

## 7. Sumber kegiatan

### Ibadah

[Rekomendasi] Pengelola dapat memilih Event yang sudah ada atau membuat kejadian Ibadah Minggu dengan judul, tanggal, jam mulai, jam selesai, dan lokasi.

Ini diperlukan karena `events` cocok untuk kegiatan bertanggal, sedangkan `sunday_sessions` saat ini dibuat untuk QR absensi ketika ibadah berlangsung dan bukan kalender perencanaan.

### Kelas

Pengelola memilih kelas yang sudah ada, nomor/nama sesi, tanggal, jam mulai, jam selesai, dan lokasi. Tanggal sesi wajib diisi karena `classes.schedule` saat ini berupa teks bebas dan tidak dapat dipakai untuk deteksi bentrok.

## 8. Alur utama

### 8.1 Menyiapkan ministry

1. Admin menetapkan satu Head dan nol atau lebih Wakil.
2. Head/Wakil atau Admin membuat katalog posisi ministry.
3. Tiap posisi memiliki nama, urutan, jumlah slot default, dan status aktif.

| Ministry | Posisi | Slot default |
|---|---|---:|
| Worship | WL | 1 |
| Worship | Singer | 2 |
| Musik | Drum | 1 |
| Musik | Bass | 1 |
| Multimedia | Sound | 1 |
| Multimedia | Operator Media | 1 |
| Kids | Pengajar | 2 |
| Kids | Kakak Kids | 4 |

### 8.2 Menyusun roster

1. Admin/Super Admin atau Head/Wakil ber-grant membuka `/admin/jadwal-pelayanan` dari panel pengelola.
2. Memilih kegiatan Ibadah atau Kelas.
3. Sistem membuat atau membuka roster kegiatan yang sama.
4. Pengelola melihat hanya bagian ministry yang boleh diedit.
5. Posisi aktif dimuat sebagai slot kosong berdasarkan template ministry.
6. Pengelola mengetuk slot, mencari anggota ministry, lalu memilih nama.
7. Sistem memeriksa tanggal dan rentang jam melalui database, lalu menampilkan **semua** penugasan yang bentrok berikut nama ibadah/kelas dan sesi, ministry, posisi, jam, dan lokasi masing-masing.
8. Pengelola menyimpan Draft atau menerbitkan bagian ministry-nya.

### 8.3 Menyalin jadwal

Ditunda ke iterasi berikutnya. Versi pertama membuat Draft baru dari template posisi aktif ministry.

### 8.4 Mengecek jadwal

Volunteer dapat membuka menu `Jadwal Pelayanan` di aplikasi jemaat, kartu `Jadwal Pelayanan Saya` di Beranda, atau detail melalui notifikasi. Menu dan halaman tetap tampil saat tidak ada penugasan; keadaan kosong menyatakan belum ada tugas pelayanan dan menyediakan aksi untuk melihat bulan berikutnya. Admin/Super Admin tidak melihat pintasan ini di tampilan jemaat dan membuka pengelolaan melalui panel Admin. Bila mereka juga ditugaskan melayani, tautan notifikasi tetap membuka tampilan baca-saja tanpa memberi hak kelola.

Detail menampilkan tanggal, jam, lokasi, ministry, posisi, dresscode, catatan, dan bagian ministry lain pada kegiatan yang sama.

### 8.5 Perubahan setelah terbit

Versi pertama mengunci roster Terbit agar tidak dapat diedit atau dihapus melalui UI maupun PostgREST. Pengelola dapat membatalkan roster; perubahan parsial setelah Terbit ditunda agar notifikasi perubahan tidak ambigu.

## 9. Status roster

```text
Draft -> Terbit
  |         |
  |         +-> Dibatalkan
  +-> Dihapus (hanya jika belum pernah diterbitkan)
```

- Draft hanya terlihat pengelola bagian ministry, Admin yang berhak akses, dan Super Admin.
- Jadwal yang pernah diterbitkan tidak dihapus permanen.
- Kegiatan yang sudah memiliki absensi tidak boleh diubah tanggal atau identitas sumbernya.

## 10. Notifikasi

### Kanal

1. **Dalam aplikasi**: selalu muncul di lonceng notifikasi dan halaman jadwal.
2. **Web push PWA**: dikirim bila pengguna sudah mengaktifkan notifikasi.

[Pasti] Push tidak dapat dijamin diterima bila izin browser belum diberikan, subscription kedaluwarsa, atau perangkat membatasi PWA. Jadwal dalam aplikasi menjadi sumber kebenaran.

| Pemicu | Penerima | Waktu |
|---|---|---|
| Roster diterbitkan | Pelayan yang ditugaskan | Segera |
| Kegiatan dibatalkan | Semua pelayan terjadwal | Segera |
| Pengingat | Semua pelayan terjadwal | H-1 pukul 18.00 WIB |

Setiap pengiriman memakai klaim atomik per jadwal, pengguna, jenis notifikasi, dan versi roster. Percobaan gagal dapat diulang; klaim macet kedaluwarsa setelah 10 menit. Tombol `Kirim Pengingat` tersedia di panel pengelola dengan konfirmasi dan rate limit, untuk satu pengingat tambahan yang berhasil per versi roster. Akun nonaktif dan penerima tanpa subscription tidak dicatat sebagai terkirim.

Push tetap bersifat upaya terbaik: proses yang terhenti tepat setelah penyedia push menerima pesan tetapi sebelum log sukses tersimpan dapat menyebabkan pengiriman ulang setelah klaim kedaluwarsa. Jadwal dalam aplikasi tetap menjadi sumber kebenaran.

## 11. Aturan penugasan

[Rekomendasi]

- Head/Wakil hanya memilih anggota aktif yang terdaftar pada ministry-nya.
- Admin/Super Admin dapat memilih jemaat aktif di luar ministry dengan penanda `Bukan anggota ministry`.
- Satu slot hanya memiliki satu pelayan.
- Satu orang boleh memegang beberapa posisi setelah pengelola mengonfirmasi peringatan.
- Jam mulai dan jam selesai wajib diisi untuk jadwal baru.
- Bentrok hanya terjadi bila tanggal sama dan rentang jam bertumpuk; jadwal yang bersebelahan tepat pada jam selesai/mulai tidak dianggap bentrok.
- Penugasan kedua pada roster yang sama juga dianggap bentrok dan memerlukan konfirmasi.
- Peringatan bentrok memperlihatkan **semua** penugasan yang bentrok, bukan hanya yang pertama: nama ibadah/kelas dan sesi, ministry, posisi, rentang jam, dan lokasi.
- Admin maupun Head/Wakil dapat melanjutkan setelah konfirmasi eksplisit; RPC database memeriksa ulang untuk mencegah race condition.
- Jadwal lama tanpa jam selesai diperlakukan sebagai potensi bentrok pada tanggal yang sama sampai datanya dilengkapi.
- Posisi kosong tidak menghalangi penyimpanan Draft.
- Terbit dengan slot wajib kosong memerlukan konfirmasi dan berstatus `Belum lengkap`.

## 12. Integrasi Absen Pelayanan

Halaman `Absen Pelayanan` lama dipertahankan tanpa perubahan untuk QR, ketepatan waktu, dan rekap. Roster baru memakai tabel terpisah agar Migrasi v95 tidak mengubah policy production tabel lama yang berisiko drift. Penyatuan sumber nama untuk scan menjadi pekerjaan lanjutan setelah alur roster stabil.

## 13. Model data konseptual

Ini rancangan, bukan SQL final.

```text
ministries
  1 -- n ministry_schedule_managers
  1 -- n ministry_service_positions

service_rosters
  1 -- n service_roster_slots
  1 -- n service_roster_notification_logs

service_roster_slots
  slot_id
  roster_id, ministry_id, position_id, slot_no
  user_id nullable saat Draft

service_rosters
  source_type: Ibadah | Event | Kelas
  event_id nullable
  class_id nullable
  class_session_no nullable
  end_time, location, dress_code, notes
  status, updated_at
```

`ministry_schedules`, `ministry_schedule_assignments`, dan `ministry_attendance` lama tidak dihapus atau diubah. Konversi data lama bukan bagian versi pertama.

## 14. Keamanan dan RLS

[Pasti] Pembatasan edit Head/Wakil harus ditegakkan di database, bukan hanya menyembunyikan tombol.

- helper baru setara `auth_manages_ministry(ministry_id)` berstatus `SECURITY DEFINER`;
- Head/Wakil hanya menulis section, posisi, dan slot ministry yang dikelola;
- Admin tetap harus lolos `auth_admin_can('/admin/jadwal-pelayanan')`;
- pengguna biasa hanya membaca roster Terbit dan jadwal sendiri; menu pribadi hanya untuk Volunteer;
- endpoint notifikasi menghitung ulang penerima di server;
- penerbitan, pembatalan, dan pengiriman manual masuk audit log.

Sebelum implementasi, policy production tabel jadwal lama wajib didump dan dibandingkan karena drift schema pernah terjadi. Perubahan schema harus memakai skill `audit-rls` lalu `migrasi-db`.

## 15. Kebutuhan UX

- Tampilan jemaat Volunteer memakai daftar vertikal pribadi, termasuk keadaan kosong yang jelas; tidak memuat aksi pengelolaan.
- Panel pengelola Admin/Super Admin dan Head/Wakil ber-grant memakai tata letak panel Admin, dengan editor per posisi yang tetap responsif.
- Panel pengelola menyediakan tampilan bulan 4-5 kolom agar manfaat spreadsheet tetap ada.
- Filter utama: bulan, jenis kegiatan, ministry, dan status kelengkapan.
- Setiap layar hanya memiliki satu aksi utama.
- Tombol dan slot sentuh minimal 44x44 px.
- Status selalu memakai teks serta warna.
- Form pengelola menyimpan Draft secara eksplisit dan memberi umpan balik ketika berhasil.
- Keluar dengan perubahan belum tersimpan memerlukan konfirmasi.
- Dark mode memakai token aplikasi dan `bg-control`.
- Tidak memakai `ring-*`, `shadow-md`, atau kelas Tailwind hasil interpolasi.
- Seluruh teks UI memiliki kunci `id` dan `en`.

## 16. Sketch low fidelity

### A. Pelayan - Jadwal Saya

```text
+--------------------------------------+
| <  Jadwal Pelayanan                  |
| Oktober 2026                      v  |
|                                      |
| MINGGU, 4 OKT                        |
| +----------------------------------+ |
| | Ibadah Kids - Elbert            | |
| | 07.00-09.00 · Ruang Kids        | |
| | Worship · Singer          Terbit| |
| | Dresscode: Blazer               | |
| | Hadir 30 menit lebih awal       | |
| +----------------------------------+ |
|                                      |
| MINGGU, 11 OKT                       |
| +----------------------------------+ |
| | Ibadah Pagi                     | |
| | Multimedia · Operator Media     | |
| +----------------------------------+ |
+--------------------------------------+
```

Menu ini tetap tersedia bagi Volunteer yang belum ditugaskan. Keadaan kosong:

```text
+--------------------------------------+
| <  Jadwal Pelayanan                  |
| Oktober 2026                      v  |
|                                      |
|       Belum ada tugas pelayanan      |
|       untuk periode ini.             |
|                                      |
| [ Lihat bulan berikutnya ]           |
+--------------------------------------+
```

### B. Panel pengelola - Admin/Super Admin atau Head/Wakil ber-grant

```text
+----------------+-------------------------------------+
| Panel          | Jadwal Pelayanan                    |
| Jadwal         | Ministry: Worship                v  |
| Pelayanan      | [Oktober 2026]       [+ Jadwal]      |
|                | [Semua] [Draft] [Belum lengkap]     |
|                | 04 Okt · Ibadah Kids                |
|                | 07.00-09.00 · 5/6 slot · Draft      |
|                | 11 Okt · Ibadah Kids                |
|                | 07.00-09.00 · 6/6 slot · Terbit     |
|                | [ Ekspor PDF ]                      |
+----------------+-------------------------------------+
```

Admin/Super Admin melihat navigasi Admin sesuai perannya. Head/Wakil yang hanya memiliki grant roster melihat panel terbatas untuk jadwal, tanpa tautan ke modul Admin lain.

### C. Editor roster di panel pengelola

```text
+--------------------------------------+
| <  Ibadah Kids                       |
| Minggu, 4 Okt · 07.00-09.00          |
| [Draft]                   Tersimpan   |
|--------------------------------------|
| WORSHIP                         5/6   |
| WL                                   |
| [ Elyon                         x ]   |
| Singer                               |
| [ Mei Mei                       x ]   |
| [ + Pilih pelayan                  ] |
| Peraga                               |
| [ Keysha                        x ]   |
| [ Elin                          x ]   |
| ! 1 slot belum terisi                |
|--------------------------------------|
| Dresscode  [ Blazer                ] |
| Catatan    [ Hadir 30 menit awal   ] |
| [ Simpan Draft ] [ Tinjau & Terbit ]|
+--------------------------------------+
```

### D. Pilih pelayan dan peringatan bentrok

```text
+--------------------------------------+
| Pilih Singer                     x   |
| [ Cari nama...                     ] |
| Disarankan                           |
| ( ) Mei Mei       Tersedia           |
| ( ) Belva         2 bentrok           |
| ( ) Reycia        Izin                |
|--------------------------------------|
| Belva sudah bertugas pada:           |
| 1. Ibadah Kids · Elbert              |
|    Worship · WL · 07.00-09.00         |
|    Ruang Kids                        |
| 2. Kelas Creative · Sesi 3           |
|    Musik · Bass · 08.30-10.00         |
|    Ruang Musik                       |
| [ Batal ] [ Tetap tugaskan ]         |
+--------------------------------------+
```

### E. Tampilan bulan di panel pengelola

```text
+----------------+----------------+----------------+----------------+
| 4 Oktober      | 11 Oktober     | 18 Oktober     | 25 Oktober     |
| Ibadah Kids    | Ibadah Kids    | Ibadah Kids    | Ibadah Kids    |
| 6/6 Terbit     | 5/6 Draft      | 6/6 Terbit     | 4/6 Draft      |
+----------------+----------------+----------------+----------------+
| WL      Elyon  | WL      Belva  | WL      Belva  | WL      Kevin  |
| Singer  Mei M. | Singer  Nico   | Singer  Keysha | Singer  Mei M. |
| Singer  Delvin | Singer  Yola   | Singer  Delvin | Singer  Nico   |
| Peraga  Keysha | Peraga  Vania  | Peraga  Elin   | Peraga  Sully  |
+----------------+----------------+----------------+----------------+
```

Ekspor PDF detail roster dan rekap bulanan hanya tersedia pada panel pengelola. Dialog cetak browser menjadi mekanisme PDF; sumber data tetap roster aplikasi. Jadwal pribadi Volunteer tidak memuat kontrol ekspor.

## 17. Acceptance criteria versi pertama

### Pengelolaan

- Head/Wakil hanya dapat mengubah roster ministry yang dikelola.
- Admin/Super Admin mengelola dari panel Admin; Head/Wakil ber-grant masuk panel jadwal terbatas pada rute yang sama tanpa mendapat role atau menu Admin lain.
- Akun Admin/Super Admin tidak melihat menu Jadwal Pelayanan atau pintasan Kelola di aplikasi jemaat.
- Posisi dan jumlah slot default dapat dikonfigurasi per ministry.
- Roster dapat dibuat dari Ibadah atau sesi Kelas.
- Draft tidak terlihat pengguna umum dan tidak mengirim notifikasi.
- Sistem menampilkan jumlah slot terisi dan kosong.
- Detail roster dan rekap bulanan dapat diekspor ke PDF hanya dari panel pengelola, sesuai lingkup akses pengelola.
- Peringatan bentrok memuat semua penugasan yang bertumpuk, lengkap dengan ibadah/kelas dan sesi, ministry, posisi, jam, serta lokasi.

### Volunteer

- Menu Jadwal Pelayanan tetap terlihat dalam tampilan jemaat saat belum ada tugas; keadaan kosong memberi informasi yang jelas.
- Beranda menampilkan tugas terdekat ketika tersedia.
- Jadwal Saya menampilkan semua tugas mendatang secara kronologis.
- Detail memperlihatkan posisi, waktu, lokasi, dresscode, dan catatan.
- Jadwal batal tetap terlihat dengan status jelas sampai tanggalnya lewat.
- Akun tanpa role Volunteer tidak melihat menu ini; role sekunder Volunteer berlaku kecuali role utamanya Admin/Super Admin.

### Notifikasi dan keamanan

- Penerbitan dan pembatalan menghasilkan notifikasi.
- Pengingat H-1 tidak terkirim dua kali walau cron dijalankan ulang.
- Ketukan notifikasi membuka detail yang tepat.
- PostgREST langsung tidak dapat dipakai Head/Wakil untuk menulis ministry lain.
- Perubahan pelayan pada slot wajib melalui RPC penugasan; update PostgREST langsung ditolak trigger.
- Pengguna biasa tidak dapat membaca Draft.
- Penerbitan, pembatalan, dan kirim ulang pengingat memiliki jejak audit.

## 18. Tahapan implementasi setelah disetujui

1. Audit policy production tabel jadwal lama.
2. Migrasi tabel baru dan helper RLS append-only.
3. Pengaturan Head/Wakil dan posisi ministry.
4. Editor roster Draft/Terbit serta pemeriksaan bentrok.
5. Jadwal Saya dan detail jadwal.
6. Notifikasi dalam aplikasi dan push H-1.
7. Integrasi roster baru dengan Absen Pelayanan.
8. Build, baca ulang logika, dan tes manual per role.

## 19. Keputusan operator

1. **Visibilitas roster terbit**
   Diputuskan untuk versi pertama: roster Terbit tetap dapat dibaca pengguna login yang berhak melalui detail kegiatan/notifikasi; menu jadwal pribadi di tampilan jemaat hanya tampil bagi Volunteer. Draft hanya Admin berhak akses dan Head/Wakil ministry terkait.

2. **Sumber Ibadah**
   Diputuskan: pilih Event yang ada atau buat data Ibadah langsung di Draft roster.

3. **Kandidat pelayan**
   Diputuskan: Head/Wakil hanya memilih anggota aktif ministry; Admin/Super Admin dapat memilih pengguna aktif lain.

4. **Waktu pengingat**
   Diputuskan: saat Terbit dan H-1 pukul 18.00 WIB. H-2 jam ditunda agar notifikasi tidak berlebihan.

5. **Konfirmasi kesediaan**
   Diputuskan: ditunda. Versi pertama fokus pada penyusunan, pengecekan, dan pengingat.

6. **Nama menu**
   Diputuskan: menu `Jadwal Pelayanan` di aplikasi jemaat hanya untuk Volunteer; panel `Jadwal Pelayanan` pada `/admin/jadwal-pelayanan` untuk Admin/Super Admin dan Head/Wakil dengan grant aktif. Panel Head/Wakil dibatasi pada modul dan ministry yang diberikan.

7. **Ekspor**
   Diputuskan: versi pertama menyediakan PDF melalui dialog cetak browser hanya di panel pengelola. Ekspor Excel ditunda.

8. **Pemeriksaan bentrok**
   Diputuskan: jadwal pada tanggal sama tidak bentrok bila rentang waktunya tidak tumpang tindih. Peringatan memperlihatkan seluruh penugasan yang bentrok dengan rincian ibadah/kelas, sesi, ministry, posisi, jam, dan lokasi.

## 20. Aktivasi production

[Pasti] Blok v95-v96 berada di `supabase/schema.sql` dan tidak dijalankan otomatis oleh aplikasi. Pada 2 Oktober 2026 operator melaporkan migrasi sudah dijalankan. Hasil query production kemudian mengonfirmasi kedua guard roster/slot, trigger terkait, FK roster/slot, serta cascade `users.auth_id` cocok dengan file lokal. Policy dan fungsi lain belum dicocokkan langsung. v96 mencakup validasi jam, RPC penugasan, pembatasan grant berdasarkan role terkini, pembatasan baca anonim, serta klaim pengiriman push.

### Penahanan rilis pada 2 Oktober 2026

[Pasti] Audit menemukan guard roster dan slot menolak perubahan pada roster Terbit/Dibatalkan, termasuk perubahan referensi `ON DELETE SET NULL` saat akun dihapus. Hasil query operator mengonfirmasi guard dan FK tersebut aktif di production. Tidak ada penghapusan akun percobaan atau perubahan SQL production yang dilakukan.

Operator awalnya memilih menahan rilis. Perbaikan append-only disiapkan sebagai Migrasi v97, lalu pada 2 Oktober 2026 operator mengonfirmasi v97 sudah dijalankan dan meminta push. Agen tidak menjalankan SQL production. v95-v96 tidak diubah ulang. v97 hanya menerima UPDATE backend saat referensi pengguna lama benar-benar sudah hilang dan seluruh kolom input selain referensi yang dibersihkan tetap sama; timestamp roster diperbarui otomatis. Larangan edit roster final oleh pengguna tetap berlaku. Tidak perlu menjalankan ulang v95-v97 berdasarkan laporan operator; jangan jalankan penghapusan akun percobaan pada akun jemaat sungguhan.

Tes tambahan `tests/roster-db.test.mjs` memakai PostgreSQL embedded (PGlite, dependency pengembangan) dengan data sintetis di memori. Tes menguji trigger dan FK sebenarnya yang diambil dari schema lokal, termasuk cascade akun auth; tidak menghubungi Supabase production dan tidak membuktikan policy RLS production lain.

Verifikasi lokal terakhir setelah perbaikan: lint lulus, 82 tes lulus, dan build lulus. Tes database membuktikan kegagalan v96, menjalankan v97 dua kali, memverifikasi cascade akun auth/profil tanpa auth, dan menolak perubahan status/isi/identitas/referensi lain bersama cleanup. Pengujian ini menggunakan data sintetis PostgreSQL di memori; bukan pengujian endpoint hapus atau seluruh RLS di production.

Peringatan dependency lama masih ada: hasil `npm audit` melaporkan 5 moderate dan 1 high (Vite) pada 2 Oktober 2026. Tidak ada temuan pada PGlite yang baru ditambahkan; dependency lama tidak diperbarui dalam lingkup fitur jadwal ini.

1. Bila v95 belum pernah dijalankan, jalankan v95 dan v96 bersama dalam Supabase SQL Editor sebelum deploy. Jangan mengaktifkan v95 saja karena pengaman tambahannya berada di v96.
2. Bila v95 sudah dijalankan, cocokkan definisi production dengan draf sebelum menjalankan v96. Periksa juga Draft lama yang mungkin sudah memiliki bentrok serta grant Head aktif milik akun yang kini nonaktif/Admin/Gembala. Grant tidak sah dapat dicabut melalui panel oleh Admin; tidak ada pembersihan massal data di migrasi.
3. SQL baru sudah dibaca ulang secara statis, tetapi belum dieksekusi terhadap PostgreSQL production. Tes aplikasi menggunakan backend fixture dan tidak membuktikan policy atau trigger yang sedang aktif di database.

Query verifikasi berikut bersifat baca-saja:

```sql
SELECT c.relname AS tabel, c.relrowsecurity AS rls_aktif,
       p.polname AS policy, p.polcmd AS cmd,
       pg_get_expr(p.polqual, p.polrelid) AS using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'ministry_schedule_managers', 'ministry_service_positions',
    'service_rosters', 'service_roster_slots', 'service_roster_notification_logs'
  )
ORDER BY c.relname, p.polname;

SELECT p.proname, pg_get_functiondef(p.oid) AS definisi
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'auth_manages_ministry', 'guard_service_roster', 'guard_service_roster_slot',
    'prepare_ministry_schedule_manager', 'publish_service_roster'
  )
ORDER BY p.proname;
```

Tes manual setelah migrasi dan deploy:

- Volunteer utama/sekunder non-Admin tetap melihat menu dan keadaan kosong; tautan notifikasi membuka detail roster tepat walaupun berbeda bulan.
- Admin/Super Admin tidak melihat menu jemaat; panel kelola mengikuti Hak Akses. Head/Wakil hanya mengelola ministry yang diberikan dan tidak membuka modul Admin lain.
- Penugasan pukul 07.00-09.00 dan 10.00-12.00 tidak bentrok; pukul 08.30-10.00 memberi peringatan dengan kegiatan dan posisi yang tepat; pukul 09.00-11.00 tidak bentrok dengan jadwal yang selesai 09.00.
- Ubah role pemilik grant menjadi Admin terbatas: grant tidak boleh melewati Hak Akses pada RPC/endpoint langsung.
- PDF detail dan bulanan memuat posisi, nama, tanggal, jam, serta status yang tepat. Ekspor memakai dialog cetak browser.
- Terbit, pembatalan, pengingat tambahan, dan H-1 pukul 18.00 WIB diuji pada PWA dengan izin push aktif. Run bersamaan melewati klaim atomik; pengiriman gagal tidak dicatat sukses. Cron mengembalikan 503 bila ada penerima yang seluruh perangkatnya gagal; belum ada jadwal retry otomatis khusus.
