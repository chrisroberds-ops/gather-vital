import { db } from '@/services'
import type {
  Team,
  TeamMember,
  VolunteerSchedule,
  VolunteerBlackout,
  VolunteerScheduleStatus,
  RotationPreference,
  TeamMemberRole,
  Person,
} from '@/shared/types'

// ── Teams ─────────────────────────────────────────────────────────────────────

export async function getTeams(): Promise<Team[]> {
  const teams = await db.getTeams()
  return teams.filter(t => t.is_active)
}

export async function createTeam(data: { name: string; description?: string; coordinatorId?: string }): Promise<Team> {
  return db.createTeam({
    name: data.name,
    description: data.description,
    coordinator_id: data.coordinatorId,
    is_active: true,
  })
}

export async function updateTeam(id: string, data: Partial<Pick<Team, 'name' | 'description' | 'coordinator_id' | 'is_active'>>): Promise<Team> {
  return db.updateTeam(id, data)
}

// ── Team members ──────────────────────────────────────────────────────────────

export interface EnrichedMember {
  member: TeamMember
  person: Person
}

export async function getEnrichedTeamMembers(teamId: string): Promise<EnrichedMember[]> {
  const members = await db.getTeamMembers(teamId)
  const rows = await Promise.all(
    members.map(async m => {
      const person = await db.getPerson(m.person_id)
      return person ? { member: m, person } : null
    })
  )
  return rows.filter((r): r is EnrichedMember => r !== null)
}

export async function addTeamMember(
  teamId: string,
  personId: string,
  role: TeamMemberRole,
  rotationPreference: RotationPreference,
): Promise<TeamMember> {
  return db.addTeamMember({
    team_id: teamId,
    person_id: personId,
    role,
    rotation_preference: rotationPreference,
    joined_at: new Date().toISOString().split('T')[0],
  })
}

export async function removeTeamMember(teamId: string, personId: string): Promise<void> {
  return db.removeTeamMember(teamId, personId)
}

export async function updateMemberRotation(
  memberId: string,
  rotationPreference: RotationPreference,
): Promise<TeamMember> {
  return db.updateTeamMember(memberId, { rotation_preference: rotationPreference })
}

// ── Schedule ──────────────────────────────────────────────────────────────────

export interface EnrichedScheduleEntry {
  entry: VolunteerSchedule
  person: Person | null
  team: Team | null
}

export async function getEnrichedSchedule(teamId?: string, personId?: string): Promise<EnrichedScheduleEntry[]> {
  const entries = await db.getVolunteerSchedule(teamId, personId)
  const teams = await db.getTeams()
  const teamMap = new Map(teams.map(t => [t.id, t]))

  return Promise.all(
    entries.map(async entry => ({
      entry,
      person: await db.getPerson(entry.person_id),
      team: teamMap.get(entry.team_id) ?? null,
    }))
  )
}

export async function updateScheduleStatus(
  id: string,
  status: VolunteerScheduleStatus,
): Promise<VolunteerSchedule> {
  const updates: Partial<VolunteerSchedule> = { status }
  if (status === 'confirmed') updates.confirmed_at = new Date().toISOString()
  return db.updateVolunteerSchedule(id, updates)
}

/**
 * Mark a volunteer schedule entry as served (true), no-show (false), or
 * clear the attendance mark (undefined).  Pass null to clear.
 */
export async function markServed(
  id: string,
  served: boolean | null,
): Promise<VolunteerSchedule> {
  if (served === null) {
    return db.updateVolunteerSchedule(id, { served: undefined, served_at: undefined })
  }
  return db.updateVolunteerSchedule(id, {
    served,
    served_at: new Date().toISOString(),
  })
}

/**
 * Count unique volunteers who served at least once in a given calendar month.
 * Used by the Monthly Vital Signs Report for the service participation metric.
 *
 * @param year  4-digit year (e.g. 2026)
 * @param month 1-based month (1 = January, 12 = December)
 */
export async function getServedVolunteersInMonth(
  year: number,
  month: number,
): Promise<{ count: number; person_ids: string[] }> {
  const allEntries = await db.getVolunteerSchedule()

  const monthStr = `${year}-${String(month).padStart(2, '0')}`
  const servedIds = new Set<string>()

  for (const entry of allEntries) {
    if (entry.served === true && entry.scheduled_date.startsWith(monthStr)) {
      servedIds.add(entry.person_id)
    }
  }

  return { count: servedIds.size, person_ids: [...servedIds] }
}

export async function deleteScheduleEntry(id: string): Promise<void> {
  return db.deleteVolunteerSchedule(id)
}

export async function createScheduleEntry(data: {
  teamId: string
  personId: string
  date: string
  position: string
}): Promise<VolunteerSchedule> {
  return db.createVolunteerSchedule({
    team_id: data.teamId,
    person_id: data.personId,
    scheduled_date: data.date,
    position: data.position,
    status: 'pending',
    reminder_sent: false,
  })
}

// ── Blackouts ─────────────────────────────────────────────────────────────────

export async function getBlackouts(personId: string): Promise<VolunteerBlackout[]> {
  return db.getVolunteerBlackouts(personId)
}

export async function addBlackout(
  personId: string,
  startDate: string,
  endDate: string,
  reason?: string,
): Promise<VolunteerBlackout> {
  return db.createVolunteerBlackout({ person_id: personId, start_date: startDate, end_date: endDate, reason })
}

export async function removeBlackout(id: string): Promise<void> {
  return db.deleteVolunteerBlackout(id)
}

// ── Schedule auto-generation ──────────────────────────────────────────────────

export interface GenerateOptions {
  teamId: string
  startDate: string   // YYYY-MM-DD
  endDate: string     // YYYY-MM-DD
  position: string    // position label for all generated slots
  skipConflicts: boolean
}

export interface GenerateResult {
  created: number
  skipped: number
  reasons: string[]
}

export async function generateSchedule(options: GenerateOptions): Promise<GenerateResult> {
  const { teamId, startDate, endDate, position, skipConflicts } = options

  const sundays = getSundaysBetween(startDate, endDate)
  if (sundays.length === 0) return { created: 0, skipped: 0, reasons: ['No Sundays in the selected date range.'] }

  const members = await db.getTeamMembers(teamId)
  const eligible = members.filter(m => m.rotation_preference !== 'as_needed')
  if (eligible.length === 0) return { created: 0, skipped: 0, reasons: ['No members with a rotation preference set (all are "as needed").'] }

  // Load existing entries from OTHER teams only (conflict = already serving elsewhere that day)
  const scheduledOnDate = new Map<string, Set<string>>() // date → Set<personId>
  if (skipConflicts) {
    const allSchedule = await db.getVolunteerSchedule()
    for (const s of allSchedule) {
      if (s.team_id === teamId) continue // ignore same-team entries
      if (!scheduledOnDate.has(s.scheduled_date)) scheduledOnDate.set(s.scheduled_date, new Set())
      scheduledOnDate.get(s.scheduled_date)!.add(s.person_id)
    }
  }

  // Load person names and blackouts for all eligible members
  const blackoutsMap = new Map<string, VolunteerBlackout[]>()
  const personNameMap = new Map<string, string>()
  await Promise.all(
    eligible.map(async m => {
      blackoutsMap.set(m.person_id, await db.getVolunteerBlackouts(m.person_id))
      const person = await db.getPerson(m.person_id)
      if (person) personNameMap.set(m.person_id, [person.first_name, person.last_name].filter(Boolean).join(' '))
    })
  )

  let created = 0
  let skipped = 0
  const reasons: string[] = []

  for (let sundayIdx = 0; sundayIdx < sundays.length; sundayIdx++) {
    const sunday = sundays[sundayIdx]

    for (const member of eligible) {
      if (!shouldServeOnDate(member.rotation_preference, sunday, sundayIdx)) continue

      // Check blackout
      const blackouts = blackoutsMap.get(member.person_id) ?? []
      if (isBlackedOut(member.person_id, sunday, blackouts)) {
        skipped++
        continue
      }

      // Check cross-team conflict
      if (skipConflicts) {
        const alreadyScheduled = scheduledOnDate.get(sunday)
        if (alreadyScheduled?.has(member.person_id)) {
          skipped++
          const name = personNameMap.get(member.person_id) ?? member.person_id
          reasons.push(`Skipped ${name} on ${sunday} — already scheduled for another team.`)
          continue
        }
      }

      await db.createVolunteerSchedule({
        team_id: teamId,
        person_id: member.person_id,
        scheduled_date: sunday,
        position,
        status: 'pending',
        reminder_sent: false,
      })

      // Track in conflict map so same person isn't double-added within this generation run
      if (!scheduledOnDate.has(sunday)) scheduledOnDate.set(sunday, new Set())
      scheduledOnDate.get(sunday)!.add(member.person_id)

      created++
    }
  }

  return { created, skipped, reasons }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns all Sundays (YYYY-MM-DD) between startDate and endDate inclusive. */
export function getSundaysBetween(startDate: string, endDate: string): string[] {
  const sundays: string[] = []
  const cur = new Date(startDate + 'T12:00:00')
  const end = new Date(endDate + 'T12:00:00')
  // Advance to first Sunday
  while (cur.getDay() !== 0) cur.setDate(cur.getDate() + 1)
  while (cur <= end) {
    sundays.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 7)
  }
  return sundays
}

/** Returns which nth Sunday of the month a given date is (1–5). */
function nthSundayOfMonth(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00')
  return Math.ceil(d.getDate() / 7)
}

function shouldServeOnDate(pref: RotationPreference, dateStr: string, sundayIndex: number): boolean {
  switch (pref) {
    case 'every_week': return true
    case '1st_sunday': return nthSundayOfMonth(dateStr) === 1
    case '2nd_sunday': return nthSundayOfMonth(dateStr) === 2
    case '3rd_sunday': return nthSundayOfMonth(dateStr) === 3
    case '4th_sunday': return nthSundayOfMonth(dateStr) === 4
    case '5th_sunday': return nthSundayOfMonth(dateStr) === 5
    case 'every_other': return sundayIndex % 2 === 0
    case 'as_needed': return false
    default: return false
  }
}

function isBlackedOut(personId: string, dateStr: string, blackouts: VolunteerBlackout[]): boolean {
  return blackouts.some(b => dateStr >= b.start_date && dateStr <= b.end_date)
}
