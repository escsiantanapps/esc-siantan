import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { tasksService } from '@/services/tasksService'
import { Card, Spinner, EmptyState, Input } from '@/components/ui'
import { formatDate } from '@/lib/utils'

const LIMIT = 20

export default function AdminTaskResponsesPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [template, setTemplate] = useState(null)
  const [responses, setResponses] = useState([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      tasksService.getTemplateById(id),
      tasksService.getAllResponses(id, {
        page,
        limit: LIMIT,
        startDate: startDate || null,
        endDate: endDate ? `${endDate}T23:59:59` : null,
      }),
    ])
      .then(([tmpl, { data, count }]) => {
        setTemplate(tmpl)
        setResponses(data)
        setCount(count)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id, page, startDate, endDate])

  function resetFilter() {
    setStartDate('')
    setEndDate('')
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(count / LIMIT))

  if (loading && !template) return <div className="flex justify-center items-center h-60"><Spinner /></div>

  const filterActive = !!(startDate || endDate)

  return (
    <div className="max-w-2xl">
      <button onClick={() => navigate('/admin/tugas')} className="flex items-center gap-1 text-sm text-gray-500 mb-4">
        <ArrowLeft size={16} /> Kembali ke Form & Tugas
      </button>

      <h1 className="text-lg font-semibold text-gray-900 mb-1">{template?.title}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {count} jawaban{filterActive ? ' (terfilter)' : ' terkumpul'}
      </p>

      {/* Filter rentang tanggal */}
      <Card className="p-4 mb-4">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Input
              label="Dari tanggal"
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={e => { setStartDate(e.target.value); setPage(1) }}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Sampai tanggal"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={e => { setEndDate(e.target.value); setPage(1) }}
            />
          </div>
        </div>
        {filterActive && (
          <button onClick={resetFilter} className="mt-3 inline-flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600">
            <X size={13} /> Reset filter
          </button>
        )}
      </Card>

      {loading && <div className="flex justify-center py-8"><Spinner /></div>}

      {!loading && responses.length === 0 && (
        <EmptyState
          title={filterActive ? 'Tidak ada jawaban pada rentang ini' : 'Belum ada jawaban'}
          description={filterActive ? 'Coba ubah atau reset rentang tanggal.' : 'Jawaban dari jemaat/volunteer akan muncul di sini.'}
        />
      )}

      <div className="space-y-3">
        {!loading && responses.map(r => (
          <Card key={r.response_id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-900">{r.users?.name || 'Tanpa nama'}</p>
              <span className="text-xs text-gray-400">{formatDate(r.submitted_at, 'd MMM yyyy, HH:mm')}</span>
            </div>
            {(template?.fields_json || []).length === 0 ? (
              <p className="text-xs text-gray-400">Tugas tanpa form — ditandai selesai.</p>
            ) : (
              <div className="space-y-1.5">
                {(template?.fields_json || []).map(field => (
                  <div key={field.key} className="text-sm">
                    <span className="text-gray-400">{field.label}: </span>
                    {field.type === 'file' && r.data_json?.[field.key] ? (
                      <a href={r.data_json[field.key]} target="_blank" rel="noreferrer" className="text-orange-500 underline">Lihat file</a>
                    ) : field.type === 'checkbox' ? (
                      <span className="text-gray-700">{r.data_json?.[field.key] ? 'Ya' : 'Tidak'}</span>
                    ) : (
                      <span className="text-gray-700">{r.data_json?.[field.key] || '-'}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="flex items-center gap-1 text-sm text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed">
            <ChevronLeft size={16} /> Sebelumnya
          </button>
          <span className="text-xs text-gray-400">Halaman {page} dari {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="flex items-center gap-1 text-sm text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed">
            Berikutnya <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
