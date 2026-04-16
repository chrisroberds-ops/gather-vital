import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/services'
import {
  createStandSession,
  joinSession,
  leaveSession,
  endSession,
  getActiveSession,
  emitPageTurn,
  emitSongChange,
  standBus,
} from '@/features/stand/session-sync-service'
import type { ServicePlan } from '@/shared/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makePlan(): Promise<ServicePlan> {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return db.createServicePlan({
    name: 'Sunday Service',
    service_date: tomorrow.toISOString().slice(0, 10),
    is_finalized: false,
    created_by: 'leader-1',
  })
}

beforeEach(async () => {
  const plans = await db.getServicePlans()
  for (const p of plans) await db.deleteServicePlan(p.id)
})

// ── Session lifecycle ─────────────────────────────────────────────────────────

describe('createStandSession', () => {
  it('creates an active session in the DB', async () => {
    const plan = await makePlan()
    const session = await createStandSession(plan.id, 'person-leader')
    expect(session.id).toBeTruthy()
    expect(session.is_active).toBe(true)
    expect(session.plan_id).toBe(plan.id)
    expect(session.leader_person_id).toBe('person-leader')
    expect(session.joined_person_ids).toEqual([])
    expect(session.current_page).toBe(0)
  })

  it('emits a session_started event on the bus', async () => {
    const plan = await makePlan()
    const events: string[] = []
    const unsub = standBus.subscribe(e => events.push(e.type))
    await createStandSession(plan.id, 'person-leader')
    unsub()
    expect(events).toContain('session_started')
  })
})

describe('joinSession', () => {
  it('adds musician to joined_person_ids', async () => {
    const plan = await makePlan()
    const session = await createStandSession(plan.id, 'leader')
    const updated = await joinSession(session.id, 'musician-1')
    expect(updated.joined_person_ids).toContain('musician-1')
  })

  it('joining is idempotent (no duplicate entries)', async () => {
    const plan = await makePlan()
    const session = await createStandSession(plan.id, 'leader')
    await joinSession(session.id, 'musician-1')
    const second = await joinSession(session.id, 'musician-1')
    expect(second.joined_person_ids.filter(id => id === 'musician-1').length).toBe(1)
  })

  it('throws if session is not active', async () => {
    const plan = await makePlan()
    const session = await createStandSession(plan.id, 'leader')
    await endSession(session.id)
    await expect(joinSession(session.id, 'musician-1')).rejects.toThrow()
  })

  it('emits musician_joined event', async () => {
    const plan = await makePlan()
    const session = await createStandSession(plan.id, 'leader')
    const events: string[] = []
    const unsub = standBus.subscribe(e => events.push(e.type))
    await joinSession(session.id, 'musician-1')
    unsub()
    expect(events).toContain('musician_joined')
  })
})

describe('leaveSession', () => {
  it('removes musician from joined_person_ids', async () => {
    const plan = await makePlan()
    const session = await createStandSession(plan.id, 'leader')
    await joinSession(session.id, 'musician-1')
    const updated = await leaveSession(session.id, 'musician-1')
    expect(updated.joined_person_ids).not.toContain('musician-1')
  })

  it('emits musician_left event', async () => {
    const plan = await makePlan()
    const session = await createStandSession(plan.id, 'leader')
    await joinSession(session.id, 'musician-1')
    const events: string[] = []
    const unsub = standBus.subscribe(e => events.push(e.type))
    await leaveSession(session.id, 'musician-1')
    unsub()
    expect(events).toContain('musician_left')
  })
})

describe('endSession', () => {
  it('marks session as inactive', async () => {
    const plan = await makePlan()
    const session = await createStandSession(plan.id, 'leader')
    const ended = await endSession(session.id)
    expect(ended.is_active).toBe(false)
    expect(ended.ended_at).toBeTruthy()
  })

  it('emits session_ended event', async () => {
    const plan = await makePlan()
    const session = await createStandSession(plan.id, 'leader')
    const events: string[] = []
    const unsub = standBus.subscribe(e => events.push(e.type))
    await endSession(session.id)
    unsub()
    expect(events).toContain('session_ended')
  })
})

describe('getActiveSession', () => {
  it('returns the active session for a plan', async () => {
    const plan = await makePlan()
    const session = await createStandSession(plan.id, 'leader')
    const found = await getActiveSession(plan.id)
    expect(found?.id).toBe(session.id)
  })

  it('returns null when no active session exists', async () => {
    const plan = await makePlan()
    const found = await getActiveSession(plan.id)
    expect(found).toBeNull()
  })

  it('returns null after session is ended', async () => {
    const plan = await makePlan()
    const session = await createStandSession(plan.id, 'leader')
    await endSession(session.id)
    const found = await getActiveSession(plan.id)
    expect(found).toBeNull()
  })
})

// ── Page turn sync ────────────────────────────────────────────────────────────

describe('emitPageTurn', () => {
  it('updates session current_page in DB and broadcasts event', async () => {
    const plan = await makePlan()
    const session = await createStandSession(plan.id, 'leader')

    const events: Array<{ type: string; payload: Record<string, unknown> }> = []
    const unsub = standBus.subscribe(e => events.push({ type: e.type, payload: e.payload }))

    await emitPageTurn(session.id, 3)
    unsub()

    const updated = await db.getMusicStandSession(session.id)
    expect(updated?.current_page).toBe(3)

    const pageTurnEvent = events.find(e => e.type === 'page_turned')
    expect(pageTurnEvent?.payload.page).toBe(3)
  })
})

describe('emitSongChange', () => {
  it('updates current_song_id and current_page in DB', async () => {
    const plan = await makePlan()
    const session = await createStandSession(plan.id, 'leader')

    await emitSongChange(session.id, 'song-xyz', 2)

    const updated = await db.getMusicStandSession(session.id)
    expect(updated?.current_song_id).toBe('song-xyz')
    expect(updated?.current_page).toBe(2)
  })

  it('broadcasts song_changed event', async () => {
    const plan = await makePlan()
    const session = await createStandSession(plan.id, 'leader')

    const events: Array<{ type: string; payload: Record<string, unknown> }> = []
    const unsub = standBus.subscribe(e => events.push({ type: e.type, payload: e.payload }))
    await emitSongChange(session.id, 'song-xyz')
    unsub()

    const ev = events.find(e => e.type === 'song_changed')
    expect(ev?.payload.song_id).toBe('song-xyz')
  })
})

// ── Bus subscription ──────────────────────────────────────────────────────────

describe('standBus', () => {
  it('delivers events to subscribers', () => {
    const received: string[] = []
    const unsub = standBus.subscribe(e => received.push(e.type))
    standBus.emit('page_turned', 'session-1', { page: 0 })
    unsub()
    expect(received).toContain('page_turned')
  })

  it('unsubscribing stops delivery', () => {
    const received: string[] = []
    const unsub = standBus.subscribe(e => received.push(e.type))
    unsub()
    standBus.emit('page_turned', 'session-1', { page: 0 })
    expect(received.length).toBe(0)
  })
})
