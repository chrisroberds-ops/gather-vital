import { describe, it, expect, beforeEach } from 'vitest'
import {
  getSundaysBetween,
  generateSchedule,
  getTeams,
  createTeam,
  addTeamMember,
  getEnrichedTeamMembers,
  updateMemberRotation,
  getBlackouts,
  addBlackout,
  removeBlackout,
  createScheduleEntry,
  getEnrichedSchedule,
  updateScheduleStatus,
  deleteScheduleEntry,
} from '@/features/volunteers/volunteer-service'
import { db } from '@/services'
import type { RotationPreference } from '@/shared/types'

// ── getSundaysBetween ─────────────────────────────────────────────────────────

describe('getSundaysBetween', () => {
  it('returns all Sundays in a standard week range', () => {
    const sundays = getSundaysBetween('2025-01-01', '2025-01-31')
    expect(sundays).toEqual(['2025-01-05', '2025-01-12', '2025-01-19', '2025-01-26'])
  })

  it('includes start date if it is a Sunday', () => {
    const sundays = getSundaysBetween('2025-01-05', '2025-01-05')
    expect(sundays).toEqual(['2025-01-05'])
  })

  it('returns empty array when range contains no Sundays', () => {
    const sundays = getSundaysBetween('2025-01-06', '2025-01-11')
    expect(sundays).toEqual([])
  })

  it('returns empty array when end is before start', () => {
    const sundays = getSundaysBetween('2025-01-12', '2025-01-05')
    expect(sundays).toEqual([])
  })

  it('handles a multi-month range correctly', () => {
    const sundays = getSundaysBetween('2025-03-01', '2025-03-31')
    expect(sundays).toEqual(['2025-03-02', '2025-03-09', '2025-03-16', '2025-03-23', '2025-03-30'])
  })
})

// ── Teams ─────────────────────────────────────────────────────────────────────

describe('Teams', () => {
  it('creates and retrieves teams', async () => {
    await createTeam({ name: 'Music', description: 'Worship music' })
    await createTeam({ name: 'Greeting' })
    const teams = await getTeams()
    const names = teams.map(t => t.name)
    expect(names).toContain('Music')
    expect(names).toContain('Greeting')
  })

  it('only returns active teams', async () => {
    const t = await createTeam({ name: 'InactiveTeam' })
    const { updateTeam } = await import('@/features/volunteers/volunteer-service')
    await updateTeam(t.id, { is_active: false })
    const teams = await getTeams()
    expect(teams.find(x => x.id === t.id)).toBeUndefined()
  })
})

// ── Team members ──────────────────────────────────────────────────────────────

describe('Team members', () => {
  it('adds a member and reads enriched data', async () => {
    const team = await createTeam({ name: 'AV Team' })
    const person = await db.createPerson({
      first_name: 'Alice',
      last_name: 'Smith',
      is_active: true,
      is_child: false,
    })

    await addTeamMember(team.id, person.id, 'member', 'every_week')
    const members = await getEnrichedTeamMembers(team.id)
    expect(members).toHaveLength(1)
    expect(members[0].person.first_name).toBe('Alice')
    expect(members[0].member.rotation_preference).toBe('every_week')
  })

  it('updates rotation preference', async () => {
    const team = await createTeam({ name: 'Parking' })
    const person = await db.createPerson({ first_name: 'Bob', last_name: 'Jones', is_active: true, is_child: false })
    await addTeamMember(team.id, person.id, 'member', 'every_week')
    const [{ member }] = await getEnrichedTeamMembers(team.id)

    await updateMemberRotation(member.id, '2nd_sunday')
    const [updated] = await getEnrichedTeamMembers(team.id)
    expect(updated.member.rotation_preference).toBe('2nd_sunday')
  })
})

// ── Blackouts ─────────────────────────────────────────────────────────────────

describe('Blackouts', () => {
  it('adds and lists blackout dates', async () => {
    const person = await db.createPerson({ first_name: 'Carol', last_name: 'Doe', is_active: true, is_child: false })
    await addBlackout(person.id, '2025-06-01', '2025-06-07', 'Vacation')
    const blackouts = await getBlackouts(person.id)
    expect(blackouts).toHaveLength(1)
    expect(blackouts[0].start_date).toBe('2025-06-01')
    expect(blackouts[0].reason).toBe('Vacation')
  })

  it('removes a blackout', async () => {
    const person = await db.createPerson({ first_name: 'Dan', last_name: 'Roe', is_active: true, is_child: false })
    const b = await addBlackout(person.id, '2025-07-01', '2025-07-01')
    await removeBlackout(b.id)
    const blackouts = await getBlackouts(person.id)
    expect(blackouts.find(x => x.id === b.id)).toBeUndefined()
  })
})

// ── Schedule CRUD ─────────────────────────────────────────────────────────────

describe('Schedule CRUD', () => {
  it('creates, retrieves, updates status, and deletes an entry', async () => {
    const team = await createTeam({ name: 'Ushers' })
    const person = await db.createPerson({ first_name: 'Eve', last_name: 'Lane', is_active: true, is_child: false })

    const entry = await createScheduleEntry({ teamId: team.id, personId: person.id, date: '2025-03-02', position: 'Front Door' })
    expect(entry.status).toBe('pending')

    const updated = await updateScheduleStatus(entry.id, 'confirmed')
    expect(updated.status).toBe('confirmed')
    expect(updated.confirmed_at).toBeTruthy()

    const enriched = await getEnrichedSchedule(team.id)
    expect(enriched).toHaveLength(1)
    expect(enriched[0].person?.first_name).toBe('Eve')

    await deleteScheduleEntry(entry.id)
    const afterDelete = await getEnrichedSchedule(team.id)
    expect(afterDelete).toHaveLength(0)
  })
})

// ── generateSchedule ──────────────────────────────────────────────────────────

describe('generateSchedule', () => {
  async function makeTeamWithMember(rotation: RotationPreference) {
    const team = await createTeam({ name: `Team-${rotation}-${Math.random()}` })
    const person = await db.createPerson({ first_name: 'Test', last_name: 'User', is_active: true, is_child: false })
    await addTeamMember(team.id, person.id, 'member', rotation)
    return { team, person }
  }

  it('generates entries for every_week members across the range', async () => {
    const { team } = await makeTeamWithMember('every_week')
    const result = await generateSchedule({
      teamId: team.id,
      startDate: '2025-01-01',
      endDate: '2025-01-26',
      position: 'Sound',
      skipConflicts: false,
    })
    // 4 Sundays in Jan 2025: 5, 12, 19, 26
    expect(result.created).toBe(4)
    expect(result.skipped).toBe(0)
  })

  it('respects 2nd_sunday rotation preference', async () => {
    const { team } = await makeTeamWithMember('2nd_sunday')
    const result = await generateSchedule({
      teamId: team.id,
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      position: 'Greeter',
      skipConflicts: false,
    })
    // Only Jan 12 is the 2nd Sunday
    expect(result.created).toBe(1)
  })

  it('respects every_other rotation preference', async () => {
    const { team } = await makeTeamWithMember('every_other')
    const result = await generateSchedule({
      teamId: team.id,
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      position: 'Parking',
      skipConflicts: false,
    })
    // Even indices (0, 2) = Jan 5 and Jan 19
    expect(result.created).toBe(2)
  })

  it('skips as_needed members entirely', async () => {
    const { team } = await makeTeamWithMember('as_needed')
    const result = await generateSchedule({
      teamId: team.id,
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      position: 'Flex',
      skipConflicts: false,
    })
    expect(result.created).toBe(0)
    expect(result.reasons[0]).toMatch(/as needed/i)
  })

  it('skips dates within a blackout range', async () => {
    const { team, person } = await makeTeamWithMember('every_week')
    // Blackout covers Jan 12 (2nd Sunday)
    await addBlackout(person.id, '2025-01-10', '2025-01-15')
    const result = await generateSchedule({
      teamId: team.id,
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      position: 'Camera',
      skipConflicts: false,
    })
    // 4 Sundays - 1 blacked out = 3
    expect(result.created).toBe(3)
    expect(result.skipped).toBe(1)
  })

  it('skips conflicts when skipConflicts is true', async () => {
    const { team: team1, person } = await makeTeamWithMember('every_week')
    const team2 = await createTeam({ name: 'OtherTeam-conflict' })
    await addTeamMember(team2.id, person.id, 'member', 'every_week')

    // Pre-schedule the person on team2 for all Jan Sundays
    const sundays = ['2025-01-05', '2025-01-12', '2025-01-19', '2025-01-26']
    for (const date of sundays) {
      await createScheduleEntry({ teamId: team2.id, personId: person.id, date, position: 'Team2' })
    }

    const result = await generateSchedule({
      teamId: team1.id,
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      position: 'Team1',
      skipConflicts: true,
    })
    expect(result.created).toBe(0)
    expect(result.skipped).toBe(4)
  })

  it('returns informative message when date range has no Sundays', async () => {
    const { team } = await makeTeamWithMember('every_week')
    const result = await generateSchedule({
      teamId: team.id,
      startDate: '2025-01-06',
      endDate: '2025-01-11',
      position: 'Greeter',
      skipConflicts: false,
    })
    expect(result.created).toBe(0)
    expect(result.reasons[0]).toMatch(/no sundays/i)
  })
})
