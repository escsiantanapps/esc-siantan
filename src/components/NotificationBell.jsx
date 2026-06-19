import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Megaphone, ClipboardList, FileCheck, X } from 'lucide-react'
import { startOfWeek } from 'date-fns'
import { useAuth } from '@/hooks/useAuth'
import { newsService, registrationService } from '@/services/contentService'
import { tasksService, canAccessTemplate } from '@/services/tasksService'
import { useBackClose } from '@/hooks/useBackClose'
import { formatDate } from '@/lib/utils'

export default function NotificationBell() {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [seen, setSeen] = useState(0)
  const ref = useRef(null)
  useBackClose(open, () => setOpen(false)) // back menutup dropdown notifikasi dulu

  const seenKey = profile ? `esc-notif-seen-${profile.user_id}` : null

  useEffect(() => {
    if (!profile) return
    setSeen(Number(localStorage.getItem(`esc-notif-seen-${profile.user_id}`)) || 0)
    build()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  useEffect(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function build() {
    const list = []

    // 1. Status pendaftaran (baptis & nikah)
    try {
      const { baptism, wedding } = await registrationService.getMyRegistrations(profile.user_id)
      baptism.forEach((b, idx) => list.push({
        id: `bap-${idx}`, icon: FileCheck,
        title: `Pendaftaran Baptisan: ${b.status}`,
        subtitle: b.admin_note || 'Ketuk untuk melihat status',
        time: b.scheduled_at || b.created_at,
        to: '/status-pendaftaran',
      }))
      wedding.forEach((w, idx) => list.push({
        id: `wed-${idx}`, icon: FileCheck,
        title: `Pemberkatan Nikah: ${w.status}`,
        subtitle: w.admin_note || 'Ketuk untuk melihat status',
        time: w.scheduled_at || w.created_at,
        to: '/status-pendaftaran',
      }))
    } catch { /* abaikan */ }

    // 2. Tugas belum selesai minggu ini
    try {
      const all = await tasksService.getTemplates()
      const mine = all.filter(t => canAccessTemplate(t, profile))
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString()
      let incomplete = 0
      await Promise.all(mine.map(async t => {
        const res = await tasksService.getMyResponses(profile.user_id, t.form_id, weekStart)
        if (res.length < (t.weekly_goal || 1)) incomplete++
      }))
      if (incomplete > 0) list.push({
        id: 'tasks', icon: ClipboardList,
        title: `${incomplete} tugas belum selesai`,
        subtitle: 'Minggu ini — ketuk untuk mengisi',
        time: new Date().toISOString(),
        to: '/tugas',
      })
    } catch { /* abaikan */ }

    // 3. Pengumuman terbaru
    try {
      const news = await newsService.getAll()
      news.slice(0, 5).forEach(n => list.push({
        id: `news-${n.news_id}`, icon: Megaphone,
        title: n.title,
        subtitle: 'Pengumuman gereja',
        time: n.created_at,
        to: `/informasi/${n.news_id}`,
      }))
    } catch { /* abaikan */ }

    list.sort((a, b) => new Date(b.time) - new Date(a.time))
    setItems(list)
  }

  const unread = items.filter(i => new Date(i.time).getTime() > seen).length

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && seenKey) {
      const now = Date.now()
      localStorage.setItem(seenKey, String(now))
      setSeen(now)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="Notifikasi"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 bg-brand-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center border border-surface">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-surface rounded-2xl border border-gray-100 ambient-shadow z-50 overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Notifikasi</p>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600" aria-label="Tutup">
              <X size={16} />
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Belum ada notifikasi</p>
            ) : items.map(n => (
              <Link
                key={n.id}
                to={n.to}
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
              >
                <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                  <n.icon size={16} className="text-brand-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                  <p className="text-xs text-gray-400 truncate">{n.subtitle}</p>
                  <p className="text-[10px] text-gray-300 mt-0.5">{formatDate(n.time, 'd MMM yyyy, HH:mm')}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
