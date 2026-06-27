import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, CheckCircle, CalendarOff, ChevronRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { tasksService, canAccessTemplate } from '@/services/tasksService'
import { Card, GradientHeader, Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { startOfWeek } from 'date-fns'

export default function TasksPage() {
  const { profile, isVolunteer } = useAuth()
  const { toast } = useToast()
  const { t } = useLang()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [progress, setProgress] = useState({}) // { formId: responseCount }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    loadTasks()
  }, [profile])

  async function loadTasks() {
    try {
      const all = await tasksService.getTemplates()
      // Saring tugas sesuai ministry user (tugas terbuka tetap tampil)
      const tmpls = all.filter(t => canAccessTemplate(t, profile))
      setTemplates(tmpls)

      // Cek progress minggu ini
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString()
      const progressMap = {}
      await Promise.all(
        tmpls.map(async (tpl) => {
          const responses = await tasksService.getMyResponses(profile.user_id, tpl.form_id, weekStart)
          progressMap[tpl.form_id] = responses.length
        })
      )
      setProgress(progressMap)
    } catch (err) {
      toast.error(err.message || t('tasks.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="flex justify-center items-center h-60"><Spinner /></div>

  return (
    <div>
      <GradientHeader title={t('tasks.title')} subtitle={t('tasks.subtitle', { count: templates.length })} />

      <div className="px-4 py-4 space-y-3">
        {/* Pintasan ajukan izin/sakit — khusus Volunteer */}
        {isVolunteer && (
          <button
            onClick={() => navigate('/izin')}
            className="w-full flex items-center gap-3 bg-surface border border-gray-100 rounded-2xl p-3.5 text-left active:scale-[0.99] transition"
          >
            <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
              <CalendarOff size={18} className="text-brand-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{t('tasks.leaveTitle')}</p>
              <p className="text-xs text-gray-400">{t('tasks.leaveDesc')}</p>
            </div>
            <ChevronRight size={16} className="text-gray-300" />
          </button>
        )}

        {templates.length === 0 && (
          <EmptyState icon={ClipboardList} title={t('tasks.empty')} description={t('tasks.emptyDesc')} />
        )}

        {templates.map(tpl => {
          const done = progress[tpl.form_id] || 0
          const target = tpl.weekly_goal || 1
          const pct = Math.min((done / target) * 100, 100)
          const complete = done >= target

          return (
            <Card key={tpl.form_id} glass className="p-4 cursor-pointer active:scale-[0.99] hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300"
              onClick={() => navigate(`/tugas/${tpl.form_id}`)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-gray-900">{tpl.title}</h2>
                  {tpl.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{tpl.description}</p>}
                </div>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${complete ? 'bg-green-100' : 'bg-brand-100'}`}>
                  {complete
                    ? <CheckCircle size={18} className="text-green-500" />
                    : <ClipboardList size={18} className="text-brand-500" />
                  }
                </div>
              </div>

              {/* Progress ala Stitch */}
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1.5">
                  {complete ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-[11px] font-semibold">
                      <CheckCircle size={13} /> {t('tasks.done')}
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-brand-100 text-brand-700 text-[11px] font-semibold">
                      {t('tasks.progress', { done, target })}
                    </span>
                  )}
                  <span className="text-[11px] font-semibold text-gray-400">{Math.round(pct)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: complete ? '#22c55e' : 'linear-gradient(90deg, #00BFFF, #0077B6)'
                    }}
                  />
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
