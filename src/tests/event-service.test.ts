import { describe, it, expect } from 'vitest'
import {
  getUpcomingEvents,
  getPastEvents,
  createEvent,
  updateEvent,
  getEnrichedRegistrations,
  registerForEvent,
  cancelRegistration,
  formatCost,
} from '@/features/events/event-service'
import { db } from '@/services'

const FUTURE = '2099-12-25'
const PAST = '2000-01-01'

async function makeEvent(overrides: Partial<Parameters<typeof createEvent>[0]> = {}) {
  return createEvent({
    name: 'Test Event',
    event_date: FUTURE,
    registration_required: true,
    has_cost: false,
    is_active: true,
    ...overrides,
  })
}

async function makePerson(name = 'Alice Smith') {
  const [first, ...rest] = name.split(' ')
  return db.createPerson({ first_name: first, last_name: rest.join(' ') || 'User', is_active: true, is_child: false })
}

// ── Events CRUD ───────────────────────────────────────────────────────────────

describe('Events CRUD', () => {
  it('creates and retrieves an event', async () => {
    const e = await makeEvent({ name: 'Summer Cookout' })
    expect(e.name).toBe('Summer Cookout')
    expect(e.is_active).toBe(true)
  })

  it('getUpcomingEvents returns only future active events', async () => {
    await makeEvent({ name: 'Future Event', event_date: FUTURE })
    await makeEvent({ name: 'Past Event', event_date: PAST })
    const upcoming = await getUpcomingEvents()
    expect(upcoming.some(e => e.name === 'Future Event')).toBe(true)
    expect(upcoming.some(e => e.name === 'Past Event')).toBe(false)
  })

  it('getUpcomingEvents excludes inactive events', async () => {
    await makeEvent({ name: 'InactiveUpcoming', event_date: FUTURE, is_active: false })
    const upcoming = await getUpcomingEvents()
    expect(upcoming.some(e => e.name === 'InactiveUpcoming')).toBe(false)
  })

  it('getPastEvents returns only past active events', async () => {
    await makeEvent({ name: 'OldEvent', event_date: PAST })
    await makeEvent({ name: 'NewEvent', event_date: FUTURE })
    const past = await getPastEvents()
    expect(past.some(e => e.name === 'OldEvent')).toBe(true)
    expect(past.some(e => e.name === 'NewEvent')).toBe(false)
  })

  it('getUpcomingEvents results are sorted ascending by date', async () => {
    const e1 = await makeEvent({ name: 'Later', event_date: '2099-06-15' })
    const e2 = await makeEvent({ name: 'Earlier', event_date: '2099-01-10' })
    const upcoming = await getUpcomingEvents()
    const idx1 = upcoming.findIndex(e => e.id === e1.id)
    const idx2 = upcoming.findIndex(e => e.id === e2.id)
    expect(idx2).toBeLessThan(idx1) // Earlier comes first
  })

  it('updates an event', async () => {
    const e = await makeEvent({ name: 'Old Name' })
    const updated = await updateEvent(e.id, { name: 'New Name', location: 'Fellowship Hall' })
    expect(updated.name).toBe('New Name')
    expect(updated.location).toBe('Fellowship Hall')
  })
})

// ── Registrations ─────────────────────────────────────────────────────────────

describe('registerForEvent', () => {
  it('registers a person and returns enriched registration', async () => {
    const e = await makeEvent()
    const p = await makePerson('Bob Jones')
    const result = await registerForEvent(e.id, p.id)
    expect(result.waitlisted).toBe(false)
    expect(result.alreadyRegistered).toBe(false)
    expect(result.registration.status).toBe('registered')

    const regs = await getEnrichedRegistrations(e.id)
    expect(regs).toHaveLength(1)
    expect(regs[0].person?.first_name).toBe('Bob')
  })

  it('waitlists when event is at capacity', async () => {
    const e = await makeEvent({ max_capacity: 1 })
    const p1 = await makePerson('Carol Davis')
    const p2 = await makePerson('Dan Evans')
    await registerForEvent(e.id, p1.id)
    const result = await registerForEvent(e.id, p2.id)
    expect(result.waitlisted).toBe(true)
    expect(result.registration.status).toBe('waitlisted')
  })

  it('detects duplicate registration', async () => {
    const e = await makeEvent()
    const p = await makePerson('Eve Frank')
    await registerForEvent(e.id, p.id)
    const result = await registerForEvent(e.id, p.id)
    expect(result.alreadyRegistered).toBe(true)
  })

  it('sets payment_status to pending when event has cost', async () => {
    const e = await makeEvent({ has_cost: true, cost_amount: 20 })
    const p = await makePerson('Frank Green')
    const result = await registerForEvent(e.id, p.id)
    expect(result.registration.payment_status).toBe('pending')
  })

  it('sets payment_status to not_required for free event', async () => {
    const e = await makeEvent({ has_cost: false })
    const p = await makePerson('Grace Hill')
    const result = await registerForEvent(e.id, p.id)
    expect(result.registration.payment_status).toBe('not_required')
  })
})

describe('cancelRegistration', () => {
  it('cancels a registration and excludes it from enriched list', async () => {
    const e = await makeEvent()
    const p = await makePerson('Hank Ivy')
    const { registration } = await registerForEvent(e.id, p.id)
    await cancelRegistration(registration.id, e.id)
    const regs = await getEnrichedRegistrations(e.id)
    expect(regs.find(r => r.registration.id === registration.id)).toBeUndefined()
  })

  it('promotes the first waitlisted registrant when a registered person cancels', async () => {
    const e = await makeEvent({ max_capacity: 1 })
    const p1 = await makePerson('Ivan Jack')
    const p2 = await makePerson('Julia King')
    const { registration: reg1 } = await registerForEvent(e.id, p1.id) // fills capacity
    await registerForEvent(e.id, p2.id) // waitlisted

    await cancelRegistration(reg1.id, e.id) // frees a slot

    const allRegs = await db.getEventRegistrations(e.id)
    expect(allRegs.find(r => r.person_id === p2.id)?.status).toBe('registered')
  })

  it('does NOT promote when event has no capacity limit', async () => {
    const e = await makeEvent({ max_capacity: undefined })
    const p1 = await makePerson('Kevin Lane')
    const p2 = await makePerson('Laura Moon')
    const { registration: reg1 } = await registerForEvent(e.id, p1.id)
    // Manually waitlist p2 (would normally not happen in unlimited events, but test the guard)
    await db.createEventRegistration({
      event_id: e.id,
      person_id: p2.id,
      status: 'waitlisted',
      payment_status: 'not_required',
      registered_at: new Date().toISOString(),
    })
    await cancelRegistration(reg1.id, e.id)
    const allRegs = await db.getEventRegistrations(e.id)
    expect(allRegs.find(r => r.person_id === p2.id)?.status).toBe('waitlisted')
  })

  it('promotes in registration order when multiple are waitlisted', async () => {
    const e = await makeEvent({ max_capacity: 1 })
    const p1 = await makePerson('Mike Nash')
    const p2 = await makePerson('Nina Oak')
    const p3 = await makePerson('Oscar Pine')
    const { registration: reg1 } = await registerForEvent(e.id, p1.id)
    await registerForEvent(e.id, p2.id) // waitlisted first
    await registerForEvent(e.id, p3.id) // waitlisted second

    await cancelRegistration(reg1.id, e.id)
    const allRegs = await db.getEventRegistrations(e.id)
    expect(allRegs.find(r => r.person_id === p2.id)?.status).toBe('registered')
    expect(allRegs.find(r => r.person_id === p3.id)?.status).toBe('waitlisted')
  })
})

// ── formatCost ────────────────────────────────────────────────────────────────

describe('formatCost', () => {
  it('returns Free for no-cost events', async () => {
    const e = await makeEvent({ has_cost: false })
    expect(formatCost(e)).toBe('Free')
  })

  it('formats dollar amount', async () => {
    const e = await makeEvent({ has_cost: true, cost_amount: 15 })
    expect(formatCost(e)).toBe('$15.00')
  })

  it('uses cost_description when no amount', async () => {
    const e = await makeEvent({ has_cost: true, cost_description: 'Suggested donation' })
    expect(formatCost(e)).toBe('Suggested donation')
  })
})
