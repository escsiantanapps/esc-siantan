import {
  Users, Calendar, Newspaper, BookOpen,
  ClipboardList, Droplets, Heart, AlertTriangle, BarChart3,
  Layers, Network, HandCoins,
} from 'lucide-react'

// Daftar halaman admin yang aksesnya bisa dibatasi untuk role "Admin"
// lewat halaman Hak Akses (/admin/hak-akses).
// Dashboard (/admin) selalu bisa diakses semua admin, dan Hak Akses
// itu sendiri khusus Super Admin — keduanya tidak masuk daftar ini.
export const ADMIN_PAGES = [
  { to: '/admin/jemaat',   icon: Users,         label: 'Jemaat',             section: 'Utama' },
  { to: '/admin/berita',   icon: Newspaper,     label: 'Berita & Info',      section: 'Konten' },
  { to: '/admin/events',   icon: Calendar,      label: 'Events',             section: 'Konten' },
  { to: '/admin/kelas',    icon: BookOpen,      label: 'Kelas',              section: 'Konten' },
  { to: '/admin/tugas',    icon: ClipboardList, label: 'Tugas & Form',       section: 'Pelayanan' },
  { to: '/admin/evaluasi', icon: BarChart3,     label: 'Evaluasi & Laporan', section: 'Pelayanan' },
  { to: '/admin/persembahan', icon: HandCoins,  label: 'Persembahan',        section: 'Organisasi' },
  { to: '/admin/baptisan', icon: Droplets,      label: 'Baptisan',           section: 'Pelayanan' },
  { to: '/admin/nikah',    icon: Heart,         label: 'Pemberkatan Nikah',  section: 'Pelayanan' },
  { to: '/admin/sp',       icon: AlertTriangle, label: 'Surat Peringatan',   section: 'Organisasi' },
  { to: '/admin/ministry', icon: Layers,        label: 'Ministry',           section: 'Organisasi' },
  { to: '/admin/komsel',   icon: Network,       label: 'Komsel',             section: 'Organisasi' },
]

export const ALL_ADMIN_PAGE_PATHS = ADMIN_PAGES.map(p => p.to)

// Cari entri ADMIN_PAGES yang cocok dengan pathname saat ini,
// termasuk sub-halaman seperti /admin/jemaat/:id atau /admin/tugas/baru.
export function matchAdminPage(pathname) {
  return ADMIN_PAGES.find(p => pathname === p.to || pathname.startsWith(p.to + '/'))
}
