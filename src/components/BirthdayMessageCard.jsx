import { useEffect, useState } from 'react'
import { Cake, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { birthdayService } from '@/services/birthdayService'
import { Card } from '@/components/ui'

// Kartu pesan ulang tahun personal dari PKS, muncul di Beranda selama belum dibaca.
export default function BirthdayMessageCard() {
  const { profile } = useAuth()
  const { t } = useLang()
  const [messages, setMessages] = useState([])

  useEffect(() => {
    if (!profile?.user_id) return
    birthdayService.getMyUnread(profile.user_id).then(setMessages).catch(() => {})
  }, [profile?.user_id])

  if (messages.length === 0) return null

  async function dismiss(msg) {
    setMessages(p => p.filter(m => m.id !== msg.id))
    try { await birthdayService.markRead(msg.id) } catch { /* abaikan -- bukan blocker UX */ }
  }

  return (
    <div className="space-y-2.5 mb-5">
      {messages.map(msg => (
        <Card key={msg.id} className="p-4 border-pink-200 bg-pink-50/60 relative animate-fade-in-up">
          <button onClick={() => dismiss(msg)} aria-label="Tutup" className="absolute top-2.5 right-2.5 text-gray-300 hover:text-gray-500">
            <X size={15} />
          </button>
          <div className="flex items-start gap-3 pr-5">
            <div className="w-9 h-9 rounded-full bg-pink-100 flex items-center justify-center shrink-0">
              <Cake size={17} className="text-pink-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{t('home.birthdayFrom', { name: msg.users?.name || 'PKS' })}</p>
              <p className="text-sm text-gray-600 mt-1">{msg.message}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
