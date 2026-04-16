import { describe, it, expect } from 'vitest'
import { db as inMemoryDb } from '@/services'
import { displayName } from '@/shared/utils/format'
import type { Person } from '@/shared/types'

// Minimal person fixture for creation tests
function personFixture(overrides?: Partial<Omit<Person, 'id' | 'created_at' | 'updated_at'>>): Omit<Person, 'id' | 'created_at' | 'updated_at'> {
  return {
    first_name: 'Jane',
    last_name: 'Doe',
    preferred_name: undefined,
    phone: '+15550001234',
    email: 'jane@example.com',
    is_child: false,
    is_active: true,
    ...overrides,
  }
}

describe('In-memory database — people', () => {
  it('getPeople returns the seeded test data', async () => {
    const people = await inMemoryDb.getPeople()
    // We generated 225 people (150 adults + 75 children)
    expect(people.length).toBeGreaterThanOrEqual(225)
  })

  it('getPerson returns a person by ID', async () => {
    const people = await inMemoryDb.getPeople()
    const first = people[0]
    const found = await inMemoryDb.getPerson(first.id)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(first.id)
  })

  it('getPerson returns null for unknown ID', async () => {
    const result = await inMemoryDb.getPerson('nonexistent-id-xyz')
    expect(result).toBeNull()
  })

  it('getPersonByPhone finds a person by normalized phone', async () => {
    const people = await inMemoryDb.getPeople()
    const target = people[5]
    const found = await inMemoryDb.getPersonByPhone(target.phone)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(target.id)
  })

  it('createPerson adds a record and returns it with an ID', async () => {
    const before = (await inMemoryDb.getPeople()).length
    const created = await inMemoryDb.createPerson(personFixture())
    const after = (await inMemoryDb.getPeople()).length

    expect(created.id).toBeTruthy()
    expect(created.first_name).toBe('Jane')
    expect(after).toBe(before + 1)
  })

  it('updatePerson modifies the correct fields', async () => {
    const people = await inMemoryDb.getPeople()
    const target = people[10]
    const updated = await inMemoryDb.updatePerson(target.id, { first_name: 'UpdatedName' })
    expect(updated.first_name).toBe('UpdatedName')
    expect(updated.last_name).toBe(target.last_name) // unchanged
  })

  it('deletePerson soft-deletes (sets is_active = false)', async () => {
    const people = await inMemoryDb.getPeople()
    const target = people.find(p => p.is_active)!
    await inMemoryDb.deletePerson(target.id)
    const reloaded = await inMemoryDb.getPerson(target.id)
    expect(reloaded!.is_active).toBe(false)
  })

  it('searchPeople finds by first name (case-insensitive)', async () => {
    const people = await inMemoryDb.getPeople()
    const target = people[0]
    const results = await inMemoryDb.searchPeople(target.first_name.toLowerCase())
    expect(results.some(p => p.id === target.id)).toBe(true)
  })

  it('searchPeople finds by partial last name', async () => {
    const people = await inMemoryDb.getPeople()
    const target = people[2]
    const partial = target.last_name.slice(0, 4)
    const results = await inMemoryDb.searchPeople(partial)
    expect(results.some(p => p.id === target.id)).toBe(true)
  })

  it('searchPeople returns all people for empty query', async () => {
    const all = await inMemoryDb.getPeople()
    const results = await inMemoryDb.searchPeople('')
    expect(results.length).toBe(all.length)
  })
})

describe('displayName utility', () => {
  it('returns preferred name + last name when preferred_name is set', () => {
    const p = { first_name: 'Robert', last_name: 'Smith', preferred_name: 'Bob' } as Person
    expect(displayName(p)).toBe('Bob Smith')
  })

  it('returns first_name + last_name when preferred_name is not set', () => {
    const p = { first_name: 'Robert', last_name: 'Smith', preferred_name: undefined } as Person
    expect(displayName(p)).toBe('Robert Smith')
  })
})

describe('In-memory database — households', () => {
  it('getHouseholds returns the seeded households', async () => {
    const households = await inMemoryDb.getHouseholds()
    expect(households.length).toBeGreaterThan(0)
  })

  it('getHouseholdMembers returns members for a household', async () => {
    const households = await inMemoryDb.getHouseholds()
    const hh = households[0]
    const members = await inMemoryDb.getHouseholdMembers(hh.id)
    expect(members.length).toBeGreaterThan(0)
    members.forEach(m => expect(m.household_id).toBe(hh.id))
  })

  it('getPersonHouseholds returns the households a person belongs to', async () => {
    const members = await inMemoryDb.getHouseholdMembers(
      (await inMemoryDb.getHouseholds())[0].id
    )
    const personId = members[0].person_id
    const personHouseholds = await inMemoryDb.getPersonHouseholds(personId)
    expect(personHouseholds.length).toBeGreaterThan(0)
  })

  it('addHouseholdMember and removeHouseholdMember work correctly', async () => {
    const people = await inMemoryDb.getPeople()
    const households = await inMemoryDb.getHouseholds()
    const person = people[people.length - 1]
    const household = households[0]

    // Remove any existing link first to avoid duplicates
    await inMemoryDb.removeHouseholdMember(household.id, person.id)

    await inMemoryDb.addHouseholdMember({
      household_id: household.id,
      person_id: person.id,
      role: 'adult',
    })

    const members = await inMemoryDb.getHouseholdMembers(household.id)
    expect(members.some(m => m.person_id === person.id)).toBe(true)

    await inMemoryDb.removeHouseholdMember(household.id, person.id)
    const afterRemove = await inMemoryDb.getHouseholdMembers(household.id)
    expect(afterRemove.some(m => m.person_id === person.id)).toBe(false)
  })
})

describe('In-memory database — child pickups', () => {
  it('getChildPickups returns pickups for a child', async () => {
    const pickups = await inMemoryDb.getChildPickups(
      (await inMemoryDb.getPeople()).find(p => p.is_child)!.id
    )
    // Some children have pickups, some may not — just verify the query works
    expect(Array.isArray(pickups)).toBe(true)
  })
})

describe('In-memory database — checkin flags', () => {
  it('getCheckinFlags returns all seeded flags', async () => {
    const flags = await inMemoryDb.getCheckinFlags()
    // We generated 9 flags
    expect(flags.length).toBeGreaterThanOrEqual(9)
  })

  it('getCheckinFlagsForPerson returns only active flags for that person', async () => {
    const flags = await inMemoryDb.getCheckinFlags()
    const targetFlag = flags[0]
    const personFlags = await inMemoryDb.getCheckinFlagsForPerson(targetFlag.person_id)
    expect(personFlags.every(f => f.person_id === targetFlag.person_id)).toBe(true)
    expect(personFlags.every(f => f.is_active)).toBe(true)
  })
})

describe('In-memory database — groups', () => {
  it('getGroups (no hidden) returns only visible groups', async () => {
    const visible = await inMemoryDb.getGroups(false)
    expect(visible.every(g => g.is_visible)).toBe(true)
  })

  it('getGroups (include hidden) returns all active groups', async () => {
    const all = await inMemoryDb.getGroups(true)
    const visible = await inMemoryDb.getGroups(false)
    expect(all.length).toBeGreaterThanOrEqual(visible.length)
  })
})

describe('In-memory database — giving records', () => {
  it('getGivingRecords returns all records', async () => {
    const all = await inMemoryDb.getGivingRecords()
    expect(all.length).toBeGreaterThan(100)
  })

  it('getGivingRecords filtered by personId returns only that person\'s records', async () => {
    const all = await inMemoryDb.getGivingRecords()
    const targetId = all[0].person_id
    const filtered = await inMemoryDb.getGivingRecords(targetId)
    expect(filtered.every(r => r.person_id === targetId)).toBe(true)
  })
})
