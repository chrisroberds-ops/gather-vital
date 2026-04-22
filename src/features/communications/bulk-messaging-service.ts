// ── Bulk Messaging Service ─────────────────────────────────────────────────────
// Pure audience filter functions (no DB calls — easily unit-testable) plus
// DB-aware helpers that resolve filters and send bulk emails.

import type { Person, Group, GroupMember, TeamMember } from '@/shared/types'
import { replaceMergeFields, sendEmail } from '@/services/notification-service'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AudienceFilterType =
  | 'all_members'
  | 'all_volunteers'
  | 'all_group_leaders'
  | 'visitors_last_n_days'
  | 'group_members'
  | 'team_volunteers'
  | 'birthday_this_month'

export interface AudienceFilter {
  type: AudienceFilterType
  /** days — used for visitors_last_n_days */
  days?: number
  /** group id — used for group_members */
  groupId?: string
  /** team id — used for team_volunteers */
  teamId?: string
}

export interface BulkSendResult {
  sent: number
  failed: number
}

// ── Pure audience filter functions ─────────────────────────────────────────────

/** All active (non-archived, non-child) people. */
export function filterAllMembers(people: Person[]): Person[] {
  return people.filter(p => !p.is_child && !p.is_archived && p.is_active)
}

/** Anyone who appears as a member of any team. */
export function filterAllVolunteers(people: Person[], allTeamMembers: TeamMember[]): Person[] {
  const volunteerIds = new Set(allTeamMembers.map(tm => tm.person_id))
  return people.filter(p => !p.is_child && !p.is_archived && p.is_active && volunteerIds.has(p.id))
}

/** Anyone who is the designated leader_id of at least one group. */
export function filterAllGroupLeaders(people: Person[], groups: Group[]): Person[] {
  const leaderIds = new Set(groups.filter(g => g.leader_id).map(g => g.leader_id!))
  return people.filter(p => !p.is_child && !p.is_archived && p.is_active && leaderIds.has(p.id))
}

/**
 * People whose first_visit_date is within the last `days` days.
 * `referenceDate` defaults to today (injected for testing).
 */
export function filterVisitorsLastNDays(
  people: Person[],
  days: number,
  referenceDate: Date = new Date(),
): Person[] {
  const cutoff = new Date(referenceDate)
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return people.filter(p =>
    !p.is_child &&
    !p.is_archived &&
    p.is_active &&
    p.first_visit_date !== undefined &&
    p.first_visit_date >= cutoffStr,
  )
}

/** Active members of a specific group. */
export function filterGroupMembers(
  people: Person[],
  groupMembers: GroupMember[],
  groupId: string,
): Person[] {
  const memberIds = new Set(
    groupMembers.filter(gm => gm.group_id === groupId && gm.status === 'active').map(gm => gm.person_id),
  )
  return people.filter(p => !p.is_child && !p.is_archived && p.is_active && memberIds.has(p.id))
}

/** Members of a specific team. */
export function filterTeamVolunteers(
  people: Person[],
  teamMembers: TeamMember[],
  teamId: string,
): Person[] {
  const memberIds = new Set(teamMembers.filter(tm => tm.team_id === teamId).map(tm => tm.person_id))
  return people.filter(p => !p.is_child && !p.is_archived && p.is_active && memberIds.has(p.id))
}

/**
 * People whose date_of_birth month matches the current month.
 * `referenceDate` defaults to today (injected for testing).
 */
export function filterBirthdayThisMonth(people: Person[], referenceDate: Date = new Date()): Person[] {
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0')
  return people.filter(p =>
    !p.is_child &&
    !p.is_archived &&
    p.is_active &&
    p.date_of_birth !== undefined &&
    p.date_of_birth.slice(5, 7) === month,
  )
}

// ── Merge field rendering ──────────────────────────────────────────────────────

/**
 * Render a subject/body template for a given recipient.
 * `churchName` is injected from AppConfig.
 */
export function renderForRecipient(
  template: string,
  person: Person,
  churchName: string,
): string {
  return replaceMergeFields(template, {
    first_name: person.first_name,
    last_name: person.last_name,
    church_name: churchName,
  })
}

// ── DB-aware: resolve audience ─────────────────────────────────────────────────

export async function resolveAudienceFromDb(filter: AudienceFilter): Promise<Person[]> {
  const { db } = await import('@/services')
  const people = await db.getPeople()

  switch (filter.type) {
    case 'all_members':
      return filterAllMembers(people)

    case 'all_volunteers': {
      // Collect all team members across all teams
      const teams = await db.getTeams()
      const allTm = (await Promise.all(teams.map(t => db.getTeamMembers(t.id)))).flat()
      return filterAllVolunteers(people, allTm)
    }

    case 'all_group_leaders': {
      const groups = await db.getGroups()
      return filterAllGroupLeaders(people, groups)
    }

    case 'visitors_last_n_days':
      return filterVisitorsLastNDays(people, filter.days ?? 30)

    case 'group_members': {
      if (!filter.groupId) return []
      const gm = await db.getGroupMembers(filter.groupId)
      return filterGroupMembers(people, gm, filter.groupId)
    }

    case 'team_volunteers': {
      if (!filter.teamId) return []
      const tm = await db.getTeamMembers(filter.teamId)
      return filterTeamVolunteers(people, tm, filter.teamId)
    }

    case 'birthday_this_month':
      return filterBirthdayThisMonth(people)

    default:
      return []
  }
}

// ── DB-aware: send bulk email ──────────────────────────────────────────────────

export async function sendBulkEmail(
  recipients: Person[],
  subject: string,
  bodyTemplate: string,
  senderName: string,
  churchName: string,
): Promise<BulkSendResult> {
  let sent = 0
  let failed = 0

  // Send each email individually, skipping the per-message log entry.
  // One summary log entry is written at the end.
  await Promise.allSettled(
    recipients
      .filter(p => p.email)
      .map(async person => {
        const personalSubject = renderForRecipient(subject, person, churchName)
        const personalBody = renderForRecipient(bodyTemplate, person, churchName)
        try {
          await sendEmail(
            { to: person.email!, subject: personalSubject, body: personalBody, personId: person.id },
            { skipLog: true },
          )
          sent++
        } catch {
          failed++
        }
      }),
  )

  // Write a single summary log entry
  const { db } = await import('@/services')
  await db.createCommunicationsLogEntry({
    channel: 'email',
    subject,
    recipient: `${sent} of ${recipients.filter(p => p.email).length} recipients`,
    success: failed === 0,
    is_bulk: true,
    recipient_count: sent + failed,
    sender_name: senderName,
    ...(failed > 0 ? { error_message: `${failed} send(s) failed` } : {}),
  })

  return { sent, failed }
}
