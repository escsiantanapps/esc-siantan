import { useEffect, useState } from 'react'
import { AlertTriangle, FileText, Calendar, User } from 'lucide-react'
import { spService } from '@/services/spService'
import { useAuth } from '@/hooks/useAuth'
import { Card, PageHeader, Spinner, EmptyState, StatusBadge, Avatar } from '@/components/ui'
import { formatDate } from '@/lib/utils'

export default function MySPPage() {
  const { profile } = useAuth()
  const [spLetters, setSpLetters] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.user_id) {
      spService.getByUser(profile.user_id)
        .then(setSpLetters)
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [profile])

  const activeSP = spLetters.filter(sp => sp.is_active)
  const historySP = spLetters.filter(sp => !sp.is_active)

  return (
    <div>
      <PageHeader 
        title="Surat Peringatan (SP)" 
        subtitle={`${activeSP.length} SP aktif · ${historySP.length} riwayat`}
      />

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && spLetters.length === 0 && (
        <EmptyState 
          icon={FileText} 
          title="Tidak ada surat peringatan" 
          description="Anda belum pernah menerima surat peringatan. Tetap jaga perilaku dan komitmen!" 
        />
      )}

      {/* SP Aktif */}
      {!loading && activeSP.length > 0 && (
        <div className="space-y-3 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 px-1">SP Aktif</h2>
          {activeSP.map(sp => (
            <Card key={sp.letter_id} className="p-4 border-l-4 border-red-500">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                    <AlertTriangle size={18} className="text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{sp.category.name}</p>
                    <p className="text-xs text-gray-400">Level {sp.category.level}</p>
                  </div>
                </div>
                <StatusBadge status={sp.category.name} />
              </div>

              {sp.notes && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 mb-3">
                  <p className="text-xs text-gray-400 mb-1">Keterangan:</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{sp.notes}</p>
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-gray-400">
                <div className="flex items-center gap-1.5">
                  <Calendar size={13} />
                  <span>{formatDate(sp.issued_at)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <User size={13} />
                  <span>Diterbitkan oleh {sp.issuer.name}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Riwayat SP (sudah tidak aktif) */}
      {!loading && historySP.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 px-1">Riwayat SP</h2>
          <Card className="divide-y divide-gray-100">
            {historySP.map(sp => (
              <div key={sp.letter_id} className="p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <FileText size={14} className="text-gray-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{sp.category.name}</p>
                      <p className="text-xs text-gray-400">Level {sp.category.level}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    Tidak Aktif
                  </span>
                </div>

                {sp.notes && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-2 ml-10">{sp.notes}</p>
                )}

                <div className="flex items-center gap-4 text-xs text-gray-400 ml-10">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={12} />
                    <span>{formatDate(sp.issued_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User size={12} />
                    <span>{sp.issuer.name}</span>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  )
}
