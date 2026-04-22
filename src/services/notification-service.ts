// ── Notification Service ──────────────────────────────────────────────────────
// In TEST_MODE: all sends are logged to the console. No external calls are made.
//
// Email (production):
//   Provider is configured per-church via AppConfig.email_provider.
//
//   Resend (default): Set resend_api_key in AppConfig or fall back to
//   VITE_RESEND_API_KEY env var. Calls api.resend.com directly from the browser.
//
//   Gmail SMTP: Cannot be called from the browser (no raw sockets). Credentials
//   are stored in AppConfig so an admin can configure them, but actual sending
//   requires a server-side proxy. Until one is wired up, Gmail sends are skipped
//   with a console.warn — they do NOT throw (same pattern as Twilio SMS).
//
// SMS (production):
//   Twilio requires server-side credentials. Wire it up via a backend function
//   and call it here, or use a service like Resend SMS.
//   Until then, sendSMS logs a console.warn — it does NOT throw.
//
// Merge fields:
//   Use {first_name}, {last_name}, {church_name}, {service_date}, {role},
//   {event_name}, {group_name} in subject/body templates.  Call replaceMergeFields()
//   before passing to sendEmail().

const IS_TEST = import.meta.env.VITE_TEST_MODE === 'true'
const RESEND_API_KEY_ENV = import.meta.env.VITE_RESEND_API_KEY as string | undefined
const RESEND_FROM = (import.meta.env.VITE_RESEND_FROM as string | undefined) ?? 'Gather <notifications@example.com>'

// Lazy log helper — avoids circular dep; fire-and-forget, never throws
async function logNotification(entry: {
  person_id?: string
  channel: 'email' | 'sms'
  subject: string
  recipient: string
  success: boolean
  error_message?: string
}): Promise<void> {
  try {
    const { db } = await import('@/services')
    await db.createCommunicationsLogEntry(entry)
  } catch {
    // Logging must never break the notification flow
  }
}

// ── Merge fields ──────────────────────────────────────────────────────────────

/** All supported merge field tokens. */
export const MERGE_FIELDS = [
  { token: '{first_name}',   description: 'Recipient\'s first name' },
  { token: '{last_name}',    description: 'Recipient\'s last name' },
  { token: '{church_name}',  description: 'Church name from settings' },
  { token: '{service_date}', description: 'Date of the scheduled service (volunteers)' },
  { token: '{role}',         description: 'Volunteer role or team position' },
  { token: '{event_name}',   description: 'Name of the event (event emails)' },
  { token: '{group_name}',   description: 'Name of the group (group emails)' },
] as const

export type MergeFieldContext = {
  first_name?: string
  last_name?: string
  church_name?: string
  service_date?: string
  role?: string
  event_name?: string
  group_name?: string
}

/**
 * Replace merge field tokens in a template string.
 * Unknown tokens are left as-is; missing context values are replaced with an
 * empty string so the email still sends without breaking.
 */
export function replaceMergeFields(template: string, ctx: MergeFieldContext): string {
  return template
    .replace(/\{first_name\}/g,   ctx.first_name   ?? '')
    .replace(/\{last_name\}/g,    ctx.last_name     ?? '')
    .replace(/\{church_name\}/g,  ctx.church_name   ?? '')
    .replace(/\{service_date\}/g, ctx.service_date  ?? '')
    .replace(/\{role\}/g,         ctx.role          ?? '')
    .replace(/\{event_name\}/g,   ctx.event_name    ?? '')
    .replace(/\{group_name\}/g,   ctx.group_name    ?? '')
}

// ── Payloads ──────────────────────────────────────────────────────────────────

export interface SmsPayload {
  to: string       // E.164 or any normalised phone string
  body: string
  personId?: string
}

export interface EmailPayload {
  to: string       // recipient address
  subject: string
  body: string     // plain-text body
  personId?: string
  logoUrl?: string // if set, included as an image in the HTML email header
}

// ── HTML builder ──────────────────────────────────────────────────────────────

/** Builds a minimal HTML email body with an optional logo header. */
function buildHtmlBody(body: string, logoUrl: string): string {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
  return (
    '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">' +
    `<div style="text-align:center;margin-bottom:24px">` +
    `<img src="${logoUrl}" alt="" style="max-height:60px;max-width:200px;object-fit:contain" />` +
    `</div><div>${escaped}</div></body></html>`
  )
}

// ── Provider helpers ──────────────────────────────────────────────────────────

async function sendViaResend(
  payload: EmailPayload,
  apiKey: string,
  from: string,
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [payload.to],
      subject: payload.subject,
      text: payload.body,
      ...(payload.logoUrl ? { html: buildHtmlBody(payload.body, payload.logoUrl) } : {}),
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    await logNotification({
      person_id: payload.personId,
      channel: 'email',
      subject: payload.subject,
      recipient: payload.to,
      success: false,
      error_message: detail,
    })
    throw new Error(`Resend API error ${res.status}: ${detail}`)
  }
  await logNotification({ person_id: payload.personId, channel: 'email', subject: payload.subject, recipient: payload.to, success: true })
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function sendSMS({ to, body, personId }: SmsPayload): Promise<void> {
  if (IS_TEST) {
    console.log('[notification-service] SMS →', { to, body })
    await logNotification({ person_id: personId, channel: 'sms', subject: body.slice(0, 100), recipient: to, success: true })
    return
  }
  // Twilio must be called server-side. Log a warning and continue — do not throw,
  // so the calling operation (e.g. waitlist promotion) still completes.
  console.warn(
    '[notification-service] SMS not sent — wire up a server-side Twilio proxy ' +
    'and call it here. Set VITE_TWILIO_PROXY_URL in .env.local.',
    { to },
  )
  await logNotification({ person_id: personId, channel: 'sms', subject: body.slice(0, 100), recipient: to, success: false, error_message: 'SMS not configured — see server-side proxy' })
}

export async function sendEmail(
  { to, subject, body, personId, logoUrl }: EmailPayload,
  options?: { skipLog?: boolean },
): Promise<void> {
  const skipLog = options?.skipLog ?? false
  if (IS_TEST) {
    console.log('[notification-service] Email →', { to, subject, body })
    if (!skipLog) await logNotification({ person_id: personId, channel: 'email', subject, recipient: to, success: true })
    return
  }

  // Read provider config from AppConfig (lazy import to avoid circular dep)
  let provider: 'gmail' | 'resend' = 'resend'
  let gmailAddress: string | undefined
  let resendKey: string | undefined = RESEND_API_KEY_ENV
  try {
    const { db } = await import('@/services')
    const cfg = await db.getAppConfig()
    provider = cfg.email_provider ?? 'resend'
    gmailAddress = cfg.gmail_address
    if (cfg.resend_api_key) resendKey = cfg.resend_api_key
  } catch {
    // If config lookup fails, fall through to env var defaults
  }

  if (provider === 'gmail') {
    // Gmail SMTP cannot be called from the browser (no raw socket access).
    // An admin can configure credentials via Settings → Email, but sending
    // requires a server-side proxy. Log a warning and continue — do not throw.
    console.warn(
      '[notification-service] Gmail SMTP not sent — wire up a server-side SMTP proxy ' +
      'and call it here. Gmail credentials are stored in AppConfig.',
      { to, from: gmailAddress },
    )
    if (!skipLog) await logNotification({ person_id: personId, channel: 'email', subject, recipient: to, success: false, error_message: 'Gmail SMTP requires server-side proxy' })
    return
  }

  // Resend provider
  if (!resendKey) {
    console.warn(
      '[notification-service] Email not sent — no Resend API key configured. ' +
      'Set resend_api_key in Settings → Email or add VITE_RESEND_API_KEY to .env.local.',
      { to, subject },
    )
    if (!skipLog) await logNotification({ person_id: personId, channel: 'email', subject, recipient: to, success: false, error_message: 'Resend API key not set' })
    return
  }

  const fromAddr = gmailAddress ? `${gmailAddress}` : RESEND_FROM
  await sendViaResend({ to, subject, body, personId, logoUrl }, resendKey, fromAddr)
}
