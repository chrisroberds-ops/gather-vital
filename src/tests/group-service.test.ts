import { describe, it, expect } from 'vitest'
import {
  getAllGroups,
  getVisibleGroups,
  createGroup,
  updateGroup,
  getEnrichedMembers,
  addMember,
  removeMember,
  updateMemberStatus,
  signUpForGroup,
} from '@/features/groups/group-service'
import { db } from '@/services'

async function makeGroup(overrides: Partial<Parameters<typeof createGroup>[0]> = {}) {
  return createGroup({
    name: 'Test Group',
    group_type: 'small_group',
    is_open: true,
    is_visible: true,
    is_active: true,
    childcare_available: false,
    ...overrides,
  })
}

async function makePerson(name = 'Alice Smith') {
  const [first, ...rest] = name.split(' ')
  return db.createPerson({ first_name: first, last_name: rest.join(' ') || 'User', is_active: true, is_child: false })
}

// ── Groups CRUD ───────────────────────────────────────────────────────────────

describe('Groups CRUD', () => {
  it('creates and retrieves a group', async () => {
    const g = await makeGroup({ name: 'Young Adults' })
    expect(g.name).toBe('Young Adults')
    expect(g.group_type).toBe('small_group')
    expect(g.is_active).toBe(true)
  })

  it('getAllGroups returns all groups including hidden', async () => {
    await makeGroup({ name: 'HiddenGroup', is_visible: false })
    const groups = await getAllGroups()
    expect(groups.some(g => g.name === 'HiddenGroup')).toBe(true)
  })

  it('getVisibleGroups excludes hidden groups', async () => {
    await makeGroup({ name: 'InvisibleGroup', is_visible: false })
    const groups = await getVisibleGroups()
    expect(groups.some(g => g.name === 'InvisibleGroup')).toBe(false)
  })

  it('getVisibleGroups excludes inactive groups', async () => {
    await makeGroup({ name: 'InactiveVisible', is_visible: true, is_active: false })
    const groups = await getVisibleGroups()
    expect(groups.some(g => g.name === 'InactiveVisible')).toBe(false)
  })

  it('getVisibleGroups includes visible active groups', async () => {
    await makeGroup({ name: 'PublicGroup', is_visible: true, is_active: true })
    const groups = await getVisibleGroups()
    expect(groups.some(g => g.name === 'PublicGroup')).toBe(true)
  })

  it('updates a group', async () => {
    const g = await makeGroup({ name: 'Old Name' })
    const updated = await updateGroup(g.id, { name: 'New Name', is_open: false })
    expect(updated.name).toBe('New Name')
    expect(updated.is_open).toBe(false)
  })
})

// ── Members ───────────────────────────────────────────────────────────────────

describe('Group members', () => {
  it('adds a member and returns enriched data', async () => {
    const g = await makeGroup()
    const p = await makePerson('Bob Jones')
    await addMember(g.id, p.id, 'active')
    const members = await getEnrichedMembers(g.id)
    expect(members).toHaveLength(1)
    expect(members[0].person.first_name).toBe('Bob')
    expect(members[0].member.status).toBe('active')
  })

  it('removes a member', async () => {
    const g = await makeGroup()
    const p = await makePerson('Carol Davis')
    await addMember(g.id, p.id)
    await removeMember(g.id, p.id)
    const members = await getEnrichedMembers(g.id)
    expect(members.find(m => m.person.id === p.id)).toBeUndefined()
  })

  it('updates member status', async () => {
    const g = await makeGroup()
    const p = await makePerson('Dan Evans')
    await addMember(g.id, p.id, 'active')
    const [{ member }] = await getEnrichedMembers(g.id)
    await updateMemberStatus(member.id, 'waitlisted')
    const updated = await getEnrichedMembers(g.id)
    expect(updated[0].member.status).toBe('waitlisted')
  })

  it('getEnrichedMembers excludes inactive members', async () => {
    const g = await makeGroup()
    const p = await makePerson('Eve Frank')
    await addMember(g.id, p.id, 'inactive')
    const members = await getEnrichedMembers(g.id)
    expect(members.find(m => m.person.id === p.id)).toBeUndefined()
  })
})

// ── Sign-up ───────────────────────────────────────────────────────────────────

describe('signUpForGroup', () => {
  it('adds a new member as active when capacity is available', async () => {
    const g = await makeGroup({ max_capacity: 10 })
    const p = await makePerson('Frank Green')
    const result = await signUpForGroup(g.id, p.id)
    expect(result.waitlisted).toBe(false)
    expect(result.alreadyMember).toBe(false)
    expect(result.member.status).toBe('active')
  })

  it('waitlists when group is at capacity', async () => {
    const g = await makeGroup({ max_capacity: 1 })
    const p1 = await makePerson('Grace Hill')
    const p2 = await makePerson('Hank Ivy')
    await signUpForGroup(g.id, p1.id) // fills the spot
    const result = await signUpForGroup(g.id, p2.id)
    expect(result.waitlisted).toBe(true)
    expect(result.member.status).toBe('waitlisted')
  })

  it('detects existing membership', async () => {
    const g = await makeGroup()
    const p = await makePerson('Iris James')
    await signUpForGroup(g.id, p.id)
    const result = await signUpForGroup(g.id, p.id)
    expect(result.alreadyMember).toBe(true)
  })

  it('adds as active without a capacity limit', async () => {
    const g = await makeGroup({ max_capacity: undefined })
    const p = await makePerson('Jack King')
    const result = await signUpForGroup(g.id, p.id)
    expect(result.waitlisted).toBe(false)
    expect(result.member.status).toBe('active')
  })
})

// ── Waitlist promotion ────────────────────────────────────────────────────────

describe('waitlist promotion', () => {
  it('promotes first waitlisted member when an active member is removed', async () => {
    const g = await makeGroup({ max_capacity: 1 })
    const p1 = await makePerson('Larry Moon')
    const p2 = await makePerson('Mary Noon')
    await signUpForGroup(g.id, p1.id) // fills the spot → active
    await signUpForGroup(g.id, p2.id) // waitlisted

    await removeMember(g.id, p1.id) // frees a slot → should promote p2
    const members = await getEnrichedMembers(g.id)
    const p2Member = members.find(m => m.person.id === p2.id)
    expect(p2Member?.member.status).toBe('active')
  })

  it('promotes first waitlisted member when an active member is set inactive', async () => {
    const g = await makeGroup({ max_capacity: 1 })
    const p1 = await makePerson('Nick Oak')
    const p2 = await makePerson('Olivia Pine')
    await signUpForGroup(g.id, p1.id)
    await signUpForGroup(g.id, p2.id)

    const [{ member: m1 }] = (await getEnrichedMembers(g.id)).filter(m => m.person.id === p1.id)
    await updateMemberStatus(m1.id, 'inactive') // frees slot → should promote p2
    const all = await db.getGroupMembers(g.id)
    const p2Member = all.find(m => m.person_id === p2.id)
    expect(p2Member?.status).toBe('active')
  })

  it('does NOT promote when group has no capacity limit', async () => {
    const g = await makeGroup({ max_capacity: undefined })
    const p1 = await makePerson('Paul Quinn')
    const p2 = await makePerson('Quinn Rose')
    await addMember(g.id, p1.id, 'active')
    await addMember(g.id, p2.id, 'waitlisted') // manually waitlisted in unlimited group
    await removeMember(g.id, p1.id)
    // p2 should stay waitlisted — no capacity rule to trigger promotion
    const all = await db.getGroupMembers(g.id)
    expect(all.find(m => m.person_id === p2.id)?.status).toBe('waitlisted')
  })

  it('promotes in join order when multiple members are waitlisted', async () => {
    const g = await makeGroup({ max_capacity: 1 })
    const active = await makePerson('Rachel Stone')
    const wait1 = await makePerson('Sam Thorn')
    const wait2 = await makePerson('Tina Urns')
    await signUpForGroup(g.id, active.id)
    await signUpForGroup(g.id, wait1.id)
    await signUpForGroup(g.id, wait2.id)

    await removeMember(g.id, active.id)
    const all = await db.getGroupMembers(g.id)
    // wait1 joined first — should be promoted; wait2 still waitlisted
    expect(all.find(m => m.person_id === wait1.id)?.status).toBe('active')
    expect(all.find(m => m.person_id === wait2.id)?.status).toBe('waitlisted')
  })
})

// ── getVisibleGroups capacity ──────────────────────────────────────────────────

describe('getVisibleGroups — dynamic capacity', () => {
  async function makeVisibleGroup(max_capacity?: number) {
    return makeGroup({ max_capacity, is_visible: true, is_active: true, is_open: true })
  }

  it('group with open spots reports isAtCapacity false and correct availableSpots', async () => {
    const g = await makeVisibleGroup(3)
    const p = await makePerson('Una Vance')
    await signUpForGroup(g.id, p.id)

    const visible = await getVisibleGroups()
    const found = visible.find(v => v.id === g.id)
    expect(found?.isAtCapacity).toBe(false)
    expect(found?.availableSpots).toBe(2)
  })

  it('group at capacity reports isAtCapacity true and availableSpots 0', async () => {
    const g = await makeVisibleGroup(2)
    const p1 = await makePerson('Victor Webb')
    const p2 = await makePerson('Wendy Xue')
    await signUpForGroup(g.id, p1.id)
    await signUpForGroup(g.id, p2.id)

    const visible = await getVisibleGroups()
    const found = visible.find(v => v.id === g.id)
    expect(found?.isAtCapacity).toBe(true)
    expect(found?.availableSpots).toBe(0)
  })

  it('removing a member from a full group makes the group available again', async () => {
    const g = await makeVisibleGroup(2)
    const p1 = await makePerson('Xavier Yew')
    const p2 = await makePerson('Yara Zinn')
    await signUpForGroup(g.id, p1.id)
    await signUpForGroup(g.id, p2.id)

    // Confirm full
    let visible = await getVisibleGroups()
    expect(visible.find(v => v.id === g.id)?.isAtCapacity).toBe(true)

    // Remove one active member
    await removeMember(g.id, p1.id)

    // Group should now show as available
    visible = await getVisibleGroups()
    const found = visible.find(v => v.id === g.id)
    expect(found?.isAtCapacity).toBe(false)
    expect(found?.availableSpots).toBe(1)
  })

  it('waitlisted members do NOT count against capacity', async () => {
    const g = await makeVisibleGroup(1)
    const p1 = await makePerson('Zara Ash')
    const p2 = await makePerson('Adam Bell') // will be waitlisted
    await signUpForGroup(g.id, p1.id) // fills capacity
    await signUpForGroup(g.id, p2.id) // waitlisted — must not affect activeCount

    const visible = await getVisibleGroups()
    const found = visible.find(v => v.id === g.id)
    // Still at capacity (1 active = max), even though 2 members total
    expect(found?.isAtCapacity).toBe(true)
    expect(found?.availableSpots).toBe(0)
    expect(found?.activeCount).toBe(1)
  })

  it('unlimited groups always report isAtCapacity false and availableSpots null', async () => {
    const g = await makeVisibleGroup(undefined) // no capacity limit
    const p1 = await makePerson('Beth Cole')
    const p2 = await makePerson('Carl Dean')
    await signUpForGroup(g.id, p1.id)
    await signUpForGroup(g.id, p2.id)

    const visible = await getVisibleGroups()
    const found = visible.find(v => v.id === g.id)
    expect(found?.isAtCapacity).toBe(false)
    expect(found?.availableSpots).toBeNull()
  })
})
