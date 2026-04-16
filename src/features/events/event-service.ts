import { db } from '@/services'
import { sendSMS, sendEmail } from '@/services/notification-service'
import type { Event, EventRegistration, Person, EventRegistrationStatus } from '@/shared/types'

export interface EnrichedRegistration {
  registration: EventRegistration
  person: Person | null
}

// ── Events ────────────────────────────────────────────────────────────────────

export async function getUpcomingEvents(): Promise<Event[]> {
  const today = new Date().toISOString().split('T')[0]
  const events = await db.getEvents()
  return events
    .filter(e => e.is_active && e.event_date >= today)
    .sort((a, b) => a.event_date.localeCompare(b.event_date))
}

export async function getPastEvents(): Promise<Event[]> {
  const today = new Date().toISOString().split('T')[0]
  const events = await db.getEvents()
  return events
    .filter(e => e.is_active && e.event_date < today)
    .sort((a, b) => b.event_date.localeCompare(a.event_date))
}

export async function getAllEvents(): Promise<Event[]> {
  const events = await db.getEvents()
  return events.sort((a, b) => b.event_date.localeCompare(a.event_date))
}

export async function getEvent(id: string): Promise<Event | null> {
  return db.getEvent(id)
}

export async function createEvent(data: Omit<Event, 'id'>): Promise<Event> {
  return db.createEvent(data)
}

export async function updateEvent(id: string, data: Partial<Event>): Promise<Event> {
  return db.updateEvent(id, data)
}

// ── Registrations ─────────────────────────────────────────────────────────────

export async function getEnrichedRegistrations(eventId: string): Promise<EnrichedRegistration[]> {
  const registrations = await db.getEventRegistrations(eventId)
  const rows = await Promise.all(
    registrations
      .filter(r => r.status !== 'cancelled')
      .map(async r => ({
        registration: r,
        person: await db.getPerson(r.person_id),
      }))
  )
  return rows
}

export interface RegisterResult {
  registration: EventRegistration
  waitlisted: boolean
  alreadyRegistered: boolean
}

export async function registerForEvent(eventId: string, personId: string): Promise<RegisterResult> {
  const [event, registrations] = await Promise.all([
    db.getEvent(eventId),
    db.getEventRegistrations(eventId),
  ])
  if (!event) throw new Error('Event not found')

  const existing = registrations.find(r => r.person_id === personId && r.status !== 'cancelled')
  if (existing) {
    return {
      registration: existing,
      waitlisted: existing.status === 'waitlisted',
      alreadyRegistered: true,
    }
  }

  const activeCount = registrations.filter(r => r.status === 'registered').length
  const waitlisted = !!(event.max_capacity && activeCount >= event.max_capacity)
  const status: EventRegistrationStatus = waitlisted ? 'waitlisted' : 'registered'

  const registration = await db.createEventRegistration({
    event_id: eventId,
    person_id: personId,
    status,
    payment_status: event.has_cost ? 'pending' : 'not_required',
    registered_at: new Date().toISOString(),
  })

  return { registration, waitlisted, alreadyRegistered: false }
}

export async function cancelRegistration(registrationId: string, eventId: string): Promise<EventRegistration> {
  const cancelled = await db.updateEventRegistration(registrationId, { status: 'cancelled' })

  // Promote the earliest-registered waitlisted person if a slot opened up
  const event = await db.getEvent(eventId)
  if (!event?.max_capacity) return cancelled // unlimited — nothing to promote into

  const allRegs = await db.getEventRegistrations(eventId)
  const activeCount = allRegs.filter(r => r.status === 'registered').length
  if (activeCount < event.max_capacity) {
    const firstWaitlisted = allRegs
      .filter(r => r.status === 'waitlisted')
      .sort((a, b) => a.registered_at.localeCompare(b.registered_at))[0]
    if (firstWaitlisted) {
      await db.updateEventRegistration(firstWaitlisted.id, { status: 'registered' })
      const person = await db.getPerson(firstWaitlisted.person_id)
      if (person) {
        const msg = `Good news! A spot opened up for ${event.name} and you've been moved from the waitlist to registered. See you there!`
        if (person.phone) await sendSMS({ to: person.phone, body: msg })
        if (person.email) await sendEmail({ to: person.email, subject: `You're registered: ${event.name}`, body: msg })
      }
    }
  }

  return cancelled
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatCost(event: Event): string {
  if (!event.has_cost) return 'Free'
  if (event.cost_amount) return `$${event.cost_amount.toFixed(2)}`
  return event.cost_description ?? 'Paid'
}
