import { useEffect, useState } from 'react'
import { Send, Trash2, MessageSquare } from 'lucide-react'
import { messagesService } from '@/services/messagesService'
import { pushService } from '@/services/pushService'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { Card, Input, Textarea, Button, Checkbox, Spinner, PageHeader, EmptyState } from '@/components/ui'
import { formatDate } from '@/lib/utils'

// Panel Pesan Gembala — buat pengumuman broadcast ke SEMUA jemaat (tersimpan
// di app + opsional push notification). Akses: Gembala & Super Admin (ditegakkan
// policy DB `pm_write`; halaman ini hanya disodorkan ke role tersebut di menu).
export default function AdminMessagesPage() {
  const { profile } = useAuth()
  const { toast, confirm } = useToast()
  const { t } = useLang()

  const [form, setForm] = useState({ title: '', body: '', push: true })
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  function load() {
    setLoading(true)
    messagesService.getAll().then(setMessages).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [])

  async function handleSend(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.body.trim()) {
      toast.error(t('amsg.required'))
      return
    }
    setSending(true)
    try {
      await messagesService.create({
        title: form.title.trim(),
        body: form.body.trim(),
        senderId: profile?.user_id,
        senderName: profile?.name || t('role.Gembala'),
      })

      // Push opsional — fire-and-forget dengan laporan hasil eksplisit, meniru
      // pola broadcast berita. Kegagalan push TIDAK membatalkan pesan (pesan
      // sudah tersimpan & tetap muncul di app).
      if (form.push) {
        pushService.broadcast({
          title: form.title.trim(),
          body: form.body.trim(),
          url: '/pesan',
        })
          .then(r => {
            if (r?.sent > 0) toast.success(t('amsg.pushSent', { n: r.sent }))
            else toast.info(t('amsg.pushNone'))
          })
          .catch(() => toast.info(t('amsg.pushFailed')))
      }

      toast.success(t('amsg.saved'))
      setForm({ title: '', body: '', push: true })
      load()
    } catch (err) {
      toast.error(err?.message || t('amsg.saveFailed'))
    } finally {
      setSending(false)
    }
  }

  async function handleDelete(msg) {
    const ok = await confirm({
      title: t('amsg.deleteTitle'),
      message: t('amsg.deleteMsg'),
      confirmText: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await messagesService.remove(msg.message_id)
      setMessages(p => p.filter(m => m.message_id !== msg.message_id))
    } catch (err) {
      toast.error(err?.message || t('amsg.deleteFailed'))
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('amsg.title')} subtitle={t('amsg.subtitle')} />

      <Card className="p-4 mb-5 space-y-4">
        <form onSubmit={handleSend} className="space-y-4">
          <Input
            label={t('amsg.msgTitle')}
            required
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder={t('amsg.msgTitlePh')}
            maxLength={120}
          />
          <Textarea
            label={t('amsg.msgBody')}
            required
            rows={5}
            value={form.body}
            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            placeholder={t('amsg.msgBodyPh')}
            maxLength={2000}
          />
          <Checkbox
            label={t('amsg.alsoPush')}
            checked={form.push}
            onChange={e => setForm(f => ({ ...f, push: e.target.checked }))}
          />
          <p className="text-xs text-gray-400 -mt-1">{t('amsg.pushHint')}</p>
          <Button type="submit" loading={sending} className="w-full">
            <Send size={16} /> {t('amsg.sendBtn')}
          </Button>
        </form>
      </Card>

      <h2 className="text-sm font-semibold text-gray-900 mb-2 px-1">{t('amsg.history')}</h2>
      {loading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : messages.length === 0 ? (
        <EmptyState icon={MessageSquare} title={t('amsg.emptyTitle')} description={t('amsg.emptyDesc')} />
      ) : (
        <div className="space-y-2.5">
          {messages.map(msg => (
            <Card key={msg.message_id} className="p-4 relative">
              <button
                onClick={() => handleDelete(msg)}
                aria-label={t('common.delete')}
                className="absolute top-3 right-3 text-gray-300 hover:text-red-500 transition-colors"
              >
                <Trash2 size={16} />
              </button>
              <p className="text-sm font-semibold text-gray-900 pr-6">{msg.title}</p>
              <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{msg.body}</p>
              <p className="text-[11px] text-gray-400 mt-2">
                {msg.sender_name || t('role.Gembala')} · {formatDate(msg.created_at)}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
