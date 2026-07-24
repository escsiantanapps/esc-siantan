import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BookOpen, Clock, MapPin, User, QrCode, CheckCircle2, History, ClipboardList, MessageCircle, Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { classesService, prerequisiteService } from '@/services/contentService'
import { classAttendanceService } from '@/services/attendanceService'
import { tasksService } from '@/services/tasksService'
import { Card, Spinner, GradientHeader, EmptyState, StatusBadge, Button } from '@/components/ui'
import MediaGallery from '@/components/MediaGallery'
import PrerequisiteForm from '@/components/PrerequisiteForm'
import { useLang } from '@/hooks/useLang'
import { formatDate, waLink } from '@/lib/utils'

export default function ClassDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { toast, confirm } = useToast()
  const { t } = useLang()
  const [cls, setCls] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [registration, setRegistration] = useState(null)
  const [registering, setRegistering] = useState(false)
  const [myPrereq, setMyPrereq] = useState(null)
  const [prereqForm, setPrereqForm] = useState({})
  const [uploadingKey, setUploadingKey] = useState(null)
  const [submittingPrereq, setSubmittingPrereq] = useState(false)

  useEffect(() => {
    classesService.getById(id).then(setCls).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!profile?.user_id) return
    classAttendanceService.getMyHistory(id, profile.user_id).then(setHistory).catch(() => {})
    classesService.getMyRegistration(id, profile.user_id).then(setRegistration).catch(() => {})
    prerequisiteService.getMine('class', id, profile.user_id).then(setMyPrereq).catch(() => {})
  }, [id, profile?.user_id])

  const prereqFields = cls?.prerequisite_fields || []
  const hasPrereq = (Array.isArray(prereqFields) && prereqFields.length > 0) || cls?.require_approval

  async function handleRegister() {
    // Konfirmasi dulu supaya jemaat tidak salah pencet daftar.
    const ok = await confirm({
      title: t('classDetail.confirmTitle'),
      message: t('classDetail.confirmMsg', { name: cls?.name || '' }),
      confirmText: t('classDetail.confirmYes'),
    })
    if (!ok) return
    setRegistering(true)
    try {
      const reg = await classesService.register(id, profile.user_id)
      setRegistration(reg)
      toast.success(t('classDetail.registerSuccess'))
      // Beritahu Admin
      const { pushService } = await import('@/services/pushService')
      await pushService.notifyAdmin('new_class', reg.registration_id)
    } catch (err) {
      toast.error(err.message || t('classDetail.registerFailed'))
    } finally {
      setRegistering(false)
    }
  }

  async function handlePrereqFile(key, file) {
    if (!file) return
    setUploadingKey(key)
    try {
      const url = await tasksService.uploadResponseFile(profile.user_id, file)
      setPrereqForm(p => ({ ...p, [key]: url }))
    } catch (err) {
      toast.error(err.message || t('common.docUploadFailed'))
    } finally {
      setUploadingKey(null)
    }
  }

  async function handleSubmitPrereq() {
    for (const f of prereqFields) {
      if (f.required && !prereqForm[f.key]) { toast.error(t('prereq.fillRequired')); return }
    }
    setSubmittingPrereq(true)
    try {
      const created = await prerequisiteService.submit({
        kind: 'class', targetId: id, userId: profile.user_id, data_json: prereqForm,
      })
      setMyPrereq(created)
      toast.success(t('prereq.submitted'))
    } catch (err) {
      toast.error(err.message || t('prereq.submitFailed'))
    } finally {
      setSubmittingPrereq(false)
    }
  }

  return (
    <div className="pb-4">
      <GradientHeader title={t('classDetail.title')} back={() => navigate('/kelas')} />

      <div className="px-4 pt-4 space-y-4">
        {loading && <div className="flex justify-center py-8"><Spinner /></div>}

        {!loading && !cls && (
          <EmptyState icon={BookOpen} title={t('classDetail.notFound')} />
        )}

        {!loading && cls && (
          <>
            {cls.thumbnail_url && (
              <img src={cls.thumbnail_url} alt={cls.name} className="w-full aspect-video object-cover rounded-2xl" />
            )}

            <Card className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-base font-bold text-gray-900">{cls.name}</h1>
                <StatusBadge status={cls.status} />
              </div>

              {cls.description && (
                <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{cls.description}</p>
              )}

              <div className="space-y-2 pt-2 border-t border-gray-100">
                {cls.schedule && (
                  <p className="text-sm text-gray-600 flex items-center gap-2"><Clock size={15} className="text-gray-400" /> {cls.schedule}</p>
                )}
                {cls.location && (
                  <p className="text-sm text-gray-600 flex items-center gap-2"><MapPin size={15} className="text-gray-400" /> {cls.location}</p>
                )}
                {cls.teacher && (
                  <p className="text-sm text-gray-600 flex items-center gap-2"><User size={15} className="text-gray-400" /> {cls.teacher}</p>
                )}
              </div>

              {registration ? (
                <>
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" /> {t('classDetail.registered')}
                  </div>
                  {cls.whatsapp_group_url && (
                    <a href={cls.whatsapp_group_url} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" className="w-full">
                        <Users size={16} /> {t('class.joinWaGroup')}
                      </Button>
                    </a>
                  )}
                  <Button variant="outline" className="w-full" onClick={() => navigate('/kelas/absen')}>
                    <QrCode size={16} /> {t('classDetail.attendNow')}
                  </Button>
                </>
              ) : hasPrereq ? (
                myPrereq?.status === 'Menunggu' ? (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                    <p className="text-sm font-semibold text-amber-700">{t('prereq.pending')}</p>
                    <p className="text-xs text-amber-600 mt-0.5">{t('prereq.pendingDesc')}</p>
                  </div>
                ) : myPrereq?.status === 'Ditolak' ? (
                  <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                    <p className="text-sm font-semibold text-red-700">{t('prereq.rejected')}</p>
                    {myPrereq?.admin_note && <p className="text-xs text-red-600 mt-0.5 whitespace-pre-line">{myPrereq?.admin_note}</p>}
                    <p className="text-xs text-red-500 mt-1">{t('prereq.rejectedContact')}</p>
                  </div>
                ) : myPrereq?.status === 'Disetujui' ? (
                  <p className="text-center text-sm text-gray-400">{t('prereq.approvedPending')}</p>
                ) : (
                  <div className="space-y-3 border-t border-gray-100 pt-3">
                    {cls.require_approval && prereqFields.length === 0 ? (
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Pendaftaran Membutuhkan Persetujuan</p>
                        <p className="text-xs text-gray-500 mt-0.5 mb-3">Kelas ini memerlukan persetujuan dari admin. Klik ajukan untuk mendaftar.</p>
                        <Button className="w-full" loading={submittingPrereq} onClick={handleSubmitPrereq}>
                          Ajukan Pendaftaran
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{t('prereq.title')}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{t('prereq.fillBefore')}</p>
                        </div>
                        <PrerequisiteForm
                          fields={prereqFields} value={prereqForm}
                          onChange={(k, v) => setPrereqForm(p => ({ ...p, [k]: v }))}
                          onFileUpload={handlePrereqFile} uploadingKey={uploadingKey}
                        />
                        <Button className="w-full" loading={submittingPrereq} onClick={handleSubmitPrereq}>
                          {t('prereq.submit')}
                        </Button>
                      </>
                    )}
                  </div>
                )
              ) : (
                <Button variant="outline" className="w-full" loading={registering} onClick={handleRegister}>
                  <ClipboardList size={16} /> {t('classDetail.register')}
                </Button>
              )}

              {/* Kontak WA admin sesuai gender jemaat */}
              {(() => {
                const wa = profile?.gender === 'Perempuan'
                  ? (cls.contact_wa_female || cls.contact_wa)
                  : (cls.contact_wa || cls.contact_wa_female)
                return waLink(wa) ? (
                  <a href={waLink(wa)} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="w-full">
                      <MessageCircle size={16} /> {t('common.contactWa')}
                    </Button>
                  </a>
                ) : null
              })()}
            </Card>

            {/* Galeri foto & video */}
            <MediaGallery photos={cls.photo_urls} videos={cls.video_urls} />

            {/* Riwayat Kehadiran Saya */}
            <Card className="p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <History size={15} className="text-gray-400" /> {t('classDetail.myHistory')}
              </h2>
              {history.length === 0 ? (
                <p className="text-sm text-gray-400">{t('classDetail.noHistory')}</p>
              ) : (
                <div className="space-y-2.5">
                  {history.map(h => (
                    <div key={h.attendance_id} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 size={15} className="text-green-500" />
                      </div>
                      <p className="text-sm text-gray-700">{formatDate(h.attendance_date)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
