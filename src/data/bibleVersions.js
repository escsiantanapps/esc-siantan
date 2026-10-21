// TSI dalam berkas yang diberikan memuat empat kitab PL dan seluruh kitab PB.
export const bibleVersions = {
  tb: { bucket: 'bible-tb', books: Array.from({ length: 66 }, (_, index) => index + 1) },
  tsi: { bucket: 'bible-tsi', books: [1, 8, 17, 32, ...Array.from({ length: 27 }, (_, index) => index + 40)] },
  bimk: { bucket: 'bible-bimk', books: Array.from({ length: 66 }, (_, index) => index + 1) },
}
