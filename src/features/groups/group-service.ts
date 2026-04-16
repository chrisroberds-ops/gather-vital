import { db } from '@/services'
import { sendSMS, sendEmail } from '@/services/notification-service'
import type { Group, GroupMember, Person, GroupMemberStatus } from '@/shared/types'

export interface EnrichedMember {
  member: GroupMember
  person: Person
}

// ── Groups ────────────────────────────────────────────────────────────────────

export async function getAllGroups(): Promise<Group[]> {
  return db.getGroups(true) // includes hidden/inactive — for staff view
}

export interface GroupWithCapacity extends Group {
  /** Active member count at time of fetch. */
  activeCount: number
  /** Spots remaining, or null when max_capacity is not set (unlimited). */
  availableSpots: number | null
  /** True only when max_capacity is set and activeCount >= max_capacity. */
  isAtCapacity: boolean
}

export async function getVisibleGroups(): Promise<GroupWithCapacity[]> {
  const groups = await db.getGroups(false) // only is_visible && is_active
  return Promise.all(groups.map(async g => {
    const members = await db.getGroupMembers(g.id)
    // Only 'active' members consume a slot; waitlisted do not count.
    const activeCount = members.filter(m => m.status === 'active').length
    const availableSpots = g.max_capacity ? Math.max(0, g.max_capacity - activeCount) : null
    const isAtCapacity = g.max_capacity ? activeCount >= g.max_capacity : false
    return { ...g, activeCount, availableSpots, isAtCapacity }
  }))
}

export async function getGroup(id: string): Promise<Group | null> {
  return db.getGroup(id)
}

export async function createGroup(data: Omit<Group, 'id'>): Promise<Group> {
  return db.createGroup(data)
}

export async function updateGroup(id: string, data: Partial<Group>): Promise<Group> {
  return db.updateGroup(id, data)
}

// ── Members ───────────────────────────────────────────────────────────────────

export async function getEnrichedMembers(groupId: string): Promise<EnrichedMember[]> {
  const members = await db.getGroupMembers(groupId)
  const rows = await Promise.all(
    members
      .filter(m => m.status !== 'inactive')
      .map(async m => {
        const person = await db.getPerson(m.person_id)
        return person ? { member: m, person } : null
      })
  )
  return rows.filter((r): r is EnrichedMember => r !== null)
}

export async function addMember(
  groupId: string,
  personId: string,
  status: GroupMemberStatus = 'active',
): Promise<GroupMember> {
  return db.addGroupMember({
    group_id: groupId,
    person_id: personId,
    status,
    joined_at: new Date().toISOString().split('T')[0],
  })
}

export async function removeMember(groupId: string, personId: string): Promise<void> {
  await db.removeGroupMember(groupId, personId)
  await promoteFromWaitlist(groupId)
}

export async function updateMemberStatus(memberId: string, status: GroupMemberStatus): Promise<GroupMember> {
  const updated = await db.updateGroupMember(memberId, { status })
  if (status === 'inactive') {
    await promoteFromWaitlist(updated.group_id)
  }
  return updated
}

/** Promotes the earliest-joined waitlisted member if a slot is now available. */
async function promoteFromWaitlist(groupId: string): Promise<void> {
  const [group, members] = await Promise.all([
    db.getGroup(groupId),
    db.getGroupMembers(groupId),
  ])
  if (!group?.max_capacity) return // unlimited — nothing to promote into

  const activeCount = members.filter(m => m.status === 'active').length
  if (activeCount >= group.max_capacity) return // still full

  const firstWaitlisted = members
    .filter(m => m.status === 'waitlisted')
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at))[0]

  if (firstWaitlisted) {
    await db.updateGroupMember(firstWaitlisted.id, { status: 'active' })
    const person = await db.getPerson(firstWaitlisted.person_id)
    if (person) {
      const msg = `Good news! A spot opened up in ${group.name} and you've been moved from the waitlist to active. Welcome!`
      if (person.phone) await sendSMS({ to: person.phone, body: msg })
      if (person.email) await sendEmail({ to: person.email, subject: `You're in: ${group.name}`, body: msg })
    }
  }
}

// ── Public sign-up ────────────────────────────────────────────────────────────

export interface SignUpResult {
  member: GroupMember
  waitlisted: boolean
  alreadyMember: boolean
}

export async function signUpForGroup(groupId: string, personId: string): Promise<SignUpResult> {
  const [group, members] = await Promise.all([
    db.getGroup(groupId),
    db.getGroupMembers(groupId),
  ])
  if (!group) throw new Error('Group not found')

  const existing = members.find(m => m.person_id === personId && m.status !== 'inactive')
  if (existing) return { member: existing, waitlisted: existing.status === 'waitlisted', alreadyMember: true }

  const activeCount = members.filter(m => m.status === 'active').length
  const waitlisted = !!(group.max_capacity && activeCount >= group.max_capacity)
  const status: GroupMemberStatus = waitlisted ? 'waitlisted' : 'active'

  const member = await db.addGroupMember({
    group_id: groupId,
    person_id: personId,
    status,
    joined_at: new Date().toISOString().split('T')[0],
  })

  return { member, waitlisted, alreadyMember: false }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const GROUP_TYPE_LABELS: Record<string, string> = {
  small_group: 'Small Group',
  class: 'Class',
  ministry: 'Ministry',
  support: 'Support',
  other: 'Other',
}

export const MEETING_DAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Varies',
]
