import { useEffect, useState } from 'react'
import { Outlet, useSearchParams } from 'react-router-dom'
import { db } from '@/services'
import { setChurchId } from '@/services/church-context'
import { useAppConfig } from '@/services/app-config-context'

// Zero-chrome layout for embeddable widgets (iframes).
// Reads ?church=<slug> from the URL, resolves the church ID, and applies the
// church's configured primary color before rendering the widget.
export default function EmbedLayout() {
  const [searchParams] = useSearchParams()
  const churchSlug = searchParams.get('church')
  const { reloadConfig } = useAppConfig()
  const [ready, setReady] = useState(!churchSlug)

  useEffect(() => {
    if (!churchSlug) return

    async function applyChurch() {
      const church = await db.getChurchBySlug(churchSlug!)
      if (church) {
        setChurchId(church.id)
        await reloadConfig()
      }
      setReady(true)
    }

    void applyChurch()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [churchSlug])

  // Hold rendering until the church config (and its primary color) is applied.
  // This prevents a flash of default-indigo buttons before the correct color loads.
  if (!ready) return null

  return (
    <div className="bg-white">
      <Outlet />
    </div>
  )
}
