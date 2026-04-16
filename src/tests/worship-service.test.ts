import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services'
import {
  createSong,
  updateSong,
  deleteSong,
  searchSongs,
  createServicePlan,
  updateServicePlan,
  deleteServicePlan,
  getServicePlanItems,
  addServicePlanItem,
  updateServicePlanItem,
  deleteServicePlanItem,
  reorderServicePlanItems,
  addServiceAssignment,
  removeServiceAssignment,
  getEnrichedServicePlan,
  buildRunSheet,
} from '@/features/worship/worship-service'

beforeEach(async () => {
  const songs = await db.getSongs()
  for (const s of songs) await db.deleteSong(s.id)

  const plans = await db.getServicePlans()
  for (const p of plans) await db.deleteServicePlan(p.id)
})

// ── Song CRUD ─────────────────────────────────────────────────────────────────

describe('worship-service: songs', () => {
  it('creates and retrieves a song', async () => {
    const song = await createSong({ title: 'Amazing Grace', artist: 'Traditional', key: 'G', tags: ['classic'] })
    expect(song.title).toBe('Amazing Grace')
    expect(song.key).toBe('G')
    const songs = await db.getSongs()
    expect(songs.find(s => s.id === song.id)).toBeDefined()
  })

  it('updates a song', async () => {
    const song = await createSong({ title: 'Old Title', artist: 'Artist' })
    const updated = await updateSong(song.id, { title: 'New Title', bpm: 120 })
    expect(updated.title).toBe('New Title')
    expect(updated.bpm).toBe(120)
  })

  it('deletes a song', async () => {
    const song = await createSong({ title: 'To Delete', artist: 'Test' })
    await deleteSong(song.id)
    const songs = await db.getSongs()
    expect(songs.find(s => s.id === song.id)).toBeUndefined()
  })

  it('searches songs by title (case insensitive)', async () => {
    await createSong({ title: 'How Great Thou Art', artist: 'Carl Boberg' })
    await createSong({ title: 'Amazing Grace', artist: 'Traditional' })
    const results = await searchSongs('great')
    expect(results.length).toBe(1)
    expect(results[0].title).toBe('How Great Thou Art')
  })

  it('returns all songs when query is empty', async () => {
    await createSong({ title: 'Song A', artist: 'Artist A' })
    await createSong({ title: 'Song B', artist: 'Artist B' })
    const results = await searchSongs('')
    expect(results.length).toBeGreaterThanOrEqual(2)
  })
})

// ── Service Plans ──────────────────────────────────────────────────────────────

describe('worship-service: service plans', () => {
  it('creates a service plan with is_finalized=false', async () => {
    const plan = await createServicePlan({
      name: 'Sunday Morning',
      service_date: '2026-04-13',
      created_by: 'user-1',
    })
    expect(plan.name).toBe('Sunday Morning')
    expect(plan.is_finalized).toBe(false)
    expect(plan.service_date).toBe('2026-04-13')
  })

  it('updates a service plan', async () => {
    const plan = await createServicePlan({ name: 'Draft Plan', service_date: '2026-04-13', created_by: 'user-1' })
    const updated = await updateServicePlan(plan.id, { name: 'Updated Plan', service_time_id: 'st-1' })
    expect(updated.name).toBe('Updated Plan')
    expect(updated.service_time_id).toBe('st-1')
  })

  it('deletes a service plan', async () => {
    const plan = await createServicePlan({ name: 'To Delete', service_date: '2026-04-13', created_by: 'user-1' })
    await deleteServicePlan(plan.id)
    const plans = await db.getServicePlans()
    expect(plans.find(p => p.id === plan.id)).toBeUndefined()
  })

  it('adds items to a plan with auto-position', async () => {
    const plan = await createServicePlan({ name: 'Plan With Items', service_date: '2026-04-13', created_by: 'user-1' })
    const item1 = await addServicePlanItem(plan.id, { item_type: 'song',   duration_minutes: 5 })
    const item2 = await addServicePlanItem(plan.id, { item_type: 'sermon', sermon_title: 'The Message', duration_minutes: 40 })
    expect(item1.position).toBe(0)
    expect(item2.position).toBe(1)
  })

  it('updates a plan item', async () => {
    const plan = await createServicePlan({ name: 'Plan', service_date: '2026-04-13', created_by: 'user-1' })
    const item = await addServicePlanItem(plan.id, { item_type: 'song', duration_minutes: 5 })
    const updated = await updateServicePlanItem(item.id, { duration_minutes: 7, notes: 'Key change' })
    expect(updated.duration_minutes).toBe(7)
    expect(updated.notes).toBe('Key change')
  })

  it('deletes a plan item', async () => {
    const plan = await createServicePlan({ name: 'Plan', service_date: '2026-04-13', created_by: 'user-1' })
    const item = await addServicePlanItem(plan.id, { item_type: 'custom', label: 'Announcements', duration_minutes: 5 })
    await deleteServicePlanItem(item.id)
    const items = await getServicePlanItems(plan.id)
    expect(items.find(i => i.id === item.id)).toBeUndefined()
  })

  it('reorders plan items', async () => {
    const plan = await createServicePlan({ name: 'Plan', service_date: '2026-04-13', created_by: 'user-1' })
    const item1 = await addServicePlanItem(plan.id, { item_type: 'song',   duration_minutes: 5 })
    const item2 = await addServicePlanItem(plan.id, { item_type: 'sermon', duration_minutes: 30 })
    await reorderServicePlanItems(plan.id, [item2.id, item1.id])
    const items = await getServicePlanItems(plan.id)
    expect(items[0].id).toBe(item2.id)
    expect(items[1].id).toBe(item1.id)
  })
})

// ── Enriched Plan ─────────────────────────────────────────────────────────────

describe('worship-service: enriched plan', () => {
  it('returns enriched plan with items and total minutes', async () => {
    const plan = await createServicePlan({ name: 'Full Service', service_date: '2026-04-13', created_by: 'user-1' })
    await addServicePlanItem(plan.id, { item_type: 'song',   duration_minutes: 5 })
    await addServicePlanItem(plan.id, { item_type: 'sermon', duration_minutes: 35 })
    const enriched = await getEnrichedServicePlan(plan.id)
    expect(enriched).not.toBeNull()
    expect(enriched!.items.length).toBe(2)
    expect(enriched!.totalMinutes).toBe(40)
  })

  it('returns null for unknown plan id', async () => {
    const enriched = await getEnrichedServicePlan('nonexistent')
    expect(enriched).toBeNull()
  })
})

// ── Run Sheet ──────────────────────────────────────────────────────────────────

describe('worship-service: run sheet', () => {
  it('builds a run sheet with 24h timestamps', async () => {
    const plan = await createServicePlan({ name: 'Sunday', service_date: '2026-04-13', created_by: 'user-1' })
    await addServicePlanItem(plan.id, { item_type: 'song',   duration_minutes: 5 })
    await addServicePlanItem(plan.id, { item_type: 'sermon', duration_minutes: 40 })
    const sheet = await buildRunSheet(plan.id, '09:00')
    expect(sheet[0].startTime).toBe('09:00')
    expect(sheet[1].startTime).toBe('09:05')
  })

  it('handles minute overflow into next hour', async () => {
    const plan = await createServicePlan({ name: 'Late Service', service_date: '2026-04-13', created_by: 'user-1' })
    await addServicePlanItem(plan.id, { item_type: 'song',   duration_minutes: 5 })
    await addServicePlanItem(plan.id, { item_type: 'sermon', duration_minutes: 60 })
    const sheet = await buildRunSheet(plan.id, '11:55')
    expect(sheet[0].startTime).toBe('11:55')
    expect(sheet[1].startTime).toBe('12:00')
  })

  it('returns empty array for plan with no items', async () => {
    const plan = await createServicePlan({ name: 'Empty Plan', service_date: '2026-04-13', created_by: 'user-1' })
    const sheet = await buildRunSheet(plan.id, '09:00')
    expect(sheet).toHaveLength(0)
  })
})

// ── Service Assignments ───────────────────────────────────────────────────────

describe('worship-service: service assignments', () => {
  it('adds and removes service assignments', async () => {
    const plan = await createServicePlan({ name: 'Assign Test', service_date: '2026-04-13', created_by: 'user-1' })
    const assignment = await addServiceAssignment(plan.id, 'person-1', 'Worship Leader')
    expect(assignment.role).toBe('Worship Leader')
    expect(assignment.person_id).toBe('person-1')

    await removeServiceAssignment(assignment.id)
    const assignments = await db.getServiceAssignments(plan.id)
    expect(assignments.find(a => a.id === assignment.id)).toBeUndefined()
  })

  it('can add multiple assignments to a plan', async () => {
    const plan = await createServicePlan({ name: 'Multi Assign', service_date: '2026-04-13', created_by: 'user-1' })
    await addServiceAssignment(plan.id, 'person-1', 'Worship Leader')
    await addServiceAssignment(plan.id, 'person-2', 'Sound Technician')
    const assignments = await db.getServiceAssignments(plan.id)
    expect(assignments.length).toBe(2)
  })
})
