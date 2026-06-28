import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { useAuth } from '@/hooks/useAuth'
import ErrorBoundary from '@/components/ErrorBoundary'
import OfflineBanner from '@/components/OfflineBanner'

// Onboarding
import OnboardingPage from '@/pages/OnboardingPage'

// Auth
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import ActivatePage from '@/pages/auth/ActivatePage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'
import AccountStatusPage from '@/pages/auth/AccountStatusPage'

// User pages (real)
import HomePage from '@/pages/user/HomePage'
import TasksPage from '@/pages/user/TasksPage'
import ProfilePage from '@/pages/user/ProfilePage'
import EditProfilePage from '@/pages/user/EditProfilePage'
import InformationPage from '@/pages/user/InformationPage'
import InformationDetailPage from '@/pages/user/InformationDetailPage'
import EventsPage from '@/pages/user/EventsPage'
import EventDetailPage from '@/pages/user/EventDetailPage'
import TaskDetailPage from '@/pages/user/TaskDetailPage'
import BaptismPage from '@/pages/user/BaptismPage'
import WeddingPage from '@/pages/user/WeddingPage'
import ClassesPage from '@/pages/user/ClassesPage'
import ClassDetailPage from '@/pages/user/ClassDetailPage'
import RegistrationStatusPage from '@/pages/user/RegistrationStatusPage'
import PKSDashboardPage from '@/pages/user/PKSDashboardPage'
import PersembahanPage from '@/pages/user/PersembahanPage'
import UserLeavePage from '@/pages/user/UserLeavePage'
import SettingsPage from '@/pages/user/SettingsPage'

// Halaman berat (QR scanner) — dimuat saat dibutuhkan
const AttendanceScanPage = lazy(() => import('@/pages/user/AttendanceScanPage'))

// Admin pages — di-lazy load agar tidak ikut termuat untuk jemaat biasa
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage'))
const AdminMembersPage = lazy(() => import('@/pages/admin/AdminMembersPage'))
const AdminMemberDetailPage = lazy(() => import('@/pages/admin/AdminMemberDetailPage'))
const AdminTasksPage = lazy(() => import('@/pages/admin/AdminTasksPage'))
const AdminTaskFormPage = lazy(() => import('@/pages/admin/AdminTaskFormPage'))
const AdminTaskResponsesPage = lazy(() => import('@/pages/admin/AdminTaskResponsesPage'))
const AdminBaptismPage = lazy(() => import('@/pages/admin/AdminBaptismPage'))
const AdminWeddingPage = lazy(() => import('@/pages/admin/AdminWeddingPage'))
const AdminRegistrationDetailPage = lazy(() => import('@/pages/admin/AdminRegistrationDetailPage'))
const AdminSPPage = lazy(() => import('@/pages/admin/AdminSPPage'))
const AdminEventsPage = lazy(() => import('@/pages/admin/AdminEventsPage'))
const AdminEventFormPage = lazy(() => import('@/pages/admin/AdminEventFormPage'))
const AdminNewsPage = lazy(() => import('@/pages/admin/AdminNewsPage'))
const AdminNewsFormPage = lazy(() => import('@/pages/admin/AdminNewsFormPage'))
const AdminClassesPage = lazy(() => import('@/pages/admin/AdminClassesPage'))
const AdminMinistryPage = lazy(() => import('@/pages/admin/AdminMinistryPage'))
const AdminKomselPage = lazy(() => import('@/pages/admin/AdminKomselPage'))
const AdminEvaluationPage = lazy(() => import('@/pages/admin/AdminEvaluationPage'))
const AdminOfferingsPage = lazy(() => import('@/pages/admin/AdminOfferingsPage'))
const AdminLeavesPage = lazy(() => import('@/pages/admin/AdminLeavesPage'))
const AdminPermissionsPage = lazy(() => import('@/pages/admin/AdminPermissionsPage'))

// Layouts
import UserLayout from '@/layouts/UserLayout'
import AdminLayout from '@/layouts/AdminLayout'

function PrivateRoute({ children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  // Admin murni (tanpa peran kedua) tidak punya keperluan di app mobile.
  // Admin yang juga PKS atau Volunteer (role_secondary) tetap boleh masuk.
  const isPKS = profile?.is_pks === true || profile?.role === 'PKS'
  const hasSecondaryAccess = isPKS || !!profile?.role_secondary
  if (profile?.role === 'Admin' && !hasSecondaryAccess) {
    return <Navigate to="/admin" replace />
  }
  if (profile && profile.status !== 'Aktif') return <AccountStatusPage />
  return children
}

function AdminRoute({ children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (!['Admin', 'Super Admin'].includes(profile?.role)) return <Navigate to="/" replace />
  if (profile && profile.status !== 'Aktif') return <AccountStatusPage />
  return children
}

function PKSRoute({ children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (!(profile?.is_pks === true || profile?.role === 'PKS')) return <Navigate to="/" replace />
  return children
}

function PublicRoute({ children }) {
  const { user } = useAuth()
  if (user) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
    <LanguageProvider>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
        <OfflineBanner />
        <Suspense fallback={
          <div className="flex items-center justify-center h-screen">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        }>
        <Routes>
          <Route path="/onboarding"      element={<OnboardingPage />} />
          <Route path="/login"          element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register"       element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/lupa-password"  element={<ForgotPasswordPage />} />
          <Route path="/aktivasi"       element={<ActivatePage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route path="/" element={<PrivateRoute><UserLayout /></PrivateRoute>}>
            <Route index                        element={<HomePage />} />
            <Route path="profil"               element={<ProfilePage />} />
            <Route path="profil/edit"          element={<EditProfilePage />} />
            <Route path="pengaturan"           element={<SettingsPage />} />
            <Route path="informasi"            element={<InformationPage />} />
            <Route path="informasi/:id"        element={<InformationDetailPage />} />
            <Route path="events"               element={<EventsPage />} />
            <Route path="events/:id"           element={<EventDetailPage />} />
            <Route path="kelas"                element={<ClassesPage />} />
            <Route path="scan"                 element={<AttendanceScanPage />} />
            <Route path="kelas/absen"          element={<AttendanceScanPage />} />
            <Route path="kelas/:id"            element={<ClassDetailPage />} />
            <Route path="tugas"                element={<TasksPage />} />
            <Route path="tugas/:id"            element={<TaskDetailPage />} />
            <Route path="baptisan"             element={<BaptismPage />} />
            <Route path="pemberkatan-nikah"    element={<WeddingPage />} />
            <Route path="status-pendaftaran"   element={<RegistrationStatusPage />} />
            <Route path="persembahan"          element={<PersembahanPage />} />
            <Route path="izin"                 element={<UserLeavePage />} />
            <Route path="pks"                  element={<PKSRoute><PKSDashboardPage /></PKSRoute>} />
          </Route>

          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route index                       element={<AdminDashboardPage />} />
            <Route path="jemaat"               element={<AdminMembersPage />} />
            <Route path="jemaat/:id"           element={<AdminMemberDetailPage />} />
            <Route path="events"               element={<AdminEventsPage />} />
            <Route path="events/baru"          element={<AdminEventFormPage />} />
            <Route path="events/:id/edit"      element={<AdminEventFormPage />} />
            <Route path="berita"               element={<AdminNewsPage />} />
            <Route path="berita/baru"          element={<AdminNewsFormPage />} />
            <Route path="berita/:id/edit"      element={<AdminNewsFormPage />} />
            <Route path="kelas"                element={<AdminClassesPage />} />
            <Route path="tugas"                element={<AdminTasksPage />} />
            <Route path="tugas/baru"           element={<AdminTaskFormPage />} />
            <Route path="tugas/:id/edit"       element={<AdminTaskFormPage />} />
            <Route path="tugas/:id/jawaban"    element={<AdminTaskResponsesPage />} />
            <Route path="baptisan"             element={<AdminBaptismPage />} />
            <Route path="nikah"                element={<AdminWeddingPage />} />
            <Route path="baptisan/:id"         element={<AdminRegistrationDetailPage />} />
            <Route path="nikah/:id"            element={<AdminRegistrationDetailPage />} />
            <Route path="sp"                   element={<AdminSPPage />} />
            <Route path="ministry"             element={<AdminMinistryPage />} />
            <Route path="komsel"               element={<AdminKomselPage />} />
            <Route path="evaluasi"             element={<AdminEvaluationPage />} />
            <Route path="persembahan"          element={<AdminOfferingsPage />} />
            <Route path="izin"                 element={<AdminLeavesPage />} />
            <Route path="hak-akses"            element={<AdminPermissionsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
    </LanguageProvider>
    </ThemeProvider>
    </ErrorBoundary>
  )
}
