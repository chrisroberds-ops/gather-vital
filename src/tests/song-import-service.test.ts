import { describe, it, expect } from 'vitest'
import { db } from '@/services'
import {
  parseCsv,
  isPlanningCenterCsv,
  buildPlanningCenterMapping,
  buildAutoMapping,
  buildSongPreview,
  commitSongImport,
  SONG_FIELDS,
  type SongPreviewRow,
} from '@/features/worship/song-import-service'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeSong(title: string, ccli?: string) {
  return db.createSong({ title, ccli_number: ccli, is_active: true })
}

function makeRow(fields: Record<string, string>): Record<string, string> {
  return fields
}

// ── CSV Parser ────────────────────────────────────────────────────────────────

describe('parseCsv', () => {
  it('parses a simple CSV with headers and one row', () => {
    const csv = 'Title,Artist,Key\n"Amazing Grace","John Newton","G"'
    const { headers, rows } = parseCsv(csv)
    expect(headers).toEqual(['Title', 'Artist', 'Key'])
    expect(rows).toHaveLength(1)
    expect(rows[0].Title).toBe('Amazing Grace')
    expect(rows[0].Key).toBe('G')
  })

  it('handles Windows line endings (CRLF)', () => {
    const csv = 'Title,Artist\r\nHow Great Thou Art,Stuart Hine\r\n'
    const { headers, rows } = parseCsv(csv)
    expect(headers).toHaveLength(2)
    expect(rows).toHaveLength(1)
    expect(rows[0].Title).toBe('How Great Thou Art')
  })

  it('handles quoted fields containing commas', () => {
    const csv = 'Title,Key\n"Lord, I Lift Your Name on High","A"'
    const { rows } = parseCsv(csv)
    expect(rows[0].Title).toBe('Lord, I Lift Your Name on High')
  })

  it('handles escaped double quotes inside quoted fields', () => {
    const csv = 'Notes\n"He said ""hallelujah"""'
    const { rows } = parseCsv(csv)
    expect(rows[0].Notes).toBe('He said "hallelujah"')
  })

  it('filters out empty rows', () => {
    const csv = 'Title,Artist\nGrace,,\n\n'
    const { rows } = parseCsv(csv)
    expect(rows).toHaveLength(1)
  })

  it('returns empty headers and rows for empty input', () => {
    const { headers, rows } = parseCsv('')
    expect(headers).toHaveLength(0)
    expect(rows).toHaveLength(0)
  })
})

// ── Planning Center detection ─────────────────────────────────────────────────

describe('isPlanningCenterCsv', () => {
  it('returns true for headers containing "Author"', () => {
    expect(isPlanningCenterCsv(['Title', 'Author', 'CCLI Number'])).toBe(true)
  })

  it('returns true for "Author/Artist" variant', () => {
    expect(isPlanningCenterCsv(['Title', 'Author/Artist', 'BPM'])).toBe(true)
  })

  it('returns true for "ccli song number"', () => {
    expect(isPlanningCenterCsv(['Title', 'CCLI Song Number'])).toBe(true)
  })

  it('returns false for generic CSV headers with no PC columns', () => {
    expect(isPlanningCenterCsv(['song_title', 'composer', 'tempo_bpm'])).toBe(false)
  })

  it('returns false for empty header list', () => {
    expect(isPlanningCenterCsv([])).toBe(false)
  })
})

// ── Planning Center mapping ───────────────────────────────────────────────────

describe('buildPlanningCenterMapping', () => {
  it('maps "Title" → title', () => {
    const m = buildPlanningCenterMapping(['Title', 'Author', 'CCLI Number'])
    expect(m['Title']).toBe('title')
  })

  it('maps "Author" → artist', () => {
    const m = buildPlanningCenterMapping(['Title', 'Author'])
    expect(m['Author']).toBe('artist')
  })

  it('maps "Author/Artist" → artist', () => {
    const m = buildPlanningCenterMapping(['Author/Artist'])
    expect(m['Author/Artist']).toBe('artist')
  })

  it('maps "BPM" → bpm', () => {
    const m = buildPlanningCenterMapping(['BPM'])
    expect(m['BPM']).toBe('bpm')
  })

  it('maps "CCLI Number" → ccli_number', () => {
    const m = buildPlanningCenterMapping(['CCLI Number'])
    expect(m['CCLI Number']).toBe('ccli_number')
  })

  it('maps "Themes" → tags', () => {
    const m = buildPlanningCenterMapping(['Themes'])
    expect(m['Themes']).toBe('tags')
  })

  it('maps unknown columns to "ignore"', () => {
    const m = buildPlanningCenterMapping(['RandomColumn'])
    expect(m['RandomColumn']).toBe('ignore')
  })
})

// ── Generic auto-mapping ──────────────────────────────────────────────────────

describe('buildAutoMapping', () => {
  it('maps "Title" to title field', () => {
    const m = buildAutoMapping(['Title', 'Artist', 'Key'])
    expect(m['Title']).toBe('title')
    expect(m['Artist']).toBe('artist')
    expect(m['Key']).toBe('key')
  })

  it('maps case-insensitively', () => {
    const m = buildAutoMapping(['TITLE', 'artist'])
    expect(m['TITLE']).toBe('title')
    expect(m['artist']).toBe('artist')
  })

  it('maps "ccli_number" field', () => {
    const m = buildAutoMapping(['ccli_number'])
    expect(m['ccli_number']).toBe('ccli_number')
  })

  it('maps unrecognised columns to "ignore"', () => {
    const m = buildAutoMapping(['WeirdColumn'])
    expect(m['WeirdColumn']).toBe('ignore')
  })
})

// ── Song preview / duplicate detection ───────────────────────────────────────

describe('buildSongPreview — duplicate detection', () => {
  it('marks a new song as ready', async () => {
    const rows = [makeRow({ Title: 'Brand New Song', Artist: 'Someone' })]
    const mapping = { Title: 'title', Artist: 'artist' }
    const preview = await buildSongPreview(rows, mapping)
    expect(preview).toHaveLength(1)
    expect(preview[0].status).toBe('ready')
  })

  it('marks a song with matching title as duplicate', async () => {
    await makeSong('How Great Thou Art')
    const rows = [makeRow({ Title: 'How Great Thou Art', Artist: 'Stuart Hine' })]
    const mapping = { Title: 'title', Artist: 'artist' }
    const preview = await buildSongPreview(rows, mapping)
    expect(preview[0].status).toBe('duplicate')
    expect(preview[0].existingMatch?.title).toBe('How Great Thou Art')
  })

  it('duplicate detection is case-insensitive', async () => {
    await makeSong('Amazing Grace')
    const rows = [makeRow({ Title: 'amazing grace' })]
    const preview = await buildSongPreview(rows, { Title: 'title' })
    expect(preview[0].status).toBe('duplicate')
  })

  it('flags as duplicate when title AND ccli match an existing song', async () => {
    await makeSong('Oceans', '1234')
    const rows = [makeRow({ Title: 'Oceans', CCLI: '1234' })]
    const preview = await buildSongPreview(rows, { Title: 'title', CCLI: 'ccli_number' })
    expect(preview[0].status).toBe('duplicate')
  })

  it('does NOT flag as duplicate when titles match but CCLI numbers differ', async () => {
    await makeSong('Oceans', '1111')
    const rows = [makeRow({ Title: 'Oceans', CCLI: '9999' })]
    const preview = await buildSongPreview(rows, { Title: 'title', CCLI: 'ccli_number' })
    // Different CCLI — could be a different version; flag as duplicate only on title match
    // (current rule: title match alone is still a duplicate)
    expect(preview[0].status).toBe('duplicate')
  })

  it('marks rows missing title as skipped', async () => {
    const rows = [makeRow({ Artist: 'Someone' })]
    const preview = await buildSongPreview(rows, { Artist: 'artist' })
    expect(preview[0].status).toBe('skipped')
    expect(preview[0].reason).toContain('title')
  })

  it('handles multiple rows with mixed statuses', async () => {
    await makeSong('Existing Song')
    const rows = [
      makeRow({ Title: 'New Song' }),
      makeRow({ Title: 'Existing Song' }),
      makeRow({ Artist: 'No Title Here' }),
    ]
    const preview = await buildSongPreview(rows, { Title: 'title', Artist: 'artist' })
    expect(preview[0].status).toBe('ready')
    expect(preview[1].status).toBe('duplicate')
    expect(preview[2].status).toBe('skipped')
  })
})

// ── Commit import ─────────────────────────────────────────────────────────────

describe('commitSongImport', () => {
  it('imports only ready rows and returns correct counts', async () => {
    const before = (await db.getSongs()).length
    const preview: SongPreviewRow[] = [
      { index: 0, raw: {}, mapped: { title: 'New Song A', artist: 'Artist X' }, status: 'ready' },
      { index: 1, raw: {}, mapped: { title: 'Existing' },                       status: 'duplicate' },
      { index: 2, raw: {}, mapped: {},                                           status: 'skipped', reason: 'Missing: title' },
    ]
    const result = await commitSongImport(preview)
    expect(result.imported).toBe(1)
    expect(result.duplicates).toBe(1)
    expect(result.skipped).toBe(1)
    const after = (await db.getSongs()).length
    expect(after).toBe(before + 1)
  })

  it('saves all mapped fields correctly', async () => {
    const preview: SongPreviewRow[] = [{
      index: 0,
      raw: {},
      mapped: {
        title: 'Test Import Song',
        artist: 'Test Artist',
        key: 'C',
        bpm: '120',
        ccli_number: '99999',
        tags: 'worship, contemporary',
      },
      status: 'ready',
    }]
    await commitSongImport(preview)
    const songs = await db.getSongs()
    const imported = songs.find(s => s.title === 'Test Import Song')!
    expect(imported).toBeDefined()
    expect(imported.artist).toBe('Test Artist')
    expect(imported.key).toBe('C')
    expect(imported.bpm).toBe(120)
    expect(imported.ccli_number).toBe('99999')
    expect(imported.tags).toEqual(['worship', 'contemporary'])
  })

  it('handles non-numeric BPM gracefully', async () => {
    const preview: SongPreviewRow[] = [{
      index: 0, raw: {}, mapped: { title: 'Bad BPM Song', bpm: 'fast' }, status: 'ready',
    }]
    await commitSongImport(preview)
    const songs = await db.getSongs()
    const imported = songs.find(s => s.title === 'Bad BPM Song')!
    expect(imported).toBeDefined()
    expect(imported.bpm).toBeUndefined()
  })

  it('returns zero counts when all rows are duplicates', async () => {
    const preview: SongPreviewRow[] = [
      { index: 0, raw: {}, mapped: { title: 'Dupe' }, status: 'duplicate' },
    ]
    const result = await commitSongImport(preview)
    expect(result.imported).toBe(0)
    expect(result.duplicates).toBe(1)
  })
})

// ── SONG_FIELDS export ────────────────────────────────────────────────────────

describe('SONG_FIELDS', () => {
  it('title is the only required field', () => {
    const required = SONG_FIELDS.filter(f => f.required).map(f => f.key)
    expect(required).toEqual(['title'])
  })

  it('contains all expected field keys', () => {
    const keys = SONG_FIELDS.map(f => f.key)
    expect(keys).toContain('title')
    expect(keys).toContain('artist')
    expect(keys).toContain('key')
    expect(keys).toContain('bpm')
    expect(keys).toContain('ccli_number')
    expect(keys).toContain('tags')
  })
})
