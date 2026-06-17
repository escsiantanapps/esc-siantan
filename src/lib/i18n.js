// Kamus terjemahan aplikasi. Default: Bahasa Indonesia ('id'); tambahan: English ('en').
// Pakai kunci datar bertitik. t(key) -> teks sesuai bahasa aktif (fallback ke 'id', lalu key).
export const LOCALES = {
  id: { label: 'Bahasa Indonesia', flag: '🇮🇩' },
  en: { label: 'English', flag: '🇬🇧' },
}

export const translations = {
  id: {
    // Navigasi bawah
    'nav.home': 'Beranda',
    'nav.info': 'Info',
    'nav.tasks': 'Tugas',
    'nav.profile': 'Profil',
    'nav.scan': 'Scan',

    // Salam (banner profil)
    'greeting.morning': 'Selamat pagi',
    'greeting.noon': 'Selamat siang',
    'greeting.afternoon': 'Selamat sore',
    'greeting.night': 'Selamat malam',

    // Halaman profil
    'profile.settings': 'Pengaturan',
    'profile.settingsDesc': 'Mode gelap, notifikasi, ubah kata sandi',
    'profile.editProfile': 'Edit Profil',
    'profile.logout': 'Keluar',

    // Halaman pengaturan
    'settings.title': 'Pengaturan',
    'settings.subtitle': 'Kelola akun & preferensi aplikasi',
    'settings.account': 'Akun',
    'settings.editProfile': 'Edit Profil',
    'settings.editProfileDesc': 'Ubah data diri, foto, dan kontak',
    'settings.changePassword': 'Ubah Kata Sandi',
    'settings.changePasswordDesc': 'Ganti kata sandi akun Anda',
    'settings.currentPassword': 'Kata Sandi Saat Ini',
    'settings.newPassword': 'Kata Sandi Baru',
    'settings.confirmNewPassword': 'Konfirmasi Kata Sandi Baru',
    'settings.savePassword': 'Simpan Kata Sandi',
    'settings.appearance': 'Tampilan',
    'settings.darkMode': 'Mode Gelap',
    'settings.on': 'Aktif',
    'settings.off': 'Nonaktif',
    'settings.notifications': 'Notifikasi',
    'settings.language': 'Bahasa',
    'settings.languageDesc': 'Pilih bahasa aplikasi',
    'settings.logout': 'Keluar',

    // Pesan
    'settings.pwMinLength': 'Kata sandi baru minimal 6 karakter.',
    'settings.pwMismatch': 'Konfirmasi kata sandi tidak cocok.',
    'settings.pwCurrentWrong': 'Kata sandi saat ini salah.',
    'settings.pwFailed': 'Gagal mengubah kata sandi.',
    'settings.pwSuccess': 'Kata sandi berhasil diubah.',
    'settings.logoutTitle': 'Keluar dari akun?',
    'settings.logoutMessage': 'Anda akan keluar dari aplikasi dan perlu masuk kembali.',
  },
  en: {
    'nav.home': 'Home',
    'nav.info': 'Info',
    'nav.tasks': 'Tasks',
    'nav.profile': 'Profile',
    'nav.scan': 'Scan',

    'greeting.morning': 'Good morning',
    'greeting.noon': 'Good afternoon',
    'greeting.afternoon': 'Good evening',
    'greeting.night': 'Good night',

    'profile.settings': 'Settings',
    'profile.settingsDesc': 'Dark mode, notifications, change password',
    'profile.editProfile': 'Edit Profile',
    'profile.logout': 'Log out',

    'settings.title': 'Settings',
    'settings.subtitle': 'Manage your account & app preferences',
    'settings.account': 'Account',
    'settings.editProfile': 'Edit Profile',
    'settings.editProfileDesc': 'Change your details, photo, and contact',
    'settings.changePassword': 'Change Password',
    'settings.changePasswordDesc': 'Update your account password',
    'settings.currentPassword': 'Current Password',
    'settings.newPassword': 'New Password',
    'settings.confirmNewPassword': 'Confirm New Password',
    'settings.savePassword': 'Save Password',
    'settings.appearance': 'Appearance',
    'settings.darkMode': 'Dark Mode',
    'settings.on': 'On',
    'settings.off': 'Off',
    'settings.notifications': 'Notifications',
    'settings.language': 'Language',
    'settings.languageDesc': 'Choose the app language',
    'settings.logout': 'Log out',

    'settings.pwMinLength': 'New password must be at least 6 characters.',
    'settings.pwMismatch': 'Password confirmation does not match.',
    'settings.pwCurrentWrong': 'Current password is incorrect.',
    'settings.pwFailed': 'Failed to change password.',
    'settings.pwSuccess': 'Password changed successfully.',
    'settings.logoutTitle': 'Log out of your account?',
    'settings.logoutMessage': 'You will be logged out and need to sign in again.',
  },
}
