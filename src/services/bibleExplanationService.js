import { supabase } from '@/lib/supabase'

export const bibleExplanationService = {
  async get(bookId, chapterNumber) {
    const { data, error } = await supabase.from('bible_explanations')
      .select('book_id, chapter_number, introduction, reflection, updated_at')
      .eq('book_id', bookId).eq('chapter_number', chapterNumber).maybeSingle()
    if (error) throw error
    return data
  },

  async save({ bookId, chapterNumber, introduction, reflection }) {
    const { data, error } = await supabase.from('bible_explanations').upsert({
      book_id: bookId,
      chapter_number: chapterNumber,
      introduction: introduction.trim(),
      reflection: reflection.trim(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'book_id,chapter_number' })
      .select('book_id, chapter_number, introduction, reflection, updated_at').single()
    if (error) throw error
    return data
  },
}
