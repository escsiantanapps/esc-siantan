import { useState, useEffect, useMemo, useRef } from 'react'
import { HardDrive, Download, CheckCircle2, AlertTriangle, FileJson, FolderOpen, FolderCheck, Trash2, RefreshCw, File, ArchiveRestore, Upload, Package, ClipboardList } from 'lucide-react'
import JSZip from 'jszip'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { Card, PageHeader, Button, Input, Select, Avatar, Badge } from '@/components/ui'
import { BACKUP_TABLES } from '@/lib/backupTables'
import { buildBackupWorkbook, buildBackupJson } from '@/lib/backupBuild'
import { coldArchiveService } from '@/services/coldArchiveService'

// File System Access API tersedia di Chrome/Edge — tidak di Firefox/Safari.
const FS_SUPPORTED = typeof window !== 'undefined' && 'showDirectoryPicker' in window

async function fetchAll(table) {
  const PAGE = 1000
  let all = [], from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table).select('*').range(from, from + PAGE - 1)
    if (error) throw error
    if (!data?.length) break
    all = all.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

// Unduh Blob sebagai file di browser (fallback bila tidak ada folder terpilih).
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Simpan Blob langsung ke folder yang dipilih lewat File System Access API.
// Mengembalikan true bila berhasil, false bila gagal (mis. permission dicabut).
async function saveToFolder(dirHandle, blob, filename) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(blob)
  await writable.close()
}

// Baca daftar file backup yang sudah ada di folder (nama cocok pola ESC-Siantan-Backup-*).
async function listBackupFiles(dirHandle) {
  const files = []
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file' && (entry.name.startsWith('ESC-Siantan-Backup-') || entry.name.startsWith('ESC-Siantan-Respon-'))) {
      const file = await entry.getFile()
      files.push({ name: entry.name, size: file.size, lastModified: file.lastModified })
    }
  }
  return files.sort((a, b) => b.lastModified - a.lastModified)
}

// Daftar semua file di satu bucket Storage (paginasi 1000).
async function listBucketFiles(bucket) {
  const files = []
  // Supabase Storage list() hanya satu level — perlu rekursi per folder.
  async function listFolder(prefix) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix || undefined, { limit: 1000 })
    if (error) throw error
    for (const item of data || []) {
      if (item.id === null) {
        // folder (metadata id null = subfolder)
        const sub = prefix ? `${prefix}/${item.name}` : item.name
        await listFolder(sub)
      } else {
        files.push(prefix ? `${prefix}/${item.name}` : item.name)
      }
    }
  }
  await listFolder('')
  return files
}

// Download satu file dari bucket sebagai ArrayBuffer.
async function downloadStorageFile(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error) throw error
  return data.arrayBuffer()
}

function responseFilePaths(value, paths = new Set()) {
  if (Array.isArray(value)) value.forEach(v => responseFilePaths(v, paths))
  else if (value && typeof value === 'object') Object.values(value).forEach(v => responseFilePaths(v, paths))
  else if (typeof value === 'string') {
    const marker = '/storage/v1/object/public/task-files/'
    const index = value.indexOf(marker)
    if (index >= 0) {
      const path = decodeURIComponent(value.slice(index + marker.length).split('?')[0])
      if (path.startsWith('responses/')) paths.add(path)
    }
  }
  return paths
}

async function sha256(blob) {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function answerText(value) {
  if (value == null || value === '') return '-'
  if (Array.isArray(value)) return value.map(answerText).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// Restore semua baris JSON ke Supabase menggunakan upsert per tabel.
// Kembalikan { restored, errors } setelah semua tabel dicoba.
async function restoreFromJson(json, onProgress) {
  const tables = json?.tables
  if (!tables) throw new Error('Format JSON tidak dikenal — bukan file backup ESC Siantan.')
  const keys = Object.keys(tables)
  const errors = []
  let restored = 0
  for (let i = 0; i < keys.length; i++) {
    const table = keys[i]
    const rows = tables[table]
    if (!Array.isArray(rows) || rows.length === 0) continue
    onProgress?.({ current: i + 1, total: keys.length, label: table })
    // Upsert dalam batch 500 baris supaya tidak timeout.
    const BATCH = 500
    for (let b = 0; b < rows.length; b += BATCH) {
      const chunk = rows.slice(b, b + BATCH)
      const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' })
      if (error) { errors.push({ table, msg: error.message }); break }
      restored += chunk.length
    }
  }
  return { restored, errors }
}

export default function AdminBackupPage() {
  const { toast, confirm } = useToast()
  const { t } = useLang()
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' })
  const [result, setResult] = useState(null)
  const [errors, setErrors] = useState([])

  // State folder Synology
  const [dirHandle, setDirHandle] = useState(null)
  const [dirName, setDirName] = useState('')
  const [folderFiles, setFolderFiles] = useState([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [permGranted, setPermGranted] = useState(false)

  // State arsip storage
  const [archiving, setArchiving] = useState(false)
  const [archiveProgress, setArchiveProgress] = useState({ current: 0, total: 0, label: '' })
  const [archiveResult, setArchiveResult] = useState(null)

  // Arsip data dingin SOP: salin lokal dulu, hapus sumber pada aksi kedua.
  const [coldCutoff, setColdCutoff] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10)
  })
  const [coldPreview, setColdPreview] = useState(null)
  const [coldBusy, setColdBusy] = useState(false)
  const [coldResult, setColdResult] = useState(null)
  const [coldHistory, setColdHistory] = useState(null)
  const [coldHistoryFormId, setColdHistoryFormId] = useState('')
  const [coldHistorySearch, setColdHistorySearch] = useState('')
  const [coldHistoryStart, setColdHistoryStart] = useState('')
  const [coldHistoryEnd, setColdHistoryEnd] = useState('')
  const [coldSelectedResponse, setColdSelectedResponse] = useState(null)

  // State restore
  const restoreInputRef = useRef(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreProgress, setRestoreProgress] = useState({ current: 0, total: 0, label: '' })
  const [restoreResult, setRestoreResult] = useState(null)

  const coldHistoryForms = coldHistory?.context?.forms || []
  const coldHistoryUsers = coldHistory?.context?.users || []
  const coldHistoryFormMap = useMemo(() => Object.fromEntries(coldHistoryForms.map(form => [form.form_id, form])), [coldHistoryForms])
  const coldHistoryUserMap = useMemo(() => Object.fromEntries(coldHistoryUsers.map(user => [user.user_id, user])), [coldHistoryUsers])
  const coldHistoryRows = useMemo(() => {
    const query = coldHistorySearch.trim().toLowerCase()
    return [...(coldHistory?.responses || [])]
      .filter(row => {
        const date = String(row.submitted_at || '').slice(0, 10)
        const user = coldHistoryUserMap[row.volunteer_id]
        return (!coldHistoryFormId || row.form_id === coldHistoryFormId)
          && (!query || user?.name?.toLowerCase().includes(query))
          && (!coldHistoryStart || date >= coldHistoryStart)
          && (!coldHistoryEnd || date <= coldHistoryEnd)
      })
      .sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0))
  }, [coldHistory, coldHistoryEnd, coldHistoryFormId, coldHistorySearch, coldHistoryStart, coldHistoryUserMap])

  // Muat nama folder terakhir dari localStorage saat buka halaman
  useEffect(() => {
    const saved = localStorage.getItem('backup_folder_name')
    if (saved) setDirName(saved)
  }, [])

  // Minta atau verifikasi ulang permission ke folder yang sudah pernah dipilih
  async function requestPermission(handle) {
    try {
      const perm = await handle.requestPermission({ mode: 'readwrite' })
      if (perm === 'granted') {
        setPermGranted(true)
        return true
      }
    } catch {}
    setPermGranted(false)
    return false
  }

  // Pilih folder baru via dialog
  async function handlePickFolder() {
    if (!FS_SUPPORTED) return
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
      setDirHandle(handle)
      setDirName(handle.name)
      setPermGranted(true)
      localStorage.setItem('backup_folder_name', handle.name)
      await refreshFolderFiles(handle)
      toast.success(`Folder "${handle.name}" terpilih sebagai tujuan backup.`)
    } catch (err) {
      // User batal = AbortError, abaikan
      if (err.name !== 'AbortError') toast.error('Gagal membuka folder: ' + err.message)
    }
  }

  // Refresh daftar file di folder
  async function refreshFolderFiles(handle) {
    const h = handle || dirHandle
    if (!h) return
    setLoadingFiles(true)
    try {
      const granted = await requestPermission(h)
      if (!granted) { toast.error('Permission folder dicabut. Pilih ulang folder.'); return }
      const files = await listBackupFiles(h)
      setFolderFiles(files)
    } catch (err) {
      toast.error('Gagal baca isi folder: ' + err.message)
    } finally {
      setLoadingFiles(false)
    }
  }

  async function handleExport(format) {
    setExporting(true)
    setResult(null)
    setErrors([])
    const start = Date.now()
    const total = BACKUP_TABLES.length
    let totalRows = 0
    const dataByTable = {}
    const errorsByTable = {}
    const errs = []

    try {
      // Tarik semua tabel
      for (let i = 0; i < total; i++) {
        const { table, sheet } = BACKUP_TABLES[i]
        setProgress({ current: i + 1, total, label: sheet })
        try {
          const rows = await fetchAll(table)
          dataByTable[table] = rows
          totalRows += rows.length
        } catch (err) {
          errorsByTable[table] = err.message
          errs.push({ table, sheet, msg: err.message })
        }
      }

      setProgress({ current: total, total, label: t('backup.generating') })
      const date = new Date().toISOString().slice(0, 10)
      let blob, filename

      if (format === 'json') {
        const json = buildBackupJson(dataByTable, errorsByTable)
        blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
        filename = `ESC-Siantan-Backup-${date}.json`
      } else {
        const wb = buildBackupWorkbook(dataByTable, errorsByTable)
        const buf = await wb.xlsx.writeBuffer()
        blob = new Blob([buf], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        filename = `ESC-Siantan-Backup-${date}.xlsx`
      }

      // Simpan ke folder Synology bila tersedia & permission aktif
      if (dirHandle && permGranted) {
        try {
          const granted = await requestPermission(dirHandle)
          if (granted) {
            await saveToFolder(dirHandle, blob, filename)
            await refreshFolderFiles(dirHandle)
            toast.success(`Backup tersimpan ke folder "${dirName}": ${filename}`)
          } else {
            // Permission dicabut — fallback ke download browser
            downloadBlob(blob, filename)
            toast.info('Permission folder dicabut. File diunduh lewat browser. Pilih ulang folder untuk simpan otomatis.')
          }
        } catch (err) {
          // Gagal simpan ke folder — fallback ke download browser
          downloadBlob(blob, filename)
          toast.error('Gagal simpan ke folder, diunduh via browser: ' + err.message)
        }
      } else {
        // Tidak ada folder terpilih — download biasa
        downloadBlob(blob, filename)
      }

      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      setResult({ totalRows, time: elapsed, filename })
      setErrors(errs)
    } catch (err) {
      toast.error(t('backup.errorToast', { msg: err.message }))
    } finally {
      setExporting(false)
    }
  }

  // Handler arsip storage: tarik semua file dari semua bucket lalu zip & download.
  async function handleArchiveStorage() {
    setArchiving(true)
    setArchiveResult(null)
    try {
      const BUCKETS = ['profile-photos', 'task-files', 'documents']
      const zip = new JSZip()
      let totalFiles = 0
      let failedFiles = 0

      for (const bucket of BUCKETS) {
        setArchiveProgress({ current: 0, total: 0, label: `Membaca daftar ${bucket}...` })
        const paths = await listBucketFiles(bucket)
        for (let i = 0; i < paths.length; i++) {
          setArchiveProgress({ current: i + 1, total: paths.length, label: `${bucket}: ${paths[i]}` })
          try {
            const buf = await downloadStorageFile(bucket, paths[i])
            zip.folder(bucket).file(paths[i], buf)
            totalFiles++
          } catch {
            failedFiles++
          }
        }
      }

      setArchiveProgress({ current: 1, total: 1, label: 'Membuat file ZIP...' })
      const date = new Date().toISOString().slice(0, 10)
      const filename = `ESC-Siantan-Storage-${date}.zip`
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
      downloadBlob(blob, filename)
      setArchiveResult({ totalFiles, failedFiles, filename })
      toast.success(`Arsip storage diunduh: ${totalFiles} file (${failedFiles} gagal).`)
    } catch (err) {
      toast.error('Gagal arsip storage: ' + err.message)
    } finally {
      setArchiving(false)
      setArchiveProgress({ current: 0, total: 0, label: '' })
    }
  }

  async function previewColdArchive() {
    setColdBusy(true)
    try {
      const responses = await coldArchiveService.getResponsesBefore(coldCutoff)
      const filePaths = [...new Set(responses.flatMap(row => [...responseFilePaths(row.data_json)]))]
      setColdPreview({ responses, filePaths })
      setColdResult(null)
    } catch (err) {
      toast.error(t('backup.coldPreviewError', { msg: err.message }))
    } finally {
      setColdBusy(false)
    }
  }

  async function createColdArchive() {
    if (!dirHandle || !permGranted) { toast.error(t('backup.coldFolderRequired')); return }
    setColdBusy(true)
    try {
      const responses = coldPreview?.responses || await coldArchiveService.getResponsesBefore(coldCutoff)
      if (!responses.length) { toast.info(t('backup.coldEmpty')); return }
      const filePaths = [...new Set(responses.flatMap(row => [...responseFilePaths(row.data_json)]))]
      const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const archiveId = `COLD-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
      const filename = `ESC-Siantan-Respon-${coldCutoff}-${date}.zip`
      const manifest = { archiveId, cutoffDate: coldCutoff, filename, responseIds: responses.map(r => r.response_id), filePaths, createdAt: new Date().toISOString() }
      const context = await coldArchiveService.getArchiveContext(responses)
      const zip = new JSZip()
      zip.file('manifest.json', JSON.stringify(manifest, null, 2))
      zip.file('form_responses.json', JSON.stringify(responses, null, 2))
      zip.file('evaluation_context.json', JSON.stringify(context, null, 2))
      for (const path of filePaths) {
        const data = await coldArchiveService.downloadResponseFile(path)
        zip.file(`task-files/${path}`, data)
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
      await saveToFolder(dirHandle, blob, filename)
      const recorded = { ...manifest, sha256: await sha256(blob) }
      await coldArchiveService.record(archiveId, recorded)
      await refreshFolderFiles(dirHandle)
      setColdResult({ archiveId, filename, responses: responses.length, files: filePaths.length })
      toast.success(t('backup.coldCreated'))
    } catch (err) {
      toast.error(t('backup.coldCreateError', { msg: err.message }))
    } finally {
      setColdBusy(false)
    }
  }

  async function purgeColdSource() {
    if (!coldResult) return
    const ok = await confirm({ title: t('backup.coldPurgeTitle'), message: t('backup.coldPurgeMessage', { count: coldResult.responses }), confirmText: t('backup.coldPurgeBtn'), danger: true })
    if (!ok) return
    setColdBusy(true)
    try {
      const result = await coldArchiveService.purge(coldResult.archiveId)
      setColdResult(prev => ({ ...prev, purged: result }))
      setColdPreview(null)
      toast.success(t('backup.coldPurged', { count: result.deletedResponses }))
    } catch (err) {
      toast.error(t('backup.coldPurgeError', { msg: err.message }))
    } finally {
      setColdBusy(false)
    }
  }

  async function openColdArchive(filename) {
    if (!dirHandle) return
    setColdBusy(true)
    try {
      const handle = await dirHandle.getFileHandle(filename)
      const zip = await JSZip.loadAsync(await (await handle.getFile()).arrayBuffer())
      const manifestFile = zip.file('manifest.json')
      const responsesFile = zip.file('form_responses.json')
      if (!manifestFile || !responsesFile) throw new Error(t('backup.coldInvalidFile'))
      const [manifest, responses, savedContext] = await Promise.all([
        manifestFile.async('string').then(JSON.parse),
        responsesFile.async('string').then(JSON.parse),
        zip.file('evaluation_context.json')?.async('string').then(JSON.parse),
      ])
      if (!Array.isArray(responses)) throw new Error(t('backup.coldInvalidFile'))
      const context = savedContext || await coldArchiveService.getArchiveContext(responses)
      setColdHistory({ filename, manifest, responses, context, isLegacy: !savedContext })
      setColdHistoryFormId('')
      setColdHistorySearch('')
      setColdHistoryStart('')
      setColdHistoryEnd('')
      setColdSelectedResponse(null)
    } catch (err) {
      toast.error(t('backup.coldOpenError', { msg: err.message }))
    } finally {
      setColdBusy(false)
    }
  }

  // Handler restore: baca file JSON backup lalu upsert ke semua tabel.
  async function handleRestore(e) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input agar file yang sama bisa dipilih ulang
    e.target.value = ''
    if (!file.name.endsWith('.json')) {
      toast.error('Hanya file JSON yang didukung untuk restore.'); return
    }
    if (!window.confirm(`PERHATIAN: Restore akan menimpa data yang ada di Supabase dengan isi file "${file.name}". Lanjutkan?`)) return

    setRestoring(true)
    setRestoreResult(null)
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const { restored, errors } = await restoreFromJson(json, (p) => setRestoreProgress(p))
      setRestoreResult({ restored, errors, filename: file.name })
      if (errors.length === 0) {
        toast.success(`Restore selesai: ${restored.toLocaleString()} baris dipulihkan.`)
      } else {
        toast.info(`Restore selesai dengan ${errors.length} tabel gagal. Cek detail di bawah.`)
      }
    } catch (err) {
      toast.error('Gagal restore: ' + err.message)
    } finally {
      setRestoring(false)
      setRestoreProgress({ current: 0, total: 0, label: '' })
    }
  }

  const pct = progress.total
    ? Math.round((progress.current / progress.total) * 100) : 0

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  function formatDate(ms) {
    return new Date(ms).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title={t('backup.title')}
        subtitle={t('backup.subtitle')}
      />

      {/* Urutan ini mencegah sumber respons terhapus sebelum arsip lokal benar-benar dapat dibaca. */}
      <Card className="mb-4 border-l-4 border-l-brand-500">
        <div className="p-4">
          <h2 className="text-sm font-semibold text-gray-900">{t('backup.guideTitle')}</h2>
          <p className="text-xs text-gray-500 mt-1">{t('backup.guideDesc')}</p>
          <ol className="mt-4 space-y-3">
            {[
              ['1', t('backup.guideStep1Title'), t('backup.guideStep1Desc')],
              ['2', t('backup.guideStep2Title'), t('backup.guideStep2Desc')],
              ['3', t('backup.guideStep3Title'), t('backup.guideStep3Desc')],
              ['4', t('backup.guideStep4Title'), t('backup.guideStep4Desc')],
              ['5', t('backup.guideStep5Title'), t('backup.guideStep5Desc')],
            ].map(([number, title, desc]) => (
              <li key={number} className="flex gap-3">
                <span aria-hidden="true" className="w-6 h-6 rounded-full bg-brand-50 text-brand-600 text-xs font-bold inline-flex items-center justify-center shrink-0">{number}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex gap-2 mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p>{t('backup.guideWarning')}</p>
          </div>
        </div>
      </Card>

      {/* Card tip */}
      <Card className="mb-4 border-l-4 border-l-amber-400">
        <div className="flex gap-3 p-4">
          <HardDrive size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-800 mb-1">{t('backup.tipTitle')}</p>
            <p>{t('backup.tipBody')}</p>
          </div>
        </div>
      </Card>

      {/* Card folder Synology */}
      {FS_SUPPORTED ? (
        <Card className="mb-4">
          <div className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                {dirHandle && permGranted
                  ? <FolderCheck size={20} className="text-indigo-500" />
                  : <FolderOpen size={20} className="text-indigo-400" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Folder Penyimpanan Otomatis</p>
                <p className="text-xs text-gray-500">
                  {dirHandle
                    ? permGranted
                      ? `Terhubung ke folder: ${dirName}`
                      : `Folder "${dirName}" — permission perlu diaktifkan kembali`
                    : 'Pilih folder Synology atau hardisk eksternal'}
                </p>
              </div>
            </div>

            {/* Info browser restart */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl px-3 py-2.5 mb-3 text-xs text-blue-700 dark:text-blue-300">
              Setiap kali browser di-restart, kamu perlu klik <strong>Aktifkan Permission</strong> sekali
              untuk mengizinkan akses folder kembali. Ini batasan keamanan browser, bukan bug.
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handlePickFolder} disabled={exporting}>
                <FolderOpen size={15} /> {dirHandle ? 'Ganti Folder' : 'Pilih Folder'}
              </Button>
              {dirHandle && !permGranted && (
                <Button size="sm" onClick={() => refreshFolderFiles()} disabled={exporting}>
                  <FolderCheck size={15} /> Aktifkan Permission
                </Button>
              )}
              {dirHandle && permGranted && (
                <Button size="sm" variant="ghost" onClick={() => refreshFolderFiles()} disabled={loadingFiles}>
                  <RefreshCw size={15} className={loadingFiles ? 'animate-spin' : ''} /> Refresh
                </Button>
              )}
              {dirHandle && (
                <Button size="sm" variant="ghost" className="text-red-500" onClick={() => {
                  setDirHandle(null); setDirName(''); setPermGranted(false); setFolderFiles([])
                  localStorage.removeItem('backup_folder_name')
                  toast.info('Folder dihapus. Backup akan diunduh via browser.')
                }}>
                  <Trash2 size={15} /> Hapus Folder
                </Button>
              )}
            </div>

            {/* Daftar file backup di folder */}
            {dirHandle && permGranted && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-500 mb-2">
                  File backup di folder ({folderFiles.length} file)
                </p>
                {loadingFiles ? (
                  <p className="text-xs text-gray-400">Memuat daftar file...</p>
                ) : folderFiles.length === 0 ? (
                  <p className="text-xs text-gray-400">Belum ada file backup di folder ini.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {folderFiles.map(f => (
                      <div key={f.name} className="flex items-center gap-2.5 rounded-xl bg-control px-3 py-2">
                        <File size={14} className={f.name.endsWith('.xlsx') ? 'text-green-500' : 'text-blue-500'} />
                        <span className="flex-1 text-xs text-gray-700 truncate">{f.name}</span>
                        <span className="text-xs text-gray-400 shrink-0">{formatSize(f.size)}</span>
                        <span className="text-xs text-gray-400 shrink-0 hidden sm:block">{formatDate(f.lastModified)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card className="mb-4 border-l-4 border-l-gray-300">
          <div className="flex gap-3 p-4">
            <AlertTriangle size={18} className="text-gray-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-500">
              Fitur simpan ke folder otomatis membutuhkan Chrome atau Edge.
              Di browser ini, backup akan diunduh via dialog biasa.
            </p>
          </div>
        </Card>
      )}

      <Card className="mb-4">
        <div className="p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">{t('backup.coldTitle')}</p>
            <p className="text-xs text-gray-500 mt-1">{t('backup.coldDesc')}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input label={t('backup.coldCutoff')} type="date" value={coldCutoff} onChange={e => { setColdCutoff(e.target.value); setColdPreview(null); setColdResult(null) }} />
            <Button variant="outline" className="sm:self-end" onClick={previewColdArchive} loading={coldBusy}>{t('backup.coldPreviewBtn')}</Button>
          </div>
          {coldPreview && <div className="rounded-xl bg-control px-3 py-2 text-xs text-gray-600">{t('backup.coldPreviewResult', { responses: coldPreview.responses.length, files: coldPreview.filePaths.length })}</div>}
          {!coldResult ? (
            <Button className="w-full" onClick={createColdArchive} disabled={coldBusy || !coldPreview?.responses?.length}>{t('backup.coldCreateBtn')}</Button>
          ) : (
            <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 space-y-2">
              <p>{t('backup.coldCreatedResult', { file: coldResult.filename, responses: coldResult.responses })}</p>
              {!coldResult.purged ? <Button variant="outline" className="w-full border-rose-200 text-rose-600" onClick={purgeColdSource} loading={coldBusy}>{t('backup.coldPurgeBtn')}</Button> : <p>{t('backup.coldPurged', { count: coldResult.purged.deletedResponses })}</p>}
            </div>
          )}
          {dirHandle && permGranted && folderFiles.filter(f => f.name.startsWith('ESC-Siantan-Respon-')).length > 0 && (
            <div className="border-t border-gray-100 pt-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500">{t('backup.coldHistoryTitle')}</p>
              {folderFiles.filter(f => f.name.startsWith('ESC-Siantan-Respon-')).slice(0, 5).map(file => (
                <Button key={file.name} size="sm" variant="outline" className="w-full justify-start" onClick={() => openColdArchive(file.name)} disabled={coldBusy}><FileJson size={14} /> {file.name}</Button>
              ))}
            </div>
          )}
          {coldHistory && (
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                  <ClipboardList size={18} className="text-brand-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{t('backup.coldEvalTitle')}</p>
                  <p className="text-xs text-gray-500 truncate">{coldHistory.filename}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t('backup.coldHistoryResult', { count: coldHistory.responses.length, cutoff: coldHistory.manifest?.cutoffDate || '-' })}</p>
                </div>
              </div>

              {coldHistory.isLegacy && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{t('backup.coldLegacyHint')}</p>}

              <div className="grid sm:grid-cols-2 gap-3">
                <Select label={t('backup.coldHistoryForm')} value={coldHistoryFormId} onChange={e => setColdHistoryFormId(e.target.value)}>
                  <option value="">{t('backup.coldHistoryAllForms')}</option>
                  {coldHistoryForms.map(form => <option key={form.form_id} value={form.form_id}>{form.title}</option>)}
                </Select>
                <Input label={t('backup.coldHistorySearch')} placeholder={t('backup.coldHistorySearchPh')} value={coldHistorySearch} onChange={e => setColdHistorySearch(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label={t('backup.coldHistoryStart')} type="date" value={coldHistoryStart} onChange={e => setColdHistoryStart(e.target.value)} />
                <Input label={t('backup.coldHistoryEnd')} type="date" value={coldHistoryEnd} onChange={e => setColdHistoryEnd(e.target.value)} />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-control p-2 text-center"><p className="text-base font-bold text-gray-900">{coldHistoryRows.length}</p><p className="text-[10px] text-gray-500">{t('backup.coldHistoryResponses')}</p></div>
                <div className="rounded-xl bg-control p-2 text-center"><p className="text-base font-bold text-gray-900">{new Set(coldHistoryRows.map(row => row.volunteer_id)).size}</p><p className="text-[10px] text-gray-500">{t('backup.coldHistoryMembers')}</p></div>
                <div className="rounded-xl bg-control p-2 text-center"><p className="text-base font-bold text-gray-900">{new Set(coldHistoryRows.map(row => row.form_id)).size}</p><p className="text-[10px] text-gray-500">{t('backup.coldHistoryForms')}</p></div>
              </div>

              {coldHistoryRows.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-5">{t('backup.coldHistoryEmpty')}</p>
              ) : (
                <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                  {coldHistoryRows.map(row => {
                    const user = coldHistoryUserMap[row.volunteer_id]
                    const form = coldHistoryFormMap[row.form_id]
                    return (
                      <button key={row.response_id} type="button" onClick={() => setColdSelectedResponse(row)} className="w-full flex items-center gap-3 p-3 text-left bg-surface hover:bg-control transition-colors">
                        <Avatar name={user?.name || t('backup.coldUnknownMember')} src={user?.photo_url} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{user?.name || t('backup.coldUnknownMember')}</p>
                          <p className="text-xs text-brand-500 truncate">{form?.title || t('backup.coldUnknownForm')}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(row.submitted_at)}</p>
                        </div>
                        <Badge color="gray" className="text-[10px]! py-0! shrink-0">{t('backup.coldHistoryView')}</Badge>
                      </button>
                    )
                  })}
                </div>
              )}

              {coldSelectedResponse && (
                <div className="rounded-xl bg-control p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{coldHistoryUserMap[coldSelectedResponse.volunteer_id]?.name || t('backup.coldUnknownMember')}</p>
                      <p className="text-xs text-brand-500">{coldHistoryFormMap[coldSelectedResponse.form_id]?.title || t('backup.coldUnknownForm')}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(coldSelectedResponse.submitted_at)}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setColdSelectedResponse(null)}>{t('backup.coldHistoryClose')}</Button>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(coldSelectedResponse.data_json || {}).map(([key, value]) => {
                      const field = (coldHistoryFormMap[coldSelectedResponse.form_id]?.fields_json || []).find(item => item.key === key)
                      return <div key={key} className="border-t border-gray-200 pt-2"><p className="text-xs font-medium text-gray-600">{field?.label || key}</p><p className="text-sm text-gray-900 break-words mt-0.5">{answerText(value)}</p></div>
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Card export */}
      <Card className="mb-4">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl gradient-main flex items-center justify-center">
              <Download size={20} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{t('backup.exportTitle')}</p>
              <p className="text-xs text-gray-500">
                {t('backup.exportDesc', { count: BACKUP_TABLES.length })}
                {dirHandle && permGranted && ` — akan disimpan ke folder "${dirName}"`}
              </p>
            </div>
          </div>

          {exporting && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                <span>{progress.label}</span>
                <span>{progress.current}/{progress.total} ({pct}%)</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full gradient-main rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {result && (
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg mb-4 text-sm text-green-700">
              <CheckCircle2 size={16} className="flex-shrink-0" />
              <div>
                <p>{t('backup.resultSuccess', { rows: result.totalRows.toLocaleString(), time: result.time })}</p>
                {result.filename && <p className="text-xs mt-0.5 text-green-600">{result.filename}</p>}
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="p-3 bg-amber-50 rounded-lg mb-4 text-sm text-amber-700">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={16} className="flex-shrink-0" />
                <span className="font-medium">{t('backup.someErrors')}</span>
              </div>
              <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
                {errors.map(e => (
                  <li key={e.table}>{e.sheet}: {e.msg}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button onClick={() => handleExport('xlsx')} loading={exporting} disabled={exporting} className="w-full">
              <Download size={16} className="mr-1.5" />
              {exporting ? t('backup.exporting') : t('backup.exportBtnXlsx')}
            </Button>
            <Button onClick={() => handleExport('json')} loading={exporting} disabled={exporting} variant="outline" className="w-full">
              <FileJson size={16} className="mr-1.5" />
              {t('backup.exportBtnJson')}
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-2">{t('backup.formatHint')}</p>
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            {t('backup.includedData')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {BACKUP_TABLES.map(({ table, sheet }) => (
              <div key={table} className="flex items-center gap-2 text-xs text-gray-600 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-400" />
                <span>{sheet}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Card arsip storage */}
      <Card className="mb-4">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Package size={20} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Arsip File Storage</p>
              <p className="text-xs text-gray-500">Download semua file jemaat (foto, dokumen, lampiran) sebagai ZIP lokal. File di Supabase tidak dihapus.</p>
            </div>
          </div>

          {/* Progress arsip */}
          {archiving && (
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span className="truncate max-w-[80%]">{archiveProgress.label}</span>
                <span>{archiveProgress.total > 0 ? `${archiveProgress.current}/${archiveProgress.total}` : '...'}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: archiveProgress.total > 0 ? `${Math.round((archiveProgress.current / archiveProgress.total) * 100)}%` : '10%' }}
                />
              </div>
            </div>
          )}

          {/* Hasil arsip */}
          {archiveResult && !archiving && (
            <div className="flex items-start gap-2 p-3 bg-emerald-50 rounded-lg mb-4 text-sm text-emerald-700">
              <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p>{archiveResult.totalFiles} file diarsipkan ke <span className="font-medium">{archiveResult.filename}</span></p>
                {archiveResult.failedFiles > 0 && (
                  <p className="text-xs text-amber-600 mt-0.5">{archiveResult.failedFiles} file gagal diunduh (mungkin sudah terhapus di Storage).</p>
                )}
              </div>
            </div>
          )}

          <div className="bg-amber-50 rounded-xl px-3 py-2.5 mb-3 text-xs text-amber-700">
            Bucket yang diarsipkan: <span className="font-medium">profile-photos</span>, <span className="font-medium">task-files</span>, <span className="font-medium">documents</span>. File besar — proses bisa memakan waktu beberapa menit tergantung koneksi.
          </div>

          <Button onClick={handleArchiveStorage} loading={archiving} disabled={archiving} variant="outline" className="w-full">
            <Download size={16} className="mr-1.5" />
            {archiving ? 'Mengarsipkan...' : 'Download Arsip Storage (ZIP)'}
          </Button>
        </div>
      </Card>

      {/* Card restore */}
      <Card className="mb-4">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
              <ArchiveRestore size={20} className="text-rose-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Restore Data dari Backup</p>
              <p className="text-xs text-gray-500">Pulihkan semua tabel dari file JSON backup. Hanya gunakan saat data hilang atau perlu dipulihkan.</p>
            </div>
          </div>

          {/* Progress restore */}
          {restoring && (
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span className="truncate max-w-[80%]">Memulihkan: {restoreProgress.label}</span>
                <span>{restoreProgress.total > 0 ? `${restoreProgress.current}/${restoreProgress.total}` : '...'}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all duration-300"
                  style={{ width: restoreProgress.total > 0 ? `${Math.round((restoreProgress.current / restoreProgress.total) * 100)}%` : '10%' }}
                />
              </div>
            </div>
          )}

          {/* Hasil restore */}
          {restoreResult && !restoring && (
            <div className={`flex items-start gap-2 p-3 rounded-lg mb-4 text-sm ${restoreResult.errors.length === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {restoreResult.errors.length === 0
                ? <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
                : <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />}
              <div>
                <p>{restoreResult.restored.toLocaleString()} baris dipulihkan dari <span className="font-medium">{restoreResult.filename}</span></p>
                {restoreResult.errors.length > 0 && (
                  <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
                    {restoreResult.errors.map(e => (
                      <li key={e.table}>{e.table}: {e.msg}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <div className="bg-rose-50 rounded-xl px-3 py-2.5 mb-3 text-xs text-rose-700">
            <span className="font-semibold">Hanya file JSON</span> yang didukung. Restore menggunakan <span className="font-medium">upsert</span> — data existing dengan ID yang sama akan ditimpa. Pastikan file berasal dari backup ESC Siantan.
          </div>

          <input
            ref={restoreInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleRestore}
          />
          <Button
            onClick={() => restoreInputRef.current?.click()}
            loading={restoring}
            disabled={restoring}
            variant="outline"
            className="w-full border-rose-200 text-rose-600 hover:bg-rose-50"
          >
            <Upload size={16} className="mr-1.5" />
            {restoring ? 'Memulihkan...' : 'Pilih File JSON & Restore'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
