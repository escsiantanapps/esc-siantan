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

  // Top-N jemaat dengan poin terbanyak (via fungsi definer — RLS users
  // tidak mengizinkan jemaat membaca baris jemaat lain).
  async getLeaderboard(limit = 10) {
    const { data, error } = await supabase.rpc('get_points_leaderboard', { p_limit: limit })
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
  async checkInSunday(userId) {
    const { data, error } = await supabase.from('sunday_attendance')
      .insert({ user_id: userId }).select().single()
    if (error) {
      if (error.code === '23505') throw new Error('Kehadiran ibadah hari ini sudah tercatat.')
      throw error
    }
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
