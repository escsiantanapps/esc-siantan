import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Calendar, ClipboardList, AlertTriangle, Droplets, Heart, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Card, PageHeader, Spinner, StatusBadge } from '@/components/ui'
import { formatDate } from '@/lib/utils'

export default function AdminDashboardPage() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({ members: 0, events: 0, tasks: 0, sp: 0, baptism: 0, wedding: 0 })
  const [recentMembers, setRecentMembers] = useState([])
  const [pendingRegs, setPendingRegs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    try {
      const [members, events, tasks, spUsers, baptism, wedding, newMembers, pending] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'Aktif'),
        supabase.from('form_templates').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }).neq('sp_level', 'Aman'),
        supabase.from('baptism_registrations').select('*', { count: 'exact', head: true }).eq('status', 'Menunggu'),
        supabase.from('wedding_registrations').select('*', { count: 'exact', head: true }).eq('status', 'Menunggu'),
        supabase.from('users').select('name, role, status, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('baptism_registrations').select('baptism_id, full_name, status, created_at').eq('status', 'Menunggu').limit(3),
      ])
      setStats({
        members: members.count || 0,
        events: events.count || 0,
        tasks: tasks.count || 0,
        sp: spUsers.count || 0,
        baptism: baptism.count || 0,
        wedding: wedding.count || 0,
      })
      setRecentMembers(newMembers.data || [])
      setPendingRegs(pending.data || [])
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    { label: 'Total Jemaat', value: stats.members, icon: Users,          color: 'text-orange-500', bg: 'bg-orange-50', to: '/admin/jemaat' },
    { label: 'Events Aktif', value: stats.events,  icon: Calendar,       color: 'text-red-500',    bg: 'bg-red-50',    to: '/admin/events' },
    { label: 'Form Tugas',   value: stats.tasks,   icon: ClipboardList,  color: 'text-blue-500',   bg: 'bg-blue-50',   to: '/admin/tugas' },
    { label: 'Ada SP',       value: stats.sp,      icon: AlertTriangle,  color: 'text-amber-500',  bg: 'bg-amber-50',  to: '/admin/sp' },
    { label: 'Antri Baptis', value: stats.baptism, icon: Droplets,       color: 'text-teal-500',   bg: 'bg-teal-50',   to: '/admin/baptisan' },
    { label: 'Antri Nikah',  value: stats.wedding, icon: Heart,          color: 'text-pink-500',   bg: 'bg-pink-50',   to: '/admin/nikah' },
  ]

  if (loading) return <div className="flex justify-center items-center h-60"><Spinner size="lg" /></div>

  return (
    <div>
      <PageHeader
        title={`Halo, ${profile?.name?.split(' ')[0] || 'Admin'}`}
        subtitle="Ringkasan aktivitas gereja hari ini"
      />

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {statCards.map(({ label, value, icon: Icon, color, bg, to }) => (
          <Link key={label} to={to}>
            <Card className="p-4 hover:border-gray-200 transition-colors">
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                <Icon size={20} className={color} strokeWidth={1.5} />
              </div>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Jemaat terbaru */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Jemaat Terbaru</h3>
            <Link to="/admin/jemaat" className="text-xs text-orange-500 flex items-center gap-0.5">
              Semua <ChevronRight size={13} />
            </Link>
          </div>
          <div className="space-y-3">
            {recentMembers.map((m, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full gradient-main flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {m.name?.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                  <p className="text-xs text-gray-400">{m.role}</p>
                </div>
                <StatusBadge status={m.status} />
              </div>
            ))}
          </div>
        </Card>

        {/* Pendaftaran masuk */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Antrian Pendaftaran</h3>
            <Link to="/admin/baptisan" className="text-xs text-orange-500 flex items-center gap-0.5">
              Lihat <ChevronRight size={13} />
            </Link>
          </div>
          {pendingRegs.length === 0
            ? <p className="text-sm text-gray-400 text-center py-4">Tidak ada antrian</p>
            : (
              <div className="space-y-3">
                {pendingRegs.map((r, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                      <Droplets size={15} className="text-teal-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.full_name}</p>
                      <p className="text-xs text-gray-400">{formatDate(r.created_at)}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            )
          }
        </Card>
      </div>
    </div>
  )
}
