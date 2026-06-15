import { supabase } from '@/lib/supabase'

export const usersService = {
  async getAll({ search = '', role = '', status = '', ministry = '', komsel = '', page = 1, limit = 20 } = {}) {
    let query = supabase.from('users').select('*', { count: 'exact' })
    if (search) query = query.ilike('name', `%${search}%`)
    if (role) query = query.eq('role', role)
    if (status) query = query.eq('status', status)
    if (ministry) query = query.contains('ministry_ids', [ministry])
    if (komsel) query = query.eq('komsel_id', komsel)
    const from = (page - 1) * limit
    query = query.range(from, from + limit - 1).order('name')
    const { data, error, count } = await query
    if (error) throw error
    return { data, count }
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('users').select('*').eq('user_id', id).single()
    if (error) throw error
    return data
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('users').update(updates).eq('user_id', id).select().single()
    if (error) throw error
    return data
  },

  async uploadAvatar(userId, file) {
    const ext = file.name.split('.').pop()
    const path = `avatars/${userId}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('profile-photos').upload(path, file, { upsert: true })
    if (uploadError) throw uploadError
    const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
    return data.publicUrl
  },

  async getMinistries(ids = []) {
    if (!ids || ids.length === 0) return []
    const { data, error } = await supabase.from('ministries').select('*').in('ministry_id', ids)
    if (error) throw error
    return data
  },

  async getKomsel(id) {
    if (!id) return null
    const { data, error } = await supabase.from('komsel').select('*').eq('komsel_id', id).maybeSingle()
    if (error) throw error
    return data
  },

  async getAllMinistries() {
    const { data, error } = await supabase.from('ministries').select('*').order('name')
    if (error) throw error
    return data
  },

  async getAllKomsel() {
    const { data, error } = await supabase.from('komsel').select('*').order('name')
    if (error) throw error
    return data
  },

  async getWithSP(level = '') {
    let query = supabase.from('users').select('*')
    query = level ? query.eq('sp_level', level) : query.neq('sp_level', 'Aman')
    const { data, error } = await query.order('name')
    if (error) throw error
    return data
  },
}
