// Preset background halaman Login + helper untuk mengubah setting menjadi
// style CSS. Setting disimpan di tabel app_settings sebagai:
//   { type: 'preset', value: '<presetId>' }  atau  { type: 'image', value: '<url>' }

export const LOGIN_BG_PRESETS = [
  { id: 'hills',   label: 'Bukit Hijau', css: 'linear-gradient(160deg,#86c06b 0%,#3f7e57 45%,#274d6b 100%)' },
  { id: 'sunrise', label: 'Senja',       css: 'linear-gradient(160deg,#f6d365 0%,#fda085 100%)' },
  { id: 'ocean',   label: 'Samudra',     css: 'linear-gradient(160deg,#2193b0 0%,#6dd5ed 100%)' },
  { id: 'night',   label: 'Malam',       css: 'linear-gradient(160deg,#0f2027 0%,#203a43 55%,#2c5364 100%)' },
  { id: 'brand',   label: 'Brand',       css: 'linear-gradient(160deg,#00BFFF 0%,#0077B6 100%)' },
  { id: 'rose',    label: 'Mawar',       css: 'linear-gradient(160deg,#ee9ca7 0%,#a18cd1 100%)' },
]

export const DEFAULT_LOGIN_BG = { type: 'preset', value: 'hills' }

// Ubah setting menjadi nilai untuk CSS `background`.
export function resolveLoginBg(setting) {
  const s = setting || DEFAULT_LOGIN_BG
  if (s.type === 'image' && s.value) {
    return { backgroundImage: `url("${s.value}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  const preset = LOGIN_BG_PRESETS.find(p => p.id === s.value) || LOGIN_BG_PRESETS[0]
  return { background: preset.css }
}
