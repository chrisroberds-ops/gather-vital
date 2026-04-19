import type { EnrichedScheduleEntry } from './volunteer-service'
import type { VolunteerSchedule, Team, TeamMember, ServiceTime, Person } from '@/shared/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RunSheetEntry {
  schedule: VolunteerSchedule
  person: Person | null
  isFirstTime: boolean
  isTeamLead: boolean
}

export interface RunSheetTeamGroup {
  team: Team
  entries: RunSheetEntry[]
  /** Count of active (non-cancelled, non-declined) entries with status 'confirmed'. */
  confirmedCount: number
  /** Count of active (non-cancelled) entries — denominator for "X of Y confirmed". */
  totalCount: number
}

// ── Pure logic functions ──────────────────────────────────────────────────────

/**
 * A volunteer is first-time in a role if they have no prior `served === true`
 * record in that exact position, on a date strictly before the current entry's date.
 */
export function isFirstTimeInRole(
  entry: VolunteerSchedule,
  allHistory: VolunteerSchedule[],
): boolean {
  return !allHistory.some(
    h =>
      h.person_id === entry.person_id &&
      h.position === entry.position &&
      h.served === true &&
      h.scheduled_date < entry.scheduled_date,
  )
}

/**
 * Filter enriched entries to a specific service time.
 * Entries without a service_time_id are included in every service view.
 * Pass null or empty string to return all entries unfiltered.
 */
export function filterByServiceTime(
  entries: EnrichedScheduleEntry[],
  serviceTimeId: string | null,
): EnrichedScheduleEntry[] {
  if (!serviceTimeId) return entries
  return entries.filter(
    e => !e.entry.service_time_id || e.entry.service_time_id === serviceTimeId,
  )
}

/**
 * Group enriched schedule entries by team.
 *
 * - Team lead detection: checks teamMembersMap for role === 'leader' | 'coordinator'
 * - First-time detection: compares against allHistory
 * - Within each team, team leads sort first, then alphabetically by last name
 * - Groups are sorted alphabetically by team name
 */
export function groupEntriesByTeam(
  entries: EnrichedScheduleEntry[],
  allTeams: Team[],
  teamMembersMap: Map<string, TeamMember[]>,
  allHistory: VolunteerSchedule[],
): RunSheetTeamGroup[] {
  const byTeam = new Map<string, EnrichedScheduleEntry[]>()
  for (const e of entries) {
    const tid = e.entry.team_id
    if (!byTeam.has(tid)) byTeam.set(tid, [])
    byTeam.get(tid)!.push(e)
  }

  const groups: RunSheetTeamGroup[] = []

  for (const [teamId, teamEntries] of byTeam.entries()) {
    const team = allTeams.find(t => t.id === teamId)
    if (!team) continue

    const members = teamMembersMap.get(teamId) ?? []
    const leadIds = new Set(
      members
        .filter(m => m.role === 'leader' || m.role === 'coordinator')
        .map(m => m.person_id),
    )

    const runSheetEntries: RunSheetEntry[] = teamEntries.map(e => ({
      schedule: e.entry,
      person: e.person,
      isFirstTime: isFirstTimeInRole(e.entry, allHistory),
      isTeamLead: leadIds.has(e.entry.person_id),
    }))

    // Sort: leads first, then alphabetically by last name + first name
    runSheetEntries.sort((a, b) => {
      if (a.isTeamLead && !b.isTeamLead) return -1
      if (!a.isTeamLead && b.isTeamLead) return 1
      const aName = a.person ? `${a.person.last_name} ${a.person.first_name}` : ''
      const bName = b.person ? `${b.person.last_name} ${b.person.first_name}` : ''
      return aName.localeCompare(bName)
    })

    // Confirmation counts: exclude cancelled; declined counts in total but not confirmed
    const active = runSheetEntries.filter(e => e.schedule.status !== 'cancelled')
    const confirmedCount = active.filter(e => e.schedule.status === 'confirmed').length
    const totalCount = active.filter(e => e.schedule.status !== 'declined').length

    groups.push({ team, entries: runSheetEntries, confirmedCount, totalCount })
  }

  groups.sort((a, b) => a.team.name.localeCompare(b.team.name))
  return groups
}

/** Format a Date as a local YYYY-MM-DD string (avoids UTC offset issues). */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Return the next calendar date on which a service is scheduled, on or after `fromDate`.
 * Uses local date arithmetic throughout to avoid UTC-offset timezone issues.
 * Defaults to Sunday (day 0) if no service times are configured.
 */
export function nextServiceDate(
  serviceTimes: ServiceTime[],
  fromDate: Date = new Date(),
): string {
  const dayNumbers: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  }

  const serviceDays =
    serviceTimes.length > 0
      ? [...new Set(serviceTimes.map(s => dayNumbers[s.day]))]
      : [0] // default Sunday

  // Use local date components to avoid UTC midnight timezone shifts
  const y = fromDate.getFullYear()
  const mo = fromDate.getMonth()
  const day = fromDate.getDate()

  for (let i = 0; i <= 7; i++) {
    const check = new Date(y, mo, day + i)
    if (serviceDays.includes(check.getDay())) {
      return localDateStr(check)
    }
  }

  // Fallback to next Sunday
  const dow = new Date(y, mo, day).getDay()
  return localDateStr(new Date(y, mo, day + ((7 - dow) % 7 || 7)))
}

/** True if the team name contains "kids" (case-insensitive). */
export function isKidsTeam(team: Team): boolean {
  return team.name.toLowerCase().includes('kids')
}
