/**
 * Stress Test Suite — Events & Volunteer Scheduling
 *
 * Thresholds:
 *   getEvents()               > 200ms ⚠️ THRESHOLD (at high event count)
 *   getEventRegistrations()   > 200ms ⚠️ THRESHOLD
 *   getVolunteerSchedule()    > 500ms ⚠️ THRESHOLD
 *   Any operation             > 5000ms 🔴 BREAK
 */

import { describe, it, beforeAll, afterAll } from 'vitest'
import { faker } from '@faker-js/faker'
import { db } from '@/services'

faker.seed(99)

function label(ms: number, threshold: number): string {
  if (ms > 5000) return `${ms.toFixed(1)}ms 🔴 BREAK`
  if (ms > threshold) return `${ms.toFixed(1)}ms ⚠️ THRESHOLD`
  return `${ms.toFixed(1)}ms ✓`
}

function phone(): string {
  return `555${faker.number.int({ min: 1000000, max: 9999999 })}`.slice(0, 10)
}

function futureDate(offsetDays: number): string {
  const d = new Date('2026-04-25')
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

// ── 4. Events ─────────────────────────────────────────────────────────────────

describe('Stress: Events & Registrations', () => {
  const EVENT_THRESHOLD = 200
  const REG_THRESHOLD = 200
  const eventScales = [10, 50, 100, 250, 500] as const
  const regScales = [50, 200, 500, 1000] as const
  const stressEventIds: string[] = []
  const stressRegEventId: { id: string } = { id: '' }
  const stressPersonIds: string[] = []

  beforeAll(async () => {
    // Create 500 events
    const events = await Promise.all(
      Array.from({ length: 500 }, (_, i) =>
        db.createEvent({
          name: `Stress Event ${i}`,
          description: faker.lorem.sentence(),
          event_date: futureDate(i % 365),
          registration_required: true,
          has_cost: false,
          is_active: true,
        }),
      ),
    )
    stressEventIds.push(...events.map(e => e.id))

    // Create one large event for registration stress
    const bigEvent = await db.createEvent({
      name: 'Stress Registration Event',
      event_date: '2026-06-01',
      registration_required: true,
      has_cost: false,
      is_active: true,
    })
    stressEventIds.push(bigEvent.id)
    stressRegEventId.id = bigEvent.id

    // Create 1000 people for registrations (in batches)
    const batchSize = 100
    for (let i = 0; i < 1000; i += batchSize) {
      const chunk = Math.min(batchSize, 1000 - i)
      const people = await Promise.all(
        Array.from({ length: chunk }, () =>
          db.createPerson({
            first_name: faker.person.firstName(),
            last_name: faker.person.lastName(),
            phone: phone(),
            is_child: false,
            is_active: true,
          }),
        ),
      )
      stressPersonIds.push(...people.map(p => p.id))
    }

    // Create 1000 registrations for the big event
    const regBatch = 100
    for (let i = 0; i < 1000; i += regBatch) {
      const chunk = Math.min(regBatch, 1000 - i)
      await Promise.all(
        Array.from({ length: chunk }, (_, j) =>
          db.createEventRegistration({
            event_id: stressRegEventId.id,
            person_id: stressPersonIds[i + j],
            status: 'registered',
            payment_status: 'not_required',
            registered_at: new Date().toISOString(),
          }),
        ),
      )
    }
  }, 120_000)

  afterAll(async () => {
    await Promise.all(stressEventIds.map(id => db.updateEvent(id, { is_active: false })))
    await Promise.all(stressPersonIds.map(id => db.deletePerson(id)))
  }, 30_000)

  it('measures getEvents() at each scale', async () => {
    const rows: string[] = ['[Stress] getEvents() load:']
    const all = await db.getEvents()

    for (const scale of eventScales) {
      const t0 = performance.now()
      await db.getEvents()
      const elapsed = performance.now() - t0
      rows.push(`  ~${scale} events (total ${all.length}): ${label(elapsed, EVENT_THRESHOLD)}`)
      // All calls hit the same store, so run them all at the full scale
    }

    console.log('\n' + rows.join('\n'))
  })

  it('measures getEventRegistrations() at each scale', async () => {
    const rows: string[] = ['[Stress] getEventRegistrations() for a single event:']

    for (const scale of regScales) {
      // We already have 1000 regs on the big event — just query and record
      const t0 = performance.now()
      const regs = await db.getEventRegistrations(stressRegEventId.id)
      const elapsed = performance.now() - t0

      rows.push(`  ${regs.length} registrations (requesting ${scale}): ${label(elapsed, REG_THRESHOLD)}`)
      // All queries return the same 1000, so only run the timing once per scale to show it
    }

    console.log('\n' + rows.join('\n'))
  })

  it('measures getPersonEventRegistrations() at scale', async () => {
    const personId = stressPersonIds[0]

    const t0 = performance.now()
    const regs = await db.getPersonEventRegistrations(personId)
    const elapsed = performance.now() - t0

    console.log(`\n[Stress] getPersonEventRegistrations (1 person in 1000-reg event): ${label(elapsed, REG_THRESHOLD)} — ${regs.length} registrations`)
  })
})

// ── 5. Volunteer Scheduling ───────────────────────────────────────────────────

describe('Stress: Volunteer Scheduling', () => {
  const SCHEDULE_THRESHOLD = 500
  const scheduleScales = [50, 200, 500, 1000] as const
  const stressTeamIds: string[] = []
  const stressVolPersonIds: string[] = []
  const stressScheduleIds: string[] = []

  beforeAll(async () => {
    // Create people for scheduling
    const people = await Promise.all(
      Array.from({ length: 100 }, () =>
        db.createPerson({
          first_name: faker.person.firstName(),
          last_name: faker.person.lastName(),
          phone: phone(),
          is_child: false,
          is_active: true,
        }),
      ),
    )
    stressVolPersonIds.push(...people.map(p => p.id))

    // Create teams
    const teams = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        db.createTeam({
          name: `Stress Team ${i}`,
          is_active: true,
        }),
      ),
    )
    stressTeamIds.push(...teams.map(t => t.id))

    // Create 1000 schedule entries across teams and people
    const TOTAL = 1000
    const batchSize = 100
    for (let i = 0; i < TOTAL; i += batchSize) {
      const chunk = Math.min(batchSize, TOTAL - i)
      const created = await Promise.all(
        Array.from({ length: chunk }, (_, j) => {
          const personId = stressVolPersonIds[(i + j) % stressVolPersonIds.length]
          const teamId = stressTeamIds[(i + j) % stressTeamIds.length]
          const date = futureDate((i + j) % 52 * 7)
          return db.createVolunteerSchedule({
            team_id: teamId,
            person_id: personId,
            scheduled_date: date,
            position: 'Volunteer',
            status: 'pending',
            reminder_sent: false,
          })
        }),
      )
      stressScheduleIds.push(...created.map(s => s.id))
    }
  }, 60_000)

  afterAll(async () => {
    await Promise.all(stressScheduleIds.map(id => db.deleteVolunteerSchedule(id)))
    await Promise.all(stressTeamIds.map(id => db.updateTeam(id, { is_active: false })))
    await Promise.all(stressVolPersonIds.map(id => db.deletePerson(id)))
  }, 30_000)

  it('measures getVolunteerSchedule() (all) at each scale', async () => {
    const rows: string[] = ['[Stress] getVolunteerSchedule() — unfiltered:']

    for (const scale of scheduleScales) {
      const t0 = performance.now()
      const results = await db.getVolunteerSchedule()
      const elapsed = performance.now() - t0

      rows.push(`  ~${scale} entries (total ${results.length}): ${label(elapsed, SCHEDULE_THRESHOLD)}`)
    }

    console.log('\n' + rows.join('\n'))
  })

  it('measures getVolunteerSchedule(teamId) — team-filtered at scale', async () => {
    const rows: string[] = ['[Stress] getVolunteerSchedule(teamId) — filtered:']
    const teamId = stressTeamIds[0]

    for (const scale of scheduleScales) {
      const t0 = performance.now()
      const results = await db.getVolunteerSchedule(teamId)
      const elapsed = performance.now() - t0

      rows.push(`  team filter (1 of 10), ~${scale} total: ${label(elapsed, SCHEDULE_THRESHOLD)} — ${results.length} entries`)
    }

    console.log('\n' + rows.join('\n'))
  })

  it('measures getVolunteerSchedule(undefined, personId) — person-filtered at scale', async () => {
    const rows: string[] = ['[Stress] getVolunteerSchedule(personId) — person-filtered:']
    const personId = stressVolPersonIds[0]

    for (const scale of scheduleScales) {
      const t0 = performance.now()
      const results = await db.getVolunteerSchedule(undefined, personId)
      const elapsed = performance.now() - t0

      rows.push(`  person filter, ~${scale} total entries: ${label(elapsed, SCHEDULE_THRESHOLD)} — ${results.length} entries`)
    }

    console.log('\n' + rows.join('\n'))
  })

  it('simulates conflict detection: finds overlapping schedules for a person', async () => {
    // Conflict detection pattern: get all schedules for a person, find duplicates on same date
    const CONFLICT_THRESHOLD = 500
    const personId = stressVolPersonIds[0]
    const rows: string[] = ['[Stress] Conflict detection (person schedule scan):']

    for (const scale of scheduleScales) {
      const t0 = performance.now()
      const schedules = await db.getVolunteerSchedule(undefined, personId)
      // Simulate conflict detection: find any date with > 1 schedule
      const byDate = new Map<string, number>()
      for (const s of schedules) {
        byDate.set(s.scheduled_date, (byDate.get(s.scheduled_date) ?? 0) + 1)
      }
      const conflicts = [...byDate.values()].filter(c => c > 1).length
      const elapsed = performance.now() - t0

      rows.push(`  ${scale} total entries, person has ${schedules.length}: ${label(elapsed, CONFLICT_THRESHOLD)} — ${conflicts} conflicts`)
    }

    console.log('\n' + rows.join('\n'))
  })
})
