/**
 * Music Stand session-sync service.
 *
 * Handles synchronized page turns between musicians.
 * - In TEST_MODE: BroadcastChannel (cross-tab, same browser)
 * - In production: Firebase Realtime Database
 *
 * Pattern mirrors checkin-event-bus.ts.
 */

import { db } from '@/services'
import type { MusicStandSession } from '@/shared/types'

// ── Event Bus ─────────────────────────────────────────────────────────────────

export type StandEventType =
  | 'page_turned'
  | 'song_changed'
  | 'session_started'
  | 'session_ended'
  | 'musician_joined'
  | 'musician_left'

export interface StandEvent {
  type: StandEventType
  session_id: string
  payload: Record<string, unknown>
  timestamp: string
}

type StandListener = (event: StandEvent) => void

const CHANNEL_NAME = 'gather-stand'

class StandEventBus {
  private listeners: Set<StandListener> = new Set()
  private channel: BroadcastChannel | null = null

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME)
      this.channel.onmessage = (e: MessageEvent<StandEvent>) => {
        this.listeners.forEach(l => l(e.data))
      }
    }
  }

  subscribe(listener: StandListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  publish(event: StandEvent): void {
    this.listeners.forEach(l => l(event))
    this.channel?.postMessage(event)
  }

  emit(type: StandEventType, sessionId: string, payload: Record<string, unknown> = {}): void {
    this.publish({ type, session_id: sessionId, payload, timestamp: new Date().toISOString() })
  }
}

/** Singleton bus — same instance for the entire Music Stand. */
export const standBus = new StandEventBus()

// ── Session Management ────────────────────────────────────────────────────────

/**
 * Creates a new synchronized session for a plan.
 * Only Staff+ (worship leaders) should call this.
 */
export async function createStandSession(
  planId: string,
  leaderPersonId: string
): Promise<MusicStandSession> {
  const session = await db.createMusicStandSession({
    plan_id: planId,
    leader_person_id: leaderPersonId,
    is_active: true,
    current_song_id: null,
    current_page: 0,
    joined_person_ids: [],
  })
  standBus.emit('session_started', session.id, { plan_id: planId, leader_person_id: leaderPersonId })
  return session
}

/**
 * Musician joins a session. Adds their personId to joined_person_ids.
 */
export async function joinSession(
  sessionId: string,
  personId: string
): Promise<MusicStandSession> {
  const session = await db.getMusicStandSession(sessionId)
  if (!session) throw new Error(`MusicStandSession ${sessionId} not found`)
  if (!session.is_active) throw new Error('Session is no longer active')

  const updated = await db.updateMusicStandSession(sessionId, {
    joined_person_ids: [...new Set([...session.joined_person_ids, personId])],
  })
  standBus.emit('musician_joined', sessionId, { person_id: personId })
  return updated
}

/**
 * Musician leaves a session voluntarily.
 */
export async function leaveSession(
  sessionId: string,
  personId: string
): Promise<MusicStandSession> {
  const session = await db.getMusicStandSession(sessionId)
  if (!session) throw new Error(`MusicStandSession ${sessionId} not found`)

  const updated = await db.updateMusicStandSession(sessionId, {
    joined_person_ids: session.joined_person_ids.filter(id => id !== personId),
  })
  standBus.emit('musician_left', sessionId, { person_id: personId })
  return updated
}

/**
 * Worship leader ends the session.
 */
export async function endSession(sessionId: string): Promise<MusicStandSession> {
  const updated = await db.updateMusicStandSession(sessionId, {
    is_active: false,
    ended_at: new Date().toISOString(),
  })
  standBus.emit('session_ended', sessionId, {})
  return updated
}

/**
 * Returns the active session for a plan, if one exists.
 */
export async function getActiveSession(planId: string): Promise<MusicStandSession | null> {
  const sessions = await db.getMusicStandSessions(planId)
  return sessions.find(s => s.is_active) ?? null
}

/**
 * Returns the first active MusicStandSession across ALL service plans,
 * along with the plan it belongs to.
 * Used by the read-only `/display/service` stage monitor to auto-attach to a live session.
 * Checks only plans from the last 7 days through 30 days ahead to keep the scan cheap.
 */
export async function getAnyActiveSession(): Promise<{
  session: MusicStandSession
  planId: string
} | null> {
  const allPlans = await db.getServicePlans()
  // Narrow to a ±30-day window to avoid scanning the entire history
  const today = new Date()
  const cutoffPast = new Date(today); cutoffPast.setDate(today.getDate() - 7)
  const cutoffFuture = new Date(today); cutoffFuture.setDate(today.getDate() + 30)
  const cutoffPastStr = cutoffPast.toISOString().slice(0, 10)
  const cutoffFutureStr = cutoffFuture.toISOString().slice(0, 10)

  const relevant = allPlans.filter(
    p => p.service_date >= cutoffPastStr && p.service_date <= cutoffFutureStr
  )

  for (const plan of relevant) {
    const sessions = await db.getMusicStandSessions(plan.id)
    const active = sessions.find(s => s.is_active)
    if (active) return { session: active, planId: plan.id }
  }
  return null
}

// ── Page Turn Sync ────────────────────────────────────────────────────────────

/**
 * Called by the session leader when they turn to a new page.
 * Updates the session state and broadcasts to all joined devices.
 */
export async function emitPageTurn(
  sessionId: string,
  page: number
): Promise<void> {
  await db.updateMusicStandSession(sessionId, { current_page: page })
  standBus.emit('page_turned', sessionId, { page })
}

/**
 * Called by the session leader when they advance to a new song.
 * Updates the session state and broadcasts to all joined devices.
 */
export async function emitSongChange(
  sessionId: string,
  songId: string,
  page = 0
): Promise<void> {
  await db.updateMusicStandSession(sessionId, { current_song_id: songId, current_page: page })
  standBus.emit('song_changed', sessionId, { song_id: songId, page })
}
