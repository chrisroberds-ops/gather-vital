/**
 * Worship Planning Service
 * Handles songs, service plans, plan items, and service assignments.
 * All operations are church-scoped via the db layer.
 */

import { db } from '@/services'
import type {
  Song,
  ServicePlan,
  ServicePlanItem,
  ServicePlanItemType,
  ServiceAssignment,
  Person,
} from '@/shared/types'

// ── Songs ──────────────────────────────────────────────────────────────────────

export async function getSongs(): Promise<Song[]> {
  return db.getSongs()
}

export async function getSong(id: string): Promise<Song | null> {
  return db.getSong(id)
}

export async function createSong(data: {
  title: string
  artist?: string
  key?: string
  bpm?: number
  lyrics?: string
  ccli_number?: string
  tags?: string[]
  youtube_url?: string
}): Promise<Song> {
  return db.createSong({ ...data, is_active: true })
}

export async function updateSong(id: string, data: Partial<Omit<Song, 'id' | 'church_id' | 'created_at' | 'updated_at'>>): Promise<Song> {
  return db.updateSong(id, data)
}

export async function deleteSong(id: string): Promise<void> {
  return db.deleteSong(id)
}

const SEED_IDS = new Set([
  'song-amazing-grace',
  'song-how-great-thou-art',
  'song-great-is-thy-faithfulness',
  'song-it-is-well',
  'song-holy-holy-holy',
  'song-be-thou-my-vision',
])

/**
 * Removes junk songs from localStorage (e.g. bad CSV imports) while preserving:
 *   - The 6 seeded hymns (by ID)
 *   - Any song with an uploaded file (chord_chart_url or pdf_urls)
 * Returns the number of songs removed.
 */
export function cleanupImportedSongs(): number {
  const SONGS_LS_KEY = 'gather_songs'
  let all: import('@/shared/types').Song[]
  try {
    all = JSON.parse(localStorage.getItem(SONGS_LS_KEY) ?? '[]') as import('@/shared/types').Song[]
  } catch {
    return 0
  }
  const keep = all.filter(s =>
    SEED_IDS.has(s.id) ||
    !!s.chord_chart_url ||
    (s.pdf_urls?.length ?? 0) > 0
  )
  const removed = all.length - keep.length
  if (removed > 0) {
    localStorage.setItem(SONGS_LS_KEY, JSON.stringify(keep))
  }
  return removed
}

export async function searchSongs(query: string): Promise<Song[]> {
  const songs = await db.getSongs()
  if (!query.trim()) return songs
  const q = query.toLowerCase()
  return songs.filter(s =>
    s.title.toLowerCase().includes(q) ||
    s.artist?.toLowerCase().includes(q) ||
    s.key?.toLowerCase().includes(q) ||
    s.tags?.some(t => t.toLowerCase().includes(q))
  )
}

// ── Service Plans ──────────────────────────────────────────────────────────────

export async function getServicePlans(): Promise<ServicePlan[]> {
  return db.getServicePlans()
}

export async function getServicePlan(id: string): Promise<ServicePlan | null> {
  return db.getServicePlan(id)
}

export async function createServicePlan(data: {
  name: string
  service_date: string
  service_time_id?: string
  created_by: string
}): Promise<ServicePlan> {
  return db.createServicePlan({ ...data, is_finalized: false })
}

export async function updateServicePlan(id: string, data: Partial<Omit<ServicePlan, 'id' | 'church_id' | 'created_at' | 'updated_at'>>): Promise<ServicePlan> {
  return db.updateServicePlan(id, data)
}

export async function finalizeServicePlan(id: string): Promise<ServicePlan> {
  return db.updateServicePlan(id, { is_finalized: true })
}

export async function deleteServicePlan(id: string): Promise<void> {
  return db.deleteServicePlan(id)
}

// ── Service Plan Items ─────────────────────────────────────────────────────────

export async function getServicePlanItems(planId: string): Promise<ServicePlanItem[]> {
  return db.getServicePlanItems(planId)
}

export async function addServicePlanItem(planId: string, data: {
  item_type: ServicePlanItemType
  duration_minutes?: number
  song_id?: string
  song_leader_id?: string
  scripture_reference?: string
  reader_id?: string
  sermon_title?: string
  preacher_id?: string
  label?: string
  notes?: string
}): Promise<ServicePlanItem> {
  const existing = await db.getServicePlanItems(planId)
  const position = existing.length > 0 ? Math.max(...existing.map(i => i.position)) + 1 : 0
  return db.createServicePlanItem({ plan_id: planId, position, ...data })
}

export async function updateServicePlanItem(
  id: string,
  data: Partial<Omit<ServicePlanItem, 'id' | 'church_id' | 'plan_id'>>,
): Promise<ServicePlanItem> {
  return db.updateServicePlanItem(id, data)
}

export async function deleteServicePlanItem(id: string): Promise<void> {
  return db.deleteServicePlanItem(id)
}

export async function reorderServicePlanItems(planId: string, orderedIds: string[]): Promise<void> {
  return db.reorderServicePlanItems(planId, orderedIds)
}

// ── Service Assignments ────────────────────────────────────────────────────────

export async function getServiceAssignments(planId: string): Promise<ServiceAssignment[]> {
  return db.getServiceAssignments(planId)
}

export async function addServiceAssignment(planId: string, personId: string, role: string): Promise<ServiceAssignment> {
  return db.createServiceAssignment({ plan_id: planId, person_id: personId, role })
}

export async function removeServiceAssignment(id: string): Promise<void> {
  return db.deleteServiceAssignment(id)
}

export interface EnrichedServicePlan {
  plan: ServicePlan
  items: ServicePlanItem[]
  assignments: Array<{ assignment: ServiceAssignment; person: Person | null }>
  totalMinutes: number
}

export async function getEnrichedServicePlan(planId: string): Promise<EnrichedServicePlan | null> {
  const plan = await db.getServicePlan(planId)
  if (!plan) return null
  const [items, assignments] = await Promise.all([
    db.getServicePlanItems(planId),
    db.getServiceAssignments(planId),
  ])
  const enrichedAssignments = await Promise.all(
    assignments.map(async a => ({
      assignment: a,
      person: await db.getPerson(a.person_id),
    }))
  )
  const totalMinutes = items.reduce((sum, i) => sum + (i.duration_minutes ?? 0), 0)
  return { plan, items, assignments: enrichedAssignments, totalMinutes }
}

// ── Run sheet generation ───────────────────────────────────────────────────────

export interface RunSheetLine {
  startTime: string
  item: ServicePlanItem
  songTitle?: string
  leaderName?: string
  readerName?: string
  preacherName?: string
}

/**
 * Build run sheet lines from a plan, computing timestamps from service start.
 * startTimeStr is HH:MM (24h), e.g. "10:30"
 */
export async function buildRunSheet(planId: string, startTimeStr: string): Promise<RunSheetLine[]> {
  const items = await db.getServicePlanItems(planId)
  const lines: RunSheetLine[] = []
  let [hours, minutes] = startTimeStr.split(':').map(Number)

  for (const item of items) {
    const hh = String(hours).padStart(2, '0')
    const mm = String(minutes).padStart(2, '0')
    const startTime = `${hh}:${mm}`

    let songTitle: string | undefined
    let leaderName: string | undefined
    let readerName: string | undefined
    let preacherName: string | undefined

    if (item.song_id) {
      const song = await db.getSong(item.song_id)
      songTitle = song?.title
    }
    if (item.song_leader_id) {
      const p = await db.getPerson(item.song_leader_id)
      leaderName = p ? `${p.first_name} ${p.last_name}` : undefined
    }
    if (item.reader_id) {
      const p = await db.getPerson(item.reader_id)
      readerName = p ? `${p.first_name} ${p.last_name}` : undefined
    }
    if (item.preacher_id) {
      const p = await db.getPerson(item.preacher_id)
      preacherName = p ? `${p.first_name} ${p.last_name}` : undefined
    }

    lines.push({ startTime, item, songTitle, leaderName, readerName, preacherName })

    const dur = item.duration_minutes ?? 0
    minutes += dur
    while (minutes >= 60) { minutes -= 60; hours++ }
  }

  return lines
}
