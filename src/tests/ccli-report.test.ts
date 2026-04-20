import { describe, it, expect } from 'vitest'
import {
  filterPlansByDateRange,
  aggregateSongUsage,
  formatCcliCsv,
  defaultDateRange,
  type CcliSongRow,
} from '@/features/worship/ccli-report-service'
import type { ServicePlan, ServicePlanItem } from '@/shared/types'

// ── Test helpers ──────────────────────────────────────────────────────────────

function plan(id: string, date: string): ServicePlan {
  return {
    id,
    church_id: 'church-test-default',
    name: `Plan ${id}`,
    service_date: date,
    is_finalized: false,
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function songItem(planId: string, songId: string, position = 0): ServicePlanItem {
  return {
    id: `item-${planId}-${songId}-${position}`,
    church_id: 'church-test-default',
    plan_id: planId,
    item_type: 'song',
    song_id: songId,
    position,
  }
}

function nonSongItem(planId: string, type: ServicePlanItem['item_type'] = 'sermon'): ServicePlanItem {
  return {
    id: `item-${planId}-${type}`,
    church_id: 'church-test-default',
    plan_id: planId,
    item_type: type,
    position: 0,
  }
}

type SongStub = { title: string; artist?: string; ccli_number?: string }

function songMap(entries: Array<[string, SongStub]>) {
  return new Map(entries)
}

// ── filterPlansByDateRange ────────────────────────────────────────────────────

describe('filterPlansByDateRange', () => {
  const plans = [
    plan('p1', '2026-01-05'),
    plan('p2', '2026-03-15'),
    plan('p3', '2026-06-01'),
    plan('p4', '2025-12-31'),
    plan('p5', '2026-07-01'),
  ]

  it('includes plans within the range', () => {
    const result = filterPlansByDateRange(plans, '2026-01-01', '2026-06-30')
    expect(result.map(p => p.id)).toEqual(['p1', 'p2', 'p3'])
  })

  it('includes plans on the from boundary (inclusive)', () => {
    const result = filterPlansByDateRange(plans, '2026-01-05', '2026-06-30')
    expect(result.some(p => p.id === 'p1')).toBe(true)
  })

  it('includes plans on the to boundary (inclusive)', () => {
    const result = filterPlansByDateRange(plans, '2026-01-01', '2026-06-01')
    expect(result.some(p => p.id === 'p3')).toBe(true)
  })

  it('excludes plans strictly before from date', () => {
    const result = filterPlansByDateRange(plans, '2026-01-01', '2026-06-30')
    expect(result.some(p => p.id === 'p4')).toBe(false)
  })

  it('excludes plans strictly after to date', () => {
    const result = filterPlansByDateRange(plans, '2026-01-01', '2026-06-30')
    expect(result.some(p => p.id === 'p5')).toBe(false)
  })

  it('returns empty array when no plans match', () => {
    const result = filterPlansByDateRange(plans, '2025-01-01', '2025-06-30')
    expect(result).toHaveLength(0)
  })

  it('handles same-day range (from === to)', () => {
    const result = filterPlansByDateRange(plans, '2026-03-15', '2026-03-15')
    expect(result.map(p => p.id)).toEqual(['p2'])
  })
})

// ── aggregateSongUsage ────────────────────────────────────────────────────────

describe('aggregateSongUsage', () => {
  const plans = [
    plan('p1', '2026-01-05'),
    plan('p2', '2026-01-12'),
    plan('p3', '2026-01-19'),
  ]

  it('counts a song used once', () => {
    const items = [songItem('p1', 'song-a')]
    const songs = songMap([['song-a', { title: 'Amazing Grace', ccli_number: '12345' }]])
    const rows = aggregateSongUsage(plans, items, songs)
    expect(rows).toHaveLength(1)
    expect(rows[0].timesUsed).toBe(1)
    expect(rows[0].serviceDates).toEqual(['2026-01-05'])
  })

  it('counts a song used in multiple services', () => {
    const items = [songItem('p1', 'song-a'), songItem('p2', 'song-a'), songItem('p3', 'song-a')]
    const songs = songMap([['song-a', { title: 'Amazing Grace' }]])
    const rows = aggregateSongUsage(plans, items, songs)
    expect(rows[0].timesUsed).toBe(3)
    expect(rows[0].serviceDates).toEqual(['2026-01-05', '2026-01-12', '2026-01-19'])
  })

  it('counts multiple appearances in the same service separately for timesUsed but deduplicates serviceDates', () => {
    const items = [
      songItem('p1', 'song-a', 0),
      songItem('p1', 'song-a', 3), // same song twice in same service
    ]
    const songs = songMap([['song-a', { title: 'Amazing Grace' }]])
    const rows = aggregateSongUsage(plans, items, songs)
    expect(rows[0].timesUsed).toBe(2)
    expect(rows[0].serviceDates).toEqual(['2026-01-05']) // deduplicated
  })

  it('handles multiple songs and groups them separately', () => {
    const items = [songItem('p1', 'song-a'), songItem('p1', 'song-b'), songItem('p2', 'song-a')]
    const songs = songMap([
      ['song-a', { title: 'Amazing Grace' }],
      ['song-b', { title: 'Be Thou My Vision' }],
    ])
    const rows = aggregateSongUsage(plans, items, songs)
    expect(rows).toHaveLength(2)
    const songA = rows.find(r => r.songId === 'song-a')!
    expect(songA.timesUsed).toBe(2)
    const songB = rows.find(r => r.songId === 'song-b')!
    expect(songB.timesUsed).toBe(1)
  })

  it('sorts rows by timesUsed descending', () => {
    const items = [
      songItem('p1', 'song-a'),
      songItem('p1', 'song-b'), songItem('p2', 'song-b'), songItem('p3', 'song-b'),
    ]
    const songs = songMap([
      ['song-a', { title: 'Amazing Grace' }],
      ['song-b', { title: 'Be Thou My Vision' }],
    ])
    const rows = aggregateSongUsage(plans, items, songs)
    expect(rows[0].songId).toBe('song-b') // 3 uses first
    expect(rows[1].songId).toBe('song-a') // 1 use second
  })

  it('breaks ties alphabetically by title', () => {
    const items = [songItem('p1', 'song-b'), songItem('p2', 'song-a')]
    const songs = songMap([
      ['song-a', { title: 'Amazing Grace' }],
      ['song-b', { title: 'Be Thou My Vision' }],
    ])
    const rows = aggregateSongUsage(plans, items, songs)
    expect(rows[0].title).toBe('Amazing Grace') // A before B
  })

  it('excludes non-song items (sermon, scripture, etc.)', () => {
    const items = [
      songItem('p1', 'song-a'),
      nonSongItem('p1', 'sermon'),
      nonSongItem('p1', 'scripture'),
    ]
    const songs = songMap([['song-a', { title: 'Amazing Grace' }]])
    const rows = aggregateSongUsage(plans, items, songs)
    expect(rows).toHaveLength(1)
  })

  it('excludes song items without a song_id', () => {
    const itemWithoutSongId: ServicePlanItem = {
      id: 'item-no-song',
      church_id: 'church-test-default',
      plan_id: 'p1',
      item_type: 'song',
      position: 0,
      // song_id intentionally omitted
    }
    const rows = aggregateSongUsage(plans, [itemWithoutSongId], new Map())
    expect(rows).toHaveLength(0)
  })

  it('includes songs not in songMap as Unknown Song with null ccliNumber', () => {
    const items = [songItem('p1', 'song-orphan')]
    const rows = aggregateSongUsage(plans, items, new Map())
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('Unknown Song')
    expect(rows[0].ccliNumber).toBeNull()
  })

  it('flags songs without CCLI number as ccliNumber: null', () => {
    const items = [songItem('p1', 'song-a')]
    const songs = songMap([['song-a', { title: 'New Song' }]]) // no ccli_number
    const rows = aggregateSongUsage(plans, items, songs)
    expect(rows[0].ccliNumber).toBeNull()
  })

  it('includes CCLI number when present', () => {
    const items = [songItem('p1', 'song-a')]
    const songs = songMap([['song-a', { title: 'Amazing Grace', ccli_number: '4755116' }]])
    const rows = aggregateSongUsage(plans, items, songs)
    expect(rows[0].ccliNumber).toBe('4755116')
  })

  it('returns empty array when items list is empty', () => {
    const rows = aggregateSongUsage(plans, [], new Map())
    expect(rows).toHaveLength(0)
  })

  it('ignores items whose plan_id is not in the provided plans', () => {
    const items = [songItem('plan-not-in-list', 'song-a')]
    const songs = songMap([['song-a', { title: 'Amazing Grace' }]])
    const rows = aggregateSongUsage(plans, items, songs)
    expect(rows).toHaveLength(0)
  })

  it('service dates are sorted ascending', () => {
    const items = [songItem('p3', 'song-a'), songItem('p1', 'song-a'), songItem('p2', 'song-a')]
    const songs = songMap([['song-a', { title: 'Amazing Grace' }]])
    const rows = aggregateSongUsage(plans, items, songs)
    expect(rows[0].serviceDates).toEqual(['2026-01-05', '2026-01-12', '2026-01-19'])
  })
})

// ── formatCcliCsv ─────────────────────────────────────────────────────────────

describe('formatCcliCsv', () => {
  const row = (overrides: Partial<CcliSongRow> = {}): CcliSongRow => ({
    songId: 'song-1',
    title: 'Amazing Grace',
    artist: 'John Newton',
    ccliNumber: '4755116',
    timesUsed: 3,
    serviceDates: ['2026-01-05', '2026-01-19', '2026-02-02'],
    ...overrides,
  })

  it('produces the correct header row', () => {
    const csv = formatCcliCsv([])
    expect(csv.startsWith('Title,Artist,CCLI Number,Times Used,Service Dates')).toBe(true)
  })

  it('formats a full row correctly', () => {
    const csv = formatCcliCsv([row()])
    const lines = csv.split('\r\n')
    expect(lines[1]).toBe('"Amazing Grace","John Newton","4755116",3,"2026-01-05; 2026-01-19; 2026-02-02"')
  })

  it('uses empty string for null artist', () => {
    const csv = formatCcliCsv([row({ artist: null })])
    expect(csv).toContain('"Amazing Grace",""')
  })

  it('uses empty string for null CCLI number', () => {
    const csv = formatCcliCsv([row({ ccliNumber: null })])
    const lines = csv.split('\r\n')
    // Line: "Amazing Grace","John Newton","",3,"..."
    expect(lines[1]).toContain('"John Newton","",3,')
  })

  it('escapes double quotes in title', () => {
    const csv = formatCcliCsv([row({ title: 'God "Is" Good' })])
    expect(csv).toContain('"God ""Is"" Good"')
  })

  it('joins multiple service dates with semicolons', () => {
    const csv = formatCcliCsv([row()])
    expect(csv).toContain('2026-01-05; 2026-01-19; 2026-02-02')
  })

  it('handles a single service date without trailing semicolon', () => {
    const csv = formatCcliCsv([row({ serviceDates: ['2026-01-05'], timesUsed: 1 })])
    expect(csv).toContain('"2026-01-05"')
    expect(csv).not.toContain('; ')
  })

  it('produces one line per song plus header', () => {
    const csv = formatCcliCsv([row(), row({ songId: 'song-2', title: 'Be Thou My Vision' })])
    const lines = csv.split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(3) // header + 2 songs
  })
})

// ── defaultDateRange ──────────────────────────────────────────────────────────

describe('defaultDateRange', () => {
  it('returns a range where "to" is today', () => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const { to } = defaultDateRange()
    expect(to).toBe(todayStr)
  })

  it('returns a range approximately 6 months back', () => {
    const { from, to } = defaultDateRange()
    const fromDate = new Date(from + 'T00:00:00')
    const toDate = new Date(to + 'T00:00:00')
    const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
    // 6 months is roughly 180–184 days
    expect(diffDays).toBeGreaterThanOrEqual(178)
    expect(diffDays).toBeLessThanOrEqual(186)
  })
})
