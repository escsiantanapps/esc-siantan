import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { useAuth } from '@/hooks/useAuth'

// Auth
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
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
import ClassAttendanceScanPage from '@/pages/user/ClassAttendanceScanPage'
import RegistrationStatusPage from '@/pages/user/RegistrationStatusPage'
import PKSDashboardPage from '@/pages/user/PKSDashboardPage'

// Admin pages (real)
import AdminMembersPage from '@/pages/admin/AdminMembersPage'
import AdminMemberDetailPage from '@/pages/admin/AdminMemberDetailPage'
import AdminTasksPage from '@/pages/admin/AdminTasksPage'
import AdminTaskFormPage from '@/pages/admin/AdminTaskFormPage'
import AdminTaskResponsesPage from '@/pages/admin/AdminTaskResponsesPage'
import AdminBaptismPage from '@/pages/admin/AdminBaptismPage'
import AdminWeddingPage from '@/pages/admin/AdminWeddingPage'
import AdminRegistrationDetailPage from '@/pages/admin/AdminRegistrationDetailPage'
import AdminSPPage from '@/pages/admin/AdminSPPage'
import AdminEventsPage from '@/pages/admin/AdminEventsPage'
import AdminEventFormPage from '@/pages/admin/AdminEventFormPage'
import AdminNewsPage from '@/pages/admin/AdminNewsPage'
import AdminNewsFormPage from '@/pages/admin/AdminNewsFormPage'
import AdminClassesPage from '@/pages/admin/AdminClassesPage'
import AdminMinistryPage from '@/pages/admin/AdminMinistryPage'
import AdminKomselPage from '@/pages/admin/AdminKomselPage'
import AdminEvaluationPage from '@/pages/admin/AdminEvaluationPage'
import AdminPermissionsPage from '@/pages/admin/AdminPermissionsPage'

// Admin dashboard (real)
import AdminDashboardPage from '@/pages/admin/AdminDashboardPage'

// Layouts
import UserLayout from '@/layouts/UserLayout'
import AdminLayout from '@/layouts/AdminLayout'

function PrivateRoute({ children }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()
  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  const isPKS = profile?.is_pks === true || profile?.role === 'PKS'
  if (profile?.role === 'Admin' && !(location.pathname === '/pks' && isPKS)) {
    return <Navigate to="/admin" replace />
  }
  if (profile && profile.status !== 'Aktif') return <AccountStatusPage />
  return children
}

function AdminRoute({ children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
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
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (!(profile?.is_pks === true || profile?.role === 'PKS')) return <Navigate to="/" replace />
  return children
}

function PublicRoute({ children }) {
  const { user } = useAuth()
  return user ? <Navigate to="/" replace /> : children
}

export default function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
        <Routes>
          <Route path="/login"          element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register"       element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/lupa-password"  element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route path="/" element={<PrivateRoute><UserLayout /></PrivateRoute>}>
            <Route index                        element={<HomePage />} />
            <Route path="profil"               element={<ProfilePage />} />
            <Route path="profil/edit"          element={<EditProfilePage />} />
            <Route path="informasi"            element={<InformationPage />} />
            <Route path="informasi/:id"        element={<InformationDetailPage />} />
            <Route path="events"               element={<EventsPage />} />
            <Route path="events/:id"           element={<EventDetailPage />} />
            <Route path="kelas"                element={<ClassesPage />} />
            <Route path="kelas/absen"          element={<ClassAttendanceScanPage />} />
            <Route path="kelas/:id"            element={<ClassDetailPage />} />
            <Route path="tugas"                element={<TasksPage />} />
            <Route path="tugas/:id"            element={<TaskDetailPage />} />
            <Route path="baptisan"             element={<BaptismPage />} />
            <Route path="pemberkatan-nikah"    element={<WeddingPage />} />
            <Route path="status-pendaftaran"   element={<RegistrationStatusPage />} />
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
            <Route path="hak-akses"            element={<AdminPermissionsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
    </ThemeProvider>
  )
}
