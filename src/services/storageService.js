import { supabase } from '@/lib/supabase'

export const storageService = {
  async getUsage() {
    const { data, error } = await supabase.rpc('measure_supabase_usage')
    if (error) throw error
    return data?.[0] || null
  },
  async getDailyUsage() {
    const { data, error } = await supabase.from('supabase_usage_daily')
      .select('snapshot_date, storage_bytes, database_bytes, captured_at')
      .order('snapshot_date', { ascending: false }).limit(8)
    if (error) throw error
    return data || []
  },
}
