import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getActivePickupQueue, addToPickupQueue, clearPickupEntry } from '@/features/display/pickup-queue-service'
import { db } from '@/services'

// Suppress console output from checkout slip print
vi.spyOn(console, 'group').mockImplementation(() => {})
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'groupEnd').mockImplementation(() => {})

const BASE_INPUT = {
  session_id: 'sess-1',
  checkin_id: 'checkin-1',
  child_name: 'Emma Johnson',
  room: 'Kindergarten',
  pickup_code: '4821',
}

describe('pickup queue service', () => {
  beforeEach(() => {
    // Clear localStorage so each test starts with a fresh queue.
    // getActivePickupQueue reads localStorage first, so accumulated entries from
    // prior tests would otherwise bleed through.
    localStorage.removeItem('gather_pickup_queue')
  })

  it('creates a pickup queue entry with correct fields', async () => {
    const entry = await addToPickupQueue(BASE_INPUT)
    expect(entry.id).toBeTruthy()
    expect(entry.session_id).toBe('sess-1')
    expect(entry.checkin_id).toBe('checkin-1')
    expect(entry.child_name).toBe('Emma Johnson')
    expect(entry.room).toBe('Kindergarten')
    expect(entry.pickup_code).toBe('4821')
    expect(entry.is_cleared).toBe(false)
    expect(entry.cleared_at).toBeUndefined()
    expect(entry.requested_at).toBeTruthy()
  })

  it('getActivePickupQueue returns only non-cleared entries', async () => {
    const e1 = await addToPickupQueue({ ...BASE_INPUT, checkin_id: 'c-ncq-1', child_name: 'Alice' })
    const e2 = await addToPickupQueue({ ...BASE_INPUT, checkin_id: 'c-ncq-2', child_name: 'Bob' })
    await clearPickupEntry(e1.id)

    const queue = await getActivePickupQueue()
    const ids = queue.map(e => e.id)
    expect(ids).not.toContain(e1.id)
    expect(ids).toContain(e2.id)
  })

  it('getActivePickupQueue sorts oldest first', async () => {
    const e1 = await addToPickupQueue({ ...BASE_INPUT, checkin_id: 'c-sort-1', child_name: 'First' })
    await new Promise(r => setTimeout(r, 5))
    const e2 = await addToPickupQueue({ ...BASE_INPUT, checkin_id: 'c-sort-2', child_name: 'Second' })

    const queue = await getActivePickupQueue()
    const inQueue = queue.filter(e => e.id === e1.id || e.id === e2.id)
    expect(inQueue[0].id).toBe(e1.id)
    expect(inQueue[1].id).toBe(e2.id)
  })

  it('clearPickupEntry marks entry as cleared and removes it from active queue', async () => {
    const entry = await addToPickupQueue({ ...BASE_INPUT, checkin_id: 'c-clear-1', child_name: 'ClearMe' })

    const cleared = await clearPickupEntry(entry.id)
    expect(cleared.is_cleared).toBe(true)
    expect(cleared.cleared_at).toBeTruthy()

    const queue = await getActivePickupQueue()
    expect(queue.find(e => e.id === entry.id)).toBeUndefined()
  })

  it('getActivePickupQueue filters by sessionId when provided', async () => {
    const e1 = await addToPickupQueue({ ...BASE_INPUT, session_id: 'sess-A', checkin_id: 'c-filt-1' })
    const e2 = await addToPickupQueue({ ...BASE_INPUT, session_id: 'sess-B', checkin_id: 'c-filt-2' })

    const queueA = await getActivePickupQueue('sess-A')
    const ids = queueA.map(e => e.id)
    expect(ids).toContain(e1.id)
    expect(ids).not.toContain(e2.id)
  })

  it('addToPickupQueue entry appears in active queue', async () => {
    const entry = await addToPickupQueue({ ...BASE_INPUT, checkin_id: 'c-appear-1', child_name: 'Appears' })
    const queue = await getActivePickupQueue()
    expect(queue.find(e => e.id === entry.id)).toBeTruthy()
  })

  it('direct db.createPickupQueueEntry + clearPickupQueueEntry round-trip', async () => {
    const entry = await db.createPickupQueueEntry({
      session_id: 'sess-rt',
      checkin_id: 'c-rt-1',
      child_name: 'RoundTrip',
      room: 'Nursery',
      pickup_code: '9999',
      requested_at: new Date().toISOString(),
    })
    expect(entry.is_cleared).toBe(false)

    const cleared = await db.clearPickupQueueEntry(entry.id)
    expect(cleared.is_cleared).toBe(true)

    const queue = await db.getPickupQueue()
    expect(queue.find(e => e.id === entry.id)).toBeUndefined()
  })
})
