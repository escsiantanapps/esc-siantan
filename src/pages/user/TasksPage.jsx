import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, CheckCircle, CalendarOff, ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { tasksService, canAccessTemplate } from '@/services/tasksService'
import { Card, GradientHeader, Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { startOfWeek } from 'date-fns'

// Tema warna folder — diputar berdasarkan urutan kategori supaya tiap
// folder punya identitas visual sendiri (kelas Tailwind ditulis literal,
// bukan diinterpolasi, karena JIT scanner butuh string utuh).
const FOLDER_THEMES = [
  { chip: 'bg-amber-100 text-amber-600', bar: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700', border: 'border-amber-300' },
  { chip: 'bg-blue-100 text-blue-600', bar: 'bg-blue-400', badge: 'bg-blue-50 text-blue-700', border: 'border-blue-300' },
  { chip: 'bg-purple-100 text-purple-600', bar: 'bg-purple-400', badge: 'bg-purple-50 text-purple-700', border: 'border-purple-300' },
  { chip: 'bg-pink-100 text-pink-600', bar: 'bg-pink-400', badge: 'bg-pink-50 text-pink-700', border: 'border-pink-300' },
  { chip: 'bg-emerald-100 text-emerald-600', bar: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-300' },
  { chip: 'bg-indigo-100 text-indigo-600', bar: 'bg-indigo-400', badge: 'bg-indigo-50 text-indigo-700', border: 'border-indigo-300' },
  { chip: 'bg-rose-100 text-rose-600', bar: 'bg-rose-400', badge: 'bg-rose-50 text-rose-700', border: 'border-rose-300' },
  { chip: 'bg-cyan-100 text-cyan-600', bar: 'bg-cyan-400', badge: 'bg-cyan-50 text-cyan-700', border: 'border-cyan-300' },
]

export default function TasksPage() {
  const { profile, isVolunteer } = useAuth()
  const { toast } = useToast()
  const { t } = useLang()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [progress, setProgress] = useState({}) // { formId: responseCount }
  const [loading, setLoading] = useState(true)
  const [openFolders, setOpenFolders] = useState(() => new Set())

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

  // Kelompokkan tugas per Kategori Tugas (mis. "Umum", "Komsel Youth") jadi
  // tampilan ala folder — tugas tanpa kategori (data lama sebelum migrasi)
  // jatuh ke folder "Lainnya".
  const folders = useMemo(() => {
    const groups = new Map()
    for (const tpl of templates) {
      const key = tpl.category_id || '__none'
      const name = tpl.category_name || t('tasks.uncategorized')
      if (!groups.has(key)) groups.set(key, { key, name, items: [] })
      groups.get(key).items.push(tpl)
    }
    return [...groups.values()]
  }, [templates, t])

  function toggleFolder(key) {
    setOpenFolders(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
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

        {folders.map((folder, i) => {
          const theme = FOLDER_THEMES[i % FOLDER_THEMES.length]
          const open = openFolders.has(folder.key)
          const doneCount = folder.items.filter(tpl => (progress[tpl.form_id] || 0) >= (tpl.weekly_goal || 1)).length
          const pct = folder.items.length ? Math.round((doneCount / folder.items.length) * 100) : 0
          const allDone = folder.items.length > 0 && doneCount === folder.items.length

          return (
            <div key={folder.key}>
              <button
                onClick={() => toggleFolder(folder.key)}
                className={`w-full glass-card rounded-2xl p-4 text-left transition-all active:scale-[0.99] ${open ? `border-2 ${theme.border}` : 'border border-transparent'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform ${theme.chip} ${open ? 'scale-105' : ''}`}>
                    {open ? <FolderOpen size={22} /> : <Folder size={22} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{folder.name}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${theme.badge}`}>
                        {t('tasks.folderCount', { count: folder.items.length })}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-green-400' : theme.bar}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-semibold text-gray-400 shrink-0">
                        {allDone ? `✓ ${t('tasks.done')}` : t('tasks.folderProgress', { done: doneCount, total: folder.items.length })}
                      </span>
                    </div>
                  </div>
                  <ChevronDown size={18} className={`text-gray-300 shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
                </div>
              </button>

              <div className={`grid transition-all duration-300 ease-in-out ${open ? 'grid-rows-[1fr] opacity-100 mt-2.5' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                  <div className={`pl-3.5 ml-5 space-y-2.5 border-l-2 ${theme.border}`}>
                    {folder.items.map(tpl => (
                      <TaskCard key={tpl.form_id} tpl={tpl} progress={progress} t={t}
                        onClick={() => navigate(`/tugas/${tpl.form_id}`)} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TaskCard({ tpl, progress, onClick, t }) {
  const done = progress[tpl.form_id] || 0
  const target = tpl.weekly_goal || 1
  const pct = Math.min((done / target) * 100, 100)
  const complete = done >= target

  return (
    <Card glass className="p-4 cursor-pointer active:scale-[0.99] hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300"
      onClick={onClick}>
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
}
