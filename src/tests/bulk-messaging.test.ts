import { describe, it, expect } from 'vitest'
import type { Person, Group, GroupMember, TeamMember } from '@/shared/types'
import {
  filterAllMembers,
  filterAllVolunteers,
  filterAllGroupLeaders,
  filterVisitorsLastNDays,
  filterGroupMembers,
  filterTeamVolunteers,
  filterBirthdayThisMonth,
  renderForRecipient,
} from '@/features/communications/bulk-messaging-service'

// ── Test helpers ───────────────────────────────────────────────────────────────

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: 'person-1',
    church_id: 'church-test-default',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '5550001111',
    email: 'jane@example.com',
    is_child: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function teamMember(personId: string, teamId = 'team-1'): TeamMember {
  return {
    id: `tm-${personId}-${teamId}`,
    church_id: 'church-test-default',
    team_id: teamId,
    person_id: personId,
    role: 'member',
    rotation_preference: 'every_week',
    joined_at: '2026-01-01T00:00:00Z',
  }
}

function groupMember(personId: string, groupId = 'group-1', status: GroupMember['status'] = 'active'): GroupMember {
  return {
    id: `gm-${personId}-${groupId}`,
    church_id: 'church-test-default',
    group_id: groupId,
    person_id: personId,
    status,
    joined_at: '2026-01-01T00:00:00Z',
  }
}

function group(overrides: Partial<Group> = {}): Group {
  return {
    id: 'group-1',
    church_id: 'church-test-default',
    name: 'Life Group A',
    group_type: 'small_group',
    childcare_available: false,
    is_open: true,
    is_visible: true,
    is_active: true,
    ...overrides,
  }
}

// ── filterAllMembers ───────────────────────────────────────────────────────────

describe('filterAllMembers', () => {
  it('returns active adult members', () => {
    const people = [person({ id: 'p1' })]
    expect(filterAllMembers(people)).toHaveLength(1)
  })

  it('excludes children', () => {
    const people = [person({ id: 'p1', is_child: true })]
    expect(filterAllMembers(people)).toHaveLength(0)
  })

  it('excludes archived people', () => {
    const people = [person({ id: 'p1', is_archived: true })]
    expect(filterAllMembers(people)).toHaveLength(0)
  })

  it('excludes inactive people', () => {
    const people = [person({ id: 'p1', is_active: false })]
    expect(filterAllMembers(people)).toHaveLength(0)
  })

  it('returns empty for empty input', () => {
    expect(filterAllMembers([])).toHaveLength(0)
  })
})

// ── filterAllVolunteers ────────────────────────────────────────────────────────

describe('filterAllVolunteers', () => {
  it('returns people who are on at least one team', () => {
    const people = [person({ id: 'p1' }), person({ id: 'p2' })]
    const tms = [teamMember('p1')]
    expect(filterAllVolunteers(people, tms).map(p => p.id)).toEqual(['p1'])
  })

  it('excludes people not on any team', () => {
    const people = [person({ id: 'p1' })]
    expect(filterAllVolunteers(people, [])).toHaveLength(0)
  })

  it('includes person on multiple teams only once', () => {
    const people = [person({ id: 'p1' })]
    const tms = [teamMember('p1', 'team-1'), teamMember('p1', 'team-2')]
    expect(filterAllVolunteers(people, tms)).toHaveLength(1)
  })

  it('excludes children even if on a team', () => {
    const people = [person({ id: 'p1', is_child: true })]
    const tms = [teamMember('p1')]
    expect(filterAllVolunteers(people, tms)).toHaveLength(0)
  })
})

// ── filterAllGroupLeaders ──────────────────────────────────────────────────────

describe('filterAllGroupLeaders', () => {
  it('returns people who lead at least one group', () => {
    const people = [person({ id: 'p1' }), person({ id: 'p2' })]
    const groups = [group({ leader_id: 'p1' })]
    expect(filterAllGroupLeaders(people, groups).map(p => p.id)).toEqual(['p1'])
  })

  it('excludes people who are not leaders', () => {
    const people = [person({ id: 'p1' })]
    const groups = [group({ leader_id: undefined })]
    expect(filterAllGroupLeaders(people, groups)).toHaveLength(0)
  })

  it('returns empty when groups list is empty', () => {
    const people = [person({ id: 'p1' })]
    expect(filterAllGroupLeaders(people, [])).toHaveLength(0)
  })
})

// ── filterVisitorsLastNDays ────────────────────────────────────────────────────

describe('filterVisitorsLastNDays', () => {
  const ref = new Date('2026-04-19T12:00:00')

  it('includes visitors within the day window', () => {
    const people = [person({ id: 'p1', first_visit_date: '2026-04-01' })]
    const result = filterVisitorsLastNDays(people, 30, ref)
    expect(result).toHaveLength(1)
  })

  it('excludes visitors outside the day window', () => {
    const people = [person({ id: 'p1', first_visit_date: '2026-01-01' })]
    const result = filterVisitorsLastNDays(people, 30, ref)
    expect(result).toHaveLength(0)
  })

  it('includes visitors exactly on the cutoff date', () => {
    // 30 days before 2026-04-19 = 2026-03-20
    const people = [person({ id: 'p1', first_visit_date: '2026-03-20' })]
    const result = filterVisitorsLastNDays(people, 30, ref)
    expect(result).toHaveLength(1)
  })

  it('excludes people with no first_visit_date', () => {
    const people = [person({ id: 'p1', first_visit_date: undefined })]
    const result = filterVisitorsLastNDays(people, 30, ref)
    expect(result).toHaveLength(0)
  })

  it('excludes children', () => {
    const people = [person({ id: 'p1', is_child: true, first_visit_date: '2026-04-01' })]
    const result = filterVisitorsLastNDays(people, 30, ref)
    expect(result).toHaveLength(0)
  })
})

// ── filterGroupMembers ─────────────────────────────────────────────────────────

describe('filterGroupMembers', () => {
  it('returns active members of the specified group', () => {
    const people = [person({ id: 'p1' }), person({ id: 'p2' })]
    const gms = [groupMember('p1', 'group-1'), groupMember('p2', 'group-2')]
    expect(filterGroupMembers(people, gms, 'group-1').map(p => p.id)).toEqual(['p1'])
  })

  it('excludes waitlisted and inactive group members', () => {
    const people = [person({ id: 'p1' }), person({ id: 'p2' })]
    const gms = [groupMember('p1', 'group-1', 'waitlisted'), groupMember('p2', 'group-1', 'inactive')]
    expect(filterGroupMembers(people, gms, 'group-1')).toHaveLength(0)
  })

  it('returns empty when no members in group', () => {
    const people = [person({ id: 'p1' })]
    expect(filterGroupMembers(people, [], 'group-1')).toHaveLength(0)
  })
})

// ── filterTeamVolunteers ───────────────────────────────────────────────────────

describe('filterTeamVolunteers', () => {
  it('returns members of the specified team', () => {
    const people = [person({ id: 'p1' }), person({ id: 'p2' })]
    const tms = [teamMember('p1', 'team-1'), teamMember('p2', 'team-2')]
    expect(filterTeamVolunteers(people, tms, 'team-1').map(p => p.id)).toEqual(['p1'])
  })

  it('returns empty when no members on team', () => {
    const people = [person({ id: 'p1' })]
    expect(filterTeamVolunteers(people, [], 'team-1')).toHaveLength(0)
  })

  it('excludes archived people', () => {
    const people = [person({ id: 'p1', is_archived: true })]
    const tms = [teamMember('p1', 'team-1')]
    expect(filterTeamVolunteers(people, tms, 'team-1')).toHaveLength(0)
  })
})

// ── filterBirthdayThisMonth ────────────────────────────────────────────────────

describe('filterBirthdayThisMonth', () => {
  const ref = new Date('2026-04-19T12:00:00') // April

  it('returns people born in the current month', () => {
    const people = [person({ id: 'p1', date_of_birth: '1990-04-15' })]
    expect(filterBirthdayThisMonth(people, ref)).toHaveLength(1)
  })

  it('excludes people born in a different month', () => {
    const people = [person({ id: 'p1', date_of_birth: '1990-03-15' })]
    expect(filterBirthdayThisMonth(people, ref)).toHaveLength(0)
  })

  it('excludes people with no date_of_birth', () => {
    const people = [person({ id: 'p1', date_of_birth: undefined })]
    expect(filterBirthdayThisMonth(people, ref)).toHaveLength(0)
  })

  it('excludes children', () => {
    const people = [person({ id: 'p1', is_child: true, date_of_birth: '2018-04-10' })]
    expect(filterBirthdayThisMonth(people, ref)).toHaveLength(0)
  })
})

// ── renderForRecipient ─────────────────────────────────────────────────────────

describe('renderForRecipient', () => {
  it('replaces {first_name} with person first name', () => {
    const p = person({ first_name: 'Alice' })
    expect(renderForRecipient('Hello {first_name}!', p, 'Grace Church')).toBe('Hello Alice!')
  })

  it('replaces {last_name} with person last name', () => {
    const p = person({ last_name: 'Smith' })
    expect(renderForRecipient('Dear {last_name}', p, 'Grace Church')).toBe('Dear Smith')
  })

  it('replaces {church_name} with the church name', () => {
    const p = person()
    expect(renderForRecipient('Welcome to {church_name}', p, 'Grace Church')).toBe('Welcome to Grace Church')
  })

  it('handles templates with no merge fields', () => {
    const p = person()
    expect(renderForRecipient('No fields here', p, 'Grace Church')).toBe('No fields here')
  })

  it('replaces multiple fields in one pass', () => {
    const p = person({ first_name: 'Bob', last_name: 'Jones' })
    const result = renderForRecipient('{first_name} {last_name} — {church_name}', p, 'River Church')
    expect(result).toBe('Bob Jones — River Church')
  })
})
