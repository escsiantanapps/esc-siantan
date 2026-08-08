import {
  Users, Calendar, Newspaper, BookOpen,
  ClipboardList, Droplets, Heart, AlertTriangle, BarChart3,
  Layers, Network, HandCoins, CalendarOff, Baby, Award, Map, Church, CreditCard,
  LayoutDashboard, Inbox, CalendarClock, Library, Tag, Package,
} from 'lucide-react'

// Daftar halaman admin yang aksesnya bisa dibatasi untuk role "Admin"
// lewat halaman Hak Akses (/admin/hak-akses).
// Hak Akses itu sendiri khusus Super Admin — tidak masuk daftar ini.
// Dashboard (/admin) MASUK daftar (bisa dicabut Super Admin) — bila
// akses Dashboard dicabut, admin ybs diarahkan otomatis ke halaman
// pertama yang diizinkan (lihat AdminLayout).
// Diurutkan berdasar section agar buildMenu mencetak tiap header SEKALI
// (Utama → Konten → Administrasi → Pelayanan → Sistem). Jangan menyisipkan item di luar
// blok sectionnya — item yang salah tempat membuat header muncul berulang.
export const ADMIN_PAGES = [
  // ── Utama ──
  { to: '/admin',          icon: LayoutDashboard, label: 'Dashboard',        section: 'Utama',        labelKey: 'admin.nav.dashboard',   sectionKey: 'admin.sec.Utama' },
  { to: '/admin/jemaat',   icon: Users,           label: 'Jemaat',           section: 'Utama',        labelKey: 'admin.nav.jemaat',      sectionKey: 'admin.sec.Utama' },
  // ── Konten ──
  { to: '/admin/berita',   icon: Newspaper,       label: 'Berita & Info',    section: 'Konten',       labelKey: 'admin.nav.berita',      sectionKey: 'admin.sec.Konten' },
  { to: '/admin/events',   icon: Calendar,        label: 'Events',           section: 'Konten',       labelKey: 'admin.nav.events',      sectionKey: 'admin.sec.Konten' },
  { to: '/admin/kelas',    icon: BookOpen,        label: 'Kelas',            section: 'Konten',       labelKey: 'admin.nav.kelas',       sectionKey: 'admin.sec.Konten' },
  { to: '/admin/baca',     icon: Library,         label: 'Buku',             section: 'Konten',       labelKey: 'admin.nav.baca',        sectionKey: 'admin.sec.Konten' },
  { to: '/admin/roadmap',  icon: Map,             label: 'Roadmap Pemuridan',section: 'Konten',       labelKey: 'admin.nav.roadmap',     sectionKey: 'admin.sec.Konten' },
  // ── Administrasi ──
  { to: '/admin/ibadah-minggu', icon: Church,     label: 'Ibadah Minggu',    section: 'Administrasi', labelKey: 'admin.nav.ibadahMinggu',sectionKey: 'admin.sec.Administrasi' },
  { to: '/admin/pelayanan', icon: CalendarClock,  label: 'Absen Pelayanan',  section: 'Administrasi', labelKey: 'admin.nav.pelayanan',   sectionKey: 'admin.sec.Administrasi' },
  { to: '/admin/baptisan', icon: Droplets,        label: 'Baptisan',         section: 'Administrasi', labelKey: 'admin.nav.baptisan',    sectionKey: 'admin.sec.Administrasi' },
  { to: '/admin/nikah',    icon: Heart,           label: 'Pemberkatan Nikah',section: 'Administrasi', labelKey: 'admin.nav.nikah',       sectionKey: 'admin.sec.Administrasi' },
  { to: '/admin/penyerahan-anak', icon: Baby,     label: 'Penyerahan Anak',  section: 'Administrasi', labelKey: 'admin.nav.dedikasi',    sectionKey: 'admin.sec.Administrasi' },
  { to: '/admin/sertifikat', icon: Award,         label: 'Sertifikat',       section: 'Administrasi', labelKey: 'admin.nav.sertifikat',  sectionKey: 'admin.sec.Administrasi' },
  { to: '/admin/ktj',      icon: CreditCard,      label: 'KTJ (Kartu Jemaat)',section: 'Administrasi',labelKey: 'admin.nav.ktj',         sectionKey: 'admin.sec.Administrasi' },
  { to: '/admin/inventory', icon: Package,         label: 'Inventory',         section: 'Administrasi', labelKey: 'admin.nav.inventory',   sectionKey: 'admin.sec.Administrasi' },
  // ── Pelayanan ──
  { to: '/admin/tugas',    icon: ClipboardList,   label: 'Tugas & Form',     section: 'Pelayanan',    labelKey: 'admin.nav.tugas',       sectionKey: 'admin.sec.Pelayanan' },
  { to: '/admin/respon',   icon: Inbox,           label: 'Respon SOP',       section: 'Pelayanan',    labelKey: 'admin.nav.respon',      sectionKey: 'admin.sec.Pelayanan' },
  { to: '/admin/evaluasi', icon: BarChart3,       label: 'Evaluasi & Laporan',section: 'Pelayanan',   labelKey: 'admin.nav.evaluasi',    sectionKey: 'admin.sec.Pelayanan' },
  { to: '/admin/izin',     icon: CalendarOff,     label: 'Izin / Sakit',     section: 'Pelayanan',    labelKey: 'admin.nav.izin',        sectionKey: 'admin.sec.Pelayanan' },
  { to: '/admin/komsel',   icon: Network,         label: 'Komsel',           section: 'Pelayanan',    labelKey: 'admin.nav.komsel',      sectionKey: 'admin.sec.Pelayanan' },
  { to: '/admin/ministry', icon: Layers,          label: 'Ministry',         section: 'Pelayanan',    labelKey: 'admin.nav.ministry',    sectionKey: 'admin.sec.Pelayanan' },
  { to: '/admin/persembahan', icon: HandCoins,    label: 'Persembahan',      section: 'Pelayanan',    labelKey: 'admin.nav.persembahan', sectionKey: 'admin.sec.Pelayanan' },
  { to: '/admin/sp',       icon: AlertTriangle,   label: 'Surat Peringatan', section: 'Pelayanan',    labelKey: 'admin.nav.sp',          sectionKey: 'admin.sec.Pelayanan' },
]

export const ALL_ADMIN_PAGE_PATHS = ADMIN_PAGES.map(p => p.to)

// Cari entri ADMIN_PAGES yang cocok dengan pathname saat ini,
// termasuk sub-halaman seperti /admin/jemaat/:id atau /admin/tugas/baru.
// Dashboard '/admin' hanya cocok pada exact match — sub-halaman jatuh ke
// entry-nya masing-masing, bukan Dashboard.
export function matchAdminPage(pathname) {
  return ADMIN_PAGES.find(p =>
    p.to === '/admin' ? pathname === '/admin' : (pathname === p.to || pathname.startsWith(p.to + '/'))
  )
}
