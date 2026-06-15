import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, CheckCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { tasksService, canAccessTemplate } from '@/services/tasksService'
import { Card, GradientHeader, Spinner, EmptyState } from '@/components/ui'
import { startOfWeek } from 'date-fns'

export default function TasksPage() {
  const { profile } = useAuth()
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
        tmpls.map(async (t) => {
          const responses = await tasksService.getMyResponses(profile.user_id, t.form_id, weekStart)
          progressMap[t.form_id] = responses.length
        })
      )
      setProgress(progressMap)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="flex justify-center items-center h-60"><Spinner /></div>

  return (
    <div>
      <GradientHeader title="Tugas Saya" subtitle={`${templates.length} form aktif minggu ini`} />

      <div className="px-4 py-4 space-y-3">
        {templates.length === 0 && (
          <EmptyState icon={ClipboardList} title="Belum ada tugas" description="Admin belum membuat tugas untuk kamu saat ini." />
        )}

        {templates.map(t => {
          const done = progress[t.form_id] || 0
          const target = t.weekly_goal || 1
          const pct = Math.min((done / target) * 100, 100)
          const complete = done >= target

          return (
            <Card key={t.form_id} glass className="p-4 cursor-pointer active:scale-[0.99] hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300"
              onClick={() => navigate(`/tugas/${t.form_id}`)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-gray-900">{t.title}</h2>
                  {t.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{t.description}</p>}
                </div>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${complete ? 'bg-green-100' : 'bg-orange-100'}`}>
                  {complete
                    ? <CheckCircle size={18} className="text-green-500" />
                    : <ClipboardList size={18} className="text-orange-500" />
                  }
                </div>
              </div>

              {/* Progress ala Stitch */}
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1.5">
                  {complete ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-[11px] font-semibold">
                      <CheckCircle size={13} /> Selesai
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-[11px] font-semibold">
                      {done} dari {target} target — Berjalan
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
