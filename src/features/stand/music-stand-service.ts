/**
 * Music Stand service — core business logic for the musician-facing stand view.
 *
 * Connects to the existing Worship Planning module's song library and service
 * plans. All data access goes through the db layer so TEST_MODE works without
 * any Firebase credentials.
 */

import { db } from '@/services'
import { AccessTier } from '@/shared/types'
import type {
  AppUser,
  ServicePlan,
  ServicePlanItem,
  Song,
  MusicStandAnnotation,
  UserPdfPreferences,
  AnnotationTool,
} from '@/shared/types'

// ── Plan Access ───────────────────────────────────────────────────────────────

const HISTORY_DAYS = 30

/** Returns a YYYY-MM-DD string in the local timezone — matches service_date format. */
function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Returns service plans visible to the user:
 * - Staff+ → all plans within the last 30 days + today + future
 * - Volunteer → only plans they are assigned to
 * Sorted by service_date ascending.
 *
 * Notes:
 * - service_date is a plain local date string (YYYY-MM-DD), never a timestamp.
 * - service_time_id is optional and has NO effect on which plans are returned.
 * - Cutoff uses local date arithmetic to avoid UTC-offset off-by-one errors.
 */
export async function getMyServicePlans(user: AppUser): Promise<ServicePlan[]> {
  const allPlans = await db.getServicePlans()

  // Build cutoff in local time so it matches service_date (also local).
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - HISTORY_DAYS)
  const cutoffStr = localDateStr(cutoff)

  // Include today and the last 30 days. service_time_id is not considered.
  const relevant = allPlans.filter(p => p.service_date >= cutoffStr)

  if (user.tier >= AccessTier.Staff) {
    return relevant.sort((a, b) => a.service_date.localeCompare(b.service_date))
  }

  // Volunteers see only assigned plans
  if (!user.personId) return []
  const allAssignments = await Promise.all(relevant.map(p => db.getServiceAssignments(p.id)))
  const personId = user.personId

  return relevant
    .filter((_, idx) => allAssignments[idx].some(a => a.person_id === personId))
    .sort((a, b) => a.service_date.localeCompare(b.service_date))
}

// ── Songs for Plan ────────────────────────────────────────────────────────────

export interface PlanSongEntry {
  item: ServicePlanItem
  song: Song
}

/**
 * Returns the ordered list of songs in a service plan (non-song items excluded).
 */
export async function getSongsForPlan(planId: string): Promise<PlanSongEntry[]> {
  const items = await db.getServicePlanItems(planId)
  const songItems = items
    .filter(i => i.item_type === 'song' && i.song_id)
    .sort((a, b) => a.position - b.position)

  const songs = await Promise.all(songItems.map(i => db.getSong(i.song_id!)))

  return songItems
    .map((item, idx) => ({ item, song: songs[idx] }))
    .filter((entry): entry is PlanSongEntry => entry.song !== null)
}

// ── PDF Attachments ───────────────────────────────────────────────────────────

export interface PdfAttachment {
  label: string
  url: string
}

/**
 * Derives the list of available PDF attachments for a song.
 * - chord_chart_url → "Chord Chart"
 * - pdf_urls → "PDF 2", "PDF 3", …
 */
export function getPdfAttachments(song: Song): PdfAttachment[] {
  const pdfs: PdfAttachment[] = []
  if (song.chord_chart_url) {
    pdfs.push({ label: 'Chord Chart', url: song.chord_chart_url })
  }
  song.pdf_urls?.forEach((url, i) => {
    pdfs.push({ label: `PDF ${i + 2}`, url })
  })
  return pdfs
}

// ── Annotations ───────────────────────────────────────────────────────────────

export async function getAnnotationsForSong(
  userId: string,
  songId: string,
  pdfUrl?: string
): Promise<MusicStandAnnotation[]> {
  return db.getAnnotations({ user_id: userId, song_id: songId, pdf_url: pdfUrl })
}

export async function createAnnotation(input: {
  userId: string
  songId: string
  pdfUrl: string
  pageNumber: number
  tool: AnnotationTool
  color: string
  data: string
}): Promise<MusicStandAnnotation> {
  return db.createAnnotation({
    user_id: input.userId,
    song_id: input.songId,
    pdf_url: input.pdfUrl,
    page_number: input.pageNumber,
    tool: input.tool,
    color: input.color,
    data: input.data,
  })
}

export async function deleteAnnotation(id: string): Promise<void> {
  return db.deleteAnnotation(id)
}

// ── PDF Preferences ───────────────────────────────────────────────────────────

export async function getPdfPreferences(
  userId: string,
  pdfUrl: string
): Promise<UserPdfPreferences | null> {
  return db.getUserPdfPreferences(userId, pdfUrl)
}

export async function savePdfPreferences(
  userId: string,
  pdfUrl: string,
  prefs: { zoom_level?: number; page_order?: number[] }
): Promise<UserPdfPreferences> {
  const existing = await db.getUserPdfPreferences(userId, pdfUrl)
  return db.saveUserPdfPreferences({
    user_id: userId,
    pdf_url: pdfUrl,
    zoom_level: prefs.zoom_level ?? existing?.zoom_level ?? 1,
    page_order: prefs.page_order ?? existing?.page_order ?? [],
  })
}

// ── Offline Cache ─────────────────────────────────────────────────────────────

const OFFLINE_CACHE_KEY = 'gather_stand_cache'
const MAX_CACHED_PLANS = 10

interface CachedPlanEntry {
  plan_id: string
  cached_at: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
}

function readCache(): CachedPlanEntry[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_CACHE_KEY) ?? '[]') as CachedPlanEntry[]
  } catch { return [] }
}

function writeCache(entries: CachedPlanEntry[]): void {
  try {
    localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(entries))
  } catch {}
}

export function getCachedPlanIds(): string[] {
  return readCache().map(e => e.plan_id)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getCachedPlan(planId: string): any | null {
  return readCache().find(e => e.plan_id === planId)?.data ?? null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cachePlanData(planId: string, data: any): void {
  const entries = readCache().filter(e => e.plan_id !== planId)
  entries.unshift({ plan_id: planId, cached_at: new Date().toISOString(), data })
  writeCache(entries.slice(0, MAX_CACHED_PLANS))
}

export function clearPlanCache(planId: string): void {
  writeCache(readCache().filter(e => e.plan_id !== planId))
}

/**
 * Downloads all songs + PDFs for a plan and stores them in the cache.
 * In TEST_MODE, just caches the plan data (no actual binary download).
 */
export async function syncPlanForOffline(
  planId: string,
  plan: ServicePlan,
  songs: PlanSongEntry[]
): Promise<void> {
  cachePlanData(planId, { plan, songs })
}
