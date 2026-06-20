import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { usersService } from '@/services/usersService'
import { Card, Avatar, Select, Textarea, Button, Spinner, Checkbox, EmptyState } from '@/components/ui'
import { formatDate, formatPhone, hitungUmur } from '@/lib/utils'

export default function AdminMemberDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { toast, confirm } = useToast()
  const canEditRole = profile?.role === 'Super Admin'

  const [member, setMember] = useState(null)
  const [ministries, setMinistries] = useState([])
  const [komselList, setKomselList] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState({
    role: '', is_pks: false, status: '', sp_level: '', sp_notes: '', komsel_id: '', ministry_ids: [],
  })

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    try {
      const [data, allMinistries, allKomsel] = await Promise.all([
        usersService.getById(id),
        usersService.getAllMinistries(),
        usersService.getAllKomsel(),
      ])
      setMember(data)
      setMinistries(allMinistries)
      setKomselList(allKomsel)
      setForm({
        // 'PKS' lama kini direpresentasikan sebagai base role + flag is_pks.
        role: data.role === 'PKS' ? 'Volunteer' : (data.role || 'Jemaat'),
        is_pks: data.is_pks === true || data.role === 'PKS',
        status: data.status || 'Aktif',
        sp_level: data.sp_level || 'Aman',
        sp_notes: data.sp_notes || '',
        komsel_id: data.komsel_id || '',
        ministry_ids: data.ministry_ids || [],
      })
    } catch (err) {
      setError(err.message || 'Gagal memuat data jemaat.')
    } finally {
      setLoading(false)
    }
  }

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  function toggleMinistry(ministryId) {
    setForm(p => ({
      ...p,
      ministry_ids: p.ministry_ids.includes(ministryId)
        ? p.ministry_ids.filter(m => m !== ministryId)
        : [...p.ministry_ids, ministryId],
    }))
  }

  async function handleSave() {
    setError(''); setSuccess(''); setSaving(true)
    try {
      const isAdminRole = ['Admin', 'Super Admin'].includes(form.role)
      const updated = await usersService.update(id, {
        ...form,
        is_pks: isAdminRole ? false : form.is_pks, // Admin/Super Admin tidak boleh PKS
        komsel_id: form.komsel_id || null,
      })
      setMember(updated)
      setSuccess('Perubahan tersimpan.')
      toast.success('Perubahan tersimpan.')
    } catch (err) {
      setError(err.message || 'Gagal menyimpan perubahan.')
      toast.error(err.message || 'Gagal menyimpan perubahan.')
    } finally {
      setSaving(false)
    }
  }

  async function handleApproval(status) {
    setError(''); setSuccess(''); setSaving(true)
    try {
      const updated = await usersService.update(id, { status })
      setMember(updated)
      set('status', status)
      const msg = status === 'Aktif' ? 'Pendaftaran disetujui.' : 'Pendaftaran ditolak.'
      setSuccess(msg)
      toast.success(msg)
    } catch (err) {
      setError(err.message || 'Gagal memperbarui status.')
      toast.error(err.message || 'Gagal memperbarui status.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Hapus akun jemaat?',
      message: `Akun "${member.name}" akan dihapus permanen — termasuk akses login. Tindakan ini tidak dapat dibatalkan.`,
      confirmText: 'Hapus Permanen',
      danger: true,
    })
    if (!ok) return
    setError(''); setSuccess(''); setDeleting(true)
    try {
      await usersService.deleteAccount(id)
      toast.success('Akun berhasil dihapus.')
      navigate('/admin/jemaat')
    } catch (err) {
      setError(err.message || 'Gagal menghapus akun.')
      toast.error(err.message || 'Gagal menghapus akun.')
      setDeleting(false)
    }
  }

  // Aturan ini juga ditegakkan di server (api/delete-user).
  const isSelf = member?.user_id === profile?.user_id
  const targetIsAdmin = ['Admin', 'Super Admin'].includes(member?.role)
  const canDelete = !isSelf && (!targetIsAdmin || profile?.role === 'Super Admin')

  if (loading) return <div className="flex justify-center items-center h-60"><Spinner /></div>

  if (!member) {
    return (
      <div>
        <button onClick={() => navigate('/admin/jemaat')} className="flex items-center gap-1 text-sm text-gray-500 mb-4">
          <ArrowLeft size={16} /> Kembali
        </button>
        <EmptyState title="Jemaat tidak ditemukan" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <button onClick={() => navigate('/admin/jemaat')} className="flex items-center gap-1 text-sm text-gray-500 mb-4">
        <ArrowLeft size={16} /> Kembali ke Daftar Jemaat
      </button>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-100 text-green-600 text-sm rounded-xl px-4 py-3 mb-4">{success}</div>
      )}

      {/* Persetujuan pendaftaran */}
      {member.status === 'Menunggu Persetujuan' && (
        <Card className="p-4 mb-4 border-brand-200 bg-brand-50 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-brand-700">Menunggu persetujuan pendaftaran</p>
            <p className="text-xs text-brand-600">Setujui agar jemaat ini bisa mengakses akunnya.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" loading={saving} onClick={() => handleApproval('Nonaktif')}>Tolak</Button>
            <Button size="sm" loading={saving} onClick={() => handleApproval('Aktif')}>Setujui</Button>
          </div>
        </Card>
      )}

      {/* Profil */}
      <Card className="p-4 mb-4">
        <div className="flex items-center gap-4">
          <Avatar name={member.name} src={member.photo_url} size="xl" />
          <div className="min-w-0">
            <p className="text-base font-semibold text-gray-900">{member.name}</p>
            <p className="text-sm text-gray-400">{member.email || '-'}</p>
            <p className="text-sm text-gray-400">{formatPhone(member.phone)}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
          <div>
            <p className="text-xs text-gray-400">Tanggal Lahir</p>
            <p className="text-gray-700">{member.birth_date ? `${formatDate(member.birth_date)} (${hitungUmur(member.birth_date)})` : '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Tempat Lahir</p>
            <p className="text-gray-700">{member.birth_place || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Jenis Kelamin</p>
            <p className="text-gray-700">{member.gender || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Golongan Darah</p>
            <p className="text-gray-700">{member.blood_type || '-'}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-gray-400">Alamat</p>
            <p className="text-gray-700">{member.address || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">NIK</p>
            <p className="text-gray-700">{member.nik || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Terdaftar</p>
            <p className="text-gray-700">{formatDate(member.created_at)}</p>
          </div>
        </div>
      </Card>

      {/* Pengaturan akun */}
      <Card className="p-4 mb-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Pengaturan Akun</h2>
        <div className="grid grid-cols-2 gap-3">
          {canEditRole ? (
            <Select label="Role Utama" value={form.role} onChange={e => {
              const v = e.target.value
              setForm(p => ({ ...p, role: v, is_pks: ['Admin', 'Super Admin'].includes(v) ? false : p.is_pks }))
            }}>
              {['Jemaat', 'Volunteer', 'Admin', 'Super Admin'].map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
          ) : (
            <div className="space-y-1">
              <label className="text-sm text-gray-600 font-medium">Role</label>
              <div className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl">
                <span className="text-sm text-gray-700">{form.role}{form.is_pks ? ' + PKS' : ''}</span>
              </div>
              <p className="text-xs text-gray-400">Hanya Super Admin yang dapat mengubah role.</p>
            </div>
          )}
          <Select label="Status" value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="Menunggu Persetujuan">Menunggu Persetujuan</option>
            <option value="Aktif">Aktif</option>
            <option value="Nonaktif">Nonaktif</option>
          </Select>
        </div>

        {/* Peran tambahan: PKS (kecuali Admin & Super Admin) */}
        {canEditRole && (
          <div>
            <Checkbox
              label="Juga sebagai PKS (Pemimpin Komsel)"
              checked={form.is_pks}
              disabled={['Admin', 'Super Admin'].includes(form.role)}
              onChange={e => set('is_pks', e.target.checked)}
            />
            <p className="text-xs text-gray-400 mt-1">
              Seseorang bisa memiliki 2 peran, mis. Volunteer + PKS. Admin & Super Admin tidak dapat merangkap PKS.
              Untuk menetapkan komsel yang dipimpin, gunakan menu Kelola Komsel.
            </p>
          </div>
        )}
        <Select label="Komsel (keanggotaan)" value={form.komsel_id} onChange={e => set('komsel_id', e.target.value)}>
          <option value="">Belum ada komsel</option>
          {komselList.map(k => <option key={k.komsel_id} value={k.komsel_id}>{k.name}</option>)}
        </Select>
        <p className="text-xs text-gray-400">
          Ini menentukan komsel tempat jemaat <span className="font-medium">tergabung</span>. Untuk menjadikannya
          <span className="font-medium"> PKS</span>, atur lewat menu Kelola Komsel → tombol mahkota.
        </p>
      </Card>

      {/* Ministry */}
      <Card className="p-4 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Ministry</h2>
        {ministries.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada data ministry.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {ministries.map(m => (
              <Checkbox
                key={m.ministry_id}
                label={m.name}
                checked={form.ministry_ids.includes(m.ministry_id)}
                onChange={() => toggleMinistry(m.ministry_id)}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Surat Peringatan */}
      <Card className="p-4 mb-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Surat Peringatan (SP)</h2>
        <Select label="Status SP" value={form.sp_level} onChange={e => set('sp_level', e.target.value)}>
          {['Aman', 'SP 1', 'SP 2', 'SP 3'].map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Textarea label="Catatan SP" rows={3} placeholder="Alasan / catatan SP (opsional)" value={form.sp_notes} onChange={e => set('sp_notes', e.target.value)} />
      </Card>

      <Button className="w-full" loading={saving} onClick={handleSave}>Simpan Perubahan</Button>

      {/* Zona berbahaya — hapus akun permanen */}
      {canDelete && (
        <Card className="p-4 mt-4 border-red-200 bg-red-50">
          <h2 className="text-sm font-semibold text-red-700">Zona Berbahaya</h2>
          <p className="text-xs text-red-600 mt-1">
            Menghapus akun akan menghilangkan akses login dan data profil jemaat ini secara permanen.
          </p>
          <Button variant="danger" className="mt-3" loading={deleting} onClick={handleDelete}>
            <Trash2 size={15} /> Hapus Akun Permanen
          </Button>
        </Card>
      )}
      {isSelf && (
        <p className="text-xs text-gray-400 text-center mt-4">Anda tidak dapat menghapus akun Anda sendiri.</p>
      )}
    </div>
  )
}
