/**
 * Print service — sends label print requests to the local DYMO print server.
 * In TEST_MODE, prints to the browser console instead.
 */

import type { Checkin, Person, CheckinSession } from '@/shared/types'

const isTestMode = import.meta.env.VITE_TEST_MODE === 'true'

export interface LabelData {
  childName: string
  grade?: string
  allergies?: string
  customField1?: string
  customField2?: string
  parentPhone: string
  pickupCode: string
  sessionDate: string
  sessionTime: string
}

export interface PrintRequest {
  kioskId: string
  checkinId: string
  childLabel: LabelData
  parentTag: LabelData
}

export function buildLabelData(
  child: Person,
  parent: Person,
  checkin: Checkin,
  session: CheckinSession,
  customField1Label?: string,
  customField2Label?: string,
): LabelData {
  return {
    childName: child.preferred_name
      ? `${child.preferred_name} ${child.last_name}`
      : `${child.first_name} ${child.last_name}`,
    grade: child.grade,
    allergies: child.allergies,
    customField1: child.custom_field_1
      ? `${customField1Label ?? 'Note 1'}: ${child.custom_field_1}`
      : undefined,
    customField2: child.custom_field_2
      ? `${customField2Label ?? 'Note 2'}: ${child.custom_field_2}`
      : undefined,
    parentPhone: parent.phone,
    pickupCode: checkin.pickup_code,
    sessionDate: session.date,
    sessionTime: session.service_time,
  }
}

function formatChildLabel(label: LabelData): string {
  const lines = [
    `┌─────────────────────────────┐`,
    `│  ${label.childName.toUpperCase().padEnd(27)}│`,
    label.grade ? `│  Grade: ${label.grade.padEnd(21)}│` : null,
    label.allergies ? `│  ⚠ ALLERGY: ${label.allergies.substring(0, 17).padEnd(17)}│` : null,
    label.customField1 ? `│  ${label.customField1.substring(0, 27).padEnd(27)}│` : null,
    label.customField2 ? `│  ${label.customField2.substring(0, 27).padEnd(27)}│` : null,
    `│  Parent Phone: ${label.parentPhone.padEnd(14)}│`,
    `│                             │`,
    `│  Code: ${label.pickupCode.padEnd(22)}│`,
    `│  ${label.sessionDate} • ${label.sessionTime.padEnd(10)}│`,
    `└─────────────────────────────┘`,
  ]
  return lines.filter(Boolean).join('\n')
}

function formatParentTag(label: LabelData): string {
  const childShort = label.childName.split(' ')[0] + ' ' + label.childName.split(' ').pop()![0] + '.'
  return [
    `┌─────────────────────────────┐`,
    `│  PARENT PICKUP              │`,
    `│  ${childShort} — Code: ${label.pickupCode.padEnd(13)}│`,
    `│  ${label.sessionDate.padEnd(27)}│`,
    `└─────────────────────────────┘`,
  ].join('\n')
}

async function printTestMode(req: PrintRequest): Promise<void> {
  console.group(`🖨 Print request [kiosk: ${req.kioskId}] — Check-in ${req.checkinId}`)
  console.log('\n--- CHILD LABEL ---\n' + formatChildLabel(req.childLabel))
  console.log('\n--- PARENT TAG ---\n' + formatParentTag(req.parentTag))
  console.groupEnd()
}

async function printProduction(req: PrintRequest): Promise<void> {
  const printServerUrl = import.meta.env.VITE_PRINT_SERVER_URL ?? 'http://localhost:3001'
  const res = await fetch(`${printServerUrl}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    throw new Error(`Print server returned ${res.status}: ${await res.text()}`)
  }
}

export async function printLabel(req: PrintRequest): Promise<void> {
  if (isTestMode) {
    await printTestMode(req)
  } else {
    await printProduction(req)
  }
}

// ── Checkout Slip ─────────────────────────────────────────────────────────────

export interface CheckoutSlipData {
  childName: string
  room: string
  pickupCode: string
  sessionName: string
}

export async function printCheckoutSlip(data: CheckoutSlipData): Promise<void> {
  if (isTestMode) {
    console.group(`🖨 Checkout slip — ${data.childName}`)
    console.log(`  Room:         ${data.room}`)
    console.log(`  Pickup code:  ${data.pickupCode}`)
    console.log(`  Session:      ${data.sessionName}`)
    console.groupEnd()
    return
  }

  // TODO: PRINTNODE — wire live PrintNode API call here.
  // Send a POST to the PrintNode jobs endpoint with the checkout slip rendered
  // as a ZPL or PDF template. See https://www.printnode.com/en/docs/api/curl
  // Note for iPad kiosks: iOS does not support direct USB printing.
  // iPad kiosks require a companion Windows/macOS/Linux machine running the
  // PrintNode client on the same network as the label printer.
}
