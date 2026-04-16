import { describe, it, expect, vi } from 'vitest'
import { checkinBus } from '@/services/checkin-event-bus'

describe('CheckinEventBus', () => {
  it('delivers events to all active subscribers', () => {
    const listener1 = vi.fn()
    const listener2 = vi.fn()

    const unsub1 = checkinBus.subscribe(listener1)
    const unsub2 = checkinBus.subscribe(listener2)

    checkinBus.emit('checkin_created', { checkin: { id: 'test-123' } })

    expect(listener1).toHaveBeenCalledTimes(1)
    expect(listener1.mock.calls[0][0]).toMatchObject({
      type: 'checkin_created',
      payload: { checkin: { id: 'test-123' } },
    })
    expect(listener2).toHaveBeenCalledTimes(1)

    unsub1()
    unsub2()
  })

  it('stops delivering after unsubscribe', () => {
    const listener = vi.fn()
    const unsub = checkinBus.subscribe(listener)

    checkinBus.emit('session_created', { session: { id: 'sess-1' } })
    expect(listener).toHaveBeenCalledTimes(1)

    unsub()
    checkinBus.emit('session_created', { session: { id: 'sess-2' } })
    expect(listener).toHaveBeenCalledTimes(1) // not called again
  })

  it('includes a timestamp on every event', () => {
    const listener = vi.fn()
    const unsub = checkinBus.subscribe(listener)

    checkinBus.emit('checkin_updated', { checkin: { id: 'upd-1' } })
    expect(listener.mock.calls[0][0].timestamp).toBeTruthy()

    unsub()
  })

  it('can have many independent subscribers at once', () => {
    const listeners = Array.from({ length: 5 }, () => vi.fn())
    const unsubs = listeners.map(l => checkinBus.subscribe(l))

    checkinBus.emit('session_updated', {})
    listeners.forEach(l => expect(l).toHaveBeenCalledTimes(1))

    unsubs.forEach(u => u())
  })
})
