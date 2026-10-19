import { supabase } from '@/lib/supabase'

export const bibleExplanationService = {
  async get(bookId, chapterNumber) {
    const { data, error } = await supabase.from('bible_explanations')
      .select('book_id, chapter_number, introduction, explanation, reflection, updated_at')
      .eq('book_id', bookId).eq('chapter_number', chapterNumber).maybeSingle()
    if (error) throw error
    return data ? { ...data, outline: data.introduction } : null
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
    return { ...data, outline: data.introduction }
  },
}
