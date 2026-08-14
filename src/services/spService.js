import { supabase } from '@/lib/supabase'

/**
 * Service untuk mengelola SP Letters (Surat Peringatan yang diterbitkan admin ke jemaat).
 * Admin dapat issue SP baru, lihat riwayat SP jemaat, dan menonaktifkan SP.
 * Jemaat dapat melihat SP yang diterima (read-only).
 */

export const spService = {
  /**
   * Terbitkan SP baru ke jemaat.
   * Trigger DB akan otomatis sync users.sp_level & sp_notes dari sp_letters terbaru.
   * 
   * @param {Object} payload - { user_id, category_id, notes, issued_by }
   */
  async issue(payload) {
    const { data, error } = await supabase
      .from('sp_letters')
      .insert(payload)
      .select(`
        *,
        category:sp_categories(category_id, name, level),
        user:users!sp_letters_user_id_fkey(user_id, name, photo_url),
        issuer:users!sp_letters_issued_by_fkey(user_id, name)
      `)
      .single()
    if (error) throw error
    return data
  },

  /**
   * Ambil semua SP letters untuk satu jemaat, diurutkan terbaru dulu.
   * 
   * @param {string} userId
   */
  async getByUser(userId) {
    const { data, error } = await supabase
      .from('sp_letters')
      .select(`
        *,
        category:sp_categories(category_id, name, level, description),
        issuer:users!sp_letters_issued_by_fkey(user_id, name, photo_url)
      `)
      .eq('user_id', userId)
      .order('issued_at', { ascending: false })
    if (error) throw error
    return data
  },

  /**
   * Ambil SP aktif untuk satu jemaat (untuk display di profil/home).
   */
  async getActiveByUser(userId) {
    const { data, error } = await supabase
      .from('sp_letters')
      .select(`
        *,
        category:sp_categories(category_id, name, level, description),
        issuer:users!sp_letters_issued_by_fkey(user_id, name)
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('issued_at', { ascending: false })
    if (error) throw error
    return data
  },

  /**
   * Ambil semua jemaat yang punya SP aktif (untuk halaman admin /admin/sp).
   * Filter by category_id opsional.
   * 
   * @param {string} categoryId - Opsional, filter by category
   */
  async getAllWithActiveSP(categoryId = null) {
    let query = supabase
      .from('sp_letters')
      .select('letter_id, user_id, category_id, notes, issued_at')
      .eq('is_active', true)

    if (categoryId) {
      query = query.eq('category_id', categoryId)
    }

    const { data: letters, error } = await query.order('issued_at', { ascending: false })
    if (error) throw error
    if (!letters?.length) return []

    // Query terpisah tidak bergantung pada nama FK di schema cache PostgREST,
    // karena constraint production dapat berbeda dari schema repo.
    const userIds = [...new Set(letters.map(letter => letter.user_id))]
    const categoryIds = [...new Set(letters.map(letter => letter.category_id))]
    const [usersResult, categoriesResult] = await Promise.all([
      supabase
        .from('users')
        .select('user_id, name, photo_url, role')
        .in('user_id', userIds),
      supabase
        .from('sp_categories')
        .select('category_id, name, level')
        .in('category_id', categoryIds),
    ])
    if (usersResult.error) throw usersResult.error
    if (categoriesResult.error) throw categoriesResult.error

    const userById = new Map(usersResult.data.map(user => [user.user_id, user]))
    const categoryById = new Map(categoriesResult.data.map(category => [category.category_id, category]))


    // Group by user (karena satu user bisa punya multiple SP aktif dengan kategori berbeda)
    // Ambil SP dengan level tertinggi per user
    const userMap = new Map()
    letters.forEach(letter => {
      const user = userById.get(letter.user_id)
      const category = categoryById.get(letter.category_id)
      if (!user || !category) throw new Error('sp_reference_unavailable')

      const userId = user.user_id
      const existing = userMap.get(userId)
      if (!existing || category.level > existing.sp_category.level) {
        userMap.set(userId, {
          ...user,
          sp_level: category.name,
          sp_notes: letter.notes,
          sp_issued_at: letter.issued_at,
          sp_category: category,
        })
      }
    })

    return Array.from(userMap.values())
  },

  /**
   * Nonaktifkan SP (set is_active = false).
   * Trigger DB akan otomatis sync users.sp_level & sp_notes.
   * 
   * @param {string} letterId
   */
  async deactivate(letterId) {
    const { data, error } = await supabase
      .from('sp_letters')
      .update({ is_active: false })
      .eq('letter_id', letterId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  /**
   * Hapus SP letter (hard delete, hanya untuk admin jika dibutuhkan).
   * Trigger DB akan otomatis sync users.sp_level & sp_notes.
   * 
   * @param {string} letterId
   */
  async delete(letterId) {
    const { error } = await supabase
      .from('sp_letters')
      .delete()
      .eq('letter_id', letterId)
    if (error) throw error
  },

  /**
   * Ambil statistik SP: jumlah jemaat per kategori SP aktif.
   */
  async getStats() {
    const { data: letters, error } = await supabase
      .from('sp_letters')
      .select('category_id, user_id')
      .eq('is_active', true)

    if (error) throw error
    if (!letters?.length) return []

    const categoryIds = [...new Set(letters.map(letter => letter.category_id))]
    const { data: categories, error: categoriesError } = await supabase
      .from('sp_categories')
      .select('category_id, name, level')
      .in('category_id', categoryIds)
    if (categoriesError) throw categoriesError

    const categoryById = new Map(categories.map(category => [category.category_id, category]))


    // Group by category, hitung unique user_id per kategori
    const categoryMap = new Map()
    letters.forEach(letter => {
      const category = categoryById.get(letter.category_id)
      if (!category) throw new Error('sp_category_unavailable')

      const catId = letter.category_id
      if (!categoryMap.has(catId)) {
        categoryMap.set(catId, {
          category_id: catId,
          name: category.name,
          level: category.level,
          users: new Set(),
        })
      }
      categoryMap.get(catId).users.add(letter.user_id)
    })

    return Array.from(categoryMap.values()).map(cat => ({
      category_id: cat.category_id,
      name: cat.name,
      level: cat.level,
      count: cat.users.size,
    })).sort((a, b) => a.level - b.level)
  },
}
