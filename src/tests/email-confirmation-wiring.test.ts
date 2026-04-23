/**
 * Integration tests for one-click confirmation email wiring.
 *
 * These tests verify that the service layer (volunteer scheduling, event
 * waitlist promotion, group waitlist promotion) correctly embeds one-click
 * confirm/decline URLs in outbound emails.
 *
 * In TEST_MODE, sendEmail() logs to console instead of hitting Resend.
 * We spy on console.log to capture the email body and assert that the
 * confirm/decline URLs are present.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { db } from '@/services'
import { sendVolunteerScheduleEmail, createScheduleEntry } from '@/features/volunteers/volunteer-service'
import { signUpForGroup, removeMember, createGroup } from '@/features/groups/group-service'
import { registerForEvent, cancelRegistration, createEvent } from '@/features/events/event-service'

// ── Shared helpers ────────────────────────────────────────────────────────────

async function makePerson(name = 'Alice Smith', email?: string) {
  const [first, ...rest] = name.split(' ')
  return db.createPerson({
    first_name: first,
    last_name: rest.join(' ') || 'User',
    is_active: true,
    is_child: false,
    ...(email ? { email } : {}),
  })
}

function captureEmailLog(consoleSpy: ReturnType<typeof vi.spyOn>): string | null {
  const call = consoleSpy.mock.calls.find(c => c[0] === '[notification-service] Email →')
  if (!call) return null
  const payload = call[1] as { body?: string }
  return payload?.body ?? null
}

// ── Volunteer schedule email ───────────────────────────────────────────────────

describe('sendVolunteerScheduleEmail', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('sends an email containing confirm and decline URLs', async () => {
    const person = await makePerson('Bob Volunteer', 'bob@example.com')
    const teams = await db.getTeams()
    const team = teams[0]

    const entry = await createScheduleEntry({
      teamId: team.id,
      personId: person.id,
      date: '2026-05-04',
      position: 'Lead Vocals',
    })

    await sendVolunteerScheduleEmail(entry.id, 'Grace Church')

    const body = captureEmailLog(consoleSpy)
    expect(body).toBeTruthy()
    expect(body).toContain('/confirm?token=')
    expect(body).toContain('action=confirm')
    expect(body).toContain('action=decline')
  })

  it('sends email with correct role and service date in subject', async () => {
    const person = await makePerson('Carol Lead', 'carol@example.com')
    const teams = await db.getTeams()
    const team = teams[0]

    const entry = await createScheduleEntry({
      teamId: team.id,
      personId: person.id,
      date: '2026-05-11',
      position: 'Drums',
    })

    await sendVolunteerScheduleEmail(entry.id)

    const call = consoleSpy.mock.calls.find(c => c[0] === '[notification-service] Email →')
    const payload = call?.[1] as { subject?: string }
    expect(payload?.subject).toContain('Drums')
    expect(payload?.subject).toContain('2026-05-11')
  })

  it('does nothing when schedule entry does not exist', async () => {
    await sendVolunteerScheduleEmail('non-existent-schedule-id')
    const emailCall = consoleSpy.mock.calls.find(c => c[0] === '[notification-service] Email →')
    expect(emailCall).toBeUndefined()
  })

  it('does nothing when person has no email address', async () => {
    const person = await makePerson('Dan NoEmail') // no email
    const teams = await db.getTeams()
    const team = teams[0]

    const entry = await createScheduleEntry({
      teamId: team.id,
      personId: person.id,
      date: '2026-05-18',
      position: 'Greeter',
    })

    await sendVolunteerScheduleEmail(entry.id)
    const emailCall = consoleSpy.mock.calls.find(c => c[0] === '[notification-service] Email →')
    expect(emailCall).toBeUndefined()
  })

  it('email body includes the volunteer first name', async () => {
    const person = await makePerson('Eve Smith', 'eve@example.com')
    const teams = await db.getTeams()
    const team = teams[0]

    const entry = await createScheduleEntry({
      teamId: team.id,
      personId: person.id,
      date: '2026-05-25',
      position: 'Keys',
    })

    await sendVolunteerScheduleEmail(entry.id)

    const body = captureEmailLog(consoleSpy)
    expect(body).toContain('Eve')
  })

  it('marks reminder_sent on the schedule entry after sending', async () => {
    const person = await makePerson('Frank Remind', 'frank@example.com')
    const teams = await db.getTeams()
    const team = teams[0]

    const entry = await createScheduleEntry({
      teamId: team.id,
      personId: person.id,
      date: '2026-06-01',
      position: 'Audio',
    })

    expect(entry.reminder_sent).toBe(false)
    await sendVolunteerScheduleEmail(entry.id)

    const all = await db.getVolunteerSchedule(team.id, person.id)
    const updated = all.find(e => e.id === entry.id)
    expect(updated?.reminder_sent).toBe(true)
    expect(updated?.reminder_sent_at).toBeTruthy()
  })

  it('email body includes church name when provided', async () => {
    const person = await makePerson('Grace Church', 'grace@example.com')
    const teams = await db.getTeams()
    const team = teams[0]

    const entry = await createScheduleEntry({
      teamId: team.id,
      personId: person.id,
      date: '2026-06-08',
      position: 'Video',
    })

    await sendVolunteerScheduleEmail(entry.id, 'Hope Community Church')
    const body = captureEmailLog(consoleSpy)
    expect(body).toContain('Hope Community Church')
  })
})

// ── Group waitlist promotion ───────────────────────────────────────────────────

describe('group waitlist promotion email', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  async function makeGroup(name = 'Test Group', max_capacity = 1) {
    return createGroup({
      name,
      group_type: 'small_group',
      is_open: true,
      is_visible: true,
      is_active: true,
      childcare_available: false,
      max_capacity,
    })
  }

  it('promoted person receives email with confirm and decline URLs', async () => {
    const g = await makeGroup('Young Adults')
    const p1 = await makePerson('Henry Fill', 'henry@example.com')
    const p2 = await makePerson('Iris Wait', 'iris@example.com')

    await signUpForGroup(g.id, p1.id) // fills slot
    await signUpForGroup(g.id, p2.id) // goes to waitlist

    consoleSpy.mockClear() // clear logs from sign-up

    await removeMember(g.id, p1.id) // triggers promotion of p2

    const body = captureEmailLog(consoleSpy)
    expect(body).toBeTruthy()
    expect(body).toContain('/confirm?token=')
    expect(body).toContain('action=confirm')
    expect(body).toContain('action=decline')
  })

  it('promotion email mentions the group name', async () => {
    const g = await makeGroup('Senior Fellowship', 1)
    const p1 = await makePerson('Jack Active', 'jack@example.com')
    const p2 = await makePerson('Kate Waitlisted', 'kate@example.com')

    await signUpForGroup(g.id, p1.id)
    await signUpForGroup(g.id, p2.id)
    consoleSpy.mockClear()

    await removeMember(g.id, p1.id)

    const body = captureEmailLog(consoleSpy)
    expect(body).toContain('Senior Fellowship')
  })

  it('no email sent when promoted person has no email address', async () => {
    const g = await makeGroup('No Email Group')
    const p1 = await makePerson('Liam Email', 'liam@example.com')
    const p2 = await makePerson('Mia NoEmail') // no email

    await signUpForGroup(g.id, p1.id)
    await signUpForGroup(g.id, p2.id)
    consoleSpy.mockClear()

    await removeMember(g.id, p1.id)

    const emailCall = consoleSpy.mock.calls.find(c => c[0] === '[notification-service] Email →')
    expect(emailCall).toBeUndefined()
  })
})

// ── Event waitlist promotion ───────────────────────────────────────────────────

describe('event waitlist promotion email', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  async function makeEvent(name = 'Test Event', max_capacity = 1) {
    return createEvent({
      name,
      event_date: '2099-06-01',
      registration_required: true,
      has_cost: false,
      is_active: true,
      max_capacity,
    })
  }

  it('promoted person receives email with confirm and decline URLs', async () => {
    const e = await makeEvent('Fall Retreat')
    const p1 = await makePerson('Noah Register', 'noah@example.com')
    const p2 = await makePerson('Olivia Wait', 'olivia@example.com')

    const { registration: reg1 } = await registerForEvent(e.id, p1.id) // fills slot
    await registerForEvent(e.id, p2.id) // goes to waitlist

    consoleSpy.mockClear()

    await cancelRegistration(reg1.id, e.id) // triggers promotion of p2

    const body = captureEmailLog(consoleSpy)
    expect(body).toBeTruthy()
    expect(body).toContain('/confirm?token=')
    expect(body).toContain('action=confirm')
    expect(body).toContain('action=decline')
  })

  it('promotion email mentions the event name', async () => {
    const e = await makeEvent('Spring Gala')
    const p1 = await makePerson('Pete Reg', 'pete@example.com')
    const p2 = await makePerson('Quinn Wait', 'quinn@example.com')

    const { registration: reg1 } = await registerForEvent(e.id, p1.id)
    await registerForEvent(e.id, p2.id)
    consoleSpy.mockClear()

    await cancelRegistration(reg1.id, e.id)

    const body = captureEmailLog(consoleSpy)
    expect(body).toContain('Spring Gala')
  })

  it('no email sent when promoted person has no email address', async () => {
    const e = await makeEvent('No Email Event')
    const p1 = await makePerson('Rachel Reg', 'rachel@example.com')
    const p2 = await makePerson('Sam NoEmail') // no email

    const { registration: reg1 } = await registerForEvent(e.id, p1.id)
    await registerForEvent(e.id, p2.id)
    consoleSpy.mockClear()

    await cancelRegistration(reg1.id, e.id)

    const emailCall = consoleSpy.mock.calls.find(c => c[0] === '[notification-service] Email →')
    expect(emailCall).toBeUndefined()
  })
})
