import { useState } from 'react'
import { HardDrive, Download, CheckCircle2, AlertTriangle, FileJson } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { Card, PageHeader, Button } from '@/components/ui'
import { BACKUP_TABLES } from '@/lib/backupTables'
import { buildBackupWorkbook, buildBackupJson } from '@/lib/backupBuild'

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

// Unduh Blob sebagai file di browser.
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function AdminBackupPage() {
  const { toast } = useToast()
  const { t } = useLang()
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' })
  const [result, setResult] = useState(null)
  const [errors, setErrors] = useState([])

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
      // Tarik semua tabel sekali; kedua format (Excel & JSON) pakai data yang sama.
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

      if (format === 'json') {
        const json = buildBackupJson(dataByTable, errorsByTable)
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
        downloadBlob(blob, `ESC-Siantan-Backup-${date}.json`)
      } else {
        const wb = buildBackupWorkbook(dataByTable, errorsByTable)
        const buf = await wb.xlsx.writeBuffer()
        const blob = new Blob([buf], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        downloadBlob(blob, `ESC-Siantan-Backup-${date}.xlsx`)
      }

      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      setResult({ totalRows, time: elapsed })
      setErrors(errs)
      toast.success(t('backup.successToast'))
    } catch (err) {
      toast.error(t('backup.errorToast', { msg: err.message }))
    } finally {
      setExporting(false)
    }
  }

  const pct = progress.total
    ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title={t('backup.title')}
        subtitle={t('backup.subtitle')}
      />

      <Card className="mb-4 border-l-4 border-l-amber-400">
        <div className="flex gap-3 p-4">
          <HardDrive size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-800 mb-1">{t('backup.tipTitle')}</p>
            <p>{t('backup.tipBody')}</p>
          </div>
        </div>
      </Card>

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
              <span>
                {t('backup.resultSuccess', {
                  rows: result.totalRows.toLocaleString(),
                  time: result.time,
                })}
              </span>
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
