import { Sun, Moon, ArrowLeft } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { useLang } from '@/hooks/useLang'

// ─── Button ──────────────────────────────────────────────
export function Button({ children, variant = 'primary', size = 'md', loading, className = '', ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm', lg: 'px-6 py-3 text-base' }
  const variants = {
    primary: 'gradient-main text-white shadow-sm',
    secondary: 'bg-control text-gray-700 hover:bg-control-hover',
    outline: 'border border-gray-200 text-gray-700 hover:bg-control',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    ghost: 'text-gray-600 hover:bg-control',
  }
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} disabled={loading} {...props}>
      {loading && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  )
}

// ─── Input ───────────────────────────────────────────────
export function Input({ label, error, required, icon: Icon, rightElement, className = '', ...props }) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm text-gray-600 font-medium">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        {Icon && <Icon size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />}
        <input
          className={`w-full py-2.5 text-sm bg-gray-50 border rounded-xl transition
            ${Icon ? 'pl-10' : 'pl-3'} ${rightElement ? 'pr-10' : 'pr-3'}
            ${error ? 'border-red-400' : 'border-gray-200'} ${className}`}
          {...props}
        />
        {rightElement}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ─── Textarea ────────────────────────────────────────────
export function Textarea({ label, error, required, rows = 3, className = '', ...props }) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm text-gray-600 font-medium">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <textarea
        rows={rows}
        className={`w-full px-3 py-2.5 text-sm bg-gray-50 border rounded-xl resize-none transition
          ${error ? 'border-red-400' : 'border-gray-200'} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ─── Select ──────────────────────────────────────────────
// Ikon chevron kustom menggantikan panah bawaan browser yang tidak konsisten.
const SELECT_CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")"

export function Select({ label, error, required, children, className = '', style, ...props }) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm text-gray-600 font-medium">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <select
        className={`appearance-none w-full pl-3 pr-10 py-2.5 text-sm bg-gray-50 border rounded-xl transition cursor-pointer
          ${error ? 'border-red-400' : 'border-gray-200'} ${className}`}
        style={{ backgroundImage: SELECT_CHEVRON, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.7rem center', backgroundSize: '1.1em', ...style }}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ─── Checkbox ────────────────────────────────────────────
export function Checkbox({ label, className = '', ...props }) {
  return (
    <label className={`flex items-center gap-2.5 cursor-pointer ${className}`}>
      <input
        type="checkbox"
        className="w-4.5 h-4.5 rounded-md border-gray-300 text-brand-500"
        {...props}
      />
      {label && <span className="text-sm text-gray-700">{label}</span>}
    </label>
  )
}

// ─── Card ────────────────────────────────────────────────
export function Card({ children, className = '', onClick, glass = false, ...props }) {
  const surface = glass ? 'glass-card' : 'bg-surface border border-gray-100'
  return (
    <div
      className={`${surface} rounded-2xl ambient-shadow transition-colors duration-300 ${onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : ''} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  )
}

// ─── Badge / Pill ────────────────────────────────────────
export function Badge({ children, color = 'gray', className = '' }) {
  const colors = {
    gray:   'bg-control text-gray-700',
    orange: 'bg-brand-100 text-brand-700',
    red:    'bg-red-100 text-red-700',
    green:  'bg-green-100 text-green-700',
    blue:   'bg-blue-100 text-blue-700',
    amber:  'bg-amber-100 text-amber-700',
    purple: 'bg-purple-100 text-purple-700',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[color]} ${className}`}>
      {children}
    </span>
  )
}

// ─── Avatar ──────────────────────────────────────────────
export function Avatar({ name, src, size = 'md' }) {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-base', xl: 'w-20 h-20 text-xl' }
  const initials = name ? name.trim().split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() : '?'
  if (src) return <img src={src} alt={name} className={`${sizes[size]} rounded-full object-cover flex-shrink-0`} />
  return (
    <div className={`${sizes[size]} rounded-full gradient-main flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {initials}
    </div>
  )
}

// ─── Page Header ─────────────────────────────────────────
export function PageHeader({ title, subtitle, action, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-3 pt-2 mb-5 ${className}`}>
      <div>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ─── Status Badge ────────────────────────────────────────
export function StatusBadge({ status }) {
  const { t } = useLang()
  const colors = {
    'Menunggu': 'orange', 'Sedang Ditinjau': 'amber', 'Disetujui': 'green',
    'Terjadwal': 'blue', 'Selesai': 'gray', 'Ditolak': 'red', 'Aktif': 'green',
    'Nonaktif': 'red', 'Menunggu Persetujuan': 'orange', 'Aman': 'green',
    'SP 1': 'orange', 'SP 2': 'red', 'SP 3': 'red', 'Hadir': 'green',
    'Tidak Hadir': 'red', 'Izin': 'amber', 'Terverifikasi': 'green',
    'TERPENUHI': 'green', 'PROSES': 'amber', 'KOSONG': 'red', 'IZIN': 'blue',
  }
  const color = colors[status] || 'gray'
  const key = `status.${status}`
  const translated = t(key)
  return <Badge color={color}>{translated === key ? status : translated}</Badge>
}

// ─── Empty State ─────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      {Icon && <div className="w-14 h-14 rounded-2xl bg-control flex items-center justify-center mb-4"><Icon size={26} className="text-gray-400" /></div>}
      <p className="text-sm font-semibold text-gray-700 mb-1">{title}</p>
      {description && <p className="text-xs text-gray-400 mb-4 max-w-xs">{description}</p>}
      {action}
    </div>
  )
}

// ─── Loading Spinner ─────────────────────────────────────
export function Spinner({ size = 'md' }) {
  const s = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }
  return <div className={`${s[size]} border-2 border-brand-500 border-t-transparent rounded-full animate-spin`} />
}

// ─── GradientHeader ──────────────────────────────────────
export function GradientHeader({ title, subtitle, back, children, wave = true }) {
  return (
    <div className={`gradient-main relative overflow-hidden px-4 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] ${wave ? 'pb-9' : 'pb-4'}`}>
      {/* Glow dekoratif ala Stitch */}
      <div className="pointer-events-none absolute -top-16 -right-12 w-52 h-52 rounded-full bg-white/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-black/10 blur-2xl" />

      <div className="relative z-10">
        {back && (
          <button
            onClick={back}
            aria-label="Kembali"
            className="w-9 h-9 -ml-1.5 mt-2 mb-3 rounded-full bg-white/15 text-white flex items-center justify-center transition-colors hover:bg-white/25 active:scale-90"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <h1 className="font-display text-white text-lg font-semibold [text-shadow:0_1px_3px_rgba(0,0,0,0.25)]">{title}</h1>
        {subtitle && <p className="text-white/85 text-sm mt-1 [text-shadow:0_1px_2px_rgba(0,0,0,0.25)]">{subtitle}</p>}
        {children}
      </div>

      {/* Wave divider ala Stitch — menyatu dengan latar konten (gray-50) */}
      {wave && (
        <div className="absolute bottom-0 left-0 w-full leading-none translate-y-px text-gray-50">
          <svg className="block w-full h-5" viewBox="0 0 1200 120" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V120H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z" fill="currentColor" />
          </svg>
        </div>
      )}
    </div>
  )
}

// ─── Theme Toggle ────────────────────────────────────────
export function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme()
  return (
    <button
      onClick={toggleTheme}
      aria-label="Ganti tema"
      title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 ${className || 'bg-control text-gray-600 hover:bg-control-hover'}`}
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
