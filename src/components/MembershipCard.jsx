import { CreditCard } from 'lucide-react'
import { formatDate } from '@/lib/utils'

// Kartu Jemaat: murni menampilkan file PNG yang diunggah admin untuk jemaat
// ini. Masa berlaku 1 tahun sejak Tanggal Pembuatan (membership_card_issued_at)
// — lewat dari itu tampil label merah "Kedaluwarsa".
export function cardExpiryDate(issuedAt) {
  if (!issuedAt) return null
  const d = new Date(issuedAt)
  if (isNaN(d)) return null
  const exp = new Date(d)
  exp.setUTCFullYear(exp.getUTCFullYear() + 1)
  return exp
}

export function isCardExpired(issuedAt) {
  const exp = cardExpiryDate(issuedAt)
  return exp ? Date.now() > exp.getTime() : false
}

export default function MembershipCard({ profile, placeholder = false }) {
  const url = profile?.membership_card_url
  const issuedAt = profile?.membership_card_issued_at

  if (!url) {
    if (!placeholder) return null
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-surface p-5 flex flex-col items-center text-center gap-2">
        <CreditCard size={22} className="text-gray-300" />
        <p className="text-sm text-gray-400">Kartu jemaat belum diunggah.</p>
      </div>
    )
  }

  const expired = isCardExpired(issuedAt)
  const exp = cardExpiryDate(issuedAt)

  return (
    <div className="relative">
      {expired && (
        <span className="absolute top-2 left-2 z-10 px-2.5 py-1 rounded-full bg-red-500 text-white text-[11px] font-bold shadow">
          Kedaluwarsa
        </span>
      )}
      <img
        src={url}
        alt="Kartu Jemaat"
        className={`w-full rounded-2xl ambient-shadow ${expired ? 'grayscale opacity-75' : ''}`}
        draggable="false"
      />
      {exp && (
        <p className="text-[11px] text-gray-400 mt-1.5 text-center">
          Berlaku hingga {formatDate(exp)}
        </p>
      )}
    </div>
  )
}
