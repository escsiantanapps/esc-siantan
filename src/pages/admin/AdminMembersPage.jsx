import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Users, ChevronRight as Arrow, Plus, X } from 'lucide-react'
import { usersService } from '@/services/usersService'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useBackClose } from '@/hooks/useBackClose'
import { Card, Input, Select, Textarea, Button, PageHeader, Spinner, EmptyState, Badge, StatusBadge, Avatar } from '@/components/ui'
import { useLang } from '@/hooks/useLang'
import { spColor } from '@/lib/utils'

const LIMIT = 20

const emptyAddForm = {
  name: '', phone: '', email: '', role: 'Jemaat', komsel_id: '',
  gender: '', birth_date: '', birth_place: '', address: '', blood_type: '', nik: '', social_media: '',
}

export default function AdminMembersPage() {
  const { t } = useLang()
  const { profile } = useAuth()
  const { toast } = useToast()
  const canSetRole = profile?.role === 'Super Admin'
  const canSetNik = profile?.role === 'Super Admin'
  const [searchParams] = useSearchParams()
  const [members, setMembers] = useState([])
  const [count, setCount] = useState(0)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState(searchParams.get('status') || '')
  const [ministry, setMinistry] = useState('')
  const [komsel, setKomsel] = useState('')
  const [ministries, setMinistries] = useState([])
  const [komselList, setKomselList] = useState([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState(emptyAddForm)
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')
  useBackClose(showAddModal, () => setShowAddModal(false))

  useEffect(() => {
    Promise.all([usersService.getAllMinistries(), usersService.getAllKomsel()])
      .then(([mins, koms]) => { setMinistries(mins); setKomselList(koms) })
      .catch(() => {})
  }, [])

  function loadMembers() {
    setLoading(true)
    return usersService.getAll({ search, role, status, ministry, komsel, page, limit: LIMIT })
      .then(({ data, count }) => { setMembers(data); setCount(count) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setLoading(true)
    const timer = setTimeout(loadMembers, 300)
    return () => clearTimeout(timer)
  }, [search, role, status, ministry, komsel, page])

  function setAdd(key, val) { setAddForm(p => ({ ...p, [key]: val })) }

  function openAddModal() {
    setAddForm(emptyAddForm)
    setAddError('')
    setShowAddModal(true)
  }

  async function handleAddSubmit() {
    setAddError('')
    if (!addForm.name.trim()) { setAddError(t('amem.addNameRequired')); return }
    if (!addForm.phone.trim()) { setAddError(t('amem.addPhoneRequired')); return }
    setAddSaving(true)
    try {
      await usersService.create(addForm)
      setShowAddModal(false)
      toast.success(t('amem.addSuccess', { name: addForm.name }))
      setPage(1)
      loadMembers()
    } catch (err) {
      setAddError(err.message === 'PHONE_TAKEN' ? t('auth.phoneTaken') : (err.message || t('amem.addFailed')))
    } finally {
      setAddSaving(false)
    }
  }

  const ministryMap = useMemo(() => Object.fromEntries(ministries.map(m => [m.ministry_id, m.name])), [ministries])
  const komselMap = useMemo(() => Object.fromEntries(komselList.map(k => [k.komsel_id, k.name])), [komselList])

  const totalPages = Math.max(1, Math.ceil(count / LIMIT))

  return (
    <div>
      <PageHeader
        title={t('amem.title')}
        subtitle={t('amem.subtitle', { count })}
        action={<Button size="sm" onClick={openAddModal}><Plus size={15} /> {t('amem.addBtn')}</Button>}
      />

      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <div className="sm:col-span-1">
          <Input
            placeholder={t('amem.searchName')}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <Select value={role} onChange={e => { setRole(e.target.value); setPage(1) }}>
          <option value="">{t('amem.allRoles')}</option>
          {['Jemaat', 'Volunteer', 'PKS', 'Admin', 'Super Admin'].map(r => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
        </Select>
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">{t('amem.allStatus')}</option>
          <option value="Menunggu Persetujuan">{t('status.Menunggu Persetujuan')}</option>
          <option value="Aktif">{t('status.Aktif')}</option>
          <option value="Nonaktif">{t('status.Nonaktif')}</option>
        </Select>
      </div>

      {/* Filter organisasi */}
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Select value={ministry} onChange={e => { setMinistry(e.target.value); setPage(1) }}>
          <option value="">{t('amem.allMinistry')}</option>
          {ministries.map(m => <option key={m.ministry_id} value={m.ministry_id}>{m.name}</option>)}
        </Select>
        <Select value={komsel} onChange={e => { setKomsel(e.target.value); setPage(1) }}>
          <option value="">{t('amem.allKomsel')}</option>
          {komselList.map(k => <option key={k.komsel_id} value={k.komsel_id}>{k.name}</option>)}
        </Select>
      </div>

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && members.length === 0 && (
        <EmptyState icon={Users} title={t('amem.none')} description={t('amem.noneDesc')} />
      )}

      {!loading && members.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {members.map(m => (
            <Link key={m.user_id} to={`/admin/jemaat/${m.user_id}`} className="flex items-center gap-3 p-3.5 hover:bg-gray-50 transition-colors">
              <Avatar name={m.name} src={m.photo_url} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                <p className="text-xs text-gray-400">{t(`role.${m.role}`)}{m.phone ? ` · ${m.phone}` : ''}</p>
                {((m.ministry_ids?.length > 0) || m.komsel_id || m.is_pks || m.role === 'PKS') && (
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {(m.ministry_ids || []).slice(0, 2).map(id => (
                      ministryMap[id] && <Badge key={id} color="gray" className="text-[10px]! py-0!">{ministryMap[id]}</Badge>
                    ))}
                    {m.ministry_ids?.length > 2 && <Badge color="gray" className="text-[10px]! py-0!">+{m.ministry_ids.length - 2}</Badge>}
                    {m.komsel_id && komselMap[m.komsel_id] && (
                      <Badge color="blue" className="text-[10px]! py-0!">{komselMap[m.komsel_id]}</Badge>
                    )}
                    {(m.is_pks || m.role === 'PKS') && (
                      <Badge color="purple" className="text-[10px]! py-0!">PKS</Badge>
                    )}
                  </div>
                )}
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
            <ChevronLeft size={16} /> {t('a.prev')}
          </button>
          <span className="text-xs text-gray-400">{t('a.pageOf', { page, total: totalPages })}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 text-sm text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('a.next')} <ChevronRight size={16} />
          </button>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{t('amem.addTitle')}</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {addError && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{addError}</div>}
            <p className="text-xs text-gray-400 -mt-2">{t('amem.addHint')}</p>

            <Input label={t('auth.fullName')} required value={addForm.name} onChange={e => setAdd('name', e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input label={t('auth.phone')} type="tel" required placeholder="08xxxxxxxxxx" value={addForm.phone} onChange={e => setAdd('phone', e.target.value)} />
              <Input label={t('auth.email')} type="email" value={addForm.email} onChange={e => setAdd('email', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label={t('auth.gender')} value={addForm.gender} onChange={e => setAdd('gender', e.target.value)}>
                <option value="">{t('auth.choose')}</option>
                <option value="Laki-laki">{t('gender.male')}</option>
                <option value="Perempuan">{t('gender.female')}</option>
              </Select>
              <Select label={t('auth.bloodType')} value={addForm.blood_type} onChange={e => setAdd('blood_type', e.target.value)}>
                <option value="">{t('auth.bloodUnknown')}</option>
                {['A', 'B', 'AB', 'O', '-'].map(b => <option key={b}>{b}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label={t('auth.birthDate')} type="date" value={addForm.birth_date} onChange={e => setAdd('birth_date', e.target.value)} />
              <Input label={t('auth.birthPlace')} value={addForm.birth_place} onChange={e => setAdd('birth_place', e.target.value)} />
            </div>
            <Textarea label={t('auth.address')} rows={2} value={addForm.address} onChange={e => setAdd('address', e.target.value)} />
            {canSetNik && <Input label="NIK" value={addForm.nik} onChange={e => setAdd('nik', e.target.value)} />}
            <Input label={t('auth.socialMedia')} placeholder="@username" value={addForm.social_media} onChange={e => setAdd('social_media', e.target.value)} />
            <Select label={t('amem.allKomsel')} value={addForm.komsel_id} onChange={e => setAdd('komsel_id', e.target.value)}>
              <option value="">{t('amem.noKomsel')}</option>
              {komselList.map(k => <option key={k.komsel_id} value={k.komsel_id}>{k.name}</option>)}
            </Select>
            {canSetRole && (
              <Select label={t('amem.allRoles')} value={addForm.role} onChange={e => setAdd('role', e.target.value)}>
                {['Jemaat', 'Volunteer', 'Admin', 'Super Admin'].map(r => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
              </Select>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={() => setShowAddModal(false)}>{t('a.cancel')}</Button>
              <Button className="flex-1" loading={addSaving} onClick={handleAddSubmit}>{t('amem.addBtn')}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
