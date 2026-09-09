import { supabase } from '@/lib/supabase'

/**
 * Service untuk mengelola kategori SP (Surat Peringatan).
 * Admin dapat membuat/edit/hapus kategori SP yang digunakan saat menerbitkan
 * surat. Tingkat SP 1-3 dipilih terpisah pada surat, bukan pada kategori.
 */

export const spCategoriesService = {
  /**
   * Ambil semua kategori SP berdasarkan nama.
   */
  async getAll() {
    const { data, error } = await supabase
      .from('sp_categories')
      .select('*')
      .order('name', { ascending: true })
    if (error) throw error
    return data
  },

  /**
   * Ambil satu kategori SP berdasarkan ID.
   */
  async getById(categoryId) {
    const { data, error } = await supabase
      .from('sp_categories')
      .select('*')
      .eq('category_id', categoryId)
      .single()
    if (error) throw error
    return data
  },

  /**
   * Buat kategori SP baru.
   * @param {Object} payload - { name, description }
   */
  async create(payload) {
    const { data, error } = await supabase
      .from('sp_categories')
      .insert({ name: payload.name, description: payload.description || null })
      .select()
      .single()
    if (error) throw error
    return data
  },

  /**
   * Update kategori SP.
   * @param {string} categoryId
   * @param {Object} payload - { name, description }
   */
  async update(categoryId, payload) {
    const { data, error } = await supabase
      .from('sp_categories')
      .update({ name: payload.name, description: payload.description || null, updated_at: new Date().toISOString() })
      .eq('category_id', categoryId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  /**
   * Hapus kategori SP.
   * Gagal bila ada sp_letters yang masih mereferensi kategori ini
   * (FK constraint ON DELETE RESTRICT).
   */
  async delete(categoryId) {
    const { error } = await supabase
      .from('sp_categories')
      .delete()
      .eq('category_id', categoryId)
    if (error) throw error
  },
}
