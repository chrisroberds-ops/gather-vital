/**
 * /display — full-screen, unauthenticated lobby pickup display.
 * Shows children waiting to be picked up. Staff can clear entries from this screen.
 * Refreshes instantly via BroadcastChannel; falls back to 2-second polling.
 *
 * Church context: reads ?church=<slug> from the URL, resolves the church ID, and
 * applies the church's configured brand color before rendering — same pattern as
 * EmbedLayout.tsx. Without this param the display inherits whatever church context
 * is already active in the browser (e.g. the same tab as the admin dashboard).
 *
 * Two-component pattern:
 *   PickupDisplay (outer) — resolves ?church=<slug>, calls setChurchId + reloadConfig,
 *                           then mounts PickupDisplayContent only after context is applied.
 *   PickupDisplayContent (inner) — mounts fresh, reads useAppConfig() with updated values,
 *                                  owns all queue state and polling logic.
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { db } from '@/services'
import { setChurchId } from '@/services/church-context'
import { useAppConfig } from '@/services/app-config-context'
import { checkinBus } from '@/services/checkin-event-bus'
import { getActivePickupQueue, clearPickupEntry } from './pickup-queue-service'
import type { PickupQueueEntry } from '@/shared/types'

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 min ago'
  return `${mins} mins ago`
}

// ── Outer: church resolver ────────────────────────────────────────────────────
// Mirrors EmbedLayout.tsx: resolves ?church=<slug>, applies context, then yields
// to the inner component. The inner component only mounts after ready=true, so
// its useAppConfig() call always reads the already-updated config.

export default function PickupDisplay() {
  const [searchParams] = useSearchParams()
  const churchSlug = searchParams.get('church')
  const { reloadConfig } = useAppConfig()

  // Start as ready if there's no slug to resolve.
  const [ready, setReady] = useState(!churchSlug)

  useEffect(() => {
    if (!churchSlug) return

    async function applyChurch() {
      const church = await db.getChurchBySlug(churchSlug!)
      if (church) {
        setChurchId(church.id)
        await reloadConfig()
      } else {
        console.warn(
          '[Gather Display] Church slug not found — check that the setup wizard ran and the Church entity was saved.',
          { slug: churchSlug }
        )
      }
      setReady(true)
    }

    void applyChurch()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [churchSlug])

  // Hold rendering until church context + config are fully applied.
  if (!ready) return null
  return <PickupDisplayContent />
}

// ── Inner: queue display ──────────────────────────────────────────────────────
// Only ever mounts after the outer resolver has called setChurchId + reloadConfig,
// so useAppConfig() here returns the correct, up-to-date config on first render.

function PickupDisplayContent() {
  const { config } = useAppConfig()

  const [entries, setEntries] = useState<PickupQueueEntry[]>([])
  const [confirmingClear, setConfirmingClear] = useState<string | null>(null)
  const [, setTick] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    const queue = await getActivePickupQueue()
    setEntries(queue)
  }, [])

  // Tick every 30 seconds so "time ago" labels stay fresh
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  // Poll every 2 seconds (cross-tab / cross-device in TEST_MODE)
  useEffect(() => {
    void load()
    intervalRef.current = setInterval(() => void load(), 2_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [load])

  // Same-browser instant updates via BroadcastChannel
  useEffect(() => {
    return checkinBus.subscribe(event => {
      if (event.type === 'pickup_queue_updated') {
        void load()
      }
    })
  }, [load])

  async function handleClear(entryId: string) {
    if (confirmingClear !== entryId) {
      // First click — ask for confirmation.
      setConfirmingClear(entryId)
      return
    }
    // Second click — confirmed; remove from localStorage across all screens.
    setConfirmingClear(null)
    try {
      await clearPickupEntry(entryId)
      setEntries(prev => prev.filter(e => e.id !== entryId))
    } catch (err) {
      console.error('Failed to clear pickup queue entry:', err)
    }
  }

  const churchName = config.church_name || 'Your Church'
  const logoUrl = config.logo_url
  const brandColor = config.primary_color || '#4f46e5'

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: brandColor }}
    >
      {/* Header */}
      <div className="flex items-center justify-center gap-4 px-8 py-6">
        {logoUrl && (
          <img src={logoUrl} alt={churchName} className="h-14 object-contain" />
        )}
        <h1 className="text-3xl font-bold text-white tracking-wide">{churchName}</h1>
      </div>

      {/* Queue title */}
      <div className="text-center pb-4">
        <span className="text-white/80 text-lg font-medium uppercase tracking-widest">
          Child Pickup
        </span>
      </div>

      {/* Entries */}
      <div className="flex-1 px-8 pb-8 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-64 text-white/60 gap-3">
            {logoUrl && (
              <img src={logoUrl} alt="" className="h-20 object-contain opacity-30" />
            )}
            <p className="text-2xl font-light">No children waiting for pickup</p>
          </div>
        ) : (
          <div className="grid gap-4 max-w-4xl mx-auto">
            {entries.map(entry => (
              <div
                key={entry.id}
                className="bg-white rounded-2xl px-8 py-6 flex items-center justify-between shadow-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-3xl font-bold text-gray-900 truncate">
                    {entry.child_name}
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-lg text-gray-600">{entry.room}</span>
                    <span className="text-sm text-gray-400">•</span>
                    <span className="text-sm text-gray-400">{timeAgo(entry.requested_at)}</span>
                    <span className="text-sm text-gray-400">•</span>
                    <span className="font-mono font-bold text-gray-500 tracking-widest">
                      {entry.pickup_code}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => void handleClear(entry.id)}
                  className={`ml-6 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    confirmingClear === entry.id
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {confirmingClear === entry.id ? 'Confirm?' : 'Clear'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
