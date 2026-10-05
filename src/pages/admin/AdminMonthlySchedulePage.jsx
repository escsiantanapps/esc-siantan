import { lazy, Suspense } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { monthlyScheduleService } from '@/services/monthlyScheduleService'
import { Spinner } from '@/components/ui'
import { MonthlyScheduleWorkspace } from './MonthlyScheduleWorkspace'

const ServiceSchedulesPage = lazy(() => import('@/pages/user/ServiceSchedulesPage'))

export default function AdminMonthlySchedulePage() {
  const { profile } = useAuth()
  return <MonthlyScheduleWorkspace api={monthlyScheduleService} profile={profile} ministryHref="/admin/ministry" renderLegacy={() =>
    <Suspense fallback={<Spinner />}><ServiceSchedulesPage adminMode legacyOnly archiveOnly /></Suspense>
  } />
}
