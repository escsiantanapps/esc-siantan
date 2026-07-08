import { supabase } from '@/lib/supabase'

// Ratakan relasi user_ministries jadi array ministry_ids di objek user
// (agar UI yang sudah ada tetap membaca .ministry_ids tanpa perubahan).
function withMinistryIds(u) {
  if (!u) return u
  return { ...u, ministry_ids: (u.user_ministries || []).map(r => r.ministry_id) }
}

export const usersService = {
  // Realtime: panggil `cb` setiap ada perubahan pada tabel users (INSERT/UPDATE/
  // DELETE) — dipakai panel Admin agar pendaftar baru langsung muncul tanpa
  // refresh. Mengembalikan fungsi unsubscribe. Butuh tabel users masuk publikasi
  // realtime (Migrasi v47) & RLS: hanya baris yang boleh dibaca subscriber yang
  // terkirim (Admin bisa baca semua).
  subscribeChanges(cb) {
    const ch = supabase
      .channel('admin-users-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, cb)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  },

  async getAll({ search = '', role = '', status = '', ministry = '', komsel = '', duplicatesOnly = false, page = 1, limit = 20, sort = 'name' } = {}) {
    let query = supabase.from('users').select('*, user_ministries(ministry_id)', { count: 'exact' })
    if (search) query = query.ilike('name', `%${search}%`)
    if (role) query = query.eq('role', role)
    if (status) query = query.eq('status', status)
    if (komsel) query = query.eq('komsel_id', komsel)
    if (ministry) {
      const { data: rows } = await supabase.from('user_ministries').select('user_id').eq('ministry_id', ministry)
      const ids = (rows || []).map(r => r.user_id)
      query = query.in('user_id', ids.length ? ids : ['__none__'])
    }
    if (duplicatesOnly) {
      const ids = await this.getDuplicateUserIds()
      query = query.in('user_id', ids.length ? ids : ['__none__'])
    }
    const from = (page - 1) * limit
    query = query.range(from, from + limit - 1)
    // Saat mode duplikat aktif, urutkan berdasarkan nama supaya baris yang
    // sama-nama otomatis bergerombol dan mudah dibandingkan.
    query = sort === 'points' ? query.order('points', { ascending: false }).order('name') : query.order('name')
    const { data, error, count } = await query
    if (error) throw error
    return { data: (data || []).map(withMinistryIds), count }
  },

  // Kumpulkan user_id yang namanya (setelah trim + lowercase) muncul >1x di
  // seluruh tabel users. Dipakai halaman /admin/jemaat untuk toggle "Duplikat
  // saja" agar admin bisa mendeteksi & membereskan double-entry (mis. hasil
  // migrasi lama + registrasi baru dengan nama yang sama).
  async getDuplicateUserIds() {
    const { data, error } = await supabase.from('users').select('user_id, name')
    if (error) throw error
    const groups = {}
    for (const r of data || []) {
      const key = String(r.name || '').trim().toLowerCase()
      if (!key) continue
      ;(groups[key] ||= []).push(r.user_id)
    }
    const dup = []
    for (const ids of Object.values(groups)) if (ids.length > 1) dup.push(...ids)
    return dup
  },

  // Hitung frekuensi nama di seluruh users — dipakai UI utk menandai baris
  // duplikat (badge) walau toggle "Duplikat saja" tidak aktif.
  async getNameFrequencyMap() {
    const { data, error } = await supabase.from('users').select('name')
    if (error) throw error
    const counts = {}
    for (const r of data || []) {
      const key = String(r.name || '').trim().toLowerCase()
      if (!key) continue
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  },

  // Admin menambah jemaat baru langsung (tanpa akun login dulu) — jemaat
  // mengaktifkan sendiri akunnya nanti lewat halaman Aktivasi (HP + OTP WA),
  // pola yang sama dipakai utk data impor lama.
  async create(form) {
    const phone = (form.phone || '').trim()
    if (phone) {
      try {
        const r = await fetch('/api/check-phone', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        })
        const j = await r.json().catch(() => ({}))
        if (r.ok && j.available === false) throw new Error('PHONE_TAKEN')
      } catch (e) {
        if (e.message === 'PHONE_TAKEN') throw e
        // error jaringan endpoint → abaikan, lanjutkan penyimpanan
      }
    }

    const orNull = v => (v === '' || v === undefined ? null : v)
    const payload = {
      auth_id: null,
      name: form.name,
      phone: orNull(phone),
      email: orNull(form.email),
      role: form.role || 'Jemaat',
      status: 'Aktif',
      sp_level: 'Aman',
      gender: orNull(form.gender),
      birth_date: orNull(form.birth_date),
      birth_place: orNull(form.birth_place),
      address: orNull(form.address),
      blood_type: orNull(form.blood_type),
      nik: orNull(form.nik),
      social_media: orNull(form.social_media),
      komsel_id: orNull(form.komsel_id),
    }
    const { data, error } = await supabase.from('users').insert(payload).select().single()
    if (error) throw error
    return data
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('users').select('*, user_ministries(ministry_id)').eq('user_id', id).single()
    if (error) throw error
    return withMinistryIds(data)
  },

  // Lookup via NIJ (Nomor Identitas Jemaat) — dipakai saat scan QR kartu
  // personal jemaat (ESC-MEMBER:<nij>). RLS membatasi siapa yang boleh baca
  // baris user lain (Admin/Super Admin/PKS yang memimpin komsel bersangkutan).
  async getByNij(nij) {
    const { data, error } = await supabase.from('users')
      .select('user_id, name, photo_url, status, points, komsel_id, nij, membership_card_issued_at')
      .eq('nij', nij).maybeSingle()
    if (error) throw error
    return data
  },

  async update(id, updates) {
    // ministry_ids bukan kolom lagi — kelola lewat tabel relasi.
    const { ministry_ids, user_ministries, ...scalar } = updates
    const { data, error } = await supabase
      .from('users').update(scalar).eq('user_id', id).select('*, user_ministries(ministry_id)').single()
    if (error) throw error
    if (ministry_ids !== undefined) await this.setUserMinistries(id, ministry_ids)
    return {
      ...data,
      ministry_ids: ministry_ids !== undefined ? ministry_ids : (data.user_ministries || []).map(r => r.ministry_id),
    }
  },

  // Selaraskan ministry seorang user dengan daftar id yang diinginkan.
  async setUserMinistries(userId, ids = []) {
    const { data: existing } = await supabase
      .from('user_ministries').select('ministry_id').eq('user_id', userId)
    const have = new Set((existing || []).map(r => r.ministry_id))
    const want = new Set(ids)
    const toAdd = ids.filter(x => !have.has(x))
    const toRemove = [...have].filter(x => !want.has(x))
    if (toRemove.length) {
      await supabase.from('user_ministries').delete().eq('user_id', userId).in('ministry_id', toRemove)
    }
    if (toAdd.length) {
      await supabase.from('user_ministries').insert(toAdd.map(ministry_id => ({ user_id: userId, ministry_id })))
    }
  },

  // Hapus akun permanen (auth + profil) via serverless function dengan service
  // role. Hanya Admin/Super Admin yang diizinkan (diverifikasi di server).
  async deleteAccount(userId) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) throw new Error('Sesi tidak ditemukan.')
    const res = await fetch('/api/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      throw new Error(e.error || 'Gagal menghapus akun.')
    }
    return res.json()
  },

  async uploadAvatar(userId, file) {
    const ext = file.name.split('.').pop()
    const path = `avatars/${userId}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('profile-photos').upload(path, file, { upsert: true })
    if (uploadError) throw uploadError
    const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
    return data.publicUrl
  },

  async getMinistries(ids = []) {
    if (!ids || ids.length === 0) return []
    const { data, error } = await supabase.from('ministries').select('*').in('ministry_id', ids)
    if (error) throw error
    return data
  },

  async getKomsel(id) {
    if (!id) return null
    const { data, error } = await supabase.from('komsel').select('*').eq('komsel_id', id).maybeSingle()
    if (error) throw error
    return data
  },

  async getAllMinistries() {
    const { data, error } = await supabase.from('ministries').select('*').order('name')
    if (error) throw error
    return data
  },

  async getAllKomsel() {
    const { data, error } = await supabase.from('komsel').select('*').order('name')
    if (error) throw error
    return data
  },

  async getWithSP(level = '') {
    let query = supabase.from('users').select('*')
    query = level ? query.eq('sp_level', level) : query.neq('sp_level', 'Aman')
    const { data, error } = await query.order('name')
    if (error) throw error
    return data
  },

  // Heartbeat kehadiran online: perbarui last_seen_at milik sendiri.
  // Dipanggil berkala dari UserLayout — gagal diam-diam (bukan fitur kritis).
  async heartbeat(userId) {
    await supabase.from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('user_id', userId)
  },
}
