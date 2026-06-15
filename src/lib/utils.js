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

// Truncate teks panjang
export function truncate(str, n = 80) {
  if (!str) return ''
  return str.length > n ? str.slice(0, n) + '...' : str
}

// Warna avatar dari nama (konsisten)
export function avatarColor(name) {
  const colors = [
    'bg-orange-100 text-orange-800',
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

// [DUMMY/PREVIEW] Gambar placeholder deterministik saat thumbnail asli kosong.
// Tiap seed menghasilkan gambar yang tetap sama. Hapus pemakaiannya bila
// thumbnail asli sudah tersedia di database.
export function dummyThumb(seed, w = 600, h = 400) {
  return `https://picsum.photos/seed/esc-${String(seed ?? 'x')}/${w}/${h}`
}

// Status SP badge color
export function spColor(status) {
  const map = {
    'Aman': 'bg-green-100 text-green-800',
    'SP 1': 'bg-orange-100 text-orange-800',
    'SP 2': 'bg-red-100 text-red-800',
    'SP 3': 'bg-red-200 text-red-900',
  }
  return map[status] || 'bg-gray-100 text-gray-700'
}
