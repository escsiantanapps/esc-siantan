import { useEffect, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { messagesService } from '@/services/messagesService'
import { useLang } from '@/hooks/useLang'
import { GradientHeader, Card, Spinner, EmptyState } from '@/components/ui'
import { formatDate } from '@/lib/utils'

const DISMISS_KEY = 'esc-pastoral-dismissed'

// Halaman Pesan Gembala (jemaat) — riwayat lengkap pengumuman broadcast.
// Membuka halaman ini menandai semua pesan "sudah dilihat" (mengosongkan
// indikator belum-dibaca di Beranda).
export default function PesanPage() {
  const { t } = useLang()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    messagesService.getAll()
      .then(rows => {
        setMessages(rows)
        // Tandai semua pesan yang ada sebagai sudah dilihat di perangkat ini.
        try {
          localStorage.setItem(DISMISS_KEY, JSON.stringify(rows.map(m => m.message_id).slice(-200)))
        } catch { /* abaikan */ }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <GradientHeader title={t('pesan.title')} subtitle={t('pesan.subtitle')} back />
      <div className="px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : messages.length === 0 ? (
          <EmptyState icon={MessageSquare} title={t('pesan.emptyTitle')} description={t('pesan.emptyDesc')} />
        ) : (
          <div className="space-y-2.5">
            {messages.map(msg => (
              <Card key={msg.message_id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                    <MessageSquare size={17} className="text-brand-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-brand-600 uppercase tracking-wide">
                      {t('pesan.from', { name: msg.sender_name || t('role.Gembala') })}
                    </p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">{msg.title}</p>
                    <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{msg.body}</p>
                    <p className="text-[11px] text-gray-400 mt-2">{formatDate(msg.created_at)}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
