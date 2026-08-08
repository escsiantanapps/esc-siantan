// Sumber TUNGGAL daftar tabel backup — dipakai bareng oleh halaman in-app
// (AdminBackupPage.jsx) DAN skrip lokal (scripts/backup-esc.mjs). Array polos
// tanpa dependensi Vite/browser, jadi aman di-import dari node ESM juga.
//
// KENAPA satu file: dulu daftar ini hidup inline di AdminBackupPage dan JADI BASI —
// 8 tabel (books, reading_notes, redeemable_products, redemption_tickets,
// ktj_registrations, registration_prerequisites, audit_log, push_subscriptions)
// tak pernah ikut ter-backup. Satu sumber = drift tak terulang.
//
// SENGAJA DIKECUALIKAN: password_reset_otp — token OTP transien (kadaluarsa
// cepat, tak ada nilai pulih) dan sensitif; tak perlu ikut arsip.
// (activation_otp sudah dihapus dari schema di Migrasi v67 — tak ada lagi.)
export const BACKUP_TABLES = [
  // ── Jemaat & keanggotaan ──
  { table: 'users', sheet: 'Data Jemaat' },
  { table: 'ministries', sheet: 'Ministry' },
  { table: 'user_ministries', sheet: 'Anggota Ministry' },
  // ── Komsel ──
  { table: 'komsel', sheet: 'Komsel' },
  { table: 'komsel_categories', sheet: 'Kategori Komsel' },
  { table: 'komsel_leaders', sheet: 'Pemimpin Komsel' },
  { table: 'komsel_sessions', sheet: 'Sesi Komsel' },
  { table: 'komsel_attendance', sheet: 'Kehadiran Komsel' },
  { table: 'komsel_offerings', sheet: 'Persembahan Komsel' },
  { table: 'sunday_attendance', sheet: 'Ibadah Minggu' },
  // ── Events & kelas ──
  { table: 'events', sheet: 'Events' },
  { table: 'event_registrations', sheet: 'Pendaftaran Event' },
  { table: 'event_attendance', sheet: 'Kehadiran Event' },
  { table: 'classes', sheet: 'Kelas' },
  { table: 'class_registrations', sheet: 'Pendaftaran Kelas' },
  { table: 'class_attendance', sheet: 'Kehadiran Kelas' },
  { table: 'news', sheet: 'Berita' },
  // ── SOP Rohani (form/tugas) ──
  { table: 'form_templates', sheet: 'Template Form' },
  { table: 'template_ministries', sheet: 'Ministry Template' },
  { table: 'form_responses', sheet: 'Jawaban Form' },
  { table: 'task_categories', sheet: 'Kategori Tugas' },
  { table: 'task_category_ministries', sheet: 'Ministry Kat Tugas' },
  { table: 'task_leaves', sheet: 'Izin Sakit' },
  // ── Sakramen & pendaftaran ──
  { table: 'baptism_registrations', sheet: 'Baptisan' },
  { table: 'wedding_registrations', sheet: 'Nikah' },
  { table: 'child_dedication_registrations', sheet: 'Penyerahan Anak' },
  { table: 'ktj_registrations', sheet: 'KTJ' },
  { table: 'registration_prerequisites', sheet: 'Prasyarat Pendaftaran' },
  { table: 'certificates', sheet: 'Sertifikat' },
  { table: 'birthday_messages', sheet: 'Pesan Ulang Tahun' },
  // ── Disiplin Baca Buku ──
  { table: 'books', sheet: 'Buku' },
  { table: 'reading_notes', sheet: 'Catatan Bacaan' },
  // ── Keuangan & poin ──
  { table: 'offerings', sheet: 'Persembahan' },
  { table: 'payment_accounts', sheet: 'Rekening' },
  { table: 'point_transactions', sheet: 'Transaksi Poin' },
  { table: 'redeemable_products', sheet: 'Produk Tukar Poin' },
  { table: 'redemption_tickets', sheet: 'Tiket Penukaran' },
  // ── Inventory ──
  { table: 'inventory_categories', sheet: 'Kategori Inventory' },
  { table: 'inventory_items', sheet: 'Barang Inventory' },
  { table: 'inventory_transactions', sheet: 'Transaksi Inventory' },
  { table: 'inventory_loans', sheet: 'Peminjaman Inventory' },
  // ── Sistem ──
  { table: 'app_settings', sheet: 'Pengaturan App' },
  { table: 'admin_user_permissions', sheet: 'Hak Akses Admin' },
  { table: 'push_subscriptions', sheet: 'Langganan Push' },
  { table: 'audit_log', sheet: 'Audit Log' },
]
