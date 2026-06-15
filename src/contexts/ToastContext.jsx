import { createContext, useCallback, useRef, useState } from 'react'
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react'

export const ToastContext = createContext(null)

const TOAST_STYLES = {
  success: { icon: CheckCircle2, ring: 'text-green-500', bar: 'bg-green-500' },
  error:   { icon: XCircle,      ring: 'text-red-500',   bar: 'bg-red-500' },
  info:    { icon: Info,         ring: 'text-blue-500',  bar: 'bg-blue-500' },
}

let idCounter = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)
  const confirmResolve = useRef(null)

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = useCallback((type, message, duration = 3000) => {
    const id = ++idCounter
    setToasts(prev => [...prev, { id, type, message }])
    if (duration > 0) setTimeout(() => remove(id), duration)
    return id
  }, [remove])

  const toast = useRef({
    success: (msg, duration) => push('success', msg, duration),
    error:   (msg, duration) => push('error', msg, duration),
    info:    (msg, duration) => push('info', msg, duration),
  }).current

  // confirm() -> Promise<boolean>
  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      confirmResolve.current = resolve
      setConfirmState({
        title: opts.title || 'Konfirmasi',
        message: opts.message || 'Apakah Anda yakin?',
        confirmText: opts.confirmText || 'Ya',
        cancelText: opts.cancelText || 'Batal',
        danger: opts.danger ?? false,
      })
    })
  }, [])

  function closeConfirm(result) {
    setConfirmState(null)
    if (confirmResolve.current) {
      confirmResolve.current(result)
      confirmResolve.current = null
    }
  }

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toast container */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4 flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map(t => {
          const { icon: Icon, ring } = TOAST_STYLES[t.type] || TOAST_STYLES.info
          return (
            <div
              key={t.id}
              className="animate-toast-in pointer-events-auto w-full bg-surface border border-gray-100 rounded-xl shadow-lg shadow-black/10 px-4 py-3 flex items-center gap-3"
            >
              <Icon size={20} className={`shrink-0 ${ring}`} />
              <p className="flex-1 text-sm text-gray-800 font-medium">{t.message}</p>
              <button
                onClick={() => remove(t.id)}
                aria-label="Tutup"
                className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Confirm dialog */}
      {confirmState && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/40 animate-fade-in"
            onClick={() => closeConfirm(false)}
          />
          <div className="relative w-full max-w-sm bg-surface rounded-2xl shadow-2xl shadow-black/20 p-6 animate-toast-in">
            <div className="flex flex-col items-center text-center">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${confirmState.danger ? 'bg-red-50' : 'bg-brand-50'}`}>
                <AlertTriangle size={22} className={confirmState.danger ? 'text-red-500' : 'text-brand-500'} />
              </div>
              <h2 className="text-base font-semibold text-gray-900">{confirmState.title}</h2>
              <p className="text-sm text-gray-500 mt-1.5">{confirmState.message}</p>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => closeConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors active:scale-95"
              >
                {confirmState.cancelText}
              </button>
              <button
                onClick={() => closeConfirm(true)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-all active:scale-95 ${confirmState.danger ? 'bg-red-500 hover:bg-red-600' : 'gradient-main'}`}
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}
