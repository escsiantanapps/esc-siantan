import { Component } from 'react'
import { translations } from '@/lib/i18n'
import { AlertTriangle, RefreshCw } from 'lucide-react'

// Deteksi error gagal memuat chunk lazy (umum terjadi setelah deploy baru:
// hash file berubah, chunk lama jadi 404). Untuk kasus ini, reload sekali
// biasanya menyelesaikan masalah.
function isChunkError(error) {
  const msg = error?.message || ''
  return (
    /Loading chunk/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  )
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error) {
    // Auto-reload sekali bila chunk gagal dimuat (cegah layar putih pasca-deploy)
    if (isChunkError(error) && !sessionStorage.getItem('esc-chunk-reloaded')) {
      sessionStorage.setItem('esc-chunk-reloaded', '1')
      window.location.reload()
    }
  }

  handleReload = () => {
    sessionStorage.removeItem('esc-chunk-reloaded')
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const chunk = isChunkError(this.state.error)
    // Boundary berada di luar provider; gunakan bahasa dokumen yang sudah disetel.
    const copy = translations[document.documentElement.lang === 'en' ? 'en' : 'id']
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={28} className="text-blue-500" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">
            {copy[chunk ? 'error.newVersion' : 'error.title']}
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            {copy[chunk ? 'error.updateMessage' : 'error.message']}
          </p>
          <button
            onClick={this.handleReload}
            className="mt-6 inline-flex items-center justify-center gap-2 w-full gradient-main text-white text-sm font-medium rounded-xl py-3 active:scale-[0.98] transition-transform"
          >
            <RefreshCw size={16} /> {copy['error.reload']}
          </button>
        </div>
      </div>
    )
  }
}
