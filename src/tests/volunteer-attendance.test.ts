import { describe, it, expect, beforeEach } from 'vitest'
import {
  createScheduleEntry,
  markServed,
  getServedVolunteersInMonth,
  getEnrichedSchedule,
} from '@/features/volunteers/volunteer-service'
import { db } from '@/services'
import type { Team, Person } from '@/shared/types'

// ── Test fixtures ─────────────────────────────────────────────────────────────

let team: Team
let personA: Person
let personB: Person
let personC: Person

beforeEach(async () => {
  const teams = await db.getTeams()
  team = teams[0]

  const people = await db.getPeople()
  personA = people[0]
  personB = people[1]
  personC = people[2]
})

// ── markServed ────────────────────────────────────────────────────────────────

describe('markServed', () => {
  it('sets served=true on a schedule entry', async () => {
    const entry = await createScheduleEntry({
      teamId: team.id,
      personId: personA.id,
      date: '2026-04-06',
      position: 'Lead Vocals',
    })
    const updated = await markServed(entry.id, true)
    expect(updated.served).toBe(true)
    expect(updated.served_at).toBeTruthy()
  })

  it('sets served=false (no-show) on a schedule entry', async () => {
    const entry = await createScheduleEntry({
      teamId: team.id,
      personId: personA.id,
      date: '2026-04-06',
      position: 'Audio',
    })
    const updated = await markServed(entry.id, false)
    expect(updated.served).toBe(false)
    expect(updated.served_at).toBeTruthy()
  })

  it('clears the served mark when null is passed', async () => {
    const entry = await createScheduleEntry({
      teamId: team.id,
      personId: personA.id,
      date: '2026-04-06',
      position: 'Keys',
    })
    await markServed(entry.id, true)
    const cleared = await markServed(entry.id, null)
    expect(cleared.served).toBeUndefined()
    expect(cleared.served_at).toBeUndefined()
  })

  it('can change from true to false (mark as no-show after served)', async () => {
    const entry = await createScheduleEntry({
      teamId: team.id,
      personId: personB.id,
      date: '2026-04-13',
      position: 'Drums',
    })
    await markServed(entry.id, true)
    const updated = await markServed(entry.id, false)
    expect(updated.served).toBe(false)
  })

  it('can change from false to true (correct a mistaken no-show)', async () => {
    const entry = await createScheduleEntry({
      teamId: team.id,
      personId: personB.id,
      date: '2026-04-13',
      position: 'Bass',
    })
    await markServed(entry.id, false)
    const updated = await markServed(entry.id, true)
    expect(updated.served).toBe(true)
  })

  it('is reflected in the enriched schedule', async () => {
    const entry = await createScheduleEntry({
      teamId: team.id,
      personId: personA.id,
      date: '2026-04-20',
      position: 'Lighting',
    })
    await markServed(entry.id, true)
    const enriched = await getEnrichedSchedule(team.id)
    const found = enriched.find(e => e.entry.id === entry.id)
    expect(found?.entry.served).toBe(true)
  })

  it('does not affect other schedule entries', async () => {
    const entryA = await createScheduleEntry({
      teamId: team.id,
      personId: personA.id,
      date: '2026-04-27',
      position: 'Video',
    })
    const entryB = await createScheduleEntry({
      teamId: team.id,
      personId: personB.id,
      date: '2026-04-27',
      position: 'Audio',
    })
    await markServed(entryA.id, true)
    const enriched = await getEnrichedSchedule(team.id)
    const b = enriched.find(e => e.entry.id === entryB.id)
    expect(b?.entry.served).toBeUndefined()
  })
})

// ── getServedVolunteersInMonth ─────────────────────────────────────────────────

describe('getServedVolunteersInMonth', () => {
  it('returns 0 when no entries are marked served', async () => {
    // Create entries but don't mark them
    await createScheduleEntry({ teamId: team.id, personId: personA.id, date: '2026-05-04', position: 'Keys' })
    await createScheduleEntry({ teamId: team.id, personId: personB.id, date: '2026-05-04', position: 'Drums' })

    const result = await getServedVolunteersInMonth(2026, 5)
    expect(result.count).toBe(0)
    expect(result.person_ids).toHaveLength(0)
  })

  it('counts unique persons who served in the given month', async () => {
    const e1 = await createScheduleEntry({ teamId: team.id, personId: personA.id, date: '2026-06-01', position: 'Vocals' })
    const e2 = await createScheduleEntry({ teamId: team.id, personId: personB.id, date: '2026-06-01', position: 'Audio' })
    const e3 = await createScheduleEntry({ teamId: team.id, personId: personC.id, date: '2026-06-08', position: 'Drums' })

    await markServed(e1.id, true)
    await markServed(e2.id, true)
    await markServed(e3.id, true)

    const result = await getServedVolunteersInMonth(2026, 6)
    expect(result.count).toBe(3)
    expect(result.person_ids).toContain(personA.id)
    expect(result.person_ids).toContain(personB.id)
    expect(result.person_ids).toContain(personC.id)
  })

  it('counts each person only once even if they served multiple times in the month', async () => {
    const e1 = await createScheduleEntry({ teamId: team.id, personId: personA.id, date: '2026-07-06', position: 'Keys' })
    const e2 = await createScheduleEntry({ teamId: team.id, personId: personA.id, date: '2026-07-13', position: 'Keys' })
    const e3 = await createScheduleEntry({ teamId: team.id, personId: personA.id, date: '2026-07-20', position: 'Keys' })

    await markServed(e1.id, true)
    await markServed(e2.id, true)
    await markServed(e3.id, true)

    const result = await getServedVolunteersInMonth(2026, 7)
    // personA served 3 times but should only count as 1
    expect(result.count).toBe(1)
    expect(result.person_ids).toHaveLength(1)
    expect(result.person_ids[0]).toBe(personA.id)
  })

  it('excludes no-show entries (served=false)', async () => {
    const e1 = await createScheduleEntry({ teamId: team.id, personId: personA.id, date: '2026-08-03', position: 'Vocals' })
    const e2 = await createScheduleEntry({ teamId: team.id, personId: personB.id, date: '2026-08-03', position: 'Audio' })

    await markServed(e1.id, true)
    await markServed(e2.id, false) // no-show

    const result = await getServedVolunteersInMonth(2026, 8)
    expect(result.count).toBe(1)
    expect(result.person_ids).toContain(personA.id)
    expect(result.person_ids).not.toContain(personB.id)
  })

  it('excludes entries with no attendance mark', async () => {
    const e1 = await createScheduleEntry({ teamId: team.id, personId: personA.id, date: '2026-09-07', position: 'Vocals' })
    const e2 = await createScheduleEntry({ teamId: team.id, personId: personB.id, date: '2026-09-07', position: 'Drums' })

    await markServed(e1.id, true)
    // e2 not marked at all

    const result = await getServedVolunteersInMonth(2026, 9)
    expect(result.count).toBe(1)
    expect(result.person_ids).toContain(personA.id)
    expect(result.person_ids).not.toContain(personB.id)
  })

  it('does not include entries from adjacent months', async () => {
    // Sept 30 and Oct 1 — only Oct should count
    const e1 = await createScheduleEntry({ teamId: team.id, personId: personA.id, date: '2026-09-30', position: 'Keys' })
    const e2 = await createScheduleEntry({ teamId: team.id, personId: personB.id, date: '2026-10-04', position: 'Audio' })

    await markServed(e1.id, true)
    await markServed(e2.id, true)

    const octoberResult = await getServedVolunteersInMonth(2026, 10)
    expect(octoberResult.count).toBe(1)
    expect(octoberResult.person_ids).toContain(personB.id)
    expect(octoberResult.person_ids).not.toContain(personA.id)
  })

  it('returns correct count for month with zero-padded single digit', async () => {
    const e = await createScheduleEntry({ teamId: team.id, personId: personC.id, date: '2026-01-04', position: 'Video' })
    await markServed(e.id, true)

    const result = await getServedVolunteersInMonth(2026, 1)
    expect(result.count).toBe(1)
    expect(result.person_ids).toContain(personC.id)
  })

  it('returns 0 for a month with no schedule entries at all', async () => {
    const result = await getServedVolunteersInMonth(2030, 3)
    expect(result.count).toBe(0)
    expect(result.person_ids).toHaveLength(0)
  })

  it('mix of served and cleared entries counts only currently served', async () => {
    const e1 = await createScheduleEntry({ teamId: team.id, personId: personA.id, date: '2026-11-01', position: 'Keys' })
    const e2 = await createScheduleEntry({ teamId: team.id, personId: personB.id, date: '2026-11-01', position: 'Drums' })

    await markServed(e1.id, true)
    await markServed(e2.id, true)
    // Now undo personB
    await markServed(e2.id, null)

    const result = await getServedVolunteersInMonth(2026, 11)
    expect(result.count).toBe(1)
    expect(result.person_ids).toContain(personA.id)
    expect(result.person_ids).not.toContain(personB.id)
  })
})
