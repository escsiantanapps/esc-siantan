import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Users, ChevronRight as Arrow } from 'lucide-react'
import { usersService } from '@/services/usersService'
import { Card, Input, Select, PageHeader, Spinner, EmptyState, Badge, StatusBadge, Avatar } from '@/components/ui'
import { spColor } from '@/lib/utils'

const LIMIT = 20

export default function AdminMembersPage() {
  const [members, setMembers] = useState([])
  const [count, setCount] = useState(0)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const timer = setTimeout(() => {
      usersService.getAll({ search, role, status, page, limit: LIMIT })
        .then(({ data, count }) => { setMembers(data); setCount(count) })
        .catch(() => {})
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [search, role, status, page])

  const totalPages = Math.max(1, Math.ceil(count / LIMIT))

  return (
    <div>
      <PageHeader title="Manajemen Jemaat" subtitle={`${count} jemaat & volunteer terdaftar`} />

      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <div className="sm:col-span-1">
          <Input
            placeholder="Cari nama..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <Select value={role} onChange={e => { setRole(e.target.value); setPage(1) }}>
          <option value="">Semua Role</option>
          {['Jemaat', 'Volunteer', 'PKS', 'Admin', 'Super Admin'].map(r => <option key={r} value={r}>{r}</option>)}
        </Select>
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Semua Status</option>
          <option value="Aktif">Aktif</option>
          <option value="Nonaktif">Nonaktif</option>
        </Select>
      </div>

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && members.length === 0 && (
        <EmptyState icon={Users} title="Tidak ada jemaat ditemukan" description="Coba ubah kata kunci atau filter pencarian." />
      )}

      {!loading && members.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {members.map(m => (
            <Link key={m.user_id} to={`/admin/jemaat/${m.user_id}`} className="flex items-center gap-3 p-3.5 hover:bg-gray-50 transition-colors">
              <Avatar name={m.name} src={m.photo_url} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                <p className="text-xs text-gray-400">{m.role}{m.phone ? ` · ${m.phone}` : ''}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={m.status} />
                {m.sp_level && m.sp_level !== 'Aman' && (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${spColor(m.sp_level)}`}>{m.sp_level}</span>
                )}
              </div>
              <Arrow size={16} className="text-gray-300 flex-shrink-0" />
            </Link>
          ))}
        </Card>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 text-sm text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} /> Sebelumnya
          </button>
          <span className="text-xs text-gray-400">Halaman {page} dari {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 text-sm text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Berikutnya <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
