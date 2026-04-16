import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAppConfig } from '@/services/app-config-context'

export default function WorshipDashboard() {
  const location = useLocation()
  const { config } = useAppConfig()
  const label = config.terminology?.service_label ?? 'Service Order'

  const tabs = [
    { to: '/admin/worship/songs', label: 'Song Library' },
    { to: '/admin/worship/services', label: label + 's' },
  ]

  // If we're exactly on /admin/worship, show the tab list with a landing
  const isRoot = location.pathname === '/admin/worship'

  return (
    <div className="space-y-0">
      {/* Tab bar */}
      <div className="border-b border-gray-200 bg-white px-6 pt-5">
        <div className="flex items-center gap-2 mb-0">
          <h1 className="text-xl font-bold text-gray-900 mr-4">Worship Planning</h1>
          <nav className="flex gap-0 flex-1">
            {tabs.map(tab => (
              <NavLink key={tab.to} to={tab.to}
                className={({ isActive }) =>
                  `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    isActive ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`
                }>
                {tab.label}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={() => window.open('/stand', '_blank')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5 transition-colors mb-1 flex-shrink-0"
            title="Preview what your team sees on their music stands"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open Music Stand
          </button>
        </div>
      </div>

      {isRoot ? (
        <div className="p-8 text-center text-gray-400">Select a section above to get started.</div>
      ) : (
        <Outlet />
      )}
    </div>
  )
}
