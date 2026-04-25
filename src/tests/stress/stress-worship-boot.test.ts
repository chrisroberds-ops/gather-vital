/**
 * Stress Test Suite — Worship / Service Plans & In-Memory DB Boot
 *
 * Thresholds:
 *   getSongs() load          > 500ms ⚠️ THRESHOLD
 *   Song search (client)     > 200ms ⚠️ THRESHOLD
 *   Service plan query       > 200ms ⚠️ THRESHOLD
 *   DB "boot" (full load)    > 2000ms ⚠️ THRESHOLD
 *   Any operation            > 5000ms 🔴 BREAK
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

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'Ab', 'Bb', 'Eb']
const GENRES = ['contemporary', 'traditional', 'hymn', 'worship', 'gospel']

// ── 8. Worship / Service Plans ────────────────────────────────────────────────

describe('Stress: Song Library & Service Plans', () => {
  const SONGS_LOAD_THRESHOLD = 500
  const SONG_SEARCH_THRESHOLD = 200
  const PLAN_QUERY_THRESHOLD = 200

  const songScales = [50, 200, 500, 1000] as const
  const planScales = [5, 20, 50, 100] as const
  const stressSongIds: string[] = []
  const stressPlanIds: string[] = []

  beforeAll(async () => {
    // Create 1000 songs in batches
    const TOTAL_SONGS = 1000
    const batchSize = 100
    for (let i = 0; i < TOTAL_SONGS; i += batchSize) {
      const chunk = Math.min(batchSize, TOTAL_SONGS - i)
      const created = await Promise.all(
        Array.from({ length: chunk }, (_, j) => {
          const idx = i + j
          return db.createSong({
            title: `${faker.word.adjective()} ${faker.word.noun()} ${idx}`,
            artist: faker.person.fullName(),
            key: KEYS[idx % KEYS.length],
            bpm: faker.number.int({ min: 60, max: 160 }),
            tags: [GENRES[idx % GENRES.length]],
            ccli_number: String(faker.number.int({ min: 100000, max: 9999999 })),
            is_active: true,
          })
        }),
      )
      stressSongIds.push(...created.map(s => s.id))
    }

    // Create 100 service plans, each with 10 items
    const TOTAL_PLANS = 100
    for (let i = 0; i < TOTAL_PLANS; i++) {
      const d = new Date('2026-01-01')
      d.setDate(d.getDate() + i * 7)
      const plan = await db.createServicePlan({
        name: `Stress Service ${i}`,
        service_date: d.toISOString().slice(0, 10),
        is_finalized: false,
        created_by: 'stress-test',
      })
      stressPlanIds.push(plan.id)

      // Add 10 items to each plan
      await Promise.all(
        Array.from({ length: 10 }, (_, j) =>
          db.createServicePlanItem({
            plan_id: plan.id,
            item_type: 'song',
            position: j,
            song_id: stressSongIds[j % stressSongIds.length],
          }),
        ),
      )
    }
  }, 120_000)

  afterAll(async () => {
    // Delete all plan items and plans
    await Promise.all(
      stressPlanIds.map(async id => {
        const items = await db.getServicePlanItems(id)
        await Promise.all(items.map(item => db.deleteServicePlanItem(item.id)))
        await db.deleteServicePlan(id)
      }),
    )
    await Promise.all(stressSongIds.map(id => db.deleteSong(id)))
  }, 60_000)

  it('measures getSongs() at each scale', async () => {
    const rows: string[] = ['[Stress] getSongs() load:']
    const allSongs = await db.getSongs()

    for (const scale of songScales) {
      const t0 = performance.now()
      const songs = await db.getSongs()
      const elapsed = performance.now() - t0

      rows.push(`  ~${scale} songs (total ${songs.length}): ${label(elapsed, SONGS_LOAD_THRESHOLD)}`)
    }

    console.log('\n' + rows.join('\n'))
    console.log(`  (Seed data + 1000 stress songs = ${allSongs.length} total)`)
  })

  it('measures client-side song search (filter by title) at scale', async () => {
    const rows: string[] = ['[Stress] Client-side song search (title substring):']
    const allSongs = await db.getSongs()

    for (const scale of songScales) {
      const t0 = performance.now()
      const songs = await db.getSongs()
      const results = songs.filter(s =>
        s.title.toLowerCase().includes('the') ||
        (s.artist ?? '').toLowerCase().includes('the')
      )
      const elapsed = performance.now() - t0

      rows.push(
        `  ${songs.length} songs (target ~${scale}): ${label(elapsed, SONG_SEARCH_THRESHOLD)} — ${results.length} matches`,
      )
    }

    console.log('\n' + rows.join('\n'))
  })

  it('measures getServicePlanItems() at each plan scale', async () => {
    const rows: string[] = ['[Stress] getServicePlanItems (10 items per plan):']

    for (const scale of planScales) {
      const slice = stressPlanIds.slice(0, scale)

      const t0 = performance.now()
      await Promise.all(slice.map(id => db.getServicePlanItems(id)))
      const elapsed = performance.now() - t0

      rows.push(`  ${scale} plans × 10 items (${scale * 10} total item reads): ${label(elapsed, PLAN_QUERY_THRESHOLD)}`)
    }

    console.log('\n' + rows.join('\n'))
  })

  it('measures getServicePlans() list at scale', async () => {
    const t0 = performance.now()
    const plans = await db.getServicePlans()
    const elapsed = performance.now() - t0

    console.log(`\n[Stress] getServicePlans() (${plans.length} total including seed): ${label(elapsed, PLAN_QUERY_THRESHOLD)}`)
  })
})

// ── 10. In-Memory DB "Boot" — simulated cold start ───────────────────────────

describe('Stress: In-Memory DB Boot / Cold Start Simulation', () => {
  const BOOT_THRESHOLD = 2000

  /**
   * "Boot" = parallel query of all major collections simultaneously,
   * simulating what the AdminDashboard does on initial mount.
   * This is the closest approximation to "boot time" for an in-memory store.
   */
  it('measures parallel multi-collection load (small church: ~150 people)', async () => {
    const t0 = performance.now()
    await Promise.all([
      db.getPeople(),
      db.getHouseholds(),
      db.getCheckinSessions(),
      db.getTeams(),
      db.getGroups(true),
      db.getEvents(),
      db.getGivingRecords(),
      db.getVisitorFollowups(),
      db.getAttendanceEntries(),
      db.getSongs(),
      db.getServicePlans(),
    ])
    const elapsed = performance.now() - t0

    console.log(`\n[Stress] Boot simulation (all collections parallel, seed data ~150 people): ${label(elapsed, BOOT_THRESHOLD)}`)
  })

  it('measures boot time for medium church: ~500 people', async () => {
    const MEDIUM_PEOPLE = 350 // seed has ~150, adding 350 = 500 total
    const batchSize = 50
    const createdIds: string[] = []

    for (let i = 0; i < MEDIUM_PEOPLE; i += batchSize) {
      const chunk = Math.min(batchSize, MEDIUM_PEOPLE - i)
      const created = await Promise.all(
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
      createdIds.push(...created.map(p => p.id))
    }

    const t0 = performance.now()
    await Promise.all([
      db.getPeople(),
      db.getHouseholds(),
      db.getCheckinSessions(),
      db.getTeams(),
      db.getGroups(true),
      db.getEvents(),
      db.getGivingRecords(),
      db.getVisitorFollowups(),
      db.getAttendanceEntries(),
      db.getSongs(),
      db.getServicePlans(),
    ])
    const elapsed = performance.now() - t0

    const allPeople = await db.getPeople()
    console.log(`\n[Stress] Boot simulation (medium church ~${allPeople.length} people): ${label(elapsed, BOOT_THRESHOLD)}`)

    // Cleanup
    await Promise.all(createdIds.map(id => db.deletePerson(id)))
  }, 60_000)

  it('measures boot time for large church: ~1500 people', async () => {
    const LARGE_PEOPLE = 1350 // seed ~150, adding 1350 = ~1500
    const batchSize = 100
    const createdIds: string[] = []

    for (let i = 0; i < LARGE_PEOPLE; i += batchSize) {
      const chunk = Math.min(batchSize, LARGE_PEOPLE - i)
      const created = await Promise.all(
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
      createdIds.push(...created.map(p => p.id))
    }

    const t0 = performance.now()
    await Promise.all([
      db.getPeople(),
      db.getHouseholds(),
      db.getCheckinSessions(),
      db.getTeams(),
      db.getGroups(true),
      db.getEvents(),
      db.getGivingRecords(),
      db.getVisitorFollowups(),
      db.getAttendanceEntries(),
      db.getSongs(),
      db.getServicePlans(),
    ])
    const elapsed = performance.now() - t0

    const allPeople = await db.getPeople()
    console.log(`\n[Stress] Boot simulation (large church ~${allPeople.length} people): ${label(elapsed, BOOT_THRESHOLD)}`)

    // Cleanup
    await Promise.all(createdIds.map(id => db.deletePerson(id)))
  }, 120_000)

  it('measures sequential insertions — 5-year history simulation', async () => {
    /**
     * Simulating 5 years of attendance data:
     *   52 weeks × 5 years = 260 Sunday services
     *   Each service: 1 session + ~100 checkins = 260 sessions + 26,000 checkins
     *
     * This is too expensive to actually insert — instead measure 1 year (52 sessions)
     * and extrapolate.
     */
    const ONE_YEAR_SESSIONS = 52
    const CHECKINS_PER_SESSION = 20

    // Create a few test children
    const children = await Promise.all(
      Array.from({ length: CHECKINS_PER_SESSION }, () =>
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
    const childIds = children.map(c => c.id)

    const t0 = performance.now()
    const sessionIds: string[] = []

    for (let week = 0; week < ONE_YEAR_SESSIONS; week++) {
      const d = new Date('2025-01-05')
      d.setDate(d.getDate() + week * 7)
      const session = await db.createCheckinSession({
        name: `Sunday ${week}`,
        date: d.toISOString().slice(0, 10),
        service_time: '10:00 AM',
        status: 'closed',
        created_by: 'stress-test',
      })
      sessionIds.push(session.id)

      await Promise.all(
        childIds.map((childId, i) =>
          db.createCheckin({
            session_id: session.id,
            child_id: childId,
            checked_in_by: 'kiosk-stress',
            household_id: `hh-${i}`,
            pickup_code: String(2000 + i),
            kiosk_id: 'kiosk-1',
            checked_in_at: d.toISOString(),
            status: 'checked_out',
            label_printed: false,
          }),
        ),
      )
    }
    const insertElapsed = performance.now() - t0

    // Measure query after
    const t1 = performance.now()
    await db.getCheckinSessions()
    const queryElapsed = performance.now() - t1

    const totalRecords = ONE_YEAR_SESSIONS * CHECKINS_PER_SESSION
    console.log(`\n[Stress] 1-year history insert (${ONE_YEAR_SESSIONS} sessions × ${CHECKINS_PER_SESSION} checkins = ${totalRecords} records):`)
    console.log(`  Insert: ${label(insertElapsed, BOOT_THRESHOLD)}`)
    console.log(`  getCheckinSessions query after: ${label(queryElapsed, 200)}`)
    console.log(`  Extrapolated 5-year insert: ~${(insertElapsed * 5).toFixed(0)}ms`)

    // Cleanup
    await Promise.all(childIds.map(id => db.deletePerson(id)))
  }, 120_000)
})
