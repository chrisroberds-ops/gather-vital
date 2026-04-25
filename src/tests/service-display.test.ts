/**
 * Service Display tests — `/display/service` stage confidence monitor
 *
 * Covers:
 *  - getAnyActiveSession: returns active session when one exists
 *  - getAnyActiveSession: returns null when no plans exist
 *  - getAnyActiveSession: returns null when plans exist but no sessions
 *  - getAnyActiveSession: returns null when sessions exist but all inactive
 *  - getAnyActiveSession: only scans plans within ±7/+30-day window
 *  - getAnyActiveSession: returns first active session when multiple plans
 *  - getAnyActiveSession: includes the planId in the result
 *  - session current_song_id is null by default on creation
 *  - song change updates session current_song_id via emitSongChange
 *  - session ended marks is_active false (endSession)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services'
import {
  createStandSession,
  endSession,
  emitSongChange,
  getAnyActiveSession,
} from '@/features/stand/session-sync-service'
import type { ServicePlan, Song } from '@/shared/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function dateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

async function makePlan(offsetDays = 0): Promise<ServicePlan> {
  return db.createServicePlan({
    name: `Sunday Service ${offsetDays}`,
    service_date: dateOffset(offsetDays),
    is_finalized: false,
    created_by: 'leader-1',
  })
}

async function makeSong(): Promise<Song> {
  return db.createSong({
    title: 'Amazing Grace',
    artist: 'Traditional',
    key: 'G',
    bpm: 80,
  })
}

beforeEach(async () => {
  // Clean service plans before each test
  const plans = await db.getServicePlans()
  for (const p of plans) await db.deleteServicePlan(p.id)
})

// ── getAnyActiveSession ───────────────────────────────────────────────────────

describe('getAnyActiveSession', () => {
  it('returns null when no service plans exist', async () => {
    const result = await getAnyActiveSession()
    expect(result).toBeNull()
  })

  it('returns null when plans exist but have no sessions', async () => {
    await makePlan(0)
    const result = await getAnyActiveSession()
    expect(result).toBeNull()
  })

  it('returns null when sessions exist but all are inactive', async () => {
    const plan = await makePlan(0)
    const session = await createStandSession(plan.id, 'leader-1')
    await endSession(session.id)

    const result = await getAnyActiveSession()
    expect(result).toBeNull()
  })

  it('returns the active session when one exists', async () => {
    const plan = await makePlan(0)
    const session = await createStandSession(plan.id, 'leader-1')

    const result = await getAnyActiveSession()
    expect(result).not.toBeNull()
    expect(result!.session.id).toBe(session.id)
    expect(result!.session.is_active).toBe(true)
  })

  it('includes the planId in the result', async () => {
    const plan = await makePlan(0)
    await createStandSession(plan.id, 'leader-1')

    const result = await getAnyActiveSession()
    expect(result!.planId).toBe(plan.id)
  })

  it('returns null for plans outside the scan window (>30 days ahead)', async () => {
    const plan = await makePlan(35) // 35 days out — beyond the 30-day future window
    await createStandSession(plan.id, 'leader-1')

    const result = await getAnyActiveSession()
    expect(result).toBeNull()
  })

  it('returns null for plans outside the scan window (>7 days past)', async () => {
    const plan = await makePlan(-10) // 10 days ago — beyond the 7-day past window
    await createStandSession(plan.id, 'leader-1')

    const result = await getAnyActiveSession()
    expect(result).toBeNull()
  })

  it('returns a session for plans within the past 7 days', async () => {
    const plan = await makePlan(-5) // 5 days ago — within window
    await createStandSession(plan.id, 'leader-1')

    const result = await getAnyActiveSession()
    expect(result).not.toBeNull()
    expect(result!.planId).toBe(plan.id)
  })

  it('returns the first active session when multiple plans have sessions', async () => {
    const plan1 = await makePlan(0)
    const plan2 = await makePlan(1)
    await createStandSession(plan1.id, 'leader-1')
    await createStandSession(plan2.id, 'leader-2')

    const result = await getAnyActiveSession()
    expect(result).not.toBeNull()
    expect(result!.session.is_active).toBe(true)
  })

  it('skips ended sessions and finds the next active one', async () => {
    const plan1 = await makePlan(0)
    const plan2 = await makePlan(1)

    const session1 = await createStandSession(plan1.id, 'leader-1')
    await endSession(session1.id) // mark plan1's session as ended
    await createStandSession(plan2.id, 'leader-2') // plan2 has an active session

    const result = await getAnyActiveSession()
    expect(result).not.toBeNull()
    expect(result!.planId).toBe(plan2.id)
  })
})

// ── session state for display ─────────────────────────────────────────────────

describe('session state consumed by ServiceDisplay', () => {
  it('session current_song_id starts null', async () => {
    const plan = await makePlan(0)
    const session = await createStandSession(plan.id, 'leader-1')
    expect(session.current_song_id).toBeNull()
  })

  it('emitSongChange updates current_song_id on the session', async () => {
    const plan = await makePlan(0)
    const session = await createStandSession(plan.id, 'leader-1')
    const song = await makeSong()

    await emitSongChange(session.id, song.id, 0)

    const sessions = await db.getMusicStandSessions(plan.id)
    const updated = sessions.find(s => s.id === session.id)
    expect(updated?.current_song_id).toBe(song.id)
  })

  it('endSession marks is_active false', async () => {
    const plan = await makePlan(0)
    const session = await createStandSession(plan.id, 'leader-1')
    expect(session.is_active).toBe(true)

    await endSession(session.id)
    const sessions = await db.getMusicStandSessions(plan.id)
    const ended = sessions.find(s => s.id === session.id)
    expect(ended?.is_active).toBe(false)
  })

  it('endSession sets ended_at timestamp', async () => {
    const plan = await makePlan(0)
    const session = await createStandSession(plan.id, 'leader-1')
    const result = await endSession(session.id)
    expect(result.ended_at).toBeTruthy()
  })

  it('getAnyActiveSession returns null after session is ended', async () => {
    const plan = await makePlan(0)
    const session = await createStandSession(plan.id, 'leader-1')
    await endSession(session.id)

    const result = await getAnyActiveSession()
    expect(result).toBeNull()
  })

  it('multiple songs can be navigated via emitSongChange', async () => {
    const plan = await makePlan(0)
    const session = await createStandSession(plan.id, 'leader-1')
    const song1 = await makeSong()
    const song2 = await db.createSong({ title: 'How Great Thou Art', artist: 'Traditional', key: 'D', bpm: 70 })

    await emitSongChange(session.id, song1.id, 0)
    await emitSongChange(session.id, song2.id, 0)

    const sessions = await db.getMusicStandSessions(plan.id)
    const updated = sessions.find(s => s.id === session.id)
    expect(updated?.current_song_id).toBe(song2.id)
  })
})
