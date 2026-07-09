import { useEffect, useState } from 'react'
import { ScrollText, Plus, Pencil, Trash2, ChevronDown, ShieldQuestion } from 'lucide-react'
import { auditService } from '@/services/auditService'
import { formatDate } from '@/lib/utils'
import { Card, PageHeader, Spinner, Badge, Button, EmptyState } from '@/components/ui'

const PAGE = 50

// Label tabel yang diaudit (fallback ke nama mentah).
const TABLE_LABELS = {
  users: 'Jemaat',
  admin_user_permissions: 'Hak Akses Admin',
  payment_accounts: 'Rekening / QRIS',
  komsel: 'Komsel',
  ministries: 'Ministry',
  certificates: 'Sertifikat',
}

// Label kolom yang sering muncul (fallback ke nama mentah).
const FIELD_LABELS = {
  role: 'Peran', role_secondary: 'Peran Kedua', status: 'Status', name: 'Nama',
  phone: 'No. HP', email: 'Email', nik: 'NIK', address: 'Alamat',
  komsel_id: 'Komsel', is_pks: 'Flag PKS', account_name: 'Nama Rekening',
  account_number: 'No. Rekening', bank_name: 'Bank', qris_url: 'QRIS',
  birth_date: 'Tgl Lahir', gender: 'Gender', marital_status: 'Status Nikah',
}

// Kelas warna ditulis penuh sebagai string literal (JIT Tailwind tidak bisa
// membaca nama kelas hasil template literal seperti `bg-${x}-100`).
const ACTION_META = {
  INSERT: { icon: Plus,   badge: 'green', label: 'Tambah', wrap: 'bg-green-100', ic: 'text-green-600' },
  UPDATE: { icon: Pencil, badge: 'blue',  label: 'Ubah',   wrap: 'bg-blue-100',  ic: 'text-blue-600' },
  DELETE: { icon: Trash2, badge: 'red',   label: 'Hapus',  wrap: 'bg-red-100',   ic: 'text-red-600' },
}
const FALLBACK_META = { icon: ShieldQuestion, badge: 'gray', label: '', wrap: 'bg-gray-100', ic: 'text-gray-600' }

const fieldLabel = f => FIELD_LABELS[f] || f
const tableLabel = t => TABLE_LABELS[t] || t

function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '(kosong)'
  if (typeof v === 'boolean') return v ? 'Ya' : 'Tidak'
  const s = String(v)
  return s.length > 60 ? s.slice(0, 60) + '…' : s
}

function AuditRow({ entry }) {
  const [open, setOpen] = useState(false)
  const meta = ACTION_META[entry.action] || { ...FALLBACK_META, label: entry.action }
  const Icon = meta.icon
  const changed = entry.changed_fields || []
  const canExpand = entry.action === 'UPDATE' && changed.length > 0

  return (
    <Card className="mb-2">
      <button
        onClick={() => canExpand && setOpen(o => !o)}
        className={`w-full text-left p-3 flex items-start gap-3 ${canExpand ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.wrap}`}>
          <Icon size={15} className={meta.ic} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{entry.actor_name || 'Sistem'}</span>
            {entry.actor_role && <Badge color="gray">{entry.actor_role}</Badge>}
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            <span className="font-medium">{meta.label}</span>
            {' '}data <span className="font-medium">{tableLabel(entry.table_name)}</span>
            {entry.record_id && <span className="text-gray-400"> · {entry.record_id}</span>}
          </p>
          {entry.action === 'UPDATE' && changed.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {changed.slice(0, 6).map(f => (
                <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-control text-gray-600">
                  {fieldLabel(f)}
                </span>
              ))}
              {changed.length > 6 && <span className="text-[10px] text-gray-400">+{changed.length - 6}</span>}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[10px] text-gray-400 whitespace-nowrap">
            {formatDate(entry.created_at, 'd MMM yyyy')}
          </span>
          <span className="text-[10px] text-gray-400">{formatDate(entry.created_at, 'HH:mm')}</span>
          {canExpand && <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />}
        </div>
      </button>

      {open && canExpand && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-100 overflow-x-auto">
          <table className="w-full text-xs min-w-[300px]">
            <thead>
              <tr className="text-gray-400 text-left">
                <th className="font-medium py-1 pr-2">Kolom</th>
                <th className="font-medium py-1 pr-2">Sebelum</th>
                <th className="font-medium py-1">Sesudah</th>
              </tr>
            </thead>
            <tbody>
              {changed.map(f => (
                <tr key={f} className="align-top border-t border-gray-50">
                  <td className="py-1 pr-2 font-medium text-gray-700">{fieldLabel(f)}</td>
                  <td className="py-1 pr-2 text-red-600 break-all">{fmtVal(entry.old_data?.[f])}</td>
                  <td className="py-1 text-green-700 break-all">{fmtVal(entry.new_data?.[f])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export default function AdminAuditPage() {
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [tableFilter, setTableFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    auditService.list({ table: tableFilter || null, action: actionFilter || null, limit: PAGE, offset: 0 })
      .then(({ rows, count }) => { setRows(rows); setCount(count) })
      .catch(() => { setRows([]); setCount(0) })
      .finally(() => setLoading(false))
  }, [tableFilter, actionFilter])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const { rows: more } = await auditService.list({
        table: tableFilter || null, action: actionFilter || null, limit: PAGE, offset: rows.length,
      })
      setRows(r => [...r, ...more])
    } finally {
      setLoadingMore(false)
    }
  }

  const selCls = 'text-sm border border-gray-200 rounded-lg px-3 py-2 bg-surface text-gray-700 focus:outline-none focus:border-brand-400'

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title="Audit Log" subtitle="Riwayat perubahan data sensitif oleh admin" />

      <div className="flex gap-2 mb-4">
        <select className={selCls} value={tableFilter} onChange={e => setTableFilter(e.target.value)}>
          <option value="">Semua data</option>
          {Object.entries(TABLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={selCls} value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
          <option value="">Semua aksi</option>
          <option value="INSERT">Tambah</option>
          <option value="UPDATE">Ubah</option>
          <option value="DELETE">Hapus</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Belum ada catatan"
          description="Perubahan data sensitif oleh admin akan tercatat di sini secara otomatis."
        />
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-2">{count.toLocaleString()} catatan</p>
          {rows.map(e => <AuditRow key={e.id} entry={e} />)}
          {rows.length < count && (
            <Button variant="secondary" className="w-full mt-2" onClick={loadMore} loading={loadingMore}>
              Muat lebih banyak
            </Button>
          )}
        </>
      )}
    </div>
  )
}
