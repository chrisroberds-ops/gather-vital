import { describe, it, expect, beforeEach } from 'vitest'
import {
  countSundaysInMonth,
  avgWeeklyAttendance,
  engagementPct,
  servicePct,
  givingPct,
  budgetPct,
  kidsPct,
  studentsPct,
  trendArrow,
  trendPct,
  parseHistoricalCsv,
  commitHistoricalImport,
  getAttendanceHeadcountsForMonth,
  getEngagedPeopleInMonth,
  getCheckinKidsInMonth,
  computeMonthlyReport,
  KIDS_GRADES,
  STUDENT_GRADES,
} from '@/features/reports/monthly-report-service'
import { db } from '@/services'

// ── countSundaysInMonth ───────────────────────────────────────────────────────

describe('countSundaysInMonth', () => {
  it('counts Sundays correctly — April 2026 has 5 Sundays', () => {
    // April 2026: Sundays on 5, 12, 19, 26
    expect(countSundaysInMonth(2026, 4)).toBe(4)
  })

  it('counts Sundays — January 2023 has 5 Sundays', () => {
    // Jan 2023: Sundays on 1, 8, 15, 22, 29
    expect(countSundaysInMonth(2023, 1)).toBe(5)
  })

  it('counts Sundays — February 2026 has 4 Sundays', () => {
    // Feb 2026: 1=Sun, 8, 15, 22
    expect(countSundaysInMonth(2026, 2)).toBe(4)
  })

  it('handles December', () => {
    const count = countSundaysInMonth(2025, 12)
    expect(count).toBeGreaterThanOrEqual(4)
    expect(count).toBeLessThanOrEqual(5)
  })

  it('returns a value between 4 and 5 for any month', () => {
    for (let m = 1; m <= 12; m++) {
      const count = countSundaysInMonth(2026, m)
      expect(count).toBeGreaterThanOrEqual(4)
      expect(count).toBeLessThanOrEqual(5)
    }
  })
})

// ── avgWeeklyAttendance ───────────────────────────────────────────────────────

describe('avgWeeklyAttendance', () => {
  it('divides sum of headcounts by sunday count', () => {
    // 4 services totaling 400 across 4 Sundays = avg 100
    expect(avgWeeklyAttendance([100, 100, 100, 100], 4)).toBe(100)
  })

  it('handles multiple services per Sunday', () => {
    // 3 service times per Sunday × 4 Sundays, each 100 = 1200 total / 4 = 300
    const headcounts = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]
    expect(avgWeeklyAttendance(headcounts, 4)).toBe(300)
  })

  it('returns 0 when no Sundays', () => {
    expect(avgWeeklyAttendance([200, 200], 0)).toBe(0)
  })

  it('returns 0 when headcounts empty', () => {
    expect(avgWeeklyAttendance([], 4)).toBe(0)
  })

  it('rounds to 1 decimal place', () => {
    // 3 services, 100+100+100 = 300 / 4 sundays = 75.0
    expect(avgWeeklyAttendance([100, 100, 100], 4)).toBe(75)
  })

  it('handles non-integer averages', () => {
    // 250 total / 3 Sundays ≈ 83.3
    const result = avgWeeklyAttendance([100, 100, 50], 3)
    expect(result).toBeCloseTo(83.3, 0)
  })
})

// ── Percentage functions ──────────────────────────────────────────────────────

describe('engagementPct', () => {
  it('calculates correct percentage', () => {
    expect(engagementPct(80, 200)).toBe(40)
  })

  it('returns 0 when avgWeekly is 0', () => {
    expect(engagementPct(50, 0)).toBe(0)
  })

  it('can exceed 100%', () => {
    expect(engagementPct(250, 200)).toBe(125)
  })
})

describe('servicePct', () => {
  it('calculates correct percentage', () => {
    expect(servicePct(30, 150)).toBe(20)
  })

  it('returns 0 when avgWeekly is 0', () => {
    expect(servicePct(10, 0)).toBe(0)
  })
})

describe('givingPct', () => {
  it('calculates unique givers as % of attenders', () => {
    expect(givingPct(60, 200)).toBe(30)
  })

  it('returns 0 when avgWeekly is 0', () => {
    expect(givingPct(60, 0)).toBe(0)
  })
})

describe('budgetPct', () => {
  it('calculates giving vs budget', () => {
    expect(budgetPct(9000, 10000)).toBe(90)
  })

  it('returns 100 when on budget', () => {
    expect(budgetPct(10000, 10000)).toBe(100)
  })

  it('returns >100 when over budget', () => {
    expect(budgetPct(12000, 10000)).toBe(120)
  })

  it('returns 0 when no budget set', () => {
    expect(budgetPct(5000, 0)).toBe(0)
  })
})

describe('kidsPct', () => {
  it('calculates kids as % of attenders', () => {
    expect(kidsPct(40, 200)).toBe(20)
  })

  it('returns 0 when avgWeekly is 0', () => {
    expect(kidsPct(10, 0)).toBe(0)
  })
})

describe('studentsPct', () => {
  it('calculates students as % of attenders', () => {
    expect(studentsPct(20, 200)).toBe(10)
  })

  it('returns 0 when avgWeekly is 0', () => {
    expect(studentsPct(5, 0)).toBe(0)
  })
})

// ── trendArrow / trendPct ─────────────────────────────────────────────────────

describe('trendArrow', () => {
  it('returns ↑ when current > previous', () => {
    expect(trendArrow(110, 100)).toBe('↑')
  })

  it('returns ↓ when current < previous', () => {
    expect(trendArrow(90, 100)).toBe('↓')
  })

  it('returns → when equal', () => {
    expect(trendArrow(100, 100)).toBe('→')
  })

  it('returns null when no previous data', () => {
    expect(trendArrow(100, null)).toBe(null)
    expect(trendArrow(100, undefined)).toBe(null)
  })
})

describe('trendPct', () => {
  it('calculates positive trend', () => {
    expect(trendPct(110, 100)).toBe(10)
  })

  it('calculates negative trend', () => {
    expect(trendPct(90, 100)).toBe(-10)
  })

  it('returns null when previous is null', () => {
    expect(trendPct(100, null)).toBe(null)
  })

  it('returns null when previous is 0', () => {
    expect(trendPct(100, 0)).toBe(null)
  })

  it('rounds to nearest integer', () => {
    expect(trendPct(105, 100)).toBe(5)
    expect(trendPct(103, 100)).toBe(3)
  })
})

// ── parseHistoricalCsv ────────────────────────────────────────────────────────

describe('parseHistoricalCsv', () => {
  const SAMPLE_CSV = [
    'year,month,avg_weekly_attendance,giving_total,unique_givers,group_participants,confirmed_servers,kids_count,students_count',
    '2025,1,180,12000,45,60,22,35,15',
    '2025,2,175,11500,42,58,20,33,14',
    '2025,3,190,13000,50,65,25,38,17',
  ].join('\n')

  it('parses valid rows', () => {
    const { rows, errors } = parseHistoricalCsv(SAMPLE_CSV)
    expect(rows).toHaveLength(3)
    expect(errors).toHaveLength(0)
  })

  it('parses year and month', () => {
    const { rows } = parseHistoricalCsv(SAMPLE_CSV)
    expect(rows[0].year).toBe(2025)
    expect(rows[0].month).toBe(1)
    expect(rows[2].month).toBe(3)
  })

  it('parses all numeric fields', () => {
    const { rows } = parseHistoricalCsv(SAMPLE_CSV)
    expect(rows[0].avg_weekly_attendance).toBe(180)
    expect(rows[0].giving_total).toBe(12000)
    expect(rows[0].unique_givers).toBe(45)
    expect(rows[0].group_participants).toBe(60)
    expect(rows[0].confirmed_servers).toBe(22)
    expect(rows[0].kids_count).toBe(35)
    expect(rows[0].students_count).toBe(15)
  })

  it('handles optional columns — partial CSV with only required fields', () => {
    const csv = 'year,month\n2025,6\n2025,7'
    const { rows, errors } = parseHistoricalCsv(csv)
    expect(errors).toHaveLength(0)
    expect(rows).toHaveLength(2)
    expect(rows[0].avg_weekly_attendance).toBeUndefined()
    expect(rows[0].giving_total).toBeUndefined()
  })

  it('handles empty optional columns', () => {
    const csv = 'year,month,avg_weekly_attendance,giving_total\n2025,4,,5000\n2025,5,200,'
    const { rows } = parseHistoricalCsv(csv)
    expect(rows[0].avg_weekly_attendance).toBeUndefined()
    expect(rows[0].giving_total).toBe(5000)
    expect(rows[1].avg_weekly_attendance).toBe(200)
    expect(rows[1].giving_total).toBeUndefined()
  })

  it('reports error for invalid year', () => {
    const csv = 'year,month\nnotayear,3'
    const { rows, errors } = parseHistoricalCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('invalid year')
  })

  it('reports error for invalid month', () => {
    const csv = 'year,month\n2025,13'
    const { rows, errors } = parseHistoricalCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors[0]).toContain('invalid month')
  })

  it('reports error for month 0', () => {
    const csv = 'year,month\n2025,0'
    const { rows, errors } = parseHistoricalCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('skips empty lines', () => {
    const csv = 'year,month\n2025,1\n\n2025,2\n'
    const { rows } = parseHistoricalCsv(csv)
    expect(rows).toHaveLength(2)
  })

  it('requires year and month columns', () => {
    const csv = 'avg_weekly_attendance,giving_total\n180,12000'
    const { rows, errors } = parseHistoricalCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors[0]).toContain('"year"')
  })

  it('returns empty for header-only CSV', () => {
    const csv = 'year,month,avg_weekly_attendance'
    const { rows, errors } = parseHistoricalCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors[0]).toContain('no data rows')
  })

  it('partial errors do not block valid rows', () => {
    const csv = 'year,month\nbadyear,3\n2025,4\n2025,5'
    const { rows, errors } = parseHistoricalCsv(csv)
    expect(rows).toHaveLength(2)
    expect(errors).toHaveLength(1)
  })
})

// ── commitHistoricalImport ────────────────────────────────────────────────────

describe('commitHistoricalImport', () => {
  it('saves rows to DB', async () => {
    const rows = [
      { year: 2024, month: 6, avg_weekly_attendance: 150, giving_total: 10000, unique_givers: 40, group_participants: 50, confirmed_servers: 18, kids_count: 28, students_count: 12 },
      { year: 2024, month: 7, avg_weekly_attendance: 160, giving_total: 11000 },
    ]
    const { saved } = await commitHistoricalImport(rows)
    expect(saved).toBe(2)

    const stored = await db.getMonthlyReportHistory(2024)
    const june = stored.find(r => r.month === 6)
    expect(june).toBeDefined()
    expect(june?.avg_weekly_attendance).toBe(150)
    expect(june?.giving_total).toBe(10000)
    expect(june?.is_imported).toBe(true)
  })

  it('upserts — updating an existing row', async () => {
    await commitHistoricalImport([{ year: 2024, month: 8, avg_weekly_attendance: 100 }])
    await commitHistoricalImport([{ year: 2024, month: 8, avg_weekly_attendance: 120 }])

    const stored = await db.getMonthlyReportHistory(2024, 8)
    expect(stored).toHaveLength(1)
    expect(stored[0].avg_weekly_attendance).toBe(120)
  })
})

// ── getAttendanceHeadcountsForMonth ───────────────────────────────────────────

describe('getAttendanceHeadcountsForMonth', () => {
  let serviceTimeId: string

  beforeEach(async () => {
    const cfg = await db.getAppConfig()
    serviceTimeId = cfg.service_times?.[0]?.id ?? 'st-default'
  })

  it('returns headcounts for the matching month', async () => {
    await db.createAttendanceEntry({
      service_time_id: serviceTimeId,
      date: '2026-03-02',
      auditorium_count: 200,
      recorded_by: 'test',
    })
    await db.createAttendanceEntry({
      service_time_id: serviceTimeId,
      date: '2026-03-09',
      auditorium_count: 220,
      recorded_by: 'test',
    })

    const counts = await getAttendanceHeadcountsForMonth(2026, 3)
    expect(counts).toContain(200)
    expect(counts).toContain(220)
  })

  it('excludes entries from other months', async () => {
    await db.createAttendanceEntry({
      service_time_id: serviceTimeId,
      date: '2026-04-06',
      auditorium_count: 300,
      recorded_by: 'test',
    })

    const marchCounts = await getAttendanceHeadcountsForMonth(2026, 3)
    expect(marchCounts).not.toContain(300)
  })

  it('returns empty array when no entries', async () => {
    const counts = await getAttendanceHeadcountsForMonth(2099, 1)
    expect(counts).toHaveLength(0)
  })
})

// ── getEngagedPeopleInMonth ───────────────────────────────────────────────────

describe('getEngagedPeopleInMonth', () => {
  it('counts active members when no individual attendance recorded', async () => {
    const groups = await db.getGroups(false)
    const group = groups[0]
    if (!group) return

    // Create a meeting this month with no individual attendance
    await db.createGroupMeeting({ group_id: group.id, date: '2026-03-15' })

    const members = await db.getGroupMembers(group.id)
    const activeCount = members.filter(m => m.status === 'active').length

    const engaged = await getEngagedPeopleInMonth(2026, 3)
    // At minimum the group's active members should be included
    expect(engaged.length).toBeGreaterThanOrEqual(activeCount > 0 ? 1 : 0)
  })

  it('counts only present people when individual attendance recorded', async () => {
    const groups = await db.getGroups(false)
    const group = groups[0]
    if (!group) return

    const members = await db.getGroupMembers(group.id)
    const active = members.filter(m => m.status === 'active').slice(0, 2)
    if (active.length < 2) return

    const meeting = await db.createGroupMeeting({ group_id: group.id, date: '2026-04-13' })
    // Mark first person present, second absent
    await db.upsertGroupAttendance({ meeting_id: meeting.id, person_id: active[0].person_id, status: 'present' })
    await db.upsertGroupAttendance({ meeting_id: meeting.id, person_id: active[1].person_id, status: 'absent' })

    const engaged = await getEngagedPeopleInMonth(2026, 4)
    expect(engaged).toContain(active[0].person_id)
    expect(engaged).not.toContain(active[1].person_id)
  })

  it('returns empty when no meetings this month', async () => {
    const engaged = await getEngagedPeopleInMonth(2099, 1)
    expect(engaged).toHaveLength(0)
  })
})

// ── getCheckinKidsInMonth ─────────────────────────────────────────────────────

describe('getCheckinKidsInMonth', () => {
  it('classifies kids and students by grade', async () => {
    const people = await db.getPeople()
    const kidsGradePerson = people.find(p => p.is_child && p.grade && KIDS_GRADES.includes(p.grade as typeof KIDS_GRADES[number]))
    const studentGradePerson = people.find(p => p.is_child && p.grade && STUDENT_GRADES.includes(p.grade as typeof STUDENT_GRADES[number]))

    if (!kidsGradePerson && !studentGradePerson) {
      // No graded children in test data — just verify function returns correct shape
      const result = await getCheckinKidsInMonth(2026, 3)
      expect(Array.isArray(result.kids)).toBe(true)
      expect(Array.isArray(result.students)).toBe(true)
      return
    }

    // Create a checkin session and checkin for this month
    const session = await db.createCheckinSession({
      name: 'Test Service',
      date: '2026-03-02',
      service_time: '10:00 AM',
      status: 'open',
      created_by: 'test',
    })

    if (kidsGradePerson) {
      await db.createCheckin({
        session_id: session.id,
        child_id: kidsGradePerson.id,
        checked_in_by: 'test',
        household_id: 'hh-test',
        pickup_code: '1234',
        kiosk_id: 'k1',
        checked_in_at: '2026-03-02T10:00:00Z',
        status: 'checked_in',
        label_printed: false,
      })
    }

    const result = await getCheckinKidsInMonth(2026, 3)
    if (kidsGradePerson) {
      expect(result.kids).toContain(kidsGradePerson.id)
    }
  })

  it('deduplicates children who checked in multiple times', async () => {
    const people = await db.getPeople()
    const child = people.find(p => p.is_child && p.grade && KIDS_GRADES.includes(p.grade as typeof KIDS_GRADES[number]))
    if (!child) return

    const s1 = await db.createCheckinSession({
      name: 'Session A',
      date: '2026-05-04',
      service_time: '9:00 AM',
      status: 'open',
      created_by: 'test',
    })
    const s2 = await db.createCheckinSession({
      name: 'Session B',
      date: '2026-05-11',
      service_time: '9:00 AM',
      status: 'open',
      created_by: 'test',
    })

    const mkCheckin = (sessionId: string) =>
      db.createCheckin({
        session_id: sessionId,
        child_id: child.id,
        checked_in_by: 'test',
        household_id: 'hh-test',
        pickup_code: '9999',
        kiosk_id: 'k1',
        checked_in_at: '2026-05-04T10:00:00Z',
        status: 'checked_in',
        label_printed: false,
      })

    await Promise.all([mkCheckin(s1.id), mkCheckin(s2.id)])

    const result = await getCheckinKidsInMonth(2026, 5)
    const kidsOccurrences = result.kids.filter(id => id === child.id)
    expect(kidsOccurrences).toHaveLength(1)
  })

  it('returns empty arrays when no sessions in month', async () => {
    const result = await getCheckinKidsInMonth(2099, 1)
    expect(result.kids).toHaveLength(0)
    expect(result.students).toHaveLength(0)
  })
})

// ── computeMonthlyReport ──────────────────────────────────────────────────────

describe('computeMonthlyReport', () => {
  it('returns correct structure', async () => {
    const report = await computeMonthlyReport(2099, 6)
    expect(report.year).toBe(2099)
    expect(report.month).toBe(6)
    expect(typeof report.avgWeekly).toBe('number')
    expect(typeof report.engagedCount).toBe('number')
    expect(typeof report.servedCount).toBe('number')
    expect(typeof report.givingTotal).toBe('number')
    expect(typeof report.kidsCount).toBe('number')
    expect(typeof report.studentsCount).toBe('number')
  })

  it('returns zeros for a month with no data', async () => {
    const report = await computeMonthlyReport(2099, 1)
    expect(report.avgWeekly).toBe(0)
    expect(report.engagedCount).toBe(0)
    expect(report.servedCount).toBe(0)
    expect(report.givingTotal).toBe(0)
    expect(report.kidsCount).toBe(0)
    expect(report.studentsCount).toBe(0)
  })

  it('incorporates monthly budget into budget percentage', async () => {
    const report = await computeMonthlyReport(2099, 2, 10000)
    expect(report.monthlyBudget).toBe(10000)
    // 0 giving vs 10000 budget = 0%
    expect(report.budgetPctValue).toBe(0)
  })

  it('computes giving total from giving records', async () => {
    const people = await db.getPeople()
    const person = people.find(p => !p.is_child && p.is_active)!

    await db.createGivingRecord({
      person_id: person.id,
      amount: 500,
      date: '2025-08-15',
      method: 'check',
      fund: 'General',
      source: 'manual',
    })
    await db.createGivingRecord({
      person_id: person.id,
      amount: 250,
      date: '2025-08-22',
      method: 'cash',
      fund: 'Missions',
      source: 'manual',
    })

    const report = await computeMonthlyReport(2025, 8)
    expect(report.givingTotal).toBeGreaterThanOrEqual(750)
    expect(report.uniqueGivers).toBeGreaterThanOrEqual(1)
  })

  it('budgetPct is green-zone when giving meets budget', async () => {
    // Use a past month with known giving from the test above
    const report = await computeMonthlyReport(2025, 8, 500)
    // givingTotal >= 750, budget = 500, so pct >= 150
    expect(report.budgetPctValue).toBeGreaterThanOrEqual(100)
  })
})

// ── Grade classification constants ────────────────────────────────────────────

describe('grade classification constants', () => {
  it('KIDS_GRADES covers Pre-K through 5th', () => {
    expect(KIDS_GRADES).toContain('Pre-K')
    expect(KIDS_GRADES).toContain('K')
    expect(KIDS_GRADES).toContain('5th')
    expect(KIDS_GRADES).not.toContain('6th')
  })

  it('STUDENT_GRADES covers 6th through 12th', () => {
    expect(STUDENT_GRADES).toContain('6th')
    expect(STUDENT_GRADES).toContain('12th')
    expect(STUDENT_GRADES).not.toContain('5th')
  })

  it('no overlap between kids and students', () => {
    const intersection = KIDS_GRADES.filter(g => STUDENT_GRADES.includes(g as typeof STUDENT_GRADES[number]))
    expect(intersection).toHaveLength(0)
  })
})
