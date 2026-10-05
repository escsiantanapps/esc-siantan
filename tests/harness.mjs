import { chromium } from 'playwright'
import { createServer } from 'vite'

export async function startHarness() {
  // Backend palsu ditentukan sebelum Vite memuat modul; tidak membaca .env production.
  const server = await createServer({
    envFile: false,
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://qa-local.supabase.co'),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('qa-local-only'),
    },
    server: { host: '127.0.0.1', port: 0, open: false },
    logLevel: 'error',
  })
  await server.listen()
  let browser
  try {
    const options = { headless: true }
    if (process.env.QA_BROWSER_PATH) options.executablePath = process.env.QA_BROWSER_PATH
    else if (process.platform === 'win32') options.channel = 'msedge'
    browser = await chromium.launch(options)
  } catch (error) {
    await server.close()
    throw error
  }
  const baseUrl = `http://127.0.0.1:${server.httpServer.address().port}`
  return { browser, baseUrl, close: async () => { await browser.close(); await server.close() } }
}

export async function fixture(harness, options = {}) {
  const state = {
    role: 'Super Admin', allowedPages: ['/admin/events'], permissionFailure: false,
    templateFailure: false, authenticated: true, authRestricted: false, lang: 'id', theme: 'light', event: null,
    pendingCounts: {}, ktjRegistrations: [],
    template: {
      form_id: 'QA-TASK', title: 'SOP simulasi', description: '', fields_json: [],
      allowed_roles: [], template_ministries: [], active_days: [], weekly_goal: 1,
    },
    ...options,
  }
  const uid = '00000000-0000-4000-8000-000000000001'
  const user = { id: uid, email: 'qa@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const token = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: uid, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.local-test-only'
  const session = { access_token: token, refresh_token: 'local-test-only', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user }
  const profile = { user_id: 'QA-USER', auth_id: uid, name: 'Pengguna QA', email: user.email, role: state.role, role_secondary: options.secondary || null, is_pks: state.role === 'PKS', status: 'Aktif', sp_level: 'Aman', user_ministries: [], ministry_ids: [], points: 0 }
  const context = await harness.browser.newContext({ viewport: options.viewport || { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' })
  await context.addInitScript(({ session, state }) => {
    if (state.authenticated) localStorage.setItem('sb-qa-local-auth-token', JSON.stringify(session))
    localStorage.setItem('esc-theme', state.theme)
    localStorage.setItem('esc-lang', state.lang)
    sessionStorage.setItem('esc-roadmap-checked', '1')
  }, { session, state })
  const requests = [], unexpected = [], errors = []
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    const reply = (body, status = 200) => route.fulfill({ status, headers: { 'content-type': 'application/json', 'content-range': '0-0/0' }, body: JSON.stringify(body) })
    if (url.origin === harness.baseUrl && !url.pathname.startsWith('/api/')) return route.continue()
    // Semua request nonlokal diintersep, termasuk font. Kredensial asli tidak pernah diperlukan.
    if (url.hostname === 'qa-local.supabase.co') {
      requests.push({ path: url.pathname, method: request.method(), search: url.search,
        body: ['POST', 'PATCH', 'PUT'].includes(request.method()) ? request.postDataJSON() : undefined })
      if (url.pathname === '/auth/v1/token') {
        if (state.authRestricted) return reply({ message: 'Service restricted: exceed_cached_egress_quota' }, 402)
        return reply({ error: 'invalid_grant', error_description: 'Simulasi sandi salah' }, 400)
      }
      if (url.pathname === '/auth/v1/user') return reply(user)
      const table = url.pathname.split('/').at(-1)
      const singular = (request.headers().accept || '').includes('vnd.pgrst.object')
      const rows = data => reply(singular ? data[0] ?? null : data)
      if (request.method() === 'HEAD') {
        let count = Number(state.pendingCounts?.[table]) || 0
        if (table === 'registration_prerequisites') {
          if (url.searchParams.get('class_id') === 'not.is.null') count = Number(state.pendingCounts?.pendingClasses) || 0
          if (url.searchParams.get('event_id') === 'not.is.null') count = Number(state.pendingCounts?.pendingEvents) || 0
        }
        return route.fulfill({
          status: 200,
          headers: {
            'content-type': 'application/json',
            'access-control-expose-headers': 'Content-Range',
            'content-range': count > 0 ? '0-' + String(count - 1) + '/' + String(count) : '*/0',
          },
          body: '',
        })
      }
      if (table === 'get_points_leaderboard_with_me') return reply(state.leaderboard || [])
      if (table === 'get_service_schedule_month') {
        const monthId = request.postDataJSON()?.p_month_id
        const schedule = state.monthlySchedules?.find(item => item.month.month_id === monthId)
        if (!schedule) return reply({ message: 'Simulasi bulan tidak ditemukan', code: '22023' }, 400)
        return reply(schedule)
      }
      if (table === 'delete_service_schedule_month_draft') {
        const { p_month_id: monthId, p_expected_assigned: expectedAssigned } = request.postDataJSON() || {}
        const schedule = state.monthlySchedules?.find(item => item.month.month_id === monthId)
        if (!schedule || schedule.month.status !== 'Draft') return reply({ message: 'Hanya Draft yang dapat dihapus', code: '22023' }, 400)
        const assigned = schedule.rosters.reduce((count, roster) => count + roster.service_roster_slots.filter(slot => slot.user_id).length, 0)
        if (expectedAssigned !== assigned) return reply({ message: 'schedule_stale', code: '40001' }, 400)
        state.monthlySchedules = state.monthlySchedules.filter(item => item.month.month_id !== monthId)
        return reply(assigned)
      }
      if (table === 'create_service_schedule_month_direct') {
        const payload = request.postDataJSON()
        const monthId = 'QA-DIRECT-MONTH'
        const entries = payload?.p_entries || []
        const catalog = state.servicePositions || []
        const groups = new Map()
        const occurrences = [], parts = [], rosters = []
        for (const [index, entry] of entries.entries()) {
          let section = groups.get(entry.section_id)
          if (!section) {
            section = { ...entry, parts: [], positions: [], participation: {} }
            groups.set(entry.section_id, section)
          }
          section.participation[entry.service_date] = entry.ministry_ids
          const occurrenceId = 'QA-DIRECT-OCC-' + index
          occurrences.push({ ...entry, occurrence_id: occurrenceId, month_id: monthId })
          for (const ministryId of entry.ministry_ids) {
            const positionRows = catalog.filter(item => item.is_active && item.ministry_id === ministryId)
            if (!section.parts.some(item => item.ministry_id === ministryId)) {
              section.parts.push({ ministry_id: ministryId, positions: positionRows.map(item => ({ position_id: item.position_id, capacity: item.default_slots || 1 })) })
              section.positions.push(...positionRows.map(item => ({ ...item, slots: item.default_slots || 1, ministry_name: state.ministries.find(row => row.ministry_id === ministryId)?.name })))
            }
            const rosterId = 'QA-DIRECT-ROSTER-' + index + '-' + ministryId
            parts.push({ part_id: 'QA-DIRECT-PART-' + index + '-' + ministryId, occurrence_id: occurrenceId, ministry_id: ministryId, roster_id: rosterId })
            rosters.push({ roster_id: rosterId, occurrence_id: occurrenceId, ministry_id: ministryId, status: 'Draft',
              title: entry.title, service_date: entry.service_date, start_time: entry.start_time, end_time: entry.end_time,
              service_roster_slots: positionRows.flatMap(position => Array.from({ length: position.default_slots || 1 }, (_, slotNo) => ({
                slot_id: 'QA-DIRECT-SLOT-' + index + '-' + ministryId + '-' + position.position_id + '-' + slotNo,
                position_id: position.position_id, ministry_id: ministryId, slot_no: slotNo + 1, user_id: null,
              }))) })
          }
        }
        state.monthlySchedules = [...(state.monthlySchedules || []), {
          month: { month_id: monthId, template_id: null, month_date: payload.p_month, status: 'Draft', name: 'Jadwal QA', definition: { sections: [...groups.values()] } },
          sections: [...groups.values()], occurrences, parts, rosters,
        }]
        return reply(monthId)
      }
      if (table === 'service_schedule_templates') return rows(state.monthlyTemplates || [])
      if (table === 'service_schedule_months') {
        const monthDate = url.searchParams.get('month_date')
        let data = (state.monthlySchedules || []).map(item => item.month)
        if (monthDate?.startsWith('eq.')) data = data.filter(row => row.month_date === monthDate.slice(3))
        return rows(data)
      }
      if (table === 'service_schedule_parts') {
        if (state.rosterMonthLinkDelayMs) await new Promise(resolve => setTimeout(resolve, state.rosterMonthLinkDelayMs))
        const rosterId = url.searchParams.get('roster_id')?.slice(3)
        const schedule = state.monthlySchedules?.find(item => item.parts.some(part => part.roster_id === rosterId))
        return rows(schedule ? [{ service_schedule_occurrences: {
          month_id: schedule.month.month_id,
          service_schedule_months: { month_date: schedule.month.month_date },
        } }] : [])
      }
      if (table === 'ministry_service_positions') return rows(state.servicePositions || [])
      if (table === 'auth_admin_can') return reply(state.role === 'Super Admin' || state.allowedPages?.includes('/admin/jadwal-pelayanan') || false)
      if (table === 'admin_user_permissions') {
        if (state.permissionFailure) return reply({ message: 'Simulasi gangguan izin' }, 503)
        return rows(state.allowedPages === null ? [] : [{ user_id: 'QA-ADMIN', allowed_pages: state.allowedPages }])
      }
      if (table === 'users') {
        if (url.searchParams.has('auth_id')) return rows([profile])
        if (url.searchParams.get('role') === 'eq.Admin') return rows([{ user_id: 'QA-ADMIN', name: 'Admin Uji', role: 'Admin', status: 'Aktif', photo_url: null }])
        if (request.method() === 'GET' && state.members) {
          let data = state.members
          const ids = url.searchParams.get('user_id')
          if (ids?.startsWith('in.(') && ids.endsWith(')')) {
            const allowed = new Set(ids.slice(4, -1).split(','))
            data = data.filter(member => allowed.has(member.user_id))
          }
          const status = url.searchParams.get('status')
          if (status?.startsWith('eq.')) data = data.filter(member => member.status === status.slice(3))
          const role = url.searchParams.get('role')
          if (role?.startsWith('eq.')) data = data.filter(member => member.role === role.slice(3))
          if (role?.startsWith('in.(') && role.endsWith(')')) {
            const allowed = new Set(role.slice(4, -1).split(',').map(value => value.replace(/^"|"$/g, '')))
            data = data.filter(member => allowed.has(member.role))
          }
          return rows(data)
        }
        return rows([])
      }
      if (table === 'user_ministries') {
        if (request.method() === 'POST') {
          const created = request.postDataJSON()
          state.ministryMembers = [...(state.ministryMembers || []), created]
          return rows([created])
        }
        let data = state.ministryMembers || []
        const ministryId = url.searchParams.get('ministry_id')
        if (ministryId?.startsWith('eq.')) data = data.filter(row => row.ministry_id === ministryId.slice(3))
        const status = url.searchParams.get('users.status')
        const name = url.searchParams.get('users.name')
        const needle = name?.startsWith('ilike.%') ? name.slice(7, -1).toLocaleLowerCase('id') : null
        data = data.map(row => ({
          ...row,
          users: row.users && (!status?.startsWith('eq.') || row.users.status === status.slice(3))
            && (needle === null || row.users.name.toLocaleLowerCase('id').includes(needle)) ? row.users : null,
        }))
        if (url.searchParams.get('select')?.includes('!inner(')) data = data.filter(row => row.users)
        const limit = Number(url.searchParams.get('limit'))
        if (limit > 0) data = data.slice(0, limit)
        return rows(data)
      }
      if (table === 'service_roster_slots') {
        if (state.rosterFailure) return reply({ message: 'Simulasi gagal memuat roster' }, 503)
        return rows(state.rosterSlots || [])
      }
      if (table === 'service_rosters') {
        if (state.rosterFailure) return reply({ message: 'Simulasi gagal memuat roster' }, 503)
        let data = state.rosters || []
        const rosterId = url.searchParams.get('roster_id')
        if (rosterId?.startsWith('eq.')) data = data.filter(row => row.roster_id === rosterId.slice(3))
        const ministryId = url.searchParams.get('ministry_id')
        if (ministryId?.startsWith('eq.')) data = data.filter(row => row.ministry_id === ministryId.slice(3))
        const status = url.searchParams.get('status')
        if (status?.startsWith('in.')) data = data.filter(row => status.slice(3).includes(row.status))
        for (const condition of url.searchParams.getAll('service_date')) {
          if (condition.startsWith('gte.')) data = data.filter(row => row.service_date >= condition.slice(4))
          if (condition.startsWith('lt.')) data = data.filter(row => row.service_date < condition.slice(3))
        }
        return rows(data)
      }
      if (table === 'ministry_schedule_assignments') {
        if (state.legacyScheduleFailure) return reply({ message: 'Simulasi gagal memuat jadwal lama' }, 503)
        return rows(state.legacyScheduleAssignments || [])
      }
      if (table === 'ktj_registrations') return rows(state.ktjRegistrations || [])
      if (table === 'ministries') {
        if (state.ministryHeadSourceMissing && request.method() === 'GET'
          && url.searchParams.get('select')?.includes('head:users!head_user_id')) {
          return reply({ code: 'PGRST200', message: 'Relasi kepala Ministry belum tersedia' }, 400)
        }
        return rows(state.ministries || [])
      }
      if (table === 'ministry_schedule_managers') return rows(state.managerGrants || [])
      if (table === 'form_templates') {
        if (state.templateFailure) return reply({ message: 'Simulasi gangguan SOP' }, 503)
        return rows([state.template])
      }
      if (table === 'events' && state.event) return rows([state.event])
      return rows([])
    }
    if (url.origin === harness.baseUrl && url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/check-phone') return reply(state.checkPhone || {})
      return reply({})
    }
    if (!['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) unexpected.push(url.hostname)
    return route.abort()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  page.on('pageerror', error => errors.push(error.message))
  return { page, state, requests, unexpected, errors, goto: path => page.goto(harness.baseUrl + path, { waitUntil: 'domcontentloaded', timeout: 30000 }), close: () => context.close() }
}
