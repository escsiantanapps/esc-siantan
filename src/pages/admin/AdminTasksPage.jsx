import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Plus, ChevronRight, BarChart2 } from 'lucide-react'
import { tasksService } from '@/services/tasksService'
import { Card, PageHeader, Button, Spinner, EmptyState } from '@/components/ui'

export default function AdminTasksPage() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    tasksService.getTemplates().then(setTemplates).catch(() => {}).finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <PageHeader
        title="Form & Tugas"
        subtitle={`${templates.length} template tugas`}
        action={<Link to="/admin/tugas/baru"><Button size="sm"><Plus size={15} /> Buat Template</Button></Link>}
      />

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && templates.length === 0 && (
        <EmptyState icon={ClipboardList} title="Belum ada template tugas" description="Buat template untuk mulai mengumpulkan data dari jemaat/volunteer." />
      )}

      {!loading && templates.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {templates.map(t => (
            <div key={t.form_id} className="flex items-center gap-3 p-3.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{t.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Target {t.weekly_goal || 1}x / {t.period === 'bulan' ? 'bulan' : 'minggu'} · {(t.fields_json || []).length} field
                </p>
              </div>
              <Link to={`/admin/tugas/${t.form_id}/jawaban`} className="text-xs text-blue-500 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-50 flex-shrink-0">
                <BarChart2 size={13} /> Jawaban
              </Link>
              <Link to={`/admin/tugas/${t.form_id}/edit`} className="text-xs text-orange-500 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-orange-50 flex-shrink-0">
                Edit <ChevronRight size={13} />
              </Link>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
