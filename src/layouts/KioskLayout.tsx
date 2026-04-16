import { useEffect } from 'react'
import { Outlet, useSearchParams } from 'react-router-dom'
import { db } from '@/services'
import { setChurchId } from '@/services/church-context'
import { useAppConfig, applyPrimaryColor } from '@/services/app-config-context'

// Full-screen kiosk shell — no navigation, large touch targets.
// Participates in AppConfigProvider so the church's configured primary color is
// applied to all buttons and interactive elements.
// Supports ?church=<slug> for kiosk devices that are not authenticated (rare),
// falling back to the church_id persisted in localStorage from a prior staff login.
export default function KioskLayout() {
  const [searchParams] = useSearchParams()
  const churchSlug = searchParams.get('church')
  const { config, reloadConfig } = useAppConfig()

  // If a ?church= slug is present, resolve and activate it.
  useEffect(() => {
    if (!churchSlug) return
    async function applyChurch() {
      const church = await db.getChurchBySlug(churchSlug!)
      if (church) {
        setChurchId(church.id)
        await reloadConfig()
      }
    }
    void applyChurch()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [churchSlug])

  // Re-apply the primary color whenever config updates (covers the case where
  // AppConfigProvider loads config after the kiosk has already rendered).
  useEffect(() => {
    applyPrimaryColor(config.primary_color)
  }, [config.primary_color])

  return (
    <div className="fixed inset-0 bg-white flex flex-col overflow-hidden">
      <Outlet />
    </div>
  )
}
