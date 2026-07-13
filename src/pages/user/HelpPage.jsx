import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { GradientHeader, Spinner } from '@/components/ui'
import { useNavigate } from 'react-router-dom'

// Konten panduan per role (embedded langsung, tidak fetch eksternal)
const PANDUAN_JEMAAT = `
# Panduan Jemaat

## Memulai

### Login dan Registrasi

**Mendaftar Akun Baru:**
1. Buka aplikasi di browser (https://escsiantan.my.id)
2. Ketuk "Daftar" di halaman login
3. Isi data diri lengkap
4. Tunggu persetujuan admin

**Login:**
- Gunakan email atau nomor HP yang sudah terdaftar
- Ketuk "Masuk"

**Lupa Password:**
1. Ketuk "Lupa Password"
2. Masukkan nomor HP terdaftar
3. Kode OTP dikirim via WhatsApp
4. Masukkan OTP dan buat password baru

---

## Menu Utama

Aplikasi memiliki 5 menu di bagian bawah:

- **Beranda** - Halaman utama dengan ringkasan informasi
- **Info** - Pengumuman dan kelas
- **Scan** - Scan QR untuk absensi (tombol tengah)
- **SOP Rohani** - Tugas untuk volunteer
- **Profil** - Data diri dan pengaturan

---

## Beranda

Menampilkan:

### Menu Cepat
Akses cepat ke fitur utama:
- **Persembahan** - Catat dan kirim persembahan
- **Events** - Lihat dan daftar kegiatan
- **Kelas** - Lihat dan daftar kelas
- **Buku** - Program disiplin baca
- **Baptisan** - Daftar baptisan
- **Pemberkatan Nikah** - Daftar pernikahan
- **Penyerahan Anak** - Daftar penyerahan anak
- **KTJ** - Ajukan Kartu Tanda Jemaat
- **Status Pendaftaran** - Cek status pendaftaran

### Kartu Pesan
- Pesan dari Gembala
- Ucapan ulang tahun

### Ringkasan
- Jadwal pelayanan (untuk volunteer)
- Total poin
- Kehadiran bulan ini

---

## Scan QR

Untuk mencatat kehadiran:

1. Ketuk tombol **Scan** (tombol oranye di tengah)
2. Izinkan akses kamera
3. Arahkan kamera ke QR code
4. Tunggu konfirmasi
5. Dapat +1 poin otomatis

Bisa untuk scan:
- Absensi kelas
- Absensi event
- Absensi ibadah minggu
- Absensi komsel
- Penukaran poin hadiah

---

## Persembahan

Mencatat persembahan pribadi:

1. Buka menu Persembahan
2. Pilih kategori (Perpuluhan, Syukur, Misri, dll)
3. Masukkan jumlah
4. Tambah catatan (opsional)
5. Upload bukti transfer
6. Ketuk "Kirim"

**Status:**
- Menunggu - Belum dikonfirmasi admin
- Dikonfirmasi - Sudah diterima
- Ditolak - Cek catatan penolakan

---

## Events

Melihat dan mendaftar kegiatan gereja:

1. Buka halaman Events
2. Lihat daftar event
3. Ketuk event untuk detail
4. Ketuk "Daftar" jika ingin ikut
5. Scan QR saat hadir untuk dapat poin

---

## Kelas

Kelas pembinaan dan pelatihan:

1. Buka halaman Kelas
2. Pilih status: Mulai / Sedang Berlangsung / Selesai
3. Ketuk kelas untuk detail dan daftar
4. Absen setiap pertemuan dengan scan QR

---

## Buku (Disiplin Baca)

Program baca buku rohani:

### Melihat Buku
- Daftar buku program gereja
- Progres bacaan Anda

### Mencatat Progres
1. Buka buku yang sedang dibaca
2. Ketuk "Setor Poin Bacaan"
3. Masukkan halaman yang dicapai
4. Tulis pesan/refleksi
5. Ketuk "Kirim"

Progres otomatis terupdate ke halaman tertinggi.

---

## Pendaftaran Sakramen

### Baptisan
1. Buka menu Baptisan
2. Isi data diri
3. Upload foto dan dokumen
4. Tunggu persetujuan admin
5. Cek status di Status Pendaftaran

### Pemberkatan Nikah
1. Buka menu Pemberkatan Nikah
2. Isi data mempelai pria dan wanita
3. Upload dokumen
4. Tunggu persetujuan

### Penyerahan Anak
1. Buka menu Penyerahan Anak
2. Isi data anak dan orang tua
3. Upload dokumen
4. Tunggu persetujuan

---

## KTJ (Kartu Tanda Jemaat)

Mengajukan kartu anggota:

1. Buka menu KTJ
2. Upload pas foto
3. Isi data lengkap
4. Pilih komsel
5. Ketuk "Kirim Pengajuan"
6. Tunggu admin proses

---

## Poin

Mengumpulkan dan menukar poin:

### Cara Dapat Poin
- Scan QR absensi: +1 poin
- Lengkapi biodata: +5 poin (sekali)

### Menukar Poin
1. Buka halaman Poin
2. Lihat daftar hadiah
3. Ketuk hadiah yang diinginkan
4. Ketuk "Tukar" jika poin cukup
5. Tiket penukaran muncul
6. Tunjukkan QR tiket ke admin untuk klaim

---

## Sertifikat

Melihat sertifikat yang sudah diterbitkan:

1. Buka menu Sertifikat (di Profil > Pengaturan)
2. Lihat daftar sertifikat
3. Ketuk untuk lihat detail
4. Download jika diperlukan

---

## Profil

Mengelola data diri:

### Edit Profil
1. Buka Profil
2. Ketuk "Edit Profil"
3. Ubah data yang diperlukan
4. Upload foto profil (opsional)
5. Simpan

### Pengaturan
- **Mode Gelap** - Aktifkan/nonaktifkan
- **Notifikasi** - Kelola pengaturan push
- **Bahasa** - Pilih Indonesia atau English
- **Ubah Password** - Ganti kata sandi

---

## Tips

1. **Pasang sebagai Aplikasi** - Tambahkan ke layar utama HP
2. **Izinkan Notifikasi** - Dapat pengingat event
3. **Lengkapi Profil** - Dapat 5 poin bonus
4. **Scan QR Setiap Hadir** - Kumpulkan poin

---

## Bantuan

Jika mengalami kendala:
- Hubungi admin gereja
- Kunjungi sekretariat gereja
- Gunakan menu Help ini untuk panduan
`

const PANDUAN_VOLUNTEER = `
# Panduan Volunteer

## Tentang Role Volunteer

- Volunteer = jemaat yang aktif melayani
- Akses ke semua fitur Jemaat
- Akses tambahan: **SOP Rohani**

Lihat panduan Jemaat untuk fitur dasar (Persembahan, Events, Kelas, dll).

---

## SOP Rohani

Menu SOP Rohani berisi tugas dan form pelayanan.

### Mengakses
1. Ketuk menu **SOP Rohani** di navigasi bawah
2. Lihat daftar tugas

### Struktur

**Folder Kategori:**
- Tugas dikelompokkan dalam folder berwarna
- Ketuk folder untuk buka
- Ketuk lagi untuk tutup

**Daftar Tugas:**
Setiap tugas menampilkan:
- Nama tugas
- Jadwal (Mingguan/Bulanan)
- Progres (misal: 2/5 selesai)
- Status

---

## Mengerjakan Tugas

1. Ketuk tugas yang ingin dikerjakan
2. Lihat detail dan form
3. Isi setiap pertanyaan
4. Upload lampiran jika ada
5. Ketuk "Kirim"

Progres otomatis terupdate.

### Status Tugas

- **Belum Selesai** - Progres < target
- **Selesai** - Progres = target
- **Proses** - Sedang dikerjakan

---

## Izin/Sakit

Jika tidak bisa melayani:

1. Buka menu SOP Rohani
2. Ketuk "Izin/Sakit" di pojok atas
3. Pilih jenis: Izin atau Sakit
4. Isi tanggal mulai dan selesai
5. Tulis alasan
6. Upload bukti (surat dokter, dll) jika ada
7. Ketuk "Ajukan"

**Status:**
- Menunggu - Belum direview
- Disetujui - Bisa istirahat
- Ditolak - Cek catatan admin

Selama izin disetujui, tugas tidak dihitung.

---

## Jadwal Pelayanan

Di Beranda, volunteer akan melihat:

**Jadwal Pelayanan Minggu Ini:**
- Tanggal dan waktu
- Ministry yang dijadwalkan
- Ketuk untuk detail

---

## Tips untuk Volunteer

1. **Kerjakan Tugas Tepat Waktu** - Cek target mingguan/bulanan
2. **Upload Bukti yang Jelas** - Foto/file lampiran
3. **Ajukan Izin Lebih Awal** - Jangan mendadak
4. **Scan Absensi Setiap Hadir** - Dapat poin

---

## Bantuan

Jika ada kendala:
- Hubungi PKS ministry
- Hubungi admin gereja
`

const PANDUAN_PKS = `
# Panduan PKS

## Tentang Role PKS

- PKS = Pengurus Komsel Siantan
- Akses ke semua fitur Volunteer dan Jemaat
- Akses tambahan: **Panel PKS**

---

## Mengakses Panel PKS

1. Login dengan akun PKS
2. Di Beranda, ketuk "Panel PKS"
3. Masuk ke dashboard PKS

---

## Navigasi Panel PKS

6 tab utama:

- **Anggota** - Kelola anggota komsel
- **Absensi** - Catat kehadiran
- **Ulang Tahun** - Ucapan ulang tahun
- **Persembahan** - Catat persembahan komsel
- **Evaluasi** - Progres SOP anggota
- **Profil** - Kelola profil PKS

---

## Tab Anggota

### Melihat Anggota
- Daftar lengkap anggota komsel
- Foto, nama, dan status
- Ketuk untuk detail

### Detail Anggota
- Data pribadi (nama, HP, email)
- Tanggal lahir dan usia
- Alamat dan sosial media
- Status keanggotaan

### Menambah Anggota
1. Ketuk tombol "+"
2. Isi data anggota
3. Simpan

### Mengeluarkan Anggota
1. Buka detail anggota
2. Gulir ke bawah
3. Ketuk "Keluarkan dari Komsel"
4. Konfirmasi

---

## Tab Absensi

### Scan QR Komsel
1. Ketuk "Scan QR"
2. Generate QR code sesi komsel
3. Anggota scan untuk absen
4. Otomatis dapat poin

### Checklist Manual
1. Pilih tanggal
2. Centang anggota yang hadir
3. Simpan

**Catatan:** Checklist manual TIDAK memberi poin (hanya scan QR yang beri poin).

### Riwayat Absensi
- Daftar sesi yang sudah dilaksanakan
- Jumlah hadir vs total
- Ketuk untuk detail

---

## Tab Ulang Tahun

### Melihat Ulang Tahun
- Daftar anggota yang berulang tahun
- Dikelompokkan per bulan
- Urut dari terdekat

### Mengirim Ucapan
1. Ketuk anggota
2. Tulis pesan ucapan
3. Ketuk "Kirim Ucapan"
4. Pesan dikirim via WhatsApp

Sistem otomatis kirim notifikasi ke PKS saat ada yang berulang tahun.

---

## Tab Persembahan Komsel

### Mencatat Persembahan
1. Pilih kategori
2. Masukkan jumlah
3. Tambah catatan
4. Upload bukti transfer
5. Ketuk "Kirim"

### Riwayat
- Semua persembahan komsel
- Status: Menunggu / Dikonfirmasi / Ditolak
- Total per bulan

---

## Tab Evaluasi

Melihat progres SOP anggota volunteer.

### Status SOP
- **TERPENUHI** - Semua tugas selesai
- **PROSES** - Sedang mengerjakan
- **KOSONG** - Belum ada progres
- **IZIN** - Sedang izin/sakit

### Rincian
Ketuk anggota untuk lihat:
- Tugas yang sudah dikerjakan
- Tugas yang belum selesai
- Target vs aktual

### Tindak Lanjut
- Ingatkan anggota yang tertinggal
- Follow up via WhatsApp
- Catat dalam evaluasi

---

## Tab Profil PKS

### Melihat Profil
- Nama PKS
- Komsel yang dipimpin
- Status keanggotaan

### Keluar dari Panel
Ketuk "Keluar" untuk kembali ke tampilan Jemaat.

---

## Tips untuk PKS

1. **Update Data Anggota** - Pastikan data terbaru
2. **Catat Absensi Rutin** - Setiap pertemuan
3. **Pantau Ulang Tahun** - Kirim tepat waktu
4. **Follow Up SOP** - Ingatkan yang tertinggal
5. **Komunikasi Baik** - Bangun hubungan dengan anggota

---

## Bantuan

Jika ada kendala:
- Hubungi admin gereja
- Kunjungi sekretariat
`

const PANDUAN_ADMIN = `
# Panduan Admin

## Tentang Role Admin

- Admin = pengelola sistem aplikasi
- Akses ke semua fitur Jemaat, Volunteer, PKS
- Akses penuh: **Panel Admin**

### Jenis Admin

**Admin Biasa:**
- Akses sesuai Hak Akses
- Bisa read semua, write sesuai izin

**Super Admin:**
- Akses penuh semua halaman
- Bisa atur Hak Akses
- Akses: Backup, Audit, Kategori Tugas

---

## Mengakses Panel Admin

1. Login dengan akun admin
2. Buka URL: \`/admin\`
3. Atau dari Profil > "Panel Admin"

---

## Menu Panel Admin

### Utama
- **Dashboard** - Ringkasan statistik
- **Jemaat** - Kelola data jemaat

### Konten
- **Berita & Info** - Kelola pengumuman
- **Events** - Kelola kegiatan
- **Kelas** - Kelola kelas pembinaan
- **Buku** - Kelola buku program baca
- **Roadmap Pemuridan** - Tahapan pemuridan
- **Ibadah Minggu** - Kelola jadwal ibadah

### Pelayanan
- **Tugas & Form** - Kelola SOP volunteer
- **Respon SOP** - Lihat jawaban form
- **Baptisan** - Kelola pendaftaran
- **Pemberkatan Nikah** - Kelola pernikahan
- **Penyerahan Anak** - Kelola penyerahan
- **KTJ** - Kelola kartu jemaat
- **Sertifikat** - Terbitkan sertifikat
- **Pelayanan** - Kelola jadwal ministry

### Organisasi
- **SP** - Surat Peringatan
- **Ministry** - Kelola ministry
- **Komsel** - Kelola komsel dan PKS
- **Persembahan** - Kelola persembahan
- **Poin** - Kelola hadiah dan penukaran
- **Cuti/Izin** - Kelola izin volunteer

### Super Admin Only
- **Hak Akses** - Atur akses admin
- **Kategori Tugas** - Kelola kategori
- **Backup** - Backup data
- **Audit** - Log aktivitas

---

## Fitur Utama

### Jemaat

**Melihat Daftar:**
- Filter berdasarkan status, ministry, komsel
- Cari berdasarkan nama, HP, email

**Menambah Jemaat:**
1. Ketuk "Tambah"
2. Isi data lengkap
3. Simpan

**Mengedit:**
1. Buka detail jemaat
2. Ketuk "Edit"
3. Ubah data
4. Simpan

**Mengubah Status:**
- Aktif / Tidak Aktif / Menunggu Persetujuan
- Approve pendaftaran baru

**Mengubah Role (Super Admin):**
- Jemaat / Volunteer / PKS / Admin / Super Admin

---

### Berita & Info

1. Ketuk "Tambah Berita"
2. Isi judul dan konten
3. Upload gambar (opsional)
4. Set status: Draft / Terbit
5. Simpan

---

### Events

**Membuat Event:**
1. Ketuk "Tambah Event"
2. Isi data: nama, tanggal, lokasi, deskripsi
3. Upload poster
4. Set status pendaftaran
5. Simpan

**Mengelola Pendaftaran:**
- Lihat daftar pendaftar
- Export ke Excel
- Kirim notifikasi

**Absensi Event:**
- Generate QR code
- Scan kehadiran peserta

---

### Kelas

Sama seperti Events, plus:

**Absensi Kelas:**
- Generate QR per sesi
- Lihat kehadiran per pertemuan
- Export rekap

---

### Tugas & Form

**Membuat Template Form:**
1. Ketuk "Tambah Template"
2. Isi data form: nama, kategori, jadwal
3. Tambah pertanyaan (teks/pilihan/file)
4. Simpan

**Melihat Jawaban:**
- Buka form > tab "Jawaban"
- Filter berdasarkan tanggal, volunteer
- Export ke Excel

---

### Pendaftaran Sakramen

**Baptisan / Nikah / Penyerahan Anak:**

1. Buka halaman pendaftaran
2. Pilih pendaftaran
3. Review data dan dokumen
4. Ubah status:
   - Disetujui
   - Ditolak (isi alasan)
   - Selesai
5. Terbitkan sertifikat jika sudah selesai

---

### KTJ

1. Buka daftar pengajuan
2. Review data dan foto
3. Verifikasi keanggotaan
4. Ubah status: Disetujui / Ditolak
5. Cetak kartu untuk jemaat

---

### Sertifikat

**Menerbitkan:**
1. Ketuk "Tambah Sertifikat"
2. Pilih jemaat penerima
3. Pilih jenis sertifikat
4. Isi judul dan catatan
5. Upload file sertifikat
6. Simpan

---

### Ministry

1. Ketuk "Tambah Ministry"
2. Isi nama dan deskripsi
3. Simpan

**Mengelola Anggota:**
- Tambah anggota ke ministry
- Hapus anggota
- Set jadwal pelayanan

---

### Komsel

**Membuat Komsel:**
1. Ketuk "Tambah Komsel"
2. Isi nama dan kapasitas
3. Simpan

**Mengelola PKS:**
- Tetapkan PKS dengan ikon mahkota
- Bisa lebih dari satu PKS per komsel

---

### Persembahan

**Memverifikasi:**
1. Buka detail persembahan
2. Cek bukti transfer
3. Ubah status: Dikonfirmasi / Ditolak
4. Tambah catatan jika ditolak

**Rekap:**
- Export ke Excel
- Ringkasan per kategori
- Grafik per bulan

---

### Poin

**Kelola Hadiah:**
1. Buka menu "Poin" > "Hadiah"
2. Tambah produk hadiah
3. Set poin yang dibutuhkan
4. Upload gambar

**Penukaran:**
- Lihat tiket penukaran
- Scan QR tiket untuk verifikasi
- Tandai sebagai ditebus

---

### Hak Akses (Super Admin)

1. Buka menu "Hak Akses"
2. Pilih admin yang ingin diatur
3. Centang halaman yang boleh diakses
4. Simpan

**Keterangan:**
- Centang kosong = akses penuh
- Centang beberapa = hanya halaman tertentu
- Hak Akses untuk WRITE; READ bebas

---

### Backup (Super Admin)

1. Buka menu "Backup"
2. Ketuk "Download Backup"
3. File SQL akan diunduh

Lakukan backup berkala untuk cadangan.

---

### Audit Log (Super Admin)

Melihat semua aktivitas admin:
- Login/logout
- Perubahan data jemaat
- Perubahan status pendaftaran
- Perubahan role dan hak akses
- Penghapusan data

Filter berdasarkan tanggal, user, aksi.

---

## Tips untuk Admin

### Manajemen Data
1. **Backup Rutin** - Download backup berkala
2. **Update Data** - Pastikan data terbaru
3. **Verifikasi Teliti** - Cek dokumen sebelum approve

### Keamanan
1. **Jangan Bagikan Kredensial** - Akun pribadi
2. **Hati-hati Hak Akses** - Hanya Super Admin yang ubah
3. **Cek Audit Log** - Pantau aktivitas

### Komunikasi
1. **Respons Cepat** - Jangan tumpuk pendaftaran
2. **Berikan Feedback** - Jelaskan alasan jika tolak
3. **Koordinasi PKS** - Dukung pelayanan

---

## Bantuan

Jika ada kendala teknis:
- Hubungi Super Admin
- Cek dokumentasi teknis
- Hubungi developer jika perlu
`

function HelpPage() {
  const { profile } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    
    // Tentukan panduan berdasarkan role tertinggi
    let panduan = PANDUAN_JEMAAT
    const role = profile.role || 'Jemaat'
    const roleSecondary = profile.role_secondary
    
    if (role === 'Super Admin' || role === 'Admin') {
      panduan = PANDUAN_ADMIN
    } else if (role === 'PKS' || roleSecondary === 'PKS' || profile.is_pks) {
      panduan = PANDUAN_PKS
    } else if (role === 'Volunteer') {
      panduan = PANDUAN_VOLUNTEER
    }
    
    setContent(panduan)
    setLoading(false)
  }, [profile])

  // Render markdown sederhana (tanpa library tambahan)
  const renderMarkdown = (md) => {
    const lines = md.trim().split('\n')
    const elements = []
    let currentList = null
    let currentListItems = []

    const flushList = () => {
      if (currentList && currentListItems.length > 0) {
        elements.push(
          <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 mb-4 text-gray-700 ml-4">
            {currentListItems.map((item, i) => (
              <li key={i} className="text-sm leading-relaxed">{item}</li>
            ))}
          </ul>
        )
        currentListItems = []
        currentList = null
      }
    }

    lines.forEach((line, idx) => {
      // Header H1
      if (line.startsWith('# ')) {
        flushList()
        elements.push(<h1 key={idx} className="text-2xl font-bold text-gray-900 mb-3 mt-6">{line.slice(2)}</h1>)
      }
      // Header H2
      else if (line.startsWith('## ')) {
        flushList()
        elements.push(<h2 key={idx} className="text-xl font-semibold text-gray-800 mb-2 mt-5">{line.slice(3)}</h2>)
      }
      // Header H3
      else if (line.startsWith('### ')) {
        flushList()
        elements.push(<h3 key={idx} className="text-lg font-semibold text-gray-700 mb-2 mt-4">{line.slice(4)}</h3>)
      }
      // List item
      else if (line.match(/^[-*]\s/)) {
        currentList = true
        currentListItems.push(line.slice(2))
      }
      // Horizontal rule
      else if (line.trim() === '---') {
        flushList()
        elements.push(<hr key={idx} className="my-4 border-gray-200" />)
      }
      // Bold text inline (basic support)
      else if (line.trim().startsWith('**') && line.trim().endsWith('**')) {
        flushList()
        const text = line.trim().slice(2, -2)
        elements.push(<p key={idx} className="font-semibold text-gray-800 mb-2">{text}</p>)
      }
      // Numbered list
      else if (line.match(/^\d+\.\s/)) {
        flushList()
        const text = line.replace(/^\d+\.\s/, '')
        if (currentList === 'ol') {
          currentListItems.push(text)
        } else {
          flushList()
          currentList = 'ol'
          currentListItems = [text]
        }
      }
      // Regular paragraph
      else if (line.trim()) {
        if (currentList === 'ol') {
          // Continue numbered list
          if (line.match(/^\d+\.\s/)) {
            currentListItems.push(line.replace(/^\d+\.\s/, ''))
          } else {
            flushList()
            elements.push(<p key={idx} className="text-sm text-gray-700 mb-3 leading-relaxed">{line}</p>)
          }
        } else {
          flushList()
          elements.push(<p key={idx} className="text-sm text-gray-700 mb-3 leading-relaxed">{line}</p>)
        }
      }
      // Empty line
      else {
        if (currentList === 'ol') {
          elements.push(
            <ol key={`ol-${elements.length}`} className="list-decimal list-inside space-y-1 mb-4 text-gray-700 ml-4">
              {currentListItems.map((item, i) => (
                <li key={i} className="text-sm leading-relaxed">{item}</li>
              ))}
            </ol>
          )
          currentListItems = []
          currentList = null
        } else {
          flushList()
        }
      }
    })

    flushList()
    if (currentList === 'ol' && currentListItems.length > 0) {
      elements.push(
        <ol key={`ol-final`} className="list-decimal list-inside space-y-1 mb-4 text-gray-700 ml-4">
          {currentListItems.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed">{item}</li>
          ))}
        </ol>
      )
    }

    return elements
  }

  return (
    <div className="pb-6">
      <GradientHeader 
        title={t('help.title')} 
        subtitle={t('help.subtitle')} 
        back={() => navigate('/profil')} 
      />

      <div className="px-4 -mt-2 pt-4">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            {renderMarkdown(content)}
          </div>
        )}
      </div>
    </div>
  )
}

export default HelpPage
