import {
  Users, Calendar, Newspaper, BookOpen,
  ClipboardList, Droplets, Heart, AlertTriangle, BarChart3,
  Layers, Network, HandCoins, CalendarOff, Baby, Award,
} from 'lucide-react'

// Daftar halaman admin yang aksesnya bisa dibatasi untuk role "Admin"
// lewat halaman Hak Akses (/admin/hak-akses).
// Dashboard (/admin) selalu bisa diakses semua admin, dan Hak Akses
// itu sendiri khusus Super Admin — keduanya tidak masuk daftar ini.
export const ADMIN_PAGES = [
  { to: '/admin/jemaat',   icon: Users,         label: 'Jemaat',             section: 'Utama',       labelKey: 'admin.nav.jemaat',      sectionKey: 'admin.sec.Utama' },
  { to: '/admin/berita',   icon: Newspaper,     label: 'Berita & Info',      section: 'Konten',      labelKey: 'admin.nav.berita',      sectionKey: 'admin.sec.Konten' },
  { to: '/admin/events',   icon: Calendar,      label: 'Events',             section: 'Konten',      labelKey: 'admin.nav.events',      sectionKey: 'admin.sec.Konten' },
  { to: '/admin/kelas',    icon: BookOpen,      label: 'Kelas',              section: 'Konten',      labelKey: 'admin.nav.kelas',       sectionKey: 'admin.sec.Konten' },
  { to: '/admin/tugas',    icon: ClipboardList, label: 'Tugas & Form',       section: 'Pelayanan',   labelKey: 'admin.nav.tugas',       sectionKey: 'admin.sec.Pelayanan' },
  { to: '/admin/evaluasi', icon: BarChart3,     label: 'Evaluasi & Laporan', section: 'Pelayanan',   labelKey: 'admin.nav.evaluasi',    sectionKey: 'admin.sec.Pelayanan' },
  { to: '/admin/izin',     icon: CalendarOff,   label: 'Izin / Sakit',       section: 'Pelayanan',   labelKey: 'admin.nav.izin',        sectionKey: 'admin.sec.Pelayanan' },
  { to: '/admin/persembahan', icon: HandCoins,  label: 'Persembahan',        section: 'Organisasi',  labelKey: 'admin.nav.persembahan', sectionKey: 'admin.sec.Organisasi' },
  { to: '/admin/baptisan', icon: Droplets,      label: 'Baptisan',           section: 'Pelayanan',   labelKey: 'admin.nav.baptisan',    sectionKey: 'admin.sec.Pelayanan' },
  { to: '/admin/nikah',    icon: Heart,         label: 'Pemberkatan Nikah',  section: 'Pelayanan',   labelKey: 'admin.nav.nikah',       sectionKey: 'admin.sec.Pelayanan' },
  { to: '/admin/penyerahan-anak', icon: Baby,   label: 'Penyerahan Anak',    section: 'Pelayanan',   labelKey: 'admin.nav.dedikasi',    sectionKey: 'admin.sec.Pelayanan' },
  { to: '/admin/sertifikat', icon: Award,       label: 'Sertifikat',         section: 'Pelayanan',   labelKey: 'admin.nav.sertifikat',  sectionKey: 'admin.sec.Pelayanan' },
  { to: '/admin/sp',       icon: AlertTriangle, label: 'Surat Peringatan',   section: 'Organisasi',  labelKey: 'admin.nav.sp',          sectionKey: 'admin.sec.Organisasi' },
  { to: '/admin/ministry', icon: Layers,        label: 'Ministry',           section: 'Organisasi',  labelKey: 'admin.nav.ministry',    sectionKey: 'admin.sec.Organisasi' },
  { to: '/admin/komsel',   icon: Network,       label: 'Komsel',             section: 'Organisasi',  labelKey: 'admin.nav.komsel',      sectionKey: 'admin.sec.Organisasi' },
]

export const ALL_ADMIN_PAGE_PATHS = ADMIN_PAGES.map(p => p.to)

// Cari entri ADMIN_PAGES yang cocok dengan pathname saat ini,
// termasuk sub-halaman seperti /admin/jemaat/:id atau /admin/tugas/baru.
export function matchAdminPage(pathname) {
  return ADMIN_PAGES.find(p => pathname === p.to || pathname.startsWith(p.to + '/'))
}
