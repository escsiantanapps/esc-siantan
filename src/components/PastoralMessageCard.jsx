import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquare, X, ChevronRight } from 'lucide-react'
import { useLang } from '@/hooks/useLang'
import { messagesService } from '@/services/messagesService'
import { Card } from '@/components/ui'

// Kunci localStorage: daftar message_id yang sudah ditutup jemaat di Beranda.
// Broadcast tanpa tabel "read" per-user, jadi status baca dilacak ringan di
// perangkat (hindari write-amplification: ±200 jemaat × tiap pesan).
const DISMISS_KEY = 'esc-pastoral-dismissed'

function readDismissed() {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]') } catch { return [] }
}
function writeDismissed(ids) {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(ids.slice(-200))) } catch { /* kuota penuh — abaikan */ }
}

// Kartu Pesan Gembala di Beranda: menampilkan pengumuman yang BELUM ditutup.
export default function PastoralMessageCard() {
  const { t } = useLang()
  const [messages, setMessages] = useState([])

  useEffect(() => {
    messagesService.getRecent(5)
      .then(rows => {
        const dismissed = readDismissed()
        const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000)
        setMessages(rows.filter(m => {
          const isOld = new Date(m.created_at).getTime() < threeDaysAgo
          return !isOld && !dismissed.includes(m.message_id)
        }))
      })
      .catch(() => {})
  }, [])

  if (messages.length === 0) return null

  function dismiss(msg) {
    setMessages(p => p.filter(m => m.message_id !== msg.message_id))
    writeDismissed([...readDismissed(), msg.message_id])
  }

  return (
    <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 mb-5 pb-2 -mx-4 px-4 scrollbar-hide">
      {messages.map(msg => (
        <Card key={msg.message_id} className="w-[85vw] max-w-[320px] shrink-0 snap-center p-4 border-brand-200 bg-brand-50/60 relative animate-fade-in-up">
          <button
            onClick={() => dismiss(msg)}
            aria-label={t('common.close')}
            className="absolute top-2.5 right-2.5 text-gray-300 hover:text-gray-500"
          >
            <X size={15} />
          </button>
          <div className="flex items-start gap-3 pr-5">
            <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
              <MessageSquare size={17} className="text-brand-500" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-brand-600 uppercase tracking-wide">
                {t('pesan.from', { name: msg.sender_name || t('role.Gembala') })}
              </p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{msg.title}</p>
              <p className="text-sm text-gray-600 mt-1 whitespace-pre-line line-clamp-4">{msg.body}</p>
            </div>
          </div>
          <Link
            to="/pesan"
            className="mt-3 flex items-center justify-end gap-1 text-xs font-medium text-brand-600"
          >
            {t('pesan.seeAll')} <ChevronRight size={14} />
          </Link>
        </Card>
      ))}
    </div>
  )
}
