import { useEffect, useRef, useState } from 'react'
import { ChevronDown, HardDrive, RefreshCw, Trash2, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { Card, Button, Checkbox, Input, Select } from '@/components/ui'
import { storageCleanupService } from '@/services/storageCleanupService'

const SELECTION_LIMIT = 10
const BULK_BATCH_SIZE = 20
const INITIAL_FILTER = { month: '', status: 'all', minBytes: 0, query: '' }

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatUploadedAt(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short',
  })
}

export default function ResponseStorageManager({ onBusyChange }) {
  const { t } = useLang()
  const { toast, confirm } = useToast()
  const [filter, setFilter] = useState(INITIAL_FILTER)
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)
  const [bulk, setBulk] = useState(null)
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    return () => { cancelled.current = true }
  }, [])
  useEffect(() => { onBusyChange?.(busy) }, [busy, onBusyChange])

  function updateFilter(patch) {
    setFilter(current => ({ ...current, ...patch }))
    setData(null)
    setSelected([])
    setBulk(null)
  }

  async function scan(currentFilter = filter) {
    setBusy(true)
    setSelected([])
    try {
      setData(await storageCleanupService.scanResponses(currentFilter))
    } catch (err) {
      setData(null)
      toast.error(t('backup.responseFilesError', { msg: err.message }))
    } finally {
      setBusy(false)
    }
  }

  function toggleFile(path) {
    setSelected(current => {
      if (current.includes(path)) return current.filter(item => item !== path)
      if (current.length >= SELECTION_LIMIT) { toast.info(t('backup.responseFilesLimit')); return current }
      return [...current, path]
    })
  }

  function showDeleteResult(result) {
    if (result.deleted.length) toast.success(t('backup.responseFilesDeleted', {
      count: result.deleted.length, size: formatSize(result.freedBytes),
    }))
    if (result.failed.length) toast.error(t('backup.responseFilesFailed', { count: result.failed.length }))
    if (result.auditFailed?.length) toast.error(t('backup.responseFilesAuditFailed', { count: result.auditFailed.length }))
    if (result.restoreFailed?.length) toast.error(t('backup.responseFilesRestoreFailed', { count: result.restoreFailed.length }))
  }

  async function refreshAfterChange() {
    try { setData(await storageCleanupService.scanResponses(filter)) }
    catch {
      setData(null)
      toast.info(t('backup.responseFilesRefreshLater'))
    }
  }

  async function deleteSelected() {
    const files = data?.files?.filter(file => selected.includes(file.path)) || []
    if (!files.length) return
    const ok = await confirm({
      title: t('backup.responseFilesConfirmTitle'),
      message: t('backup.responseFilesConfirm', {
        count: files.length, size: formatSize(files.reduce((sum, file) => sum + file.size, 0)),
      }),
      confirmText: t('backup.responseFilesDelete'), danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const result = await storageCleanupService.deleteResponseFiles(selected, filter)
      showDeleteResult(result)
      setSelected([])
      await refreshAfterChange()
    } catch (err) {
      setData(null)
      toast.error(t('backup.responseFilesError', { msg: err.message }))
    } finally {
      setBusy(false)
    }
  }

  async function waitForRateLimit(seconds) {
    const until = Date.now() + Math.min(90, Math.max(1, seconds)) * 1000
    while (!cancelled.current && Date.now() < until) {
      const remaining = Math.ceil((until - Date.now()) / 1000)
      setBulk(current => current && ({ ...current, waiting: remaining }))
      await new Promise(resolve => setTimeout(resolve, Math.min(1000, until - Date.now())))
    }
    setBulk(current => current && ({ ...current, waiting: 0 }))
  }

  async function deleteAllFiltered() {
    if (!data?.candidateCount || busy) return
    setBusy(true)
    cancelled.current = false
    let done = 0
    let deleted = 0
    let failed = 0
    let freedBytes = 0
    let stopped = false
    try {
      // Daftar path dibuat sebelum konfirmasi. Batch berikutnya hanya memakai
      // daftar ini; file baru yang muncul selama proses tidak ikut terhapus.
      const prepared = await storageCleanupService.prepareResponseBulk(filter)
      if (!prepared.candidateCount) { await refreshAfterChange(); return }
      const ok = await confirm({
        title: t('backup.responseFilesBulkTitle'),
        message: t('backup.responseFilesBulkConfirm', {
          count: prepared.candidateCount, size: formatSize(prepared.candidateBytes),
        }),
        confirmText: t('backup.responseFilesBulkDelete'), danger: true,
      })
      if (!ok) return
      setBulk({ total: prepared.candidateCount, done: 0, deleted: 0, failed: 0, freedBytes: 0, waiting: 0, running: true })
      for (let index = 0; index < prepared.paths.length; index += BULK_BATCH_SIZE) {
        if (cancelled.current) { stopped = true; break }
        const paths = prepared.paths.slice(index, index + BULK_BATCH_SIZE)
        let result
        for (;;) {
          try { result = await storageCleanupService.deleteResponseFiles(paths, filter); break }
          catch (err) {
            if (err.status !== 429) throw err
            await waitForRateLimit(err.retryAfterSeconds)
            if (cancelled.current) { stopped = true; break }
          }
        }
        if (stopped) break
        done += paths.length
        deleted += result.deleted.length
        failed += result.failed.length
        freedBytes += result.freedBytes
        setBulk(current => ({ ...current, done, deleted, failed, freedBytes }))
        if (result.auditFailed?.length) {
          toast.error(t('backup.responseFilesAuditFailed', { count: result.auditFailed.length }))
          stopped = true
          break
        }
        if (result.restoreFailed?.length) {
          toast.error(t('backup.responseFilesRestoreFailed', { count: result.restoreFailed.length }))
          stopped = true
          break
        }
      }
      setBulk(current => current && ({ ...current, running: false }))
      toast.info(t(stopped ? 'backup.responseFilesBulkStopped' : 'backup.responseFilesBulkDone', {
        deleted, failed, size: formatSize(freedBytes),
      }))
      setSelected([])
      await refreshAfterChange()
    } catch (err) {
      setBulk(current => current && ({ ...current, running: false }))
      toast.error(t('backup.responseFilesBulkError', { done, msg: err.message }))
      setData(null)
    } finally {
      setBusy(false)
    }
  }

  return <Card id="backup-response-files" className="mb-4 overflow-hidden scroll-mt-20">
    <div className="p-4 sm:p-5 border-b border-gray-100">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-control flex items-center justify-center shrink-0">
          <HardDrive size={20} className="text-brand-600" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">{t('backup.responseFilesTitle')}</h2>
          <p className="text-sm text-gray-600 mt-1">{t('backup.responseFilesDesc')}</p>
        </div>
      </div>
    </div>

    <div className="p-4 sm:p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Input label={t('backup.responseFilesMonth')} type="month" value={filter.month}
          onChange={e => updateFilter({ month: e.target.value })} disabled={busy} />
        <Select label={t('backup.responseFilesStatus')} value={filter.status}
          onChange={e => updateFilter({ status: e.target.value })} disabled={busy}>
          <option value="all">{t('backup.responseFilesAllStatus')}</option>
          <option value="active">{t('backup.responseFilesActiveFilter')}</option>
          <option value="orphan">{t('backup.responseFilesOrphanFilter')}</option>
        </Select>
      </div>
      <details className="rounded-xl border border-gray-200 group">
        <summary className="min-h-11 flex items-center px-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden text-sm font-medium text-gray-700">
          {t('backup.responseFilesMoreFilters')}
          {(filter.minBytes || filter.query) ? <span className="ml-2 text-brand-600">•</span> : null}
          <ChevronDown size={16} className="ml-auto text-gray-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 border-t border-gray-100">
          <Select label={t('backup.responseFilesMinSize')} value={filter.minBytes}
            onChange={e => updateFilter({ minBytes: Number(e.target.value) })} disabled={busy}>
            <option value={0}>{t('backup.responseFilesAnySize')}</option>
            <option value={1024 * 1024}>1 MB+</option>
            <option value={5 * 1024 * 1024}>5 MB+</option>
          </Select>
          <Input label={t('backup.responseFilesSearch')} value={filter.query} maxLength={80}
            placeholder={t('backup.responseFilesSearchPh')}
            onChange={e => updateFilter({ query: e.target.value })} disabled={busy} />
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => scan()} loading={busy} disabled={busy}>
          <RefreshCw size={16} /> {t('backup.responseFilesScan')}
        </Button>
        {(filter.month || filter.status !== 'all' || filter.minBytes || filter.query) &&
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => updateFilter(INITIAL_FILTER)}>
            {t('backup.responseFilesReset')}
          </Button>}
      </div>
      {import.meta.env.DEV && <p className="text-xs text-gray-500">{t('backup.cleanupLocalPreview')}</p>}

      {data && <>
        <div className="grid grid-cols-2 gap-2" aria-live="polite">
          <div className="rounded-xl bg-control p-3">
            <p className="text-xs text-gray-600">{t('backup.responseFilesCount')}</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">{data.candidateCount.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-control p-3">
            <p className="text-xs text-gray-600">{t('backup.responseFilesPotentialSpace')}</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">{formatSize(data.candidateBytes)}</p>
          </div>
        </div>
        <p className="text-xs text-gray-600">{t('backup.responseFilesScanned', { count: data.scannedFiles })}</p>
        {data.files.length > 0 ? <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-600">{t('backup.responseFilesShowing', { count: data.files.length })}</p>
            <p className="text-xs text-gray-600">{t('backup.responseFilesSelectedCount', { count: selected.length })}</p>
          </div>
          <div className="max-h-96 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
            {data.files.map(file => <div key={file.path} className="flex items-center gap-3 p-3 min-w-0">
              <Checkbox checked={selected.includes(file.path)} onChange={() => toggleFile(file.path)}
                disabled={busy} className="min-w-0 flex-1"
                label={<span className="min-w-0 block">
                  <span className="block text-sm font-medium text-gray-800 break-all">{file.path.split('/').at(-1)}</span>
                  <span className="block text-xs text-gray-600">{formatSize(file.size)} · {formatUploadedAt(file.createdAt)}</span>
                  <span className="block text-xs text-gray-600 break-all">{file.orphan ? t('backup.responseFilesOrphan') : `${t('backup.responseFilesForm')} ${file.formId || '—'}`}</span>
                </span>} />
              <a href={supabase.storage.from('task-files').getPublicUrl(file.path).data.publicUrl}
                target="_blank" rel="noopener noreferrer" className="min-h-11 inline-flex items-center text-sm text-brand-600 shrink-0 px-2 py-2">
                {t('backup.cleanupOpen')}
              </a>
            </div>)}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-1 border-t border-gray-100">
            <Button variant="danger" onClick={deleteSelected} loading={busy} disabled={import.meta.env.DEV || busy || !selected.length} className="flex-1">
              <Trash2 size={16} /> {t('backup.responseFilesDeleteSelected', { count: selected.length })}
            </Button>
            <Button variant="outline" onClick={deleteAllFiltered} disabled={import.meta.env.DEV || busy || !data.candidateCount}
              className="flex-1 border-red-300 text-red-700">
              <Trash2 size={16} /> {t('backup.responseFilesBulkButton', { count: data.candidateCount })}
            </Button>
          </div>
        </> : <p className="rounded-xl bg-control p-4 text-sm text-gray-600">{t('backup.responseFilesEmpty')}</p>}
      </>}

      {bulk && <div className="rounded-xl bg-control p-3 space-y-2" aria-live="polite">
        <p className="text-sm font-medium text-gray-800">{t('backup.responseFilesBulkProgress', { done: bulk.done, total: bulk.total })}</p>
        <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
          <div className="h-full bg-brand-500" style={{ width: `${Math.round((bulk.done / bulk.total) * 100)}%` }} />
        </div>
        <p className="text-xs text-gray-600">{t('backup.responseFilesBulkFreed', { count: bulk.deleted, size: formatSize(bulk.freedBytes) })}</p>
        {bulk.failed > 0 && <p className="text-xs text-red-700">{t('backup.responseFilesFailed', { count: bulk.failed })}</p>}
        {bulk.running && <p className="text-xs text-gray-600">{t('backup.responseFilesBulkKeepOpen')}</p>}
        {bulk.waiting > 0 && <p className="text-xs text-gray-600">{t('backup.responseFilesBulkWaiting', { seconds: bulk.waiting })}</p>}
        {bulk.running && <Button variant="secondary" size="sm" onClick={() => { cancelled.current = true }}>
          <XCircle size={15} /> {t('backup.responseFilesBulkStop')}
        </Button>}
      </div>}

      <details className="border-t border-gray-100 pt-2 group">
        <summary className="min-h-11 flex items-center cursor-pointer list-none [&::-webkit-details-marker]:hidden text-xs font-medium text-gray-600">
          {t('backup.responseFilesRules')}
          <ChevronDown size={15} className="ml-auto transition-transform group-open:rotate-180" />
        </summary>
        <p className="pb-2 text-xs text-gray-600">{t('backup.responseFilesWarning')}</p>
      </details>
    </div>
  </Card>
}
