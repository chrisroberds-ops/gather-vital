/**
 * /stand — plan list page.
 * Shows the musician their upcoming service plans.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { getMyServicePlans, getCachedPlanIds, syncPlanForOffline, getSongsForPlan } from './music-stand-service'
import type { ServicePlan } from '@/shared/types'

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function isUpcoming(dateStr: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  return dateStr >= today
}

export default function PlanList() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [plans, setPlans] = useState<ServicePlan[]>([])
  const [cachedIds, setCachedIds] = useState<string[]>([])
  const [syncing, setSyncing] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    // Do NOT call setChurchId(user.church_id) here. user.church_id is captured at
    // useState-init time in makeTestUser and may be stale if the setup wizard ran
    // after that snapshot. The church-context module already holds the correct
    // _churchId (initialized from localStorage at module load). Overwriting it here
    // with a stale snapshot is what caused plans created post-wizard to be invisible.
    getMyServicePlans(user)
      .then(p => { setPlans(p); setLoading(false) })
      .catch(() => setLoading(false))
    setCachedIds(getCachedPlanIds())
  }, [user])

  async function handleSync(plan: ServicePlan, e: React.MouseEvent) {
    e.stopPropagation()
    setSyncing(plan.id)
    try {
      const songs = await getSongsForPlan(plan.id)
      await syncPlanForOffline(plan.id, plan, songs)
      setCachedIds(getCachedPlanIds())
    } finally {
      setSyncing(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const upcoming = plans.filter(p => isUpcoming(p.service_date))
  const past = plans.filter(p => !isUpcoming(p.service_date))

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="px-6 pt-8 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🎵</span>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Music Stand</h1>
            <p className="text-gray-400 text-sm">{user?.displayName ?? user?.email}</p>
          </div>
          {(user?.tier ?? 0) >= 3 && (
            <button
              onClick={() => navigate('/admin')}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Back to Admin"
            >
              ← Admin
            </button>
          )}
        </div>
      </header>

      {/* Plan list */}
      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-2xl mx-auto w-full">
        {plans.length === 0 && (
          <div className="text-center text-gray-500 mt-20">
            <p className="text-xl mb-2">No service plans found</p>
            <p className="text-sm">You have no upcoming services in the next 30 days.</p>
          </div>
        )}

        {upcoming.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
              Upcoming
            </h2>
            <ul className="space-y-3">
              {upcoming.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  isCached={cachedIds.includes(plan.id)}
                  syncing={syncing === plan.id}
                  onOpen={() => navigate(`/stand/plans/${plan.id}`)}
                  onSync={e => handleSync(plan, e)}
                />
              ))}
            </ul>
          </section>
        )}

        {past.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
              Recent (last 30 days)
            </h2>
            <ul className="space-y-3">
              {past.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  isCached={cachedIds.includes(plan.id)}
                  syncing={syncing === plan.id}
                  onOpen={() => navigate(`/stand/plans/${plan.id}`)}
                  onSync={e => handleSync(plan, e)}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

interface PlanCardProps {
  plan: ServicePlan
  isCached: boolean
  syncing: boolean
  onOpen: () => void
  onSync: (e: React.MouseEvent) => void
}

function PlanCard({ plan, isCached, syncing, onOpen, onSync }: PlanCardProps) {
  return (
    <li>
      <button
        onClick={onOpen}
        className="w-full text-left bg-gray-900 border border-gray-800 rounded-2xl px-5 py-4 hover:bg-gray-800 active:scale-[0.98] transition-all"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white text-base truncate">{plan.name}</p>
            <p className="text-gray-400 text-sm mt-0.5">{formatDate(plan.service_date)}</p>
            {plan.is_finalized && (
              <span className="inline-block mt-2 text-xs bg-green-900/40 text-green-400 rounded-full px-2 py-0.5">
                Finalized
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isCached && (
              <span className="text-xs text-blue-400" title="Available offline">
                ✓ Cached
              </span>
            )}
            <button
              onClick={onSync}
              disabled={syncing}
              className="text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-full px-3 py-1 transition-colors disabled:opacity-50"
              title="Download for offline use"
            >
              {syncing ? '↻' : '⬇ Sync'}
            </button>
            <span className="text-gray-600">›</span>
          </div>
        </div>
      </button>
    </li>
  )
}
