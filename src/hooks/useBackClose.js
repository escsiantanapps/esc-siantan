import { useEffect, useRef } from 'react'

// Tutup overlay (modal, sheet, drawer, dropdown) saat tombol back ditekan
// — meniru perilaku native Android — alih-alih berpindah/keluar halaman.
//
// Pakai: useBackClose(isOpen, closeFn)
//   isOpen  : boolean, true saat overlay terbuka
//   closeFn : fungsi untuk menutup overlay (mis. () => setOpen(false))
//
// Cara kerja: saat overlay terbuka, sisipkan satu entri history sebagai
// "perangkap". Tombol back memicu popstate → memanggil closeFn. Bila overlay
// ditutup lewat cara lain (klik X / backdrop), entri history tadi dibuang
// agar tombol back berikutnya tetap normal.
export function useBackClose(isOpen, closeFn) {
  const closeRef = useRef(closeFn)
  closeRef.current = closeFn

  useEffect(() => {
    if (!isOpen) return
    window.history.pushState({ overlayGuard: true }, '')
    const onPop = () => closeRef.current?.()
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Ditutup BUKAN lewat tombol back → buang entri history yang tadi disisipkan.
      if (window.history.state?.overlayGuard) window.history.back()
    }
  }, [isOpen])
}
