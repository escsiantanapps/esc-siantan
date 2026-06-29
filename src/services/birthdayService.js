import { supabase } from '@/lib/supabase'

export const birthdayService = {
  // PKS kirim pesan ulang tahun personal ke satu anggota komselnya.
  async sendMessage({ recipientId, komselId, senderId, message }) {
    const { data, error } = await supabase
      .from('birthday_messages')
      .insert({ recipient_id: recipientId, komsel_id: komselId, sender_id: senderId, message })
      .select().single()
    if (error) throw error
    return data
  },

  // Pesan belum dibaca milik user yang login (ditampilkan sebagai kartu di Beranda).
  async getMyUnread(userId) {
    const { data, error } = await supabase
      .from('birthday_messages')
      .select('*, users!sender_id(name)')
      .eq('recipient_id', userId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async markRead(id) {
    const { error } = await supabase
      .from('birthday_messages').update({ read_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },
}
