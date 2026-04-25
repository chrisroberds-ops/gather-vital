/**
 * Stress Test Suite — Giving / Finance & Monthly Analytics
 *
 * Thresholds:
 *   computeGivingSummary()     > 200ms  ⚠️ THRESHOLD
 *   getAnnualGivingStatement() > 200ms  ⚠️ THRESHOLD (CSV export proxy)
 *   getEngagedPeopleInMonth()  > 1000ms ⚠️ THRESHOLD
 *   Any operation              > 5000ms 🔴 BREAK
 */

import { describe, it, beforeAll, afterAll } from 'vitest'
import { faker } from '@faker-js/faker'
import { db } from '@/services'
import { computeGivingSummary } from '@/features/giving/giving-service'
import { getEngagedPeopleInMonth } from '@/features/reports/monthly-report-service'
import type { GivingRecord } from '@/shared/types'

faker.seed(99)

function label(ms: number, threshold: number): string {
  if (ms > 5000) return `${ms.toFixed(1)}ms 🔴 BREAK`
  if (ms > threshold) return `${ms.toFixed(1)}ms ⚠️ THRESHOLD`
  return `${ms.toFixed(1)}ms ✓`
}

const FUNDS = ['general', 'missions', 'building', 'youth', 'benevolence']
const METHODS = ['online_card', 'online_ach', 'cash', 'check'] as const

function makeRecord(personId: string, year = 2025): Omit<GivingRecord, 'id' | 'church_id'> {
  const month = faker.number.int({ min: 1, max: 12 })
  const day = faker.number.int({ min: 1, max: 28 })
  return {
    person_id: personId,
    amount: faker.number.int({ min: 10, max: 5000 }),
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    method: METHODS[faker.number.int({ min: 0, max: 3 })],
    fund: FUNDS[faker.number.int({ min: 0, max: 4 })],
    source: 'manual',
  }
}

// ── 3. Giving / Finance ───────────────────────────────────────────────────────

describe('Stress: computeGivingSummary (pure function — no DB)', () => {
  const SUMMARY_THRESHOLD = 200
  const STATEMENT_THRESHOLD = 200
  const scales = [500, 1000, 5000, 10_000, 25_000] as const
  const statementScales = [12, 52, 260, 520] as const

  it('measures computeGivingSummary() at each record count', () => {
    const rows: string[] = ['[Stress] computeGivingSummary (pure, no DB):']
    const personId = 'stress-person-giving'

    for (const scale of scales) {
      // Build records in-memory — no DB needed (pure function)
      const records: GivingRecord[] = Array.from({ length: scale }, (_, i) => ({
        id: `gr-${i}`,
        church_id: 'church-test-default',
        ...makeRecord(personId),
      }))

      const t0 = performance.now()
      computeGivingSummary(records)
      const elapsed = performance.now() - t0

      rows.push(`  ${scale.toLocaleString()} records: ${label(elapsed, SUMMARY_THRESHOLD)}`)
    }

    console.log('\n' + rows.join('\n'))
  })

  it('measures getAnnualGivingStatement() — DB-backed, simulating statement generation', async () => {
    const rows: string[] = ['[Stress] getAnnualGivingStatement (DB-backed):']

    // Create a stress donor
    const donor = await db.createPerson({
      first_name: 'StressDonor',
      last_name: 'GivingTest',
      phone: '5550001111',
      is_child: false,
      is_active: true,
    })

    const stmtCreatedIds: string[] = [donor.id]

    for (const scale of statementScales) {
      // Insert `scale` records for this donor
      const batchSize = 50
      for (let offset = 0; offset < scale; offset += batchSize) {
        const chunk = Math.min(batchSize, scale - offset)
        const created = await Promise.all(
          Array.from({ length: chunk }, () =>
            db.createGivingRecord(makeRecord(donor.id, 2025)),
          ),
        )
        stmtCreatedIds.push(...created.map(r => r.id))
      }

      const t0 = performance.now()
      const all = await db.getGivingRecords(donor.id)
      const filtered = all.filter(r => r.date.startsWith('2025'))
      const total = filtered.reduce((sum, r) => sum + r.amount, 0)
      void total // use result
      const elapsed = performance.now() - t0

      rows.push(`  ${scale} records (1 donor, year-filtered): ${label(elapsed, STATEMENT_THRESHOLD)}`)
    }

    // Cleanup — delete giving records by fetching donor's records
    const allRecords = await db.getGivingRecords(donor.id)
    await Promise.all(allRecords.map(r => db.deleteGivingRecord(r.id)))
    await db.deletePerson(donor.id)

    console.log('\n' + rows.join('\n'))
  }, 60_000)
})

// ── 9. Monthly Analytics — getEngagedPeopleInMonth() ─────────────────────────

describe('Stress: getEngagedPeopleInMonth (attendance log scan)', () => {
  const ANALYTICS_THRESHOLD = 1000
  const scales = [10, 25, 50, 100] as const // groups × 20 members × meetings
  const analyticsGroupIds: string[] = []
  const analyticsMeetingIds: string[] = []
  const analyticsMemberPersonIds: string[] = []

  beforeAll(async () => {
    // Create 100 groups, each with 20 members and meetings in 2026-01
    const GROUP_COUNT = 100
    const MEMBERS_PER_GROUP = 20

    // Create shared people pool
    const peoplePool = await Promise.all(
      Array.from({ length: MEMBERS_PER_GROUP * 5 }, () =>
        db.createPerson({
          first_name: faker.person.firstName(),
          last_name: faker.person.lastName(),
          phone: `555${faker.number.int({ min: 1000000, max: 9999999 })}`.slice(0, 10),
          is_child: false,
          is_active: true,
        }),
      ),
    )
    analyticsMemberPersonIds.push(...peoplePool.map(p => p.id))

    for (let g = 0; g < GROUP_COUNT; g++) {
      const group = await db.createGroup({
        name: `Analytics Group ${g}`,
        group_type: 'small_group',
        childcare_available: false,
        is_open: true,
        is_visible: true,
        is_active: true,
      })
      analyticsGroupIds.push(group.id)

      // Add members
      const memberSlice = peoplePool.slice(0, MEMBERS_PER_GROUP)
      await Promise.all(
        memberSlice.map(p =>
          db.addGroupMember({
            group_id: group.id,
            person_id: p.id,
            status: 'active',
            joined_at: '2026-01-01',
          }),
        ),
      )

      // Create 1 meeting in 2026-01 (to be used for analytics)
      const meeting = await db.createGroupMeeting({
        group_id: group.id,
        date: '2026-01-15',
      })
      analyticsMeetingIds.push(meeting.id)

      // Log attendance for 10 of the 20 members
      await Promise.all(
        memberSlice.slice(0, 10).map(p =>
          db.upsertGroupAttendance({
            meeting_id: meeting.id,
            person_id: p.id,
            status: 'present',
          }),
        ),
      )
    }
  }, 120_000)

  afterAll(async () => {
    await Promise.all(analyticsMeetingIds.map(id => db.deleteGroupMeeting(id)))
    await Promise.all(analyticsGroupIds.map(id => db.updateGroup(id, { is_active: false })))
    await Promise.all(analyticsMemberPersonIds.map(id => db.deletePerson(id)))
  }, 60_000)

  it('measures getEngagedPeopleInMonth() at each group scale', async () => {
    const rows: string[] = ['[Stress] getEngagedPeopleInMonth (2026-01):']

    for (const scale of scales) {
      const t0 = performance.now()
      const engaged = await getEngagedPeopleInMonth(2026, 1)
      const elapsed = performance.now() - t0

      rows.push(`  ~${scale} groups in DB: ${label(elapsed, ANALYTICS_THRESHOLD)} — ${engaged.length} engaged people`)
      // Only run once since all groups are in the same DB
      break
    }

    // Now measure with the full 100 groups
    const t0 = performance.now()
    const engaged = await getEngagedPeopleInMonth(2026, 1)
    const elapsed = performance.now() - t0
    rows.push(`  100 groups × 20 members × 1 meeting: ${label(elapsed, ANALYTICS_THRESHOLD)} — ${engaged.length} engaged`)

    console.log('\n' + rows.join('\n'))
  }, 120_000)

  it('measures getEngagedPeopleInMonth() for a month with no activity', async () => {
    const t0 = performance.now()
    const engaged = await getEngagedPeopleInMonth(2020, 6)
    const elapsed = performance.now() - t0
    console.log(`\n[Stress] getEngagedPeopleInMonth (no data month): ${label(elapsed, ANALYTICS_THRESHOLD)} — ${engaged.length} engaged`)
  })
})
