import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { permissionsService } from '@/services/permissionsService'
import { ADMIN_PAGES } from '@/config/adminPages'
import { useToast } from '@/hooks/useToast'
import { Card, PageHeader, Spinner, Checkbox, Button } from '@/components/ui'

export default function AdminPermissionsPage() {
  const { toast } = useToast()
  const [allowed, setAllowed] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const pages = await permissionsService.getAdminPermissions()
      setAllowed(pages ?? ADMIN_PAGES.map(p => p.to))
    } catch (err) {
      setError(err.message || 'Gagal memuat data hak akses.')
    } finally {
      setLoading(false)
    }
  }

  function toggle(to) {
    setAllowed(p => p.includes(to) ? p.filter(x => x !== to) : [...p, to])
  }

  async function handleSave() {
    setError(''); setSuccess(''); setSaving(true)
    try {
      await permissionsService.updateAdminPermissions(allowed)
      setSuccess('Hak akses berhasil disimpan.')
      toast.success('Hak akses berhasil disimpan.')
    } catch (err) {
      setError(err.message || 'Gagal menyimpan hak akses.')
      toast.error(err.message || 'Gagal menyimpan hak akses.')
    } finally {
      setSaving(false)
    }
  }

  const sections = [...new Set(ADMIN_PAGES.map(p => p.section))]

  if (loading) return <div className="flex justify-center items-center h-60"><Spinner size="lg" /></div>

  return (
    <div className="max-w-2xl">
      <PageHeader title="Hak Akses Admin" subtitle="Pilih halaman admin yang dapat diakses oleh role Admin" />

      <div className="bg-blue-50 border border-blue-100 text-blue-700 text-sm rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
        <ShieldAlert size={16} className="mt-0.5 shrink-0" />
        <p>Dashboard selalu bisa diakses semua admin. Super Admin selalu memiliki akses penuh ke seluruh halaman dan tidak terpengaruh pengaturan ini.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-100 text-green-600 text-sm rounded-xl px-4 py-3 mb-4">{success}</div>
      )}

      {sections.map(section => (
        <Card key={section} className="p-4 mb-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">{section}</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {ADMIN_PAGES.filter(p => p.section === section).map(page => (
              <Checkbox
                key={page.to}
                label={page.label}
                checked={allowed.includes(page.to)}
                onChange={() => toggle(page.to)}
              />
            ))}
          </div>
        </Card>
      ))}

      <Button className="w-full" loading={saving} onClick={handleSave}>Simpan Hak Akses</Button>
    </div>
  )
}
