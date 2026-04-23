import { describe, it, expect } from 'vitest'
import {
  generateOccurrenceDates,
  buildSeriesData,
  DEFAULT_OCCURRENCES,
  MAX_OCCURRENCES,
  type RecurrencePattern,
} from '@/features/events/recurrence-service'
import { createRecurringSeries } from '@/features/events/event-service'
import { db } from '@/services'

// ── Helpers ───────────────────────────────────────────────────────────────────

function baseEventData(date: string, overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Event',
    event_date: date,
    registration_required: false,
    has_cost: false,
    is_active: true,
    ...overrides,
  }
}

// ── generateOccurrenceDates — none ────────────────────────────────────────────

describe('generateOccurrenceDates — none', () => {
  it('returns empty array for pattern=none regardless of count', () => {
    expect(generateOccurrenceDates('2026-04-27', 'none', 8)).toHaveLength(0)
    expect(generateOccurrenceDates('2026-04-27', 'none', 1)).toHaveLength(0)
    expect(generateOccurrenceDates('2026-04-27', 'none', 26)).toHaveLength(0)
  })

  it('returns empty array when count=1 (no subsequent occurrences)', () => {
    expect(generateOccurrenceDates('2026-04-27', 'weekly', 1)).toHaveLength(0)
    expect(generateOccurrenceDates('2026-04-27', 'biweekly', 1)).toHaveLength(0)
    expect(generateOccurrenceDates('2026-04-27', 'monthly', 1)).toHaveLength(0)
  })
})

// ── generateOccurrenceDates — weekly ──────────────────────────────────────────

describe('generateOccurrenceDates — weekly', () => {
  it('generates count-1 dates', () => {
    expect(generateOccurrenceDates('2026-04-27', 'weekly', 8)).toHaveLength(7)
    expect(generateOccurrenceDates('2026-04-27', 'weekly', 2)).toHaveLength(1)
    expect(generateOccurrenceDates('2026-04-27', 'weekly', 26)).toHaveLength(25)
  })

  it('first date is exactly 7 days after startDate', () => {
    const dates = generateOccurrenceDates('2026-04-27', 'weekly', 2)
    expect(dates[0]).toBe('2026-05-04')
  })

  it('subsequent dates are each 7 days apart', () => {
    const dates = generateOccurrenceDates('2026-04-27', 'weekly', 4)
    expect(dates[0]).toBe('2026-05-04')
    expect(dates[1]).toBe('2026-05-11')
    expect(dates[2]).toBe('2026-05-18')
  })

  it('crosses month boundary correctly', () => {
    const dates = generateOccurrenceDates('2026-04-27', 'weekly', 8)
    // 7 weeks after April 27 = June 15
    expect(dates[6]).toBe('2026-06-15')
  })

  it('crosses year boundary correctly', () => {
    const dates = generateOccurrenceDates('2026-12-28', 'weekly', 2)
    expect(dates[0]).toBe('2027-01-04')
  })

  it('default occurrence count generates DEFAULT_OCCURRENCES-1 dates', () => {
    const dates = generateOccurrenceDates('2026-04-27', 'weekly', DEFAULT_OCCURRENCES)
    expect(dates).toHaveLength(DEFAULT_OCCURRENCES - 1)
  })

  it('max occurrence count generates MAX_OCCURRENCES-1 dates', () => {
    const dates = generateOccurrenceDates('2026-01-01', 'weekly', MAX_OCCURRENCES)
    expect(dates).toHaveLength(MAX_OCCURRENCES - 1)
  })
})

// ── generateOccurrenceDates — biweekly ───────────────────────────────────────

describe('generateOccurrenceDates — biweekly', () => {
  it('generates count-1 dates', () => {
    expect(generateOccurrenceDates('2026-04-27', 'biweekly', 4)).toHaveLength(3)
  })

  it('first date is exactly 14 days after startDate', () => {
    const dates = generateOccurrenceDates('2026-04-27', 'biweekly', 2)
    expect(dates[0]).toBe('2026-05-11')
  })

  it('subsequent dates are each 14 days apart', () => {
    const dates = generateOccurrenceDates('2026-05-01', 'biweekly', 4)
    expect(dates[0]).toBe('2026-05-15')
    expect(dates[1]).toBe('2026-05-29')
    expect(dates[2]).toBe('2026-06-12')
  })

  it('crosses year boundary correctly', () => {
    const dates = generateOccurrenceDates('2026-12-21', 'biweekly', 2)
    expect(dates[0]).toBe('2027-01-04')
  })
})

// ── generateOccurrenceDates — monthly ────────────────────────────────────────

describe('generateOccurrenceDates — monthly', () => {
  it('generates count-1 dates', () => {
    expect(generateOccurrenceDates('2026-04-15', 'monthly', 4)).toHaveLength(3)
  })

  it('advances one calendar month per occurrence', () => {
    const dates = generateOccurrenceDates('2026-04-15', 'monthly', 4)
    expect(dates[0]).toBe('2026-05-15')
    expect(dates[1]).toBe('2026-06-15')
    expect(dates[2]).toBe('2026-07-15')
  })

  it('crosses year boundary: December → January', () => {
    const dates = generateOccurrenceDates('2026-12-01', 'monthly', 2)
    expect(dates[0]).toBe('2027-01-01')
  })

  it('handles month-end: January 31 → February 28', () => {
    const dates = generateOccurrenceDates('2026-01-31', 'monthly', 2)
    expect(dates[0]).toBe('2026-02-28')
  })

  it('handles month-end: March 31 → April 30', () => {
    const dates = generateOccurrenceDates('2026-03-31', 'monthly', 2)
    expect(dates[0]).toBe('2026-04-30')
  })

  it('handles month-end: August 31 → September 30', () => {
    const dates = generateOccurrenceDates('2026-08-31', 'monthly', 2)
    expect(dates[0]).toBe('2026-09-30')
  })

  it('handles month-end: January 31 chained → February 28 → March 28', () => {
    const dates = generateOccurrenceDates('2026-01-31', 'monthly', 3)
    expect(dates[0]).toBe('2026-02-28')
    expect(dates[1]).toBe('2026-03-28')
  })

  it('handles leap year: January 31 2028 → February 29 2028', () => {
    const dates = generateOccurrenceDates('2028-01-31', 'monthly', 2)
    expect(dates[0]).toBe('2028-02-29')
  })
})

// ── buildSeriesData ───────────────────────────────────────────────────────────

describe('buildSeriesData', () => {
  it('returns count items with base as first element', () => {
    const base = baseEventData('2026-05-01')
    const result = buildSeriesData(base, 'weekly', 4, 'series-abc')
    expect(result).toHaveLength(4)
    expect(result[0].event_date).toBe('2026-05-01')
  })

  it('all items share the provided seriesId', () => {
    const base = baseEventData('2026-05-01')
    const result = buildSeriesData(base, 'weekly', 3, 'my-series-id')
    expect(result.every(e => e.recurrence_series_id === 'my-series-id')).toBe(true)
  })

  it('subsequent dates match generateOccurrenceDates output', () => {
    const base = baseEventData('2026-05-04')
    const result = buildSeriesData(base, 'biweekly', 3, 'sid')
    expect(result[1].event_date).toBe('2026-05-18')
    expect(result[2].event_date).toBe('2026-06-01')
  })

  it('all items inherit name and other fields from base', () => {
    const base = baseEventData('2026-05-01', { name: 'Community Night', location: 'Main Hall' })
    const result = buildSeriesData(base, 'weekly', 4, 'sid')
    expect(result.every(e => e.name === 'Community Night')).toBe(true)
    expect(result.every(e => e.location === 'Main Hall')).toBe(true)
  })

  it('returns single-item array when count=1', () => {
    const base = baseEventData('2026-05-01')
    const result = buildSeriesData(base, 'weekly', 1, 'sid')
    expect(result).toHaveLength(1)
    expect(result[0].event_date).toBe('2026-05-01')
  })
})

// ── createRecurringSeries (integration) ───────────────────────────────────────

describe('createRecurringSeries', () => {
  it('creates exactly count events in the database', async () => {
    const { events } = await createRecurringSeries(baseEventData('2026-05-04'), 'weekly', 4)
    expect(events).toHaveLength(4)
  })

  it('all events share the same recurrence_series_id', async () => {
    const { events, seriesId } = await createRecurringSeries(baseEventData('2026-05-04'), 'weekly', 4)
    expect(events.every(e => e.recurrence_series_id === seriesId)).toBe(true)
    expect(seriesId).toBeTruthy()
  })

  it('events have correct ascending dates', async () => {
    const { events } = await createRecurringSeries(baseEventData('2026-05-01'), 'biweekly', 3)
    expect(events[0].event_date).toBe('2026-05-01')
    expect(events[1].event_date).toBe('2026-05-15')
    expect(events[2].event_date).toBe('2026-05-29')
  })

  it('each call generates a unique seriesId', async () => {
    const base = baseEventData('2026-05-01')
    const a = await createRecurringSeries(base, 'weekly', 2)
    const b = await createRecurringSeries(base, 'weekly', 2)
    expect(a.seriesId).not.toBe(b.seriesId)
  })

  it('created events can be retrieved individually from the database', async () => {
    const { events } = await createRecurringSeries(baseEventData('2099-06-01'), 'weekly', 3)
    const retrieved = await db.getEvent(events[1].id)
    expect(retrieved).not.toBeNull()
    expect(retrieved?.recurrence_series_id).toBe(events[0].recurrence_series_id)
  })

  it('all events inherit registration settings from base', async () => {
    const base = baseEventData('2026-05-01', {
      registration_required: true,
      has_cost: true,
      cost_amount: 10,
    })
    const { events } = await createRecurringSeries(base, 'weekly', 3)
    expect(events.every(e => e.registration_required)).toBe(true)
    expect(events.every(e => e.has_cost)).toBe(true)
    expect(events.every(e => e.cost_amount === 10)).toBe(true)
  })

  it('count=1 creates exactly one event (the base)', async () => {
    const { events } = await createRecurringSeries(baseEventData('2026-05-01'), 'weekly', 1)
    expect(events).toHaveLength(1)
    expect(events[0].event_date).toBe('2026-05-01')
  })

  it('monthly series over 12 months has correct year rollover', async () => {
    const { events } = await createRecurringSeries(baseEventData('2026-07-15'), 'monthly', 7)
    expect(events[0].event_date).toBe('2026-07-15')
    expect(events[6].event_date).toBe('2027-01-15')
  })

  it('created events appear in getEvents() call', async () => {
    const { events: created, seriesId } = await createRecurringSeries(
      baseEventData('2099-12-01'),
      'weekly',
      3,
    )
    const all = await db.getEvents()
    const found = all.filter(e => e.recurrence_series_id === seriesId)
    expect(found).toHaveLength(3)
    expect(found.map(e => e.id).sort()).toEqual(created.map(e => e.id).sort())
  })
})

// ── Constants ─────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('DEFAULT_OCCURRENCES is 8', () => {
    expect(DEFAULT_OCCURRENCES).toBe(8)
  })

  it('MAX_OCCURRENCES is 26', () => {
    expect(MAX_OCCURRENCES).toBe(26)
  })
})
