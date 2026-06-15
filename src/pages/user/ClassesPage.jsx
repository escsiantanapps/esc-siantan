import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, MapPin, Clock, QrCode } from 'lucide-react'
import { classesService } from '@/services/contentService'
import { Card, Spinner, EmptyState, GradientHeader, StatusBadge } from '@/components/ui'
import { dummyThumb } from '@/lib/utils'

export default function ClassesPage() {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    classesService.getAll().then(setClasses).catch(() => {}).finally(() => setLoading(false))
  }, [])

  return (
    <div className="pb-4">
      <GradientHeader title="Kelas & Pembinaan" subtitle="Kelas pembinaan jemaat">
        <Link to="/kelas/absen" className="mt-3 inline-flex items-center gap-2 bg-white/20 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-white/30 transition-colors">
          <QrCode size={16} /> Scan Absensi
        </Link>
      </GradientHeader>

      <div className="px-4 -mt-2 pt-4">
        {loading && <div className="flex justify-center py-8"><Spinner /></div>}

        {!loading && classes.length === 0 && (
          <EmptyState icon={BookOpen} title="Belum ada kelas" description="Kelas pembinaan akan muncul di sini." />
        )}

        {/* Kartu kelas dengan cover ala Stitch */}
        <div className="space-y-3.5">
          {classes.map(cls => (
            <Link key={cls.class_id} to={`/kelas/${cls.class_id}`}>
              <Card glass className="overflow-hidden hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300">
                <div className="relative h-28">
                  <img src={cls.thumbnail_url || dummyThumb(cls.class_id)} alt={cls.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                  <div className="absolute top-2.5 right-2.5"><StatusBadge status={cls.status} /></div>
                </div>
                <div className="p-3.5">
                  <p className="text-sm font-semibold text-gray-900">{cls.name}</p>
                  <div className="mt-1.5 space-y-0.5">
                    {cls.schedule && (
                      <p className="text-xs text-gray-400 flex items-center gap-1"><Clock size={11} /> {cls.schedule}</p>
                    )}
                    {cls.location && (
                      <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin size={11} /> {cls.location}</p>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
