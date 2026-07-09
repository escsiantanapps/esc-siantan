import { supabase } from '@/lib/supabase'
import { sanitizeFilename } from '@/lib/utils'

// Jenis izin tugas. "Sakit" untuk kondisi kesehatan; "Izin" untuk halangan lain.
export const LEAVE_TYPES = ['Sakit', 'Izin']

export const leavesService = {
  // ── Sisi anggota ─────────────────────────────────────────
  async getMine(userId) {
    const { data, error } = await supabase
      .from('task_leaves').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async create({ userId, type, startDate, endDate, reason, proofUrl, formId, formTitle }) {
    const { data, error } = await supabase.from('task_leaves').insert({
      user_id: userId,
      type,
      start_date: startDate,
      end_date: endDate,
      reason: reason || null,
      proof_url: proofUrl || null,
      form_id: formId || null,
      form_title: formTitle || null,
    }).select().single()
    if (error) throw error
    return data
  },

  // Batalkan pengajuan sendiri yang masih Menunggu (RLS membatasi ke status itu).
  async cancel(leaveId) {
    const { error } = await supabase.from('task_leaves').delete().eq('leave_id', leaveId)
    if (error) throw error
  },

  async uploadProof(userId, file) {
    const safeName = sanitizeFilename(file.name)
    const path = `leaves/${userId}/${Date.now()}_${safeName}`
    const { error } = await supabase.storage.from('task-files').upload(path, file)
    if (error) throw error
    return supabase.storage.from('task-files').getPublicUrl(path).data.publicUrl
  },

  // ── Sisi admin ───────────────────────────────────────────
  async getAll({ status = '' } = {}) {
    let q = supabase
      .from('task_leaves').select('*, users(name, photo_url)').order('created_at', { ascending: false })
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) throw error
    return data
  },

  async setStatus(leaveId, status, reviewerId, note) {
    const { data, error } = await supabase.from('task_leaves').update({
      status,
      reviewed_by: reviewerId || null,
      reviewed_at: new Date().toISOString(),
      admin_note: note || null,
    }).eq('leave_id', leaveId).select().single()
    if (error) throw error
    return data
  },

  async delete(leaveId) {
    const { error } = await supabase.from('task_leaves').delete().eq('leave_id', leaveId)
    if (error) throw error
  },
}
