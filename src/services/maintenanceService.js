import { appSettingsService } from '@/services/contentService'

const MAINTENANCE_KEY = 'maintenance_mode'

export const maintenanceService = {
  async getEnabled() {
    return (await appSettingsService.get(MAINTENANCE_KEY)) === true
  },

  async setEnabled(enabled) {
    await appSettingsService.set(MAINTENANCE_KEY, enabled === true)
  },
}
