import { useContext } from 'react'
import { MaintenanceContext } from '@/contexts/MaintenanceContext'

export function useMaintenance() {
  return useContext(MaintenanceContext)
}
