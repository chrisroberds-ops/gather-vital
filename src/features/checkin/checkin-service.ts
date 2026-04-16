/**
 * All check-in business logic.
 * Pure functions that operate on the db service and emit events via the bus.
 */

import { db } from '@/services'
import { checkinBus } from '@/services/checkin-event-bus'
import { printLabel, buildLabelData, printCheckoutSlip } from '@/services/print-service'
import type { Checkin, CheckinSession, Person, Household } from '@/shared/types'

// ── Cross-tab persistence (localStorage) ─────────────────────────────────────
// The in-memory DB is per-tab. Writes go to localStorage so that any tab
// reading the same key sees the current state regardless of which tab wrote it.

const SESSION_KEY = 'gather_open_session'
const checkinsKey = (sessionId: string) => `gather_checkins_${sessionId}`
const personKey = (id: string) => `gather_person_${id}`

function persistSession(session: CheckinSession | null): void {
  if (session && session.status === 'open') {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } else {
    localStorage.removeItem(SESSION_KEY)
  }
}

function readPersistedSession(): CheckinSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as CheckinSession
    return session.status === 'open' ? session : null
  } catch {
    return null
  }
}

function persistCheckin(checkin: Checkin): void {
  const key = checkinsKey(checkin.session_id)
  try {
    const existing = readPersistedCheckins(checkin.session_id)
    const idx = existing.findIndex(c => c.id === checkin.id)
    if (idx >= 0) existing[idx] = checkin
    else existing.push(checkin)
    localStorage.setItem(key, JSON.stringify(existing))
  } catch {
    // localStorage quota exceeded — silently ignore
  }
}

function readPersistedCheckins(sessionId: string): Checkin[] {
  try {
    const raw = localStorage.getItem(checkinsKey(sessionId))
    return raw ? (JSON.parse(raw) as Checkin[]) : []
  } catch {
    return []
  }
}

function persistPersonLocally(person: Person): void {
  try {
    localStorage.setItem(personKey(person.id), JSON.stringify(person))
  } catch {}
}

// Exported for use in hooks — checks localStorage when the in-memory DB returns
// null, which happens when the person was created in a different tab (e.g. a
// new family registered at the kiosk, then viewed on the staff dashboard).
export async function getPersonCrossTab(id: string): Promise<Person | null> {
  const person = await db.getPerson(id)
  if (person) return person
  try {
    const raw = localStorage.getItem(personKey(id))
    return raw ? (JSON.parse(raw) as Person) : null
  } catch {
    return null
  }
}

// Exported so hooks can call it directly instead of db.getCheckins
export async function getSessionCheckins(sessionId: string): Promise<Checkin[]> {
  const persisted = readPersistedCheckins(sessionId)
  if (persisted.length > 0) return persisted
  // Same-tab fallback (e.g. staff opens session and checks in from the same tab)
  return db.getCheckins(sessionId)
}

// ── Session management ────────────────────────────────────────────────────────

export async function openSession(
  name: string,
  date: string,
  serviceTime: string,
  createdBy: string,
): Promise<CheckinSession> {
  const session = await db.createCheckinSession({
    name,
    date,
    service_time: serviceTime,
    status: 'open',
    created_by: createdBy,
  })
  persistSession(session)
  checkinBus.emit('session_created', { session })
  return session
}

export async function closeSession(sessionId: string): Promise<CheckinSession> {
  const session = await db.updateCheckinSession(sessionId, { status: 'closed' })
  persistSession(null)
  checkinBus.emit('session_updated', { session })
  return session
}

export async function getOpenSession(): Promise<CheckinSession | null> {
  // Check localStorage first — works across tabs even when in-memory stores differ
  const persisted = readPersistedSession()
  if (persisted) return persisted
  // Fall back to in-memory store (same-tab case, e.g. staff dashboard)
  const sessions = await db.getCheckinSessions()
  return sessions.find(s => s.status === 'open') ?? null
}

// ── Phone lookup ──────────────────────────────────────────────────────────────

export interface LookupResult {
  parent: Person
  children: Array<{
    child: Person
    householdId: string
    pickupCode: string
    alreadyCheckedIn: boolean
  }>
}

export async function lookupParentByPhone(
  phone: string,
  sessionId: string,
): Promise<LookupResult | null> {
  const parent = await db.getPersonByPhone(phone)
  if (!parent) return null

  // Find all households where this person is an authorized pickup
  const allPickups = await getAllChildPickupsForPerson(parent.id)
  if (allPickups.length === 0) return null

  // Get existing check-ins for this session to detect double check-in
  const sessionCheckins = await getSessionCheckins(sessionId)
  const checkedInChildIds = new Set(
    sessionCheckins
      .filter(c => c.status === 'checked_in')
      .map(c => c.child_id),
  )

  // Build child list
  const childMap = new Map<string, { child: Person; householdId: string; pickupCode: string; alreadyCheckedIn: boolean }>()
  for (const pickup of allPickups) {
    if (childMap.has(pickup.child_id)) continue
    const child = await db.getPerson(pickup.child_id)
    if (!child || !child.is_child || !child.is_active) continue
    childMap.set(pickup.child_id, {
      child,
      householdId: pickup.household_id,
      pickupCode: pickup.pickup_code,
      alreadyCheckedIn: checkedInChildIds.has(pickup.child_id),
    })
  }

  if (childMap.size === 0) return null
  return { parent, children: [...childMap.values()] }
}

async function getAllChildPickupsForPerson(personId: string) {
  // Collect all households for this person
  const households = await db.getPersonHouseholds(personId)
  const pickups: Array<{ child_id: string; household_id: string; pickup_code: string }> = []
  for (const household of households) {
    const hPickups = await db.getPickupsByHousehold(household.id)
    for (const p of hPickups) {
      if (p.authorized_person_id === personId) {
        pickups.push({ child_id: p.child_id, household_id: p.household_id, pickup_code: p.pickup_code })
      }
    }
  }
  return pickups
}

// ── Check-in ──────────────────────────────────────────────────────────────────

export interface CheckinInput {
  sessionId: string
  childId: string
  parentId: string
  householdId: string
  pickupCode: string
  kioskId: string
}

export async function performCheckin(input: CheckinInput): Promise<Checkin> {
  // Double-check not already checked in this session (reads across tabs)
  const existing = await getSessionCheckins(input.sessionId)
  const alreadyIn = existing.find(
    c => c.child_id === input.childId && c.status === 'checked_in',
  )
  if (alreadyIn) return alreadyIn

  const checkin = await db.createCheckin({
    session_id: input.sessionId,
    child_id: input.childId,
    checked_in_by: input.parentId,
    household_id: input.householdId,
    pickup_code: input.pickupCode,
    kiosk_id: input.kioskId,
    checked_in_at: new Date().toISOString(),
    status: 'checked_in',
    label_printed: false,
  })

  persistCheckin(checkin)
  checkinBus.emit('checkin_created', { checkin })

  // Trigger print
  await triggerPrint(checkin, input.kioskId)

  return checkin
}

async function triggerPrint(checkin: Checkin, kioskId: string): Promise<void> {
  try {
    const [child, parent, session, configs] = await Promise.all([
      db.getPerson(checkin.child_id),
      db.getPerson(checkin.checked_in_by),
      getOpenSession(),
      db.getAppConfig(),
    ])
    if (!child || !parent || !session) return

    const cf1Label = configs.find(c => c.key === 'custom_field_1_label')?.value
    const cf2Label = configs.find(c => c.key === 'custom_field_2_label')?.value

    const labelData = buildLabelData(child, parent, checkin, session, cf1Label, cf2Label)
    await printLabel({ kioskId, checkinId: checkin.id, childLabel: labelData, parentTag: labelData })

    await db.updateCheckin(checkin.id, { label_printed: true })
  } catch (err) {
    console.error('Print failed:', err)
  }
}

// ── Check-out ─────────────────────────────────────────────────────────────────

export interface HouseholdChildEntry {
  checkin: Checkin
  childName: string
  room: string
  /** false only when the adult has a restricted authorized_children list that excludes this child */
  authorized: boolean
}

export interface HouseholdCheckoutGroup {
  /** The child matched by the entered code — always present */
  primary: { checkin: Checkin; childName: string; room: string }
  /** Other household children currently checked in (may be empty) */
  additional: HouseholdChildEntry[]
  /** Staff-visible note from the adult's HouseholdMember record */
  pickupNotes?: string
}

/**
 * After a valid pickup code is found, fetch all other checked-in children from
 * the same household and check the adult's authorization list.
 *
 * Returns a HouseholdCheckoutGroup. If additional is empty, the caller should
 * show the normal single-child checkout UI unchanged.
 */
export async function getHouseholdCheckoutGroup(
  primaryCheckin: Checkin,
  code: string,
  sessionId: string,
): Promise<HouseholdCheckoutGroup> {
  const { household_id } = primaryCheckin

  // Resolve primary child name / room
  const primaryChild = await getPersonCrossTab(primaryCheckin.child_id)
  const primaryChildName = primaryChild
    ? `${primaryChild.preferred_name ?? primaryChild.first_name} ${primaryChild.last_name}`
    : 'Unknown'
  const primaryRoom = primaryCheckin.override_room ?? primaryChild?.grade ?? 'Lobby'

  // Find the authorized adult via their ChildPickup record (matched by code)
  const pickups = await db.getPickupsByHousehold(household_id)
  const matchingPickup = pickups.find(p => p.pickup_code === code)

  let pickupNotes: string | undefined
  let authorizedChildren: string[] | undefined // undefined = authorized for all

  if (matchingPickup) {
    const members = await db.getHouseholdMembers(household_id)
    const adultMember = members.find(m => m.person_id === matchingPickup.authorized_person_id)
    if (adultMember) {
      pickupNotes = adultMember.pickup_notes || undefined
      if (adultMember.authorized_children && adultMember.authorized_children.length > 0) {
        authorizedChildren = adultMember.authorized_children
      }
    }
  }

  // Find other household members who are currently checked in
  const members = await db.getHouseholdMembers(household_id)
  const otherMemberIds = new Set(
    members.map(m => m.person_id).filter(id => id !== primaryCheckin.child_id)
  )

  const sessionCheckins = await getSessionCheckins(sessionId)
  const additionalCheckins = sessionCheckins.filter(
    c => c.status === 'checked_in' && otherMemberIds.has(c.child_id)
  )

  const additional: HouseholdChildEntry[] = []
  for (const checkin of additionalCheckins) {
    const child = await getPersonCrossTab(checkin.child_id)
    const childName = child
      ? `${child.preferred_name ?? child.first_name} ${child.last_name}`
      : 'Unknown'
    const room = checkin.override_room ?? child?.grade ?? 'Lobby'
    const authorized = !authorizedChildren || authorizedChildren.includes(checkin.child_id)
    additional.push({ checkin, childName, room, authorized })
  }

  return {
    primary: { checkin: primaryCheckin, childName: primaryChildName, room: primaryRoom },
    additional,
    pickupNotes,
  }
}

export async function lookupByPickupCode(
  code: string,
  sessionId: string,
): Promise<Checkin | null> {
  const checkins = await getSessionCheckins(sessionId)
  return checkins.find(c => c.pickup_code === code && c.status === 'checked_in') ?? null
}

// Scans all gather_checkins_* localStorage keys to find a checkin by ID.
// Used when the checkin was created in another tab and isn't in this tab's
// in-memory DB.
function findCheckinInStorage(checkinId: string): Checkin | null {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith('gather_checkins_')) continue
    try {
      const checkins = JSON.parse(localStorage.getItem(key) ?? '[]') as Checkin[]
      const found = checkins.find(c => c.id === checkinId)
      if (found) return found
    } catch {}
  }
  return null
}

export async function performCheckout(
  checkinId: string,
  checkedOutById: string,
): Promise<Checkin> {
  const updates = {
    status: 'checked_out' as const,
    checked_out_at: new Date().toISOString(),
    checked_out_by: checkedOutById,
  }

  let updated: Checkin
  try {
    // Same-tab case: checkin exists in this tab's in-memory DB
    updated = await db.updateCheckin(checkinId, updates)
  } catch {
    // Cross-tab case: checkin was created in the kiosk tab; find it in localStorage
    const fromStorage = findCheckinInStorage(checkinId)
    if (!fromStorage) throw new Error(`Checkin ${checkinId} not found`)
    updated = { ...fromStorage, ...updates }
  }

  persistCheckin(updated)
  checkinBus.emit('checkin_updated', { checkin: updated })

  // Print checkout slip (non-fatal)
  try {
    const child = await getPersonCrossTab(updated.child_id)
    const session = await getOpenSession()
    const childName = child
      ? `${child.preferred_name ?? child.first_name} ${child.last_name}`
      : updated.child_id
    const room = updated.override_room ?? child?.grade ?? 'Lobby'
    if (session) {
      await printCheckoutSlip({ childName, room, pickupCode: updated.pickup_code, sessionName: session.name })
    }
  } catch (err) {
    console.error('Checkout slip failed:', err)
  }

  return updated
}

// ── Director Override ─────────────────────────────────────────────────────────

export async function performDirectorOverride(
  checkinId: string,
  overrideRoom: string,
  overrideReason: string,
  overrideBy: string,
): Promise<Checkin> {
  const updates = {
    override_room: overrideRoom,
    override_reason: overrideReason,
    override_by: overrideBy,
    override_at: new Date().toISOString(),
  }

  let updated: Checkin
  try {
    // Same-tab case: checkin exists in this tab's in-memory DB
    updated = await db.updateCheckin(checkinId, updates)
  } catch {
    // Cross-tab case: checkin was created in the kiosk tab; reconstruct from localStorage
    const fromStorage = findCheckinInStorage(checkinId)
    if (!fromStorage) throw new Error(`Checkin ${checkinId} not found`)
    updated = { ...fromStorage, ...updates }
  }

  // Sync localStorage so getSessionCheckins returns fresh data on next read
  persistCheckin(updated)
  // Notify all tabs (including this one) that the checkin changed
  checkinBus.emit('checkin_updated', { checkin: updated })
  return updated
}

// ── Flag checking ─────────────────────────────────────────────────────────────

export async function getActiveFlags(childId: string) {
  const flags = await db.getCheckinFlagsForPerson(childId)
  return flags.filter(f => f.is_active)
}

// ── First-time family registration ────────────────────────────────────────────

export interface NewFamilyInput {
  parentFirstName: string
  parentLastName: string
  parentPhone: string
  parentEmail?: string
  children: Array<{
    firstName: string
    lastName: string
    grade: string
    dateOfBirth?: string
    allergies?: string
  }>
}

export interface NewFamilyResult {
  parent: Person
  household: Household
  children: Person[]
}

export async function registerNewFamily(input: NewFamilyInput): Promise<NewFamilyResult> {
  const now = new Date().toISOString()
  const today = now.split('T')[0]

  // Create parent
  const parent = await db.createPerson({
    first_name: input.parentFirstName,
    last_name: input.parentLastName,
    phone: input.parentPhone,
    email: input.parentEmail,
    is_child: false,
    is_active: true,
    first_visit_date: today,
    visitor_source: 'kiosk',
  })
  persistPersonLocally(parent)

  // Create household
  const household = await db.createHousehold({
    name: `The ${input.parentLastName} Family`,
    primary_contact_id: parent.id,
  })

  // Link parent to household
  await db.addHouseholdMember({
    household_id: household.id,
    person_id: parent.id,
    role: 'adult',
  })

  // Create children
  const children: Person[] = []
  for (const childInput of input.children) {
    const child = await db.createPerson({
      first_name: childInput.firstName,
      last_name: childInput.lastName,
      phone: input.parentPhone, // children share parent's phone
      grade: childInput.grade as Person['grade'],
      date_of_birth: childInput.dateOfBirth,
      allergies: childInput.allergies,
      is_child: true,
      is_active: true,
      first_visit_date: today,
    })

    persistPersonLocally(child)

    await db.addHouseholdMember({
      household_id: household.id,
      person_id: child.id,
      role: 'child',
    })

    // Generate unique 4-digit pickup code
    const pickupCode = generatePickupCode()
    await db.createChildPickup({
      child_id: child.id,
      household_id: household.id,
      authorized_person_id: parent.id,
      relationship: 'parent',
      is_primary: true,
      pickup_code: pickupCode,
    })

    children.push(child)
  }

  // Trigger visitor follow-up pipeline
  const templates = await db.getFollowupTemplates()
  for (const template of templates.filter(t => t.is_active)) {
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + template.delay_days)
    await db.createVisitorFollowup({
      person_id: parent.id,
      step_number: template.step_number,
      step_name: template.step_name,
      due_date: dueDate.toISOString().split('T')[0],
      status: 'pending',
    })
  }

  return { parent, household, children }
}

export function generatePickupCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}
