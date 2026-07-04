import { useState } from 'react'
import { Bug, Send } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { pushService } from '@/services/pushService'
import { Card, Button } from '@/components/ui'

// Panel diagnosa push — hanya ditampilkan untuk Admin/Super Admin.
// Tombol "Kirim push tes" mem-broadcast ke user_id admin sendiri sehingga
// hasil (sent/total/error) langsung terlihat tanpa perlu buka DevTools.
export default function PushDiagnosticsCard() {
  const { profile, isAdmin } = useAuth()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState(null)

  if (!isAdmin) return null

  async function sendTest() {
    if (busy || !profile?.user_id) return
    setBusy(true)
    setLast(null)
    try {
      const r = await pushService.broadcast({
        title: 'Tes Notifikasi ESC Siantan',
        body: `Halo ${profile.name || 'Admin'}, ini push tes ${new Date().toLocaleTimeString('id-ID')}.`,
        url: '/pengaturan',
        userIds: [profile.user_id],
      })
      setLast(r)
      if ((r?.sent ?? 0) > 0) {
        toast.success(`Push tes terkirim ke ${r.sent} perangkat.`)
      } else if (r?.total > 0) {
        const detail = r.errors?.[0]?.detail || 'lihat detail di bawah'
        toast.error(`Gagal kirim ke ${r.total} perangkat: ${detail}`)
      } else {
        toast.info('Anda belum mengaktifkan push di perangkat ini. Aktifkan dulu di atas.')
      }
    } catch (err) {
      setLast({ error: err?.message || String(err) })
      toast.error(err?.message || 'Gagal mengirim push tes.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
          <Bug size={15} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 font-medium">Diagnosa Push</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Kirim notifikasi push tes ke akun Anda sendiri untuk memastikan
            server dan perangkat berfungsi.
          </p>
        </div>
      </div>

      <Button onClick={sendTest} loading={busy} size="sm" className="w-full mt-3">
        <Send size={14} /> Kirim push tes ke saya
      </Button>

      {last && (
        <div className="mt-3 rounded-xl bg-gray-50 border border-gray-100 p-3 text-[11px] text-gray-700 space-y-1">
          {last.error ? (
            <p className="text-red-600 break-all">{last.error}</p>
          ) : (
            <>
              <div className="flex justify-between"><span className="text-gray-500">Total perangkat target</span><span className="font-semibold">{last.total ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Berhasil dikirim</span><span className="font-semibold text-green-600">{last.sent ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Sub kedaluwarsa dihapus</span><span className="font-semibold">{last.removed ?? 0}</span></div>
              {last.totalSystemWide != null && (
                <div className="flex justify-between"><span className="text-gray-500">Total sub aktif di sistem</span><span className="font-semibold">{last.totalSystemWide}</span></div>
              )}
              {Array.isArray(last.errors) && last.errors.length > 0 && (
                <div className="pt-2 mt-2 border-t border-gray-200 space-y-1">
                  <p className="text-gray-500">Error:</p>
                  {last.errors.slice(0, 3).map((e, i) => (
                    <p key={i} className="text-red-600 break-all">
                      [{e.statusCode || '?'}] {e.detail}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  )
}
