import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cake, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card, Spinner } from '@/components/ui'
import { umurTahun } from '@/lib/utils'

// Kelompok umur (rentang inklusif)
const BUCKETS = [
  { key: '<18',   label: '< 18',  min: 0,  max: 17 },
  { key: '18-25', label: '18–25', min: 18, max: 25 },
  { key: '26-35', label: '26–35', min: 26, max: 35 },
  { key: '36-45', label: '36–45', min: 36, max: 45 },
  { key: '46-55', label: '46–55', min: 46, max: 55 },
  { key: '56+',   label: '56+',   min: 56, max: 200 },
]

function initials(name) {
  return (name || '?').trim().split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

export default function MemberStats() {
  const [members, setMembers] = useState(null)
  const [selected, setSelected] = useState(null) // key bucket terpilih

  useEffect(() => {
    supabase
      .from('users')
      .select('user_id, name, birth_date, gender')
      .then(({ data }) => setMembers(data || []))
  }, [])

  const { avg, withAgeCount, buckets, maxCount, gender } = useMemo(() => {
    const list = members || []
    const ages = []
    const buk = BUCKETS.map(b => ({ ...b, people: [] }))
    let male = 0, female = 0, other = 0
    for (const m of list) {
      const age = umurTahun(m.birth_date)
      if (age != null) {
        ages.push(age)
        const b = buk.find(x => age >= x.min && age <= x.max)
        if (b) b.people.push({ ...m, age })
      }
      if (m.gender === 'Laki-laki') male++
      else if (m.gender === 'Perempuan') female++
      else other++
    }
    const avg = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null
    const maxCount = Math.max(1, ...buk.map(b => b.people.length))
    return { avg, withAgeCount: ages.length, buckets: buk, maxCount, gender: { male, female, other } }
  }, [members])

  if (!members) {
    return <Card className="p-4 mb-6"><div className="flex justify-center py-6"><Spinner /></div></Card>
  }

  const genderTotal = gender.male + gender.female || 1
  const malePct = Math.round((gender.male / genderTotal) * 100)
  const femalePct = 100 - malePct
  const selectedBucket = buckets.find(b => b.key === selected)

  return (
    <Card className="p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Statistik Jemaat</h3>
        <Link to="/admin/jemaat" className="text-xs text-brand-500 flex items-center gap-0.5">
          Semua <ChevronRight size={13} />
        </Link>
      </div>

      {/* Ringkasan: umur rata-rata + gender */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-2xl bg-brand-50 p-3 text-center">
          <div className="w-9 h-9 mx-auto rounded-xl bg-brand-100 flex items-center justify-center mb-1.5">
            <Cake size={18} className="text-brand-500" />
          </div>
          <p className="text-2xl font-bold text-brand-600 leading-none">{avg ?? '-'}</p>
          <p className="text-[11px] text-gray-500 mt-1">Umur rata-rata</p>
        </div>
        <div className="rounded-2xl bg-blue-50 p-3 text-center">
          <p className="text-2xl font-bold text-blue-600 leading-none mt-2">{gender.male}</p>
          <p className="text-[11px] text-gray-500 mt-1">♂ Laki-laki</p>
        </div>
        <div className="rounded-2xl bg-pink-50 p-3 text-center">
          <p className="text-2xl font-bold text-pink-600 leading-none mt-2">{gender.female}</p>
          <p className="text-[11px] text-gray-500 mt-1">♀ Perempuan</p>
        </div>
      </div>

      {/* Bar komposisi gender */}
      <div className="mb-5">
        <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
          <div className="bg-blue-400" style={{ width: `${malePct}%` }} />
          <div className="bg-pink-400" style={{ width: `${femalePct}%` }} />
        </div>
        <div className="flex justify-between text-[11px] text-gray-400 mt-1">
          <span>Laki-laki {malePct}%</span>
          {gender.other > 0 && <span>Belum diisi: {gender.other}</span>}
          <span>Perempuan {femalePct}%</span>
        </div>
      </div>

      {/* Grafik kelompok umur — klik untuk lihat siapa saja */}
      <p className="text-xs font-semibold text-gray-500 mb-2">Kelompok Umur <span className="font-normal text-gray-400">(klik untuk lihat anggota)</span></p>
      <div className="space-y-2">
        {buckets.map(b => {
          const count = b.people.length
          const active = selected === b.key
          return (
            <button
              key={b.key}
              onClick={() => setSelected(active ? null : b.key)}
              className="w-full flex items-center gap-3 group"
            >
              <span className={`w-12 text-xs font-medium text-right shrink-0 ${active ? 'text-brand-600' : 'text-gray-500'}`}>{b.label}</span>
              <span className="flex-1 h-6 rounded-lg bg-gray-100 overflow-hidden relative">
                <span
                  className={`block h-full rounded-lg transition-all ${active ? 'bg-brand-500' : 'bg-brand-300 group-hover:bg-brand-400'}`}
                  style={{ width: `${Math.max(count ? 8 : 0, (count / maxCount) * 100)}%` }}
                />
              </span>
              <span className={`w-6 text-xs font-semibold text-right shrink-0 ${active ? 'text-brand-600' : 'text-gray-600'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {withAgeCount === 0 && (
        <p className="text-xs text-gray-400 text-center mt-3">Belum ada data tanggal lahir jemaat.</p>
      )}

      {/* Daftar anggota pada kelompok terpilih */}
      {selectedBucket && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">
            Umur {selectedBucket.label} — {selectedBucket.people.length} orang
          </p>
          {selectedBucket.people.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">Tidak ada anggota di kelompok ini.</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto no-scrollbar">
              {selectedBucket.people
                .sort((a, b) => a.age - b.age)
                .map(p => (
                  <Link
                    key={p.user_id}
                    to={`/admin/jemaat/${p.user_id}`}
                    className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full gradient-main flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                      {initials(p.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-[11px] text-gray-400">{p.gender || 'Gender belum diisi'}</p>
                    </div>
                    <span className="text-xs font-semibold text-brand-600 shrink-0">{p.age} th</span>
                  </Link>
                ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
