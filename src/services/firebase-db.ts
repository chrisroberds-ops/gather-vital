// firebase-db.ts — Production Firestore implementation (multi-tenant, church-scoped)
//
// Schema: every collection lives under churches/{church_id}/{collection}.
// Churches themselves are top-level (global, unscoped).
// AppConfig is a singleton doc at churches/{church_id}/settings/app_config.
// User roles/church membership are stored at users/{uid} (global, unscoped).
//
// Do not import this file in TEST_MODE — src/services/index.ts handles the switch.

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { app } from '@/config/firebase'
import { getChurchId } from './church-context'
import { DEFAULT_APP_CONFIG } from '@/shared/types'
import type { DatabaseService } from './db-interface'
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

// ── Firestore instance (lazy, prod-only) ──────────────────────────────────────
let _fs: ReturnType<typeof getFirestore> | null = null
function fs() {
  if (!_fs) {
    if (!app) throw new Error('Firebase app not initialised — set VITE_FIREBASE_* env vars.')
    _fs = getFirestore(app)
  }
  return _fs
}

// ── Low-level helpers ─────────────────────────────────────────────────────────
const cid = () => getChurchId()
const newId = () => crypto.randomUUID()
const now = () => new Date().toISOString()

/** Church-scoped subcollection reference */
function cc(sub: string) {
  return collection(fs(), `churches/${cid()}/${sub}`)
}
/** Church-scoped document reference */
function cd(sub: string, id: string) {
  return doc(fs(), `churches/${cid()}/${sub}/${id}`)
}
/** Singleton AppConfig document */
const cfgDoc = () => doc(fs(), `churches/${cid()}/settings/app_config`)

function fromSnap<T>(snap: DocumentSnapshot): T | null {
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as T
}
function fromSnaps<T>(snaps: { docs: QueryDocumentSnapshot[] }): T[] {
  return snaps.docs.map(d => ({ id: d.id, ...d.data() }) as T)
}

async function getById<T>(sub: string, id: string): Promise<T | null> {
  return fromSnap<T>(await getDoc(cd(sub, id)))
}
async function getAll<T>(sub: string): Promise<T[]> {
  return fromSnaps<T>(await getDocs(cc(sub)))
}
async function createDoc<T>(sub: string, payload: Record<string, unknown>): Promise<T> {
  const id = newId()
  const ref = cd(sub, id)
  await setDoc(ref, { ...payload, id, church_id: cid() })
  return fromSnap<T>(await getDoc(ref)) as T
}
async function patchAndReturn<T>(sub: string, id: string, patch: Record<string, unknown>): Promise<T> {
  await updateDoc(cd(sub, id), patch)
  return fromSnap<T>(await getDoc(cd(sub, id))) as T
}

// ── DatabaseService implementation ────────────────────────────────────────────
export const firebaseDb: DatabaseService = {

  // ── Churches (global — not scoped) ────────────────────────────────────────
  async getChurches() {
    return fromSnaps<Church>(await getDocs(collection(fs(), 'churches')))
  },

  async getChurch(id) {
    return fromSnap<Church>(await getDoc(doc(fs(), 'churches', id)))
  },

  async getChurchBySlug(slug) {
    const q = query(collection(fs(), 'churches'), where('slug', '==', slug))
    const snaps = await getDocs(q)
    return snaps.empty ? null : fromSnap<Church>(snaps.docs[0])
  },

  async createChurch(c) {
    const id = newId()
    const church: Church = { ...c, id, created_at: now() }
    await setDoc(doc(fs(), 'churches', id), church)
    return church
  },

  async updateChurch(id, c) {
    await updateDoc(doc(fs(), 'churches', id), c as Record<string, unknown>)
    return fromSnap<Church>(await getDoc(doc(fs(), 'churches', id))) as Church
  },

  // ── People ────────────────────────────────────────────────────────────────
  async getPeople() { return getAll<Person>('people') },

  async getPerson(id) { return getById<Person>('people', id) },

  async getPersonByPhone(phone) {
    const q = query(cc('people'), where('phone', '==', phone))
    const snaps = await getDocs(q)
    return snaps.empty ? null : fromSnap<Person>(snaps.docs[0])
  },

  async createPerson(p) {
    return createDoc<Person>('people', { ...p as Record<string, unknown>, created_at: now(), updated_at: now() })
  },

  async updatePerson(id, p) {
    return patchAndReturn<Person>('people', id, { ...p as Record<string, unknown>, updated_at: now() })
  },

  // Soft-delete: sets is_archived = true, never hard-deletes
  async deletePerson(id) {
    await updateDoc(cd('people', id), { is_archived: true, updated_at: now() })
  },

  async searchPeople(queryStr) {
    const all = await getAll<Person>('people')
    const q = queryStr.toLowerCase()
    return all.filter(p =>
      p.first_name.toLowerCase().includes(q) ||
      p.last_name.toLowerCase().includes(q) ||
      (p.email ?? '').toLowerCase().includes(q) ||
      p.phone.includes(q)
    )
  },

  async getStaffMembers() {
    // Query global users collection by church_id; filter tier >= 3 client-side
    // (avoids composite Firestore index requirement)
    const usersRef = collection(fs(), 'users')
    const usersSnap = await getDocs(query(usersRef, where('church_id', '==', cid())))
    const staffPersonIds = usersSnap.docs
      .map(d => d.data())
      .filter(u => (u.tier ?? 0) >= 3 && u.personId)
      .map(u => u.personId as string)

    if (staffPersonIds.length === 0) return []

    const personDocs = await Promise.all(staffPersonIds.map(pid => getDoc(cd('people', pid))))
    return personDocs
      .filter(d => d.exists())
      .map(d => ({ ...d.data(), id: d.id } as Person))
      .filter(p => p.is_active && !p.is_archived)
  },

  // ── Households ────────────────────────────────────────────────────────────
  async getHouseholds() { return getAll<Household>('households') },

  async getHousehold(id) { return getById<Household>('households', id) },

  async createHousehold(h) { return createDoc<Household>('households', h as Record<string, unknown>) },

  async updateHousehold(id, h) { return patchAndReturn<Household>('households', id, h as Record<string, unknown>) },

  async deleteHousehold(id) { await deleteDoc(cd('households', id)) },

  async getHouseholdMembers(householdId) {
    const q = query(cc('household_members'), where('household_id', '==', householdId))
    return fromSnaps<HouseholdMember>(await getDocs(q))
  },

  async getPersonHouseholds(personId) {
    const q = query(cc('household_members'), where('person_id', '==', personId))
    const members = fromSnaps<HouseholdMember>(await getDocs(q))
    const households = await Promise.all(members.map(m => this.getHousehold(m.household_id)))
    return households.filter((h): h is Household => h !== null)
  },

  async addHouseholdMember(m) {
    return createDoc<HouseholdMember>('household_members', m as Record<string, unknown>)
  },

  async updateHouseholdMember(householdId, personId, data) {
    const q = query(cc('household_members'),
      where('household_id', '==', householdId),
      where('person_id', '==', personId),
    )
    const snaps = await getDocs(q)
    if (snaps.empty) throw new Error('HouseholdMember not found')
    const ref = snaps.docs[0].ref
    await updateDoc(ref, data as Record<string, unknown>)
    return fromSnap<HouseholdMember>(await getDoc(ref)) as HouseholdMember
  },

  async removeHouseholdMember(householdId, personId) {
    const q = query(cc('household_members'),
      where('household_id', '==', householdId),
      where('person_id', '==', personId),
    )
    const snaps = await getDocs(q)
    await Promise.all(snaps.docs.map(d => deleteDoc(d.ref)))
  },

  // ── Child Pickups ──────────────────────────────────────────────────────────
  async getChildPickups(childId) {
    const q = query(cc('child_pickups'), where('child_id', '==', childId))
    return fromSnaps<ChildPickup>(await getDocs(q))
  },

  async getPickupsByHousehold(householdId) {
    const q = query(cc('child_pickups'), where('household_id', '==', householdId))
    return fromSnaps<ChildPickup>(await getDocs(q))
  },

  async createChildPickup(p) { return createDoc<ChildPickup>('child_pickups', p as Record<string, unknown>) },

  async updateChildPickup(id, p) { return patchAndReturn<ChildPickup>('child_pickups', id, p as Record<string, unknown>) },

  async deleteChildPickup(id) { await deleteDoc(cd('child_pickups', id)) },

  // ── Checkin Sessions ───────────────────────────────────────────────────────
  async getCheckinSessions() { return getAll<CheckinSession>('checkin_sessions') },

  async getCheckinSession(id) { return getById<CheckinSession>('checkin_sessions', id) },

  async createCheckinSession(s) { return createDoc<CheckinSession>('checkin_sessions', s as Record<string, unknown>) },

  async updateCheckinSession(id, s) { return patchAndReturn<CheckinSession>('checkin_sessions', id, s as Record<string, unknown>) },

  // ── Checkins ───────────────────────────────────────────────────────────────
  async getCheckins(sessionId) {
    const q = query(cc('checkins'), where('session_id', '==', sessionId))
    return fromSnaps<Checkin>(await getDocs(q))
  },

  async createCheckin(c) { return createDoc<Checkin>('checkins', c as Record<string, unknown>) },

  async updateCheckin(id, c) { return patchAndReturn<Checkin>('checkins', id, c as Record<string, unknown>) },

  // ── Checkin Flags ──────────────────────────────────────────────────────────
  async getCheckinFlags() { return getAll<CheckinFlag>('checkin_flags') },

  async getCheckinFlagsForPerson(personId) {
    const q = query(cc('checkin_flags'), where('person_id', '==', personId))
    return fromSnaps<CheckinFlag>(await getDocs(q))
  },

  async createCheckinFlag(f) {
    return createDoc<CheckinFlag>('checkin_flags', { ...f as Record<string, unknown>, created_at: now() })
  },

  async updateCheckinFlag(id, f) { return patchAndReturn<CheckinFlag>('checkin_flags', id, f as Record<string, unknown>) },

  // ── Teams ──────────────────────────────────────────────────────────────────
  async getTeams() { return getAll<Team>('teams') },

  async getTeam(id) { return getById<Team>('teams', id) },

  async createTeam(t) { return createDoc<Team>('teams', t as Record<string, unknown>) },

  async updateTeam(id, t) { return patchAndReturn<Team>('teams', id, t as Record<string, unknown>) },

  async getTeamMembers(teamId) {
    const q = query(cc('team_members'), where('team_id', '==', teamId))
    return fromSnaps<TeamMember>(await getDocs(q))
  },

  async addTeamMember(m) { return createDoc<TeamMember>('team_members', m as Record<string, unknown>) },

  async removeTeamMember(teamId, personId) {
    const q = query(cc('team_members'),
      where('team_id', '==', teamId),
      where('person_id', '==', personId),
    )
    const snaps = await getDocs(q)
    await Promise.all(snaps.docs.map(d => deleteDoc(d.ref)))
  },

  async updateTeamMember(id, m) { return patchAndReturn<TeamMember>('team_members', id, m as Record<string, unknown>) },

  // ── Volunteer Schedule ─────────────────────────────────────────────────────
  async getVolunteerSchedule(teamId, personId) {
    // Build the most restrictive single-field query, then filter the rest client-side
    // to avoid requiring a composite index for every team+person combination.
    let results: VolunteerSchedule[]
    if (teamId) {
      const q = query(cc('volunteer_schedules'), where('team_id', '==', teamId))
      results = fromSnaps<VolunteerSchedule>(await getDocs(q))
      if (personId) results = results.filter(s => s.person_id === personId)
    } else if (personId) {
      const q = query(cc('volunteer_schedules'), where('person_id', '==', personId))
      results = fromSnaps<VolunteerSchedule>(await getDocs(q))
    } else {
      results = await getAll<VolunteerSchedule>('volunteer_schedules')
    }
    return results
  },

  async createVolunteerSchedule(s) { return createDoc<VolunteerSchedule>('volunteer_schedules', s as Record<string, unknown>) },

  async updateVolunteerSchedule(id, s) { return patchAndReturn<VolunteerSchedule>('volunteer_schedules', id, s as Record<string, unknown>) },

  async deleteVolunteerSchedule(id) { await deleteDoc(cd('volunteer_schedules', id)) },

  async getVolunteerBlackouts(personId) {
    const q = query(cc('volunteer_blackouts'), where('person_id', '==', personId))
    return fromSnaps<VolunteerBlackout>(await getDocs(q))
  },

  async createVolunteerBlackout(b) { return createDoc<VolunteerBlackout>('volunteer_blackouts', b as Record<string, unknown>) },

  async deleteVolunteerBlackout(id) { await deleteDoc(cd('volunteer_blackouts', id)) },

  // ── Groups ─────────────────────────────────────────────────────────────────
  async getGroups(includeHidden = false) {
    const all = await getAll<Group>('groups')
    return includeHidden ? all : all.filter(g => g.is_visible)
  },

  async getGroup(id) { return getById<Group>('groups', id) },

  async createGroup(g) { return createDoc<Group>('groups', g as Record<string, unknown>) },

  async updateGroup(id, g) { return patchAndReturn<Group>('groups', id, g as Record<string, unknown>) },

  async getGroupMembers(groupId) {
    const q = query(cc('group_members'), where('group_id', '==', groupId))
    return fromSnaps<GroupMember>(await getDocs(q))
  },

  async getPersonGroups(personId) {
    const q = query(cc('group_members'), where('person_id', '==', personId))
    const members = fromSnaps<GroupMember>(await getDocs(q))
    const groups = await Promise.all(members.map(m => this.getGroup(m.group_id)))
    return groups.filter((g): g is Group => g !== null)
  },

  async addGroupMember(m) { return createDoc<GroupMember>('group_members', m as Record<string, unknown>) },

  async updateGroupMember(id, m) { return patchAndReturn<GroupMember>('group_members', id, m as Record<string, unknown>) },

  async removeGroupMember(groupId, personId) {
    const q = query(cc('group_members'),
      where('group_id', '==', groupId),
      where('person_id', '==', personId),
    )
    const snaps = await getDocs(q)
    await Promise.all(snaps.docs.map(d => deleteDoc(d.ref)))
  },

  // ── Group Meetings & Attendance ────────────────────────────────────────────
  async getGroupMeetings(groupId) {
    const q = query(cc('group_meetings'), where('group_id', '==', groupId))
    return fromSnaps<GroupMeeting>(await getDocs(q))
  },

  async getGroupMeeting(id) { return getById<GroupMeeting>('group_meetings', id) },

  async createGroupMeeting(m) {
    return createDoc<GroupMeeting>('group_meetings', { ...m as Record<string, unknown>, created_at: now() })
  },

  async updateGroupMeeting(id, m) { return patchAndReturn<GroupMeeting>('group_meetings', id, m as Record<string, unknown>) },

  async deleteGroupMeeting(id) {
    // Cascade-delete all attendance records for this meeting in a single batch
    const q = query(cc('group_attendance'), where('meeting_id', '==', id))
    const snaps = await getDocs(q)
    const batch = writeBatch(fs())
    snaps.docs.forEach(d => batch.delete(d.ref))
    batch.delete(cd('group_meetings', id))
    await batch.commit()
  },

  async getGroupAttendance(meetingId) {
    const q = query(cc('group_attendance'), where('meeting_id', '==', meetingId))
    return fromSnaps<GroupAttendance>(await getDocs(q))
  },

  async upsertGroupAttendance({ meeting_id, person_id, status }) {
    const q = query(cc('group_attendance'),
      where('meeting_id', '==', meeting_id),
      where('person_id', '==', person_id),
    )
    const snaps = await getDocs(q)
    if (!snaps.empty) {
      const ref = snaps.docs[0].ref
      await updateDoc(ref, { status })
      return fromSnap<GroupAttendance>(await getDoc(ref)) as GroupAttendance
    }
    return createDoc<GroupAttendance>('group_attendance', { meeting_id, person_id, status })
  },

  // ── Events ─────────────────────────────────────────────────────────────────
  async getEvents() { return getAll<Event>('events') },

  async getEvent(id) { return getById<Event>('events', id) },

  async createEvent(e) { return createDoc<Event>('events', e as Record<string, unknown>) },

  async updateEvent(id, e) { return patchAndReturn<Event>('events', id, e as Record<string, unknown>) },

  async getEventRegistrations(eventId) {
    const q = query(cc('event_registrations'), where('event_id', '==', eventId))
    return fromSnaps<EventRegistration>(await getDocs(q))
  },

  async getPersonEventRegistrations(personId) {
    const q = query(cc('event_registrations'), where('person_id', '==', personId))
    return fromSnaps<EventRegistration>(await getDocs(q))
  },

  async createEventRegistration(r) { return createDoc<EventRegistration>('event_registrations', r as Record<string, unknown>) },

  async updateEventRegistration(id, r) { return patchAndReturn<EventRegistration>('event_registrations', id, r as Record<string, unknown>) },

  // ── Giving ─────────────────────────────────────────────────────────────────
  async getGivingRecords(personId) {
    if (personId) {
      const q = query(cc('giving_records'), where('person_id', '==', personId))
      return fromSnaps<GivingRecord>(await getDocs(q))
    }
    return getAll<GivingRecord>('giving_records')
  },

  async createGivingRecord(r) {
    return createDoc<GivingRecord>('giving_records', { ...r as Record<string, unknown>, created_at: now(), updated_at: now() })
  },

  async updateGivingRecord(id, r) {
    return patchAndReturn<GivingRecord>('giving_records', id, { ...r as Record<string, unknown>, updated_at: now() })
  },

  async deleteGivingRecord(id) { await deleteDoc(cd('giving_records', id)) },

  // ── Recurring Subscriptions ────────────────────────────────────────────────
  async getRecurringSubscriptions(filter) {
    const all = await getAll<RecurringSubscription>('recurring_subscriptions')
    if (filter?.status) return all.filter(r => r.status === filter.status)
    return all
  },

  async createRecurringSubscription(r) {
    return createDoc<RecurringSubscription>('recurring_subscriptions', { ...r as Record<string, unknown>, created_at: now() })
  },

  async updateRecurringSubscription(id, r) {
    return patchAndReturn<RecurringSubscription>('recurring_subscriptions', id, r as Record<string, unknown>)
  },

  async cancelRecurringSubscription(id) {
    return patchAndReturn<RecurringSubscription>('recurring_subscriptions', id, {
      status: 'cancelled' as RecurringSubscriptionStatus,
      cancelled_at: now(),
    })
  },

  // ── Visitor Follow-Up ──────────────────────────────────────────────────────
  async getVisitorFollowups(personId) {
    if (personId) {
      const q = query(cc('visitor_followups'), where('person_id', '==', personId))
      return fromSnaps<VisitorFollowup>(await getDocs(q))
    }
    return getAll<VisitorFollowup>('visitor_followups')
  },

  async createVisitorFollowup(f) { return createDoc<VisitorFollowup>('visitor_followups', f as Record<string, unknown>) },

  async updateVisitorFollowup(id, f) { return patchAndReturn<VisitorFollowup>('visitor_followups', id, f as Record<string, unknown>) },

  async getFollowupTemplates() { return getAll<FollowupTemplate>('followup_templates') },

  // ── Attendance ─────────────────────────────────────────────────────────────
  async getAttendanceLogs(personId) {
    if (personId) {
      const q = query(cc('attendance_logs'), where('person_id', '==', personId))
      return fromSnaps<AttendanceLog>(await getDocs(q))
    }
    return getAll<AttendanceLog>('attendance_logs')
  },

  async createAttendanceLog(l) { return createDoc<AttendanceLog>('attendance_logs', l as Record<string, unknown>) },

  // ── App Config (singleton per church) ──────────────────────────────────────
  async getAppConfig() {
    const snap = await getDoc(cfgDoc())
    if (!snap.exists()) {
      return { ...DEFAULT_APP_CONFIG, church_id: cid(), updated_at: now() }
    }
    return snap.data() as AppConfig
  },

  async updateAppConfig(data) {
    const current = await this.getAppConfig()
    const updated: AppConfig = { ...current, ...data, church_id: cid(), updated_at: now() }
    await setDoc(cfgDoc(), updated)
    return updated
  },

  // ── Communications Log ─────────────────────────────────────────────────────
  async getCommunicationsLog(filter) {
    let all = await getAll<CommunicationsLogEntry>('communications_log')
    if (filter?.channel) all = all.filter(e => e.channel === filter.channel)
    if (filter?.since) all = all.filter(e => e.sent_at >= filter.since!)
    return all.sort((a, b) => b.sent_at.localeCompare(a.sent_at))
  },

  async createCommunicationsLogEntry(e) {
    return createDoc<CommunicationsLogEntry>('communications_log', { ...e as Record<string, unknown>, sent_at: now() })
  },

  // ── Email Templates ────────────────────────────────────────────────────────
  async getEmailTemplates() { return getAll<EmailTemplate>('email_templates') },

  async saveEmailTemplate(t) {
    const all = await getAll<EmailTemplate>('email_templates')
    const existing = all.find(e => e.name === t.name)
    if (existing) {
      return patchAndReturn<EmailTemplate>('email_templates', existing.id, {
        ...t as Record<string, unknown>,
        updated_at: now(),
      })
    }
    return createDoc<EmailTemplate>('email_templates', { ...t as Record<string, unknown>, created_at: now(), updated_at: now() })
  },

  async deleteEmailTemplate(id) { await deleteDoc(cd('email_templates', id)) },

  // ── Aggregate Attendance Entries ───────────────────────────────────────────
  async getAttendanceEntries(serviceTimeId) {
    if (serviceTimeId) {
      const q = query(cc('attendance_entries'), where('service_time_id', '==', serviceTimeId))
      return fromSnaps<AttendanceEntry>(await getDocs(q))
    }
    return getAll<AttendanceEntry>('attendance_entries')
  },

  async createAttendanceEntry(e) {
    return createDoc<AttendanceEntry>('attendance_entries', { ...e as Record<string, unknown>, created_at: now() })
  },

  async updateAttendanceEntry(id, e) { return patchAndReturn<AttendanceEntry>('attendance_entries', id, e as Record<string, unknown>) },

  // ── Pickup Attempts ────────────────────────────────────────────────────────
  async getPickupAttempts(checkinId) {
    if (checkinId) {
      const q = query(cc('pickup_attempts'), where('checkin_id', '==', checkinId))
      return fromSnaps<PickupAttempt>(await getDocs(q))
    }
    return getAll<PickupAttempt>('pickup_attempts')
  },

  async createPickupAttempt(a) {
    return createDoc<PickupAttempt>('pickup_attempts', { ...a as Record<string, unknown>, timestamp: now() })
  },

  // ── Songs ──────────────────────────────────────────────────────────────────
  async getSongs() { return getAll<Song>('songs') },

  async getSong(id) { return getById<Song>('songs', id) },

  async createSong(s) {
    return createDoc<Song>('songs', { ...s as Record<string, unknown>, created_at: now(), updated_at: now() })
  },

  async updateSong(id, s) {
    return patchAndReturn<Song>('songs', id, { ...s as Record<string, unknown>, updated_at: now() })
  },

  async deleteSong(id) { await deleteDoc(cd('songs', id)) },

  // ── Service Plans ──────────────────────────────────────────────────────────
  async getServicePlans() { return getAll<ServicePlan>('service_plans') },

  async getServicePlan(id) { return getById<ServicePlan>('service_plans', id) },

  async createServicePlan(p) {
    return createDoc<ServicePlan>('service_plans', { ...p as Record<string, unknown>, created_at: now(), updated_at: now() })
  },

  async updateServicePlan(id, p) {
    return patchAndReturn<ServicePlan>('service_plans', id, { ...p as Record<string, unknown>, updated_at: now() })
  },

  async deleteServicePlan(id) { await deleteDoc(cd('service_plans', id)) },

  // ── Service Plan Items ─────────────────────────────────────────────────────
  async getServicePlanItems(planId) {
    const q = query(cc('service_plan_items'), where('plan_id', '==', planId))
    return fromSnaps<ServicePlanItem>(await getDocs(q))
  },

  async createServicePlanItem(i) { return createDoc<ServicePlanItem>('service_plan_items', i as Record<string, unknown>) },

  async updateServicePlanItem(id, i) { return patchAndReturn<ServicePlanItem>('service_plan_items', id, i as Record<string, unknown>) },

  async deleteServicePlanItem(id) { await deleteDoc(cd('service_plan_items', id)) },

  async reorderServicePlanItems(_planId, orderedIds) {
    const batch = writeBatch(fs())
    orderedIds.forEach((id, position) => {
      batch.update(cd('service_plan_items', id), { position })
    })
    await batch.commit()
  },

  // ── Service Assignments ────────────────────────────────────────────────────
  async getServiceAssignments(planId) {
    const q = query(cc('service_assignments'), where('plan_id', '==', planId))
    return fromSnaps<ServiceAssignment>(await getDocs(q))
  },

  async createServiceAssignment(a) { return createDoc<ServiceAssignment>('service_assignments', a as Record<string, unknown>) },

  async deleteServiceAssignment(id) { await deleteDoc(cd('service_assignments', id)) },

  // ── Pickup Queue (lobby display) ───────────────────────────────────────────
  async getPickupQueue(sessionId) {
    const constraints = sessionId
      ? [where('session_id', '==', sessionId), where('is_cleared', '==', false)]
      : [where('is_cleared', '==', false)]
    const q = query(cc('pickup_queue'), ...constraints)
    const results = fromSnaps<PickupQueueEntry>(await getDocs(q))
    return results.sort((a, b) => a.requested_at.localeCompare(b.requested_at))
  },

  async createPickupQueueEntry(e) {
    return createDoc<PickupQueueEntry>('pickup_queue', { ...e as Record<string, unknown>, is_cleared: false })
  },

  async clearPickupQueueEntry(id) {
    return patchAndReturn<PickupQueueEntry>('pickup_queue', id, { is_cleared: true, cleared_at: now() })
  },

  // ── Music Stand Sessions ───────────────────────────────────────────────────
  async getMusicStandSessions(planId) {
    const q = query(cc('music_stand_sessions'), where('plan_id', '==', planId))
    return fromSnaps<MusicStandSession>(await getDocs(q))
  },

  async getMusicStandSession(id) { return getById<MusicStandSession>('music_stand_sessions', id) },

  async createMusicStandSession(s) {
    return createDoc<MusicStandSession>('music_stand_sessions', { ...s as Record<string, unknown>, created_at: now() })
  },

  async updateMusicStandSession(id, s) { return patchAndReturn<MusicStandSession>('music_stand_sessions', id, s as Record<string, unknown>) },

  // ── Music Stand Annotations ────────────────────────────────────────────────
  // Query by user_id only, then filter song/pdf client-side to avoid composite index requirements.
  async getAnnotations(filter) {
    const q = query(cc('annotations'), where('user_id', '==', filter.user_id))
    let results = fromSnaps<MusicStandAnnotation>(await getDocs(q))
    if (filter.song_id) results = results.filter(a => a.song_id === filter.song_id)
    if (filter.pdf_url) results = results.filter(a => a.pdf_url === filter.pdf_url)
    return results
  },

  async createAnnotation(a) {
    return createDoc<MusicStandAnnotation>('annotations', { ...a as Record<string, unknown>, created_at: now(), updated_at: now() })
  },

  async updateAnnotation(id, a) {
    return patchAndReturn<MusicStandAnnotation>('annotations', id, { ...a as Record<string, unknown>, updated_at: now() })
  },

  async deleteAnnotation(id) { await deleteDoc(cd('annotations', id)) },

  // ── User PDF Preferences ───────────────────────────────────────────────────
  // Query by user_id + pdf_url; filtered client-side to avoid composite index.
  async getUserPdfPreferences(userId, pdfUrl) {
    const q = query(cc('user_pdf_prefs'), where('user_id', '==', userId))
    const results = fromSnaps<UserPdfPreferences>(await getDocs(q))
    return results.find(p => p.pdf_url === pdfUrl) ?? null
  },

  async saveUserPdfPreferences(prefs) {
    const existing = await this.getUserPdfPreferences(prefs.user_id, prefs.pdf_url)
    const updated_at = now()
    if (existing) {
      return patchAndReturn<UserPdfPreferences>('user_pdf_prefs', existing.id, {
        ...prefs as Record<string, unknown>,
        updated_at,
      })
    }
    return createDoc<UserPdfPreferences>('user_pdf_prefs', { ...prefs as Record<string, unknown>, updated_at })
  },

  // ── Confirmation Tokens ────────────────────────────────────────────────────
  async getConfirmationToken(token) {
    const q = query(cc('confirmation_tokens'), where('token', '==', token))
    const snaps = await getDocs(q)
    return snaps.empty ? null : fromSnap<ConfirmationToken>(snaps.docs[0])
  },

  async createConfirmationToken(t) {
    return createDoc<ConfirmationToken>('confirmation_tokens', t as Record<string, unknown>)
  },

  async useConfirmationToken(token, action) {
    const ct = await this.getConfirmationToken(token)
    if (!ct) throw new Error('Token not found')
    if (ct.used_at) throw new Error('Token already used')
    if (new Date(ct.expires_at) < new Date()) throw new Error('Token expired')
    return patchAndReturn<ConfirmationToken>('confirmation_tokens', ct.id, {
      used_at: now(),
      used_action: action,
    })
  },

  // ── Monthly Report History ─────────────────────────────────────────────────
  async getMonthlyReportHistory(year, month) {
    let all = await getAll<MonthlyReportHistory>('monthly_report_history')
    if (year !== undefined) all = all.filter(r => r.year === year)
    if (month !== undefined) all = all.filter(r => r.month === month)
    return all
  },

  async upsertMonthlyReportHistory(data) {
    const all = await getAll<MonthlyReportHistory>('monthly_report_history')
    const existing = all.find(r => r.year === data.year && r.month === data.month)
    if (existing) {
      return patchAndReturn<MonthlyReportHistory>('monthly_report_history', existing.id, data as Record<string, unknown>)
    }
    return createDoc<MonthlyReportHistory>('monthly_report_history', { ...data as Record<string, unknown>, created_at: now() })
  },
}
