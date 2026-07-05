import { format, parseISO, differenceInYears } from 'date-fns'
import { id } from 'date-fns/locale'

// Format tanggal ke bahasa Indonesia
export function formatDate(date, fmt = 'd MMMM yyyy') {
  if (!date) return '-'
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, fmt, { locale: id })
}

// Hitung umur dari tanggal lahir
export function hitungUmur(tanggalLahir) {
  if (!tanggalLahir) return '-'
  return differenceInYears(new Date(), new Date(tanggalLahir)) + ' tahun'
}

// Umur dalam angka (atau null bila tanggal lahir kosong/invalid)
export function umurTahun(tanggalLahir) {
  if (!tanggalLahir) return null
  const d = typeof tanggalLahir === 'string' ? parseISO(tanggalLahir) : tanggalLahir
  if (isNaN(d?.getTime?.())) return null
  const umur = differenceInYears(new Date(), d)
  return umur >= 0 && umur < 130 ? umur : null
}

// Konversi serial Excel ke tanggal (dari database lama)
export function excelSerialToDate(serial) {
  if (!serial || isNaN(serial)) return null
  const utcDays = Math.floor(serial) - 25569
  const utcValue = utcDays * 86400000
  return new Date(utcValue)
}

// Ambil inisial dari nama
export function getInitials(name) {
  if (!name) return '?'
  return name.trim().split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

// Format nomor HP
export function formatPhone(phone) {
  if (!phone) return '-'
  const str = String(phone).replace(/\D/g, '')
  if (str.startsWith('62')) return '+' + str
  if (str.startsWith('0')) return '+62' + str.slice(1)
  return '+62' + str
}

// Normalisasi no. HP ke format internasional untuk link wa.me (62xxxxxxxxxx,
// tanpa "+" dan tanpa 0 depan). wa.me MENOLAK nomor lokal "08xx" — wajib "628xx".
export function waNumber(phone) {
  if (!phone) return ''
  const s = String(phone).replace(/\D/g, '')
  if (s.startsWith('62')) return s
  if (s.startsWith('0')) return '62' + s.slice(1)
  if (s.startsWith('8')) return '62' + s
  return s
}

// URL chat WhatsApp siap pakai (kosong bila nomor tidak ada/invalid).
export function waLink(phone, text) {
  const n = waNumber(phone)
  if (!n) return ''
  return 'https://wa.me/' + n + (text ? '?text=' + encodeURIComponent(text) : '')
}

// Truncate teks panjang
export function truncate(str, n = 80) {
  if (!str) return ''
  return str.length > n ? str.slice(0, n) + '...' : str
}

// Warna avatar dari nama (konsisten)
export function avatarColor(name) {
  const colors = [
    'bg-brand-100 text-brand-800',
    'bg-red-100 text-red-800',
    'bg-blue-100 text-blue-800',
    'bg-green-100 text-green-800',
    'bg-purple-100 text-purple-800',
    'bg-amber-100 text-amber-800',
  ]
  if (!name) return colors[0]
  const idx = name.charCodeAt(0) % colors.length
  return colors[idx]
}

// Validasi file upload (ukuran & tipe). Lempar Error bila tidak valid.
export function validateUpload(file, { maxMB = 5, image = false } = {}) {
  if (!file) return
  if (file.size > maxMB * 1024 * 1024) {
    throw new Error(`Ukuran file terlalu besar (maksimal ${maxMB} MB).`)
  }
  if (image && !file.type.startsWith('image/')) {
    throw new Error('File harus berupa gambar (JPG/PNG).')
  }
}

// Kompres + perkecil gambar di sisi klien sebelum upload (hemat storage).
// Non-gambar (mis. PDF) dikembalikan apa adanya. Aman: kalau gagal/lebih besar,
// kembalikan file asli.
export async function compressImage(file, { maxDim = 1280, quality = 0.8 } = {}) {
  if (!file || !file.type?.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    let { width, height } = bitmap
    const scale = Math.min(1, maxDim / Math.max(width, height))
    width = Math.round(width * scale)
    height = Math.round(height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file // jangan perbesar
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file // browser lama / gagal decode → pakai file asli
  }
}

// Format angka rupiah, mis. 50000 -> "Rp50.000"
export function formatRupiah(value) {
  const n = Number(value) || 0
  return 'Rp' + n.toLocaleString('id-ID')
}

// Status SP badge color
export function spColor(status) {
  const map = {
    'Aman': 'bg-green-100 text-green-800',
    'SP 1': 'bg-brand-100 text-brand-800',
    'SP 2': 'bg-red-100 text-red-800',
    'SP 3': 'bg-red-200 text-red-900',
  }
  return map[status] || 'bg-gray-100 text-gray-700'
}
