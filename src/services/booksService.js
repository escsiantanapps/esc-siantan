import { supabase } from '@/lib/supabase'

// Disiplin Baca Buku — buku program (dikelola admin) & catatan "poin bacaan"
// milik anggota (pesan/pelajaran + halaman yang dicapai). Progres halaman =
// halaman tertinggi dari catatan anggota pada buku itu. Lihat Migrasi v62.
export const booksService = {
  // ── Buku ──
  async listBooks({ activeOnly = false } = {}) {
    let q = supabase.from('books').select('*').order('created_at', { ascending: false })
    if (activeOnly) q = q.eq('is_active', true)
    const { data, error } = await q
    if (error) throw error
    return data || []
  },

  async createBook({ title, author, totalPages, description, pdfUrl, createdBy }) {
    const { data, error } = await supabase.from('books').insert({
      title, author: author || null, total_pages: totalPages || null,
      description: description || null, pdf_url: pdfUrl || null, created_by: createdBy,
    }).select().single()
    if (error) throw error
    return data
  },

  async updateBook(bookId, updates) {
    const { data, error } = await supabase.from('books').update(updates).eq('book_id', bookId).select().single()
    if (error) throw error
    return data
  },

  async deleteBook(bookId) {
    const { error } = await supabase.from('books').delete().eq('book_id', bookId)
    if (error) throw error
  },

  // ── Catatan poin bacaan (anggota) ──
  // Semua catatan milik seorang anggota (untuk hitung progres per buku).
  async getMyNotes(userId) {
    const { data, error } = await supabase.from('reading_notes')
      .select('*').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async addNote({ bookId, userId, page, content }) {
    const { data, error } = await supabase.from('reading_notes').insert({
      book_id: bookId, user_id: userId, page: page || 0, content,
    }).select().single()
    if (error) throw error
    return data
  },

  async deleteNote(noteId) {
    const { error } = await supabase.from('reading_notes').delete().eq('note_id', noteId)
    if (error) throw error
  },

  // Daftar buku aktif + progres anggota ini (halaman tertinggi & jumlah catatan).
  async getBooksWithMyProgress(userId) {
    const [books, notes] = await Promise.all([
      this.listBooks({ activeOnly: true }),
      this.getMyNotes(userId),
    ])
    const byBook = {}
    for (const n of notes) {
      const b = (byBook[n.book_id] ||= { maxPage: 0, count: 0 })
      b.maxPage = Math.max(b.maxPage, n.page || 0)
      b.count += 1
    }
    return books.map(bk => ({
      ...bk,
      myPage: byBook[bk.book_id]?.maxPage || 0,
      myNoteCount: byBook[bk.book_id]?.count || 0,
    }))
  },

  // ── Rekap admin ──
  // Semua catatan pada satu buku + nama penulisnya (Admin/Super Admin, RLS rdn_select).
  async getBookNotes(bookId) {
    const { data, error } = await supabase.from('reading_notes')
      .select('*, users(name, photo_url)')
      .eq('book_id', bookId).order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },
}
