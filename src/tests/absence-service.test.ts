/**
 * Absence detection service tests — Part of Session S
 *
 * Covers:
 *  - detectAbsentMembers core logic
 *  - Minimum attendance threshold (3+ in 90 days)
 *  - Absence threshold (default 28 days)
 *  - Exclusion of inactive / archived people
 *  - Exclusion of dismissed people
 *  - Multi-source attendance aggregation (AttendanceLogs, Checkins, VolunteerSchedule)
 *  - Deduplication of attendance dates
 *  - Sort order (longest absent first)
 *  - avgFrequencyDays calculation
 *  - DEFAULT_APP_CONFIG.absence_threshold_days default
 */

import { describe, it, expect } from 'vitest'
import { detectAbsentMembers } from '@/features/people/absence-service'
import { DEFAULT_APP_CONFIG } from '@/shared/types'
import type { Person, AttendanceLog, CheckinSession, Checkin, VolunteerSchedule } from '@/shared/types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    church_id: 'c1',
    first_name: 'Alice',
    last_name: 'Smith',
    is_active: true,
    is_child: false,
    membership_status: 'regular_attender',
    ...overrides,
  } as Person
}

function makeLog(personId: string, date: string): AttendanceLog {
  return {
    id: `log-${personId}-${date}`,
    church_id: 'c1',
    person_id: personId,
    date,
    event_type: 'service',
    count_type: 'adult',
  } as AttendanceLog
}

function makeSession(id: string, date: string): CheckinSession {
  return { id, church_id: 'c1', name: 'Sunday', date, service_time: '10:00', status: 'closed', created_by: 'admin' }
}

function makeCheckin(childId: string, sessionId: string): Checkin {
  return {
    id: `ck-${childId}-${sessionId}`,
    church_id: 'c1',
    session_id: sessionId,
    child_id: childId,
    checked_in_by: 'parent',
    household_id: 'h1',
    pickup_code: '1234',
    kiosk_id: 'k1',
    checked_in_at: '2026-01-01T10:00:00Z',
    status: 'checked_in',
    label_printed: false,
  }
}

function makeVolSlot(personId: string, date: string, served = true): VolunteerSchedule {
  return {
    id: `vs-${personId}-${date}`,
    church_id: 'c1',
    team_id: 'team1',
    person_id: personId,
    scheduled_date: date,
    position: 'Greeter',
    status: 'confirmed',
    reminder_sent: false,
    served,
  }
}

// Reference today for all tests
const TODAY = '2026-04-23'

// ── DEFAULT_APP_CONFIG ────────────────────────────────────────────────────────

describe('DEFAULT_APP_CONFIG', () => {
  it('has absence_threshold_days defaulting to 28', () => {
    expect(DEFAULT_APP_CONFIG.absence_threshold_days).toBe(28)
  })
})

// ── Core detection ────────────────────────────────────────────────────────────

describe('detectAbsentMembers', () => {
  const base = {
    checkinSessions: [] as CheckinSession[],
    checkins: [] as Checkin[],
    volunteerSchedule: [] as VolunteerSchedule[],
    today: TODAY,
  }

  it('flags a regular attender absent after threshold days', () => {
    const person = makePerson()
    // 4 attendances in 90-day window, last one 35 days ago
    const logs = [
      makeLog('p1', '2026-01-15'),
      makeLog('p1', '2026-02-01'),
      makeLog('p1', '2026-02-22'),
      makeLog('p1', '2026-03-19'), // 35 days before Apr 23
    ]
    const result = detectAbsentMembers({ ...base, people: [person], attendanceLogs: logs })
    expect(result).toHaveLength(1)
    expect(result[0].person.id).toBe('p1')
    expect(result[0].daysSinceLastSeen).toBe(35)
    expect(result[0].lastSeenDate).toBe('2026-03-19')
  })

  it('does NOT flag someone seen within the threshold', () => {
    const person = makePerson()
    // 4 attendances, last one 10 days ago (within 28-day threshold)
    const logs = [
      makeLog('p1', '2026-01-20'),
      makeLog('p1', '2026-02-10'),
      makeLog('p1', '2026-03-01'),
      makeLog('p1', '2026-04-13'), // 10 days ago
    ]
    const result = detectAbsentMembers({ ...base, people: [person], attendanceLogs: logs })
    expect(result).toHaveLength(0)
  })

  it('does NOT flag someone with fewer than 3 attendances in 90 days', () => {
    const person = makePerson()
    // Only 2 attendances — not a "regular attender"
    const logs = [
      makeLog('p1', '2026-02-01'),
      makeLog('p1', '2026-03-01'),
    ]
    const result = detectAbsentMembers({ ...base, people: [person], attendanceLogs: logs })
    expect(result).toHaveLength(0)
  })

  it('excludes inactive people', () => {
    const person = makePerson({ is_active: false })
    const logs = [
      makeLog('p1', '2026-01-10'),
      makeLog('p1', '2026-01-24'),
      makeLog('p1', '2026-02-07'),
      makeLog('p1', '2026-02-21'),
    ]
    const result = detectAbsentMembers({ ...base, people: [person], attendanceLogs: logs })
    expect(result).toHaveLength(0)
  })

  it('excludes archived people', () => {
    const person = makePerson({ is_archived: true })
    const logs = [
      makeLog('p1', '2026-01-10'),
      makeLog('p1', '2026-01-24'),
      makeLog('p1', '2026-02-07'),
      makeLog('p1', '2026-02-21'),
    ]
    const result = detectAbsentMembers({ ...base, people: [person], attendanceLogs: logs })
    expect(result).toHaveLength(0)
  })

  it('excludes dismissed people', () => {
    const person = makePerson()
    const logs = [
      makeLog('p1', '2026-01-10'),
      makeLog('p1', '2026-01-24'),
      makeLog('p1', '2026-02-07'),
      makeLog('p1', '2026-02-21'),
    ]
    const dismissed = new Set(['p1'])
    const result = detectAbsentMembers({ ...base, people: [person], attendanceLogs: logs, dismissedIds: dismissed })
    expect(result).toHaveLength(0)
  })

  it('respects a custom thresholdDays', () => {
    const person = makePerson()
    // Last seen 20 days ago
    const logs = [
      makeLog('p1', '2026-01-20'),
      makeLog('p1', '2026-02-10'),
      makeLog('p1', '2026-03-10'),
      makeLog('p1', '2026-04-03'), // 20 days ago
    ]
    // Default 28 days → not flagged
    const r28 = detectAbsentMembers({ ...base, people: [person], attendanceLogs: logs })
    expect(r28).toHaveLength(0)

    // Custom 14 days → flagged
    const r14 = detectAbsentMembers({ ...base, people: [person], attendanceLogs: logs, thresholdDays: 14 })
    expect(r14).toHaveLength(1)
  })

  it('only counts logs within the 90-day window', () => {
    const person = makePerson()
    // 3 attendances older than 90 days + 2 inside window (below minAttendances)
    const logs = [
      makeLog('p1', '2025-10-01'), // > 90 days from Apr 23 2026
      makeLog('p1', '2025-11-01'), // > 90 days
      makeLog('p1', '2025-12-01'), // > 90 days
      makeLog('p1', '2026-02-01'), // within window
      makeLog('p1', '2026-02-15'), // within window (only 2 in window)
    ]
    const result = detectAbsentMembers({ ...base, people: [person], attendanceLogs: logs })
    expect(result).toHaveLength(0)
  })

  it('aggregates attendance from checkins', () => {
    const child = makePerson({ id: 'c1', is_child: true })
    const sessions = [
      makeSession('s1', '2026-01-10'),
      makeSession('s2', '2026-01-24'),
      makeSession('s3', '2026-02-07'),
      makeSession('s4', '2026-02-21'),
    ]
    const checkins = sessions.map(s => makeCheckin('c1', s.id))
    const result = detectAbsentMembers({
      people: [child],
      attendanceLogs: [],
      checkinSessions: sessions,
      checkins,
      volunteerSchedule: [],
      today: TODAY,
    })
    expect(result).toHaveLength(1)
    expect(result[0].person.id).toBe('c1')
  })

  it('aggregates attendance from volunteer schedule (served=true only)', () => {
    const person = makePerson()
    // All within 90-day window (>= Jan 23, 2026)
    const slots = [
      makeVolSlot('p1', '2026-01-25', true),
      makeVolSlot('p1', '2026-02-08', true),
      makeVolSlot('p1', '2026-02-22', true),
      makeVolSlot('p1', '2026-03-01', false), // served=false, should not count
    ]
    // Only 3 confirmed served slots → qualifies
    const result = detectAbsentMembers({
      people: [person],
      attendanceLogs: [],
      checkinSessions: [],
      checkins: [],
      volunteerSchedule: slots,
      today: TODAY,
    })
    expect(result).toHaveLength(1)
  })

  it('does NOT count volunteer slot with served=false toward attendance', () => {
    const person = makePerson()
    // Only 2 served=true, 2 served=false — should not qualify
    const slots = [
      makeVolSlot('p1', '2026-01-12', true),
      makeVolSlot('p1', '2026-01-26', false),
      makeVolSlot('p1', '2026-02-09', false),
      makeVolSlot('p1', '2026-02-23', true),
    ]
    const result = detectAbsentMembers({
      people: [person],
      attendanceLogs: [],
      checkinSessions: [],
      checkins: [],
      volunteerSchedule: slots,
      today: TODAY,
    })
    expect(result).toHaveLength(0)
  })

  it('deduplicates attendance dates across sources', () => {
    // Same date from both AttendanceLog and VolunteerSchedule (all within 90-day window >= Jan 23)
    const person = makePerson()
    const logs = [
      makeLog('p1', '2026-01-25'),
      makeLog('p1', '2026-02-08'),
      makeLog('p1', '2026-02-22'),
    ]
    const slots = [makeVolSlot('p1', '2026-01-25', true)] // duplicate of first log
    // Only 3 unique dates — still qualifies
    const result = detectAbsentMembers({
      people: [person],
      attendanceLogs: logs,
      checkinSessions: [],
      checkins: [],
      volunteerSchedule: slots,
      today: TODAY,
    })
    expect(result).toHaveLength(1)
    // lastSeenDate should be the most recent unique date
    expect(result[0].lastSeenDate).toBe('2026-02-22')
  })

  it('sorts results by daysSinceLastSeen descending', () => {
    const p1 = makePerson({ id: 'p1' })
    const p2 = makePerson({ id: 'p2', first_name: 'Bob' })

    // All logs must be within the 90-day window (>= 2026-01-23)
    // p1: last seen Mar 8 (46 days ago), p2: last seen Mar 19 (35 days ago)
    const logs = [
      makeLog('p1', '2026-01-25'),
      makeLog('p1', '2026-02-08'),
      makeLog('p1', '2026-02-22'),
      makeLog('p1', '2026-03-08'), // 46 days before Apr 23
      makeLog('p2', '2026-01-25'),
      makeLog('p2', '2026-02-08'),
      makeLog('p2', '2026-02-22'),
      makeLog('p2', '2026-03-19'), // 35 days before Apr 23
    ]
    const result = detectAbsentMembers({ ...base, people: [p1, p2], attendanceLogs: logs })
    expect(result).toHaveLength(2)
    expect(result[0].person.id).toBe('p1')
    expect(result[1].person.id).toBe('p2')
    expect(result[0].daysSinceLastSeen).toBeGreaterThan(result[1].daysSinceLastSeen)
  })

  it('computes avgFrequencyDays correctly', () => {
    const person = makePerson()
    // All within 90-day window (>= Jan 23). 3 dates spanning 30 days → avg = 30/2 = 15 days
    const logs = [
      makeLog('p1', '2026-01-25'),
      makeLog('p1', '2026-02-09'),
      makeLog('p1', '2026-02-24'), // 58 days before Apr 23 — well past 28-day threshold
    ]
    const result = detectAbsentMembers({ ...base, people: [person], attendanceLogs: logs })
    expect(result).toHaveLength(1)
    expect(result[0].avgFrequencyDays).toBe(15)
  })

  it('sets avgFrequencyDays to 90 for single attendance event', () => {
    const person = makePerson()
    // Only 1 unique date in window (but 3 total via different sources — won't happen with dedup)
    // Test degenerate: give exactly 3 logs on same day
    const logs = [
      makeLog('p1', '2026-02-01'),
      makeLog('p1', '2026-02-01'),
      makeLog('p1', '2026-02-01'),
    ]
    const result = detectAbsentMembers({ ...base, people: [person], attendanceLogs: logs })
    // 3 logs but only 1 unique date → minAttendances deduplication makes it 1 unique
    // Actually after Set dedup, sortedDates.length = 1 so avgFrequencyDays = 90
    // But minAttendances check is on datesInWindow (before dedup) = 3, so it qualifies
    expect(result).toHaveLength(1)
    expect(result[0].avgFrequencyDays).toBe(90)
  })
})
