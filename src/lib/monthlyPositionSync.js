// Pratinjau memakai bentuk katalog yang sama dengan RPC agar perubahan serentak ditolak.
export function buildDraftPositionSync(schedule, positions) {
  const byMinistry = new Map()
  for (const position of positions || []) {
    if (!position.is_active) continue
    const rows = byMinistry.get(position.ministry_id) || []
    rows.push(position)
    byMinistry.set(position.ministry_id, rows)
  }
  const catalog = {}
  for (const [ministryId, rows] of byMinistry) {
    catalog[ministryId] = Object.fromEntries(rows.map(row => [row.position_id, {
      name: row.name, capacity: row.default_slots, sort_order: row.sort_order,
    }]))
  }
  const changes = []
  for (const section of schedule?.sections || []) {
    const occurrenceIds = new Set((schedule.occurrences || [])
      .filter(item => item.section_id === section.section_id).map(item => item.occurrence_id))
    for (const part of section.parts || []) {
      const oldPositions = part.positions || []
      const newPositions = (byMinistry.get(part.ministry_id) || []).sort((a, b) =>
        a.sort_order - b.sort_order || a.name.localeCompare(b.name) || a.position_id.localeCompare(b.position_id))
      const oldMap = new Map(oldPositions.map(item => [item.position_id, item]))
      const newMap = new Map(newPositions.map(item => [item.position_id, item]))
      const changed = oldPositions.length !== newPositions.length || oldPositions.some(item => {
        const next = newMap.get(item.position_id)
        return !next || item.name !== next.name || Number(item.capacity) !== Number(next.default_slots)
          || Number(item.sort_order) !== Number(next.sort_order)
      })
      if (!changed) continue
      const rosterIds = new Set((schedule.parts || [])
        .filter(item => item.ministry_id === part.ministry_id && occurrenceIds.has(item.occurrence_id))
        .map(item => item.roster_id))
      const affected = (schedule.rosters || []).filter(item => rosterIds.has(item.roster_id))
        .flatMap(roster => (roster.service_roster_slots || []).filter(slot => slot.user_id
          && (!newMap.has(slot.position_id)
            || Number(slot.slot_no) > Number(newMap.get(slot.position_id).default_slots)))
          .map(slot => ({ slotId: slot.slot_id, rosterId: roster.roster_id,
            userId: slot.user_id, userName: slot.users?.name || '-',
            serviceDate: roster.service_date, oldPositionName: oldMap.get(slot.position_id)?.name || '-',
            ministryId: part.ministry_id, sectionId: section.section_id })))
      changes.push({ sectionId: section.section_id, sectionTitle: section.title,
        ministryId: part.ministry_id, ministryName: part.ministry_name,
        before: oldPositions.map(item => `${item.name} (${item.capacity})`),
        after: newPositions.map(item => `${item.name} (${item.default_slots})`),
        blockedCount: affected.length, affected,
        removedNames: oldPositions.filter(item => !newMap.has(item.position_id)).map(item => item.name),
        addedNames: newPositions.filter(item => !oldMap.has(item.position_id)).map(item => item.name),
      })
    }
  }
  return { catalog, changes, blockedCount: changes.reduce((sum, item) => sum + item.blockedCount, 0),
    missingJobsCount: changes.filter(item => item.after.length === 0).length }
}
