import type { Grade } from '@/shared/types'
import { db } from '@/services'
import { getServedVolunteersInMonth } from '@/features/volunteers/volunteer-service'
import { getGivingRecords } from '@/features/giving/giving-service'

// ── Grade classification ───────────────────────────────────────────────────────

export const KIDS_GRADES: Grade[] = ['Pre-K', 'K', '1st', '2nd', '3rd', '4th', '5th']
export const STUDENT_GRADES: Grade[] = ['6th', '7th', '8th', '9th', '10th', '11th', '12th']

// ── Pure calculation functions (all unit-testable without the DB) ─────────────

/** Count the number of Sundays in a given calendar month (month is 1–12). */
export function countSundaysInMonth(year: number, month: number): number {
  let count = 0
  const d = new Date(year, month - 1, 1)
  while (d.getMonth() === month - 1) {
    if (d.getDay() === 0) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

/**
 * Average weekly attendance = sum of all headcounts / number of Sundays.
 * Returns 0 if sundayCount is 0 or headcounts is empty.
 */
export function avgWeeklyAttendance(headcounts: number[], sundayCount: number): number {
  if (sundayCount === 0 || headcounts.length === 0) return 0
  const sum = headcounts.reduce((s, h) => s + h, 0)
  return Math.round((sum / sundayCount) * 10) / 10
}

function safePct(n: number, avg: number): number {
  if (avg <= 0) return 0
  return Math.round((n / avg) * 100)
}

/** Engagement % = unique engaged people / avg weekly attendance × 100. */
export function engagementPct(uniqueEngaged: number, avgWeekly: number): number {
  return safePct(uniqueEngaged, avgWeekly)
}

/** Service % = unique confirmed servers / avg weekly attendance × 100. */
export function servicePct(uniqueServers: number, avgWeekly: number): number {
  return safePct(uniqueServers, avgWeekly)
}

/** Giving % = unique givers / avg weekly attendance × 100. */
export function givingPct(uniqueGivers: number, avgWeekly: number): number {
  return safePct(uniqueGivers, avgWeekly)
}

/** Budget % = giving total / monthly budget × 100. */
export function budgetPct(givingTotal: number, monthlyBudget: number): number {
  if (monthlyBudget <= 0) return 0
  return Math.round((givingTotal / monthlyBudget) * 100)
}

/** Kids % = kids check-in count / avg weekly attendance × 100. */
export function kidsPct(kidsCount: number, avgWeekly: number): number {
  return safePct(kidsCount, avgWeekly)
}

/** Students % = students check-in count / avg weekly attendance × 100. */
export function studentsPct(studentsCount: number, avgWeekly: number): number {
  return safePct(studentsCount, avgWeekly)
}

/**
 * Trend arrow comparing current to previous value.
 * Returns null if previous is null/undefined (no prior data available).
 */
export function trendArrow(
  current: number,
  previous: number | null | undefined,
): '↑' | '↓' | '→' | null {
  if (previous == null) return null
  if (current > previous) return '↑'
  if (current < previous) return '↓'
  return '→'
}

/**
 * Trend percentage change vs previous month.
 * Returns null if previous is null/undefined or zero.
 */
export function trendPct(
  current: number,
  previous: number | null | undefined,
): number | null {
  if (previous == null || previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

// ── Historical CSV import ─────────────────────────────────────────────────────

export interface HistoricalRow {
  year: number
  month: number
  avg_weekly_attendance?: number
  giving_total?: number
  unique_givers?: number
  group_participants?: number
  confirmed_servers?: number
  kids_count?: number
  students_count?: number
}

export interface HistoricalImportResult {
  rows: HistoricalRow[]
  errors: string[]
}

/**
 * Parse a historical data CSV.
 * Required columns (case-insensitive): year, month
 * Optional numeric columns: avg_weekly_attendance, giving_total, unique_givers,
 *   group_participants, confirmed_servers, kids_count, students_count
 */
export function parseHistoricalCsv(csv: string): HistoricalImportResult {
  const lines = csv.trim().split(/\r?\n/)
  if (lines.length < 2) return { rows: [], errors: ['CSV has no data rows.'] }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())

  function col(name: string): number {
    return headers.indexOf(name)
  }

  const yearCol = col('year')
  const monthCol = col('month')

  if (yearCol === -1 || monthCol === -1) {
    return { rows: [], errors: ['CSV must have "year" and "month" columns.'] }
  }

  const errors: string[] = []
  const rows: HistoricalRow[] = []

  function numOrUndef(cells: string[], idx: number): number | undefined {
    if (idx === -1) return undefined
    const v = cells[idx]?.trim()
    if (!v) return undefined
    const n = parseFloat(v)
    return isNaN(n) ? undefined : n
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cells = line.split(',')

    const year = parseInt(cells[yearCol]?.trim() ?? '', 10)
    const month = parseInt(cells[monthCol]?.trim() ?? '', 10)

    if (isNaN(year) || year < 2000 || year > 2100) {
      errors.push(`Row ${i + 1}: invalid year "${cells[yearCol]?.trim() ?? ''}"`)
      continue
    }
    if (isNaN(month) || month < 1 || month > 12) {
      errors.push(`Row ${i + 1}: invalid month "${cells[monthCol]?.trim() ?? ''}"`)
      continue
    }

    rows.push({
      year,
      month,
      avg_weekly_attendance: numOrUndef(cells, col('avg_weekly_attendance')),
      giving_total: numOrUndef(cells, col('giving_total')),
      unique_givers: numOrUndef(cells, col('unique_givers')),
      group_participants: numOrUndef(cells, col('group_participants')),
      confirmed_servers: numOrUndef(cells, col('confirmed_servers')),
      kids_count: numOrUndef(cells, col('kids_count')),
      students_count: numOrUndef(cells, col('students_count')),
    })
  }

  return { rows, errors }
}

/** Commit parsed historical rows to the DB. */
export async function commitHistoricalImport(
  rows: HistoricalRow[],
): Promise<{ saved: number }> {
  let saved = 0
  for (const row of rows) {
    await db.upsertMonthlyReportHistory({ ...row, is_imported: true })
    saved++
  }
  return { saved }
}

// ── Live data aggregation ─────────────────────────────────────────────────────

/** Return auditorium headcounts for all attendance entries in the given month. */
export async function getAttendanceHeadcountsForMonth(
  year: number,
  month: number,
): Promise<number[]> {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`
  const entries = await db.getAttendanceEntries()
  return entries
    .filter(e => e.date.startsWith(monthStr))
    .map(e => e.auditorium_count)
    .filter(n => n > 0)
}

/**
 * Return unique person_ids engaged in a group during the given month.
 * - If a group meeting has individual attendance records, count only 'present' people.
 * - If a group held at least one meeting but recorded no individual attendance,
 *   count all active members of that group.
 */
export async function getEngagedPeopleInMonth(
  year: number,
  month: number,
): Promise<string[]> {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`
  const groups = await db.getGroups(false)
  const engagedSet = new Set<string>()

  await Promise.all(
    groups.map(async group => {
      const meetings = await db.getGroupMeetings(group.id)
      const monthMeetings = meetings.filter(m => m.date.startsWith(monthStr))
      if (monthMeetings.length === 0) return

      const allAttendance = await Promise.all(
        monthMeetings.map(m => db.getGroupAttendance(m.id)),
      )
      const hasIndividualRecords = allAttendance.some(a => a.length > 0)

      if (hasIndividualRecords) {
        for (const attendanceList of allAttendance) {
          for (const a of attendanceList) {
            if (a.status === 'present') engagedSet.add(a.person_id)
          }
        }
      } else {
        const members = await db.getGroupMembers(group.id)
        for (const m of members) {
          if (m.status === 'active') engagedSet.add(m.person_id)
        }
      }
    }),
  )

  return [...engagedSet]
}

/**
 * Return unique child_ids who checked in during the given month, split by grade tier.
 * Kids   = Pre-K through 5th grade.
 * Students = 6th through 12th grade.
 */
export async function getCheckinKidsInMonth(
  year: number,
  month: number,
): Promise<{ kids: string[]; students: string[] }> {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`
  const sessions = await db.getCheckinSessions()
  const monthSessions = sessions.filter(s => s.date.startsWith(monthStr))

  const people = await db.getPeople()
  const personMap = new Map(people.map(p => [p.id, p]))

  const kidsSet = new Set<string>()
  const studentsSet = new Set<string>()

  await Promise.all(
    monthSessions.map(async session => {
      const checkins = await db.getCheckins(session.id)
      for (const checkin of checkins) {
        const person = personMap.get(checkin.child_id)
        if (!person?.grade) continue
        if (KIDS_GRADES.includes(person.grade as Grade)) {
          kidsSet.add(checkin.child_id)
        } else if (STUDENT_GRADES.includes(person.grade as Grade)) {
          studentsSet.add(checkin.child_id)
        }
      }
    }),
  )

  return { kids: [...kidsSet], students: [...studentsSet] }
}

// ── Full report data ──────────────────────────────────────────────────────────

export interface MonthlyReportData {
  year: number
  month: number
  // Attendance
  headcounts: number[]
  sundayCount: number
  avgWeekly: number
  // Engagement
  engagedCount: number
  engagementPctValue: number
  // Service
  servedCount: number
  servicePctValue: number
  // Giving
  givingTotal: number
  uniqueGivers: number
  givingPctValue: number
  monthlyBudget: number
  budgetPctValue: number
  // Kids / Students
  kidsCount: number
  studentsCount: number
  kidsPctValue: number
  studentsPctValue: number
}

export async function computeMonthlyReport(
  year: number,
  month: number,
  monthlyBudget = 0,
): Promise<MonthlyReportData> {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`

  const [headcounts, engagedIds, servedResult, givingRecords, { kids, students }] =
    await Promise.all([
      getAttendanceHeadcountsForMonth(year, month),
      getEngagedPeopleInMonth(year, month),
      getServedVolunteersInMonth(year, month),
      getGivingRecords(),
      getCheckinKidsInMonth(year, month),
    ])

  const sundayCount = countSundaysInMonth(year, month)
  const avgWeekly = avgWeeklyAttendance(headcounts, sundayCount)

  const monthGiving = givingRecords.filter(r => r.date.startsWith(monthStr))
  const givingTotal = monthGiving.reduce((s, r) => s + r.amount, 0)
  const uniqueGiversSet = new Set(monthGiving.map(r => r.person_id))

  return {
    year,
    month,
    headcounts,
    sundayCount,
    avgWeekly,
    engagedCount: engagedIds.length,
    engagementPctValue: engagementPct(engagedIds.length, avgWeekly),
    servedCount: servedResult.count,
    servicePctValue: servicePct(servedResult.count, avgWeekly),
    givingTotal,
    uniqueGivers: uniqueGiversSet.size,
    givingPctValue: givingPct(uniqueGiversSet.size, avgWeekly),
    monthlyBudget,
    budgetPctValue: budgetPct(givingTotal, monthlyBudget),
    kidsCount: kids.length,
    studentsCount: students.length,
    kidsPctValue: kidsPct(kids.length, avgWeekly),
    studentsPctValue: studentsPct(students.length, avgWeekly),
  }
}

/**
 * Return the stored (historical or previously saved) snapshot for a month, or null.
 * Used for comparison when live data is unavailable for a prior month.
 */
export async function getStoredMonthData(
  year: number,
  month: number,
): Promise<{ avgWeekly: number; givingTotal: number; engagedCount: number; servedCount: number } | null> {
  const rows = await db.getMonthlyReportHistory(year, month)
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    avgWeekly: r.avg_weekly_attendance ?? 0,
    givingTotal: r.giving_total ?? 0,
    engagedCount: r.group_participants ?? 0,
    servedCount: r.confirmed_servers ?? 0,
  }
}
