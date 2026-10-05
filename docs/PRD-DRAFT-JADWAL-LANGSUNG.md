# PRD Draft Jadwal Pelayanan Langsung

Status: keputusan produk disetujui 5 Oktober 2026; implementasi dan tes lokal selesai.
Operator melaporkan Migrasi v102 dan v103 berhasil dijalankan di production.
Rujukan: jadwal bulanan bergaya spreadsheet dan keputusan operator dalam percakapan.

## Tujuan

Admin dapat membuat satu Draft bulanan tanpa lebih dahulu membuat Template.
Ibadah/kelas, jam, dan Ministry boleh berbeda pada setiap tanggal. MH/Wakil
yang diberi akses Admin kemudian memilih anggota untuk posisi Ministry-nya.
Nama pelayan tetap diisi oleh pengelola, bukan didaftarkan sendiri oleh anggota.

## Alur Utama

1. Admin berakses Jadwal Pelayanan memilih bulan dan membuka Buat Draft Bulanan.
2. Tanggal Minggu pada bulan itu disediakan sebagai awal; Admin boleh menambah
   tanggal lain dalam bulan yang sama atau menghapus tanggal yang tidak dipakai.
3. Pada setiap tanggal Admin menambah ibadah, kelas, atau event beserta jam
   mulai-selesai dan Ministry yang benar-benar melayani. Susunan boleh berbeda
   dari tanggal lain. Salin kegiatan tanggal sebelumnya mempercepat pengisian.
4. Sistem mengambil posisi aktif dan kapasitas standar dari katalog setiap
   Ministry yang dipilih. Ministry tanpa posisi aktif tidak dapat dimasukkan.
5. Draft menampilkan matriks tanggal dan posisi dengan slot nama kosong.
   MH/Wakil yang memiliki grant hanya mengisi bagian Ministry-nya; Admin
   berakses Jadwal dapat mengisi seluruh bagian.
6. Admin memeriksa kelengkapan lalu menerbitkan seluruh bulan secara atomik.
   Volunteer hanya membaca penugasan yang sudah diterbitkan.

## Sketsa Alur

    Bulan: Oktober 2026                         [Buat Draft Bulanan]
    4 Okt  | Ibadah Kids 08.00-09.00  | Kids, Worship
    4 Okt  | Ibadah Pagi 09.00-11.00  | Worship, Multimedia
    11 Okt | Ibadah Pagi 09.00-11.00  | Worship
             [Salin dari tanggal sebelumnya] [Tambah kegiatan]

    Setelah Draft tersimpan:
    Ibadah Pagi | Worship | WL     | [Pilih anggota]
                             Singer | [Pilih anggota]
                             Drum   | [Pilih anggota]

Sketsa menunjukkan tindakan, bukan jam resmi gereja. Satu Ministry hanya
dipilih pada tanggal/ibadah ketika benar-benar melayani; tanggal lain tidak
menampilkan slot kosong palsu.

## Aturan Dan Batas Akses

- Hanya Admin Aktif dengan Hak Akses Jadwal Pelayanan mengatur tanggal,
  ibadah/kelas, jam, Ministry, dan publikasi bulan.
- MH/Wakil non-Admin tetap memerlukan persetujuan akses terpisah dan hanya
  mengisi anggota pada posisi Ministry yang dikelolanya. Jabatan MH pada
  akun Admin tidak memberi hak tambahan.
- Penugasan anggota harus memakai akun aktif; bentrok waktu antaribadah dan
  rangkap posisi pada kegiatan sama ditolak oleh database tanpa override.
- Jam kegiatan wajib jelas. Perubahan jam setelah ada penugasan tetap
  mengikuti penjaga bentrok dan aturan Draft yang sudah ada.
- Publikasi tidak boleh lolos jika suatu bagian Ministry sama sekali tidak
  memiliki pelayan. Kekurangan slot lain mengikuti konfirmasi Admin yang
  sudah ada.
- Kolom Tim dan Materi serta editor bagian Ministry tidak tampil pada alur
  baru. Data lama tidak dihapus dan jadwal Terbit lama tetap dapat dibaca.
- Tab Roster Sebelumnya dihapus dari panel pengelola. Tautan langsung ke
  roster lama tetap membuka detail baca-saja, lalu kembali ke lembar bulanan.
  Aplikasi tidak lagi menawarkan pembuatan roster satuan dari panel ini.
- Ekspor PDF, pengingat, tampilan Volunteer, serta tautan tugas tetap memakai
  roster/slot yang sama, bukan sumber penugasan kedua.
- KEPUTUSAN OPERATOR: Admin berakses Jadwal boleh menghapus seluruh bulan
  berstatus Draft lalu membuat ulang. Konfirmasi wajib menyebut jumlah
  penugasan yang ikut terhapus; bila jumlah berubah sebelum eksekusi,
  penghapusan ditolak dan Admin memuat ulang. Bulan Terbit tidak bisa dihapus.
- KEPUTUSAN OPERATOR: katalog posisi dan kapasitas hanya boleh diubah oleh
  Admin berakses Jadwal. MH/Wakil tetap boleh memilih anggota pada posisi
  Ministry yang sudah tersedia, tetapi tidak mengubah strukturnya.

## Kompatibilitas Dan Verifikasi

Database saat ini mewajibkan referensi Template pada bulan. Migrasi v102
menyediakan pembuatan Draft langsung dalam satu transaksi dan mempertahankan
relasi teknis itu tanpa meminta Admin mengelola Template. Fungsi lama tetap
ada untuk membaca jadwal yang telah dibuat. Tidak ada SQL production yang
dijalankan oleh agen. Audit baca-saja production yang dikirim operator pada
5 Oktober cocok untuk tujuh tabel, delapan fungsi, trigger, policy, constraint,
dan indeks jadwal yang diperiksa; audit tidak mencakup setiap helper atau ACL.

Verifikasi lokal: `npm run check` lulus (219 tes, lint, build) dan
`scripts/test-monthly-schedule-local.mjs` lulus 17 alur di localhost tanpa
request ke production. Tampilan Draft diuji pada HP 390px dan matriks/panel
akses pada 375/390px termasuk mode gelap.

Migrasi lanjutan v103 menyiapkan RPC penghapusan Draft dan mempersempit policy
katalog posisi yang terverifikasi pada audit production. Kedua keputusan ini
disetujui operator setelah audit 5 Oktober. Operator melaporkan v102 dan v103
berhasil dijalankan berurutan di Supabase SQL Editor; agen tidak menjalankan
atau memeriksa perubahan production secara langsung. Kode aplikasi masih perlu
dirilis dan alurnya diuji dengan akun nyata.

Uji lokal minimal: empat dan lima Minggu, tanggal tambahan, beberapa ibadah
pada satu tanggal, variasi Ministry/jam antar-Minggu, posisi otomatis,
Ministry tanpa posisi, bentrok lintas kegiatan, pembatasan MH, publikasi
atomik, PDF, tampilan HP, serta jadwal lama.
