import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, CheckCircle, Circle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { tasksService } from '@/services/tasksService'
import { Card, GradientHeader, Badge, Spinner, EmptyState } from '@/components/ui'
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
      const ministryId = profile?.ministry_ids?.[0]
      const tmpls = await tasksService.getTemplates({ ministryId })
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
            <Card key={t.form_id} className="p-4 cursor-pointer active:scale-[0.99] transition-transform"
              onClick={() => navigate(`/tugas/${t.form_id}`)}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${complete ? 'bg-green-100' : 'bg-orange-100'}`}>
                    {complete
                      ? <CheckCircle size={20} className="text-green-500" />
                      : <Circle size={20} className="text-orange-500" />
                    }
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Target: {target}× / {t.period === 'bulan' ? 'bulan' : 'minggu'}
                    </p>
                  </div>
                </div>
                <Badge color={complete ? 'green' : done > 0 ? 'orange' : 'gray'}>
                  {done}/{target}
                </Badge>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    background: complete ? '#22c55e' : 'linear-gradient(90deg, #FF6B35, #E63946)'
                  }}
                />
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
