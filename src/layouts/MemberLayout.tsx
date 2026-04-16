import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { setCurrentUserForGuards } from '@/auth/guards'
import { AccessTier } from '@/shared/types'
import { isTestMode } from '@/config/firebase'
import { tierHomePath } from '@/shared/utils/tierNav'

const TIER_LABELS: Record<AccessTier, string> = {
  [AccessTier.Public]: 'Public',
  [AccessTier.Authenticated]: 'Member',
  [AccessTier.GroupLeader]: 'Group Leader',
  [AccessTier.Staff]: 'Staff',
  [AccessTier.Executive]: 'Executive',
}

const TIER_COLORS: Record<AccessTier, string> = {
  [AccessTier.Public]: 'bg-gray-100 text-gray-600',
  [AccessTier.Authenticated]: 'bg-blue-100 text-blue-700',
  [AccessTier.GroupLeader]: 'bg-purple-100 text-purple-700',
  [AccessTier.Staff]: 'bg-green-100 text-green-700',
  [AccessTier.Executive]: 'bg-orange-100 text-orange-700',
}

export default function MemberLayout() {
  const { user, signOut, setTestTier } = useAuth()
  const navigate = useNavigate()
  const tier = user?.tier ?? AccessTier.Public

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">G</span>
            </div>
            <span className="font-bold text-gray-900">Gather</span>
          </div>

          {/* Nav links */}
          <nav className="flex items-center gap-1">
            <NavLink
              to="/my"
              end
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`
              }
            >
              My Profile
            </NavLink>
            {tier >= AccessTier.GroupLeader && (
              <NavLink
                to="/leader"
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`
                }
              >
                My Group
              </NavLink>
            )}
          </nav>

          {/* User + actions */}
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIER_COLORS[tier]}`}>
              {TIER_LABELS[tier]}
            </span>
            <span className="text-sm text-gray-500 hidden sm:block truncate max-w-32">
              {user?.displayName ?? user?.email}
            </span>
            <button
              onClick={() => void handleSignOut()}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Test mode banner */}
      {isTestMode && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-4xl mx-auto px-6 py-2 flex items-center justify-between">
            <span className="text-xs text-amber-700 font-medium">
              TEST MODE — viewing as <strong>{TIER_LABELS[tier]}</strong>
            </span>
            <div className="flex gap-1.5">
              {([
                { label: 'Public', tier: AccessTier.Public },
                { label: 'Member', tier: AccessTier.Authenticated },
                { label: 'Leader', tier: AccessTier.GroupLeader },
                { label: 'Staff', tier: AccessTier.Staff },
              ] as const).map(opt => (
                <button
                  key={opt.tier}
                  onClick={() => {
                    setCurrentUserForGuards({ tier: opt.tier, isFinanceAdmin: false })
                    setTestTier(opt.tier)
                    navigate(tierHomePath(opt.tier), { replace: true })
                  }}
                  className={`text-[11px] px-2 py-0.5 rounded font-medium transition-colors ${
                    tier === opt.tier
                      ? 'bg-amber-300 text-amber-900'
                      : 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
