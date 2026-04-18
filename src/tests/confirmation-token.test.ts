import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { db } from '@/services'
import {
  createVolunteerConfirmToken,
  createEventConfirmToken,
  createGroupWaitlistConfirmToken,
  resolveConfirmationToken,
  confirmUrl,
  declineUrl,
} from '@/services/confirmation-token-service'

// ── helpers ───────────────────────────────────────────────────────────────────

async function makeVolunteerSchedule() {
  const teams = await db.getTeams()
  const team = teams[0]
  const people = await db.getPeople()
  const person = people[0]
  return db.createVolunteerSchedule({
    team_id: team.id,
    person_id: person.id,
    role: 'Lead Vocals',
    service_date: '2026-04-27',
    status: 'pending',
  })
}

async function makeEventRegistration() {
  const events = await db.getEvents()
  const event = events[0]
  const people = await db.getPeople()
  const person = people[0]
  return db.createEventRegistration({
    event_id: event.id,
    person_id: person.id,
    status: 'registered',
    registered_at: new Date().toISOString(),
  })
}

async function makeGroupMember() {
  const groups = await db.getGroups()
  const group = groups[0]
  const people = await db.getPeople()
  const person = people[1] // use second person to avoid duplicate
  return db.addGroupMember({
    group_id: group.id,
    person_id: person.id,
    role: 'member',
    status: 'waitlisted',
    joined_at: new Date().toISOString(),
  })
}

// ── URL helpers ───────────────────────────────────────────────────────────────

describe('confirmUrl / declineUrl', () => {
  it('includes the token and action=confirm', () => {
    const url = confirmUrl('abc-123')
    expect(url).toContain('token=abc-123')
    expect(url).toContain('action=confirm')
  })

  it('includes the token and action=decline', () => {
    const url = declineUrl('abc-123')
    expect(url).toContain('token=abc-123')
    expect(url).toContain('action=decline')
  })

  it('confirm and decline URLs differ only in action', () => {
    const token = 'xyz-789'
    const c = confirmUrl(token)
    const d = declineUrl(token)
    expect(c.replace('action=confirm', '')).toBe(d.replace('action=decline', ''))
  })
})

// ── Token creation ────────────────────────────────────────────────────────────

describe('createVolunteerConfirmToken', () => {
  it('creates a token with purpose=volunteer', async () => {
    const schedule = await makeVolunteerSchedule()
    const result = await createVolunteerConfirmToken({
      person_id: schedule.person_id,
      schedule_id: schedule.id,
      role: 'Lead Vocals',
      service_date: '2026-04-27',
      church_name: 'Test Church',
    })
    expect(result.token.purpose).toBe('volunteer')
    expect(result.token.reference_id).toBe(schedule.id)
    expect(result.token.role).toBe('Lead Vocals')
    expect(result.token.service_date).toBe('2026-04-27')
    expect(result.token.church_name).toBe('Test Church')
    expect(result.token.token).toBeTruthy()
    expect(result.token.expires_at).toBeTruthy()
  })

  it('returns confirmUrl and declineUrl containing the token', async () => {
    const schedule = await makeVolunteerSchedule()
    const result = await createVolunteerConfirmToken({
      person_id: schedule.person_id,
      schedule_id: schedule.id,
    })
    expect(result.confirmUrl).toContain(result.token.token)
    expect(result.confirmUrl).toContain('action=confirm')
    expect(result.declineUrl).toContain(result.token.token)
    expect(result.declineUrl).toContain('action=decline')
  })

  it('sets expiry 7 days in the future', async () => {
    const before = Date.now()
    const schedule = await makeVolunteerSchedule()
    const result = await createVolunteerConfirmToken({
      person_id: schedule.person_id,
      schedule_id: schedule.id,
    })
    const expiresAt = new Date(result.token.expires_at).getTime()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    expect(expiresAt).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000)
    expect(expiresAt).toBeLessThanOrEqual(before + sevenDaysMs + 1000)
  })

  it('generates a unique token string each call', async () => {
    const schedule = await makeVolunteerSchedule()
    const opts = { person_id: schedule.person_id, schedule_id: schedule.id }
    const a = await createVolunteerConfirmToken(opts)
    const b = await createVolunteerConfirmToken(opts)
    expect(a.token.token).not.toBe(b.token.token)
  })
})

describe('createEventConfirmToken', () => {
  it('creates a token with purpose=event', async () => {
    const reg = await makeEventRegistration()
    const result = await createEventConfirmToken({
      person_id: reg.person_id,
      registration_id: reg.id,
      event_name: 'Fall Retreat',
      church_name: 'Test Church',
    })
    expect(result.token.purpose).toBe('event')
    expect(result.token.reference_id).toBe(reg.id)
    expect(result.token.event_name).toBe('Fall Retreat')
  })
})

describe('createGroupWaitlistConfirmToken', () => {
  it('creates a token with purpose=group_waitlist', async () => {
    const member = await makeGroupMember()
    const result = await createGroupWaitlistConfirmToken({
      person_id: member.person_id,
      group_member_id: member.id,
      group_name: 'Young Adults',
    })
    expect(result.token.purpose).toBe('group_waitlist')
    expect(result.token.reference_id).toBe(member.id)
    expect(result.token.group_name).toBe('Young Adults')
  })
})

// ── Token resolution ──────────────────────────────────────────────────────────

describe('resolveConfirmationToken', () => {
  describe('volunteer — confirm', () => {
    it('returns ok:true with action=confirm', async () => {
      const schedule = await makeVolunteerSchedule()
      const { token } = await createVolunteerConfirmToken({
        person_id: schedule.person_id,
        schedule_id: schedule.id,
      })
      const result = await resolveConfirmationToken(token.token, 'confirm')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.action).toBe('confirm')
        expect(result.token.used_action).toBe('confirm')
        expect(result.token.used_at).toBeTruthy()
      }
    })

    it('updates VolunteerSchedule status to confirmed', async () => {
      const schedule = await makeVolunteerSchedule()
      const { token } = await createVolunteerConfirmToken({
        person_id: schedule.person_id,
        schedule_id: schedule.id,
      })
      await resolveConfirmationToken(token.token, 'confirm')
      const updated = await db.getVolunteerSchedule(undefined, schedule.person_id)
      const entry = updated.find(s => s.id === schedule.id)
      expect(entry?.status).toBe('confirmed')
    })
  })

  describe('volunteer — decline', () => {
    it('updates VolunteerSchedule status to declined', async () => {
      const schedule = await makeVolunteerSchedule()
      const { token } = await createVolunteerConfirmToken({
        person_id: schedule.person_id,
        schedule_id: schedule.id,
      })
      await resolveConfirmationToken(token.token, 'decline')
      const updated = await db.getVolunteerSchedule(undefined, schedule.person_id)
      const entry = updated.find(s => s.id === schedule.id)
      expect(entry?.status).toBe('declined')
    })
  })

  describe('event — confirm', () => {
    it('updates EventRegistration status to registered', async () => {
      const reg = await makeEventRegistration()
      const { token } = await createEventConfirmToken({
        person_id: reg.person_id,
        registration_id: reg.id,
      })
      await resolveConfirmationToken(token.token, 'confirm')
      const events = await db.getEvents()
      const all = await db.getEventRegistrations(events[0].id)
      const entry = all.find(r => r.id === reg.id)
      expect(entry?.status).toBe('registered')
    })
  })

  describe('event — decline', () => {
    it('updates EventRegistration status to cancelled', async () => {
      const reg = await makeEventRegistration()
      const { token } = await createEventConfirmToken({
        person_id: reg.person_id,
        registration_id: reg.id,
      })
      await resolveConfirmationToken(token.token, 'decline')
      const events = await db.getEvents()
      const all = await db.getEventRegistrations(events[0].id)
      const entry = all.find(r => r.id === reg.id)
      expect(entry?.status).toBe('cancelled')
    })
  })

  describe('group waitlist — confirm', () => {
    it('updates GroupMember status to active', async () => {
      const member = await makeGroupMember()
      const { token } = await createGroupWaitlistConfirmToken({
        person_id: member.person_id,
        group_member_id: member.id,
      })
      await resolveConfirmationToken(token.token, 'confirm')
      const groups = await db.getGroups()
      const all = await db.getGroupMembers(groups[0].id)
      const entry = all.find(m => m.id === member.id)
      expect(entry?.status).toBe('active')
    })
  })

  describe('group waitlist — decline', () => {
    it('updates GroupMember status to inactive', async () => {
      const member = await makeGroupMember()
      const { token } = await createGroupWaitlistConfirmToken({
        person_id: member.person_id,
        group_member_id: member.id,
      })
      await resolveConfirmationToken(token.token, 'decline')
      const groups = await db.getGroups()
      const all = await db.getGroupMembers(groups[0].id)
      const entry = all.find(m => m.id === member.id)
      expect(entry?.status).toBe('inactive')
    })
  })

  describe('token not found', () => {
    it('returns ok:false with reason=not_found for unknown token', async () => {
      const result = await resolveConfirmationToken('does-not-exist', 'confirm')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('not_found')
      }
    })
  })

  describe('token already used', () => {
    it('returns ok:false with reason=already_used on second use', async () => {
      const schedule = await makeVolunteerSchedule()
      const { token } = await createVolunteerConfirmToken({
        person_id: schedule.person_id,
        schedule_id: schedule.id,
      })
      // Use it the first time
      await resolveConfirmationToken(token.token, 'confirm')
      // Use it again
      const result = await resolveConfirmationToken(token.token, 'confirm')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('already_used')
      }
    })
  })

  describe('token expiry', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns ok:false with reason=expired for a past-expiry token', async () => {
      // Create a token with a past expiry by manipulating Date
      vi.useFakeTimers()
      const now = new Date('2026-04-16T12:00:00Z')
      vi.setSystemTime(now)

      const schedule = await makeVolunteerSchedule()
      const { token } = await createVolunteerConfirmToken({
        person_id: schedule.person_id,
        schedule_id: schedule.id,
      })

      // Advance time 8 days (past 7-day expiry)
      vi.setSystemTime(new Date('2026-04-24T12:00:00Z'))

      const result = await resolveConfirmationToken(token.token, 'confirm')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('expired')
      }
    })

    it('resolves successfully just before the expiry window', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-04-16T12:00:00Z'))

      const schedule = await makeVolunteerSchedule()
      const { token } = await createVolunteerConfirmToken({
        person_id: schedule.person_id,
        schedule_id: schedule.id,
      })

      // Advance 6 days and 23 hours — still within the 7-day window
      vi.setSystemTime(new Date('2026-04-23T11:00:00Z'))

      const result = await resolveConfirmationToken(token.token, 'confirm')
      expect(result.ok).toBe(true)
    })
  })

  describe('single-use guarantee', () => {
    it('a declined token cannot be re-used to confirm', async () => {
      const schedule = await makeVolunteerSchedule()
      const { token } = await createVolunteerConfirmToken({
        person_id: schedule.person_id,
        schedule_id: schedule.id,
      })
      await resolveConfirmationToken(token.token, 'decline')
      const result = await resolveConfirmationToken(token.token, 'confirm')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('already_used')
      }
      // Status should still be declined (not overwritten)
      const updated = await db.getVolunteerSchedule(undefined, schedule.person_id)
      const entry = updated.find(s => s.id === schedule.id)
      expect(entry?.status).toBe('declined')
    })
  })
})
