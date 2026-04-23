// ── Recurring Event Generation ─────────────────────────────────────────────────
// Pure functions for generating occurrence dates.  No DB calls — fully testable.

import type { Event } from '@/shared/types'

export type RecurrencePattern = 'none' | 'weekly' | 'biweekly' | 'monthly'

export const RECURRENCE_LABELS: Record<RecurrencePattern, string> = {
  none: 'None (one-time event)',
  weekly: 'Weekly',
  biweekly: 'Bi-weekly (every 2 weeks)',
  monthly: 'Monthly',
}

export const MAX_OCCURRENCES = 26
export const DEFAULT_OCCURRENCES = 8

// ── Date helpers (local time — avoids UTC midnight timezone shifts) ─────────────

/** Parse a YYYY-MM-DD string into a local Date at noon (avoids DST edge cases). */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}

/** Format a Date as YYYY-MM-DD using local time. */
function formatLocalDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Add N calendar months, clamping to the last day of the target month when
 * the source day does not exist (e.g. Jan 31 + 1 month → Feb 28, not Mar 3).
 */
function addMonths(date: Date, months: number): Date {
  const originalDay = date.getDate()
  const result = new Date(date.getFullYear(), date.getMonth() + months, originalDay, 12, 0, 0)
  // If JS overflowed the day (e.g. Jan 31 → Mar 3), roll back to end of target month
  if (result.getDate() !== originalDay) {
    result.setDate(0) // day 0 of current month = last day of previous month
  }
  return result
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate subsequent occurrence dates for a recurring event.
 *
 * @param startDate  Base date (YYYY-MM-DD). The first occurrence AFTER this date is returned.
 * @param pattern    Recurrence cadence.
 * @param count      Total number of events in the series INCLUDING the base event.
 *                   A count of 8 means the base event + 7 additional dates returned here.
 * @returns          Array of `count - 1` YYYY-MM-DD strings (empty when pattern='none' or count≤1).
 */
export function generateOccurrenceDates(
  startDate: string,
  pattern: RecurrencePattern,
  count: number,
): string[] {
  if (pattern === 'none' || count <= 1) return []

  const dates: string[] = []
  let current = parseLocalDate(startDate)

  for (let i = 1; i < count; i++) {
    switch (pattern) {
      case 'weekly':
        current = addDays(current, 7)
        break
      case 'biweekly':
        current = addDays(current, 14)
        break
      case 'monthly':
        current = addMonths(current, 1)
        break
    }
    dates.push(formatLocalDate(current))
  }

  return dates
}

/**
 * Build the array of event data objects for an entire recurring series.
 * The first element corresponds to the base event (startDate), the rest
 * are the generated occurrences.  No DB calls — returns plain data objects.
 *
 * @param baseData   Event fields shared by all occurrences (name, time, location, etc.)
 * @param pattern    Recurrence cadence
 * @param count      Total events to create (including the base)
 * @param seriesId   UUID to stamp as recurrence_series_id on every event
 */
export function buildSeriesData(
  baseData: Omit<Event, 'id' | 'church_id'>,
  pattern: RecurrencePattern,
  count: number,
  seriesId: string,
): Omit<Event, 'id' | 'church_id'>[] {
  const occurrenceDates = generateOccurrenceDates(baseData.event_date, pattern, count)
  const base = { ...baseData, recurrence_series_id: seriesId }
  const subsequent = occurrenceDates.map(date => ({ ...base, event_date: date }))
  return [base, ...subsequent]
}
