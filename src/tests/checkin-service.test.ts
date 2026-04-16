import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  openSession,
  closeSession,
  getOpenSession,
  lookupParentByPhone,
  performCheckin,
  performCheckout,
  lookupByPickupCode,
  getActiveFlags,
  registerNewFamily,
  generatePickupCode,
} from '@/features/checkin/checkin-service'
import { db } from '@/services'

// Print service console output is fine in tests
vi.spyOn(console, 'group').mockImplementation(() => {})
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'groupEnd').mockImplementation(() => {})

describe('generatePickupCode', () => {
  it('produces a 4-digit string', () => {
    for (let i = 0; i < 20; i++) {
      const code = generatePickupCode()
      expect(code).toMatch(/^\d{4}$/)
      expect(Number(code)).toBeGreaterThanOrEqual(1000)
      expect(Number(code)).toBeLessThanOrEqual(9999)
    }
  })
})

describe('Session management', () => {
  it('creates and retrieves an open session', async () => {
    const session = await openSession('Test Session', '2026-04-07', '10:30 AM', 'staff-1')
    expect(session.status).toBe('open')
    expect(session.id).toBeTruthy()

    const found = await getOpenSession()
    expect(found?.id).toBe(session.id)
  })

  it('closes a session', async () => {
    const session = await openSession('Closable Session', '2026-04-07', '9:00 AM', 'staff-1')
    const closed = await closeSession(session.id)
    expect(closed.status).toBe('closed')
  })
})

describe('lookupParentByPhone', () => {
  let sessionId: string

  beforeEach(async () => {
    // Open a fresh session for each test (reuse if open already)
    const existing = await getOpenSession()
    if (existing) {
      sessionId = existing.id
    } else {
      const s = await openSession('Lookup Test', '2026-04-07', '10:30 AM', 'staff-1')
      sessionId = s.id
    }
  })

  it('returns null for an unknown phone number', async () => {
    const result = await lookupParentByPhone('+19999999999', sessionId)
    expect(result).toBeNull()
  })

  it('returns parent and children for a known parent', async () => {
    // Find a person who is an authorized pickup (has child_pickups entries)
    const childPickups = await db.getPickupsByHousehold(
      (await db.getHouseholds())[0].id
    )
    if (childPickups.length === 0) return // no test data, skip

    const authorizedPersonId = childPickups[0].authorized_person_id
    const parent = await db.getPerson(authorizedPersonId)
    if (!parent) return

    const result = await lookupParentByPhone(parent.phone, sessionId)
    if (result) {
      expect(result.parent.id).toBe(parent.id)
      expect(result.children.length).toBeGreaterThan(0)
      result.children.forEach(c => {
        expect(c.child.is_child).toBe(true)
        expect(c.pickupCode).toBeTruthy()
      })
    }
  })
})

describe('performCheckin and performCheckout', () => {
  let sessionId: string

  beforeEach(async () => {
    const existing = await getOpenSession()
    if (existing) {
      sessionId = existing.id
    } else {
      const s = await openSession('Checkin Test', '2026-04-07', '10:30 AM', 'staff-1')
      sessionId = s.id
    }
  })

  it('creates a checkin record', async () => {
    const children = (await db.getPeople()).filter(p => p.is_child && p.is_active)
    if (children.length === 0) return

    const child = children[0]
    const households = await db.getPersonHouseholds(child.id)
    if (households.length === 0) return

    const checkin = await performCheckin({
      sessionId,
      childId: child.id,
      parentId: 'parent-test-1',
      householdId: households[0].id,
      pickupCode: '1234',
      kioskId: 'kiosk-test',
    })

    expect(checkin.child_id).toBe(child.id)
    expect(checkin.status).toBe('checked_in')
    expect(checkin.pickup_code).toBe('1234')
  })

  it('prevents double check-in — returns existing record', async () => {
    const children = (await db.getPeople()).filter(p => p.is_child && p.is_active)
    if (children.length === 0) return

    const child = children[children.length - 1] // use last child to avoid collision with other tests
    const households = await db.getPersonHouseholds(child.id)
    if (households.length === 0) return

    const first = await performCheckin({
      sessionId,
      childId: child.id,
      parentId: 'parent-double',
      householdId: households[0].id,
      pickupCode: '5678',
      kioskId: 'kiosk-test',
    })

    const second = await performCheckin({
      sessionId,
      childId: child.id,
      parentId: 'parent-double',
      householdId: households[0].id,
      pickupCode: '9999', // different code but same child
      kioskId: 'kiosk-test',
    })

    expect(second.id).toBe(first.id) // same record returned
  })

  it('checks out a child and updates status', async () => {
    const existing = await db.getCheckins(sessionId)
    const checkedIn = existing.find(c => c.status === 'checked_in')
    if (!checkedIn) return

    const codeMatch = await lookupByPickupCode(checkedIn.pickup_code, sessionId)
    expect(codeMatch).not.toBeNull()

    const checkedOut = await performCheckout(checkedIn.id, 'staff-checkout-1')
    expect(checkedOut.status).toBe('checked_out')
    expect(checkedOut.checked_out_by).toBe('staff-checkout-1')

    const notFound = await lookupByPickupCode(checkedIn.pickup_code, sessionId)
    expect(notFound).toBeNull() // code no longer active
  })
})

describe('getActiveFlags', () => {
  it('returns only active flags for a person', async () => {
    const flags = await db.getCheckinFlags()
    const personWithFlag = flags.find(f => f.is_active)
    if (!personWithFlag) return

    const active = await getActiveFlags(personWithFlag.person_id)
    expect(active.length).toBeGreaterThan(0)
    active.forEach(f => expect(f.is_active).toBe(true))
  })

  it('returns empty array for person with no flags', async () => {
    const active = await getActiveFlags('no-flags-person-id')
    expect(active).toEqual([])
  })
})

describe('registerNewFamily', () => {
  it('creates parent, household, child, and pickup records', async () => {
    const result = await registerNewFamily({
      parentFirstName: 'Test',
      parentLastName: 'Parent',
      parentPhone: '+15550001111',
      parentEmail: 'test@example.com',
      children: [
        { firstName: 'Test', lastName: 'Child', grade: '3rd', dateOfBirth: '2018-06-01', allergies: 'None' },
      ],
    })

    expect(result.parent.first_name).toBe('Test')
    expect(result.parent.phone).toBe('+15550001111')
    expect(result.household.name).toBe('The Parent Family')
    expect(result.children).toHaveLength(1)
    expect(result.children[0].is_child).toBe(true)
    expect(result.children[0].grade).toBe('3rd')

    // Verify child pickup was created
    const pickups = await db.getChildPickups(result.children[0].id)
    expect(pickups.length).toBeGreaterThan(0)
    expect(pickups[0].authorized_person_id).toBe(result.parent.id)
  })

  it('creates multiple children in one registration', async () => {
    const result = await registerNewFamily({
      parentFirstName: 'Multi',
      parentLastName: 'Child',
      parentPhone: '+15550002222',
      children: [
        { firstName: 'Alice', lastName: 'Child', grade: 'K', dateOfBirth: '', allergies: '' },
        { firstName: 'Bob', lastName: 'Child', grade: '2nd', dateOfBirth: '', allergies: 'Peanuts' },
      ],
    })

    expect(result.children).toHaveLength(2)
    const bob = result.children.find(c => c.first_name === 'Bob')
    expect(bob?.allergies).toBe('Peanuts')
  })
})
