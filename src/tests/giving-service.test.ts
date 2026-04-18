import { describe, it, expect, beforeEach } from 'vitest'
import {
  getGivingRecords,
  createGivingRecord,
  updateGivingRecord,
  deleteGivingRecord,
  computeGivingSummary,
  getAnnualGivingStatement,
  parseGivingCsv,
  commitGivingImport,
  formatCurrency,
  formatMethod,
} from '@/features/giving/giving-service'
import { db } from '@/services'
import type { GivingRecord } from '@/shared/types'

// ── helpers ───────────────────────────────────────────────────────────────────

async function getFirstPerson() {
  const people = await db.getPeople()
  return people.find(p => !p.is_child && p.is_active)!
}

async function getSecondPerson() {
  const people = await db.getPeople()
  return people.filter(p => !p.is_child && p.is_active)[1]
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

describe('createGivingRecord', () => {
  it('creates a record with the provided fields', async () => {
    const person = await getFirstPerson()
    const record = await createGivingRecord({
      personId: person.id,
      amount: 150,
      date: '2026-04-06',
      method: 'check',
      fund: 'General',
    })
    expect(record.person_id).toBe(person.id)
    expect(record.amount).toBe(150)
    expect(record.date).toBe('2026-04-06')
    expect(record.method).toBe('check')
    expect(record.fund).toBe('General')
    expect(record.source).toBe('manual')
    expect(record.id).toBeTruthy()
  })

  it('defaults source to "manual"', async () => {
    const person = await getFirstPerson()
    const record = await createGivingRecord({ personId: person.id, amount: 50, date: '2026-04-06', method: 'cash', fund: 'Missions' })
    expect(record.source).toBe('manual')
  })

  it('stores optional notes', async () => {
    const person = await getFirstPerson()
    const record = await createGivingRecord({ personId: person.id, amount: 200, date: '2026-04-06', method: 'check', fund: 'General', notes: 'check #1042' })
    expect(record.notes).toBe('check #1042')
  })
})

describe('getGivingRecords', () => {
  it('returns records sorted newest-first', async () => {
    const person = await getFirstPerson()
    await createGivingRecord({ personId: person.id, amount: 10, date: '2026-01-01', method: 'cash', fund: 'General' })
    await createGivingRecord({ personId: person.id, amount: 20, date: '2026-03-01', method: 'cash', fund: 'General' })
    await createGivingRecord({ personId: person.id, amount: 30, date: '2026-02-01', method: 'cash', fund: 'General' })

    const records = await getGivingRecords(person.id)
    const dates = records.filter(r => r.person_id === person.id).map(r => r.date)
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1] >= dates[i]).toBe(true)
    }
  })

  it('filters by personId when provided', async () => {
    const a = await getFirstPerson()
    const b = await getSecondPerson()
    await createGivingRecord({ personId: a.id, amount: 100, date: '2026-04-06', method: 'cash', fund: 'General' })
    await createGivingRecord({ personId: b.id, amount: 200, date: '2026-04-06', method: 'check', fund: 'General' })

    const aRecords = await getGivingRecords(a.id)
    expect(aRecords.every(r => r.person_id === a.id)).toBe(true)
  })

  it('returns all church records when no personId given', async () => {
    const records = await getGivingRecords()
    expect(records.length).toBeGreaterThan(0)
  })
})

describe('updateGivingRecord', () => {
  it('updates the amount', async () => {
    const person = await getFirstPerson()
    const record = await createGivingRecord({ personId: person.id, amount: 75, date: '2026-04-06', method: 'cash', fund: 'General' })
    const updated = await updateGivingRecord(record.id, { amount: 100 })
    expect(updated.amount).toBe(100)
  })

  it('updates the fund', async () => {
    const person = await getFirstPerson()
    const record = await createGivingRecord({ personId: person.id, amount: 50, date: '2026-04-06', method: 'cash', fund: 'General' })
    const updated = await updateGivingRecord(record.id, { fund: 'Missions' })
    expect(updated.fund).toBe('Missions')
  })
})

describe('deleteGivingRecord', () => {
  it('removes the record', async () => {
    const person = await getFirstPerson()
    const record = await createGivingRecord({ personId: person.id, amount: 50, date: '2026-04-06', method: 'cash', fund: 'General' })
    await deleteGivingRecord(record.id)
    const records = await getGivingRecords(person.id)
    expect(records.find(r => r.id === record.id)).toBeUndefined()
  })
})

// ── computeGivingSummary ──────────────────────────────────────────────────────

describe('computeGivingSummary', () => {
  const thisYear = new Date().getFullYear()

  const sampleRecords: GivingRecord[] = [
    { id: '1', church_id: 'c1', person_id: 'p1', amount: 500, date: `${thisYear}-01-15`, method: 'check', fund: 'General', source: 'manual' },
    { id: '2', church_id: 'c1', person_id: 'p1', amount: 200, date: `${thisYear}-01-22`, method: 'cash', fund: 'Missions', source: 'manual' },
    { id: '3', church_id: 'c1', person_id: 'p1', amount: 300, date: `${thisYear}-03-05`, method: 'check', fund: 'General', source: 'manual' },
    { id: '4', church_id: 'c1', person_id: 'p2', amount: 1000, date: `${thisYear - 1}-12-20`, method: 'online_card', fund: 'Building', source: 'manual' },
  ]

  it('computes YTD from current year only', () => {
    const summary = computeGivingSummary(sampleRecords)
    expect(summary.ytd).toBe(1000) // 500 + 200 + 300
  })

  it('includes 12 monthly buckets', () => {
    const summary = computeGivingSummary(sampleRecords)
    expect(summary.monthlyTotals).toHaveLength(12)
  })

  it('month buckets sum correctly', () => {
    const summary = computeGivingSummary(sampleRecords)
    const jan = summary.monthlyTotals.find(m => m.month.endsWith('-01'))
    expect(jan?.total).toBe(700) // 500 + 200
  })

  it('fund breakdown contains all funds', () => {
    const summary = computeGivingSummary(sampleRecords)
    const funds = summary.fundBreakdown.map(f => f.fund)
    expect(funds).toContain('General')
    expect(funds).toContain('Missions')
    expect(funds).toContain('Building')
  })

  it('fund breakdown percentages add up to 100', () => {
    const summary = computeGivingSummary(sampleRecords)
    const total = summary.fundBreakdown.reduce((sum, f) => sum + f.pct, 0)
    // Allow 1% rounding slop
    expect(total).toBeGreaterThanOrEqual(99)
    expect(total).toBeLessThanOrEqual(101)
  })

  it('fund breakdown sorted descending by total', () => {
    const summary = computeGivingSummary(sampleRecords)
    for (let i = 1; i < summary.fundBreakdown.length; i++) {
      expect(summary.fundBreakdown[i - 1].total).toBeGreaterThanOrEqual(summary.fundBreakdown[i].total)
    }
  })

  it('handles empty records', () => {
    const summary = computeGivingSummary([])
    expect(summary.ytd).toBe(0)
    expect(summary.totalRecords).toBe(0)
    expect(summary.fundBreakdown).toHaveLength(0)
  })
})

// ── getAnnualGivingStatement ──────────────────────────────────────────────────

describe('getAnnualGivingStatement', () => {
  it('returns records for the requested year only', async () => {
    const person = await getFirstPerson()
    await createGivingRecord({ personId: person.id, amount: 100, date: '2025-06-01', method: 'cash', fund: 'General' })
    await createGivingRecord({ personId: person.id, amount: 200, date: '2026-01-15', method: 'check', fund: 'Missions' })

    const stmt = await getAnnualGivingStatement(person.id, 2025)
    expect(stmt.records.every(r => r.date.startsWith('2025'))).toBe(true)
    expect(stmt.year).toBe(2025)
  })

  it('computes total correctly', async () => {
    const person = await getSecondPerson()
    await createGivingRecord({ personId: person.id, amount: 400, date: '2024-03-01', method: 'cash', fund: 'General' })
    await createGivingRecord({ personId: person.id, amount: 600, date: '2024-07-01', method: 'check', fund: 'Building' })

    const stmt = await getAnnualGivingStatement(person.id, 2024)
    const our2024 = stmt.records.filter(r => r.person_id === person.id)
    const total = our2024.reduce((s, r) => s + r.amount, 0)
    expect(total).toBeGreaterThanOrEqual(1000)
  })

  it('returns empty for year with no records', async () => {
    const person = await getFirstPerson()
    const stmt = await getAnnualGivingStatement(person.id, 2099)
    expect(stmt.records).toHaveLength(0)
    expect(stmt.total).toBe(0)
    expect(stmt.byFund).toHaveLength(0)
  })
})

// ── parseGivingCsv ────────────────────────────────────────────────────────────

describe('parseGivingCsv', () => {
  const PC_CSV = [
    'First Name,Last Name,Received Date,Amount,Fund Name,Payment Method,Notes',
    'Alice,Johnson,2026-03-02,$150.00,General,Check,',
    'Bob,Smith,03/09/2026,$250.50,Missions,Cash,Annual pledge',
    'Carol,Williams,2026-03-16,$1000.00,Building,Credit Card,',
  ].join('\n')

  it('parses valid rows', () => {
    const { rows, errors } = parseGivingCsv(PC_CSV)
    expect(rows).toHaveLength(3)
    expect(errors).toHaveLength(0)
  })

  it('parses name fields', () => {
    const { rows } = parseGivingCsv(PC_CSV)
    expect(rows[0].firstName).toBe('Alice')
    expect(rows[0].lastName).toBe('Johnson')
  })

  it('parses ISO date', () => {
    const { rows } = parseGivingCsv(PC_CSV)
    expect(rows[0].date).toBe('2026-03-02')
  })

  it('parses M/D/YYYY date format', () => {
    const { rows } = parseGivingCsv(PC_CSV)
    expect(rows[1].date).toBe('2026-03-09')
  })

  it('strips $ and , from amounts', () => {
    const { rows } = parseGivingCsv(PC_CSV)
    expect(rows[0].amount).toBe(150)
    expect(rows[1].amount).toBe(250.5)
    expect(rows[2].amount).toBe(1000)
  })

  it('maps fund name', () => {
    const { rows } = parseGivingCsv(PC_CSV)
    expect(rows[0].fund).toBe('General')
    expect(rows[1].fund).toBe('Missions')
    expect(rows[2].fund).toBe('Building')
  })

  it('maps payment methods', () => {
    const { rows } = parseGivingCsv(PC_CSV)
    expect(rows[0].method).toBe('check')
    expect(rows[1].method).toBe('cash')
    expect(rows[2].method).toBe('online_card')
  })

  it('parses optional notes', () => {
    const { rows } = parseGivingCsv(PC_CSV)
    expect(rows[1].notes).toBe('Annual pledge')
    expect(rows[0].notes).toBeUndefined()
  })

  it('reports error for invalid amount', () => {
    const csv = 'First Name,Last Name,Received Date,Amount,Fund Name,Payment Method\nBad,Row,2026-01-01,notanumber,General,Cash'
    const { rows, errors } = parseGivingCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('invalid amount')
  })

  it('reports error for invalid date', () => {
    const csv = 'First Name,Last Name,Received Date,Amount,Fund Name,Payment Method\nBad,Row,not-a-date,100,General,Cash'
    const { rows, errors } = parseGivingCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors[0]).toContain('invalid date')
  })

  it('returns empty result for header-only CSV', () => {
    const csv = 'First Name,Last Name,Received Date,Amount,Fund Name,Payment Method'
    const { rows } = parseGivingCsv(csv)
    expect(rows).toHaveLength(0)
  })

  it('handles quoted fields with commas', () => {
    const csv = 'First Name,Last Name,Received Date,Amount,Fund Name,Payment Method\nAlice,Jones,2026-01-05,"1,500.00","General, Tithe",Cash'
    const { rows, errors } = parseGivingCsv(csv)
    expect(errors).toHaveLength(0)
    expect(rows[0].amount).toBe(1500)
    expect(rows[0].fund).toBe('General, Tithe')
  })
})

describe('commitGivingImport', () => {
  it('creates records for matched people', async () => {
    const person = await getFirstPerson()
    const rows = [{
      firstName: person.first_name,
      lastName:  person.last_name,
      amount: 300,
      date: '2026-04-01',
      fund: 'General',
      method: 'check' as const,
    }]
    const { created, skipped } = await commitGivingImport(rows)
    expect(created).toBe(1)
    expect(skipped).toBe(0)
  })

  it('skips rows where name is not found', async () => {
    const rows = [{
      firstName: 'Totally',
      lastName:  'NotInDb',
      amount: 100,
      date: '2026-04-01',
      fund: 'General',
      method: 'cash' as const,
    }]
    const { created, skipped } = await commitGivingImport(rows)
    expect(created).toBe(0)
    expect(skipped).toBe(1)
  })

  it('sets source to "imported"', async () => {
    const person = await getSecondPerson()
    const rows = [{
      firstName: person.first_name,
      lastName:  person.last_name,
      amount: 75,
      date: '2026-04-01',
      fund: 'Missions',
      method: 'online_card' as const,
    }]
    await commitGivingImport(rows)
    const records = await getGivingRecords(person.id)
    const imported = records.find(r => r.source === 'imported' && r.amount === 75)
    expect(imported).toBeDefined()
  })
})

// ── Formatting helpers ────────────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('formats whole dollars', () => {
    expect(formatCurrency(100)).toBe('$100.00')
  })

  it('formats cents', () => {
    expect(formatCurrency(99.99)).toBe('$99.99')
  })

  it('formats large amounts with comma separator', () => {
    expect(formatCurrency(1500)).toBe('$1,500.00')
  })
})

describe('formatMethod', () => {
  it('formats each method', () => {
    expect(formatMethod('cash')).toBe('Cash')
    expect(formatMethod('check')).toBe('Check')
    expect(formatMethod('online_card')).toBe('Credit/Debit Card')
    expect(formatMethod('online_ach')).toBe('Bank Transfer (ACH)')
  })
})
