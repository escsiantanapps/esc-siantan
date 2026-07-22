import { useState, useEffect, useRef } from 'react'
import { HardDrive, Download, CheckCircle2, AlertTriangle, FileJson, FolderOpen, FolderCheck, Trash2, RefreshCw, File } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { Card, PageHeader, Button } from '@/components/ui'
import { BACKUP_TABLES } from '@/lib/backupTables'
import { buildBackupWorkbook, buildBackupJson } from '@/lib/backupBuild'

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
    if (entry.kind === 'file' && entry.name.startsWith('ESC-Siantan-Backup-')) {
      const file = await entry.getFile()
      files.push({ name: entry.name, size: file.size, lastModified: file.lastModified })
    }
  }
  return files.sort((a, b) => b.lastModified - a.lastModified)
}

export default function AdminBackupPage() {
  const { toast } = useToast()
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
    </div>
  )
}
