/**
 * Stress Test Suite — People Directory & Kids Check-In
 *
 * Uses @faker-js/faker seeded at 99 for reproducible data.
 * Measures in-memory DB performance at realistic church-sized loads.
 *
 * Thresholds:
 *   People search    > 300ms  ⚠️ THRESHOLD
 *   getPeople load   > 1000ms ⚠️ THRESHOLD
 *   getCheckins      > 500ms  ⚠️ THRESHOLD (N+1 session scan)
 *   Any operation    > 5000ms 🔴 BREAK
 */

import { describe, it, beforeAll, afterAll } from 'vitest'
import { faker } from '@faker-js/faker'
import { db } from '@/services'

faker.seed(99)

// ── Helpers ───────────────────────────────────────────────────────────────────

function label(ms: number, threshold: number): string {
  if (ms > 5000) return `${ms.toFixed(1)}ms 🔴 BREAK`
  if (ms > threshold) return `${ms.toFixed(1)}ms ⚠️ THRESHOLD`
  return `${ms.toFixed(1)}ms ✓`
}

function phone(): string {
  return `555${String(faker.number.int({ min: 1000000, max: 9999999 }))}`.slice(0, 10)
}

async function createPeopleBatch(count: number): Promise<string[]> {
  const ids: string[] = []
  const batchSize = 50
  for (let offset = 0; offset < count; offset += batchSize) {
    const chunk = Math.min(batchSize, count - offset)
    const created = await Promise.all(
      Array.from({ length: chunk }, () =>
        db.createPerson({
          first_name: faker.person.firstName(),
          last_name: faker.person.lastName(),
          phone: phone(),
          is_child: false,
          is_active: true,
          email: faker.internet.email(),
          membership_status: 'member',
        }),
      ),
    )
    ids.push(...created.map(p => p.id))
  }
  return ids
}

// ── 1. People Directory ───────────────────────────────────────────────────────

describe('Stress: People Directory', () => {
  const createdIds: string[] = []
  const SEARCH_THRESHOLD = 300
  const LOAD_THRESHOLD = 1000
  const scales = [100, 500, 1000, 2500, 5000] as const

  // Accumulate people across scale tiers
  const loadResults: Record<number, number> = {}
  const searchResults: Record<number, number> = {}

  beforeAll(async () => {
    // Pre-warm: build up to 5000 people total in stages so each scale tier is real
    // We create in one big batch to keep setup time manageable
    const ids = await createPeopleBatch(5000)
    createdIds.push(...ids)
  }, 120_000)

  afterAll(async () => {
    // Clean up stress test people
    await Promise.all(createdIds.map(id => db.deletePerson(id)))
  }, 30_000)

  it('measures getPeople() load time', async () => {
    // Can't easily subset — measure total load time and note total record count
    const t0 = performance.now()
    const all = await db.getPeople()
    const elapsed = performance.now() - t0
    loadResults[all.length] = elapsed

    const row = [
      `People load | total ${all.length} records: ${label(elapsed, LOAD_THRESHOLD)}`,
    ]
    console.log('\n[Stress] People Load:')
    console.log(row.join('\n'))
  })

  it('measures searchPeople() at each scale', async () => {
    // Use a unique search token embedded in one name to control what we search for
    const SEARCH_TOKEN = 'ZSTRESS'
    const targetPerson = await db.createPerson({
      first_name: `Alice${SEARCH_TOKEN}`,
      last_name: 'Johnson',
      phone: phone(),
      is_child: false,
      is_active: true,
    })
    createdIds.push(targetPerson.id)

    const rows: string[] = []

    for (const scale of scales) {
      // Ensure there are at least `scale` people in the DB (already is from beforeAll)
      const allPeople = await db.getPeople()
      const total = allPeople.length

      const t0 = performance.now()
      const results = await db.searchPeople('alice')
      const elapsed = performance.now() - t0

      searchResults[scale] = elapsed
      rows.push(`People search | ~${scale} records (total ${total}): ${label(elapsed, SEARCH_THRESHOLD)}`)
      // Only need to run once since the DB has 5000+ people
      if (scale === scales[0]) break
    }

    // Now time searches at the full scale
    const allPeople = await db.getPeople()
    for (const scale of scales) {
      const t0 = performance.now()
      await db.searchPeople('johnson')
      const elapsed = performance.now() - t0
      searchResults[scale] = elapsed
      rows.push(`People search | ${scale} (of ${allPeople.length}): ${label(elapsed, SEARCH_THRESHOLD)}`)
    }

    console.log('\n[Stress] People Search:')
    console.log(rows.join('\n'))
  })

  it('measures searchPeople() with no matches at scale', async () => {
    const t0 = performance.now()
    const results = await db.searchPeople('xyznoexist99999')
    const elapsed = performance.now() - t0

    const all = await db.getPeople()
    console.log(`\n[Stress] People Search (no match, ${all.length} records): ${label(elapsed, SEARCH_THRESHOLD)} — found ${results.length}`)
  })
})

// ── 2. Kids Check-In ─────────────────────────────────────────────────────────

describe('Stress: Kids Check-In', () => {
  const CHECKIN_THRESHOLD = 500
  const checkinScales = [10, 25, 50, 100, 200] as const
  const sessionScales = [1, 5, 10, 20, 50] as const
  const sessionIds: string[] = []
  const personIds: string[] = []

  beforeAll(async () => {
    // Create child people needed for check-ins
    const children = await Promise.all(
      Array.from({ length: 200 }, () =>
        db.createPerson({
          first_name: faker.person.firstName(),
          last_name: faker.person.lastName(),
          phone: phone(),
          is_child: true,
          is_active: true,
          grade: 'K',
        }),
      ),
    )
    personIds.push(...children.map(c => c.id))
  }, 30_000)

  afterAll(async () => {
    await Promise.all(sessionIds.map(id => db.updateCheckinSession(id, { status: 'closed' })))
    await Promise.all(personIds.map(id => db.deletePerson(id)))
  }, 30_000)

  it('measures concurrent check-in write throughput', async () => {
    const rows: string[] = ['[Stress] Check-In Write Throughput:']

    for (const scale of checkinScales) {
      const session = await db.createCheckinSession({
        name: `Stress Session ${scale}`,
        date: '2026-04-25',
        service_time: '10:00 AM',
        status: 'open',
        created_by: 'stress-test',
      })
      sessionIds.push(session.id)

      const childSlice = personIds.slice(0, scale)

      const t0 = performance.now()
      await Promise.all(
        childSlice.map((childId, i) =>
          db.createCheckin({
            session_id: session.id,
            child_id: childId,
            checked_in_by: 'kiosk-stress',
            household_id: `household-${i}`,
            pickup_code: String(1000 + i),
            kiosk_id: 'kiosk-1',
            checked_in_at: new Date().toISOString(),
            status: 'checked_in',
            label_printed: false,
          }),
        ),
      )
      const writeElapsed = performance.now() - t0

      const t1 = performance.now()
      const checkins = await db.getCheckins(session.id)
      const readElapsed = performance.now() - t1

      rows.push(
        `  ${scale} concurrent checkins — write: ${label(writeElapsed, CHECKIN_THRESHOLD)} | read ${checkins.length} back: ${label(readElapsed, 50)}`,
      )
    }

    console.log('\n' + rows.join('\n'))
  }, 60_000)

  it('measures N+1 session scan (AbsentMembersWidget pattern)', async () => {
    // Create extra sessions for N+1 scan test
    const extraSessionIds: string[] = []
    const EXTRA = 50
    for (let i = 0; i < EXTRA; i++) {
      const s = await db.createCheckinSession({
        name: `N+1 Scan Session ${i}`,
        date: '2026-03-01',
        service_time: '10:00 AM',
        status: 'closed',
        created_by: 'stress-test',
      })
      extraSessionIds.push(s.id)
    }

    const rows: string[] = ['[Stress] N+1 Session Scan (getCheckins × N sessions):']

    for (const scale of sessionScales) {
      const slice = extraSessionIds.slice(0, scale)
      const t0 = performance.now()
      await Promise.all(slice.map(id => db.getCheckins(id)))
      const elapsed = performance.now() - t0

      rows.push(`  ${scale} sessions × getCheckins: ${label(elapsed, CHECKIN_THRESHOLD)}`)
    }

    // Cleanup extra sessions
    await Promise.all(extraSessionIds.map(id => db.updateCheckinSession(id, { status: 'closed' })))

    console.log('\n' + rows.join('\n'))
  }, 30_000)
})
