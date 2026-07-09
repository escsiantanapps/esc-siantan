import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Calendar, MapPin, Clock, MessageCircle, CheckCircle2, ScanLine, Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { eventsService, prerequisiteService } from '@/services/contentService'
import { tasksService } from '@/services/tasksService'
import { Card, Spinner, GradientHeader, Button, EmptyState, StatusBadge } from '@/components/ui'
import MediaGallery from '@/components/MediaGallery'
import PrerequisiteForm from '@/components/PrerequisiteForm'
import { useLang } from '@/hooks/useLang'
import { formatDate, waLink } from '@/lib/utils'

export default function EventDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { t } = useLang()
  const [event, setEvent] = useState(null)
  const [registration, setRegistration] = useState(null)
  const [myPrereq, setMyPrereq] = useState(null)
  const [prereqForm, setPrereqForm] = useState({})
  const [uploadingKey, setUploadingKey] = useState(null)
  const [submittingPrereq, setSubmittingPrereq] = useState(false)
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile) return
    Promise.all([
      eventsService.getById(id),
      eventsService.getMyRegistration(id, profile.user_id).catch(() => null),
      prerequisiteService.getMine('event', id, profile.user_id).catch(() => null),
    ]).then(([ev, reg, preq]) => { setEvent(ev); setRegistration(reg); setMyPrereq(preq) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id, profile])

  const prereqFields = event?.prerequisite_fields || []
  const hasPrereq = Array.isArray(prereqFields) && prereqFields.length > 0

  async function handleRegister() {
    setError('')
    setRegistering(true)
    try {
      const reg = await eventsService.register(id, profile.user_id)
      setRegistration(reg)
      // Beritahu Admin
      const { pushService } = await import('@/services/pushService')
      await pushService.notifyAdmin('new_event', { name: profile.name })
    } catch (err) {
      setError(err.message || t('eventDetail.registerFailed'))
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
      setError(err.message || t('common.docUploadFailed'))
    } finally {
      setUploadingKey(null)
    }
  }

  async function handleSubmitPrereq() {
    setError('')
    for (const f of prereqFields) {
      if (f.required && !prereqForm[f.key]) { setError(t('prereq.fillRequired')); return }
    }
    setSubmittingPrereq(true)
    try {
      const created = await prerequisiteService.submit({
        kind: 'event', targetId: id, userId: profile.user_id, data_json: prereqForm,
      })
      setMyPrereq(created)
    } catch (err) {
      setError(err.message || t('prereq.submitFailed'))
    } finally {
      setSubmittingPrereq(false)
    }
  }

  return (
    <div className="pb-4">
      <GradientHeader title={t('eventDetail.title')} back={() => navigate('/events')} />

      <div className="px-4 pt-4">
        {loading && <div className="flex justify-center py-8"><Spinner /></div>}

        {!loading && !event && (
          <EmptyState icon={Calendar} title={t('eventDetail.notFound')} />
        )}

        {!loading && event && (
          <div className="space-y-4">
            <Card className="overflow-hidden">
              {event.thumbnail_url && (
                <img src={event.thumbnail_url} alt={event.name} className="w-full aspect-video object-cover" />
              )}
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h1 className="text-base font-bold text-gray-900">{event.name}</h1>
                  <StatusBadge status={event.status} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar size={15} className="text-brand-500" /> {formatDate(event.event_date)}
                  </div>
                  {event.event_time && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Clock size={15} className="text-brand-500" /> {event.event_time.slice(0, 5)}
                    </div>
                  )}
                  {event.location && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <MapPin size={15} className="text-brand-500" /> {event.location}
                    </div>
                  )}
                </div>

                {event.description && (
                  <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed pt-1 border-t border-gray-100">{event.description}</p>
                )}
              </div>
            </Card>

            {/* Galeri foto & video */}
            <MediaGallery photos={event.photo_urls} videos={event.video_urls} />

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
            )}

            {registration ? (
              <>
                <Card className="p-4 flex items-center gap-3 bg-green-50 border-green-100">
                  <CheckCircle2 size={20} className="text-green-500" />
                  <div>
                    <p className="text-sm font-semibold text-green-700">{t('eventDetail.registered')}</p>
                    <p className="text-xs text-green-600">{t('eventDetail.ticket')}: {registration.ticket_id}</p>
                  </div>
                </Card>
                {/* Tombol Gabung Grup WA — hanya bila admin isi link */}
                {event.whatsapp_group_url && (
                  <a href={event.whatsapp_group_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="w-full">
                      <Users size={16} /> {t('event.joinWaGroup')}
                    </Button>
                  </a>
                )}
                <Button variant="outline" className="w-full" onClick={() => navigate('/scan')}>
                  <ScanLine size={16} /> Scan QR Kehadiran
                </Button>
              </>
            ) : !['Mulai', 'Sedang Berlangsung'].includes(event.status) ? (
              <p className="text-center text-sm text-gray-400">{t('eventDetail.closed')}</p>
            ) : hasPrereq ? (
              // Alur dengan prasyarat: form → submit → tunggu admin approve.
              myPrereq?.status === 'Menunggu' ? (
                <Card className="p-4 bg-amber-50 border-amber-100 space-y-1">
                  <p className="text-sm font-semibold text-amber-700">{t('prereq.pending')}</p>
                  <p className="text-xs text-amber-600">{t('prereq.pendingDesc')}</p>
                </Card>
              ) : myPrereq?.status === 'Ditolak' ? (
                <Card className="p-4 bg-red-50 border-red-100 space-y-1">
                  <p className="text-sm font-semibold text-red-700">{t('prereq.rejected')}</p>
                  {myPrereq?.admin_note && <p className="text-xs text-red-600 whitespace-pre-line">{myPrereq?.admin_note}</p>}
                  <p className="text-xs text-red-500 mt-1">{t('prereq.rejectedContact')}</p>
                </Card>
              ) : myPrereq?.status === 'Disetujui' ? (
                // Edge case race: approved tapi baris registrasi belum ter-fetch.
                <p className="text-center text-sm text-gray-400">{t('prereq.approvedPending')}</p>
              ) : (
                <Card className="p-4 space-y-3">
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
                </Card>
              )
            ) : (
              <Button className="w-full" size="lg" loading={registering} onClick={handleRegister}>
                {t('eventDetail.register')}
              </Button>
            )}

            {/* Kontak WA admin sesuai gender jemaat: Laki-laki → admin
                laki-laki (contact_wa), Perempuan → admin perempuan
                (contact_wa_female); fallback ke yang tersedia. */}
            {(() => {
              const wa = profile?.gender === 'Perempuan'
                ? (event.contact_wa_female || event.contact_wa)
                : (event.contact_wa || event.contact_wa_female)
              return waLink(wa) ? (
                <a href={waLink(wa)} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full">
                    <MessageCircle size={16} /> {t('common.contactWa')}
                  </Button>
                </a>
              ) : null
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
