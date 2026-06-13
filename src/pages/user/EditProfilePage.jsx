import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usersService } from '@/services/usersService'
import { Avatar, Button, Input, Select, Textarea, GradientHeader, Spinner } from '@/components/ui'

export default function EditProfilePage() {
  const { profile, updateProfile } = useAuth()
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
  })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const url = await usersService.uploadAvatar(profile.user_id, file)
      set('photo_url', url)
    } catch (err) {
      setError(err.message || 'Gagal mengunggah foto.')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setError('Nama tidak boleh kosong.'); return }
    setError(''); setSaving(true)
    try {
      await updateProfile({
        ...form,
        gender: form.gender || null,
        blood_type: form.blood_type || null,
        birth_date: form.birth_date || null,
      })
      navigate('/profil')
    } catch (err) {
      setError(err.message || 'Gagal menyimpan profil.')
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

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => navigate('/profil')}>Batal</Button>
          <Button className="flex-1" loading={saving} onClick={handleSubmit}>Simpan</Button>
        </div>
      </div>
    </div>
  )
}
