/**
 * Attendance Service
 * Handles aggregate attendance entry (headcounts) and reads.
 */

import { db } from '@/services'
import type { AttendanceEntry } from '@/shared/types'

export async function getAttendanceEntries(serviceTimeId?: string): Promise<AttendanceEntry[]> {
  return db.getAttendanceEntries(serviceTimeId)
}

export async function createAttendanceEntry(data: {
  service_time_id: string
  date: string
  auditorium_count: number
  students_count?: number
  online_count?: number
  kids_count?: number
  notes?: string
  recorded_by: string
}): Promise<AttendanceEntry> {
  return db.createAttendanceEntry(data)
}

export async function updateAttendanceEntry(id: string, data: Partial<AttendanceEntry>): Promise<AttendanceEntry> {
  return db.updateAttendanceEntry(id, data)
}

export interface AttendanceSummary {
  total: number
  auditorium: number
  students: number
  online: number
  kids: number
}

export function sumEntry(entry: AttendanceEntry): AttendanceSummary {
  const students = entry.students_count ?? 0
  const online = entry.online_count ?? 0
  const kids = entry.kids_count ?? 0
  const auditorium = entry.auditorium_count
  return {
    total: auditorium + students + online + kids,
    auditorium,
    students,
    online,
    kids,
  }
}

export interface WeeklyAttendance {
  date: string
  serviceTimeId: string
  summary: AttendanceSummary
}

export async function getWeeklyAttendance(weeksBack = 8): Promise<WeeklyAttendance[]> {
  const entries = await db.getAttendanceEntries()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - weeksBack * 7)
  const cutoffStr = cutoff.toISOString().split('T')[0]
  return entries
    .filter(e => e.date >= cutoffStr)
    .map(e => ({ date: e.date, serviceTimeId: e.service_time_id, summary: sumEntry(e) }))
}
