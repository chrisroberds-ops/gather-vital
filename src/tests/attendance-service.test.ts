import { describe, it, expect } from 'vitest'
import { db } from '@/services'
import {
  createAttendanceEntry,
  updateAttendanceEntry,
  getAttendanceEntries,
  sumEntry,
  getWeeklyAttendance,
} from '@/features/attendance/attendance-service'

describe('attendance-service', () => {
  it('creates an attendance entry', async () => {
    const entry = await createAttendanceEntry({
      date: '2026-04-06',
      service_time_id: 'st-1',
      auditorium_count: 150,
      students_count: 30,
      online_count: 20,
      kids_count: 40,
      recorded_by: 'user-1',
    })
    expect(entry.auditorium_count).toBe(150)
    expect(entry.date).toBe('2026-04-06')
  })

  it('updates an attendance entry', async () => {
    const entry = await createAttendanceEntry({
      date: '2026-04-07',
      service_time_id: 'st-1',
      auditorium_count: 100,
      recorded_by: 'user-1',
    })
    const updated = await updateAttendanceEntry(entry.id, { auditorium_count: 120, notes: 'Special service' })
    expect(updated.auditorium_count).toBe(120)
    expect(updated.notes).toBe('Special service')
  })

  it('sumEntry calculates totals correctly', async () => {
    const entry = await createAttendanceEntry({
      date: '2026-04-08',
      service_time_id: 'st-1',
      auditorium_count: 200,
      students_count: 50,
      online_count: 30,
      kids_count: 60,
      recorded_by: 'user-1',
    })
    const summary = sumEntry(entry)
    expect(summary.total).toBe(340)
    expect(summary.auditorium).toBe(200)
    expect(summary.students).toBe(50)
    expect(summary.online).toBe(30)
    expect(summary.kids).toBe(60)
  })

  it('sumEntry handles missing count fields with 0', async () => {
    const entry = await createAttendanceEntry({
      date: '2026-04-09',
      service_time_id: 'st-1',
      auditorium_count: 100,
      recorded_by: 'user-1',
    })
    const summary = sumEntry(entry)
    expect(summary.total).toBe(100)
    expect(summary.students).toBe(0)
    expect(summary.online).toBe(0)
    expect(summary.kids).toBe(0)
  })

  it('getAttendanceEntries returns entries', async () => {
    await createAttendanceEntry({
      date: '2026-04-10',
      service_time_id: 'st-1',
      auditorium_count: 80,
      recorded_by: 'user-1',
    })
    const entries = await getAttendanceEntries()
    expect(entries.length).toBeGreaterThanOrEqual(1)
  })

  it('getWeeklyAttendance returns a WeeklyAttendance array', async () => {
    await createAttendanceEntry({
      date: '2026-04-06',
      service_time_id: 'st-1',
      auditorium_count: 150,
      recorded_by: 'user-1',
    })
    // weeksBack = 520 captures all historical test entries
    const weeks = await getWeeklyAttendance(520)
    expect(Array.isArray(weeks)).toBe(true)
    expect(weeks.length).toBeGreaterThanOrEqual(1)
    // Each entry should have date, serviceTimeId, and summary
    const first = weeks[0]
    expect(typeof first.date).toBe('string')
    expect(typeof first.serviceTimeId).toBe('string')
    expect(typeof first.summary.total).toBe('number')
  })

  it('getAttendanceEntries filters by service_time_id', async () => {
    await createAttendanceEntry({ date: '2026-04-11', service_time_id: 'st-A', auditorium_count: 100, recorded_by: 'u' })
    await createAttendanceEntry({ date: '2026-04-11', service_time_id: 'st-B', auditorium_count: 50,  recorded_by: 'u' })
    const stA = await db.getAttendanceEntries('st-A')
    expect(stA.every(e => e.service_time_id === 'st-A')).toBe(true)
  })
})
