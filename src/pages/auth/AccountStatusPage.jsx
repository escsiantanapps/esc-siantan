import { useEffect, useState } from 'react'
import { Ban, Hourglass, RefreshCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { Button } from '@/components/ui'
import Uploader from '@/components/Uploader'
import { compressImage } from '@/lib/utils'

export default function AccountStatusPage() {
  const { profile, logout, refreshProfile, completeRegistrationPhoto } = useAuth()
  const { confirm, toast } = useToast()
  const { t } = useLang()
  const navigate = useNavigate()
  const [refreshing, setRefreshing] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const isProfileMissing = !profile
  const isPending = profile?.status === 'Menunggu Persetujuan'
  const needsPhoto = isPending && profile?.registration_photo_required === true && !profile?.photo_url
  const StatusIcon = isProfileMissing ? RefreshCcw : isPending ? Hourglass : Ban

  useEffect(() => () => {
    if (photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  function beforePhoto(file) {
    setPhotoError('')
    if (!file.type?.startsWith('image/')) {
      setPhotoError(t('auth.photoTypeError'))
      return false
    }
    if (file.size > 15 * 1024 * 1024) {
      setPhotoError(t('auth.photoSizeError'))
      return false
    }
    return true
  }

  async function handlePhoto(file) {
    setPhotoError('')
    setProcessingPhoto(true)
    try {
      const compressed = await compressImage(file, { maxDim: 720, quality: 0.76, targetKB: 250 })
      setPhotoFile(compressed)
      setPhotoPreview(URL.createObjectURL(compressed))
    } catch {
      setPhotoError(t('auth.photoProcessError'))
    } finally {
      setProcessingPhoto(false)
    }
  }

  async function savePhoto() {
    if (!photoFile) {
      setPhotoError(t('auth.photoRequired'))
      return
    }
    setPhotoError('')
    setUploadingPhoto(true)
    try {
      await completeRegistrationPhoto(photoFile)
      await refreshProfile()
      toast.success(t('account.photoSaved'))
    } catch {
      setPhotoError(t('account.photoSaveFailed'))
      toast.error(t('account.photoSaveFailed'))
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await refreshProfile()
      toast.success(t('account.refreshSuccess'))
    } catch {
      toast.error(t('account.refreshFailed'))
    } finally {
      setRefreshing(false)
    }
  }

  async function handleLogout() {
    const ok = await confirm({
      title: t('account.logoutTitle'),
      message: t('account.logoutMessage'),
      confirmText: t('account.logout'),
      danger: true,
    })
    if (!ok) return
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center items-center px-4 py-10">
      <div className="w-full max-w-md bg-surface rounded-3xl shadow-2xl shadow-black/10 p-8 text-center">
        <div className="w-16 h-16 mx-auto bg-brand-50 rounded-2xl flex items-center justify-center mb-4">
          <StatusIcon size={28} className="text-brand-500" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">
          {isProfileMissing ? t('account.loadFailedTitle') : isPending ? t('account.pendingTitle') : t('account.disabledTitle')}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {isProfileMissing
            ? t('account.loadFailedDesc')
            : isPending
            ? t('account.pendingDesc', { name: profile?.name ? `"${profile.name}" ` : '' })
            : t('account.disabledDesc')}
        </p>
        {needsPhoto && (
          <div className="text-left bg-control border border-gray-100 rounded-2xl p-4 mb-5 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{t('account.completePhotoTitle')}</h2>
              <p className="text-xs text-gray-500 mt-1">{t('account.completePhotoDesc')}</p>
            </div>
            {photoError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{photoError}</p>
            )}
            <Uploader
              kind="image" crop aspect={1} required value={photoPreview}
              hint={t('auth.profilePhotoHint')} accept="image/*"
              uploading={processingPhoto}
              imageAlt={t('auth.photoPreviewAlt')}
              uploadLabel={t('auth.choosePhoto')} replaceLabel={t('auth.replacePhoto')}
              removeLabel={t('auth.removePhoto')} uploadingLabel={t('auth.processingPhoto')}
              beforeFile={beforePhoto} onFile={handlePhoto}
              onClear={() => { setPhotoFile(null); setPhotoPreview(''); setPhotoError('') }}
            />
            <Button className="w-full" loading={uploadingPhoto} disabled={processingPhoto}
              onClick={savePhoto}>{t('account.savePhoto')}</Button>
          </div>
        )}
        <div className="space-y-3">
          {(isProfileMissing || isPending) && (
            <Button className="w-full" onClick={handleRefresh} loading={refreshing}>
              <RefreshCcw size={15} /> {t('account.refresh')}
            </Button>
          )}
          <Button variant="outline" className="w-full" onClick={handleLogout}>{t('account.logout')}</Button>
        </div>
      </div>
    </div>
  )
}
