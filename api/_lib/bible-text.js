// Berkas TB privat tetap utuh; hanya pemisah ganda yang disembunyikan dari pembaca.
export function cleanBibleVerses(verses) {
  return verses.map(verse => verse.text.includes('--') ? {
    ...verse,
    text: verse.text.replace(/ *-- */g, ' ').trim(),
  } : verse)
}
