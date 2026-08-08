import { supabase } from '@/lib/supabase'

// Bucket yang dipakai aplikasi. 'documents' bisa privat (tanpa policy baca),
// sehingga sumnya mungkin 0 dari sisi klien — itu wajar, indikator ini bersifat
// perkiraan untuk memantau agar storage tidak penuh.
const BUCKETS = ['profile-photos', 'task-files', 'documents', 'inventory-photos']

const PAGE = 100

// Jumlahkan ukuran semua objek dalam sebuah folder bucket (rekursif).
async function sumFolder(bucket, prefix = '') {
  let total = 0
  let offset = 0
  // Loop paginasi: list() mengembalikan maks `PAGE` item per panggilan.
  for (;;) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error || !data || data.length === 0) break
    for (const item of data) {
      // Entri folder: id === null (tanpa metadata) → telusuri isinya.
      if (item.id === null) {
        const sub = prefix ? `${prefix}/${item.name}` : item.name
        total += await sumFolder(bucket, sub)
      } else {
        total += item.metadata?.size || 0
      }
    }
    if (data.length < PAGE) break
    offset += PAGE
  }
  return total
}

export const storageService = {
  // { total, perBucket: { [bucket]: bytes } } — total byte terpakai.
  async getUsage() {
    const perBucket = {}
    let total = 0
    for (const b of BUCKETS) {
      const size = await sumFolder(b).catch(() => 0)
      perBucket[b] = size
      total += size
    }
    return { total, perBucket }
  },
}
