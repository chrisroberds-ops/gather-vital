/**
 * Music Stand layout — full-screen, no admin chrome.
 * All routes under /stand render inside this layout.
 * Respects modules.worship flag.
 */

import { Outlet } from 'react-router-dom'
import { useAppConfig } from '@/services/app-config-context'
import { DEFAULT_MODULES } from '@/shared/types'

export default function StandLayout() {
  const { config } = useAppConfig()
  const modules = config.modules ?? DEFAULT_MODULES

  if (!modules.worship) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-center px-8">
        <div className="text-5xl mb-4">🎵</div>
        <h1 className="text-2xl font-bold text-white mb-2">Music Stand</h1>
        <p className="text-gray-400 text-base">This feature is not enabled for your church.</p>
        <p className="text-gray-600 text-sm mt-2">Contact your administrator to enable the Worship module.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Outlet />
    </div>
  )
}
