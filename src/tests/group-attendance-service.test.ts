import { describe, it, expect } from 'vitest'
import { db } from '@/services'
import {
  getMeetings,
  createMeeting,
  updateMeeting,
  deleteMeeting,
  saveAttendance,
  getMeetingAttendance,
  getMeetingsWithAttendance,
  getGroupAttendanceRate,
  getMemberAttendanceRates,
  exportGroupAttendanceCsv,
} from '@/features/groups/group-attendance-service'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeGroup(name = 'Test Group') {
  return db.createGroup({
    name,
    group_type: 'small_group',
    is_open: true,
    is_visible: true,
    is_active: true,
    childcare_available: false,
  })
}

async function makePerson(first = 'Alice', last = 'Smith') {
  return db.createPerson({
    first_name: first,
    last_name: last,
    is_active: true,
    is_child: false,
  })
}

async function makeActiveGroupWithMembers(count = 3) {
  const group = await makeGroup()
  const people = await Promise.all(
    Array.from({ length: count }, (_, i) => makePerson(`Member${i}`, 'Test')),
  )
  await Promise.all(
    people.map(p => db.addGroupMember({ group_id: group.id, person_id: p.id, status: 'active', joined_at: '2025-01-01' })),
  )
  return { group, people }
}

// ── Meeting CRUD ──────────────────────────────────────────────────────────────

describe('Group meetings — CRUD', () => {
  it('creates a meeting and retrieves it', async () => {
    const { group } = await makeActiveGroupWithMembers(1)
    const meeting = await createMeeting(group.id, '2025-03-15', 'First meeting')
    expect(meeting.id).toBeTruthy()
    expect(meeting.group_id).toBe(group.id)
    expect(meeting.date).toBe('2025-03-15')
    expect(meeting.notes).toBe('First meeting')
  })

  it('getMeetings returns meetings newest-first', async () => {
    const { group } = await makeActiveGroupWithMembers(1)
    await createMeeting(group.id, '2025-01-01')
    await createMeeting(group.id, '2025-03-01')
    await createMeeting(group.id, '2025-02-01')
    const meetings = await getMeetings(group.id)
    const dates = meetings.map(m => m.date)
    expect(dates[0]).toBe('2025-03-01')
    expect(dates[dates.length - 1]).toBe('2025-01-01')
  })

  it('getMeetings only returns meetings for that group', async () => {
    const g1 = await makeGroup('Group One')
    const g2 = await makeGroup('Group Two')
    await createMeeting(g1.id, '2025-04-01')
    await createMeeting(g2.id, '2025-04-01')
    const g1Meetings = await getMeetings(g1.id)
    expect(g1Meetings.every(m => m.group_id === g1.id)).toBe(true)
  })

  it('updateMeeting changes date and notes', async () => {
    const { group } = await makeActiveGroupWithMembers(1)
    const meeting = await createMeeting(group.id, '2025-05-01', 'Original')
    const updated = await updateMeeting(meeting.id, { date: '2025-05-08', notes: 'Rescheduled' })
    expect(updated.date).toBe('2025-05-08')
    expect(updated.notes).toBe('Rescheduled')
  })

  it('deleteMeeting removes the meeting and its attendance', async () => {
    const { group, people } = await makeActiveGroupWithMembers(2)
    const meeting = await createMeeting(group.id, '2025-06-01')
    await saveAttendance(meeting.id, [
      { personId: people[0].id, status: 'present' },
      { personId: people[1].id, status: 'absent' },
    ])
    await deleteMeeting(meeting.id)
    const remaining = await getMeetings(group.id)
    expect(remaining.find(m => m.id === meeting.id)).toBeUndefined()
    const attendance = await getMeetingAttendance(meeting.id)
    expect(attendance).toHaveLength(0)
  })
})

// ── Attendance snapshots ──────────────────────────────────────────────────────

describe('Group attendance — save and retrieve', () => {
  it('saveAttendance creates records for each person', async () => {
    const { group, people } = await makeActiveGroupWithMembers(3)
    const meeting = await createMeeting(group.id, '2025-07-01')
    await saveAttendance(meeting.id, [
      { personId: people[0].id, status: 'present' },
      { personId: people[1].id, status: 'absent' },
      { personId: people[2].id, status: 'excused' },
    ])
    const records = await getMeetingAttendance(meeting.id)
    expect(records).toHaveLength(3)
    const byPerson = new Map(records.map(r => [r.person_id, r.status]))
    expect(byPerson.get(people[0].id)).toBe('present')
    expect(byPerson.get(people[1].id)).toBe('absent')
    expect(byPerson.get(people[2].id)).toBe('excused')
  })

  it('saveAttendance is idempotent — re-saving updates existing records', async () => {
    const { group, people } = await makeActiveGroupWithMembers(2)
    const meeting = await createMeeting(group.id, '2025-08-01')
    await saveAttendance(meeting.id, [{ personId: people[0].id, status: 'present' }])
    await saveAttendance(meeting.id, [{ personId: people[0].id, status: 'absent' }])
    const records = await getMeetingAttendance(meeting.id)
    const p0Records = records.filter(r => r.person_id === people[0].id)
    expect(p0Records).toHaveLength(1)
    expect(p0Records[0].status).toBe('absent')
  })

  it('getMeetingsWithAttendance returns enriched meetings with counts', async () => {
    const { group, people } = await makeActiveGroupWithMembers(3)
    const m1 = await createMeeting(group.id, '2025-09-01')
    await saveAttendance(m1.id, [
      { personId: people[0].id, status: 'present' },
      { personId: people[1].id, status: 'present' },
      { personId: people[2].id, status: 'absent' },
    ])
    const enriched = await getMeetingsWithAttendance(group.id)
    const found = enriched.find(e => e.meeting.id === m1.id)
    expect(found).toBeDefined()
    expect(found!.presentCount).toBe(2)
    expect(found!.totalCount).toBe(3)
  })
})

// ── Attendance rate calculations ──────────────────────────────────────────────

describe('Attendance rates', () => {
  it('getGroupAttendanceRate returns 0 when no meetings', async () => {
    const { group } = await makeActiveGroupWithMembers(2)
    const rate = await getGroupAttendanceRate(group.id)
    expect(rate.meetingCount).toBe(0)
    expect(rate.rate).toBe(0)
  })

  it('getGroupAttendanceRate calculates correctly when everyone attends', async () => {
    const { group, people } = await makeActiveGroupWithMembers(2)
    const m1 = await createMeeting(group.id, '2025-10-01')
    await saveAttendance(m1.id, [
      { personId: people[0].id, status: 'present' },
      { personId: people[1].id, status: 'present' },
    ])
    const rate = await getGroupAttendanceRate(group.id)
    expect(rate.meetingCount).toBe(1)
    expect(rate.presentCount).toBe(2)
    expect(rate.rate).toBe(1)
  })

  it('getGroupAttendanceRate calculates partial attendance', async () => {
    const { group, people } = await makeActiveGroupWithMembers(2)
    const m1 = await createMeeting(group.id, '2025-11-01')
    await saveAttendance(m1.id, [
      { personId: people[0].id, status: 'present' },
      { personId: people[1].id, status: 'absent' },
    ])
    const rate = await getGroupAttendanceRate(group.id)
    // 1 present out of 2 members × 1 meeting = 0.5
    expect(rate.rate).toBe(0.5)
  })

  it('getMemberAttendanceRates returns empty array when no meetings', async () => {
    const { group } = await makeActiveGroupWithMembers(2)
    const rates = await getMemberAttendanceRates(group.id)
    expect(rates).toHaveLength(0)
  })

  it('getMemberAttendanceRates calculates per-member correctly', async () => {
    const { group, people } = await makeActiveGroupWithMembers(3)
    const m1 = await createMeeting(group.id, '2025-12-01')
    const m2 = await createMeeting(group.id, '2025-12-08')
    // member[0]: 2/2 present, member[1]: 1/2, member[2]: 0/2
    await saveAttendance(m1.id, [
      { personId: people[0].id, status: 'present' },
      { personId: people[1].id, status: 'present' },
      { personId: people[2].id, status: 'absent' },
    ])
    await saveAttendance(m2.id, [
      { personId: people[0].id, status: 'present' },
      { personId: people[1].id, status: 'absent' },
      { personId: people[2].id, status: 'absent' },
    ])
    const rates = await getMemberAttendanceRates(group.id)
    expect(rates).toHaveLength(3)
    const r0 = rates.find(r => r.personId === people[0].id)!
    const r2 = rates.find(r => r.personId === people[2].id)!
    expect(r0.present).toBe(2)
    expect(r0.total).toBe(2)
    expect(r0.rate).toBe(1)
    expect(r2.present).toBe(0)
    expect(r2.rate).toBe(0)
  })

  it('getMemberAttendanceRates sorts by rate descending', async () => {
    const { group, people } = await makeActiveGroupWithMembers(2)
    const m1 = await createMeeting(group.id, '2026-01-01')
    await saveAttendance(m1.id, [
      { personId: people[0].id, status: 'absent' },
      { personId: people[1].id, status: 'present' },
    ])
    const rates = await getMemberAttendanceRates(group.id)
    expect(rates[0].rate).toBeGreaterThanOrEqual(rates[1].rate)
  })

  it('getMemberAttendanceRates only includes active members', async () => {
    const group = await makeGroup()
    const alice = await makePerson('Alice', 'Active')
    const bob = await makePerson('Bob', 'Inactive')
    await db.addGroupMember({ group_id: group.id, person_id: alice.id, status: 'active', joined_at: '2025-01-01' })
    await db.addGroupMember({ group_id: group.id, person_id: bob.id, status: 'inactive', joined_at: '2025-01-01' })
    const m1 = await createMeeting(group.id, '2026-02-01')
    await saveAttendance(m1.id, [
      { personId: alice.id, status: 'present' },
      { personId: bob.id, status: 'present' },
    ])
    const rates = await getMemberAttendanceRates(group.id)
    expect(rates.every(r => r.personId !== bob.id)).toBe(true)
    expect(rates.some(r => r.personId === alice.id)).toBe(true)
  })
})

// ── CSV export ────────────────────────────────────────────────────────────────

describe('CSV export', () => {
  it('returns just the header when there are no meetings', async () => {
    const { group } = await makeActiveGroupWithMembers(1)
    const csv = await exportGroupAttendanceCsv(group.id)
    expect(csv.trim()).toBe('"Meeting Date","Meeting Notes","Member Name","Status"')
  })

  it('includes one row per attendance record, oldest meeting first', async () => {
    const { group, people } = await makeActiveGroupWithMembers(2)
    const m1 = await createMeeting(group.id, '2025-03-01')
    const m2 = await createMeeting(group.id, '2025-04-01')
    await saveAttendance(m1.id, [{ personId: people[0].id, status: 'present' }])
    await saveAttendance(m2.id, [{ personId: people[1].id, status: 'absent' }])
    const csv = await exportGroupAttendanceCsv(group.id)
    const lines = csv.split('\n')
    // header + 2 data rows
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('Meeting Date')
    expect(lines[1]).toContain('2025-03-01')
    expect(lines[2]).toContain('2025-04-01')
  })

  it('CSV columns are in correct order', async () => {
    const { group, people } = await makeActiveGroupWithMembers(1)
    const m1 = await createMeeting(group.id, '2025-05-01', 'Test notes')
    await saveAttendance(m1.id, [{ personId: people[0].id, status: 'present' }])
    const csv = await exportGroupAttendanceCsv(group.id)
    const lines = csv.split('\n')
    const dataRow = lines[1]
    expect(dataRow).toContain('"2025-05-01"')
    expect(dataRow).toContain('"Test notes"')
    expect(dataRow).toContain('"present"')
  })

  it('CSV escapes double quotes in cell values', async () => {
    const { group, people } = await makeActiveGroupWithMembers(1)
    // Create a meeting with notes containing a double quote
    const m1 = await createMeeting(group.id, '2025-06-01', 'He said "hello"')
    await saveAttendance(m1.id, [{ personId: people[0].id, status: 'present' }])
    const csv = await exportGroupAttendanceCsv(group.id)
    // Double quotes should be escaped as ""
    expect(csv).toContain('He said ""hello""')
  })
})
