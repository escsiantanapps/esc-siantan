// Penanda ini hanya diisi oleh sistem nonaktif otomatis (Migrasi v94).
// Akun Nonaktif manual tidak memiliki marker dan tidak boleh meminta aktif ulang.
export function isAutoDeactivated(profile) {
  return profile?.status === 'Nonaktif' && Boolean(profile?.inactivity_deactivated_at)
}

export function isReactivationPending(profile) {
  return profile?.status === 'Menunggu Persetujuan' && Boolean(profile?.reactivation_requested_at)
}
