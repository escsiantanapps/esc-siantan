// ─── Button ──────────────────────────────────────────────
export function Button({ children, variant = 'primary', size = 'md', loading, className = '', ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm', lg: 'px-6 py-3 text-base' }
  const variants = {
    primary: 'gradient-main text-white shadow-sm',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    outline: 'border border-gray-200 text-gray-700 hover:bg-gray-50',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    ghost: 'text-gray-600 hover:bg-gray-100',
  }
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} disabled={loading} {...props}>
      {loading && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  )
}

// ─── Input ───────────────────────────────────────────────
export function Input({ label, error, required, className = '', ...props }) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm text-gray-600 font-medium">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        className={`w-full px-3 py-2.5 text-sm bg-gray-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition
          ${error ? 'border-red-400' : 'border-gray-200'} ${className}`}
        {...props}
      />
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
        className={`w-full px-3 py-2.5 text-sm bg-gray-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent resize-none transition
          ${error ? 'border-red-400' : 'border-gray-200'} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ─── Select ──────────────────────────────────────────────
export function Select({ label, error, required, children, className = '', ...props }) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm text-gray-600 font-medium">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <select
        className={`w-full px-3 py-2.5 text-sm bg-gray-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition
          ${error ? 'border-red-400' : 'border-gray-200'} ${className}`}
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
        className="w-4.5 h-4.5 rounded-md border-gray-300 text-orange-500 focus:ring-orange-400"
        {...props}
      />
      {label && <span className="text-sm text-gray-700">{label}</span>}
    </label>
  )
}

// ─── Card ────────────────────────────────────────────────
export function Card({ children, className = '', onClick, ...props }) {
  return (
    <div
      className={`bg-white rounded-2xl border border-gray-100 ${onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : ''} ${className}`}
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
    gray:   'bg-gray-100 text-gray-700',
    orange: 'bg-orange-100 text-orange-700',
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
    <div className={`flex items-start justify-between gap-3 mb-5 ${className}`}>
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
  const map = {
    'Menunggu':       { color: 'orange', label: 'Menunggu' },
    'Sedang Ditinjau':{ color: 'amber',  label: 'Ditinjau' },
    'Disetujui':      { color: 'green',  label: 'Disetujui' },
    'Terjadwal':      { color: 'blue',   label: 'Terjadwal' },
    'Selesai':        { color: 'gray',   label: 'Selesai' },
    'Ditolak':        { color: 'red',    label: 'Ditolak' },
    'Aktif':          { color: 'green',  label: 'Aktif' },
    'Nonaktif':       { color: 'red',    label: 'Nonaktif' },
    'Aman':           { color: 'green',  label: 'Aman' },
    'SP 1':           { color: 'orange', label: 'SP 1' },
    'SP 2':           { color: 'red',    label: 'SP 2' },
    'SP 3':           { color: 'red',    label: 'SP 3' },
  }
  const { color, label } = map[status] || { color: 'gray', label: status }
  return <Badge color={color}>{label}</Badge>
}

// ─── Empty State ─────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      {Icon && <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><Icon size={26} className="text-gray-400" /></div>}
      <p className="text-sm font-semibold text-gray-700 mb-1">{title}</p>
      {description && <p className="text-xs text-gray-400 mb-4 max-w-xs">{description}</p>}
      {action}
    </div>
  )
}

// ─── Loading Spinner ─────────────────────────────────────
export function Spinner({ size = 'md' }) {
  const s = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }
  return <div className={`${s[size]} border-2 border-orange-500 border-t-transparent rounded-full animate-spin`} />
}

// ─── GradientHeader ──────────────────────────────────────
export function GradientHeader({ title, subtitle, back, children }) {
  return (
    <div className="gradient-main px-4 pt-safe pb-4">
      {back && (
        <button onClick={back} className="flex items-center gap-1 text-white/70 text-sm mb-3 mt-2">
          ← Kembali
        </button>
      )}
      <h1 className="text-white text-lg font-semibold">{title}</h1>
      {subtitle && <p className="text-white/70 text-sm mt-1">{subtitle}</p>}
      {children}
    </div>
  )
}
