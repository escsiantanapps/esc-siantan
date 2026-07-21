import { supabase } from '@/lib/supabase'

/**
 * Service untuk mengelola kategori SP (Surat Peringatan).
 * Admin dapat membuat/edit/hapus kategori SP yang akan digunakan
 * saat menerbitkan SP kepada jemaat.
 */

export const spCategoriesService = {
  /**
   * Ambil semua kategori SP, diurutkan berdasarkan level (ascending).
   */
  async getAll() {
    const { data, error } = await supabase
      .from('sp_categories')
      .select('*')
      .order('level', { ascending: true })
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
   * @param {Object} payload - { name, level, description }
   */
  async create(payload) {
    const { data, error } = await supabase
      .from('sp_categories')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  },

  /**
   * Update kategori SP.
   * @param {string} categoryId
   * @param {Object} payload - { name, level, description }
   */
  async update(categoryId, payload) {
    const { data, error } = await supabase
      .from('sp_categories')
      .update({ ...payload, updated_at: new Date().toISOString() })
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
