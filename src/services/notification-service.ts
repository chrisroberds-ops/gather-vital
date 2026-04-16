// ── Notification Service ──────────────────────────────────────────────────────
// In TEST_MODE: all sends are logged to the console. No external calls are made.
//
// Email (production):
//   Provider: Resend (https://resend.com) — 3,000 free emails/month.
//   Set VITE_RESEND_API_KEY and VITE_RESEND_FROM in your .env.local.
//   If VITE_RESEND_API_KEY is absent, the call is skipped with a console.warn
//   so that missing config never crashes the app.
//
//   ⚠ VITE_ prefix exposes the key in the browser bundle. For higher security,
//   proxy the Resend call through a Firebase Cloud Function or a server endpoint
//   and call that URL here instead.
//
// SMS (production):
//   Twilio requires server-side credentials (blast radius is too high for a
//   browser-exposed key). Wire Twilio up via a backend function and call it here,
//   or use a service like Resend SMS when they launch it.
//   Until then, sendSMS logs a console.warn in production — it does NOT throw,
//   so waitlist promotions still complete and only the SMS is silently skipped.

const IS_TEST = import.meta.env.VITE_TEST_MODE === 'true'
const RESEND_API_KEY = import.meta.env.VITE_RESEND_API_KEY as string | undefined
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

export async function sendEmail({ to, subject, body, personId, logoUrl }: EmailPayload): Promise<void> {
  if (IS_TEST) {
    console.log('[notification-service] Email →', { to, subject, body })
    await logNotification({ person_id: personId, channel: 'email', subject, recipient: to, success: true })
    return
  }

  if (!RESEND_API_KEY) {
    console.warn(
      '[notification-service] Email not sent — VITE_RESEND_API_KEY is not set. ' +
      'Add it to .env.local to enable transactional email.',
      { to, subject },
    )
    await logNotification({ person_id: personId, channel: 'email', subject, recipient: to, success: false, error_message: 'VITE_RESEND_API_KEY not set' })
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [to],
      subject,
      text: body,
      ...(logoUrl ? { html: buildHtmlBody(body, logoUrl) } : {}),
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    await logNotification({ person_id: personId, channel: 'email', subject, recipient: to, success: false, error_message: detail })
    throw new Error(`Resend API error ${res.status}: ${detail}`)
  }

  await logNotification({ person_id: personId, channel: 'email', subject, recipient: to, success: true })
}
