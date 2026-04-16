/**
 * Song Import Service
 *
 * Two import modes:
 *   1. Planning Center — auto-maps well-known PC column names, no field-mapping step needed
 *   2. Generic CSV    — same 4-step wizard as /admin/import, with manual field mapping
 *
 * Both modes share the same CSV parser, duplicate detection, and commit path.
 */

import { db } from '@/services'
import type { Song } from '@/shared/types'

// ── CSV Parser (shared with ImportPage) ───────────────────────────────────────

/**
 * RFC-4180-compliant CSV parser that handles multi-line quoted fields.
 *
 * Parses character-by-character across the entire CSV text rather than
 * splitting on newlines first.  Newlines inside a quoted field (e.g. the
 * "Arrangement 1 Chord Chart" column in Planning Center exports) are treated
 * as part of the field value and do NOT start a new row.
 */
export function parseCsv(raw: string): { headers: string[]; rows: Record<string, string>[] } {
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!text.trim()) return { headers: [], rows: [] }

  const allRows: string[][] = []
  let cur = ''
  let inQuotes = false
  let row: string[] = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { cur += '"'; i++ } // escaped ""
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      row.push(cur)
      cur = ''
    } else if (ch === '\n' && !inQuotes) {
      row.push(cur)
      cur = ''
      if (row.some(f => f.trim())) allRows.push(row)
      row = []
    } else {
      cur += ch
    }
  }
  // Flush the final field / row
  row.push(cur)
  if (row.some(f => f.trim())) allRows.push(row)

  if (allRows.length === 0) return { headers: [], rows: [] }

  const headers = allRows[0].map(h => h.trim())
  const rows = allRows.slice(1).map(vals => {
    const r: Record<string, string> = {}
    headers.forEach((h, i) => { r[h] = vals[i] ?? '' })
    return r
  }).filter(r => Object.values(r).some(v => v.trim()))

  return { headers, rows }
}

// ── System fields for generic import ─────────────────────────────────────────

export interface SongField {
  key: string
  label: string
  required: boolean
  hint?: string
}

export const SONG_FIELDS: SongField[] = [
  { key: 'title',            label: 'Title',            required: true },
  { key: 'artist',           label: 'Artist',           required: false },
  { key: 'key',              label: 'Key',              required: false, hint: 'e.g. G, Ab, F#m' },
  { key: 'bpm',              label: 'BPM',              required: false, hint: 'Numeric' },
  { key: 'ccli_number',      label: 'CCLI Number',      required: false },
  { key: 'tags',             label: 'Tags',             required: false, hint: 'Comma-separated' },
  { key: 'lyrics',           label: 'Lyrics',           required: false },
  { key: 'chord_chart_text', label: 'Chord Chart Text', required: false },
]

// ── Planning Center column → system field mapping ─────────────────────────────

/**
 * Known Planning Center song export column names → internal Song field key.
 * PC column names are case-insensitive and may vary slightly by export version.
 */
const PC_COLUMN_MAP: Record<string, string> = {
  // Title
  'title':                        'title',
  'song title':                   'title',
  'name':                         'title',
  // Artist / Author
  'author':                       'artist',
  'artist':                       'artist',
  'author/artist':                'artist',
  'artist/author':                'artist',
  // Key — top-level and arrangement-specific
  'key':                          'key',
  'starting key':                 'key',
  'preferred key':                'key',
  'arrangement 1 keys':           'key',
  // BPM — top-level and arrangement-specific
  'bpm':                          'bpm',
  'tempo':                        'bpm',
  'beats per minute':             'bpm',
  'arrangement 1 bpm':            'bpm',
  // CCLI
  'ccli number':                  'ccli_number',
  'ccli #':                       'ccli_number',
  'ccli song number':             'ccli_number',
  'ccli':                         'ccli_number',
  // Tags / themes
  'themes':                       'tags',
  'tags':                         'tags',
  'genre':                        'tags',
  // Lyrics (less common in PC exports but supported)
  'lyrics':                       'lyrics',
  // Chord chart text (Planning Center "Arrangement 1 Chord Chart" column)
  'arrangement 1 chord chart':    'chord_chart_text',
  'chord chart':                  'chord_chart_text',
}

/**
 * Returns true if the CSV headers look like a Planning Center export
 * (at least one well-known PC column is present).
 */
export function isPlanningCenterCsv(headers: string[]): boolean {
  const known = new Set(Object.keys(PC_COLUMN_MAP))
  return headers.some(h => known.has(h.trim().toLowerCase()))
}

/**
 * Build a column→field mapping for Planning Center headers automatically.
 * Unknown columns are mapped to 'ignore'.
 */
export function buildPlanningCenterMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  for (const h of headers) {
    const norm = h.trim().toLowerCase()
    mapping[h] = PC_COLUMN_MAP[norm] ?? 'ignore'
  }
  return mapping
}

/**
 * Auto-detect mappings for generic CSV using label/key similarity.
 * Same logic as ImportPage auto-map.
 */
export function buildAutoMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  for (const h of headers) {
    const norm = h.toLowerCase().replace(/[^a-z0-9]/g, '_')
    const match = SONG_FIELDS.find(f => {
      const fNorm = f.key.replace(/_/g, '')
      const hNorm = norm.replace(/_/g, '')
      return fNorm === hNorm || f.label.toLowerCase().replace(/[^a-z0-9]/g, '') === hNorm
    })
    mapping[h] = match ? match.key : 'ignore'
  }
  return mapping
}

// ── Import types ──────────────────────────────────────────────────────────────

export type ImportRowStatus = 'ready' | 'duplicate' | 'skipped'

export interface SongPreviewRow {
  index: number
  raw: Record<string, string>
  mapped: Record<string, string>
  status: ImportRowStatus
  reason?: string
  /** If duplicate, the existing matching song */
  existingMatch?: Pick<Song, 'id' | 'title' | 'ccli_number'>
}

export interface SongImportResult {
  imported: number
  skipped: number
  duplicates: number
}

// ── Preview builder ───────────────────────────────────────────────────────────

function applyMapping(row: Record<string, string>, mapping: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [csvCol, sysKey] of Object.entries(mapping)) {
    if (sysKey && sysKey !== 'ignore') {
      const val = row[csvCol]?.trim() ?? ''
      if (val) out[sysKey] = val
    }
  }
  return out
}

/**
 * Build the preview rows, detecting duplicates against existing songs.
 *
 * Duplicate rule: a song is considered a duplicate if an existing active song
 * matches on EITHER:
 *   - title (case-insensitive) AND ccli_number (when both are present), OR
 *   - title (case-insensitive) alone when the incoming row has no CCLI number
 *
 * This avoids false positives for songs with the same name but different CCLI,
 * while still catching the common case of re-importing the same song.
 */
export async function buildSongPreview(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
): Promise<SongPreviewRow[]> {
  const existing = await db.getSongs()

  // Index for fast lookup
  const byTitleOnly = new Map<string, Song>()
  const byTitleAndCcli = new Map<string, Song>()
  for (const s of existing) {
    const titleKey = s.title.toLowerCase().trim()
    byTitleOnly.set(titleKey, s)
    if (s.ccli_number) {
      byTitleAndCcli.set(`${titleKey}::${s.ccli_number.trim()}`, s)
    }
  }

  const preview: SongPreviewRow[] = []

  for (let i = 0; i < rows.length; i++) {
    const mapped = applyMapping(rows[i], mapping)

    if (!mapped.title?.trim()) {
      preview.push({
        index: i, raw: rows[i], mapped, status: 'skipped', reason: 'Missing: title',
      })
      continue
    }

    const titleKey = mapped.title.toLowerCase().trim()
    const incomingCcli = mapped.ccli_number?.trim()

    let existingMatch: Song | undefined

    if (incomingCcli) {
      // Prefer the stricter title+CCLI match
      existingMatch = byTitleAndCcli.get(`${titleKey}::${incomingCcli}`) ?? byTitleOnly.get(titleKey)
    } else {
      existingMatch = byTitleOnly.get(titleKey)
    }

    if (existingMatch) {
      preview.push({
        index: i,
        raw: rows[i],
        mapped,
        status: 'duplicate',
        reason: `Matches existing song: "${existingMatch.title}"${existingMatch.ccli_number ? ` (CCLI ${existingMatch.ccli_number})` : ''}`,
        existingMatch: { id: existingMatch.id, title: existingMatch.title, ccli_number: existingMatch.ccli_number },
      })
    } else {
      preview.push({ index: i, raw: rows[i], mapped, status: 'ready' })
    }
  }

  return preview
}

// ── Commit import ─────────────────────────────────────────────────────────────

/**
 * Import all 'ready' rows from a completed preview into the song library.
 * Duplicates and skipped rows are not touched.
 */
export async function commitSongImport(preview: SongPreviewRow[]): Promise<SongImportResult> {
  const toImport = preview.filter(r => r.status === 'ready')
  let imported = 0

  for (const row of toImport) {
    const m = row.mapped
    const bpm = m.bpm ? parseInt(m.bpm.replace(/[^0-9]/g, ''), 10) : undefined
    const tags = m.tags
      ? m.tags.split(',').map(t => t.trim()).filter(Boolean)
      : undefined
    // PC exports "Arrangement 1 Keys" may list multiple keys (e.g. "G, Ab, F#m").
    // Take only the first key listed.
    const firstKey = m.key
      ? (m.key.split(/[,\s]+/).find(k => k.trim()) ?? undefined)
      : undefined

    await db.createSong({
      title: m.title,
      artist: m.artist || undefined,
      key: firstKey || undefined,
      bpm: bpm && !isNaN(bpm) ? bpm : undefined,
      ccli_number: m.ccli_number || undefined,
      tags,
      lyrics: m.lyrics || undefined,
      chord_chart_text: m.chord_chart_text || undefined,
      is_active: true,
    })
    imported++
  }

  return {
    imported,
    skipped: preview.filter(r => r.status === 'skipped').length,
    duplicates: preview.filter(r => r.status === 'duplicate').length,
  }
}
