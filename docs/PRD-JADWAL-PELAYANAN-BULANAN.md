# PRD Jadwal Pelayanan Bulanan

Status: rancangan disetujui; implementasi dan pengujian lokal selesai.
Tanggal: 3 Oktober 2026.
Referensi: gambar jadwal bulanan yang dikirim pengguna, bukan instruksi sistem.

## 1. Tujuan Dan Batas Dokumen

Mengganti pengalaman roster terpisah menjadi satu lembar jadwal bulanan bersama.
Tanggal menjadi kolom; ibadah atau sesi kelas, bagian, dan posisi menjadi baris.
Pengelola berakses mengisi bagian miliknya, anggota membaca tugas pribadinya.
Dokumen membedakan keputusan produk, kode implementasi, dan hasil pengujian lokal.
Kode aplikasi serta Migrasi v98-v100 disiapkan secara lokal. Operator melaporkan
v98 dan v99 sudah dijalankan; v100 masih memerlukan penerapan manual. Tes lokal
tidak menjalankan SQL production atau membuktikan pengiriman notifikasi nyata.

## 2. Kebutuhan Yang Sudah Dikonfirmasi

- Satu template untuk menata pelayanan selama satu bulan, mirip referensi spreadsheet.
- Jadwal mencakup ibadah atau kelas, bukan hanya satu jenis kegiatan.
- Pengguna berakses dapat mendaftarkan jadwal anggota sesuai bagiannya.
- KEPUTUSAN OPERATOR: hanya Admin berhak halaman atau MH/Wakil yang diberi akses
  boleh mengisi nama pelayan pada tanggal/posisi; anggota tidak mendaftar sendiri.
- KEPUTUSAN OPERATOR: Admin berakses mengatur template, struktur kegiatan, dan jam.
  MH/Wakil yang disetujui Admin hanya mengisi bagian ministry yang diberikan kepadanya.
- KEPUTUSAN OPERATOR: hanya Admin menerbitkan seluruh bulan secara atomik,
  bukan penerbitan terpisah oleh MH atau Wakil.
- KEPUTUSAN OPERATOR: penugasan dengan jam bertumpuk wajib ditolak, tanpa override.
  Rangkap beberapa posisi dalam ibadah/kelas yang sama juga ditolak dahulu.
- Admin menyetujui akses MH atau Wakil; akses tersebut tidak menaikkan role ke Admin.
- KEPUTUSAN OPERATOR: MH khusus tiap Ministry berasal dari akun terdaftar dengan
  role utama Volunteer, status Aktif, dan keanggotaan pada Ministry yang sama.
  Jabatan ini diatur di menu Ministry,
  terpisah dari Kepala Departemen dan persetujuan akses jadwal.
- KEPUTUSAN OPERATOR: data Ministry dan MH hanya dapat dibaca pengguna login,
  termasuk melalui API langsung.
- Mengelola jadwal dipisahkan dari melihat jadwal, bukan dibedakan berdasarkan lebar layar.
- Menu aplikasi jemaat hanya tampil untuk Volunteer, termasuk ketika belum ada penugasan.
- Jadwal mudah diperiksa dan pengingat dikirim melalui aplikasi.
- Ekspor PDF tersedia.
- Bentrok harus mempertimbangkan jam dan ibadah tempat anggota melayani.

Gambar menunjukkan empat kolom tanggal, kelompok Kids/Pagi/Nextgen, posisi pelayanan,
nama lebih dari satu orang, label tim, materi pengajaran, dan dresscode per tanggal.
Gambar tidak memuat jam ibadah; waktu tidak boleh ditebak dari urutan blok.
Makna 'user mendaftarkan pelayanan' sudah dikonfirmasi sebagai penjadwalan oleh pengelola berakses.

## 3. Kondisi Kode Saat Ini

- Roster melekat pada satu ministry, bukan identitas ibadah bersama:
  [schema.sql](<D:/ESC Siantan PWA/supabase/schema.sql:5517>).
- Setiap slot menyimpan satu anggota dan posisi; beberapa slot bisa memakai posisi sama:
  [schema.sql](<D:/ESC Siantan PWA/supabase/schema.sql:5573>).
- Gerbang pengelola memakai mode Admin atau layout pengelola ministry tersendiri:
  [App.jsx](<D:/ESC Siantan PWA/src/App.jsx:131>).
- Ringkasan beranda membaca jadwal absensi lama dan roster baru secara terpisah:
  [MyMinistryScheduleCard.jsx](<D:/ESC Siantan PWA/src/components/MyMinistryScheduleCard.jsx:36>).

Temuan di atas berasal dari kode lokal, bukan konfirmasi skema production.
Jadwal baru tidak boleh dianggap otomatis sudah terhubung dengan absensi lama.

## 4. Model Produk Yang Disetujui

```text
Template struktur pelayanan (dapat dipakai ulang)
  -> Lembar bulan: Oktober 2026
     -> Kegiatan bersama: tanggal, ibadah/sesi kelas, jam, lokasi
        -> Bagian milik ministry
           -> Posisi + kebutuhan orang + penugasan anggota
           -> Label tim / penanggung jawab / materi / catatan
     -> Dresscode dan catatan per tanggal
```

Satu kegiatan memiliki identitas bersama. Musik dan Multimedia yang mengisi Ibadah Pagi
merujuk kegiatan yang sama, bukan membuat dua ibadah dengan waktu terpisah.
Template menentukan struktur; lembar bulan menyimpan tanggal dan penugasan nyata.
Pergantian template tidak diam-diam mengubah jadwal bulan yang sudah diterbitkan.
Empat tanggal pada gambar adalah contoh, bukan batas; bulan dengan lima Minggu harus muat.
Kegiatan pada hari lain atau kelas dengan tanggal berbeda dapat ditambahkan.

## 5. Tampilan Pengelola

- Pemilih bulan, status, filter ibadah/kelas dan bagian; aksi PDF terpisah dari publikasi.
- Matriks desktop: tanggal pada kolom, nama kegiatan dan posisi pada baris tetap.
- Header kegiatan menampilkan jam mulai-selesai dan lokasi untuk setiap tanggal.
- Baris dikelompokkan menurut kegiatan dan bagian; kepemilikan ministry terlihat jelas.
- Sel posisi membuka pilihan anggota aktif yang berhak dipilih pengelola bagian tersebut.
- Satu sel dapat berisi beberapa anggota, disimpan sebagai penugasan berbeda dengan ID akun.
- Penugasan yang belum lengkap dibedakan dari anggota tidak tersedia dan bagian tidak dipakai.
- Label 'Tim 1' bukan nama orang. Memilih tim tidak boleh otomatis merotasi anggota tanpa aturan.
- Penanggung jawab kegiatan atau tim dibedakan dari hak akses pengelola.
- Materi seperti 'Buah Roh dan Games' disimpan sebagai materi/catatan, bukan ID pelayan.
- Dresscode dapat diisi per tanggal, dengan catatan khusus kegiatan bila diperlukan.
- Di HP, pengelola memakai daftar per tanggal atau matriks yang dapat digeser dengan label tetap.

## 6. Tampilan Anggota

- Halaman membaca jadwal tidak menampilkan pengaturan, pemilih anggota, atau aksi publikasi.
- Anggota tidak memiliki pendaftaran mandiri atau pengajuan tugas; penugasan diisi pengelola.
- 'Jadwal Saya' menampilkan tanggal, kegiatan, waktu, tugas, lokasi, tim, dan dresscode.
- Saat kosong, menu tetap ada dan menyatakan belum ada penugasan; tidak mengarang tugas Minggu.
- Tampilan bulanan bersama dapat disediakan sesuai keputusan lingkup baca lintas ministry.
- Draft tidak terlihat atau memicu pengingat untuk anggota yang bukan pengelola.
- Link notifikasi membuka kegiatan dan tugas yang relevan, termasuk pada lebar HP sekitar 380px.

## 7. Akses Dan Pemisahan Bagian

Tab Akses & Posisi berada pada halaman Jadwal Pelayanan bersama Bulanan dan Template.
Hanya Admin berakses yang dapat membukanya; preview localhost memakai panel yang
sama dengan data fiktif. Identitas MH diambil dari `ministries.head_user_id`.
Admin berakses Ministry menetapkan MH, sedangkan Admin berakses Jadwal Pelayanan
menyetujui grant mengelola jadwal. Wakil tetap dapat disetujui terpisah.

Mengganti atau mengosongkan MH menonaktifkan grant MH lama tanpa membuat grant
baru atau mengubah grant Wakil. V99 tidak menebak kepala dari grant lama: sumber
awal NULL. Grant MH lama baru efektif ketika sumber ditetapkan ke orang yang sama
dan grant itu masih aktif. Mengubah role/status akun dievaluasi ulang saat akses
digunakan. Menetapkan MH tidak mengubah role akun menjadi Admin.

Audit production menemukan policy `ministries_read_all` mengizinkan baca anonim.
V99 membatasi policy baca yang sudah diverifikasi itu ke pengguna login.
Policy tulis Ministry dan approval jadwal tetap terpisah.

| Peran | Kemampuan yang dipertahankan atau dirancang |
| --- | --- |
| Super Admin | Mengelola sesuai kewenangan penuh yang sudah ada. |
| Admin berhak Jadwal Pelayanan | Mengatur template, kegiatan, jam, penugasan, dan publikasi seluruh bulan. |
| Admin tanpa hak halaman | Tidak memperoleh kemampuan tulis dari template baru. |
| MH/Wakil dengan persetujuan Admin | Mengisi penugasan, tim, materi, dan catatan hanya pada bagian ministry yang diizinkan; tidak mengubah struktur/jam atau menerbitkan. |
| MH/Wakil tanpa persetujuan | Tidak dapat mengelola melalui menu maupun akses API langsung. |
| Volunteer | Membaca tugas yang diterbitkan; tidak mendaftar atau mengisi penugasan sendiri. |

Hak akses tidak menyebar ke ministry lain, data jemaat pribadi, atau menu Admin lainnya.
Template dan posisi diatur Admin; MH/Wakil tidak menambah struktur atau posisi.
Pada Draft, data bagian lain tidak diberikan kepada MH/Wakil, termasuk nama pelayan
dan identitas roster bagian tersebut; kerangka kegiatan tetap tampil sebagai sel terkunci.
Jadwal Terbit mengikuti akses baca jadwal yang sudah ada, tanpa menambah akses biodata.
Pembatasan harus ditegakkan di database/layanan, bukan hanya sel terkunci di sketch.

## 8. Bentrok Dan Validasi

- Waktu kegiatan wajib lengkap dan valid, memakai zona WIB/Asia/Jakarta.
- Pemeriksaan lintas bagian menggunakan ID anggota dan rentang waktu kegiatan nyata.
- Rentang berurutan 08.00-09.00 dan 09.00-10.00 tidak bertumpuk.
- Rentang 08.00-10.00 dan 09.00-11.00 bertumpuk walau berbeda ministry atau ibadah.
- Nama kegiatan berbeda pada jam berbeda bukan bentrok hanya karena tanggal sama.
- Beberapa posisi untuk satu anggota dalam kegiatan yang sama ditolak dahulu.
- Tidak tersedia pengecualian bentrok melalui aksi 'tetap tugaskan'.
- Pesan bentrok menyebut tanggal, jam, kegiatan, posisi, dan tugas yang sudah ada.
- Pemeriksaan dilakukan saat menyimpan dan menerbitkan, termasuk penyimpanan bersamaan.
- Perubahan jam kegiatan harus memeriksa ulang seluruh anggota, bukan hanya satu bagian.

Jam contoh pada sketch bersifat ilustratif, bukan jam resmi gereja.
Aturan penolakan mutlak dan larangan rangkap sudah dikonfirmasi operator.
Mengubah aturan kompatibilitas tugas kelak membutuhkan keputusan operator baru.

## 9. Publikasi, Revisi, Pengingat, Dan PDF

Alur disetujui: Admin membuat struktur bulan, pengelola mengisi bagiannya,
kelengkapan/bentrok diperiksa, lalu Admin menerbitkan seluruh bulan sekaligus.
Kegagalan publikasi tidak boleh meninggalkan sebagian bagian dalam status Terbit.
Jadwal Terbit tidak dapat diedit langsung. Pada implementasi awal Admin dapat
membatalkan seluruh bulan, lalu membuat penggantinya tanpa menghapus riwayat.
Revisi langsung dengan versi dan riwayat perubahan tetap di luar implementasi awal.
Menyalin struktur bulan sebelumnya tidak otomatis menyalin nama atau menerbitkan jadwal baru.
Pengingat terbit, perubahan/pembatalan, manual, dan H-1 mengikuti penugasan yang terlihat anggota.
Pengingat tidak memberi jaminan diterima jika izin push atau perangkat tidak tersedia.
Tidak menambahkan endpoint baru atau layanan berbayar dalam PRD ini.

PDF bulanan menyerupai matriks referensi: tanggal, kegiatan, jam, posisi, nama, tim, dan dresscode.
PDF lima tanggal atau banyak baris dapat memakai halaman landscape dengan header berulang.
PDF harus menandai Draft bila diekspor sebelum terbit, tanpa NIK atau data pribadi yang tidak perlu.
Ekspor seluruh bagian oleh MH tidak boleh otomatis membuka bagian yang tidak berhak dibacanya.

## 10. Keputusan Yang Masih Dibutuhkan

1. Apakah nanti ada perubahan lingkup baca/PDF lengkap lintas ministry dari akses yang sudah ada?
2. Apakah revisi langsung jadwal Terbit diperlukan, siapa berhak, dan kapan notifikasi perubahan dikirim?
3. Apakah jadwal baru menjadi sumber absensi, dan bagaimana jadwal lama diperlakukan tanpa menghapus data?

Keputusan template/jam, publikasi seluruh bulan, pengisi penugasan, dan larangan
bentrok/rangkap sudah diberikan. Tiga hal di atas tidak boleh diperluas diam-diam.
Implementasi awal mempertahankan akses baca yang ada dan tidak mengubah sistem absensi.

## 11. Kriteria Penerimaan Dan Tes Manual

- Satu lembar bulan memuat Kids, Pagi, Nextgen, dan kelas dengan identitas kegiatan bersama.
- Bulan empat/lima Minggu tampil utuh; tanggal dan jam tidak berubah karena zona waktu.
- Beberapa nama dalam satu posisi tidak menghapus penugasan sebelumnya; materi tidak menjadi nama akun.
- MH Musik dapat mengisi Musik, tetapi gagal mengubah Multimedia melalui UI dan API langsung.
- Pencabutan akses berlaku untuk sesi aktif; akun tidak aktif tidak dapat dipilih atau mengelola.
- Admin/Super Admin di tampilan jemaat tidak mendapatkan menu pengelola hanya karena role.
- Volunteer tanpa penugasan tetap mendapat menu baca dan keadaan kosong yang jelas.
- Volunteer tidak dapat mengisi nama sendiri atau orang lain, termasuk melalui API langsung.
- Ibadah berbeda dengan jam tidak bertumpuk lolos; jam bertumpuk lintas bagian terdeteksi.
- Perubahan jam dan dua pengelola menugaskan anggota bersamaan mengikuti aturan bentrok yang disetujui.
- Draft dan materi yang belum dipublikasikan tidak bocor ke pembaca tanpa hak.
- Notifikasi menuju tugas yang benar dan tidak mengirim Draft atau perubahan yang belum disetujui.
- PDF empat/lima tanggal dapat dibaca, memiliki header/halaman lengkap, dan sesuai lingkup hak baca.
- HP sekitar 380px dan desktop tidak menimpa teks, tombol, atau label baris.
- Integrasi absensi lama diuji hanya setelah keputusan transisi, tanpa penghapusan riwayat otomatis.

Implementasi lokal dimulai setelah persetujuan PRD/sketch dan keputusan operator di atas.
Rilis production tetap membutuhkan ritual verifikasi dan izin commit/push terpisah.

## 12. Artifact Rancangan

- [Sketch interaktif](<D:/ESC Siantan PWA/docs/sketch-jadwal-pelayanan-bulanan.html>).
- [Preview desktop](<D:/ESC Siantan PWA/docs/sketch-jadwal-pelayanan-bulanan.png>).
- [Preview mobile](<D:/ESC Siantan PWA/docs/sketch-jadwal-pelayanan-bulanan-mobile.png>).

Sketch menggunakan nama, data penugasan, dan jam fiktif untuk memperagakan alur.
Mode Admin memperagakan edit seluruh bagian; MH Musik edit bagian Musik saja;
Volunteer membaca contoh tugas Terbit yang terpisah dari Draft pengelola.
Perubahan Draft tidak muncul pada tampilan Volunteer. Ini demonstrasi rancangan,
bukan implementasi akses atau publikasi production.
Nama Draft lintas ministry yang terlihat dalam prototype merupakan usulan visual,
bukan keputusan izin baca production, persetujuan pembukaan data, atau bukti RLS.

### Batas Prototype

- Prototype hanya memperagakan tanggal Minggu, termasuk contoh Kelas; tanggal hari lain
  tetap lingkup PRD tetapi belum ditampilkan di sketch.
- Jam dan PIC tampil tetap; editor struktur kegiatan, waktu, dan penanggung jawab belum dibuat.
- Aksi Simpan yang menahan bentrok adalah ilustrasi, bukan keputusan kebijakan pengecualian.
- Tidak ada publikasi, koneksi database, absensi, atau pengiriman notifikasi aktual.
- Tombol PDF membuka dialog cetak browser, bukan bukti hasil ekspor PDF production.

Pemeriksaan Playwright lokal oleh agen utama mencakup asset offline/logo/ikon, empat/lima Minggu,
MH Musik edit bagiannya dan bagian lain hanya baca, Volunteer contoh Terbit dan keadaan kosong,
pemilihan beberapa nama/pencarian/simpan, peringatan jam bentrok antaribadah, filter,
aksi window.print dan cetak empat kolom, mobile 375/390px tanpa overflow halaman, serta dark mode.
Pemeriksaan ini hanya untuk sketch lokal, bukan pengujian aplikasi atau deployment production.

### Review Manual Sketch

1. Buka mode Admin, periksa blok ibadah/kelas, tanggal, jam, tim, materi, dan dresscode.
2. Pilih mode MH Musik; coba sel Musik dan pastikan bagian lain tidak dapat diedit.
3. Pilih beberapa anggota dan coba contoh jam bertumpuk; telaah pesan sebelum Simpan.
4. Beralih ke Volunteer; pastikan contoh Terbit tidak berubah akibat edit Draft dan lihat keadaan kosong.
5. Periksa bulan empat/lima Minggu, filter, tampilan HP, dan dialog cetak/PDF.
6. Untuk meninjau implementasi, gunakan preview localhost dan panduan pengujian di bawah.

## 13. Implementasi Dan Pengujian Lokal

- [Preview localhost](http://127.0.0.1:5173/schedule-preview.html).
- [Panduan uji lokal dan prarilis](<D:/ESC Siantan PWA/docs/TEST-JADWAL-BULANAN.md>).
- Halaman preview memasang workspace React yang sama dengan halaman pengelola,
  tetapi menginjeksi adapter memori dengan nama, akun, dan jam fiktif.
- Tidak menggunakan login production, Supabase, API push, atau data jemaat sungguhan.
- Data jadwal preview hilang saat halaman dimuat ulang; tema/bahasa mengikuti
  penyimpanan preferensi aplikasi. Tombol reset memulihkan fixture awal.
- Tujuh tes adapter lokal lulus: isolasi jaringan, snapshot template, akses tiap peran,
  Draft tersembunyi, penugasan beberapa nama atomik, snapshot usang, bentrok/rangkap,
  rentang berurutan, lima Minggu, dan pengganti bulan yang dibatalkan.
- Sebelas alur Playwright localhost lulus pada desktop 1440px dan HP 390px:
  empat kegiatan, beberapa nama/pencarian, larangan rangkap, pengelolaan MH Musik,
  Volunteer tanpa jadwal, publikasi seluruh bulan, lima Minggu/tanggal Sabtu,
  editor template/jam, bentrok antaribadah, PDF Draft, tampilan HP dan tema gelap.
- Semua request non-localhost dan endpoint API diblokir selama tes browser;
  tidak ada request terlarang atau error JavaScript yang teramati.
- Screenshot desktop, HP terang/gelap, dan Volunteer tersedia di
  [hasil uji lokal](<D:/ESC Siantan PWA/docs/local-schedule-tests/>).
  Screenshot diperiksa agar tidak kosong dan tidak overflow horizontal.

Tampilan Volunteer dalam preview adalah pembaca fixture yang terisolasi, bukan
pengujian halaman Volunteer production dengan login nyata. Hasil ini juga bukan
bukti RLS production, migrasi production sudah dijalankan, push berhasil diterima,
cron H-1 bekerja, atau integrasi absensi selesai.

Preview memori tidak memerlukan migrasi database. Operator melaporkan v98 dan
v99 sudah diterapkan. Sebelum menguji penetapan MH pada aplikasi nyata, audit
keanggotaan production lalu jalankan Migrasi v100 di Supabase SQL Editor.

### Verifikasi Akhir 3 Oktober 2026

- `npm run check` lulus: lint, 145 tes, dan build production.
- Tautan pengelola dengan roster bulanan membuka matriks bulan asal; roster lama
  tetap membuka editor individual. Parameter URL lain dipertahankan.
- PDF empat/lima tanggal diperiksa pada hasil render dua halaman A3 landscape.
  Kegiatan besar boleh berlanjut dengan header tanggal/ibadah/jam yang diulang.
- Notifikasi bulanan memakai endpoint existing dalam halaman 24 roster, tanpa
  menambah Serverless Function. Batas kuota tetap berlaku, dengan jeda retry terbatas.
  Admin dapat mengirim pengingat seluruh bulan yang sudah Terbit.
- Hasil audit fungsi v98 dan sumber v99 pernah diterima; audit keanggotaan MH
  production masih diperlukan sebelum menjalankan v100. Tes lokal tidak
  membuktikan keadaan database production.
- Login production, penerimaan push perangkat nyata, durasi invokasi server,
  join PostgREST nyata, dan race multi-session belum dibuktikan oleh tes lokal.
