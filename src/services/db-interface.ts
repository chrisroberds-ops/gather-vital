import type {
  Church,
  AppConfig,
  MonthlyReportHistory,
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
  Event,
  EventRegistration,
  GivingRecord,
  RecurringSubscription,
  RecurringSubscriptionStatus,
  VisitorFollowup,
  FollowupTemplate,
  AttendanceLog,
  GroupMeeting,
  GroupAttendance,
  GroupAttendanceStatus,
} from '@/shared/types'
import type {
  CommunicationsLogEntry,
  EmailTemplate,
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
  ConfirmationToken,
} from '@/shared/types'

// Convenience: strip fields the DB layer owns so callers never pass them.
type CreateInput<T, Extra extends keyof T = never> = Omit<T, 'id' | 'church_id' | Extra>

export interface DatabaseService {
  // ── Churches (global — not church-scoped) ────────────────────────────────────
  // These operate across all tenants and are used by the setup wizard and super-admin.
  getChurches(): Promise<Church[]>
  getChurch(id: string): Promise<Church | null>
  getChurchBySlug(slug: string): Promise<Church | null>
  createChurch(c: Omit<Church, 'id' | 'created_at'>): Promise<Church>
  updateChurch(id: string, c: Partial<Omit<Church, 'id' | 'created_at'>>): Promise<Church>

  // ── People ──────────────────────────────────────────────────────────────────
  getPeople(): Promise<Person[]>
  getPerson(id: string): Promise<Person | null>
  getPersonByPhone(phone: string): Promise<Person | null>
  createPerson(p: CreateInput<Person, 'created_at' | 'updated_at'>): Promise<Person>
  updatePerson(id: string, p: Partial<Omit<Person, 'id' | 'created_at' | 'church_id'>>): Promise<Person>
  deletePerson(id: string): Promise<void>
  searchPeople(query: string): Promise<Person[]>
  /**
   * Returns Person records for all active, non-archived users with tier >= Staff (3).
   * Used by the member-facing Contact Staff section.
   * Never exposes phone numbers — callers must strip them before display.
   */
  getStaffMembers(): Promise<Person[]>

  // ── Households ──────────────────────────────────────────────────────────────
  getHouseholds(): Promise<Household[]>
  getHousehold(id: string): Promise<Household | null>
  createHousehold(h: CreateInput<Household>): Promise<Household>
  updateHousehold(id: string, h: Partial<Omit<Household, 'id' | 'church_id'>>): Promise<Household>
  deleteHousehold(id: string): Promise<void>
  getHouseholdMembers(householdId: string): Promise<HouseholdMember[]>
  getPersonHouseholds(personId: string): Promise<Household[]>
  addHouseholdMember(m: CreateInput<HouseholdMember>): Promise<HouseholdMember>
  updateHouseholdMember(householdId: string, personId: string, data: Partial<Pick<HouseholdMember, 'role' | 'authorized_children' | 'pickup_notes'>>): Promise<HouseholdMember>
  removeHouseholdMember(householdId: string, personId: string): Promise<void>

  // ── Child Pickups ────────────────────────────────────────────────────────────
  getChildPickups(childId: string): Promise<ChildPickup[]>
  getPickupsByHousehold(householdId: string): Promise<ChildPickup[]>
  createChildPickup(p: CreateInput<ChildPickup>): Promise<ChildPickup>
  updateChildPickup(id: string, p: Partial<ChildPickup>): Promise<ChildPickup>
  deleteChildPickup(id: string): Promise<void>

  // ── Checkin Sessions ─────────────────────────────────────────────────────────
  getCheckinSessions(): Promise<CheckinSession[]>
  getCheckinSession(id: string): Promise<CheckinSession | null>
  createCheckinSession(s: CreateInput<CheckinSession>): Promise<CheckinSession>
  updateCheckinSession(id: string, s: Partial<CheckinSession>): Promise<CheckinSession>

  // ── Checkins ─────────────────────────────────────────────────────────────────
  getCheckins(sessionId: string): Promise<Checkin[]>
  createCheckin(c: CreateInput<Checkin>): Promise<Checkin>
  updateCheckin(id: string, c: Partial<Checkin>): Promise<Checkin>

  // ── Checkin Flags ────────────────────────────────────────────────────────────
  getCheckinFlags(): Promise<CheckinFlag[]>
  getCheckinFlagsForPerson(personId: string): Promise<CheckinFlag[]>
  createCheckinFlag(f: CreateInput<CheckinFlag, 'created_at'>): Promise<CheckinFlag>
  updateCheckinFlag(id: string, f: Partial<CheckinFlag>): Promise<CheckinFlag>

  // ── Teams ────────────────────────────────────────────────────────────────────
  getTeams(): Promise<Team[]>
  getTeam(id: string): Promise<Team | null>
  createTeam(t: CreateInput<Team>): Promise<Team>
  updateTeam(id: string, t: Partial<Team>): Promise<Team>
  getTeamMembers(teamId: string): Promise<TeamMember[]>
  addTeamMember(m: CreateInput<TeamMember>): Promise<TeamMember>
  removeTeamMember(teamId: string, personId: string): Promise<void>
  updateTeamMember(id: string, m: Partial<TeamMember>): Promise<TeamMember>

  // ── Volunteer Schedule ───────────────────────────────────────────────────────
  getVolunteerSchedule(teamId?: string, personId?: string): Promise<VolunteerSchedule[]>
  createVolunteerSchedule(s: CreateInput<VolunteerSchedule>): Promise<VolunteerSchedule>
  updateVolunteerSchedule(id: string, s: Partial<VolunteerSchedule>): Promise<VolunteerSchedule>
  deleteVolunteerSchedule(id: string): Promise<void>
  getVolunteerBlackouts(personId: string): Promise<VolunteerBlackout[]>
  createVolunteerBlackout(b: CreateInput<VolunteerBlackout>): Promise<VolunteerBlackout>
  deleteVolunteerBlackout(id: string): Promise<void>

  // ── Groups ───────────────────────────────────────────────────────────────────
  getGroups(includeHidden?: boolean): Promise<Group[]>
  getGroup(id: string): Promise<Group | null>
  createGroup(g: CreateInput<Group>): Promise<Group>
  updateGroup(id: string, g: Partial<Group>): Promise<Group>
  getGroupMembers(groupId: string): Promise<GroupMember[]>
  getPersonGroups(personId: string): Promise<Group[]>
  addGroupMember(m: CreateInput<GroupMember>): Promise<GroupMember>
  updateGroupMember(id: string, m: Partial<GroupMember>): Promise<GroupMember>
  removeGroupMember(groupId: string, personId: string): Promise<void>

  // ── Group Meetings & Attendance ───────────────────────────────────────────
  getGroupMeetings(groupId: string): Promise<GroupMeeting[]>
  getGroupMeeting(id: string): Promise<GroupMeeting | null>
  createGroupMeeting(m: CreateInput<GroupMeeting, 'created_at'>): Promise<GroupMeeting>
  updateGroupMeeting(id: string, m: Partial<Omit<GroupMeeting, 'id' | 'church_id' | 'group_id' | 'created_at'>>): Promise<GroupMeeting>
  deleteGroupMeeting(id: string): Promise<void>
  getGroupAttendance(meetingId: string): Promise<GroupAttendance[]>
  upsertGroupAttendance(data: { meeting_id: string; person_id: string; status: GroupAttendanceStatus }): Promise<GroupAttendance>

  // ── Events ───────────────────────────────────────────────────────────────────
  getEvents(): Promise<Event[]>
  getEvent(id: string): Promise<Event | null>
  createEvent(e: CreateInput<Event>): Promise<Event>
  updateEvent(id: string, e: Partial<Event>): Promise<Event>
  getEventRegistrations(eventId: string): Promise<EventRegistration[]>
  getPersonEventRegistrations(personId: string): Promise<EventRegistration[]>
  createEventRegistration(r: CreateInput<EventRegistration>): Promise<EventRegistration>
  updateEventRegistration(id: string, r: Partial<EventRegistration>): Promise<EventRegistration>

  // ── Giving ───────────────────────────────────────────────────────────────────
  getGivingRecords(personId?: string): Promise<GivingRecord[]>
  createGivingRecord(r: CreateInput<GivingRecord>): Promise<GivingRecord>
  updateGivingRecord(id: string, r: Partial<GivingRecord>): Promise<GivingRecord>
  deleteGivingRecord(id: string): Promise<void>

  // ── Recurring Subscriptions ───────────────────────────────────────────────────
  getRecurringSubscriptions(filter?: { status?: RecurringSubscriptionStatus }): Promise<RecurringSubscription[]>
  createRecurringSubscription(r: CreateInput<RecurringSubscription, 'created_at'>): Promise<RecurringSubscription>
  updateRecurringSubscription(id: string, r: Partial<RecurringSubscription>): Promise<RecurringSubscription>
  cancelRecurringSubscription(id: string): Promise<RecurringSubscription>

  // ── Visitor Follow-Up ────────────────────────────────────────────────────────
  getVisitorFollowups(personId?: string): Promise<VisitorFollowup[]>
  createVisitorFollowup(f: CreateInput<VisitorFollowup>): Promise<VisitorFollowup>
  updateVisitorFollowup(id: string, f: Partial<VisitorFollowup>): Promise<VisitorFollowup>
  getFollowupTemplates(): Promise<FollowupTemplate[]>

  // ── Attendance ───────────────────────────────────────────────────────────────
  getAttendanceLogs(personId?: string): Promise<AttendanceLog[]>
  createAttendanceLog(l: CreateInput<AttendanceLog>): Promise<AttendanceLog>

  // ── App Config (singleton per church) ────────────────────────────────────────
  // getAppConfig never throws — returns DEFAULT_APP_CONFIG if none has been saved yet.
  getAppConfig(): Promise<AppConfig>
  updateAppConfig(data: Partial<Omit<AppConfig, 'church_id'>>): Promise<AppConfig>

  // ── Communications Log ────────────────────────────────────────────────────────
  getCommunicationsLog(filter?: { channel?: 'email' | 'sms'; since?: string }): Promise<CommunicationsLogEntry[]>
  createCommunicationsLogEntry(e: CreateInput<CommunicationsLogEntry, 'sent_at'>): Promise<CommunicationsLogEntry>

  // ── Email Templates ───────────────────────────────────────────────────────────
  getEmailTemplates(): Promise<EmailTemplate[]>
  saveEmailTemplate(t: Omit<EmailTemplate, 'id' | 'church_id' | 'created_at' | 'updated_at'>): Promise<EmailTemplate>
  deleteEmailTemplate(id: string): Promise<void>

  // ── Aggregate Attendance Entries ──────────────────────────────────────────────
  getAttendanceEntries(serviceTimeId?: string): Promise<AttendanceEntry[]>
  createAttendanceEntry(e: CreateInput<AttendanceEntry, 'created_at'>): Promise<AttendanceEntry>
  updateAttendanceEntry(id: string, e: Partial<AttendanceEntry>): Promise<AttendanceEntry>

  // ── Pickup Attempts ────────────────────────────────────────────────────────────
  getPickupAttempts(checkinId?: string): Promise<PickupAttempt[]>
  createPickupAttempt(a: CreateInput<PickupAttempt, 'timestamp'>): Promise<PickupAttempt>

  // ── Songs ─────────────────────────────────────────────────────────────────────
  getSongs(): Promise<Song[]>
  getSong(id: string): Promise<Song | null>
  createSong(s: CreateInput<Song, 'created_at' | 'updated_at'>): Promise<Song>
  updateSong(id: string, s: Partial<Song>): Promise<Song>
  deleteSong(id: string): Promise<void>

  // ── Service Plans ─────────────────────────────────────────────────────────────
  getServicePlans(): Promise<ServicePlan[]>
  getServicePlan(id: string): Promise<ServicePlan | null>
  createServicePlan(p: CreateInput<ServicePlan, 'created_at' | 'updated_at'>): Promise<ServicePlan>
  updateServicePlan(id: string, p: Partial<ServicePlan>): Promise<ServicePlan>
  deleteServicePlan(id: string): Promise<void>

  // ── Service Plan Items ────────────────────────────────────────────────────────
  getServicePlanItems(planId: string): Promise<ServicePlanItem[]>
  createServicePlanItem(i: CreateInput<ServicePlanItem>): Promise<ServicePlanItem>
  updateServicePlanItem(id: string, i: Partial<ServicePlanItem>): Promise<ServicePlanItem>
  deleteServicePlanItem(id: string): Promise<void>
  reorderServicePlanItems(planId: string, orderedIds: string[]): Promise<void>

  // ── Service Assignments ───────────────────────────────────────────────────────
  getServiceAssignments(planId: string): Promise<ServiceAssignment[]>
  createServiceAssignment(a: CreateInput<ServiceAssignment>): Promise<ServiceAssignment>
  deleteServiceAssignment(id: string): Promise<void>

  // ── Pickup Queue (lobby display) ──────────────────────────────────────────────
  // Returns only non-cleared entries, sorted oldest first.
  getPickupQueue(sessionId?: string): Promise<PickupQueueEntry[]>
  createPickupQueueEntry(e: CreateInput<PickupQueueEntry, 'cleared_at'>): Promise<PickupQueueEntry>
  clearPickupQueueEntry(id: string): Promise<PickupQueueEntry>

  // ── Music Stand Sessions ──────────────────────────────────────────────────────
  getMusicStandSessions(planId: string): Promise<MusicStandSession[]>
  getMusicStandSession(id: string): Promise<MusicStandSession | null>
  createMusicStandSession(s: CreateInput<MusicStandSession, 'created_at'>): Promise<MusicStandSession>
  updateMusicStandSession(id: string, s: Partial<MusicStandSession>): Promise<MusicStandSession>

  // ── Music Stand Annotations ───────────────────────────────────────────────────
  getAnnotations(filter: { user_id: string; song_id?: string; pdf_url?: string }): Promise<MusicStandAnnotation[]>
  createAnnotation(a: CreateInput<MusicStandAnnotation, 'created_at' | 'updated_at'>): Promise<MusicStandAnnotation>
  updateAnnotation(id: string, a: Partial<MusicStandAnnotation>): Promise<MusicStandAnnotation>
  deleteAnnotation(id: string): Promise<void>

  // ── User PDF Preferences ──────────────────────────────────────────────────────
  getUserPdfPreferences(userId: string, pdfUrl: string): Promise<UserPdfPreferences | null>
  saveUserPdfPreferences(prefs: Omit<UserPdfPreferences, 'id' | 'church_id' | 'updated_at'>): Promise<UserPdfPreferences>

  // ── Confirmation Tokens ───────────────────────────────────────────────────────
  /** Look up a token by its opaque token string (used from the /confirm URL). */
  getConfirmationToken(token: string): Promise<ConfirmationToken | null>
  /** Create a new confirmation token record. */
  createConfirmationToken(t: Omit<ConfirmationToken, 'id' | 'church_id'>): Promise<ConfirmationToken>
  /**
   * Mark the token as used and record the action taken.
   * Returns the updated token, or throws if already used or not found.
   */
  useConfirmationToken(token: string, action: 'confirm' | 'decline'): Promise<ConfirmationToken>

  // ── Monthly Report History ────────────────────────────────────────────────────
  /** Return stored monthly report rows, optionally filtered to a specific year and/or month. */
  getMonthlyReportHistory(year?: number, month?: number): Promise<MonthlyReportHistory[]>
  /** Insert or update the stored report row for the given year + month. */
  upsertMonthlyReportHistory(data: Omit<MonthlyReportHistory, 'id' | 'church_id' | 'created_at'>): Promise<MonthlyReportHistory>
}
