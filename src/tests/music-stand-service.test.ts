import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services'
import {
  getMyServicePlans,
  getSongsForPlan,
  getPdfAttachments,
  getAnnotationsForSong,
  createAnnotation,
  deleteAnnotation,
  getPdfPreferences,
  savePdfPreferences,
  cachePlanData,
  getCachedPlan,
  getCachedPlanIds,
  clearPlanCache,
} from '@/features/stand/music-stand-service'
import { AccessTier } from '@/shared/types'
import type { AppUser, Song, ServicePlan } from '@/shared/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function staffUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    uid: 'user-staff-1',
    tier: AccessTier.Staff,
    isFinanceAdmin: false,
    church_id: 'church-test-default',
    personId: 'person-staff-1',
    email: 'staff@test.com',
    ...overrides,
  }
}

function volunteerUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    uid: 'user-vol-1',
    tier: AccessTier.Authenticated,
    isFinanceAdmin: false,
    church_id: 'church-test-default',
    personId: 'person-vol-1',
    email: 'vol@test.com',
    ...overrides,
  }
}

function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function makePlan(daysFromNow = 7): Promise<ServicePlan> {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  const dateStr = localDateStr(d)
  return db.createServicePlan({
    name: `Service ${dateStr}`,
    service_date: dateStr,
    is_finalized: false,
    created_by: 'user-1',
  })
}

async function makeSong(overrides: Partial<Song> = {}): Promise<Song> {
  return db.createSong({
    title: 'Test Song',
    key: 'G',
    bpm: 120,
    is_active: true,
    ...overrides,
  })
}

// ── Clean state between tests ─────────────────────────────────────────────────

beforeEach(async () => {
  const songs = await db.getSongs()
  for (const s of songs) await db.deleteSong(s.id)

  const plans = await db.getServicePlans()
  for (const p of plans) await db.deleteServicePlan(p.id)

  // Clean up annotations for test users
  for (const uid of ['user-1', 'user-2', 'user-staff-1', 'user-vol-1']) {
    const anns = await db.getAnnotations({ user_id: uid })
    for (const a of anns) await db.deleteAnnotation(a.id)
  }
})

// ── Plan access ───────────────────────────────────────────────────────────────

describe('getMyServicePlans', () => {
  it('staff user sees all upcoming plans', async () => {
    await makePlan(3)
    await makePlan(10)
    const plans = await getMyServicePlans(staffUser())
    expect(plans.length).toBe(2)
  })

  it('staff user sees plans from the last 30 days', async () => {
    await makePlan(-15) // 15 days ago — within 30-day window
    await makePlan(5)
    const plans = await getMyServicePlans(staffUser())
    expect(plans.length).toBe(2)
  })

  it('staff user does NOT see plans older than 30 days', async () => {
    await makePlan(-31)
    const plans = await getMyServicePlans(staffUser())
    expect(plans.length).toBe(0)
  })

  it('plans are sorted by date ascending', async () => {
    const p2 = await makePlan(14)
    const p1 = await makePlan(7)
    const plans = await getMyServicePlans(staffUser())
    expect(plans[0].id).toBe(p1.id)
    expect(plans[1].id).toBe(p2.id)
  })

  it('volunteer user sees only plans they are assigned to', async () => {
    const plan1 = await makePlan(3)
    const plan2 = await makePlan(10)
    // Assign volunteer to plan1 only
    await db.createServiceAssignment({
      plan_id: plan1.id,
      person_id: 'person-vol-1',
      role: 'Musician',
    })

    const plans = await getMyServicePlans(volunteerUser())
    expect(plans.length).toBe(1)
    expect(plans[0].id).toBe(plan1.id)
    // plan2 not returned
    expect(plans.find(p => p.id === plan2.id)).toBeUndefined()
  })

  it('volunteer with no personId sees no plans', async () => {
    await makePlan(3)
    const plans = await getMyServicePlans(volunteerUser({ personId: undefined }))
    expect(plans.length).toBe(0)
  })
})

// ── Songs for plan ────────────────────────────────────────────────────────────

describe('getSongsForPlan', () => {
  it('returns songs in position order', async () => {
    const plan = await makePlan()
    const s1 = await makeSong({ title: 'Song A' })
    const s2 = await makeSong({ title: 'Song B' })
    await db.createServicePlanItem({ plan_id: plan.id, item_type: 'song', song_id: s1.id, position: 1 })
    await db.createServicePlanItem({ plan_id: plan.id, item_type: 'song', song_id: s2.id, position: 0 })

    const entries = await getSongsForPlan(plan.id)
    expect(entries[0].song.title).toBe('Song B') // position 0 first
    expect(entries[1].song.title).toBe('Song A')
  })

  it('excludes non-song items', async () => {
    const plan = await makePlan()
    const s = await makeSong()
    await db.createServicePlanItem({ plan_id: plan.id, item_type: 'song', song_id: s.id, position: 0 })
    await db.createServicePlanItem({ plan_id: plan.id, item_type: 'sermon', position: 1, sermon_title: 'The Word' })

    const entries = await getSongsForPlan(plan.id)
    expect(entries.length).toBe(1)
    expect(entries[0].song.id).toBe(s.id)
  })

  it('returns empty list for plan with no songs', async () => {
    const plan = await makePlan()
    const entries = await getSongsForPlan(plan.id)
    expect(entries).toHaveLength(0)
  })
})

// ── PDF attachments ───────────────────────────────────────────────────────────

describe('getPdfAttachments', () => {
  it('returns chord_chart_url as "Chord Chart"', async () => {
    const song = await makeSong({ chord_chart_url: 'https://example.com/chart.pdf' })
    const pdfs = getPdfAttachments(song)
    expect(pdfs).toHaveLength(1)
    expect(pdfs[0].label).toBe('Chord Chart')
    expect(pdfs[0].url).toBe('https://example.com/chart.pdf')
  })

  it('returns multiple PDFs from pdf_urls', async () => {
    const song = await makeSong({
      chord_chart_url: 'https://example.com/chart.pdf',
      pdf_urls: ['https://example.com/sheet.pdf'],
    })
    const pdfs = getPdfAttachments(song)
    expect(pdfs).toHaveLength(2)
    expect(pdfs[0].label).toBe('Chord Chart')
    expect(pdfs[1].label).toBe('PDF 2')
  })

  it('returns empty list for song with no PDF', async () => {
    const song = await makeSong({ chord_chart_url: undefined })
    const pdfs = getPdfAttachments(song)
    expect(pdfs).toHaveLength(0)
  })
})

// ── Annotations ───────────────────────────────────────────────────────────────

describe('annotations', () => {
  it('creates and retrieves annotations for a song', async () => {
    const annotation = await createAnnotation({
      userId: 'user-1',
      songId: 'song-abc',
      pdfUrl: 'https://example.com/chart.pdf',
      pageNumber: 0,
      tool: 'highlighter',
      color: '#FACC15',
      data: 'M 10 10 L 100 100',
    })
    expect(annotation.id).toBeTruthy()
    expect(annotation.tool).toBe('highlighter')

    const results = await getAnnotationsForSong('user-1', 'song-abc')
    expect(results.length).toBe(1)
    expect(results[0].id).toBe(annotation.id)
  })

  it('filters annotations by PDF url', async () => {
    await createAnnotation({
      userId: 'user-1', songId: 'song-abc',
      pdfUrl: 'https://example.com/chart.pdf', pageNumber: 0,
      tool: 'pen', color: '#fff', data: 'M0 0',
    })
    await createAnnotation({
      userId: 'user-1', songId: 'song-abc',
      pdfUrl: 'https://example.com/sheet.pdf', pageNumber: 0,
      tool: 'text', color: '#fff', data: 'Note here',
    })

    const results = await getAnnotationsForSong('user-1', 'song-abc', 'https://example.com/chart.pdf')
    expect(results.length).toBe(1)
  })

  it('deletes an annotation', async () => {
    const a = await createAnnotation({
      userId: 'user-1', songId: 'song-abc',
      pdfUrl: 'https://example.com/chart.pdf', pageNumber: 0,
      tool: 'text', color: '#fff', data: 'Hello',
    })
    await deleteAnnotation(a.id)
    const results = await getAnnotationsForSong('user-1', 'song-abc')
    expect(results.length).toBe(0)
  })

  it('annotations are user-scoped', async () => {
    await createAnnotation({
      userId: 'user-1', songId: 'song-abc',
      pdfUrl: 'https://example.com/chart.pdf', pageNumber: 0,
      tool: 'pen', color: '#fff', data: 'M0 0',
    })
    const user2Results = await getAnnotationsForSong('user-2', 'song-abc')
    expect(user2Results.length).toBe(0)
  })
})

// ── PDF preferences ───────────────────────────────────────────────────────────

describe('PDF preferences', () => {
  it('returns null for unknown user+pdf combination', async () => {
    const prefs = await getPdfPreferences('unknown-user', 'https://example.com/chart.pdf')
    expect(prefs).toBeNull()
  })

  it('saves and retrieves PDF preferences', async () => {
    const saved = await savePdfPreferences(
      'user-1',
      'https://example.com/chart.pdf',
      { zoom_level: 1.5, page_order: [0, 2, 1] }
    )
    expect(saved.zoom_level).toBe(1.5)
    expect(saved.page_order).toEqual([0, 2, 1])

    const retrieved = await getPdfPreferences('user-1', 'https://example.com/chart.pdf')
    expect(retrieved?.zoom_level).toBe(1.5)
  })

  it('updates existing preferences on save', async () => {
    await savePdfPreferences('user-1', 'https://example.com/chart.pdf', { zoom_level: 1.5 })
    const updated = await savePdfPreferences('user-1', 'https://example.com/chart.pdf', { zoom_level: 2.0 })
    expect(updated.zoom_level).toBe(2.0)

    const all = await db.getUserPdfPreferences('user-1', 'https://example.com/chart.pdf')
    expect(all?.zoom_level).toBe(2.0)
  })
})

// ── Offline cache ─────────────────────────────────────────────────────────────

describe('offline cache', () => {
  it('stores and retrieves plan data', () => {
    cachePlanData('plan-1', { plan: { id: 'plan-1', name: 'Test' }, songs: [] })
    const cached = getCachedPlan('plan-1')
    expect(cached).not.toBeNull()
    expect(cached.plan.id).toBe('plan-1')
  })

  it('lists cached plan IDs', () => {
    cachePlanData('plan-A', { songs: [] })
    cachePlanData('plan-B', { songs: [] })
    const ids = getCachedPlanIds()
    expect(ids).toContain('plan-A')
    expect(ids).toContain('plan-B')
  })

  it('clears a specific plan from cache', () => {
    cachePlanData('plan-X', { songs: [] })
    clearPlanCache('plan-X')
    expect(getCachedPlan('plan-X')).toBeNull()
  })

  it('caching the same plan overwrites the previous entry', () => {
    cachePlanData('plan-1', { version: 1 })
    cachePlanData('plan-1', { version: 2 })
    const cached = getCachedPlan('plan-1')
    expect(cached.version).toBe(2)
    expect(getCachedPlanIds().filter(id => id === 'plan-1').length).toBe(1)
  })
})
