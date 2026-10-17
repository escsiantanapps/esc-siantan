// Berkas TB privat tetap utuh; hanya pemisah ganda yang disembunyikan dari pembaca.
export function cleanBibleVerses(verses) {
  return verses.map(verse => ({
    ...verse,
    text: verse.text.replaceAll('--', ' ').replace(/ {2,}/g, ' ').trim(),
  }))
}
