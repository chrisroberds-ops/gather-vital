/**
 * Absence detection service
 *
 * Identifies "regular attenders" who have gone missing: people who attended
 * 3+ times in the past 90 days but have not been seen in the last N days
 * (default: 28, configurable via AppConfig.absence_threshold_days).
 *
 * Attendance is aggregated from three sources:
 *  - AttendanceLogs  (individual adult attendance records)
 *  - CheckinSessions + Checkins  (kids check-in records, keyed by child_id)
 *  - VolunteerSchedule  (served === true marks a presence)
 *
 * Excludes people who are inactive (!is_active) or archived (is_archived).
 */

import type { Person, AttendanceLog, CheckinSession, Checkin, VolunteerSchedule } from '@/shared/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AbsentPerson {
  person: Person
  /** ISO date string of the most recent attendance event */
  lastSeenDate: string
  /** Days elapsed since lastSeenDate */
  daysSinceLastSeen: number
  /** Average days between attendance events over the 90-day window */
  avgFrequencyDays: number
}

// ── Local storage key for dismissals ─────────────────────────────────────────

const DISMISSAL_KEY = 'gather_absence_dismissals'

interface Dismissal {
  personId: string
  dismissedUntil: string // ISO date
}

function loadDismissals(): Dismissal[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSAL_KEY) ?? '[]') as Dismissal[]
  } catch {
    return []
  }
}

function saveDismissals(dismissals: Dismissal[]): void {
  localStorage.setItem(DISMISSAL_KEY, JSON.stringify(dismissals))
}

/** Dismiss a person's absence flag for 30 days from today. */
export function dismissAbsenceFlag(personId: string): void {
  const dismissals = loadDismissals().filter(d => d.personId !== personId)
  const dismissedUntil = new Date()
  dismissedUntil.setDate(dismissedUntil.getDate() + 30)
  dismissals.push({ personId, dismissedUntil: dismissedUntil.toISOString().split('T')[0] })
  saveDismissals(dismissals)
}

/** Returns the set of personIds that are currently dismissed. */
export function getDismissedPersonIds(today = new Date().toISOString().split('T')[0]): Set<string> {
  const dismissals = loadDismissals()
  const active = dismissals.filter(d => d.dismissedUntil > today)
  // Clean up expired dismissals
  if (active.length !== dismissals.length) saveDismissals(active)
  return new Set(active.map(d => d.personId))
}

// ── Core detection ────────────────────────────────────────────────────────────

export interface DetectAbsenceOptions {
  people: Person[]
  attendanceLogs: AttendanceLog[]
  checkinSessions: CheckinSession[]
  checkins: Checkin[]
  volunteerSchedule: VolunteerSchedule[]
  /** Days without attendance before flagging. Default: 28 */
  thresholdDays?: number
  /** Minimum attendances in the past 90 days to be considered "regular". Default: 3 */
  minAttendances?: number
  /** Reference "today" for testability. Defaults to actual today. */
  today?: string
  /** PersonIds to exclude (already dismissed). Default: empty. */
  dismissedIds?: Set<string>
}

/**
 * Pure function — detects absent regular attenders.
 * Returns results sorted by daysSinceLastSeen descending (longest absent first).
 */
export function detectAbsentMembers(opts: DetectAbsenceOptions): AbsentPerson[] {
  const {
    people,
    attendanceLogs,
    checkinSessions,
    checkins,
    volunteerSchedule,
    thresholdDays = 28,
    minAttendances = 3,
    today = new Date().toISOString().split('T')[0],
    dismissedIds = new Set<string>(),
  } = opts

  // Build a date-indexed set of sessions for checkin lookups
  const sessionDateById = new Map<string, string>()
  for (const s of checkinSessions) {
    sessionDateById.set(s.id, s.date)
  }

  // Compute cutoff dates
  const todayMs = new Date(today).getTime()
  const thresholdMs = todayMs - thresholdDays * 86_400_000
  const windowMs = todayMs - 90 * 86_400_000
  const thresholdDate = new Date(thresholdMs).toISOString().split('T')[0]
  const windowDate = new Date(windowMs).toISOString().split('T')[0]

  const eligible = people.filter(p => p.is_active && !p.is_archived && !dismissedIds.has(p.id))

  const results: AbsentPerson[] = []

  for (const person of eligible) {
    // Collect all attendance dates for this person within the 90-day window
    const datesInWindow: string[] = []

    // 1. AttendanceLogs
    for (const log of attendanceLogs) {
      if (log.person_id === person.id && log.date >= windowDate) {
        datesInWindow.push(log.date)
      }
    }

    // 2. Kids check-ins (child_id = person.id)
    for (const checkin of checkins) {
      if (checkin.child_id === person.id) {
        const date = sessionDateById.get(checkin.session_id)
        if (date && date >= windowDate) {
          datesInWindow.push(date)
        }
      }
    }

    // 3. Volunteer schedule (served === true)
    for (const slot of volunteerSchedule) {
      if (slot.person_id === person.id && slot.served === true && slot.scheduled_date >= windowDate) {
        datesInWindow.push(slot.scheduled_date)
      }
    }

    if (datesInWindow.length < minAttendances) continue

    const sortedDates = [...new Set(datesInWindow)].sort()
    const lastSeenDate = sortedDates[sortedDates.length - 1]

    // Only flag if last seen was before the threshold
    if (lastSeenDate >= thresholdDate) continue

    const lastSeenMs = new Date(lastSeenDate).getTime()
    const daysSinceLastSeen = Math.floor((todayMs - lastSeenMs) / 86_400_000)

    // Average frequency: spread of events over the window
    let avgFrequencyDays: number
    if (sortedDates.length < 2) {
      avgFrequencyDays = 90
    } else {
      const firstMs = new Date(sortedDates[0]).getTime()
      const lastMs = new Date(sortedDates[sortedDates.length - 1]).getTime()
      avgFrequencyDays = Math.round((lastMs - firstMs) / 86_400_000 / (sortedDates.length - 1))
    }

    results.push({ person, lastSeenDate, daysSinceLastSeen, avgFrequencyDays })
  }

  return results.sort((a, b) => b.daysSinceLastSeen - a.daysSinceLastSeen)
}
