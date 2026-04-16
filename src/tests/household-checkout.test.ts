/**
 * Tests for household grouped checkout logic.
 *
 * Covers:
 *   - getHouseholdCheckoutGroup with single child (no additional siblings)
 *   - Multiple siblings in household, all authorized
 *   - authorized_children filtering — authorized vs unauthorized display
 *   - pickup_notes surfaced correctly
 *   - Already-checked-out children excluded
 *   - updateHouseholdMember persistence (authorized_children + pickup_notes)
 */

import { describe, it, expect } from 'vitest'
import { db } from '@/services'
import { getHouseholdCheckoutGroup } from '@/features/checkin/checkin-service'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeAdult(firstName = 'Parent', lastName = 'Smith') {
  return db.createPerson({ first_name: firstName, last_name: lastName, is_active: true, is_child: false })
}

async function makeChild(firstName: string, lastName = 'Smith') {
  return db.createPerson({ first_name: firstName, last_name: lastName, is_active: true, is_child: true })
}

async function makeHousehold(name: string) {
  return db.createHousehold({ name })
}

async function makeSession() {
  return db.createCheckinSession({
    name: 'Sunday AM',
    date: '2026-04-16',
    service_time: '9:00 AM',
    status: 'open',
    created_by: 'staff-1',
  })
}

async function checkinChild(childId: string, householdId: string, pickupCode: string, sessionId: string) {
  return db.createCheckin({
    session_id: sessionId,
    child_id: childId,
    checked_in_by: 'adult-1',
    household_id: householdId,
    pickup_code: pickupCode,
    kiosk_id: 'kiosk-1',
    checked_in_at: new Date().toISOString(),
    status: 'checked_in',
    label_printed: false,
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getHouseholdCheckoutGroup — single child', () => {
  it('returns empty additional when only one household child is checked in', async () => {
    const session = await makeSession()
    const adult = await makeAdult()
    const child = await makeChild('Emma')
    const hh = await makeHousehold('The Smith Family')

    await db.addHouseholdMember({ household_id: hh.id, person_id: adult.id, role: 'adult' })
    await db.addHouseholdMember({ household_id: hh.id, person_id: child.id, role: 'child' })
    await db.createChildPickup({
      child_id: child.id, household_id: hh.id,
      authorized_person_id: adult.id, relationship: 'adult',
      is_primary: true, pickup_code: '1111',
    })

    const checkin = await checkinChild(child.id, hh.id, '1111', session.id)
    const group = await getHouseholdCheckoutGroup(checkin, '1111', session.id)

    expect(group.primary.checkin.id).toBe(checkin.id)
    expect(group.primary.childName).toContain('Emma')
    expect(group.additional).toHaveLength(0)
    expect(group.pickupNotes).toBeUndefined()
  })
})

describe('getHouseholdCheckoutGroup — multiple siblings', () => {
  it('returns additional siblings who are checked in', async () => {
    const session = await makeSession()
    const adult = await makeAdult()
    const child1 = await makeChild('Emma')
    const child2 = await makeChild('Oliver')
    const hh = await makeHousehold('The Smith Family')

    await db.addHouseholdMember({ household_id: hh.id, person_id: adult.id, role: 'adult' })
    await db.addHouseholdMember({ household_id: hh.id, person_id: child1.id, role: 'child' })
    await db.addHouseholdMember({ household_id: hh.id, person_id: child2.id, role: 'child' })

    await db.createChildPickup({
      child_id: child1.id, household_id: hh.id,
      authorized_person_id: adult.id, relationship: 'adult',
      is_primary: true, pickup_code: '2222',
    })

    const checkin1 = await checkinChild(child1.id, hh.id, '2222', session.id)
    const checkin2 = await checkinChild(child2.id, hh.id, '2222', session.id)

    const group = await getHouseholdCheckoutGroup(checkin1, '2222', session.id)

    expect(group.primary.checkin.id).toBe(checkin1.id)
    expect(group.additional).toHaveLength(1)
    expect(group.additional[0].checkin.id).toBe(checkin2.id)
    expect(group.additional[0].childName).toContain('Oliver')
  })

  it('does not include siblings who are not checked in', async () => {
    const session = await makeSession()
    const adult = await makeAdult()
    const child1 = await makeChild('Emma')
    const child2 = await makeChild('Oliver')  // not checked in
    const hh = await makeHousehold('The Smith Family')

    await db.addHouseholdMember({ household_id: hh.id, person_id: adult.id, role: 'adult' })
    await db.addHouseholdMember({ household_id: hh.id, person_id: child1.id, role: 'child' })
    await db.addHouseholdMember({ household_id: hh.id, person_id: child2.id, role: 'child' })

    await db.createChildPickup({
      child_id: child1.id, household_id: hh.id,
      authorized_person_id: adult.id, relationship: 'adult',
      is_primary: true, pickup_code: '3333',
    })

    const checkin1 = await checkinChild(child1.id, hh.id, '3333', session.id)

    const group = await getHouseholdCheckoutGroup(checkin1, '3333', session.id)

    expect(group.additional).toHaveLength(0)
  })

  it('does not include siblings who are already checked out', async () => {
    const session = await makeSession()
    const adult = await makeAdult()
    const child1 = await makeChild('Emma')
    const child2 = await makeChild('Oliver')
    const hh = await makeHousehold('The Smith Family')

    await db.addHouseholdMember({ household_id: hh.id, person_id: adult.id, role: 'adult' })
    await db.addHouseholdMember({ household_id: hh.id, person_id: child1.id, role: 'child' })
    await db.addHouseholdMember({ household_id: hh.id, person_id: child2.id, role: 'child' })

    await db.createChildPickup({
      child_id: child1.id, household_id: hh.id,
      authorized_person_id: adult.id, relationship: 'adult',
      is_primary: true, pickup_code: '4444',
    })

    const checkin1 = await checkinChild(child1.id, hh.id, '4444', session.id)
    // child2 is checked in but already checked out
    const checkin2 = await checkinChild(child2.id, hh.id, '4444', session.id)
    await db.updateCheckin(checkin2.id, { status: 'checked_out', checked_out_at: new Date().toISOString(), checked_out_by: 'staff-1' })

    const group = await getHouseholdCheckoutGroup(checkin1, '4444', session.id)

    expect(group.additional).toHaveLength(0)
  })

  it('includes room in each child entry', async () => {
    const session = await makeSession()
    const adult = await makeAdult()
    const child1 = await makeChild('Emma')
    const child2 = await makeChild('Oliver')
    const hh = await makeHousehold('The Smith Family')

    // Give children grades so room is derivable
    await db.updatePerson(child1.id, { grade: '1st' })
    await db.updatePerson(child2.id, { grade: '3rd' })

    await db.addHouseholdMember({ household_id: hh.id, person_id: adult.id, role: 'adult' })
    await db.addHouseholdMember({ household_id: hh.id, person_id: child1.id, role: 'child' })
    await db.addHouseholdMember({ household_id: hh.id, person_id: child2.id, role: 'child' })

    await db.createChildPickup({
      child_id: child1.id, household_id: hh.id,
      authorized_person_id: adult.id, relationship: 'adult',
      is_primary: true, pickup_code: '5555',
    })

    const checkin1 = await checkinChild(child1.id, hh.id, '5555', session.id)
    await checkinChild(child2.id, hh.id, '5555', session.id)

    const group = await getHouseholdCheckoutGroup(checkin1, '5555', session.id)

    expect(group.primary.room).toBe('1st')
    expect(group.additional[0].room).toBe('3rd')
  })
})

describe('getHouseholdCheckoutGroup — authorized_children filtering', () => {
  it('marks all children as authorized when authorized_children is empty', async () => {
    const session = await makeSession()
    const adult = await makeAdult()
    const child1 = await makeChild('Emma')
    const child2 = await makeChild('Oliver')
    const hh = await makeHousehold('The Smith Family')

    await db.addHouseholdMember({ household_id: hh.id, person_id: adult.id, role: 'adult' })
    await db.addHouseholdMember({ household_id: hh.id, person_id: child1.id, role: 'child' })
    await db.addHouseholdMember({ household_id: hh.id, person_id: child2.id, role: 'child' })

    await db.createChildPickup({
      child_id: child1.id, household_id: hh.id,
      authorized_person_id: adult.id, relationship: 'adult',
      is_primary: true, pickup_code: '6666',
    })

    const checkin1 = await checkinChild(child1.id, hh.id, '6666', session.id)
    await checkinChild(child2.id, hh.id, '6666', session.id)

    const group = await getHouseholdCheckoutGroup(checkin1, '6666', session.id)

    expect(group.additional[0].authorized).toBe(true)
  })

  it('marks child as authorized when their ID is in authorized_children', async () => {
    const session = await makeSession()
    const adult = await makeAdult()
    const child1 = await makeChild('Emma')
    const child2 = await makeChild('Oliver')
    const hh = await makeHousehold('The Smith Family')

    const adultMember = await db.addHouseholdMember({ household_id: hh.id, person_id: adult.id, role: 'adult' })
    await db.addHouseholdMember({ household_id: hh.id, person_id: child1.id, role: 'child' })
    await db.addHouseholdMember({ household_id: hh.id, person_id: child2.id, role: 'child' })

    // Adult is restricted to child1 and child2 (both authorized)
    await db.updateHouseholdMember(hh.id, adult.id, { authorized_children: [child1.id, child2.id] })

    await db.createChildPickup({
      child_id: child1.id, household_id: hh.id,
      authorized_person_id: adult.id, relationship: 'adult',
      is_primary: true, pickup_code: '7777',
    })

    const checkin1 = await checkinChild(child1.id, hh.id, '7777', session.id)
    await checkinChild(child2.id, hh.id, '7777', session.id)

    const group = await getHouseholdCheckoutGroup(checkin1, '7777', session.id)

    expect(group.additional).toHaveLength(1)
    expect(group.additional[0].authorized).toBe(true)

    // Suppress unused variable warning
    void adultMember
  })

  it('marks child as NOT authorized when their ID is absent from a non-empty authorized_children list', async () => {
    const session = await makeSession()
    const adult = await makeAdult()
    const child1 = await makeChild('Emma')
    const child2 = await makeChild('Oliver')  // NOT in authorized list
    const hh = await makeHousehold('The Smith Family')

    await db.addHouseholdMember({ household_id: hh.id, person_id: adult.id, role: 'adult' })
    await db.addHouseholdMember({ household_id: hh.id, person_id: child1.id, role: 'child' })
    await db.addHouseholdMember({ household_id: hh.id, person_id: child2.id, role: 'child' })

    // Adult is only authorized for child1
    await db.updateHouseholdMember(hh.id, adult.id, { authorized_children: [child1.id] })

    await db.createChildPickup({
      child_id: child1.id, household_id: hh.id,
      authorized_person_id: adult.id, relationship: 'adult',
      is_primary: true, pickup_code: '8888',
    })

    const checkin1 = await checkinChild(child1.id, hh.id, '8888', session.id)
    await checkinChild(child2.id, hh.id, '8888', session.id)

    const group = await getHouseholdCheckoutGroup(checkin1, '8888', session.id)

    expect(group.additional).toHaveLength(1)
    expect(group.additional[0].childName).toContain('Oliver')
    expect(group.additional[0].authorized).toBe(false)
  })

  it('returns pickup_notes from the adult HouseholdMember record', async () => {
    const session = await makeSession()
    const adult = await makeAdult()
    const child1 = await makeChild('Emma')
    const hh = await makeHousehold('The Smith Family')

    await db.addHouseholdMember({ household_id: hh.id, person_id: adult.id, role: 'adult' })
    await db.addHouseholdMember({ household_id: hh.id, person_id: child1.id, role: 'child' })
    await db.updateHouseholdMember(hh.id, adult.id, { pickup_notes: 'Only authorized for Emma — custody agreement on file.' })

    await db.createChildPickup({
      child_id: child1.id, household_id: hh.id,
      authorized_person_id: adult.id, relationship: 'adult',
      is_primary: true, pickup_code: '9999',
    })

    const checkin1 = await checkinChild(child1.id, hh.id, '9999', session.id)
    const group = await getHouseholdCheckoutGroup(checkin1, '9999', session.id)

    expect(group.pickupNotes).toBe('Only authorized for Emma — custody agreement on file.')
  })
})

describe('updateHouseholdMember', () => {
  it('persists authorized_children and pickup_notes', async () => {
    const adult = await makeAdult()
    const child = await makeChild('Emma')
    const hh = await makeHousehold('The Test Family')

    await db.addHouseholdMember({ household_id: hh.id, person_id: adult.id, role: 'adult' })
    await db.addHouseholdMember({ household_id: hh.id, person_id: child.id, role: 'child' })

    await db.updateHouseholdMember(hh.id, adult.id, {
      authorized_children: [child.id],
      pickup_notes: 'Must show ID',
    })

    const members = await db.getHouseholdMembers(hh.id)
    const adultRecord = members.find(m => m.person_id === adult.id)!
    expect(adultRecord.authorized_children).toEqual([child.id])
    expect(adultRecord.pickup_notes).toBe('Must show ID')
  })

  it('clears authorized_children when set to empty array', async () => {
    const adult = await makeAdult()
    const child = await makeChild('Emma')
    const hh = await makeHousehold('The Test Family')

    await db.addHouseholdMember({ household_id: hh.id, person_id: adult.id, role: 'adult' })
    await db.addHouseholdMember({ household_id: hh.id, person_id: child.id, role: 'child' })

    await db.updateHouseholdMember(hh.id, adult.id, { authorized_children: [child.id] })
    await db.updateHouseholdMember(hh.id, adult.id, { authorized_children: [] })

    const members = await db.getHouseholdMembers(hh.id)
    const adultRecord = members.find(m => m.person_id === adult.id)!
    expect(adultRecord.authorized_children).toEqual([])
  })
})
