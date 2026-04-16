/**
 * Pickup queue service — manages the live lobby display queue.
 * Entries are added when a child is checked out (parent picks up) and cleared
 * by staff once the child has been physically handed off.
 *
 * Cross-tab persistence: entries are written to localStorage so that the display
 * page (which runs in a separate browser tab or device) can read them without
 * needing access to the in-memory DB store of the tab that performed the checkout.
 * This mirrors the persistCheckin / getSessionCheckins pattern.
 */

import { db } from '@/services'
import { checkinBus } from '@/services/checkin-event-bus'
import type { PickupQueueEntry } from '@/shared/types'

// ── localStorage persistence (cross-tab) ──────────────────────────────────────

const PICKUP_QUEUE_KEY = 'gather_pickup_queue'

function readPersistedPickupQueue(): PickupQueueEntry[] {
  try {
    const raw = localStorage.getItem(PICKUP_QUEUE_KEY)
    return raw ? (JSON.parse(raw) as PickupQueueEntry[]) : []
  } catch {
    return []
  }
}

function persistPickupQueue(entries: PickupQueueEntry[]): void {
  try {
    localStorage.setItem(PICKUP_QUEUE_KEY, JSON.stringify(entries))
  } catch {
    // localStorage quota exceeded — silently ignore
  }
}

// ── Auto-expiry ───────────────────────────────────────────────────────────────
// Entries older than this threshold are considered stale and are pruned from
// localStorage on every read, so they never appear on the display.

const QUEUE_EXPIRY_MS = 2 * 60 * 60 * 1000 // 2 hours

function isExpired(entry: PickupQueueEntry): boolean {
  return Date.now() - new Date(entry.requested_at).getTime() > QUEUE_EXPIRY_MS
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getActivePickupQueue(sessionId?: string): Promise<PickupQueueEntry[]> {
  // Primary source: localStorage — visible cross-tab and cross-device in TEST_MODE.
  const persisted = readPersistedPickupQueue()
  if (persisted.length > 0) {
    // Prune expired entries and write back if anything was removed.
    const fresh = persisted.filter(e => !isExpired(e))
    if (fresh.length < persisted.length) persistPickupQueue(fresh)

    const active = fresh.filter(e => !e.is_cleared)
    const filtered = sessionId ? active.filter(e => e.session_id === sessionId) : active
    return filtered.sort((a, b) => a.requested_at.localeCompare(b.requested_at))
  }
  // Fallback: same-tab, no localStorage entries yet (first checkout this session).
  return db.getPickupQueue(sessionId)
}

export interface AddToQueueInput {
  session_id: string
  checkin_id: string
  child_name: string
  room: string
  pickup_code: string
}

export async function addToPickupQueue(input: AddToQueueInput): Promise<PickupQueueEntry> {
  console.log('[Gather] addToPickupQueue called', input)
  const entry = await db.createPickupQueueEntry({
    session_id: input.session_id,
    checkin_id: input.checkin_id,
    child_name: input.child_name,
    room: input.room,
    pickup_code: input.pickup_code,
    requested_at: new Date().toISOString(),
  })

  // Persist cross-tab so the display page reads the updated queue.
  const all = readPersistedPickupQueue()
  all.push(entry)
  persistPickupQueue(all)

  checkinBus.emit('pickup_queue_updated', { entry })
  return entry
}

export async function clearPickupEntry(entryId: string): Promise<PickupQueueEntry> {
  let entry: PickupQueueEntry
  try {
    // Same-tab case: the entry exists in this tab's in-memory DB.
    entry = await db.clearPickupQueueEntry(entryId)
  } catch {
    // Cross-tab case: the entry was created in the staff dashboard tab and only
    // lives in localStorage. Reconstruct and mark cleared without touching the DB.
    const fromStorage = readPersistedPickupQueue().find(e => e.id === entryId)
    if (!fromStorage) throw new Error(`PickupQueueEntry ${entryId} not found`)
    entry = { ...fromStorage, is_cleared: true, cleared_at: new Date().toISOString() }
  }

  // Update localStorage so both tabs see the cleared state.
  const all = readPersistedPickupQueue()
  const idx = all.findIndex(e => e.id === entryId)
  if (idx >= 0) all[idx] = entry
  persistPickupQueue(all)

  checkinBus.emit('pickup_queue_updated', { entry })
  return entry
}
