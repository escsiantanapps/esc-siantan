import { LOGIN_BG_PRESETS } from './loginBackgrounds'

// Background form tugas memakai daftar gradien yang sama dengan halaman Login.
export const FORM_BG_PRESETS = LOGIN_BG_PRESETS

// Ubah (bg_type, bg_value) dari form_templates menjadi style CSS, atau null.
export function resolveFormBg(bgType, bgValue) {
  if (bgType === 'image' && bgValue) {
    return { backgroundImage: `url("${bgValue}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  if (bgType === 'preset' && bgValue) {
    const p = FORM_BG_PRESETS.find(x => x.id === bgValue)
    if (p) return { background: p.css }
  }
  return null
}
