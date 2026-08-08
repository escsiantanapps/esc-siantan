import { supabase } from '@/lib/supabase'

const ITEM_FIELDS = [
  'code', 'name', 'category_id', 'item_type', 'unit',
  'minimum_stock', 'location', 'item_condition', 'notes', 'is_active', 'photo_url',
]

function pickItemFields(value) {
  return Object.fromEntries(ITEM_FIELDS.filter(key => key in value).map(key => [key, value[key]]))
}

export const inventoryService = {
  async getCategories() {
    const { data, error } = await supabase
      .from('inventory_categories')
      .select('*')
      .order('name')
    if (error) throw error
    return data || []
  },

  async createCategory(payload) {
    const { data, error } = await supabase
      .from('inventory_categories')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateCategory(id, payload) {
    const { data, error } = await supabase
      .from('inventory_categories')
      .update(payload)
      .eq('category_id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteCategory(id) {
    const { error } = await supabase
      .from('inventory_categories')
      .delete()
      .eq('category_id', id)
    if (error) throw error
  },

  async getItems() {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*, inventory_categories(category_id, name)')
      .order('name')
    if (error) throw error
    return data || []
  },

  async createItem(payload) {
    const { data, error } = await supabase
      .from('inventory_items')
      .insert(pickItemFields(payload))
      .select('*, inventory_categories(category_id, name)')
      .single()
    if (error) throw error
    return data
  },

  async updateItem(id, payload) {
    const { data, error } = await supabase
      .from('inventory_items')
      .update(pickItemFields(payload))
      .eq('item_id', id)
      .select('*, inventory_categories(category_id, name)')
      .single()
    if (error) throw error
    return data
  },

  async setItemActive(id, isActive) {
    return this.updateItem(id, { is_active: isActive })
  },

  async uploadItemPhoto(itemId, file) {
    const path = `items/${itemId}/main`
    const { error } = await supabase.storage
      .from('inventory-photos')
      .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })
    if (error) throw error
    const { data } = supabase.storage.from('inventory-photos').getPublicUrl(path)
    return `${data.publicUrl}?v=${Date.now()}`
  },

  async removeItemPhoto(itemId) {
    const { error } = await supabase.storage
      .from('inventory-photos')
      .remove([`items/${itemId}/main`])
    if (error) throw error
  },

  async getTransactions(limit = 500) {
    const { data, error } = await supabase
      .from('inventory_transactions')
      .select('*, inventory_items(item_id, code, name, unit), users(name)')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data || []
  },

  async adjustStock(itemId, transactionType, quantity, notes) {
    const { data, error } = await supabase.rpc('adjust_inventory_stock', {
      p_item_id: itemId,
      p_transaction_type: transactionType,
      p_quantity: quantity,
      p_notes: notes || null,
    })
    if (error) throw error
    return data
  },

  async getLoans(limit = 500) {
    const { data, error } = await supabase
      .from('inventory_loans')
      .select('*, inventory_items(item_id, code, name, unit)')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data || []
  },

  async createLoan(payload) {
    const { data, error } = await supabase.rpc('create_inventory_loan', {
      p_item_id: payload.item_id,
      p_borrower_name: payload.borrower_name,
      p_borrower_contact: payload.borrower_contact || null,
      p_quantity: payload.quantity,
      p_loan_date: payload.loan_date,
      p_due_date: payload.due_date || null,
      p_condition_out: payload.condition_out,
      p_notes: payload.notes || null,
    })
    if (error) throw error
    return data
  },

  async returnLoan(loanId, quantity, conditionIn, notes) {
    const { data, error } = await supabase.rpc('return_inventory_loan', {
      p_loan_id: loanId,
      p_quantity: quantity,
      p_condition_in: conditionIn,
      p_notes: notes || null,
    })
    if (error) throw error
    return data
  },
}