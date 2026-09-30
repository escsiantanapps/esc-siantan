import { supabase } from '@/lib/supabase'

async function countRows(table, column = 'status', value = 'Menunggu') {
  const { count, error } = await supabase.from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, value)
  if (error) throw error
  return count || 0
}

async function countPendingPrerequisites(targetColumn) {
  const { count, error } = await supabase.from('registration_prerequisites')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'Menunggu')
    .not(targetColumn, 'is', null)
  if (error) throw error
  return count || 0
}

async function getPendingPrerequisiteCounts(targetColumn) {
  const { data, error } = await supabase.from('registration_prerequisites')
    .select(targetColumn).eq('status', 'Menunggu').not(targetColumn, 'is', null)
  if (error) throw error
  return (data || []).reduce((counts, row) => {
    const targetId = row[targetColumn]
    counts[targetId] = (counts[targetId] || 0) + 1
    return counts
  }, {})
}

export const notificationService = {
  // Satu sumber hitungan untuk seluruh pekerjaan admin yang benar-benar
  // berstatus Menunggu di database. Kegagalan satu tabel tidak menghapus
  // badge sah dari tabel lain.
  async getAdminPendingCounts(role) {
    const counts = {
      pendingUsers: 0,
      pendingEvents: 0,
      pendingClasses: 0,
      pendingBaptism: 0,
      pendingWedding: 0,
      pendingDedication: 0,
      pendingKtj: 0,
      pendingLeaves: 0,
      pendingOfferings: 0,
      pendingPersonalOfferings: 0,
      pendingKomselOfferings: 0,
    }

    if (role === 'Super Admin' || role === 'Admin') {
      const entries = [
        ['pendingUsers', () => countRows('users', 'status', 'Menunggu Persetujuan')],
        ['pendingClasses', () => countPendingPrerequisites('class_id')],
        ['pendingEvents', () => countPendingPrerequisites('event_id')],
        ['pendingBaptism', () => countRows('baptism_registrations')],
        ['pendingWedding', () => countRows('wedding_registrations')],
        ['pendingDedication', () => countRows('child_dedication_registrations')],
        ['pendingKtj', () => countRows('ktj_registrations')],
        ['pendingLeaves', () => countRows('task_leaves')],
        ['pendingPersonalOfferings', () => countRows('offerings')],
        ['pendingKomselOfferings', () => countRows('komsel_offerings')],
      ]
      const results = await Promise.allSettled(entries.map(([, load]) => load()))
      results.forEach((result, index) => {
        const key = entries[index][0]
        if (result.status === 'fulfilled') counts[key] = result.value
        else console.error(`Error fetching ${key}:`, result.reason)
      })
      counts.pendingOfferings = counts.pendingPersonalOfferings + counts.pendingKomselOfferings
    } else if (role === 'Admin Kelas') {
      const results = await Promise.allSettled([
        countPendingPrerequisites('class_id'),
        countPendingPrerequisites('event_id'),
      ])
      if (results[0].status === 'fulfilled') counts.pendingClasses = results[0].value
      if (results[1].status === 'fulfilled') counts.pendingEvents = results[1].value
    }

    return counts
  },

  // Halaman yang menyelesaikan antrean memanggil ini agar badge berubah tanpa reload.
  notifyPendingChanged() {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('admin-pending-changed'))
  },

  // Menandai item mana yang perlu ditinjau, bukan sekadar total sidebar.
  async getPendingPrerequisiteCounts(targetColumn) {
    return getPendingPrerequisiteCounts(targetColumn)
  },
}
