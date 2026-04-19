// ─────────────────────────────────────────────────────────────────────────────
// Church (top-level tenant)
// ─────────────────────────────────────────────────────────────────────────────

export interface Church {
  id: string
  name: string
  /** URL-safe unique identifier, e.g. "sample-community" */
  slug: string
  logo_url?: string
  /** IANA timezone string, e.g. "America/Chicago" */
  timezone: string
  created_at: string
  is_active: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Access Control
// ─────────────────────────────────────────────────────────────────────────────

export enum AccessTier {
  Public = 0,
  Authenticated = 1,
  GroupLeader = 2,
  Staff = 3,
  Executive = 4,
}

export interface AppUser {
  uid: string
  tier: AccessTier
  isFinanceAdmin: boolean
  church_id: string
  personId?: string
  email?: string
  displayName?: string
  photoURL?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// People
// ─────────────────────────────────────────────────────────────────────────────

export type MembershipStatus =
  | 'member'
  | 'regular_attender'
  | 'visitor'
  | 'inactive'

export type RelationshipStatus =
  | 'married'
  | 'single'
  | 'partnered'
  | 'divorced'
  | 'co-parenting'
  | 'widowed'
  | 'other'

export type Grade =
  | 'Pre-K'
  | 'K'
  | '1st'
  | '2nd'
  | '3rd'
  | '4th'
  | '5th'
  | '6th'
  | '7th'
  | '8th'
  | '9th'
  | '10th'
  | '11th'
  | '12th'

export interface Person {
  id: string
  church_id: string
  first_name: string
  last_name: string
  preferred_name?: string
  pronouns?: string
  email?: string
  phone: string
  date_of_birth?: string
  grade?: Grade
  is_child: boolean
  gender_identity?: string
  relationship_status?: RelationshipStatus
  membership_status?: MembershipStatus
  allergies?: string
  medical_notes?: string
  special_needs?: string
  custom_field_1?: string
  custom_field_2?: string
  photo_url?: string
  created_at: string
  updated_at: string
  is_active: boolean
  visitor_source?: string
  first_visit_date?: string
  // Life events
  baptism_date?: string
  membership_date?: string
  salvation_date?: string
  // Volunteer profile
  background_check_date?: string
  background_check_expiry?: string
  training_completed?: boolean
  // Soft-delete / archive flag (set by deletePerson — never hard-deleted)
  is_archived?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Households
// ─────────────────────────────────────────────────────────────────────────────

export interface Household {
  id: string
  church_id: string
  name: string
  address_line_1?: string
  address_line_2?: string
  city?: string
  state?: string
  zip?: string
  primary_contact_id?: string
}

export type HouseholdMemberRole = 'adult' | 'child' | 'other'

export interface HouseholdMember {
  id: string
  church_id: string
  household_id: string
  person_id: string
  role: HouseholdMemberRole
  /** IDs of children this adult is authorized to pick up. If absent or empty, authorized for all household children. */
  authorized_children?: string[]
  /** Staff-visible notes, e.g. 'Only authorized for Jake — see custody agreement on file.' */
  pickup_notes?: string
}

export interface ChildPickup {
  id: string
  church_id: string
  child_id: string
  household_id: string
  authorized_person_id: string
  relationship: string
  is_primary: boolean
  pickup_code: string
  notes?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Check-in
// ─────────────────────────────────────────────────────────────────────────────

export type CheckinSessionStatus = 'open' | 'closed'

export interface CheckinSession {
  id: string
  church_id: string
  name: string
  date: string
  service_time: string
  status: CheckinSessionStatus
  created_by: string
}

export type CheckinStatus = 'checked_in' | 'checked_out'

export interface Checkin {
  id: string
  church_id: string
  session_id: string
  child_id: string
  checked_in_by: string
  household_id: string
  pickup_code: string
  kiosk_id: string
  checked_in_at: string
  checked_out_at?: string
  checked_out_by?: string
  status: CheckinStatus
  label_printed: boolean
  notes?: string
  // Director override fields
  override_room?: string
  override_reason?: string
  override_by?: string
  override_at?: string
}

export type CheckinFlagType = 'custody_alert' | 'behavioral' | 'medical' | 'other'

export interface CheckinFlag {
  id: string
  church_id: string
  person_id: string
  flag_type: CheckinFlagType
  flag_message: string
  is_active: boolean
  created_by: string
  created_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Volunteer Teams
// ─────────────────────────────────────────────────────────────────────────────

export interface Team {
  id: string
  church_id: string
  name: string
  description?: string
  coordinator_id?: string
  is_active: boolean
}

export type TeamMemberRole = 'member' | 'leader' | 'coordinator'

export type RotationPreference =
  | 'every_week'
  | '1st_sunday'
  | '2nd_sunday'
  | '3rd_sunday'
  | '4th_sunday'
  | '5th_sunday'
  | 'every_other'
  | 'as_needed'

export interface TeamMember {
  id: string
  church_id: string
  team_id: string
  person_id: string
  role: TeamMemberRole
  rotation_preference: RotationPreference
  joined_at: string
}

export type VolunteerScheduleStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled'

export interface VolunteerSchedule {
  id: string
  church_id: string
  team_id: string
  person_id: string
  scheduled_date: string
  position: string
  status: VolunteerScheduleStatus
  confirmed_at?: string
  reminder_sent: boolean
  reminder_sent_at?: string
  /**
   * Attendance confirmation set by a coordinator after the service.
   * - undefined / absent: not yet marked
   * - true: person served
   * - false: no-show
   */
  served?: boolean
  served_at?: string
  /** Links this assignment to a specific service time. If absent, entry appears in all service views. */
  service_time_id?: string
}

export interface VolunteerBlackout {
  id: string
  church_id: string
  person_id: string
  start_date: string
  end_date: string
  reason?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Groups
// ─────────────────────────────────────────────────────────────────────────────

export type GroupType = 'small_group' | 'class' | 'ministry' | 'support' | 'other'

export type GroupMemberStatus = 'active' | 'waitlisted' | 'inactive'

export interface Group {
  id: string
  church_id: string
  name: string
  description?: string
  group_type: GroupType
  meeting_day?: string
  meeting_time?: string
  location?: string
  childcare_available: boolean
  leader_id?: string
  max_capacity?: number
  is_open: boolean
  is_visible: boolean
  image_url?: string
  hook_text?: string
  category?: string
  semester?: string
  is_active: boolean
}

export interface GroupMember {
  id: string
  church_id: string
  group_id: string
  person_id: string
  status: GroupMemberStatus
  joined_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Group Meetings & Attendance
// ─────────────────────────────────────────────────────────────────────────────

export interface GroupMeeting {
  id: string
  church_id: string
  group_id: string
  date: string       // YYYY-MM-DD
  notes?: string
  created_at: string
}

export type GroupAttendanceStatus = 'present' | 'absent' | 'excused'

export interface GroupAttendance {
  id: string
  church_id: string
  meeting_id: string
  person_id: string
  status: GroupAttendanceStatus
}

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

export type EventRegistrationStatus = 'registered' | 'waitlisted' | 'cancelled'
export type PaymentStatus = 'not_required' | 'pending' | 'paid'

export interface Event {
  id: string
  church_id: string
  name: string
  description?: string
  event_date: string
  event_time?: string
  location?: string
  max_capacity?: number
  registration_required: boolean
  has_cost: boolean
  cost_amount?: number
  cost_description?: string
  image_url?: string
  is_active: boolean
}

export interface EventRegistration {
  id: string
  church_id: string
  event_id: string
  person_id: string
  status: EventRegistrationStatus
  payment_status: PaymentStatus
  payment_amount?: number
  registered_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Giving
// ─────────────────────────────────────────────────────────────────────────────

// ── Monthly Report History ─────────────────────────────────────────────────────

/** One row per month per church. Populated from live DB data or CSV import. */
export interface MonthlyReportHistory {
  id: string
  church_id: string
  year: number
  month: number           // 1-12
  avg_weekly_attendance?: number
  giving_total?: number
  unique_givers?: number
  group_participants?: number
  confirmed_servers?: number
  kids_count?: number
  students_count?: number
  /** true when the record was imported from CSV, false when saved from live report data */
  is_imported: boolean
  created_at: string
}

export type GivingMethod = 'online_card' | 'online_ach' | 'cash' | 'check'
export type GivingSource = 'stripe' | 'square' | 'manual' | 'imported'

export interface GivingRecord {
  id: string
  church_id: string
  person_id: string
  amount: number
  date: string
  method: GivingMethod
  fund: string
  source: GivingSource
  transaction_id?: string
  notes?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Visitor Follow-Up
// ─────────────────────────────────────────────────────────────────────────────

export type FollowupStatus = 'pending' | 'completed' | 'skipped'
export type FollowupMethod = 'text' | 'email' | 'call' | 'task'

export interface VisitorFollowup {
  id: string
  church_id: string
  person_id: string
  step_number: number
  step_name: string
  due_date: string
  status: FollowupStatus
  completed_at?: string
  completed_by?: string
  notes?: string
}

export interface FollowupTemplate {
  id: string
  church_id: string
  step_number: number
  step_name: string
  method: FollowupMethod
  delay_days: number
  template_text: string
  is_active: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Attendance
// ─────────────────────────────────────────────────────────────────────────────

export type EventType = 'sunday_service' | 'group_meeting' | 'event' | 'midweek'
export type CountType = 'headcount' | 'individual'

export interface AttendanceLog {
  id: string
  church_id: string
  person_id: string
  date: string
  event_type: EventType
  event_id?: string
  count_type: CountType
}

// ─────────────────────────────────────────────────────────────────────────────
// Module Config
// ─────────────────────────────────────────────────────────────────────────────

export interface ModuleConfig {
  checkin: boolean
  volunteers: boolean
  groups: boolean
  events: boolean
  visitors: boolean
  worship: boolean
  giving: boolean
  attendance: boolean
  communications: boolean
}

export const DEFAULT_MODULES: ModuleConfig = {
  checkin: true,
  volunteers: true,
  groups: true,
  events: true,
  visitors: true,
  worship: true,
  giving: false,
  attendance: true,
  communications: true,
}

// ─────────────────────────────────────────────────────────────────────────────
// Communications Log
// ─────────────────────────────────────────────────────────────────────────────

export interface CommunicationsLogEntry {
  id: string
  church_id: string
  person_id?: string
  channel: 'email' | 'sms'
  subject: string
  recipient: string
  sent_at: string
  success: boolean
  error_message?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregate Attendance Entry
// ─────────────────────────────────────────────────────────────────────────────

export interface AttendanceEntry {
  id: string
  church_id: string
  service_time_id: string
  date: string
  auditorium_count: number
  students_count?: number
  online_count?: number
  kids_count?: number
  notes?: string
  recorded_by: string
  created_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Pickup Attempt Log (unauthorized)
// ─────────────────────────────────────────────────────────────────────────────

export interface PickupAttempt {
  id: string
  church_id: string
  session_id: string
  checkin_id: string
  code_entered: string
  timestamp: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Pickup Queue (lobby display)
// ─────────────────────────────────────────────────────────────────────────────

export interface PickupQueueEntry {
  id: string
  church_id: string
  session_id: string
  checkin_id: string
  child_name: string    // denormalized for display speed
  room: string          // override_room ?? grade ?? 'Lobby'
  pickup_code: string
  requested_at: string  // ISO timestamp — when checkout was confirmed
  cleared_at?: string
  is_cleared: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Worship — Song Library
// ─────────────────────────────────────────────────────────────────────────────

export interface Song {
  id: string
  church_id: string
  title: string
  artist?: string
  key?: string
  bpm?: number
  lyrics?: string
  ccli_number?: string
  tags?: string[]
  youtube_url?: string
  chord_chart_url?: string
  /** Additional PDF attachments (chord charts, sheet music, etc.) */
  pdf_urls?: string[]
  demo_url?: string
  /** Plain-text chord chart imported from Planning Center or entered manually */
  chord_chart_text?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Worship — Service Plans
// ─────────────────────────────────────────────────────────────────────────────

export type ServicePlanItemType =
  | 'song'
  | 'scripture'
  | 'sermon'
  | 'communion'
  | 'baptism'
  | 'bumper_video'
  | 'announcement'
  | 'custom'

export interface ServicePlan {
  id: string
  church_id: string
  name: string
  service_date: string
  service_time_id?: string
  is_finalized: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export interface ServicePlanItem {
  id: string
  church_id: string
  plan_id: string
  item_type: ServicePlanItemType
  position: number
  duration_minutes?: number
  // song
  song_id?: string
  song_leader_id?: string
  // scripture
  scripture_reference?: string
  reader_id?: string
  // sermon
  sermon_title?: string
  preacher_id?: string
  // freeform
  label?: string
  notes?: string
}

export interface ServiceAssignment {
  id: string
  church_id: string
  plan_id: string
  person_id: string
  role: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Music Stand
// ─────────────────────────────────────────────────────────────────────────────

/** A synchronized page-turn session started by a worship leader. */
export interface MusicStandSession {
  id: string
  church_id: string
  plan_id: string
  /** PersonId of the worship leader who started the session. */
  leader_person_id: string
  is_active: boolean
  current_song_id: string | null
  current_page: number
  /** PersonIds of musicians who have joined (excluding leader). */
  joined_person_ids: string[]
  created_at: string
  ended_at?: string
}

export type AnnotationTool = 'highlighter' | 'pen' | 'text'

/** A user annotation (highlight, drawing, or text note) on a specific PDF page. */
export interface MusicStandAnnotation {
  id: string
  church_id: string
  /** AppUser.uid of the annotating user */
  user_id: string
  song_id: string
  pdf_url: string
  page_number: number
  tool: AnnotationTool
  color: string
  /** JSON-encoded path data or text content */
  data: string
  created_at: string
  updated_at: string
}

/** Per-user, per-PDF viewing preferences (zoom, page reorder). */
export interface UserPdfPreferences {
  id: string
  church_id: string
  user_id: string
  pdf_url: string
  zoom_level: number
  /** Reordered page indices (0-based). Empty array = default order. */
  page_order: number[]
  updated_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirmation Tokens (one-click email confirm/decline)
// ─────────────────────────────────────────────────────────────────────────────

export type ConfirmationPurpose = 'volunteer' | 'event' | 'group_waitlist'

/**
 * A single-use token embedded in outbound emails to let recipients confirm or
 * decline an action (volunteer schedule, event registration, group waitlist)
 * without logging in.
 */
export interface ConfirmationToken {
  id: string
  church_id: string
  /** The opaque URL-safe token string (UUID). */
  token: string
  person_id: string
  /** ID of the related VolunteerSchedule, EventRegistration, or GroupMember record. */
  reference_id: string
  purpose: ConfirmationPurpose
  /** ISO-8601 expiry — tokens are valid for 7 days from creation. */
  expires_at: string
  /** ISO-8601 timestamp when the token was used. Null if still valid. */
  used_at?: string
  /** Action that was taken when the token was used. */
  used_action?: 'confirm' | 'decline'
  // Context data snapshotted at token creation for use in the result page
  role?: string
  service_date?: string
  event_name?: string
  group_name?: string
  church_name?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// App Config (singleton per church)
// ─────────────────────────────────────────────────────────────────────────────

export interface TerminologyConfig {
  /** e.g. 'Small Groups' | 'Life Groups' | 'Connection Groups' | 'Bible Studies' */
  groups_label: string
  /** e.g. 'Volunteers' | 'Serve Teams' | 'Ministry Teams' */
  volunteers_label: string
  /** e.g. 'Members' | 'Congregation' | 'Attendees' | 'People' */
  members_label: string
  /** e.g. 'Giving' | 'Stewardship' | 'Tithes & Offerings' */
  giving_label: string
  /** e.g. 'Kids Check-In' | "Children's Ministry Check-In" */
  kids_label: string
  /** e.g. 'Service Order' | 'Order of Worship' | 'Worship Plan' */
  service_label: string
}

export const DEFAULT_TERMINOLOGY: TerminologyConfig = {
  groups_label: 'Small Groups',
  volunteers_label: 'Volunteers',
  members_label: 'Members',
  giving_label: 'Giving',
  kids_label: 'Kids Check-In',
  service_label: 'Service Order',
}

export type WeekDay = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'

export interface ServiceTime {
  id: string
  day: WeekDay
  time: string
  /** Optional label, e.g. 'Traditional', 'Contemporary' */
  label?: string
}

export interface KidsRoom {
  id: string
  name: string
  min_age?: number
  max_age?: number
}

export interface LabelPrintFields {
  allergies: boolean
  parent_phone: boolean
  photo: boolean
}

/** Singleton configuration record — one per church. */
export interface AppConfig {
  church_id: string

  // ── Section 1: Identity ────────────────────────────────────────────────────
  church_name: string
  logo_url?: string
  icon_url?: string
  address?: string
  phone?: string
  website?: string
  /** What the church calls their congregation. e.g. 'Members', 'Attenders', 'Family', 'Community' */
  congregation_term?: string

  // ── Section 2: Branding ────────────────────────────────────────────────────
  /** Hex string, e.g. '#6366f1'. Applied as CSS custom properties at runtime. */
  primary_color: string
  secondary_color?: string

  // ── Section 3: Service Times ───────────────────────────────────────────────
  service_times?: ServiceTime[]
  /** Named campuses or buildings, e.g. ['Main Campus', 'East Campus'] */
  campuses?: string[]

  // ── Section 4: Kids Ministry ───────────────────────────────────────────────
  kids_rooms?: KidsRoom[]
  label_print_fields?: LabelPrintFields
  /** When true, allergy/medical notes on a child's profile auto-flag on check-in */
  auto_flag_allergies?: boolean
  /** 'code' = pickup code required; 'visual' = visual ID check only */
  pickup_policy?: 'code' | 'visual'
  kiosk_count?: number

  // ── Section 5: Groups ──────────────────────────────────────────────────────
  group_types?: string[]
  group_leaders_see_roster?: boolean
  group_signup_requires_approval?: boolean

  // ── Terminology (used across sections) ────────────────────────────────────
  terminology: TerminologyConfig

  // ── Section 6: Volunteers ──────────────────────────────────────────────────
  serving_teams?: string[]
  schedule_advance?: 'weekly' | 'bi-weekly' | 'monthly'
  volunteer_scheduling?: 'self' | 'coordinator'
  volunteer_notification?: 'email' | 'sms' | 'both'

  // ── Section 7: Communications ──────────────────────────────────────────────
  primary_outreach?: 'email' | 'sms' | 'both'
  visitor_followup_steps?: number
  visitor_followup_owner?: string
  weekly_report?: boolean
  weekly_report_email?: string

  // ── Email provider ─────────────────────────────────────────────────────────
  /** Which transactional email provider to use. Defaults to 'resend'. */
  email_provider?: 'gmail' | 'resend'
  /** Gmail address used as the "from" address when provider is 'gmail'. */
  gmail_address?: string
  /**
   * Gmail App Password (not the account password).
   * Gmail SMTP requires a server-side proxy — this value is stored so an
   * admin can configure it in the UI, but actual sending is skipped in the
   * browser with a console.warn (same pattern as Twilio SMS).
   */
  gmail_app_password?: string
  /** Resend API key. Overrides VITE_RESEND_API_KEY when set in AppConfig. */
  resend_api_key?: string

  // ── Section 8: Dashboard ───────────────────────────────────────────────────
  dashboard_metrics?: string[]
  show_yoy?: boolean

  // ── Module Toggles ─────────────────────────────────────────────────────────
  modules?: ModuleConfig

  // ── Attendance Tracking Mode ───────────────────────────────────────────────
  /** 'individual' = track named adults, 'aggregate' = headcounts, 'none' = kids/volunteers only */
  track_adult_attendance?: 'individual' | 'aggregate' | 'none'

  // ── Kids Ministry — Late Pickup ────────────────────────────────────────────
  /** Minutes after service end before a child is flagged as late pickup. Default 30. */
  late_pickup_minutes?: number

  // ── Worship Roles ─────────────────────────────────────────────────────────
  worship_roles?: string[]

  // ── Reports ────────────────────────────────────────────────────────────────
  /** Annual giving budget in dollars. Monthly target = annual_giving_budget / 12. */
  annual_giving_budget?: number
  /** Comma-separated email addresses to receive the monthly Vital Signs Report. */
  report_recipients?: string

  /** false until the setup wizard completes; triggers redirect to /setup. */
  setup_complete: boolean
  updated_at: string
}

export const DEFAULT_KIDS_ROOMS: KidsRoom[] = [
  { id: 'room-nursery', name: 'Nursery', min_age: 0, max_age: 2 },
  { id: 'room-toddler', name: 'Toddlers', min_age: 2, max_age: 4 },
  { id: 'room-preK',    name: 'Pre-K',   min_age: 4, max_age: 5 },
  { id: 'room-k2',      name: 'K–2nd',   min_age: 5, max_age: 8 },
  { id: 'room-35',      name: '3rd–5th', min_age: 8, max_age: 11 },
]

export const DEFAULT_SERVING_TEAMS = [
  'Worship', 'Production / Tech', 'Hospitality', 'Parking', 'Kids', 'Youth', 'Security', 'Prayer',
]

export const DEFAULT_DASHBOARD_METRICS = ['attendance', 'giving', 'volunteers', 'groups', 'visitors', 'kids']

export const DEFAULT_WORSHIP_ROLES = [
  'Lead Vocals', 'Keys', 'Drums', 'Acoustic Guitar', 'Electric Guitar',
  'Bass', 'Video', 'Audio', 'Lighting', 'Greeter',
]

export const DEFAULT_APP_CONFIG: Omit<AppConfig, 'church_id'> = {
  church_name: 'My Church',
  primary_color: '#6366f1',
  terminology: DEFAULT_TERMINOLOGY,
  auto_flag_allergies: true,
  pickup_policy: 'code',
  kids_rooms: DEFAULT_KIDS_ROOMS,
  label_print_fields: { allergies: true, parent_phone: true, photo: false },
  serving_teams: DEFAULT_SERVING_TEAMS,
  schedule_advance: 'weekly',
  volunteer_scheduling: 'coordinator',
  volunteer_notification: 'email',
  group_types: ['Small Groups', 'Bible Study', 'Youth'],
  group_leaders_see_roster: true,
  group_signup_requires_approval: false,
  primary_outreach: 'email',
  visitor_followup_steps: 3,
  weekly_report: false,
  dashboard_metrics: DEFAULT_DASHBOARD_METRICS,
  show_yoy: true,
  modules: DEFAULT_MODULES,
  track_adult_attendance: 'aggregate' as const,
  late_pickup_minutes: 30,
  worship_roles: DEFAULT_WORSHIP_ROLES,
  setup_complete: false,
  updated_at: '',
}
