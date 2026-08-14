import { supabase } from '@/lib/supabase'

async function countPendingUsers() {
  const { count, error } = await supabase.from('users')
    .select('user_id', { count: 'exact', head: true })
    .eq('status', 'Menunggu Persetujuan')
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

export const notificationService = {
  // Mengambil total item yang membutuhkan perhatian berdasarkan role admin
  async getAdminPendingCounts(role) {
    const counts = {
      pendingUsers: 0,
      pendingEvents: 0,
      pendingClasses: 0
    }

    try {
      if (role === 'Super Admin' || role === 'Admin') {
        const [users, classes, events] = await Promise.all([
          countPendingUsers(),
          countPendingPrerequisites('class_id'),
          countPendingPrerequisites('event_id')
        ])
        counts.pendingUsers = users
        counts.pendingClasses = classes
        counts.pendingEvents = events
      } else if (role === 'Admin Kelas') {
        const [classes, events] = await Promise.all([
          countPendingPrerequisites('class_id'),
          countPendingPrerequisites('event_id')
        ])
        counts.pendingClasses = classes
        counts.pendingEvents = events
      }
    } catch (err) {
      console.error('Error fetching pending counts:', err)
    }

    return counts
  }
}
