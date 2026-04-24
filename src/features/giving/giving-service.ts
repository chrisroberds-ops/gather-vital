import { db } from '@/services'
import type {
  GivingRecord,
  GivingMethod,
  GivingSource,
  GivingFrequency,
  RecurringSubscription,
  RecurringSubscriptionStatus,
} from '@/shared/types'

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function getGivingRecords(personId?: string): Promise<GivingRecord[]> {
  const records = await db.getGivingRecords(personId)
  return records.sort((a, b) => b.date.localeCompare(a.date))
}

export async function createGivingRecord(data: {
  personId: string
  amount: number
  date: string
  method: GivingMethod
  fund: string
  source?: GivingSource
  transactionId?: string
  notes?: string
  frequency?: GivingFrequency
  is_online?: boolean
  stripe_payment_intent_id?: string
  stripe_customer_id?: string
  stripe_subscription_id?: string
}): Promise<GivingRecord> {
  return db.createGivingRecord({
    person_id: data.personId,
    amount: data.amount,
    date: data.date,
    method: data.method,
    fund: data.fund,
    source: data.source ?? 'manual',
    transaction_id: data.transactionId,
    notes: data.notes,
    frequency: data.frequency,
    is_online: data.is_online,
    stripe_payment_intent_id: data.stripe_payment_intent_id,
    stripe_customer_id: data.stripe_customer_id,
    stripe_subscription_id: data.stripe_subscription_id,
  })
}

/**
 * Create an online giving record submitted via the /embed/giving form.
 * In TEST_MODE: skips all Stripe API calls, creates the record directly.
 * In production: Stripe calls are handled server-side; this is called from
 * the stripe-webhook handler after payment_intent.succeeded.
 */
export async function createOnlineGivingRecord(data: {
  personId: string
  amount: number
  fund: string
  frequency: GivingFrequency
  donorEmail?: string
  stripePaymentIntentId?: string
  stripeCustomerId?: string
  stripeSubscriptionId?: string
}): Promise<GivingRecord> {
  const isRecurring = data.frequency !== 'one_time'
  const method: GivingMethod = 'online_card'

  console.log('TODO [Stripe]: In production, verify payment via Stripe API before creating record.')
  console.log('Online giving record data:', {
    amount: data.amount,
    fund: data.fund,
    frequency: data.frequency,
    stripePaymentIntentId: data.stripePaymentIntentId ?? 'TEST_MODE',
  })

  return db.createGivingRecord({
    person_id: data.personId,
    amount: data.amount,
    date: new Date().toISOString().split('T')[0],
    method,
    fund: data.fund,
    source: 'stripe',
    frequency: data.frequency,
    is_online: true,
    stripe_payment_intent_id: data.stripePaymentIntentId,
    stripe_customer_id: data.stripeCustomerId,
    stripe_subscription_id: isRecurring ? data.stripeSubscriptionId : undefined,
  })
}

export async function updateGivingRecord(
  id: string,
  data: Partial<Omit<GivingRecord, 'id' | 'church_id'>>,
): Promise<GivingRecord> {
  return db.updateGivingRecord(id, data)
}

export async function deleteGivingRecord(id: string): Promise<void> {
  return db.deleteGivingRecord(id)
}

// ── Aggregates ────────────────────────────────────────────────────────────────

export interface GivingSummary {
  ytd: number
  monthlyTotals: { month: string; total: number }[]  // 'YYYY-MM', 12 months ending today
  fundBreakdown: { fund: string; total: number; pct: number }[]
  totalRecords: number
}

/**
 * Compute YTD total, last-12-months trend, and fund breakdown from a set of records.
 * Caller passes in the pre-fetched records so this is unit-testable without the DB.
 */
export function computeGivingSummary(records: GivingRecord[]): GivingSummary {
  const now = new Date()
  const yearStr = now.toISOString().slice(0, 4)

  // YTD
  const ytd = records
    .filter(r => r.date.startsWith(yearStr))
    .reduce((sum, r) => sum + r.amount, 0)

  // Last 12 months
  const monthlyMap = new Map<string, number>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyMap.set(key, 0)
  }
  for (const r of records) {
    const key = r.date.slice(0, 7)
    if (monthlyMap.has(key)) {
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + r.amount)
    }
  }
  const monthlyTotals = [...monthlyMap.entries()].map(([month, total]) => ({ month, total }))

  // Fund breakdown (all-time)
  const fundMap = new Map<string, number>()
  const grandTotal = records.reduce((sum, r) => sum + r.amount, 0)
  for (const r of records) {
    fundMap.set(r.fund, (fundMap.get(r.fund) ?? 0) + r.amount)
  }
  const fundBreakdown = [...fundMap.entries()]
    .map(([fund, total]) => ({ fund, total, pct: grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0 }))
    .sort((a, b) => b.total - a.total)

  return { ytd, monthlyTotals, fundBreakdown, totalRecords: records.length }
}

// ── Annual giving statement ───────────────────────────────────────────────────

export interface GivingStatement {
  personId: string
  year: number
  records: GivingRecord[]
  total: number
  byFund: { fund: string; total: number }[]
}

export async function getAnnualGivingStatement(personId: string, year: number): Promise<GivingStatement> {
  const all = await db.getGivingRecords(personId)
  const records = all
    .filter(r => r.date.startsWith(String(year)))
    .sort((a, b) => a.date.localeCompare(b.date))

  const total = records.reduce((sum, r) => sum + r.amount, 0)

  const fundMap = new Map<string, number>()
  for (const r of records) fundMap.set(r.fund, (fundMap.get(r.fund) ?? 0) + r.amount)
  const byFund = [...fundMap.entries()]
    .map(([fund, total]) => ({ fund, total }))
    .sort((a, b) => b.total - a.total)

  return { personId, year, records, total, byFund }
}

// ── Planning Center CSV import ────────────────────────────────────────────────

export interface GivingImportRow {
  personId?: string       // matched from name lookup
  firstName: string
  lastName: string
  amount: number
  date: string
  fund: string
  method: GivingMethod
  notes?: string
}

export interface GivingImportResult {
  rows: GivingImportRow[]
  errors: string[]
}

const PC_METHOD_MAP: Record<string, GivingMethod> = {
  'cash':            'cash',
  'check':           'check',
  'credit card':     'online_card',
  'debit card':      'online_card',
  'ach':             'online_ach',
  'online':          'online_card',
  'bank transfer':   'online_ach',
}

function normalizeMethod(raw: string): GivingMethod {
  return PC_METHOD_MAP[raw.toLowerCase().trim()] ?? 'cash'
}

/**
 * Parse a Planning Center Giving CSV export.
 *
 * Expected column headers (case-insensitive, partial match):
 *   First Name, Last Name, Received Date, Amount, Fund Name, Payment Method, Memo/Notes
 */
export function parseGivingCsv(csv: string): GivingImportResult {
  const lines = splitCsvRows(csv)
  if (lines.length < 2) return { rows: [], errors: ['CSV has no data rows.'] }

  const headerRaw = lines[0]
  const headers = parseCsvRow(headerRaw).map(h => h.toLowerCase().trim())

  function col(keywords: string[]): number {
    for (const kw of keywords) {
      const idx = headers.findIndex(h => h.includes(kw))
      if (idx !== -1) return idx
    }
    return -1
  }

  const firstNameCol = col(['first name', 'firstname', 'first'])
  const lastNameCol  = col(['last name', 'lastname', 'last'])
  const dateCol      = col(['received date', 'date'])
  const amountCol    = col(['amount'])
  const fundCol      = col(['fund'])
  const methodCol    = col(['payment method', 'method', 'tender'])
  const notesCol     = col(['memo', 'notes', 'note'])

  const errors: string[] = []
  const rows: GivingImportRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cells = parseCsvRow(line)
    const get = (idx: number) => (idx >= 0 ? (cells[idx] ?? '').trim() : '')

    const amountRaw = get(amountCol).replace(/[$,]/g, '')
    const amount = parseFloat(amountRaw)
    if (isNaN(amount) || amount <= 0) {
      errors.push(`Row ${i + 1}: invalid amount "${get(amountCol)}"`)
      continue
    }

    const date = normalizeDate(get(dateCol))
    if (!date) {
      errors.push(`Row ${i + 1}: invalid date "${get(dateCol)}"`)
      continue
    }

    rows.push({
      firstName: get(firstNameCol),
      lastName:  get(lastNameCol),
      amount,
      date,
      fund: get(fundCol) || 'General',
      method: normalizeMethod(get(methodCol)),
      notes: get(notesCol) || undefined,
    })
  }

  return { rows, errors }
}

/** Commit parsed import rows to the DB, looking up personId by name. */
export async function commitGivingImport(rows: GivingImportRow[]): Promise<{ created: number; skipped: number }> {
  const people = await db.getPeople()
  let created = 0
  let skipped = 0

  for (const row of rows) {
    // Try to match a person by first+last name (case-insensitive)
    const person = people.find(p =>
      p.first_name.toLowerCase() === row.firstName.toLowerCase() &&
      p.last_name.toLowerCase() === row.lastName.toLowerCase()
    )

    if (!person) {
      skipped++
      continue
    }

    await db.createGivingRecord({
      person_id: person.id,
      amount: row.amount,
      date: row.date,
      method: row.method,
      fund: row.fund,
      source: 'imported',
      notes: row.notes,
    })
    created++
  }

  return { created, skipped }
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

/** Split a CSV string into logical rows, respecting quoted newlines (RFC-4180). */
function splitCsvRows(csv: string): string[] {
  const rows: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i]
    if (ch === '"') {
      if (inQuotes && csv[i + 1] === '"') {
        current += '""' // escaped quote — preserve for parseCsvRow
        i++
      } else {
        inQuotes = !inQuotes
        current += ch // preserve quote so parseCsvRow can handle it
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && csv[i + 1] === '\n') i++
      if (current.trim()) rows.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) rows.push(current)
  return rows
}

/** Parse a single CSV row into cells. */
function parseCsvRow(row: string): string[] {
  const cells: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') { cell += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      cells.push(cell); cell = ''
    } else {
      cell += ch
    }
  }
  cells.push(cell)
  return cells
}

/** Normalise various date formats to YYYY-MM-DD. */
function normalizeDate(raw: string): string | null {
  if (!raw) return null
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  // MM/DD/YYYY or M/D/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) {
    const [, m, d, y] = mdy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // Try JS Date as last resort
  const d = new Date(raw)
  if (isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0]
}

// ── Recurring Subscriptions ───────────────────────────────────────────────────

export async function getRecurringSubscriptions(
  filter?: { status?: RecurringSubscriptionStatus },
): Promise<RecurringSubscription[]> {
  return db.getRecurringSubscriptions(filter)
}

export async function createRecurringSubscription(data: {
  personId: string
  amount: number
  frequency: GivingFrequency
  fundId: string
  donorName?: string
  donorEmail?: string
  stripeSubscriptionId?: string
  stripeCustomerId?: string
}): Promise<RecurringSubscription> {
  console.log('TODO [Stripe]: In production, create a Stripe Subscription before recording locally.')
  return db.createRecurringSubscription({
    person_id: data.personId,
    amount: data.amount,
    frequency: data.frequency,
    fund_id: data.fundId,
    status: 'active',
    donor_name: data.donorName,
    donor_email: data.donorEmail,
    stripe_subscription_id: data.stripeSubscriptionId,
    stripe_customer_id: data.stripeCustomerId,
  })
}

export async function cancelRecurringSubscription(id: string): Promise<RecurringSubscription> {
  console.log('TODO [Stripe]: In production, cancel Stripe Subscription via API before updating DB.')
  return db.cancelRecurringSubscription(id)
}

export function formatFrequency(freq: GivingFrequency): string {
  const map: Record<GivingFrequency, string> = {
    one_time:  'One-time',
    weekly:    'Weekly',
    bi_weekly: 'Bi-weekly',
    monthly:   'Monthly',
    annually:  'Annually',
  }
  return map[freq] ?? freq
}

// ── Formatting helpers ────────────────────────────────────────────────────────

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents)
}

export function formatMethod(method: GivingMethod): string {
  const map: Record<GivingMethod, string> = {
    cash: 'Cash',
    check: 'Check',
    online_card: 'Credit/Debit Card',
    online_ach: 'Bank Transfer (ACH)',
  }
  return map[method] ?? method
}
