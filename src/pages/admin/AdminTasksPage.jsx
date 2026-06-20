import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Plus, ChevronRight, BarChart2, Bell } from 'lucide-react'
import { startOfWeek, startOfMonth } from 'date-fns'
import { tasksService } from '@/services/tasksService'
import { evaluationService } from '@/services/evaluationService'
import { pushService } from '@/services/pushService'
import { useToast } from '@/hooks/useToast'
import { Card, PageHeader, Button, Spinner, EmptyState } from '@/components/ui'
import { useLang } from '@/hooks/useLang'

export default function AdminTasksPage() {
  const { t: tr } = useLang()
  const { toast, confirm } = useToast()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [sendingId, setSendingId] = useState(null)

  useEffect(() => {
    tasksService.getTemplates().then(setTemplates).catch(() => {}).finally(() => setLoading(false))
  }, [])

  // Kirim notifikasi pengingat ke jemaat yang BELUM memenuhi tugas pada periode ini.
  async function sendReminder(tpl) {
    const ok = await confirm({
      title: tr('atask.remindTitle'),
      message: tr('atask.remindMsg', { title: tpl.title }),
      confirmText: tr('atask.remind'),
    })
    if (!ok) return
    setSendingId(tpl.form_id)
    try {
      const periodStart = tpl.period === 'bulan'
        ? startOfMonth(new Date())
        : startOfWeek(new Date(), { weekStartsOn: 1 })
      const rows = await evaluationService.getEvaluation({
        formId: tpl.form_id, startDate: periodStart.toISOString(), endDate: new Date().toISOString(),
      })
      const userIds = rows.filter(r => r.status !== 'TERPENUHI').map(r => r.user.user_id)
      if (userIds.length === 0) { toast.info(tr('atask.allDone')); return }
      const r = await pushService.broadcast({
        title: tr('atask.pushTitle'),
        body: tr('atask.pushBody', { title: tpl.title }),
        url: `/tugas/${tpl.form_id}`,
        userIds,
      })
      toast.success(tr('atask.reminderSent', { n: r?.sent ?? 0 }))
    } catch (err) {
      toast.error(err.message || tr('atask.reminderFailed'))
    } finally {
      setSendingId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title={tr('atask.title')}
        subtitle={tr('atask.subtitle', { count: templates.length })}
        action={<Link to="/admin/tugas/baru"><Button size="sm"><Plus size={15} /> {tr('atask.create')}</Button></Link>}
      />

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && templates.length === 0 && (
        <EmptyState icon={ClipboardList} title={tr('atask.empty')} description={tr('atask.emptyDesc')} />
      )}

      {!loading && templates.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {templates.map(t => (
            <div key={t.form_id} className="flex items-center gap-3 p-3.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{t.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {tr('atask.targetLine', { goal: t.weekly_goal || 1, period: t.period === 'bulan' ? tr('atask.perMonth') : tr('atask.perWeek'), fields: (t.fields_json || []).length })}
                </p>
              </div>
              <button
                onClick={() => sendReminder(t)}
                disabled={sendingId === t.form_id}
                title={tr('atask.remind')}
                className="text-xs text-amber-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-amber-50 flex-shrink-0 disabled:opacity-50"
              >
                <Bell size={13} /> {sendingId === t.form_id ? '…' : tr('atask.remind')}
              </button>
              <Link to={`/admin/tugas/${t.form_id}/jawaban`} className="text-xs text-blue-500 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-50 flex-shrink-0">
                <BarChart2 size={13} /> {tr('atask.answers')}
              </Link>
              <Link to={`/admin/tugas/${t.form_id}/edit`} className="text-xs text-brand-500 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-brand-50 flex-shrink-0">
                {tr('a.edit')} <ChevronRight size={13} />
              </Link>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
