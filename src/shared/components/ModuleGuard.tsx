import { useNavigate } from 'react-router-dom'
import { useAppConfig } from '@/services/app-config-context'
import { DEFAULT_MODULES, type ModuleConfig } from '@/shared/types'

interface Props {
  module: keyof ModuleConfig
  embed?: boolean  // true for /embed/* and /kiosk routes
  children: React.ReactNode
}

/**
 * Wraps a page/route component. If the module is disabled:
 *  - embed=true → shows a clean "not enabled" message
 *  - embed=false → shows a banner with link to Settings (Staff+ redirect)
 */
export default function ModuleGuard({ module: moduleName, embed = false, children }: Props) {
  const { config } = useAppConfig()
  const navigate = useNavigate()
  const modules = config.modules ?? DEFAULT_MODULES

  if (!modules[moduleName]) {
    if (embed) {
      return (
        <div className="flex flex-col items-center justify-center min-h-32 p-8 text-center">
          <div className="text-3xl mb-3">🔒</div>
          <h2 className="text-lg font-semibold text-gray-700">This feature is not enabled</h2>
          <p className="text-gray-400 text-sm mt-1">Contact your church administrator for access.</p>
        </div>
      )
    }
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center max-w-md mx-auto">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-xl font-semibold text-gray-800">This module is disabled</h2>
        <p className="text-gray-500 text-sm mt-2 leading-relaxed">
          The <strong className="capitalize">{moduleName}</strong> module is currently turned off for your church.
          An Executive-level admin can re-enable it in Settings.
        </p>
        <button
          onClick={() => navigate('/admin')}
          className="mt-6 px-5 py-2 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  return <>{children}</>
}
