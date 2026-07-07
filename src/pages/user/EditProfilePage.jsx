import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { usersService } from '@/services/usersService'
import { pointsService } from '@/services/pointsService'
import { Avatar, Button, Input, Select, Textarea, GradientHeader, Spinner } from '@/components/ui'
import { validateUpload, compressImage } from '@/lib/utils'

export default function EditProfilePage() {
  const { profile, updateProfile } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [form, setForm] = useState({
    name: profile?.name || '',
    phone: profile?.phone || '',
    gender: profile?.gender || '',
    birth_date: profile?.birth_date || '',
    birth_place: profile?.birth_place || '',
    address: profile?.address || '',
    blood_type: profile?.blood_type || '',
    social_media: profile?.social_media || '',
    photo_url: profile?.photo_url || '',
    marital_status: profile?.marital_status || '',
    pekerjaan: profile?.pekerjaan || '',
    pekerjaan_posisi: profile?.pekerjaan_posisi || '',
    pekerjaan_bidang: profile?.pekerjaan_bidang || '',
    pekerjaan_perusahaan: profile?.pekerjaan_perusahaan || '',
    pekerjaan_pendapatan: profile?.pekerjaan_pendapatan || '',
    pendidikan_terakhir: profile?.pendidikan_terakhir || '',
    pendidikan_bidang: profile?.pendidikan_bidang || '',
    profesi: profile?.profesi || '',
  })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Volunteer dapat memilih sendiri ministry tempat ia melayani.
  const canServe = profile?.role === 'Volunteer'
  const [ministries, setMinistries] = useState([])
  const [ministryIds, setMinistryIds] = useState(profile?.ministry_ids || [])

  useEffect(() => {
    if (canServe) usersService.getAllMinistries().then(setMinistries).catch(() => {})
  }, [canServe])

  const availableMinistries = ministries.filter(m => !ministryIds.includes(m.ministry_id))
  const ministryName = id => ministries.find(m => m.ministry_id === id)?.name || id
  function addMinistry(id) { if (id && !ministryIds.includes(id)) setMinistryIds(p => [...p, id]) }
  function removeMinistry(id) { setMinistryIds(p => p.filter(x => x !== id)) }

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  async function handlePhotoChange(e) {
    let file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      file = await compressImage(file, { maxDim: 512 })
      validateUpload(file, { maxMB: 3, image: true })
      const url = await usersService.uploadAvatar(profile.user_id, file)
      set('photo_url', url)
      toast.success('Foto berhasil diunggah.')
    } catch (err) {
      setError(err.message || 'Gagal mengunggah foto.')
      toast.error(err.message || 'Gagal mengunggah foto.')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setError('Nama tidak boleh kosong.'); return }
    setError(''); setSaving(true)
    try {
      if (canServe) await usersService.setUserMinistries(profile.user_id, ministryIds)
      await updateProfile({
        ...form,
        gender: form.gender || null,
        blood_type: form.blood_type || null,
        birth_date: form.birth_date || null,
        marital_status: form.marital_status || null,
        ...(canServe ? { ministry_ids: ministryIds } : {}),
      })
      toast.success('Profil berhasil disimpan.')
      // Bonus 5 poin bila biodata lengkap — validasi terjadi di server
      // (sekali seumur akun; diam-diam bila belum lengkap/sudah pernah).
      // Kegagalan RPC (mis. migrasi belum dijalankan di DB) ditampilkan sebagai
      // error, bukan ditelan diam-diam — supaya mudah didiagnosis.
      try {
        const res = await pointsService.claimBiodataPoints()
        if (res?.awarded) toast.success('🎉 +5 poin — biodata lengkap!')
      } catch (err) {
        console.error('claimBiodataPoints gagal:', err)
        toast.error('Gagal memproses bonus poin biodata: ' + (err.message || 'unknown'))
      }
      navigate('/profil')
    } catch (err) {
      setError(err.message || 'Gagal menyimpan profil.')
      toast.error(err.message || 'Gagal menyimpan profil.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <GradientHeader title="Edit Profil" back={() => navigate('/profil')} />

      <div className="px-4 py-4 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
        )}

        {/* Foto profil */}
        <div className="flex flex-col items-center py-2">
          <div className="relative">
            <Avatar name={form.name} src={form.photo_url} size="xl" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full gradient-main flex items-center justify-center text-white shadow-sm"
            >
              {uploading ? <Spinner size="sm" /> : <Camera size={13} />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          </div>
        </div>

        <Input label="Nama Lengkap" required value={form.name} onChange={e => set('name', e.target.value)} />
        <Input label="No. HP / WhatsApp" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} />
        <Select label="Jenis Kelamin" value={form.gender} onChange={e => set('gender', e.target.value)}>
          <option value="">Pilih...</option>
          <option>Laki-laki</option>
          <option>Perempuan</option>
        </Select>
        <Input label="Tanggal Lahir" type="date" value={form.birth_date || ''} onChange={e => set('birth_date', e.target.value)} />
        <Input label="Tempat Lahir" placeholder="Kota kelahiran" value={form.birth_place} onChange={e => set('birth_place', e.target.value)} />
        <Textarea label="Alamat Lengkap" placeholder="Jl. ... No. ... Kelurahan Kota" value={form.address} onChange={e => set('address', e.target.value)} />
        <Select label="Golongan Darah" value={form.blood_type || ''} onChange={e => set('blood_type', e.target.value)}>
          <option value="">Tidak tahu / belum periksa</option>
          {['A', 'B', 'AB', 'O'].map(b => <option key={b}>{b}</option>)}
        </Select>
        <Input label="Instagram / Sosial Media" placeholder="@username" value={form.social_media} onChange={e => set('social_media', e.target.value)} />

        {/* ── Status & Pekerjaan ── */}
        <div className="pt-2">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Status & Pekerjaan</h3>
          <div className="space-y-4">
            <Select label="Status Pernikahan" value={form.marital_status} onChange={e => set('marital_status', e.target.value)}>
              <option value="">Pilih...</option>
              <option>Single</option>
              <option>Menikah</option>
              <option>Duda</option>
              <option>Janda</option>
            </Select>
            <Input label="Pekerjaan" placeholder="cth: Karyawan Swasta / Wiraswasta / Pelajar" value={form.pekerjaan} onChange={e => set('pekerjaan', e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Posisi" placeholder="cth: Staff" value={form.pekerjaan_posisi} onChange={e => set('pekerjaan_posisi', e.target.value)} />
              <Input label="Bidang Pekerjaan" placeholder="cth: Retail" value={form.pekerjaan_bidang} onChange={e => set('pekerjaan_bidang', e.target.value)} />
            </div>
            <Input label="Nama Perusahaan" value={form.pekerjaan_perusahaan} onChange={e => set('pekerjaan_perusahaan', e.target.value)} />
            <Select label="Pendapatan Tahunan" value={form.pekerjaan_pendapatan} onChange={e => set('pekerjaan_pendapatan', e.target.value)}>
              <option value="">Pilih...</option>
              <option>&lt; Rp 25 juta</option>
              <option>Rp 25–60 juta</option>
              <option>Rp 60–120 juta</option>
              <option>&gt; Rp 120 juta</option>
              <option>Tidak ingin mengisi</option>
            </Select>
          </div>
        </div>

        {/* ── Pendidikan ── */}
        <div className="pt-2">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Pendidikan</h3>
          <div className="space-y-4">
            <Select label="Pendidikan Terakhir" value={form.pendidikan_terakhir} onChange={e => set('pendidikan_terakhir', e.target.value)}>
              <option value="">Pilih...</option>
              {['SD', 'SMP', 'SMA/SMK', 'D1–D3', 'S1', 'Profesi', 'S2', 'S3'].map(p => <option key={p}>{p}</option>)}
            </Select>
            <Input label="Bidang Pendidikan" placeholder="cth: Teknik Informatika" value={form.pendidikan_bidang} onChange={e => set('pendidikan_bidang', e.target.value)} />
            <Input label="Profesi" placeholder="cth: Dokter / Guru / Akuntan / Programmer" value={form.profesi} onChange={e => set('profesi', e.target.value)} />
          </div>
        </div>

        {/* Pelayanan (khusus Volunteer) */}
        {canServe && (
          <div>
            <Select label="Saya melayani di (Ministry)" value="" onChange={e => { addMinistry(e.target.value); e.target.value = '' }}>
              <option value="">+ Tambah ministry...</option>
              {availableMinistries.map(m => <option key={m.ministry_id} value={m.ministry_id}>{m.name}</option>)}
            </Select>
            {ministryIds.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {ministryIds.map(id => (
                  <span key={id} className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 text-xs font-medium px-2.5 py-1 rounded-full">
                    {ministryName(id)}
                    <button type="button" onClick={() => removeMinistry(id)} className="hover:text-brand-900" aria-label="Hapus"><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            {ministries.length === 0 && <p className="text-xs text-gray-400 mt-1">Belum ada data ministry.</p>}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => navigate('/profil')}>Batal</Button>
          <Button className="flex-1" loading={saving} onClick={handleSubmit}>Simpan</Button>
        </div>
      </div>
    </div>
  )
}
