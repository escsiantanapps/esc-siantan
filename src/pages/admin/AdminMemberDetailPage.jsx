import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { ArrowLeft, Trash2, Download } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { usersService } from '@/services/usersService'
import { mediaService } from '@/services/contentService'
import { Card, Avatar, Select, Textarea, Input, Button, Spinner, Checkbox, EmptyState } from '@/components/ui'
import Uploader from '@/components/Uploader'
import MembershipCard from '@/components/MembershipCard'
import { formatDate, formatPhone, hitungUmur, validateUpload } from '@/lib/utils'

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
    role: '', role_secondary: '', is_pks: false, status: '', sp_level: '', sp_notes: '', komsel_id: '', ministry_ids: [],
    name: '', phone: '', email: '', gender: '', birth_date: '', birth_place: '', address: '', blood_type: '', nik: '', social_media: '',
    membership_card_url: '', membership_card_issued_at: '',
  })
  const [cardUploading, setCardUploading] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [qrLoading, setQrLoading] = useState(false)

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
        role_secondary: data.role_secondary || '',
        is_pks: data.is_pks === true || data.role === 'PKS',
        status: data.status || 'Aktif',
        sp_level: data.sp_level || 'Aman',
        sp_notes: data.sp_notes || '',
        komsel_id: data.komsel_id || '',
        ministry_ids: data.ministry_ids || [],
        name: data.name || '',
        phone: data.phone || '',
        email: data.email || '',
        gender: data.gender || '',
        birth_date: data.birth_date || '',
        birth_place: data.birth_place || '',
        address: data.address || '',
        blood_type: data.blood_type || '',
        nik: data.nik || '',
        social_media: data.social_media || '',
        membership_card_url: data.membership_card_url || '',
        membership_card_issued_at: data.membership_card_issued_at || '',
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
      const {
        name, phone, email, gender, birth_date, birth_place, address, blood_type, nik, social_media,
        membership_card_url, membership_card_issued_at, ...rest
      } = form
      // Biodata jemaat (nama, kontak, alamat, dst.) + kartu jemaat hanya boleh
      // diubah Super Admin — tidak dikirim sama sekali oleh Admin biasa agar
      // tidak menimpa data terbaru (race) dan ditegakkan ulang di server
      // (trigger guard_biodata_admin_edit).
      const biodata = canEditRole ? {
        name, phone, email: email || null,
        gender: gender || null, birth_date: birth_date || null, birth_place: birth_place || null,
        address: address || null, blood_type: blood_type || null, nik: nik || null,
        social_media: social_media || null,
        membership_card_url: membership_card_url || null,
        membership_card_issued_at: membership_card_issued_at || null,
      } : {}
      const updated = await usersService.update(id, {
        ...rest,
        ...biodata,
        is_pks: rest.is_pks,
        role_secondary: rest.role_secondary || null,
        komsel_id: rest.komsel_id || null,
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

  // Kartu QR verifikasi keanggotaan (ESC-MEMBER:<nij>) — hanya bisa di-generate
  // & diunduh dari panel Admin, tidak ada akses self-service untuk jemaat.
  async function generateQr() {
    if (!member?.nij) return
    setQrLoading(true)
    try {
      const url = await QRCode.toDataURL(`ESC-MEMBER:${member.nij}`, { width: 320, margin: 1 })
      setQrDataUrl(url)
    } catch (err) {
      toast.error('Gagal membuat QR: ' + (err.message || 'unknown'))
    } finally {
      setQrLoading(false)
    }
  }

  async function handleCardUpload(file) {
    setCardUploading(true)
    try {
      // Kartu jemaat = murni file PNG dari admin — TIDAK dikompres/dikonversi
      // supaya desain kartu tetap tajam persis seperti aslinya.
      validateUpload(file, { maxMB: 5, image: true })
      const url = await mediaService.uploadPhoto('membership-cards', file)
      set('membership_card_url', url)
      if (!form.membership_card_issued_at) {
        set('membership_card_issued_at', new Date().toISOString().slice(0, 10))
      }
      toast.success('Kartu terunggah — jangan lupa Simpan Perubahan.')
    } catch (err) {
      toast.error(err.message || 'Gagal mengunggah kartu.')
    } finally {
      setCardUploading(false)
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
            {member.nij && (
              <p className="text-xs font-mono font-semibold text-brand-600 mt-0.5">NIJ: {member.nij}</p>
            )}
          </div>
        </div>

        {canEditRole ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-gray-400">
              Biodata jemaat hanya dapat diubah oleh Super Admin.
            </p>
            <Input label="Nama Lengkap" value={form.name} onChange={e => set('name', e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="No. HP / WhatsApp" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} />
              <Input label="Email" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Jenis Kelamin" value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="">Pilih...</option>
                <option>Laki-laki</option>
                <option>Perempuan</option>
              </Select>
              <Select label="Golongan Darah" value={form.blood_type} onChange={e => set('blood_type', e.target.value)}>
                <option value="">Tidak tahu</option>
                {['A', 'B', 'AB', 'O', '-'].map(b => <option key={b}>{b}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Tanggal Lahir" type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} />
              <Input label="Tempat Lahir" value={form.birth_place} onChange={e => set('birth_place', e.target.value)} />
            </div>
            <Textarea label="Alamat Lengkap" rows={2} value={form.address} onChange={e => set('address', e.target.value)} />
            <Input label="NIK" value={form.nik} onChange={e => set('nik', e.target.value)} />
            <Input label="Instagram / Sosial Media" value={form.social_media} onChange={e => set('social_media', e.target.value)} />
            <p className="text-xs text-gray-400">Terdaftar: {formatDate(member.created_at)}</p>
          </div>
        ) : (
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
            <p className="col-span-2 text-xs text-gray-400 pt-1">Hanya Super Admin yang dapat mengubah biodata jemaat.</p>
          </div>
        )}
      </Card>

      {/* Biodata Lengkap (read-only) — status pernikahan, pekerjaan, pendidikan,
          & sosial media. Ditampilkan untuk semua admin agar profil
          jemaat terlihat utuh (pengubahan biodata tetap khusus Super Admin
          lewat form di kartu Profil di atas). */}
      <Card className="p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Biodata Lengkap</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400">Status Pernikahan</p>
            <p className="text-gray-700">{member.marital_status || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Sosial Media</p>
            <p className="text-gray-700 break-words">{member.social_media || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Pekerjaan</p>
            <p className="text-gray-700">{member.pekerjaan || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Posisi</p>
            <p className="text-gray-700">{member.pekerjaan_posisi || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Bidang Pekerjaan</p>
            <p className="text-gray-700">{member.pekerjaan_bidang || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Perusahaan</p>
            <p className="text-gray-700">{member.pekerjaan_perusahaan || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Pendapatan Tahunan</p>
            <p className="text-gray-700">{member.pekerjaan_pendapatan || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Pendidikan Terakhir</p>
            <p className="text-gray-700">{member.pendidikan_terakhir || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Bidang Pendidikan</p>
            <p className="text-gray-700">{member.pendidikan_bidang || '-'}</p>
          </div>
        </div>
      </Card>

      {/* Kartu Jemaat (PNG diunggah Super Admin, expired 1 tahun) */}
      <Card className="p-4 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Kartu Jemaat</h2>
        {canEditRole ? (
          <>
            <Uploader
              kind="image" label="File Kartu (PNG)" hint="Gambar kartu jemaat, maks 5 MB"
              value={form.membership_card_url} uploading={cardUploading}
              onFile={handleCardUpload}
              onClear={() => set('membership_card_url', '')}
            />
            <Input
              label="Tanggal Pembuatan" type="date"
              value={form.membership_card_issued_at}
              onChange={e => set('membership_card_issued_at', e.target.value)}
            />
            <p className="text-xs text-gray-400">
              Masa berlaku dihitung otomatis 1 tahun sejak Tanggal Pembuatan — lewat dari itu
              kartu tampil dengan label merah &quot;Kedaluwarsa&quot; di app jemaat.
            </p>
          </>
        ) : (
          <>
            <MembershipCard profile={member} placeholder />
            <p className="text-xs text-gray-400">Hanya Super Admin yang dapat mengunggah/mengubah kartu jemaat.</p>
          </>
        )}
      </Card>

      {/* QR Kartu Jemaat (verifikasi keanggotaan) — hanya di panel Admin,
          tidak ada akses self-service untuk jemaat. */}
      <Card className="p-4 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">QR Verifikasi Keanggotaan</h2>
        {!member.nij ? (
          <p className="text-sm text-gray-400">NIJ belum tersedia untuk jemaat ini.</p>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Kartu Jemaat" className="w-48 h-48 rounded-xl border border-gray-100" />
            ) : (
              <Button variant="outline" loading={qrLoading} onClick={generateQr}>Generate QR</Button>
            )}
            {qrDataUrl && (
              <a href={qrDataUrl} download={`Kartu-QR-${member.name}.png`} className="w-full">
                <Button variant="outline" className="w-full"><Download size={15} /> Unduh QR</Button>
              </a>
            )}
            <p className="text-xs text-gray-400 text-center">
              QR ini memverifikasi bahwa jemaat terdaftar di GBI El Shaddai Siantan.
              Pindai lewat menu Scan (Admin/PKS) untuk melihat status & saldo poin.
            </p>
          </div>
        )}
      </Card>

      {/* Pengaturan akun */}
      <Card className="p-4 mb-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Pengaturan Akun</h2>
        {canEditRole ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Role Utama" value={form.role} onChange={e => set('role', e.target.value)}>
                {['Jemaat', 'Volunteer', 'Gembala', 'Admin', 'Super Admin'].map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
              <Select label="Role Kedua" value={form.role_secondary} onChange={e => set('role_secondary', e.target.value)}>
                <option value="">Tidak ada</option>
                {['Jemaat', 'Volunteer'].map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            </div>
            <p className="text-xs text-gray-400 -mt-1">
              Role Kedua opsional — mis. Admin/Super Admin yang juga Volunteer agar tetap dapat
              mengakses tugas dan menerima notifikasi untuk role tersebut.
            </p>
          </>
        ) : (
          <div className="space-y-1">
            <label className="text-sm text-gray-600 font-medium">Role</label>
            <div className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl">
              <span className="text-sm text-gray-700">
                {form.role}{form.role_secondary ? ` + ${form.role_secondary}` : ''}{form.is_pks ? ' + PKS' : ''}
              </span>
            </div>
            <p className="text-xs text-gray-400">Hanya Super Admin yang dapat mengubah role.</p>
          </div>
        )}
        <Select label="Status" value={form.status} onChange={e => set('status', e.target.value)}>
          <option value="Menunggu Persetujuan">Menunggu Persetujuan</option>
          <option value="Aktif">Aktif</option>
          <option value="Nonaktif">Nonaktif</option>
        </Select>

        {/* Peran tambahan: PKS */}
        {canEditRole && (
          <div>
            <Checkbox
              label="Juga sebagai PKS (Pemimpin Komsel)"
              checked={form.is_pks}
              onChange={e => set('is_pks', e.target.checked)}
            />
            <p className="text-xs text-gray-400 mt-1">
              Seseorang bisa memiliki 2 peran, mis. Volunteer + PKS, atau Admin/Super Admin yang juga PKS.
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
