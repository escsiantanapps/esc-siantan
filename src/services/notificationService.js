import { supabase } from '@/lib/supabase'

export const notificationService = {
  // Mengambil total item yang membutuhkan perhatian berdasarkan role admin
  async getAdminPendingCounts(role) {
    const counts = {
      pendingUsers: 0,
      pendingEvents: 0,
      pendingClasses: 0,
      pendingEvaluations: 0
    }

    try {
      if (role === 'Super Admin' || role === 'Admin') {
        const [{ count: users }, { count: classes }, { count: events }, { count: evals }] = await Promise.all([
          supabase.from('users').select('*', { count: 'exact', head: true }).eq('status', 'Menunggu Persetujuan'),
          supabase.from('class_registrations').select('*', { count: 'exact', head: true }).eq('status', 'Menunggu'),
          supabase.from('event_registrations').select('*', { count: 'exact', head: true }).eq('status', 'Menunggu'),
          supabase.from('evaluations').select('*', { count: 'exact', head: true }).eq('status', 'Menunggu')
        ])
        counts.pendingUsers = users || 0
        counts.pendingClasses = classes || 0
        counts.pendingEvents = events || 0
        counts.pendingEvaluations = evals || 0
      } else if (role === 'Admin Kelas') {
        const [{ count: classes }, { count: events }] = await Promise.all([
          supabase.from('class_registrations').select('*', { count: 'exact', head: true }).eq('status', 'Menunggu'),
          supabase.from('event_registrations').select('*', { count: 'exact', head: true }).eq('status', 'Menunggu')
        ])
        counts.pendingClasses = classes || 0
        counts.pendingEvents = events || 0
      } else if (role === 'Admin Komsel') {
        const [{ count: evals }] = await Promise.all([
          supabase.from('evaluations').select('*', { count: 'exact', head: true }).eq('status', 'Menunggu')
        ])
        counts.pendingEvaluations = evals || 0
      }
    } catch (err) {
      console.error('Error fetching pending counts:', err)
    }

    return counts
  }
}
