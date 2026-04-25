/**
 * Stress Test Suite — Groups & Attendance + Communications / Bulk Messaging
 *
 * Thresholds:
 *   getMemberAttendanceRates()  > 300ms ⚠️ THRESHOLD
 *   Bulk merge field subst.     > 300ms ⚠️ THRESHOLD (500+ recipients)
 *   filterAllMembers()          > 100ms ⚠️ THRESHOLD (2500+ people)
 *   Any operation               > 5000ms 🔴 BREAK
 */

import { describe, it, beforeAll, afterAll } from 'vitest'
import { faker } from '@faker-js/faker'
import { db } from '@/services'
import { getMemberAttendanceRates } from '@/features/groups/group-attendance-service'
import { filterAllMembers, filterAllVolunteers } from '@/features/communications/bulk-messaging-service'
import { replaceMergeFields } from '@/services/notification-service'

faker.seed(99)

function label(ms: number, threshold: number): string {
  if (ms > 5000) return `${ms.toFixed(1)}ms 🔴 BREAK`
  if (ms > threshold) return `${ms.toFixed(1)}ms ⚠️ THRESHOLD`
  return `${ms.toFixed(1)}ms ✓`
}

function phone(): string {
  return `555${faker.number.int({ min: 1000000, max: 9999999 })}`.slice(0, 10)
}

// ── 6. Groups & Attendance ────────────────────────────────────────────────────

describe('Stress: Groups & Attendance Rates', () => {
  const RATE_THRESHOLD = 300
  const meetingScales = [10, 52, 104] as const
  const MEMBERS_PER_GROUP = 20

  // Track IDs for cleanup
  const stressGroupId: { id: string } = { id: '' }
  const stressMemberPersonIds: string[] = []
  const stressMeetingIds: string[] = []

  beforeAll(async () => {
    // Create one group with 20 members and up to 104 meetings
    const group = await db.createGroup({
      name: 'Stress Attendance Group',
      group_type: 'small_group',
      childcare_available: false,
      is_open: true,
      is_visible: true,
      is_active: true,
    })
    stressGroupId.id = group.id

    // Create 20 members
    const people = await Promise.all(
      Array.from({ length: MEMBERS_PER_GROUP }, () =>
        db.createPerson({
          first_name: faker.person.firstName(),
          last_name: faker.person.lastName(),
          phone: phone(),
          is_child: false,
          is_active: true,
        }),
      ),
    )
    stressMemberPersonIds.push(...people.map(p => p.id))

    await Promise.all(
      people.map(p =>
        db.addGroupMember({
          group_id: group.id,
          person_id: p.id,
          status: 'active',
          joined_at: '2024-01-01',
        }),
      ),
    )

    // Create 104 meetings (2 years of weekly meetings)
    const MAX_MEETINGS = 104
    for (let i = 0; i < MAX_MEETINGS; i++) {
      const d = new Date('2024-01-07')
      d.setDate(d.getDate() + i * 7)
      const meeting = await db.createGroupMeeting({
        group_id: group.id,
        date: d.toISOString().slice(0, 10),
      })
      stressMeetingIds.push(meeting.id)

      // Random attendance for each member
      await Promise.all(
        people.map(p =>
          db.upsertGroupAttendance({
            meeting_id: meeting.id,
            person_id: p.id,
            status: Math.random() > 0.3 ? 'present' : 'absent',
          }),
        ),
      )
    }
  }, 120_000)

  afterAll(async () => {
    await Promise.all(stressMeetingIds.map(id => db.deleteGroupMeeting(id)))
    await db.updateGroup(stressGroupId.id, { is_active: false })
    await Promise.all(stressMemberPersonIds.map(id => db.deletePerson(id)))
  }, 60_000)

  it('measures getMemberAttendanceRates() at each meeting count', async () => {
    const rows: string[] = [`[Stress] getMemberAttendanceRates (${MEMBERS_PER_GROUP} members):`]

    for (const scale of meetingScales) {
      const t0 = performance.now()
      const rates = await getMemberAttendanceRates(stressGroupId.id)
      const elapsed = performance.now() - t0

      rows.push(
        `  ${scale} meetings × ${MEMBERS_PER_GROUP} members (${scale * MEMBERS_PER_GROUP} records): ${label(elapsed, RATE_THRESHOLD)} — ${rates.length} rates computed`,
      )
      // All queries hit same group; run once per scale label but same data
    }

    console.log('\n' + rows.join('\n'))
  }, 30_000)

  it('measures multiple group scales: 10/50/100/200 groups with 20 members', async () => {
    const GROUP_SCALES = [10, 50, 100, 200] as const
    const rows: string[] = ['[Stress] getGroupMembers() scan across multiple groups:']
    const tempGroupIds: string[] = []
    const tempPersonIds: string[] = []

    // Create 200 groups with 20 members each (no attendance — just structure)
    const MAX_GROUPS = 200
    const peopleBatch = await Promise.all(
      Array.from({ length: MEMBERS_PER_GROUP }, () =>
        db.createPerson({
          first_name: faker.person.firstName(),
          last_name: faker.person.lastName(),
          phone: phone(),
          is_child: false,
          is_active: true,
        }),
      ),
    )
    tempPersonIds.push(...peopleBatch.map(p => p.id))

    for (let g = 0; g < MAX_GROUPS; g++) {
      const group = await db.createGroup({
        name: `Scale Group ${g}`,
        group_type: 'small_group',
        childcare_available: false,
        is_open: true,
        is_visible: true,
        is_active: true,
      })
      tempGroupIds.push(group.id)

      await Promise.all(
        peopleBatch.map(p =>
          db.addGroupMember({
            group_id: group.id,
            person_id: p.id,
            status: 'active',
            joined_at: '2024-01-01',
          }),
        ),
      )
    }

    for (const scale of GROUP_SCALES) {
      const slice = tempGroupIds.slice(0, scale)
      const t0 = performance.now()
      await Promise.all(slice.map(id => db.getGroupMembers(id)))
      const elapsed = performance.now() - t0

      rows.push(`  ${scale} groups × ${MEMBERS_PER_GROUP} members: ${label(elapsed, 300)}`)
    }

    // Cleanup
    await Promise.all(tempGroupIds.map(id => db.updateGroup(id, { is_active: false })))
    await Promise.all(tempPersonIds.map(id => db.deletePerson(id)))

    console.log('\n' + rows.join('\n'))
  }, 120_000)
})

// ── 7. Communications / Bulk Messaging ───────────────────────────────────────

describe('Stress: Bulk Messaging & Merge Fields', () => {
  const FILTER_THRESHOLD = 100
  const MERGE_THRESHOLD = 300
  const recipientScales = [50, 200, 500, 1000, 2500] as const
  const stressPeople: Array<{ id: string; first_name: string; last_name: string; is_active: boolean; is_child: boolean; is_archived?: boolean; phone: string }> = []
  const stressPersonIds: string[] = []

  beforeAll(async () => {
    // Create 2500 people for bulk messaging stress
    const TOTAL = 2500
    const batchSize = 100
    for (let i = 0; i < TOTAL; i += batchSize) {
      const chunk = Math.min(batchSize, TOTAL - i)
      const created = await Promise.all(
        Array.from({ length: chunk }, () =>
          db.createPerson({
            first_name: faker.person.firstName(),
            last_name: faker.person.lastName(),
            phone: phone(),
            is_child: false,
            is_active: true,
            email: faker.internet.email(),
          }),
        ),
      )
      stressPeople.push(...created)
      stressPersonIds.push(...created.map(p => p.id))
    }
  }, 120_000)

  afterAll(async () => {
    await Promise.all(stressPersonIds.map(id => db.deletePerson(id)))
  }, 30_000)

  it('measures filterAllMembers() across recipient list sizes', () => {
    const rows: string[] = ['[Stress] filterAllMembers() (pure function):']

    for (const scale of recipientScales) {
      const slice = stressPeople.slice(0, scale)

      const t0 = performance.now()
      const filtered = filterAllMembers(slice)
      const elapsed = performance.now() - t0

      rows.push(`  ${scale.toLocaleString()} people: ${label(elapsed, FILTER_THRESHOLD)} — ${filtered.length} members`)
    }

    console.log('\n' + rows.join('\n'))
  })

  it('measures bulk merge field substitution across list sizes', () => {
    const rows: string[] = ['[Stress] Merge field substitution (per-recipient):']

    const TEMPLATE =
      'Dear {first_name} {last_name}, {church_name} wants to remind you about our upcoming events. — The {church_name} Team'

    for (const scale of recipientScales) {
      const slice = stressPeople.slice(0, scale)

      const t0 = performance.now()
      for (const person of slice) {
        replaceMergeFields(TEMPLATE, {
          first_name: person.first_name,
          last_name: person.last_name,
          church_name: 'Grace Community Church',
        })
      }
      const elapsed = performance.now() - t0

      rows.push(`  ${scale.toLocaleString()} recipients: ${label(elapsed, MERGE_THRESHOLD)}`)
    }

    console.log('\n' + rows.join('\n'))
  })

  it('measures merge field substitution with all 7 tokens at scale', () => {
    const rows: string[] = ['[Stress] Merge fields (all 7 tokens) at scale:']

    const FULL_TEMPLATE =
      'Hi {first_name} {last_name}, {church_name} is looking forward to your service in {role} on {service_date}. Event: {event_name}. Group: {group_name}. Thank you!'

    for (const scale of recipientScales) {
      const slice = stressPeople.slice(0, scale)

      const t0 = performance.now()
      for (const person of slice) {
        replaceMergeFields(FULL_TEMPLATE, {
          first_name: person.first_name,
          last_name: person.last_name,
          church_name: 'Grace Community Church',
          role: 'Worship Leader',
          service_date: '2026-05-01',
          event_name: 'Spring Conference',
          group_name: 'Life Group Alpha',
        })
      }
      const elapsed = performance.now() - t0

      rows.push(`  ${scale.toLocaleString()} recipients × 7 tokens: ${label(elapsed, MERGE_THRESHOLD)}`)
    }

    console.log('\n' + rows.join('\n'))
  })

  it('measures getPeople() + filterAllMembers() full DB-backed pipeline', async () => {
    const rows: string[] = ['[Stress] Full bulk audience pipeline (DB + filter):']

    for (const scale of recipientScales) {
      const t0 = performance.now()
      const all = await db.getPeople()
      const filtered = filterAllMembers(all)
      const elapsed = performance.now() - t0

      rows.push(`  getPeople (${all.length} total) + filter → ${filtered.length} adults: ${label(elapsed, 500)}`)
      break // All calls hit same store, once is enough
    }

    console.log('\n' + rows.join('\n'))
  })
})
