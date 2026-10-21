import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from './_lib/rate-limit.js'
import { cleanBibleVerses } from './_lib/bible-text.js'
import { bibleVersions } from '../src/data/bibleVersions.js'

export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (checkRateLimit(req, res, { endpoint: 'bible-chapter', max: 300 })) return

  const book = Number(req.body?.book)
  const chapter = Number(req.body?.chapter)
  const translation = req.body?.translation || 'tb'
  if (!Number.isInteger(book) || book < 1 || book > 66 || !Number.isInteger(chapter) || chapter < 1 || chapter > 150) {
    return res.status(400).json({ error: 'Kitab atau pasal tidak valid.' })
  }
  if (!Object.hasOwn(bibleVersions, translation) || !bibleVersions[translation].books.includes(book)) {
    return res.status(400).json({ error: 'Versi atau kitab tidak tersedia.' })
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !serviceRoleKey) return res.status(500).json({ error: 'Konfigurasi server belum lengkap.' })

  const authorization = String(req.headers.authorization || '')
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData?.user) return res.status(401).json({ error: 'Unauthorized' })

    // Token Supabase saja belum cukup: akun yang menunggu persetujuan atau nonaktif tidak boleh membaca isi bucket privat.
    const { data: profile, error: profileError } = await admin.from('users').select('status').eq('auth_id', authData.user.id).maybeSingle()
    if (profileError) throw profileError
    if (profile?.status !== 'Aktif') return res.status(403).json({ error: 'Akun belum aktif.' })

    const { data: file, error: storageError } = await admin.storage.from(bibleVersions[translation].bucket).download(`${book}/${chapter}.json`)
    if (storageError || !file) return res.status(503).json({ error: 'Bacaan belum tersedia.' })
    const verses = JSON.parse(await file.text())
    if (!Array.isArray(verses)) throw new Error('Invalid Bible chapter')

    res.setHeader('Cache-Control', 'private, no-store')
    return res.status(200).json({ verses: cleanBibleVerses(verses) })
  } catch (error) {
    console.error('[bible-chapter]', error)
    return res.status(500).json({ error: 'Gagal memuat bacaan.' })
  }
}
