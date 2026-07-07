import { supabase } from '@/lib/supabase'

// Pesan Gembala — pengumuman broadcast dari Gembala/Super Admin ke SELURUH
// jemaat. Satu baris = satu pengumuman (bukan per penerima). Tulis dijaga
// policy DB `pm_write` (hanya Gembala/Super Admin); baca terbuka untuk semua
// user login (policy `pm_select`). Status "sudah dibaca" dilacak ringan di
// localStorage sisi klien (tanpa write-amplification ke DB).
export const messagesService = {
  // Ambil pesan terbaru (untuk kartu Beranda). Default 5.
  async getRecent(limit = 5) {
    const { data, error } = await supabase
      .from('pastoral_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data || []
  },

  // Riwayat lengkap (untuk halaman Pesan jemaat & panel Gembala).
  async getAll() {
    const { data, error } = await supabase
      .from('pastoral_messages')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  // Buat pengumuman baru. sender_id/sender_name didenormalisasi dari profil
  // pengirim agar tetap tampil walau baris pengirim kelak dihapus.
  async create({ title, body, senderId, senderName }) {
    const { data, error } = await supabase
      .from('pastoral_messages')
      .insert({ title, body, sender_id: senderId, sender_name: senderName })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(messageId) {
    const { error } = await supabase
      .from('pastoral_messages')
      .delete()
      .eq('message_id', messageId)
    if (error) throw error
  },
}
