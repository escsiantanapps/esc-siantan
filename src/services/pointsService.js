import { supabase } from '@/lib/supabase'

// Sistem Poin Jemaat. Saldo poin (users.points) HANYA ditulis oleh fungsi
// SECURITY DEFINER di database (trigger kehadiran, award_biodata_points,
// redeem_ticket) — klien tidak pernah meng-update kolom points langsung
// (dijaga trigger guard_user_privilege_cols).
export const pointsService = {
  // Saldo poin milik sendiri.
  async getMyPoints(userId) {
    const { data, error } = await supabase
      .from('users').select('points').eq('user_id', userId).single()
    if (error) throw error
    return data?.points || 0
  },

  // Riwayat transaksi poin milik sendiri.
  async getMyTransactions(userId, limit = 30) {
    const { data, error } = await supabase
      .from('point_transactions').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(limit)
    if (error) throw error
    return data
  },

  // Semua transaksi poin (audit distribusi) — untuk halaman Distribusi Poin.
  // RLS ptx_select mengizinkan Admin/Super Admin membaca semua. Nama jemaat
  // di-join (inner: setiap transaksi pasti punya user_id). Limit tinggi karena
  // dipakai agregasi "poin masuk ke mana saja". Filter nama di klien.
  async getAllTransactions(limit = 3000) {
    const { data, error } = await supabase
      .from('point_transactions')
      .select('transaction_id, user_id, amount, description, created_at, users!inner(name, photo_url)')
      .order('created_at', { ascending: false }).limit(limit)
    if (error) throw error
    return data || []
  },

  // Rincian poin kehadiran per KOMSEL (baris komsel_attendance yang benar-benar
  // berpoin, points_awarded=true) — untuk breakdown "poin dari komsel mana".
  // point_transactions tidak menyimpan komsel-nya, jadi diambil dari tabel absensi.
  async getKomselPointBreakdown(limit = 5000) {
    const { data, error } = await supabase
      .from('komsel_attendance')
      .select('komsel_id, komsel(name)')
      .eq('points_awarded', true).limit(limit)
    if (error) throw error
    return data || []
  },

  // Rincian poin kehadiran per KELAS (tiap baris class_attendance = +1 poin).
  async getClassPointBreakdown(limit = 5000) {
    const { data, error } = await supabase
      .from('class_attendance')
      .select('class_id, classes(name)').limit(limit)
    if (error) throw error
    return data || []
  },

  // Hapus (revoke) satu poin yang didapat jemaat — RPC tepercaya, gated
  // Hak Akses `/admin/distribusi-poin` di server (Migrasi v61). Menurunkan
  // saldo & mencatat penyesuaian (ditampilkan "Dikurangi oleh sistem").
  async revokePointTransaction(txId) {
    const { data, error } = await supabase.rpc('admin_revoke_point_transaction', { p_txid: txId })
    if (error) throw error
    return data
  },

  // Pemberian poin manual hanya lewat RPC. Validasi peran Super Admin, alasan,
  // saldo, transaksi, dan audit semuanya terjadi atomik di database (v75).
  async grantPoints(userId, amount, reason) {
    const { data, error } = await supabase.rpc('super_admin_grant_points', {
      p_user_id: userId,
      p_amount: amount,
      p_reason: reason,
    })
    if (error) throw error
    return data
  },

  // Top-N jemaat + posisi pemanggil bila berada di luar Top-N. RPC definer
  // menghitung peringkat global tanpa membuka seluruh data poin ke klien.
  async getLeaderboardWithMe(limit = 10) {
    const { data, error } = await supabase.rpc('get_points_leaderboard_with_me', { p_limit: limit })
    if (error) throw error
    return data || []
  },

  // Klaim 5 poin biodata lengkap — validasi kelengkapan terjadi di server.
  // Return: { awarded: boolean, reason?: 'already'|'incomplete'|'no_user' }
  async claimBiodataPoints() {
    const { data, error } = await supabase.rpc('award_biodata_points')
    if (error) throw error
    return data
  },

  // Tukar tiket produk (scan QR ESC-REDEEM:<ticket_id>) — atomik di server.
  // Return: { ok, product?, cost?, balance?, reason? }
  async redeemTicket(ticketId) {
    const { data, error } = await supabase.rpc('redeem_ticket', { p_ticket_id: ticketId })
    if (error) throw error
    return data
  },

  // ── Katalog produk (baca semua user; kelola Admin) ──
  async getProducts() {
    const { data, error } = await supabase
      .from('redeemable_products').select('*').order('points_cost')
    if (error) throw error
    return data
  },

  async createProduct(p) {
    const { data, error } = await supabase
      .from('redeemable_products').insert(p).select().single()
    if (error) throw error
    return data
  },

  async updateProduct(id, updates) {
    const { data, error } = await supabase
      .from('redeemable_products').update(updates).eq('product_id', id).select().single()
    if (error) throw error
    return data
  },

  async deleteProduct(id) {
    const { error } = await supabase.from('redeemable_products').delete().eq('product_id', id)
    if (error) throw error
  },

  async uploadProductImage(file) {
    const ext = file.name.split('.').pop()
    const path = `products/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('profile-photos').upload(path, file)
    if (error) throw error
    return supabase.storage.from('profile-photos').getPublicUrl(path).data.publicUrl
  },

  // ── Tiket penukaran (Admin) ──
  async getTickets({ status = '' } = {}) {
    let q = supabase.from('redemption_tickets')
      .select('*, redeemable_products(name, points_cost), users!redemption_tickets_redeemed_by_fkey(name)')
      .order('created_at', { ascending: false })
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) throw error
    return data
  },

  async createTicket(productId, pointsCost) {
    const { data, error } = await supabase.from('redemption_tickets')
      .insert({ product_id: productId, points_cost: pointsCost }).select().single()
    if (error) throw error
    return data
  },

  async deleteTicket(ticketId) {
    const { error } = await supabase.from('redemption_tickets').delete().eq('ticket_id', ticketId)
    if (error) throw error
  },

  // ── Kehadiran Ibadah Minggu (QR harian: ESC-SUNDAY:<YYYY-MM-DD>) ──
  // ── Sesi QR ibadah minggu (ESC-SUNDAY:<session_id>) — Migrasi v63 ──
  // Anti-curang: QR statis lama diganti token sesi acak + jendela waktu.
  // Absen ditolak DB (42501) bila sesi tak valid / bukan hari ini / kedaluwarsa.
  async checkInSunday(userId, sessionId) {
    const { data, error } = await supabase.from('sunday_attendance')
      .insert({ user_id: userId, session_id: sessionId }).select().single()
    if (error) {
      if (error.code === '23505') throw new Error('Kehadiran ibadah hari ini sudah tercatat.')
      if (error.code === '42501' || /row-level security/i.test(error.message || '')) {
        throw new Error('Sesi ibadah tidak aktif atau sudah berakhir. Minta petugas menampilkan QR ibadah terbaru.')
      }
      throw error
    }
    return data
  },

  async getSundaySession(sessionId) {
    const { data, error } = await supabase.from('sunday_sessions')
      .select('*').eq('session_id', sessionId).maybeSingle()
    if (error) throw error
    return data
  },

  // Sesi aktif (belum kedaluwarsa) untuk tanggal tertentu. Dipakai Admin agar
  // tak membuat sesi ganda — QR yang sama dipakai ulang sepanjang jendela waktu.
  // Parameter date opsional (default = hari ini WIB).
  async getActiveSundaySession(date = null) {
    const targetDate = date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
    const { data, error } = await supabase.from('sunday_sessions')
      .select('*').eq('service_date', targetDate).gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(1)
    if (error) throw error
    return data?.[0] || null
  },

  // QR berlaku sepanjang hari (keputusan operator 2026-07-12): ibadah beda-beda
  // jamnya, jadi batas = akhir hari WIB, bukan durasi tetap. expires_at = akhir
  // hari target (23:59:59 WIB). Sejak v70, bisa buka sesi untuk tanggal selain
  // hari ini (date opsional, default = hari ini WIB).
  async openSundaySession(createdBy, date = null, { title = null } = {}) {
    const targetDate = date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
    const existing = await this.getActiveSundaySession(targetDate)
    if (existing) return existing
    const expires = new Date(`${targetDate}T23:59:59+07:00`).toISOString()
    const { data, error } = await supabase.from('sunday_sessions')
      .insert({ service_date: targetDate, created_by: createdBy, title, expires_at: expires }).select().single()
    if (error) throw error
    return data
  },

  // Pause sesi ibadah (set is_paused = true → scan ditolak, QR tetap sama).
  async pauseSundaySession(sessionId) {
    const { data, error } = await supabase.from('sunday_sessions')
      .update({ is_paused: true }).eq('session_id', sessionId).select().single()
    if (error) throw error
    return data
  },

  // Resume sesi ibadah (set is_paused = false → scan kembali diterima).
  async resumeSundaySession(sessionId) {
    const { data, error } = await supabase.from('sunday_sessions')
      .update({ is_paused: false }).eq('session_id', sessionId).select().single()
    if (error) throw error
    return data
  },

  // Tutup sesi ibadah permanen (set expires_at ke sekarang → sesi berakhir).
  async closeSundaySession(sessionId) {
    const { data, error } = await supabase.from('sunday_sessions')
      .update({ expires_at: new Date().toISOString() }).eq('session_id', sessionId).select().single()
    if (error) throw error
    return data
  },

  async getSundayAttendance(date) {
    let q = supabase.from('sunday_attendance')
      .select('*, users(name, phone)').order('scanned_at', { ascending: false })
    if (date) q = q.eq('attendance_date', date)
    const { data, error } = await q
    if (error) throw error
    return data
  },

  // Poin seluruh jemaat utk panel admin (urut poin) — RLS admin boleh baca semua.
  async getAllUserPoints() {
    const { data, error } = await supabase
      .from('users').select('user_id, name, photo_url, points, status')
      .eq('status', 'Aktif').order('points', { ascending: false })
    if (error) throw error
    return data
  },
}
