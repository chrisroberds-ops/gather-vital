import { db } from '@/services'
import { displayName } from '@/shared/utils/format'
import type { Person, Household, HouseholdMember, HouseholdMemberRole } from '@/shared/types'

export { displayName }

export async function getPeople(): Promise<Person[]> {
  return db.getPeople()
}

export async function getActivePeople(): Promise<Person[]> {
  const all = await db.getPeople()
  return all.filter(p => p.is_active)
}

export async function getPerson(id: string): Promise<Person | null> {
  return db.getPerson(id)
}

export async function searchPeople(query: string): Promise<Person[]> {
  return db.searchPeople(query)
}

export async function createPerson(
  data: Omit<Person, 'id' | 'created_at' | 'updated_at'>
): Promise<Person> {
  return db.createPerson(data)
}

export async function updatePerson(id: string, data: Partial<Omit<Person, 'id' | 'created_at'>>): Promise<Person> {
  return db.updatePerson(id, data)
}

export async function deactivatePerson(id: string): Promise<Person> {
  return db.updatePerson(id, { is_active: false })
}

export async function reactivatePerson(id: string): Promise<Person> {
  return db.updatePerson(id, { is_active: true })
}

export async function archivePerson(id: string): Promise<Person> {
  return db.updatePerson(id, { is_active: false, is_archived: true })
}

export async function unarchivePerson(id: string): Promise<Person> {
  return db.updatePerson(id, { is_active: true, is_archived: false })
}

// ── Households ────────────────────────────────────────────────────────────────

export interface PersonWithHouseholds {
  person: Person
  households: Array<{ household: Household; memberRecord: HouseholdMember }>
}

export async function getPersonWithHouseholds(personId: string): Promise<PersonWithHouseholds | null> {
  const person = await db.getPerson(personId)
  if (!person) return null

  const households = await db.getPersonHouseholds(personId)
  const allMembers = await Promise.all(
    households.map(h => db.getHouseholdMembers(h.id))
  )

  const householdsWithRole = households.map((household, idx) => {
    const memberRecord = allMembers[idx].find(m => m.person_id === personId)!
    return { household, memberRecord }
  })

  return { person, households: householdsWithRole }
}

export async function getHouseholdWithMembers(householdId: string) {
  const household = await db.getHousehold(householdId)
  if (!household) return null

  const members = await db.getHouseholdMembers(householdId)
  const people = await Promise.all(members.map(m => db.getPerson(m.person_id)))

  return {
    household,
    members: members.map((m, i) => ({ member: m, person: people[i]! })).filter(x => x.person),
  }
}

export async function linkPersonToHousehold(
  personId: string,
  householdId: string,
  role: HouseholdMemberRole
): Promise<HouseholdMember> {
  return db.addHouseholdMember({ household_id: householdId, person_id: personId, role })
}

export async function unlinkPersonFromHousehold(personId: string, householdId: string): Promise<void> {
  return db.removeHouseholdMember(householdId, personId)
}

export async function createHousehold(data: Omit<Household, 'id'>): Promise<Household> {
  return db.createHousehold(data)
}

export async function getHouseholds(): Promise<Household[]> {
  return db.getHouseholds()
}

export async function searchHouseholds(query: string): Promise<Household[]> {
  const all = await db.getHouseholds()
  const q = query.toLowerCase().trim()
  if (!q) return all
  return all.filter(h =>
    h.name.toLowerCase().includes(q) ||
    h.city?.toLowerCase().includes(q) ||
    h.address_line_1?.toLowerCase().includes(q)
  )
}
