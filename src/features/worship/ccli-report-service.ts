/**
 * CCLI Song Usage Report Service
 *
 * Aggregates song usage from service plans within a date range to produce
 * the data churches need for their bi-annual CCLI (Christian Copyright
 * Licensing International) usage report filing.
 *
 * Pure functions (no DB) are exported separately so they can be unit-tested
 * without any fixtures.
 */

import { db } from '@/services'
import type { ServicePlan, ServicePlanItem, Song } from '@/shared/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CcliSongRow {
  songId: string
  title: string
  /** null when the song record has no artist field */
  artist: string | null
  /** null when the song record has no CCLI number — should be flagged in UI */
  ccliNumber: string | null
  /** Total number of times this song appeared across all plan items in the range */
  timesUsed: number
  /** Sorted, deduplicated YYYY-MM-DD service dates */
  serviceDates: string[]
}

export interface CcliReport {
  rows: CcliSongRow[]
  /** Number of distinct songs used (= rows.length) */
  totalSongs: number
  /** Number of service plans found in the date range */
  totalServices: number
  fromDate: string
  toDate: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Returns the default date range for the CCLI report: today back 6 months.
 * Uses local date arithmetic to avoid UTC midnight timezone shifts.
 */
export function defaultDateRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to.getFullYear(), to.getMonth() - 6, to.getDate())
  return { from: localDateStr(from), to: localDateStr(to) }
}

/**
 * Filters service plans to those whose service_date falls within [from, to]
 * inclusive. Dates are compared as YYYY-MM-DD strings.
 */
export function filterPlansByDateRange(
  plans: ServicePlan[],
  from: string,
  to: string,
): ServicePlan[] {
  return plans.filter(p => p.service_date >= from && p.service_date <= to)
}

type SongLookup = Pick<Song, 'title' | 'artist' | 'ccli_number'>

/**
 * Aggregates song usage from a set of plans, their items, and a song lookup map.
 *
 * - Only items with item_type === 'song' and a song_id are included.
 * - Items whose plan_id is not in the provided plans array are ignored.
 * - Songs not found in songMap appear as rows with title 'Unknown Song'.
 * - timesUsed = total item count (a song used twice in one service = 2).
 * - serviceDates = sorted, deduplicated list of service dates.
 * - Rows are sorted by timesUsed descending, then title ascending.
 */
export function aggregateSongUsage(
  plans: ServicePlan[],
  items: ServicePlanItem[],
  songMap: Map<string, SongLookup>,
): CcliSongRow[] {
  const planDates = new Map(plans.map(p => [p.id, p.service_date]))

  // song_id → { itemCount, dates }
  const usageMap = new Map<string, { itemCount: number; dates: Set<string> }>()

  for (const item of items) {
    if (item.item_type !== 'song' || !item.song_id) continue
    const date = planDates.get(item.plan_id)
    if (date === undefined) continue // item not in the filtered plan set

    if (!usageMap.has(item.song_id)) {
      usageMap.set(item.song_id, { itemCount: 0, dates: new Set() })
    }
    const entry = usageMap.get(item.song_id)!
    entry.itemCount++
    entry.dates.add(date)
  }

  const rows: CcliSongRow[] = []
  for (const [songId, { itemCount, dates }] of usageMap.entries()) {
    const song = songMap.get(songId)
    rows.push({
      songId,
      title: song?.title ?? 'Unknown Song',
      artist: song?.artist ?? null,
      ccliNumber: song?.ccli_number ?? null,
      timesUsed: itemCount,
      serviceDates: [...dates].sort(),
    })
  }

  rows.sort((a, b) => {
    if (b.timesUsed !== a.timesUsed) return b.timesUsed - a.timesUsed
    return a.title.localeCompare(b.title)
  })

  return rows
}

/**
 * Formats the song usage rows as a CSV string suitable for pasting into the
 * CCLI reporting portal.
 *
 * Columns: Title, Artist, CCLI Number, Times Used, Service Dates
 * Service dates within a row are joined with '; '.
 * All string fields are double-quoted with internal quotes escaped as "".
 */
export function formatCcliCsv(rows: CcliSongRow[]): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`
  const header = 'Title,Artist,CCLI Number,Times Used,Service Dates'
  const lines = rows.map(r => [
    q(r.title),
    q(r.artist ?? ''),
    q(r.ccliNumber ?? ''),
    String(r.timesUsed),
    q(r.serviceDates.join('; ')),
  ].join(','))
  return [header, ...lines].join('\r\n')
}

// ── Async / DB-dependent ──────────────────────────────────────────────────────

/**
 * Fetches all data needed for the CCLI report from the database, applies the
 * date filter, and returns the aggregated report.
 *
 * Uses db.getSong() (not getSongs()) so that soft-deleted songs are still
 * included — a song used in a service should remain on the report even if it
 * was later removed from the library.
 */
export async function computeCcliReport(from: string, to: string): Promise<CcliReport> {
  const allPlans = await db.getServicePlans()
  const filtered = filterPlansByDateRange(allPlans, from, to)

  if (filtered.length === 0) {
    return { rows: [], totalSongs: 0, totalServices: 0, fromDate: from, toDate: to }
  }

  // Fetch items for all filtered plans in parallel
  const itemsByPlan = await Promise.all(filtered.map(p => db.getServicePlanItems(p.id)))
  const allItems = itemsByPlan.flat()

  // Collect unique song IDs referenced in those items
  const songIds = [
    ...new Set(allItems.filter(i => i.item_type === 'song' && i.song_id).map(i => i.song_id!)),
  ]

  // Fetch songs in parallel (includes inactive/deleted via getSong)
  const songResults = await Promise.all(songIds.map(id => db.getSong(id)))
  const songMap = new Map<string, SongLookup>()
  songIds.forEach((id, idx) => {
    const s = songResults[idx]
    if (s) songMap.set(id, s)
  })

  const rows = aggregateSongUsage(filtered, allItems, songMap)

  return {
    rows,
    totalSongs: rows.length,
    totalServices: filtered.length,
    fromDate: from,
    toDate: to,
  }
}
