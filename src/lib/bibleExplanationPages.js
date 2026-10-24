const MAX_BLOCK_LENGTH = 1400
const MAX_PAGE_LENGTH = 2200
const MAX_BLOCKS_PER_PAGE = 4

function splitLongText(value) {
  const parts = []
  let remaining = value.trim()
  while (remaining.length > MAX_BLOCK_LENGTH) {
    const sentenceBreak = Math.max(
      remaining.lastIndexOf('. ', MAX_BLOCK_LENGTH),
      remaining.lastIndexOf('? ', MAX_BLOCK_LENGTH),
      remaining.lastIndexOf('! ', MAX_BLOCK_LENGTH),
      remaining.lastIndexOf('\n', MAX_BLOCK_LENGTH),
    )
    const wordBreak = remaining.lastIndexOf(' ', MAX_BLOCK_LENGTH)
    const breakAt = sentenceBreak >= MAX_BLOCK_LENGTH / 2 ? sentenceBreak + 1
      : wordBreak >= MAX_BLOCK_LENGTH / 2 ? wordBreak
        : remaining.indexOf(' ', MAX_BLOCK_LENGTH)
    if (breakAt < 0) break
    parts.push(remaining.slice(0, breakAt).trim())
    remaining = remaining.slice(breakAt).trimStart()
  }
  if (remaining) parts.push(remaining)
  return parts
}

function splitUnstructuredVerseSections(value) {
  const text = value.trim()
  if (!text) return []
  function markerFromMatch(match) {
    const start = Number(match[2])
    const end = Number(match[3] || match[2])
    const next = text.slice(match.index + match[0].length)
    if (start <= 3 && /^(?:Samuel|Raja-Raja|Tawarikh|Korintus|Tesalonika|Timotius|Petrus|Yohanes)\b/iu.test(next)) return null
    if (/^(?:Masehi\b|\([a-z])/u.test(next)) return null
    if (start < 1 || end < start || end > 176) return null
    return { start, end, reference: match[3] ? `${start}–${end}` : `${start}`, offset: match.index + match[1].length, bodyOffset: match.index + match[0].length }
  }

  const strongPattern = /(^|[.!?)]["”]?\s+|\n+|\d+:\d+(?:[-–]\d+)?\s+)(\d{1,3})(?:[-–](\d{1,3}))?\s+(?=[A-ZÀ-Ý"“â(.])/gu
  const strong = [...text.matchAll(strongPattern)].map(markerFromMatch).filter(Boolean)
  const weakPattern = /(^|\s)(\d{1,3})(?:[-–](\d{1,3}))?\s+(?=[A-ZÀ-Ý"“â(.])/gu
  const weak = [...text.matchAll(weakPattern)].map(markerFromMatch).filter(Boolean).filter(marker => {
    if (strong.some(item => item.offset === marker.offset)) return false
    if (/\d+,\s*$/u.test(text.slice(0, marker.offset))) return false
    const previous = strong.findLast(item => item.offset < marker.offset)
    const next = strong.find(item => item.offset > marker.offset)
    // Dalam uraian tanpa tanda baca, nomor ayat tetap harus berada di antara
    // dua acuan yang sudah jelas; ini membatasi angka biasa dalam prosa.
    if (previous && marker.start < previous.start) return false
    if (next && marker.start > next.start) return false
    if (!next && previous && marker.start > previous.end + 10) return false
    return true
  })
  const markers = [...strong, ...weak].sort((a, b) => a.offset - b.offset).filter((marker, index, all) =>
    index === 0 || marker.start >= all[index - 1].start)
  if (!markers.length) return [{ text }]

  const sections = []
  const preamble = text.slice(0, markers[0].offset).trim()
  if (preamble) sections.push({ text: preamble })
  markers.forEach((marker, index) => {
    const body = text.slice(marker.bodyOffset, markers[index + 1]?.offset ?? text.length).trim()
    if (body) sections.push({ reference: marker.reference, start: marker.start, end: marker.end, text: body })
  })
  return sections
}

export function splitVerseSections(value) {
  const text = value.trim()
  if (!text) return []
  if (!/\n\s*\n/u.test(text)) return splitUnstructuredVerseSections(text)
  return text.split(/\n\s*\n/u).flatMap(paragraph => {
    const match = paragraph.match(/^(\d{1,3})(?:[-–](\d{1,3}))?\s+/u)
    if (!match) return [{ text: paragraph }]
    const start = Number(match[1])
    const end = Number(match[2] || match[1])
    if (start < 1 || end < start || end > 176) return [{ text: paragraph }]
    return [{ reference: match[2] ? `${start}–${end}` : `${start}`, start, end, text: paragraph.slice(match[0].length) }]
  })
}

export function paginateExplanation(explanation) {
  if (!explanation) return []
  const blocks = []
  for (const section of ['outline', 'explanation', 'reflection']) {
    const value = explanation[section]?.trim()
    if (!value) continue
    const entries = section === 'explanation'
      ? splitVerseSections(value)
      : value.split(/\n\s*\n/u).map(text => ({ text }))
    for (const entry of entries) {
      for (const text of splitLongText(entry.text)) blocks.push({ ...entry, section, text })
    }
  }

  const pages = []
  let current = []
  let length = 0
  for (const block of blocks) {
    if (current.length && (length + block.text.length > MAX_PAGE_LENGTH || current.length >= MAX_BLOCKS_PER_PAGE)) {
      pages.push(current)
      current = []
      length = 0
    }
    current.push(block)
    length += block.text.length
  }
  if (current.length) pages.push(current)
  return pages
}
