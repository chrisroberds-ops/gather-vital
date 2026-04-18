// ── Confirmation Token Service ────────────────────────────────────────────────
// Generates and resolves single-use confirmation tokens for volunteer schedule,
// event registration, and group waitlist emails.
//
// Token lifecycle:
//   1. Call createVolunteerConfirmToken / createEventConfirmToken / createGroupWaitlistConfirmToken
//      to generate a token and get the confirm/decline URLs.
//   2. Embed the URLs in an outbound email.
//   3. When recipient clicks a URL, the /confirm route calls resolveConfirmationToken()
//      which validates, marks the token used, and performs the DB action.

import { v4 as uuidv4 } from 'uuid'
import type { ConfirmationToken, ConfirmationPurpose } from '@/shared/types'

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// ── Token URL helpers ─────────────────────────────────────────────────────────

function getOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
}

export function confirmUrl(token: string): string {
  return `${getOrigin()}/confirm?token=${token}&action=confirm`
}

export function declineUrl(token: string): string {
  return `${getOrigin()}/confirm?token=${token}&action=decline`
}

// ── Creation helpers ──────────────────────────────────────────────────────────

async function createToken(
  data: Omit<ConfirmationToken, 'id' | 'church_id' | 'token' | 'expires_at' | 'used_at' | 'used_action'>,
): Promise<ConfirmationToken> {
  const { db } = await import('@/services')
  const token = uuidv4()
  const expires_at = new Date(Date.now() + TOKEN_TTL_MS).toISOString()
  return db.createConfirmationToken({ ...data, token, expires_at })
}

export async function createVolunteerConfirmToken(opts: {
  person_id: string
  schedule_id: string
  role?: string
  service_date?: string
  church_name?: string
}): Promise<{ token: ConfirmationToken; confirmUrl: string; declineUrl: string }> {
  const token = await createToken({
    person_id: opts.person_id,
    reference_id: opts.schedule_id,
    purpose: 'volunteer' as ConfirmationPurpose,
    role: opts.role,
    service_date: opts.service_date,
    church_name: opts.church_name,
  })
  return { token, confirmUrl: confirmUrl(token.token), declineUrl: declineUrl(token.token) }
}

export async function createEventConfirmToken(opts: {
  person_id: string
  registration_id: string
  event_name?: string
  church_name?: string
}): Promise<{ token: ConfirmationToken; confirmUrl: string; declineUrl: string }> {
  const token = await createToken({
    person_id: opts.person_id,
    reference_id: opts.registration_id,
    purpose: 'event' as ConfirmationPurpose,
    event_name: opts.event_name,
    church_name: opts.church_name,
  })
  return { token, confirmUrl: confirmUrl(token.token), declineUrl: declineUrl(token.token) }
}

export async function createGroupWaitlistConfirmToken(opts: {
  person_id: string
  group_member_id: string
  group_name?: string
  church_name?: string
}): Promise<{ token: ConfirmationToken; confirmUrl: string; declineUrl: string }> {
  const token = await createToken({
    person_id: opts.person_id,
    reference_id: opts.group_member_id,
    purpose: 'group_waitlist' as ConfirmationPurpose,
    group_name: opts.group_name,
    church_name: opts.church_name,
  })
  return { token, confirmUrl: confirmUrl(token.token), declineUrl: declineUrl(token.token) }
}

// ── Resolution ────────────────────────────────────────────────────────────────

export type ConfirmResult =
  | { ok: true; token: ConfirmationToken; action: 'confirm' | 'decline' }
  | { ok: false; reason: 'not_found' | 'expired' | 'already_used' }

/**
 * Validate a token, mark it used, and perform the DB action (update the
 * related record's status).  Safe to call from a public route — no auth
 * required; the token string IS the authentication.
 */
export async function resolveConfirmationToken(
  tokenString: string,
  action: 'confirm' | 'decline',
): Promise<ConfirmResult> {
  const { db } = await import('@/services')

  const record = await db.getConfirmationToken(tokenString)

  if (!record) {
    return { ok: false, reason: 'not_found' }
  }

  if (record.used_at) {
    return { ok: false, reason: 'already_used' }
  }

  if (new Date(record.expires_at) < new Date()) {
    return { ok: false, reason: 'expired' }
  }

  // Mark the token as used
  const used = await db.useConfirmationToken(tokenString, action)

  // Perform the business action based on purpose
  try {
    if (record.purpose === 'volunteer') {
      await db.updateVolunteerSchedule(record.reference_id, {
        status: action === 'confirm' ? 'confirmed' : 'declined',
      })
    } else if (record.purpose === 'event') {
      await db.updateEventRegistration(record.reference_id, {
        status: action === 'confirm' ? 'registered' : 'cancelled',
      })
    } else if (record.purpose === 'group_waitlist') {
      await db.updateGroupMember(record.reference_id, {
        status: action === 'confirm' ? 'active' : 'inactive',
      })
    }
  } catch {
    // If the referenced record no longer exists, still return ok — the token
    // action is recorded and the user sees the result page.
  }

  return { ok: true, token: used, action }
}
