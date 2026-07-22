import { useEffect, useState } from 'react'
import { Inbox, ChevronLeft, ChevronRight, X, Trash2, Eye, FileText } from 'lucide-react'
import { tasksService } from '@/services/tasksService'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import { Card, PageHeader, Spinner, EmptyState, Select, Input, Button, Badge } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { useLang } from '@/hooks/useLang'

const LIMIT = 20

export default function AdminResponsesPage() {
  const { t } = useLang()
  const { toast, confirm } = useToast()
  const { profile } = useAuth()
  const isGembala = profile?.role === 'Gembala'

  const [templates, setTemplates] = useState([])
  const [responses, setResponses] = useState([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [formId, setFormId] = useState(() => new URLSearchParams(window.location.search).get('form') || '')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [search, setSearch] = useState('')       // input mentah pencarian nama
  const [userQuery, setUserQuery] = useState('')  // versi ter-debounce (dikirim ke server)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)   // respon yang sedang dibuka
  const [deletingId, setDeletingId] = useState(null)

  // Daftar form untuk dropdown filter (sekali di awal).
  useEffect(() => {
    tasksService.getTemplates().then(setTemplates).catch(() => {})
  }, [])

  // Debounce pencarian nama 350ms agar tak query tiap ketikan.
  useEffect(() => {
    const id = setTimeout(() => { setUserQuery(search.trim()); setPage(1) }, 350)
    return () => clearTimeout(id)
  }, [search])

  useEffect(() => {
    setLoading(true)
    tasksService.getResponsesGlobal({
      page, limit: LIMIT,
      formId: formId || null,
      startDate: startDate || null,
      endDate: endDate ? `${endDate}T23:59:59` : null,
      userQuery: userQuery || null,
    })
      .then(({ data, count }) => { setResponses(data || []); setCount(count || 0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, formId, startDate, endDate, userQuery])

  function resetFilter() {
    setFormId(''); setStartDate(''); setEndDate(''); setSearch(''); setUserQuery(''); setPage(1)
  }

  async function handleDelete(r) {
    const ok = await confirm({
      title: t('aresp.deleteTitle'),
      message: t('aresp.deleteMsg', { name: r.users?.name || t('aresp.noName') }),
      confirmText: t('a.delete'),
      danger: true,
    })
    if (!ok) return
    setDeletingId(r.response_id)
    try {
      await tasksService.deleteResponse(r.response_id)
      setResponses(prev => prev.filter(x => x.response_id !== r.response_id))
      setCount(c => Math.max(0, c - 1))
      if (detail?.response_id === r.response_id) setDetail(null)
      toast.success(t('aresp.deleted'))
    } catch (err) {
      toast.error(err.message || t('aresp.deleteFailed'))
    } finally {
      setDeletingId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(count / LIMIT))
  const filterActive = !!(formId || startDate || endDate || userQuery)

  // Render satu nilai field sesuai tipenya (link utk file/gambar).
  function renderValue(field, val) {
    if ((field.type === 'file' || field.type === 'image') && val) {
      return <a href={val} target="_blank" rel="noreferrer" className="text-brand-500 underline">{t('aresp.viewFile')}</a>
    }
    if (field.type === 'checkbox') {
      return <span className="text-gray-700">{val ? t('aresp.yes') : t('aresp.no')}</span>
    }
    return <span className="text-gray-700 whitespace-pre-wrap break-words">{val || '-'}</span>
  }

  return (
    <div>
      <PageHeader
        title={t('aresp.title')}
        subtitle={t('aresp.subtitle', { count })}
      />

      {/* Filter */}
      <Card className="p-4 mb-4 space-y-3">
        <Input
          label={t('aresp.searchUser')}
          placeholder={t('aresp.searchUserPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <Select label={t('aresp.filterForm')} value={formId} onChange={e => { setFormId(e.target.value); setPage(1) }}>
          <option value="">{t('aresp.allForms')}</option>
          {templates.map(tpl => <option key={tpl.form_id} value={tpl.form_id}>{tpl.title}</option>)}
        </Select>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Input label={t('aresp.fromDate')} type="date" value={startDate} max={endDate || undefined}
              onChange={e => { setStartDate(e.target.value); setPage(1) }} />
          </div>
          <div className="flex-1">
            <Input label={t('aresp.toDate')} type="date" value={endDate} min={startDate || undefined}
              onChange={e => { setEndDate(e.target.value); setPage(1) }} />
          </div>
        </div>
        {filterActive && (
          <button onClick={resetFilter} className="inline-flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600">
            <X size={13} /> {t('aresp.resetFilter')}
          </button>
        )}
      </Card>

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && responses.length === 0 && (
        <EmptyState
          icon={Inbox}
          title={filterActive ? t('aresp.emptyFiltered') : t('aresp.empty')}
          description={filterActive ? t('aresp.emptyFilteredDesc') : t('aresp.emptyDesc')}
        />
      )}

      {!loading && responses.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {responses.map(r => (
            <div key={r.response_id} className="flex items-center gap-3 p-3.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{r.users?.name || t('aresp.noName')}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge>{r.form_templates?.title || t('aresp.deletedForm')}</Badge>
                  <span className="text-xs text-gray-400">{formatDate(r.submitted_at, 'd MMM yyyy, HH:mm')}</span>
                </div>
              </div>
              <button
                onClick={() => setDetail(r)}
                className="text-xs text-blue-500 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-50 flex-shrink-0"
              >
                <Eye size={14} /> {t('aresp.detail')}
              </button>
              {!isGembala && (
                <button
                  onClick={() => handleDelete(r)}
                  disabled={deletingId === r.response_id}
                  className="text-xs text-red-500 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 flex-shrink-0 disabled:opacity-50"
                >
                  <Trash2 size={14} /> {deletingId === r.response_id ? '…' : t('a.delete')}
                </button>
              )}
            </div>
          ))}
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="flex items-center gap-1 text-sm text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed">
            <ChevronLeft size={16} /> {t('aresp.prev')}
          </button>
          <span className="text-xs text-gray-400">{t('aresp.pageOf', { page, total: totalPages })}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="flex items-center gap-1 text-sm text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed">
            {t('aresp.next')} <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Modal Detail */}
      {detail && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-900">{detail.users?.name || t('aresp.noName')}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{detail.form_templates?.title || t('aresp.deletedForm')}</p>
                <p className="text-xs text-gray-400">{formatDate(detail.submitted_at, 'd MMMM yyyy, HH:mm')}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                <X size={18} />
              </button>
            </div>

            {(detail.form_templates?.fields_json || []).length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-xl px-3 py-2.5">
                <FileText size={15} /> {t('aresp.noForm')}
              </div>
            ) : (
              <div className="space-y-2.5">
                {(detail.form_templates?.fields_json || []).map(field => (
                  <div key={field.key} className="text-sm">
                    <p className="text-xs text-gray-400 mb-0.5">{field.label}</p>
                    {renderValue(field, detail.data_json?.[field.key])}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              {!isGembala && (
                <Button variant="danger" className="flex-1" loading={deletingId === detail.response_id} onClick={() => handleDelete(detail)}>
                  <Trash2 size={15} /> {t('a.delete')}
                </Button>
              )}
              <Button variant="outline" className="flex-1" onClick={() => setDetail(null)}>{t('common.close')}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
