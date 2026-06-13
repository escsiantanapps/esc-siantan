import { supabase } from '@/lib/supabase'

// ─── Events ──────────────────────────────────────────────
export const eventsService = {
  async getAll({ status = '' } = {}) {
    let query = supabase.from('events').select('*').order('event_date', { ascending: true })
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error
    return data
  },

  async getById(id) {
    const { data, error } = await supabase.from('events').select('*').eq('event_id', id).single()
    if (error) throw error
    return data
  },

  async create(event) {
    const { data, error } = await supabase.from('events').insert(event).select().single()
    if (error) throw error
    return data
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('events').update(updates).eq('event_id', id).select().single()
    if (error) throw error
    return data
  },

  async delete(id) {
    const { error } = await supabase.from('events').delete().eq('event_id', id)
    if (error) throw error
  },

  async register(eventId, userId) {
    const ticketId = `TKT-${Date.now()}`
    const { data, error } = await supabase.from('event_registrations')
      .insert({ ticket_id: ticketId, event_id: eventId, user_id: userId }).select().single()
    if (error) throw error
    return data
  },

  async getRegistrations(eventId) {
    const { data, error } = await supabase.from('event_registrations')
      .select('*, users(name, role)').eq('event_id', eventId)
    if (error) throw error
    return data
  },

  async getMyRegistration(eventId, userId) {
    const { data, error } = await supabase.from('event_registrations')
      .select('*').eq('event_id', eventId).eq('user_id', userId).maybeSingle()
    if (error) throw error
    return data
  },
}

// ─── News ─────────────────────────────────────────────────
export const newsService = {
  async getAll() {
    const { data, error } = await supabase.from('news')
      .select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async getById(id) {
    const { data, error } = await supabase.from('news').select('*').eq('news_id', id).single()
    if (error) throw error
    return data
  },

  async create(news) {
    const { data, error } = await supabase.from('news').insert(news).select().single()
    if (error) throw error
    return data
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('news').update(updates).eq('news_id', id).select().single()
    if (error) throw error
    return data
  },

  async delete(id) {
    const { error } = await supabase.from('news').delete().eq('news_id', id)
    if (error) throw error
  },
}

// ─── Baptism & Wedding Registrations ──────────────────────
export const registrationService = {
  async submitBaptism(data) {
    const { data: result, error } = await supabase
      .from('baptism_registrations').insert(data).select().single()
    if (error) throw error
    return result
  },

  async submitWedding(data) {
    const { data: result, error } = await supabase
      .from('wedding_registrations').insert(data).select().single()
    if (error) throw error
    return result
  },

  async getMyRegistrations(userId) {
    const [baptism, wedding] = await Promise.all([
      supabase.from('baptism_registrations').select('*').eq('user_id', userId),
      supabase.from('wedding_registrations').select('*').eq('user_id', userId),
    ])
    return {
      baptism: baptism.data || [],
      wedding: wedding.data || [],
    }
  },

  async getAllBaptism({ status = '' } = {}) {
    let query = supabase.from('baptism_registrations')
      .select('*, users(name, phone)').order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error
    return data
  },

  async getAllWedding({ status = '' } = {}) {
    let query = supabase.from('wedding_registrations')
      .select('*, users(name, phone)').order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error
    return data
  },

  async getById(type, id) {
    const table = type === 'baptism' ? 'baptism_registrations' : 'wedding_registrations'
    const idCol = type === 'baptism' ? 'baptism_id' : 'wedding_id'
    const { data, error } = await supabase
      .from(table).select('*, users(name, phone, email)').eq(idCol, id).single()
    if (error) throw error
    return data
  },

  async updateStatus(type, id, updates) {
    const table = type === 'baptism' ? 'baptism_registrations' : 'wedding_registrations'
    const idCol = type === 'baptism' ? 'baptism_id' : 'wedding_id'
    const { data, error } = await supabase
      .from(table).update(updates).eq(idCol, id).select().single()
    if (error) throw error
    return data
  },

  async uploadDocument(folder, file) {
    const path = `${folder}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('documents').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('documents').getPublicUrl(path)
    return data.publicUrl
  },
}
