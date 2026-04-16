/**
 * Group Attendance Service
 *
 * Manages per-meeting attendance for small groups:
 * - Create / delete meetings
 * - Save a full attendance snapshot for a meeting (present/absent/excused per member)
 * - Calculate attendance rates (group-level and per-member)
 * - Export attendance history as CSV
 */

import { db } from '@/services'
import { displayName } from '@/shared/utils/format'
import type { GroupMeeting, GroupAttendance, GroupAttendanceStatus, Person } from '@/shared/types'

// ── Public types ──────────────────────────────────────────────────────────────

export interface AttendanceRecord {
  personId: string
  status: GroupAttendanceStatus
}

export interface MeetingWithAttendance {
  meeting: GroupMeeting
  attendance: GroupAttendance[]
  presentCount: number
  totalCount: number
}

export interface GroupAttendanceRate {
  meetingCount: number
  /** Total present marks across all meetings and all members */
  presentCount: number
  /** Unique member count ever marked in any meeting */
  memberCount: number
  /** Overall rate: presentCount / (meetingCount × memberCount), 0–1 */
  rate: number
}

export interface MemberAttendanceRate {
  personId: string
  name: string
  present: number
  total: number
  rate: number
}

// ── Meetings CRUD ─────────────────────────────────────────────────────────────

export async function getMeetings(groupId: string): Promise<GroupMeeting[]> {
  return db.getGroupMeetings(groupId)
}

export async function createMeeting(
  groupId: string,
  date: string,
  notes?: string,
): Promise<GroupMeeting> {
  return db.createGroupMeeting({ group_id: groupId, date, notes })
}

export async function updateMeeting(
  meetingId: string,
  data: { date?: string; notes?: string },
): Promise<GroupMeeting> {
  return db.updateGroupMeeting(meetingId, data)
}

export async function deleteMeeting(meetingId: string): Promise<void> {
  return db.deleteGroupMeeting(meetingId)
}

// ── Attendance snapshots ──────────────────────────────────────────────────────

/**
 * Save attendance for an entire meeting in one call.
 * Each record is upserted so re-saving is safe.
 */
export async function saveAttendance(
  meetingId: string,
  records: AttendanceRecord[],
): Promise<GroupAttendance[]> {
  return Promise.all(
    records.map(r =>
      db.upsertGroupAttendance({ meeting_id: meetingId, person_id: r.personId, status: r.status }),
    ),
  )
}

export async function getMeetingAttendance(meetingId: string): Promise<GroupAttendance[]> {
  return db.getGroupAttendance(meetingId)
}

/**
 * Returns each meeting for a group enriched with its attendance records.
 * Meetings are newest-first (DB already sorts that way).
 */
export async function getMeetingsWithAttendance(groupId: string): Promise<MeetingWithAttendance[]> {
  const meetings = await db.getGroupMeetings(groupId)
  return Promise.all(
    meetings.map(async meeting => {
      const attendance = await db.getGroupAttendance(meeting.id)
      const presentCount = attendance.filter(a => a.status === 'present').length
      return { meeting, attendance, presentCount, totalCount: attendance.length }
    }),
  )
}

// ── Attendance rate calculations ──────────────────────────────────────────────

/**
 * Overall attendance rate for a group:
 * (total present marks) / (meetings × unique members ever tracked), 0–1.
 * Returns rate = 0 when no meetings have been logged.
 */
export async function getGroupAttendanceRate(groupId: string): Promise<GroupAttendanceRate> {
  const meetings = await db.getGroupMeetings(groupId)
  if (meetings.length === 0) {
    return { meetingCount: 0, presentCount: 0, memberCount: 0, rate: 0 }
  }

  const allAttendance = (
    await Promise.all(meetings.map(m => db.getGroupAttendance(m.id)))
  ).flat()

  const presentCount = allAttendance.filter(a => a.status === 'present').length
  const memberCount = new Set(allAttendance.map(a => a.person_id)).size
  const denominator = meetings.length * memberCount
  const rate = denominator > 0 ? presentCount / denominator : 0

  return { meetingCount: meetings.length, presentCount, memberCount, rate }
}

/**
 * Per-member attendance rates across all meetings for a group.
 * Only active members of the group are included.
 * Sorted by rate descending.
 */
export async function getMemberAttendanceRates(
  groupId: string,
): Promise<MemberAttendanceRate[]> {
  const [meetings, members] = await Promise.all([
    db.getGroupMeetings(groupId),
    db.getGroupMembers(groupId),
  ])

  const activeMembers = members.filter(m => m.status === 'active')
  if (activeMembers.length === 0 || meetings.length === 0) return []

  // Fetch all people to get display names
  const personIds = new Set(activeMembers.map(m => m.person_id))
  const people = await Promise.all([...personIds].map(pid => db.getPerson(pid)))
  const personMap = new Map<string, Person>()
  for (const p of people) {
    if (p) personMap.set(p.id, p)
  }

  // Collect attendance records per person across all meetings
  const allAttendance = (
    await Promise.all(meetings.map(m => db.getGroupAttendance(m.id)))
  ).flat()

  const attendanceByPerson = new Map<string, GroupAttendance[]>()
  for (const record of allAttendance) {
    if (!attendanceByPerson.has(record.person_id)) {
      attendanceByPerson.set(record.person_id, [])
    }
    attendanceByPerson.get(record.person_id)!.push(record)
  }

  return activeMembers
    .map(member => {
      const records = attendanceByPerson.get(member.person_id) ?? []
      const present = records.filter(r => r.status === 'present').length
      const total = meetings.length
      const rate = total > 0 ? present / total : 0
      const person = personMap.get(member.person_id)
      const name = person ? displayName(person) : member.person_id
      return { personId: member.person_id, name, present, total, rate }
    })
    .sort((a, b) => b.rate - a.rate)
}

// ── CSV export ────────────────────────────────────────────────────────────────

/**
 * Returns a CSV string with columns:
 * Meeting Date, Meeting Notes, Member Name, Status
 *
 * Rows are sorted by date ascending then member name.
 */
export async function exportGroupAttendanceCsv(groupId: string): Promise<string> {
  const rows: string[][] = [['Meeting Date', 'Meeting Notes', 'Member Name', 'Status']]

  const meetings = await db.getGroupMeetings(groupId)
  // Oldest-first for export
  const sorted = [...meetings].sort((a, b) => a.date.localeCompare(b.date))

  for (const meeting of sorted) {
    const attendance = await db.getGroupAttendance(meeting.id)
    // Fetch person names
    const personIds = [...new Set(attendance.map(a => a.person_id))]
    const people = await Promise.all(personIds.map(pid => db.getPerson(pid)))
    const personMap = new Map<string, string>()
    for (const p of people) {
      if (p) personMap.set(p.id, displayName(p))
    }

    const sortedRecords = [...attendance].sort((a, b) => {
      const na = personMap.get(a.person_id) ?? ''
      const nb = personMap.get(b.person_id) ?? ''
      return na.localeCompare(nb)
    })

    for (const record of sortedRecords) {
      rows.push([
        meeting.date,
        meeting.notes ?? '',
        personMap.get(record.person_id) ?? record.person_id,
        record.status,
      ])
    }
  }

  return rows
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n')
}
