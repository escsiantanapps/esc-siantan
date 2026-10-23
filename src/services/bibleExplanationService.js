import { supabase } from '@/lib/supabase'

const SOURCE_LABEL = 'Sumber: NDC Ministry (ndcministry.org)'

function cleanExplanation(data) {
  if (!data) return null
  // Impor lama dapat menaruh atribusi di kolom atau posisi berbeda; tampilan tetap bersih sebelum data diperbaiki.
  const cleanText = value => (value || '').replaceAll(SOURCE_LABEL, '').trimEnd()
  const introduction = cleanText(data.introduction)
  return {
    ...data,
    introduction,
    explanation: cleanText(data.explanation),
    reflection: cleanText(data.reflection),
    outline: introduction,
  }
}

export const bibleExplanationService = {
  async get(bookId, chapterNumber) {
    const { data, error } = await supabase.from('bible_explanations')
      .select('book_id, chapter_number, introduction, explanation, reflection, updated_at')
      .eq('book_id', bookId).eq('chapter_number', chapterNumber).maybeSingle()
    if (error) throw error
    return cleanExplanation(data)
  },

  async save({ bookId, chapterNumber, outline, explanation, reflection }) {
    const { data, error } = await supabase.from('bible_explanations').upsert({
      book_id: bookId,
      chapter_number: chapterNumber,
      introduction: outline.trim(),
      explanation: explanation.trim(),
      reflection: reflection.trim(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'book_id,chapter_number' })
      .select('book_id, chapter_number, introduction, explanation, reflection, updated_at').single()
    if (error) throw error
    return cleanExplanation(data)
  },
}
