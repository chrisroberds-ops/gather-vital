import { describe, it, expect } from 'vitest'
import {
  isFirstTimeInRole,
  filterByServiceTime,
  groupEntriesByTeam,
  nextServiceDate,
  isKidsTeam,
} from '@/features/volunteers/runsheet-service'
import { markServed } from '@/features/volunteers/volunteer-service'
import { db } from '@/services'
import type { VolunteerSchedule, Team, TeamMember, ServiceTime } from '@/shared/types'
import type { EnrichedScheduleEntry } from '@/features/volunteers/volunteer-service'

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeSchedule(overrides: Partial<VolunteerSchedule> = {}): VolunteerSchedule {
  return {
    id: 'sched-1',
    church_id: 'church-test-default',
    team_id: 'team-1',
    person_id: 'person-1',
    scheduled_date: '2026-05-03',
    position: 'Greeter',
    status: 'confirmed',
    reminder_sent: false,
    ...overrides,
  }
}

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team-1',
    church_id: 'church-test-default',
    name: 'Hospitality',
    is_active: true,
    ...overrides,
  }
}

function makeTeamMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'tm-1',
    church_id: 'church-test-default',
    team_id: 'team-1',
    person_id: 'person-1',
    role: 'member',
    rotation_preference: 'every_week',
    joined_at: '2026-01-01',
    ...overrides,
  }
}

function makeEntry(
  schedule: VolunteerSchedule,
  person: EnrichedScheduleEntry['person'] = null,
): EnrichedScheduleEntry {
  return { entry: schedule, person, team: null }
}

// ── isFirstTimeInRole ─────────────────────────────────────────────────────────

describe('isFirstTimeInRole', () => {
  it('returns true when no history at all', () => {
    const entry = makeSchedule()
    expect(isFirstTimeInRole(entry, [])).toBe(true)
  })

  it('returns true when no prior served=true in this role', () => {
    const entry = makeSchedule({ scheduled_date: '2026-05-03' })
    const history = [
      // same person, same role, served=false (no-show) — doesn't count
      makeSchedule({ id: 'h1', scheduled_date: '2026-04-01', served: false }),
      // same person, different role
      makeSchedule({ id: 'h2', scheduled_date: '2026-04-01', position: 'Usher', served: true }),
    ]
    expect(isFirstTimeInRole(entry, history)).toBe(true)
  })

  it('returns false when person has served in this role before', () => {
    const entry = makeSchedule({ scheduled_date: '2026-05-03' })
    const history = [
      makeSchedule({ id: 'h1', scheduled_date: '2026-04-06', served: true }),
    ]
    expect(isFirstTimeInRole(entry, history)).toBe(false)
  })

  it('ignores served=true records on the same date (not strictly prior)', () => {
    const entry = makeSchedule({ scheduled_date: '2026-05-03' })
    const history = [
      // Same date — not strictly prior
      makeSchedule({ id: 'h1', scheduled_date: '2026-05-03', served: true }),
    ]
    expect(isFirstTimeInRole(entry, history)).toBe(true)
  })

  it('ignores future served=true records', () => {
    const entry = makeSchedule({ scheduled_date: '2026-05-03' })
    const history = [
      makeSchedule({ id: 'h1', scheduled_date: '2026-06-01', served: true }),
    ]
    expect(isFirstTimeInRole(entry, history)).toBe(true)
  })

  it('returns false only when both person_id and position match', () => {
    const entry = makeSchedule({ person_id: 'p1', position: 'Greeter', scheduled_date: '2026-05-03' })
    const history = [
      // Different person, same role
      makeSchedule({ id: 'h1', person_id: 'p2', position: 'Greeter', scheduled_date: '2026-04-01', served: true }),
      // Same person, different role
      makeSchedule({ id: 'h2', person_id: 'p1', position: 'Usher', scheduled_date: '2026-04-01', served: true }),
    ]
    expect(isFirstTimeInRole(entry, history)).toBe(true)
  })

  it('returns false when person served months ago in the same role', () => {
    const entry = makeSchedule({ scheduled_date: '2026-05-03' })
    const history = [
      makeSchedule({ id: 'h1', scheduled_date: '2025-09-07', served: true }),
    ]
    expect(isFirstTimeInRole(entry, history)).toBe(false)
  })
})

// ── filterByServiceTime ───────────────────────────────────────────────────────

describe('filterByServiceTime', () => {
  const entries: EnrichedScheduleEntry[] = [
    makeEntry(makeSchedule({ id: 's1', service_time_id: 'st-8am' })),
    makeEntry(makeSchedule({ id: 's2', service_time_id: 'st-10am' })),
    makeEntry(makeSchedule({ id: 's3' })),  // no service_time_id
    makeEntry(makeSchedule({ id: 's4', service_time_id: 'st-8am' })),
  ]

  it('returns all entries when filter is null', () => {
    expect(filterByServiceTime(entries, null)).toHaveLength(4)
  })

  it('returns all entries when filter is empty string treated as null', () => {
    expect(filterByServiceTime(entries, '')).toHaveLength(4)
  })

  it('filters to matching service time + entries without a service_time_id', () => {
    const result = filterByServiceTime(entries, 'st-8am')
    expect(result).toHaveLength(3)  // s1, s3 (no id), s4
    expect(result.map(e => e.entry.id)).toContain('s1')
    expect(result.map(e => e.entry.id)).toContain('s3')
    expect(result.map(e => e.entry.id)).toContain('s4')
    expect(result.map(e => e.entry.id)).not.toContain('s2')
  })

  it('includes entries with no service_time_id in any filtered view', () => {
    const result10 = filterByServiceTime(entries, 'st-10am')
    expect(result10.map(e => e.entry.id)).toContain('s3')
  })

  it('returns empty when no entries match (and none are unassigned)', () => {
    const assigned: EnrichedScheduleEntry[] = [
      makeEntry(makeSchedule({ id: 'x1', service_time_id: 'st-8am' })),
      makeEntry(makeSchedule({ id: 'x2', service_time_id: 'st-10am' })),
    ]
    const result = filterByServiceTime(assigned, 'st-noon')
    expect(result).toHaveLength(0)
  })
})

// ── groupEntriesByTeam ────────────────────────────────────────────────────────

describe('groupEntriesByTeam', () => {
  const team1 = makeTeam({ id: 'team-1', name: 'Worship' })
  const team2 = makeTeam({ id: 'team-2', name: 'Hospitality' })
  const teams = [team1, team2]

  function makeEntries(): EnrichedScheduleEntry[] {
    return [
      makeEntry(makeSchedule({ id: 's1', team_id: 'team-1', person_id: 'p1', position: 'Keys', status: 'confirmed' })),
      makeEntry(makeSchedule({ id: 's2', team_id: 'team-1', person_id: 'p2', position: 'Drums', status: 'pending' })),
      makeEntry(makeSchedule({ id: 's3', team_id: 'team-2', person_id: 'p3', position: 'Greeter', status: 'confirmed' })),
      makeEntry(makeSchedule({ id: 's4', team_id: 'team-2', person_id: 'p4', position: 'Greeter', status: 'declined' })),
    ]
  }

  it('groups entries by team', () => {
    const groups = groupEntriesByTeam(makeEntries(), teams, new Map(), [])
    expect(groups).toHaveLength(2)
    const worship = groups.find(g => g.team.name === 'Worship')
    const hospitality = groups.find(g => g.team.name === 'Hospitality')
    expect(worship?.entries).toHaveLength(2)
    expect(hospitality?.entries).toHaveLength(2)
  })

  it('sorts groups alphabetically by team name', () => {
    const groups = groupEntriesByTeam(makeEntries(), teams, new Map(), [])
    expect(groups[0].team.name).toBe('Hospitality')
    expect(groups[1].team.name).toBe('Worship')
  })

  it('marks leaders as isTeamLead', () => {
    const leader = makeTeamMember({ person_id: 'p1', role: 'leader', team_id: 'team-1' })
    const membersMap = new Map([['team-1', [leader]]])
    const groups = groupEntriesByTeam(makeEntries(), teams, membersMap, [])
    const worship = groups.find(g => g.team.name === 'Worship')!
    const p1Entry = worship.entries.find(e => e.schedule.person_id === 'p1')!
    const p2Entry = worship.entries.find(e => e.schedule.person_id === 'p2')!
    expect(p1Entry.isTeamLead).toBe(true)
    expect(p2Entry.isTeamLead).toBe(false)
  })

  it('sorts team leads first within a team', () => {
    const leader = makeTeamMember({ person_id: 'p2', role: 'leader', team_id: 'team-1' })
    const membersMap = new Map([['team-1', [leader]]])
    const groups = groupEntriesByTeam(makeEntries(), teams, membersMap, [])
    const worship = groups.find(g => g.team.name === 'Worship')!
    expect(worship.entries[0].schedule.person_id).toBe('p2')
  })

  it('marks coordinators as isTeamLead', () => {
    const coord = makeTeamMember({ person_id: 'p3', role: 'coordinator', team_id: 'team-2' })
    const membersMap = new Map([['team-2', [coord]]])
    const groups = groupEntriesByTeam(makeEntries(), teams, membersMap, [])
    const hosp = groups.find(g => g.team.name === 'Hospitality')!
    const p3Entry = hosp.entries.find(e => e.schedule.person_id === 'p3')!
    expect(p3Entry.isTeamLead).toBe(true)
  })

  it('computes confirmedCount correctly', () => {
    const groups = groupEntriesByTeam(makeEntries(), teams, new Map(), [])
    // Worship: p1=confirmed, p2=pending → confirmedCount=1, totalCount=2
    const worship = groups.find(g => g.team.name === 'Worship')!
    expect(worship.confirmedCount).toBe(1)
    expect(worship.totalCount).toBe(2)
  })

  it('totalCount excludes cancelled entries', () => {
    const entries = [
      ...makeEntries(),
      makeEntry(makeSchedule({ id: 's5', team_id: 'team-1', person_id: 'p5', status: 'cancelled' })),
    ]
    const groups = groupEntriesByTeam(entries, teams, new Map(), [])
    const worship = groups.find(g => g.team.name === 'Worship')!
    // s1 confirmed, s2 pending, s5 cancelled (excluded from total)
    expect(worship.totalCount).toBe(2)
  })

  it('totalCount excludes declined entries', () => {
    const groups = groupEntriesByTeam(makeEntries(), teams, new Map(), [])
    // Hospitality: p3=confirmed, p4=declined → totalCount=1 (declined excluded), confirmedCount=1
    const hosp = groups.find(g => g.team.name === 'Hospitality')!
    expect(hosp.totalCount).toBe(1)
    expect(hosp.confirmedCount).toBe(1)
  })

  it('marks first-time volunteers correctly', () => {
    const entry = makeSchedule({ id: 's1', person_id: 'p1', position: 'Keys', scheduled_date: '2026-05-03' })
    const history: VolunteerSchedule[] = []  // no history → first time
    const entries = [makeEntry(entry)]
    const groups = groupEntriesByTeam(entries, [team1], new Map(), history)
    expect(groups[0].entries[0].isFirstTime).toBe(true)
  })

  it('does not mark as first-time when prior served=true exists', () => {
    const entry = makeSchedule({ id: 's1', person_id: 'p1', position: 'Keys', scheduled_date: '2026-05-03' })
    const history: VolunteerSchedule[] = [
      makeSchedule({ id: 'h1', person_id: 'p1', position: 'Keys', scheduled_date: '2026-04-06', served: true }),
    ]
    const entries = [makeEntry(entry)]
    const groups = groupEntriesByTeam(entries, [team1], new Map(), history)
    expect(groups[0].entries[0].isFirstTime).toBe(false)
  })

  it('skips entries with no matching team', () => {
    const orphan = makeEntry(makeSchedule({ id: 'orphan', team_id: 'nonexistent-team' }))
    const groups = groupEntriesByTeam([orphan], teams, new Map(), [])
    expect(groups.every(g => g.team.id !== 'nonexistent-team')).toBe(true)
  })
})

// ── Confirmation status display ───────────────────────────────────────────────

describe('confirmation status display', () => {
  it('pending entries count in total but not confirmed', () => {
    const team = makeTeam({ id: 'team-1' })
    const entries = [
      makeEntry(makeSchedule({ id: 's1', status: 'pending' })),
      makeEntry(makeSchedule({ id: 's2', status: 'pending' })),
    ]
    const [group] = groupEntriesByTeam(entries, [team], new Map(), [])
    expect(group.confirmedCount).toBe(0)
    expect(group.totalCount).toBe(2)
  })

  it('"8 of 8 confirmed" scenario', () => {
    const team = makeTeam({ id: 'team-1' })
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry(makeSchedule({ id: `s${i}`, person_id: `p${i}`, status: 'confirmed' })),
    )
    const [group] = groupEntriesByTeam(entries, [team], new Map(), [])
    expect(group.confirmedCount).toBe(8)
    expect(group.totalCount).toBe(8)
  })

  it('"5 of 6 confirmed" scenario — one pending', () => {
    const team = makeTeam({ id: 'team-1' })
    const entries = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeEntry(makeSchedule({ id: `s${i}`, person_id: `p${i}`, status: 'confirmed' })),
      ),
      makeEntry(makeSchedule({ id: 's5', person_id: 'p5', status: 'pending' })),
    ]
    const [group] = groupEntriesByTeam(entries, [team], new Map(), [])
    expect(group.confirmedCount).toBe(5)
    expect(group.totalCount).toBe(6)
  })
})

// ── Served status update (integration — writes to DB) ────────────────────────

describe('served status update from run sheet', () => {
  it('markServed sets served=true and served_at', async () => {
    const teams = await db.getTeams()
    const team = teams[0]
    const people = await db.getPeople()
    const person = people.find(p => !p.is_child && p.is_active)!

    const schedule = await db.createVolunteerSchedule({
      team_id: team.id,
      person_id: person.id,
      scheduled_date: '2026-05-04',
      position: 'Greeter',
      status: 'confirmed',
      reminder_sent: false,
    })

    await markServed(schedule.id, true)

    const updated = (await db.getVolunteerSchedule()).find(s => s.id === schedule.id)!
    expect(updated.served).toBe(true)
    expect(updated.served_at).toBeTruthy()
  })

  it('markServed with null clears served and served_at', async () => {
    const teams = await db.getTeams()
    const team = teams[0]
    const people = await db.getPeople()
    const person = people.find(p => !p.is_child && p.is_active)!

    const schedule = await db.createVolunteerSchedule({
      team_id: team.id,
      person_id: person.id,
      scheduled_date: '2026-05-04',
      position: 'Usher',
      status: 'confirmed',
      reminder_sent: false,
    })

    await markServed(schedule.id, true)
    await markServed(schedule.id, null)

    const cleared = (await db.getVolunteerSchedule()).find(s => s.id === schedule.id)!
    expect(cleared.served).toBeUndefined()
    expect(cleared.served_at).toBeUndefined()
  })

  it('marking served from run sheet does not affect other entries on same date', async () => {
    const teams = await db.getTeams()
    const team = teams[0]
    const people = await db.getPeople()
    const actives = people.filter(p => !p.is_child && p.is_active)

    const s1 = await db.createVolunteerSchedule({
      team_id: team.id,
      person_id: actives[0].id,
      scheduled_date: '2026-05-11',
      position: 'Greeter',
      status: 'confirmed',
      reminder_sent: false,
    })
    const s2 = await db.createVolunteerSchedule({
      team_id: team.id,
      person_id: actives[1].id,
      scheduled_date: '2026-05-11',
      position: 'Greeter',
      status: 'confirmed',
      reminder_sent: false,
    })

    await markServed(s1.id, true)

    const all = await db.getVolunteerSchedule()
    const s2Updated = all.find(s => s.id === s2.id)!
    expect(s2Updated.served).toBeUndefined()
  })
})

// ── nextServiceDate ───────────────────────────────────────────────────────────

describe('nextServiceDate', () => {
  // Use new Date(year, month-1, day) to avoid UTC-midnight timezone shifts
  const SUN_APR_19 = new Date(2026, 3, 19)  // Sunday April 19 2026
  const MON_APR_20 = new Date(2026, 3, 20)  // Monday April 20 2026
  const TUE_APR_21 = new Date(2026, 3, 21)  // Tuesday April 21 2026

  it('returns today if today is a service day', () => {
    const serviceTimes: ServiceTime[] = [{ id: 'st1', day: 'Sunday', time: '10:00 AM' }]
    const result = nextServiceDate(serviceTimes, SUN_APR_19)
    expect(result).toBe('2026-04-19')
  })

  it('finds next Sunday when starting on a Monday', () => {
    const serviceTimes: ServiceTime[] = [{ id: 'st1', day: 'Sunday', time: '10:00 AM' }]
    const result = nextServiceDate(serviceTimes, MON_APR_20)
    expect(result).toBe('2026-04-26')
  })

  it('defaults to Sunday when no service times configured', () => {
    const result = nextServiceDate([], MON_APR_20)
    // Parse result as local date (YYYY-MM-DD) to avoid UTC offset shifts
    const [y, m, d] = result.split('-').map(Number)
    expect(new Date(y, m - 1, d).getDay()).toBe(0)
  })

  it('supports non-Sunday service days', () => {
    const serviceTimes: ServiceTime[] = [{ id: 'st1', day: 'Wednesday', time: '7:00 PM' }]
    const result = nextServiceDate(serviceTimes, MON_APR_20)
    expect(result).toBe('2026-04-22')
  })

  it('finds the earliest matching day when multiple service days exist', () => {
    const serviceTimes: ServiceTime[] = [
      { id: 'st1', day: 'Sunday',    time: '10:00 AM' },
      { id: 'st2', day: 'Wednesday', time: '7:00 PM' },
    ]
    const result = nextServiceDate(serviceTimes, TUE_APR_21)
    // Next is Wednesday April 22
    expect(result).toBe('2026-04-22')
  })

  it('returns a valid YYYY-MM-DD string', () => {
    const result = nextServiceDate([], SUN_APR_19)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ── isKidsTeam ────────────────────────────────────────────────────────────────

describe('isKidsTeam', () => {
  it('returns true for teams with "kids" in the name (case-insensitive)', () => {
    expect(isKidsTeam(makeTeam({ name: 'Kids Ministry' }))).toBe(true)
    expect(isKidsTeam(makeTeam({ name: 'kids' }))).toBe(true)
    expect(isKidsTeam(makeTeam({ name: 'KIDS Volunteers' }))).toBe(true)
  })

  it('returns false for non-kids teams', () => {
    expect(isKidsTeam(makeTeam({ name: 'Worship' }))).toBe(false)
    expect(isKidsTeam(makeTeam({ name: 'Hospitality' }))).toBe(false)
    expect(isKidsTeam(makeTeam({ name: 'Youth' }))).toBe(false)
  })
})

// ── Service time filtering (integration) ─────────────────────────────────────

describe('service time filtering integration', () => {
  it('filter includes volunteers without a service_time_id', async () => {
    const teams = await db.getTeams()
    const team = teams[0]
    const people = await db.getPeople()
    const person = people.find(p => !p.is_child && p.is_active)!

    // Create schedule entry WITHOUT a service_time_id
    const s = await db.createVolunteerSchedule({
      team_id: team.id,
      person_id: person.id,
      scheduled_date: '2026-06-07',
      position: 'Welcome Desk',
      status: 'confirmed',
      reminder_sent: false,
    })

    // Schedule enriched — simulate what RunSheet page does
    const allEntries = await db.getVolunteerSchedule()
    const forDate = allEntries
      .filter(e => e.scheduled_date === '2026-06-07')
      .map(e => ({ entry: e, person: null, team: null }))

    const filtered = filterByServiceTime(forDate, 'some-other-service-time-id')
    const ids = filtered.map(e => e.entry.id)
    expect(ids).toContain(s.id)
  })

  it('filter excludes volunteers assigned to a different service time', async () => {
    const teams = await db.getTeams()
    const team = teams[0]
    const people = await db.getPeople()
    const actives = people.filter(p => !p.is_child && p.is_active)

    const s8am = await db.createVolunteerSchedule({
      team_id: team.id,
      person_id: actives[0].id,
      scheduled_date: '2026-06-07',
      position: 'Usher',
      status: 'confirmed',
      reminder_sent: false,
      service_time_id: 'st-8am',
    })
    const s10am = await db.createVolunteerSchedule({
      team_id: team.id,
      person_id: actives[1].id,
      scheduled_date: '2026-06-07',
      position: 'Usher',
      status: 'confirmed',
      reminder_sent: false,
      service_time_id: 'st-10am',
    })

    const allEntries = await db.getVolunteerSchedule()
    const forDate = allEntries
      .filter(e => e.scheduled_date === '2026-06-07')
      .map(e => ({ entry: e, person: null, team: null }))

    const filtered = filterByServiceTime(forDate, 'st-8am')
    const ids = filtered.map(e => e.entry.id)
    expect(ids).toContain(s8am.id)
    expect(ids).not.toContain(s10am.id)
  })
})
