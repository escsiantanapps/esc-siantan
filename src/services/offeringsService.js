import { supabase } from '@/lib/supabase'

export const OFFERING_CATEGORIES = [
  'Perpuluhan',
  'Persembahan',
  'Persembahan Syukur',
  'Misi',
  'Diakonia',
  'Pembangunan',
  'Lainnya',
]

export const offeringsService = {
  // ── Rekening / QRIS gereja ───────────────────────────────
  async getPaymentAccounts() {
    const { data, error } = await supabase
      .from('payment_accounts').select('*').order('sort').order('created_at')
    if (error) throw error
    return data
  },

  async savePaymentAccount(account) {
    if (account.id) {
      const { id, ...rest } = account
      const { data, error } = await supabase
        .from('payment_accounts').update(rest).eq('id', id).select().single()
      if (error) throw error
      return data
    }
    const { data, error } = await supabase
      .from('payment_accounts').insert(account).select().single()
    if (error) throw error
    return data
  },

  async deletePaymentAccount(id) {
    const { error } = await supabase.from('payment_accounts').delete().eq('id', id)
    if (error) throw error
  },

  async uploadQris(file) {
    const ext = file.name.split('.').pop()
    const path = `qris/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('profile-photos').upload(path, file, { upsert: true })
    if (error) throw error
    return supabase.storage.from('profile-photos').getPublicUrl(path).data.publicUrl
  },

  // ── Persembahan ──────────────────────────────────────────
  async create({ userId, category, amount, note, proof_url }) {
    const { data, error } = await supabase
      .from('offerings')
      .insert({ user_id: userId, category, amount, note: note || null, proof_url: proof_url || null })
      .select().single()
    if (error) throw error
    return data
  },

  async getMine(userId) {
    const { data, error } = await supabase
      .from('offerings').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async getAll({ startDate = null, endDate = null, category = '', status = '' } = {}) {
    let q = supabase.from('offerings').select('*, users(name)').order('created_at', { ascending: false })
    if (startDate) q = q.gte('created_at', startDate)
    if (endDate) q = q.lte('created_at', endDate)
    if (category) q = q.eq('category', category)
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) throw error
    return data
  },

  async setStatus(id, status, verifierId) {
    const updates = { status }
    if (status === 'Terverifikasi') {
      updates.verified_at = new Date().toISOString()
      updates.verified_by = verifierId || null
    }
    const { data, error } = await supabase
      .from('offerings').update(updates).eq('offering_id', id).select().single()
    if (error) throw error
    return data
  },

  async delete(id) {
    const { error } = await supabase.from('offerings').delete().eq('offering_id', id)
    if (error) throw error
  },

  async uploadProof(userId, file) {
    const path = `offerings/${userId}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('profile-photos').upload(path, file)
    if (error) throw error
    return supabase.storage.from('profile-photos').getPublicUrl(path).data.publicUrl
  },
}
