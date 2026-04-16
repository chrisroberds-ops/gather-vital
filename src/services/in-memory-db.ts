import { v4 as uuidv4 } from 'uuid'
import type { DatabaseService } from './db-interface'
import { getChurchId, TEST_CHURCH_ID } from './church-context'

import type {
  Church,
  Person,
  Household,
  HouseholdMember,
  ChildPickup,
  CheckinSession,
  Checkin,
  CheckinFlag,
  Team,
  TeamMember,
  VolunteerSchedule,
  VolunteerBlackout,
  Group,
  GroupMember,
  GroupMeeting,
  GroupAttendance,
  GroupAttendanceStatus,
  Event,
  EventRegistration,
  GivingRecord,
  VisitorFollowup,
  FollowupTemplate,
  AttendanceLog,
  AppConfig,
} from '@/shared/types'
import { DEFAULT_APP_CONFIG } from '@/shared/types'
import type {
  CommunicationsLogEntry,
  AttendanceEntry,
  PickupAttempt,
  Song,
  ServicePlan,
  ServicePlanItem,
  ServiceAssignment,
  PickupQueueEntry,
  MusicStandSession,
  MusicStandAnnotation,
  UserPdfPreferences,
} from '@/shared/types'

// Import generated test data
import peopleData from '@/test-data/people.json'
import householdsData from '@/test-data/households.json'
import householdMembersData from '@/test-data/household_members.json'
import childPickupsData from '@/test-data/child_pickups.json'
import checkinFlagsData from '@/test-data/checkin_flags.json'
import teamsData from '@/test-data/teams.json'
import teamMembersData from '@/test-data/team_members.json'
import volunteerScheduleData from '@/test-data/volunteer_schedule.json'
import volunteerBlackoutsData from '@/test-data/volunteer_blackouts.json'
import groupsData from '@/test-data/groups.json'
import groupMembersData from '@/test-data/group_members.json'
import eventsData from '@/test-data/events.json'
import eventRegistrationsData from '@/test-data/event_registrations.json'
import givingRecordsData from '@/test-data/giving_records.json'
import visitorFollowupData from '@/test-data/visitor_followup.json'
import followupTemplatesData from '@/test-data/followup_templates.json'
import appConfigData from '@/test-data/app_config.json'
import churchesData from '@/test-data/churches.json'
import songsData from '@/test-data/songs.json'

// ── Church scoping helpers ────────────────────────────────────────────────────
// Seed data predates multi-tenancy and lacks church_id.
// We treat those records as belonging to TEST_CHURCH_ID so existing tests
// continue to pass without regenerating test data.
function cid(r: { church_id?: string }): string {
  return r.church_id ?? TEST_CHURCH_ID
}

function inChurch<T extends { church_id?: string }>(records: T[]): T[] {
  const current = getChurchId()
  return records.filter(r => cid(r) === current)
}

function stamp<T>(data: T): T & { church_id: string } {
  return { church_id: getChurchId(), ...data }
}

// ── localStorage persistence helpers (cross-tab) ─────────────────────────────
// The in-memory store is per-tab. Data written in Tab A is invisible to Tab B
// unless persisted to localStorage. We use targeted keys for each data type
// that must survive across tabs.

// ── AppConfig persistence ─────────────────────────────────────────────────────
// When the admin tab saves church_name/primary_color/etc., the display tab's
// in-memory store.appConfigs still holds the seed data. Persisting to
// localStorage lets reloadConfig() in the display tab pick up the latest value.

function appConfigLsKey(churchId: string): string {
  return `gather_app_config_${churchId}`
}

function readPersistedAppConfig(churchId: string): AppConfig | null {
  try {
    const raw = localStorage.getItem(appConfigLsKey(churchId))
    return raw ? (JSON.parse(raw) as AppConfig) : null
  } catch { return null }
}

function writePersistedAppConfig(config: AppConfig): void {
  try {
    localStorage.setItem(appConfigLsKey(config.church_id), JSON.stringify(config))
  } catch {}
}

// ── Service Plans / Items / Assignments persistence (cross-tab) ───────────────
// Service plans are authored in the admin tab and viewed in the Music Stand tab.
// The in-memory store is per-tab (resets on page load), so we persist to
// localStorage so any tab can read plans written by another tab — the same
// pattern used for AppConfig and Church overrides above.

const SONGS_LS_KEY   = 'gather_songs'
const PLANS_LS_KEY   = 'gather_service_plans'
const ITEMS_LS_KEY   = 'gather_service_plan_items'
const ASSIGNS_LS_KEY = 'gather_service_assignments'

function readLs<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as T[] } catch { return [] }
}

function writeLs(key: string, data: unknown[]): void {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch {}
}

/** Merge persisted records into a store array — adds any record not already present by id. */
function mergeIntoStore<T extends { id: string }>(storeArr: T[], persisted: T[]): void {
  const ids = new Set(storeArr.map(r => r.id))
  for (const r of persisted) {
    if (!ids.has(r.id)) storeArr.push(r)
  }
}

// ── Church overrides persistence ──────────────────────────────────────────────

const CHURCHES_LS_KEY = 'gather_church_overrides'

function readChurchOverrides(): Record<string, Partial<Church>> {
  try {
    return JSON.parse(localStorage.getItem(CHURCHES_LS_KEY) ?? '{}') as Record<string, Partial<Church>>
  } catch { return {} }
}

function writeChurchOverride(churchId: string, data: Partial<Church>): void {
  try {
    const all = readChurchOverrides()
    all[churchId] = { ...(all[churchId] ?? {}), ...data }
    localStorage.setItem(CHURCHES_LS_KEY, JSON.stringify(all))
  } catch {}
}

// ── Mutable in-memory store ───────────────────────────────────────────────────
// Resets on page refresh — intentional for test/dev mode.
const store = {
  // Global (not church-scoped)
  churches: churchesData as Church[],

  // Church-scoped (filtered via inChurch() on every read)
  people: peopleData as Person[],
  households: householdsData as Household[],
  householdMembers: householdMembersData as HouseholdMember[],
  childPickups: childPickupsData as ChildPickup[],
  checkinSessions: [] as CheckinSession[],
  checkins: [] as Checkin[],
  checkinFlags: checkinFlagsData as CheckinFlag[],
  teams: teamsData as Team[],
  teamMembers: teamMembersData as TeamMember[],
  volunteerSchedule: volunteerScheduleData as VolunteerSchedule[],
  volunteerBlackouts: volunteerBlackoutsData as VolunteerBlackout[],
  groups: groupsData as Group[],
  groupMembers: groupMembersData as GroupMember[],
  groupMeetings: [] as GroupMeeting[],
  groupAttendances: [] as GroupAttendance[],
  events: eventsData as Event[],
  eventRegistrations: eventRegistrationsData as EventRegistration[],
  givingRecords: givingRecordsData as GivingRecord[],
  visitorFollowup: visitorFollowupData as VisitorFollowup[],
  followupTemplates: followupTemplatesData as FollowupTemplate[],
  attendanceLogs: [] as AttendanceLog[],
  appConfigs: appConfigData as AppConfig[],
  communicationsLog: [] as CommunicationsLogEntry[],
  attendanceEntries: [] as AttendanceEntry[],
  pickupAttempts: [] as PickupAttempt[],
  songs: songsData as Song[],
  servicePlans: [] as ServicePlan[],
  servicePlanItems: [] as ServicePlanItem[],
  serviceAssignments: [] as ServiceAssignment[],
  pickupQueue: [] as PickupQueueEntry[],
  musicStandSessions: [] as MusicStandSession[],
  musicStandAnnotations: [] as MusicStandAnnotation[],
  userPdfPreferences: [] as UserPdfPreferences[],
}

function id() {
  return uuidv4()
}

function now() {
  return new Date().toISOString()
}

function normalize(phone: string): string {
  return phone.replace(/\D/g, '')
}

function matchesSearch(person: Person, query: string): boolean {
  const q = query.toLowerCase().trim()
  if (!q) return true
  const fields = [
    person.first_name,
    person.last_name,
    person.preferred_name,
    person.email,
    person.phone,
  ].filter(Boolean).map(s => s!.toLowerCase())
  return fields.some(f => f.includes(q))
}

export const inMemoryDb: DatabaseService = {
  // ── Churches (global) ────────────────────────────────────────────────────────
  async getChurches() {
    const overrides = readChurchOverrides()
    return store.churches.map(c => ({ ...c, ...(overrides[c.id] ?? {}) }))
  },

  async getChurch(churchId) {
    const church = store.churches.find(c => c.id === churchId) ?? null
    if (!church) return null
    const override = readChurchOverrides()[churchId]
    return override ? { ...church, ...override } : church
  },

  async getChurchBySlug(slug) {
    const overrides = readChurchOverrides()

    // Check in-memory store with localStorage overrides applied.
    for (const church of store.churches) {
      const merged = { ...church, ...(overrides[church.id] ?? {}) }
      if (merged.slug === slug) return merged
    }

    // Check for churches that were created in a different tab and only
    // exist in localStorage (not yet in this tab's in-memory store).
    for (const [churchId, override] of Object.entries(overrides)) {
      if (override.slug === slug && !store.churches.find(c => c.id === churchId)) {
        return override as Church
      }
    }

    return null
  },

  async createChurch(data) {
    const church: Church = { ...data, id: id(), created_at: now() }
    store.churches.push(church)
    // Persist so other tabs (e.g. the display page) can resolve the new church.
    writeChurchOverride(church.id, church)
    return church
  },

  async updateChurch(churchId, data) {
    const idx = store.churches.findIndex(c => c.id === churchId)
    if (idx === -1) throw new Error(`Church ${churchId} not found`)
    store.churches[idx] = { ...store.churches[idx], ...data }
    // Persist so other tabs see the updated name/slug immediately.
    writeChurchOverride(churchId, data)
    return store.churches[idx]
  },

  // ── People ──────────────────────────────────────────────────────────────────
  async getPeople() {
    return inChurch(store.people)
  },

  async getPerson(personId) {
    return inChurch(store.people).find(p => p.id === personId) ?? null
  },

  async getPersonByPhone(phone) {
    const normalized = normalize(phone)
    return inChurch(store.people).find(p => normalize(p.phone) === normalized) ?? null
  },

  async createPerson(data) {
    const person: Person = { ...stamp(data), id: id(), created_at: now(), updated_at: now() }
    store.people.push(person)
    return person
  },

  async updatePerson(personId, data) {
    const idx = store.people.findIndex(p => p.id === personId && cid(p) === getChurchId())
    if (idx === -1) throw new Error(`Person ${personId} not found`)
    store.people[idx] = { ...store.people[idx], ...data, updated_at: now() }
    return store.people[idx]
  },

  async deletePerson(personId) {
    const idx = store.people.findIndex(p => p.id === personId && cid(p) === getChurchId())
    if (idx !== -1) {
      store.people[idx] = { ...store.people[idx], is_active: false, is_archived: true, updated_at: now() }
    }
  },

  async searchPeople(query) {
    return inChurch(store.people).filter(p => matchesSearch(p, query))
  },

  // ── Households ──────────────────────────────────────────────────────────────
  async getHouseholds() {
    return inChurch(store.households)
  },

  async getHousehold(householdId) {
    return inChurch(store.households).find(h => h.id === householdId) ?? null
  },

  async createHousehold(data) {
    const household: Household = { ...stamp(data), id: id() }
    store.households.push(household)
    return household
  },

  async updateHousehold(householdId, data) {
    const idx = store.households.findIndex(h => h.id === householdId && cid(h) === getChurchId())
    if (idx === -1) throw new Error(`Household ${householdId} not found`)
    store.households[idx] = { ...store.households[idx], ...data }
    return store.households[idx]
  },

  async deleteHousehold(householdId) {
    store.households = store.households.filter(
      h => !(h.id === householdId && cid(h) === getChurchId())
    )
  },

  async getHouseholdMembers(householdId) {
    return inChurch(store.householdMembers).filter(m => m.household_id === householdId)
  },

  async getPersonHouseholds(personId) {
    const memberRecords = inChurch(store.householdMembers).filter(m => m.person_id === personId)
    return memberRecords
      .map(m => inChurch(store.households).find(h => h.id === m.household_id))
      .filter((h): h is Household => h !== undefined)
  },

  async addHouseholdMember(data) {
    const member: HouseholdMember = { ...stamp(data), id: id() }
    store.householdMembers.push(member)
    return member
  },

  async removeHouseholdMember(householdId, personId) {
    store.householdMembers = store.householdMembers.filter(
      m => !(m.household_id === householdId && m.person_id === personId && cid(m) === getChurchId())
    )
  },

  // ── Child Pickups ────────────────────────────────────────────────────────────
  async getChildPickups(childId) {
    return inChurch(store.childPickups).filter(p => p.child_id === childId)
  },

  async getPickupsByHousehold(householdId) {
    return inChurch(store.childPickups).filter(p => p.household_id === householdId)
  },

  async createChildPickup(data) {
    const pickup: ChildPickup = { ...stamp(data), id: id() }
    store.childPickups.push(pickup)
    return pickup
  },

  async updateChildPickup(pickupId, data) {
    const idx = store.childPickups.findIndex(p => p.id === pickupId && cid(p) === getChurchId())
    if (idx === -1) throw new Error(`ChildPickup ${pickupId} not found`)
    store.childPickups[idx] = { ...store.childPickups[idx], ...data }
    return store.childPickups[idx]
  },

  async deleteChildPickup(pickupId) {
    store.childPickups = store.childPickups.filter(
      p => !(p.id === pickupId && cid(p) === getChurchId())
    )
  },

  // ── Checkin Sessions ─────────────────────────────────────────────────────────
  async getCheckinSessions() {
    return inChurch(store.checkinSessions)
  },

  async getCheckinSession(sessionId) {
    return inChurch(store.checkinSessions).find(s => s.id === sessionId) ?? null
  },

  async createCheckinSession(data) {
    const session: CheckinSession = { ...stamp(data), id: id() }
    store.checkinSessions.push(session)
    return session
  },

  async updateCheckinSession(sessionId, data) {
    const idx = store.checkinSessions.findIndex(s => s.id === sessionId && cid(s) === getChurchId())
    if (idx === -1) throw new Error(`CheckinSession ${sessionId} not found`)
    store.checkinSessions[idx] = { ...store.checkinSessions[idx], ...data }
    return store.checkinSessions[idx]
  },

  // ── Checkins ─────────────────────────────────────────────────────────────────
  async getCheckins(sessionId) {
    return inChurch(store.checkins).filter(c => c.session_id === sessionId)
  },

  async createCheckin(data) {
    const checkin: Checkin = { ...stamp(data), id: id() }
    store.checkins.push(checkin)
    return checkin
  },

  async updateCheckin(checkinId, data) {
    const idx = store.checkins.findIndex(c => c.id === checkinId && cid(c) === getChurchId())
    if (idx === -1) throw new Error(`Checkin ${checkinId} not found`)
    store.checkins[idx] = { ...store.checkins[idx], ...data }
    return store.checkins[idx]
  },

  // ── Checkin Flags ────────────────────────────────────────────────────────────
  async getCheckinFlags() {
    return inChurch(store.checkinFlags)
  },

  async getCheckinFlagsForPerson(personId) {
    return inChurch(store.checkinFlags).filter(f => f.person_id === personId && f.is_active)
  },

  async createCheckinFlag(data) {
    const flag: CheckinFlag = { ...stamp(data), id: id(), created_at: now() }
    store.checkinFlags.push(flag)
    return flag
  },

  async updateCheckinFlag(flagId, data) {
    const idx = store.checkinFlags.findIndex(f => f.id === flagId && cid(f) === getChurchId())
    if (idx === -1) throw new Error(`CheckinFlag ${flagId} not found`)
    store.checkinFlags[idx] = { ...store.checkinFlags[idx], ...data }
    return store.checkinFlags[idx]
  },

  // ── Teams ────────────────────────────────────────────────────────────────────
  async getTeams() {
    return inChurch(store.teams)
  },

  async getTeam(teamId) {
    return inChurch(store.teams).find(t => t.id === teamId) ?? null
  },

  async createTeam(data) {
    const team: Team = { ...stamp(data), id: id() }
    store.teams.push(team)
    return team
  },

  async updateTeam(teamId, data) {
    const idx = store.teams.findIndex(t => t.id === teamId && cid(t) === getChurchId())
    if (idx === -1) throw new Error(`Team ${teamId} not found`)
    store.teams[idx] = { ...store.teams[idx], ...data }
    return store.teams[idx]
  },

  async getTeamMembers(teamId) {
    return inChurch(store.teamMembers).filter(m => m.team_id === teamId)
  },

  async addTeamMember(data) {
    const member: TeamMember = { ...stamp(data), id: id() }
    store.teamMembers.push(member)
    return member
  },

  async removeTeamMember(teamId, personId) {
    store.teamMembers = store.teamMembers.filter(
      m => !(m.team_id === teamId && m.person_id === personId && cid(m) === getChurchId())
    )
  },

  async updateTeamMember(memberId, data) {
    const idx = store.teamMembers.findIndex(m => m.id === memberId && cid(m) === getChurchId())
    if (idx === -1) throw new Error(`TeamMember ${memberId} not found`)
    store.teamMembers[idx] = { ...store.teamMembers[idx], ...data }
    return store.teamMembers[idx]
  },

  // ── Volunteer Schedule ───────────────────────────────────────────────────────
  async getVolunteerSchedule(teamId, personId) {
    return inChurch(store.volunteerSchedule).filter(s => {
      if (teamId && s.team_id !== teamId) return false
      if (personId && s.person_id !== personId) return false
      return true
    })
  },

  async createVolunteerSchedule(data) {
    const schedule: VolunteerSchedule = { ...stamp(data), id: id() }
    store.volunteerSchedule.push(schedule)
    return schedule
  },

  async updateVolunteerSchedule(scheduleId, data) {
    const idx = store.volunteerSchedule.findIndex(s => s.id === scheduleId && cid(s) === getChurchId())
    if (idx === -1) throw new Error(`VolunteerSchedule ${scheduleId} not found`)
    store.volunteerSchedule[idx] = { ...store.volunteerSchedule[idx], ...data }
    return store.volunteerSchedule[idx]
  },

  async deleteVolunteerSchedule(scheduleId) {
    store.volunteerSchedule = store.volunteerSchedule.filter(
      s => !(s.id === scheduleId && cid(s) === getChurchId())
    )
  },

  async getVolunteerBlackouts(personId) {
    return inChurch(store.volunteerBlackouts).filter(b => b.person_id === personId)
  },

  async createVolunteerBlackout(data) {
    const blackout: VolunteerBlackout = { ...stamp(data), id: id() }
    store.volunteerBlackouts.push(blackout)
    return blackout
  },

  async deleteVolunteerBlackout(blackoutId) {
    store.volunteerBlackouts = store.volunteerBlackouts.filter(
      b => !(b.id === blackoutId && cid(b) === getChurchId())
    )
  },

  // ── Groups ───────────────────────────────────────────────────────────────────
  async getGroups(includeHidden = false) {
    return inChurch(store.groups).filter(g => g.is_active && (includeHidden || g.is_visible))
  },

  async getGroup(groupId) {
    return inChurch(store.groups).find(g => g.id === groupId) ?? null
  },

  async createGroup(data) {
    const group: Group = { ...stamp(data), id: id() }
    store.groups.push(group)
    return group
  },

  async updateGroup(groupId, data) {
    const idx = store.groups.findIndex(g => g.id === groupId && cid(g) === getChurchId())
    if (idx === -1) throw new Error(`Group ${groupId} not found`)
    store.groups[idx] = { ...store.groups[idx], ...data }
    return store.groups[idx]
  },

  async getGroupMembers(groupId) {
    return inChurch(store.groupMembers).filter(m => m.group_id === groupId)
  },

  async getPersonGroups(personId) {
    const memberRecords = inChurch(store.groupMembers).filter(
      m => m.person_id === personId && m.status === 'active'
    )
    return memberRecords
      .map(m => inChurch(store.groups).find(g => g.id === m.group_id))
      .filter((g): g is Group => g !== undefined)
  },

  async addGroupMember(data) {
    const member: GroupMember = { ...stamp(data), id: id() }
    store.groupMembers.push(member)
    return member
  },

  async updateGroupMember(memberId, data) {
    const idx = store.groupMembers.findIndex(m => m.id === memberId && cid(m) === getChurchId())
    if (idx === -1) throw new Error(`GroupMember ${memberId} not found`)
    store.groupMembers[idx] = { ...store.groupMembers[idx], ...data }
    return store.groupMembers[idx]
  },

  async removeGroupMember(groupId, personId) {
    store.groupMembers = store.groupMembers.filter(
      m => !(m.group_id === groupId && m.person_id === personId && cid(m) === getChurchId())
    )
  },

  // ── Group Meetings & Attendance ───────────────────────────────────────────
  async getGroupMeetings(groupId) {
    return inChurch(store.groupMeetings)
      .filter(m => m.group_id === groupId)
      .sort((a, b) => b.date.localeCompare(a.date))
  },

  async getGroupMeeting(meetingId) {
    return inChurch(store.groupMeetings).find(m => m.id === meetingId) ?? null
  },

  async createGroupMeeting(data) {
    const meeting: GroupMeeting = { ...stamp(data), id: id(), created_at: now() }
    store.groupMeetings.push(meeting)
    return meeting
  },

  async updateGroupMeeting(meetingId, data) {
    const idx = store.groupMeetings.findIndex(m => m.id === meetingId && cid(m) === getChurchId())
    if (idx === -1) throw new Error(`GroupMeeting ${meetingId} not found`)
    store.groupMeetings[idx] = { ...store.groupMeetings[idx], ...data }
    return store.groupMeetings[idx]
  },

  async deleteGroupMeeting(meetingId) {
    store.groupMeetings = store.groupMeetings.filter(
      m => !(m.id === meetingId && cid(m) === getChurchId())
    )
    store.groupAttendances = store.groupAttendances.filter(
      a => !(a.meeting_id === meetingId && cid(a) === getChurchId())
    )
  },

  async getGroupAttendance(meetingId) {
    return inChurch(store.groupAttendances).filter(a => a.meeting_id === meetingId)
  },

  async upsertGroupAttendance(data) {
    const existing = inChurch(store.groupAttendances).find(
      a => a.meeting_id === data.meeting_id && a.person_id === data.person_id
    )
    if (existing) {
      const idx = store.groupAttendances.findIndex(a => a.id === existing.id)
      store.groupAttendances[idx] = { ...store.groupAttendances[idx], status: data.status as GroupAttendanceStatus }
      return store.groupAttendances[idx]
    }
    const record: GroupAttendance = { ...stamp(data), id: id() }
    store.groupAttendances.push(record)
    return record
  },

  // ── Events ───────────────────────────────────────────────────────────────────
  async getEvents() {
    return inChurch(store.events).filter(e => e.is_active)
  },

  async getEvent(eventId) {
    return inChurch(store.events).find(e => e.id === eventId) ?? null
  },

  async createEvent(data) {
    const event: Event = { ...stamp(data), id: id() }
    store.events.push(event)
    return event
  },

  async updateEvent(eventId, data) {
    const idx = store.events.findIndex(e => e.id === eventId && cid(e) === getChurchId())
    if (idx === -1) throw new Error(`Event ${eventId} not found`)
    store.events[idx] = { ...store.events[idx], ...data }
    return store.events[idx]
  },

  async getEventRegistrations(eventId) {
    return inChurch(store.eventRegistrations).filter(r => r.event_id === eventId)
  },

  async getPersonEventRegistrations(personId) {
    return inChurch(store.eventRegistrations).filter(r => r.person_id === personId)
  },

  async createEventRegistration(data) {
    const reg: EventRegistration = { ...stamp(data), id: id() }
    store.eventRegistrations.push(reg)
    return reg
  },

  async updateEventRegistration(regId, data) {
    const idx = store.eventRegistrations.findIndex(r => r.id === regId && cid(r) === getChurchId())
    if (idx === -1) throw new Error(`EventRegistration ${regId} not found`)
    store.eventRegistrations[idx] = { ...store.eventRegistrations[idx], ...data }
    return store.eventRegistrations[idx]
  },

  // ── Giving ───────────────────────────────────────────────────────────────────
  async getGivingRecords(personId) {
    const scoped = inChurch(store.givingRecords)
    if (personId) return scoped.filter(r => r.person_id === personId)
    return scoped
  },

  async createGivingRecord(data) {
    const record: GivingRecord = { ...stamp(data), id: id() }
    store.givingRecords.push(record)
    return record
  },

  async updateGivingRecord(recordId, data) {
    const idx = store.givingRecords.findIndex(r => r.id === recordId && cid(r) === getChurchId())
    if (idx === -1) throw new Error(`GivingRecord ${recordId} not found`)
    store.givingRecords[idx] = { ...store.givingRecords[idx], ...data }
    return store.givingRecords[idx]
  },

  async deleteGivingRecord(recordId) {
    store.givingRecords = store.givingRecords.filter(
      r => !(r.id === recordId && cid(r) === getChurchId())
    )
  },

  // ── Visitor Follow-Up ────────────────────────────────────────────────────────
  async getVisitorFollowups(personId) {
    const scoped = inChurch(store.visitorFollowup)
    if (personId) return scoped.filter(f => f.person_id === personId)
    return scoped
  },

  async createVisitorFollowup(data) {
    const followup: VisitorFollowup = { ...stamp(data), id: id() }
    store.visitorFollowup.push(followup)
    return followup
  },

  async updateVisitorFollowup(followupId, data) {
    const idx = store.visitorFollowup.findIndex(f => f.id === followupId && cid(f) === getChurchId())
    if (idx === -1) throw new Error(`VisitorFollowup ${followupId} not found`)
    store.visitorFollowup[idx] = { ...store.visitorFollowup[idx], ...data }
    return store.visitorFollowup[idx]
  },

  async getFollowupTemplates() {
    return inChurch(store.followupTemplates).filter(t => t.is_active)
  },

  // ── Attendance ───────────────────────────────────────────────────────────────
  async getAttendanceLogs(personId) {
    const scoped = inChurch(store.attendanceLogs)
    if (personId) return scoped.filter(l => l.person_id === personId)
    return scoped
  },

  async createAttendanceLog(data) {
    const log: AttendanceLog = { ...stamp(data), id: id() }
    store.attendanceLogs.push(log)
    return log
  },

  // ── App Config (singleton per church) ────────────────────────────────────────
  async getAppConfig() {
    const churchId = getChurchId()
    // localStorage wins over in-memory seed data — this lets the display tab
    // pick up changes made in the admin tab after a reloadConfig() call.
    const persisted = readPersistedAppConfig(churchId)
    if (persisted) return persisted
    return store.appConfigs.find(c => c.church_id === churchId)
      ?? { ...DEFAULT_APP_CONFIG, church_id: churchId }
  },

  async updateAppConfig(data) {
    const churchId = getChurchId()
    const idx = store.appConfigs.findIndex(c => c.church_id === churchId)
    const current = store.appConfigs[idx] ?? { ...DEFAULT_APP_CONFIG, church_id: churchId }
    const updated: AppConfig = { ...current, ...data, church_id: churchId, updated_at: now() }
    if (idx === -1) store.appConfigs.push(updated)
    else store.appConfigs[idx] = updated
    writePersistedAppConfig(updated)
    return updated
  },

  // ── Communications Log ─────────────────────────────────────────────────────
  async getCommunicationsLog(filter) {
    let entries = inChurch(store.communicationsLog)
    if (filter?.channel) entries = entries.filter(e => e.channel === filter.channel)
    if (filter?.since) entries = entries.filter(e => e.sent_at >= filter.since!)
    return entries.sort((a, b) => b.sent_at.localeCompare(a.sent_at))
  },

  async createCommunicationsLogEntry(data) {
    const entry: CommunicationsLogEntry = { ...stamp(data), id: id(), sent_at: now() }
    store.communicationsLog.push(entry)
    return entry
  },

  // ── Aggregate Attendance Entries ───────────────────────────────────────────
  async getAttendanceEntries(serviceTimeId) {
    const entries = inChurch(store.attendanceEntries)
    if (serviceTimeId) return entries.filter(e => e.service_time_id === serviceTimeId)
    return entries.sort((a, b) => b.date.localeCompare(a.date))
  },

  async createAttendanceEntry(data) {
    const entry: AttendanceEntry = { ...stamp(data), id: id(), created_at: now() }
    store.attendanceEntries.push(entry)
    return entry
  },

  async updateAttendanceEntry(entryId, data) {
    const idx = store.attendanceEntries.findIndex(e => e.id === entryId && cid(e) === getChurchId())
    if (idx === -1) throw new Error(`AttendanceEntry ${entryId} not found`)
    store.attendanceEntries[idx] = { ...store.attendanceEntries[idx], ...data }
    return store.attendanceEntries[idx]
  },

  // ── Pickup Attempts ────────────────────────────────────────────────────────
  async getPickupAttempts(checkinId) {
    const attempts = inChurch(store.pickupAttempts)
    if (checkinId) return attempts.filter(a => a.checkin_id === checkinId)
    return attempts
  },

  async createPickupAttempt(data) {
    const attempt: PickupAttempt = { ...stamp(data), id: id(), timestamp: now() }
    store.pickupAttempts.push(attempt)
    return attempt
  },

  // ── Songs ──────────────────────────────────────────────────────────────────
  async getSongs() {
    mergeIntoStore(store.songs, readLs<Song>(SONGS_LS_KEY))
    return inChurch(store.songs).filter(s => s.is_active)
  },

  async getSong(songId) {
    mergeIntoStore(store.songs, readLs<Song>(SONGS_LS_KEY))
    return inChurch(store.songs).find(s => s.id === songId) ?? null
  },

  async createSong(data) {
    mergeIntoStore(store.songs, readLs<Song>(SONGS_LS_KEY))
    const song: Song = { ...stamp(data), id: id(), created_at: now(), updated_at: now() }
    store.songs.push(song)
    writeLs(SONGS_LS_KEY, store.songs)
    return song
  },

  async updateSong(songId, data) {
    mergeIntoStore(store.songs, readLs<Song>(SONGS_LS_KEY))
    const idx = store.songs.findIndex(s => s.id === songId && cid(s) === getChurchId())
    if (idx === -1) throw new Error(`Song ${songId} not found`)
    store.songs[idx] = { ...store.songs[idx], ...data, updated_at: now() }
    writeLs(SONGS_LS_KEY, store.songs)
    return store.songs[idx]
  },

  async deleteSong(songId) {
    mergeIntoStore(store.songs, readLs<Song>(SONGS_LS_KEY))
    const idx = store.songs.findIndex(s => s.id === songId && cid(s) === getChurchId())
    if (idx !== -1) store.songs[idx] = { ...store.songs[idx], is_active: false, updated_at: now() }
    writeLs(SONGS_LS_KEY, store.songs)
  },

  // ── Service Plans ──────────────────────────────────────────────────────────
  async getServicePlans() {
    mergeIntoStore(store.servicePlans, readLs<ServicePlan>(PLANS_LS_KEY))
    return inChurch(store.servicePlans).sort((a, b) => b.service_date.localeCompare(a.service_date))
  },

  async getServicePlan(planId) {
    mergeIntoStore(store.servicePlans, readLs<ServicePlan>(PLANS_LS_KEY))
    return inChurch(store.servicePlans).find(p => p.id === planId) ?? null
  },

  async createServicePlan(data) {
    const plan: ServicePlan = { ...stamp(data), id: id(), created_at: now(), updated_at: now() }
    store.servicePlans.push(plan)
    writeLs(PLANS_LS_KEY, store.servicePlans)
    return plan
  },

  async updateServicePlan(planId, data) {
    mergeIntoStore(store.servicePlans, readLs<ServicePlan>(PLANS_LS_KEY))
    const idx = store.servicePlans.findIndex(p => p.id === planId && cid(p) === getChurchId())
    if (idx === -1) throw new Error(`ServicePlan ${planId} not found`)
    store.servicePlans[idx] = { ...store.servicePlans[idx], ...data, updated_at: now() }
    writeLs(PLANS_LS_KEY, store.servicePlans)
    return store.servicePlans[idx]
  },

  async deleteServicePlan(planId) {
    store.servicePlans = store.servicePlans.filter(
      p => !(p.id === planId && cid(p) === getChurchId())
    )
    writeLs(PLANS_LS_KEY, store.servicePlans)
    store.servicePlanItems = store.servicePlanItems.filter(i => i.plan_id !== planId)
    writeLs(ITEMS_LS_KEY, store.servicePlanItems)
    store.serviceAssignments = store.serviceAssignments.filter(a => a.plan_id !== planId)
    writeLs(ASSIGNS_LS_KEY, store.serviceAssignments)
  },

  // ── Service Plan Items ─────────────────────────────────────────────────────
  async getServicePlanItems(planId) {
    mergeIntoStore(store.servicePlanItems, readLs<ServicePlanItem>(ITEMS_LS_KEY))
    return inChurch(store.servicePlanItems)
      .filter(i => i.plan_id === planId)
      .sort((a, b) => a.position - b.position)
  },

  async createServicePlanItem(data) {
    const item: ServicePlanItem = { ...stamp(data), id: id() }
    store.servicePlanItems.push(item)
    writeLs(ITEMS_LS_KEY, store.servicePlanItems)
    return item
  },

  async updateServicePlanItem(itemId, data) {
    const idx = store.servicePlanItems.findIndex(i => i.id === itemId && cid(i) === getChurchId())
    if (idx === -1) throw new Error(`ServicePlanItem ${itemId} not found`)
    store.servicePlanItems[idx] = { ...store.servicePlanItems[idx], ...data }
    writeLs(ITEMS_LS_KEY, store.servicePlanItems)
    return store.servicePlanItems[idx]
  },

  async deleteServicePlanItem(itemId) {
    store.servicePlanItems = store.servicePlanItems.filter(
      i => !(i.id === itemId && cid(i) === getChurchId())
    )
    writeLs(ITEMS_LS_KEY, store.servicePlanItems)
  },

  async reorderServicePlanItems(planId, orderedIds) {
    orderedIds.forEach((itemId, position) => {
      const idx = store.servicePlanItems.findIndex(i => i.id === itemId && i.plan_id === planId)
      if (idx !== -1) store.servicePlanItems[idx] = { ...store.servicePlanItems[idx], position }
    })
    writeLs(ITEMS_LS_KEY, store.servicePlanItems)
  },

  // ── Service Assignments ────────────────────────────────────────────────────
  async getServiceAssignments(planId) {
    mergeIntoStore(store.serviceAssignments, readLs<ServiceAssignment>(ASSIGNS_LS_KEY))
    return inChurch(store.serviceAssignments).filter(a => a.plan_id === planId)
  },

  async createServiceAssignment(data) {
    const assignment: ServiceAssignment = { ...stamp(data), id: id() }
    store.serviceAssignments.push(assignment)
    writeLs(ASSIGNS_LS_KEY, store.serviceAssignments)
    return assignment
  },

  async deleteServiceAssignment(assignmentId) {
    store.serviceAssignments = store.serviceAssignments.filter(
      a => !(a.id === assignmentId && cid(a) === getChurchId())
    )
    writeLs(ASSIGNS_LS_KEY, store.serviceAssignments)
  },

  // ── Pickup Queue (lobby display) ───────────────────────────────────────────
  async getPickupQueue(sessionId) {
    const entries = inChurch(store.pickupQueue).filter(e => !e.is_cleared)
    const filtered = sessionId ? entries.filter(e => e.session_id === sessionId) : entries
    return filtered.sort((a, b) => a.requested_at.localeCompare(b.requested_at))
  },

  async createPickupQueueEntry(data) {
    const entry: PickupQueueEntry = { ...stamp(data), id: id(), is_cleared: false }
    store.pickupQueue.push(entry)
    return entry
  },

  async clearPickupQueueEntry(entryId) {
    const idx = store.pickupQueue.findIndex(e => e.id === entryId && cid(e) === getChurchId())
    if (idx === -1) throw new Error(`PickupQueueEntry ${entryId} not found`)
    store.pickupQueue[idx] = { ...store.pickupQueue[idx], is_cleared: true, cleared_at: now() }
    return store.pickupQueue[idx]
  },

  // ── Music Stand Sessions ────────────────────────────────────────────────────
  async getMusicStandSessions(planId) {
    return inChurch(store.musicStandSessions).filter(s => s.plan_id === planId)
  },

  async getMusicStandSession(sessionId) {
    return inChurch(store.musicStandSessions).find(s => s.id === sessionId) ?? null
  },

  async createMusicStandSession(data) {
    const session: MusicStandSession = {
      ...stamp(data),
      id: id(),
      created_at: now(),
    }
    store.musicStandSessions.push(session)
    return session
  },

  async updateMusicStandSession(sessionId, data) {
    const idx = store.musicStandSessions.findIndex(s => s.id === sessionId && cid(s) === getChurchId())
    if (idx === -1) throw new Error(`MusicStandSession ${sessionId} not found`)
    store.musicStandSessions[idx] = { ...store.musicStandSessions[idx], ...data }
    return store.musicStandSessions[idx]
  },

  // ── Music Stand Annotations ─────────────────────────────────────────────────
  async getAnnotations(filter) {
    let results = inChurch(store.musicStandAnnotations).filter(a => a.user_id === filter.user_id)
    if (filter.song_id) results = results.filter(a => a.song_id === filter.song_id)
    if (filter.pdf_url) results = results.filter(a => a.pdf_url === filter.pdf_url)
    return results
  },

  async createAnnotation(data) {
    const annotation: MusicStandAnnotation = {
      ...stamp(data),
      id: id(),
      created_at: now(),
      updated_at: now(),
    }
    store.musicStandAnnotations.push(annotation)
    return annotation
  },

  async updateAnnotation(annotationId, data) {
    const idx = store.musicStandAnnotations.findIndex(a => a.id === annotationId && cid(a) === getChurchId())
    if (idx === -1) throw new Error(`MusicStandAnnotation ${annotationId} not found`)
    store.musicStandAnnotations[idx] = { ...store.musicStandAnnotations[idx], ...data, updated_at: now() }
    return store.musicStandAnnotations[idx]
  },

  async deleteAnnotation(annotationId) {
    store.musicStandAnnotations = store.musicStandAnnotations.filter(
      a => !(a.id === annotationId && cid(a) === getChurchId())
    )
  },

  // ── User PDF Preferences ────────────────────────────────────────────────────
  async getUserPdfPreferences(userId, pdfUrl) {
    return inChurch(store.userPdfPreferences).find(
      p => p.user_id === userId && p.pdf_url === pdfUrl
    ) ?? null
  },

  async saveUserPdfPreferences(prefs) {
    const existing = inChurch(store.userPdfPreferences).find(
      p => p.user_id === prefs.user_id && p.pdf_url === prefs.pdf_url
    )
    if (existing) {
      const idx = store.userPdfPreferences.findIndex(p => p.id === existing.id)
      store.userPdfPreferences[idx] = { ...existing, ...prefs, updated_at: now() }
      return store.userPdfPreferences[idx]
    }
    const record: UserPdfPreferences = {
      ...stamp(prefs),
      id: id(),
      updated_at: now(),
    }
    store.userPdfPreferences.push(record)
    return record
  },
}
