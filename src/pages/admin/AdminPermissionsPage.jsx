import { useEffect, useState } from 'react'
import { ShieldAlert, ShieldCheck, Search, UserPlus, X, Trash2 } from 'lucide-react'
import { permissionsService } from '@/services/permissionsService'
import { ADMIN_PAGES, ALL_ADMIN_PAGE_PATHS } from '@/config/adminPages'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { Card, PageHeader, Spinner, Checkbox, Button, Input, Avatar, Badge, EmptyState } from '@/components/ui'

const SECTIONS = [...new Set(ADMIN_PAGES.map(p => p.section))]

export default function AdminPermissionsPage() {
  const { toast, confirm } = useToast()
  const { t } = useLang()
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)

  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState([])
  const [granting, setGranting] = useState(false)

  const [editing, setEditing] = useState(null) // admin yang sedang diatur
  const [editPages, setEditPages] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  function load() {
    setLoading(true)
    permissionsService.getAdmins().then(setAdmins).catch(() => {}).finally(() => setLoading(false))
  }

  // Cari kandidat saat mengetik.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!query.trim()) { setCandidates([]); return }
      permissionsService.searchCandidates(query).then(setCandidates).catch(() => setCandidates([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  async function grant(user) {
    setGranting(true)
    try {
      await permissionsService.grantAdmin(user.user_id)
      toast.success(t('aperm.grantedToast', { name: user.name }))
      setQuery(''); setCandidates([])
      load()
    } catch (err) {
      toast.error(err.message || t('aperm.grantFailed'))
    } finally {
      setGranting(false)
    }
  }

  function openEditor(admin) {
    setEditing(admin)
    // null (belum diatur) = akses penuh -> tampilkan semua tercentang
    setEditPages(admin.allowed_pages ?? [...ALL_ADMIN_PAGE_PATHS])
  }

  function toggle(to) {
    setEditPages(p => p.includes(to) ? p.filter(x => x !== to) : [...p, to])
  }

  async function saveEditor() {
    setSaving(true)
    try {
      await permissionsService.setUserPermissions(editing.user_id, editPages)
      toast.success(t('aperm.savedToast'))
      setEditing(null)
      load()
    } catch (err) {
      toast.error(err.message || t('aperm.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function revoke(admin) {
    const ok = await confirm({
      title: t('aperm.revokeTitle'),
      message: t('aperm.revokeMsg', { name: admin.name }),
      confirmText: t('aperm.revoke'),
      danger: true,
    })
    if (!ok) return
    try {
      await permissionsService.revokeAdmin(admin.user_id)
      toast.success(t('aperm.revokedToast'))
      setEditing(null)
      load()
    } catch (err) {
      toast.error(err.message || t('aperm.revokeFailed'))
    }
  }

  if (loading) return <div className="flex justify-center items-center h-60"><Spinner size="lg" /></div>

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('aperm.title')} subtitle={t('aperm.subtitle')} />

      <div className="bg-blue-50 border border-blue-100 text-blue-700 text-sm rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
        <ShieldAlert size={16} className="mt-0.5 shrink-0" />
        <p>{t('aperm.infoBox')}</p>
      </div>

      {/* Tambah admin */}
      <Card className="p-4 mb-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">{t('aperm.grantTitle')}</h2>
        <Input icon={Search} placeholder={t('akom.searchMember')} value={query} onChange={e => setQuery(e.target.value)} />
        {candidates.length > 0 && (
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {candidates.map(u => (
              <button key={u.user_id} onClick={() => grant(u)} disabled={granting}
                className="w-full flex items-center gap-3 px-1 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-left">
                <Avatar name={u.name} src={u.photo_url} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                  <p className="text-xs text-gray-400">{t(`role.${u.role}`)}</p>
                </div>
                <UserPlus size={16} className="text-brand-500 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Daftar admin */}
      <h2 className="text-sm font-semibold text-gray-900 mb-2">{t('aperm.adminList')}</h2>
      {admins.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t('aperm.noAdmins')} description={t('aperm.noAdminsDesc')} />
      ) : (
        <Card className="divide-y divide-gray-100">
          {admins.map(a => {
            const full = a.allowed_pages == null
            const count = full ? ALL_ADMIN_PAGE_PATHS.length : a.allowed_pages.length
            return (
              <button key={a.user_id} onClick={() => openEditor(a)}
                className="w-full flex items-center gap-3 p-3.5 hover:bg-gray-50 text-left">
                <Avatar name={a.name} src={a.photo_url} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{a.name}</p>
                  <p className="text-xs text-gray-400">
                    {full ? t('aperm.fullAccess') : t('aperm.pagesCount', { count, total: ALL_ADMIN_PAGE_PATHS.length })}
                  </p>
                </div>
                <Badge color={full ? 'green' : 'blue'}>{full ? t('aperm.full') : t('aperm.limited')}</Badge>
              </button>
            )
          })}
        </Card>
      )}

      {/* Editor hak akses per-admin */}
      {editing && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar name={editing.name} src={editing.photo_url} size="sm" />
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-gray-900 truncate">{editing.name}</h2>
                  <p className="text-xs text-gray-400">{t('aperm.configPages')}</p>
                </div>
              </div>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={18} /></button>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditPages([...ALL_ADMIN_PAGE_PATHS])}>{t('aperm.selectAll')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditPages([])}>{t('aperm.clear')}</Button>
            </div>

            {SECTIONS.map(section => (
              <div key={section} className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t(`admin.sec.${section}`)}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {ADMIN_PAGES.filter(p => p.section === section).map(page => (
                    <Checkbox key={page.to} label={t(page.labelKey)}
                      checked={editPages.includes(page.to)} onChange={() => toggle(page.to)} />
                  ))}
                </div>
              </div>
            ))}

            <div className="flex gap-2 pt-1">
              <Button variant="danger" onClick={() => revoke(editing)}><Trash2 size={15} /> {t('aperm.revoke')}</Button>
              <Button className="flex-1" loading={saving} onClick={saveEditor}>{t('a.save')}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
