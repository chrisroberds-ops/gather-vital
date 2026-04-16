import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  submitVisitorForm,
  getActivePipelines,
  completeStep,
  skipStep,
  getVisitorStats,
} from '@/features/visitors/visitor-service'
import { db } from '@/services'

// Silence notification logs in these tests
beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined))
afterEach(() => vi.restoreAllMocks())

// ── submitVisitorForm ─────────────────────────────────────────────────────────

describe('submitVisitorForm', () => {
  it('creates a new person and followup steps for a first-time visitor', async () => {
    const result = await submitVisitorForm({
      first_name: 'Alice',
      last_name: 'Visitor',
      phone: '555-100-0001',
      email: 'alice@test.com',
    })

    expect(result.alreadyInPipeline).toBe(false)
    expect(result.followupsCreated).toBeGreaterThan(0)
    expect(result.person.first_name).toBe('Alice')
    expect(result.person.membership_status).toBe('visitor')
    expect(result.person.first_visit_date).toBeTruthy()
  })

  it('finds existing person by phone and skips creation', async () => {
    const phone = '555-200-0002'
    const first = await submitVisitorForm({ first_name: 'Bob', last_name: 'Smith', phone })
    const second = await submitVisitorForm({ first_name: 'Bob', last_name: 'Smith', phone })

    expect(second.person.id).toBe(first.person.id)
    expect(second.alreadyInPipeline).toBe(true)
    expect(second.followupsCreated).toBe(0)
  })

  it('finds existing person by email when no phone provided', async () => {
    const email = 'carol@test.com'
    const first = await submitVisitorForm({ first_name: 'Carol', last_name: 'Jones', email })
    const second = await submitVisitorForm({ first_name: 'Carol', last_name: 'Jones', email })

    expect(second.person.id).toBe(first.person.id)
    expect(second.alreadyInPipeline).toBe(true)
  })

  it('creates one step per active template', async () => {
    const templates = await db.getFollowupTemplates()
    const result = await submitVisitorForm({
      first_name: 'Dan',
      last_name: 'New',
      phone: '555-300-0003',
    })

    expect(result.followupsCreated).toBe(templates.length)

    const followups = await db.getVisitorFollowups(result.person.id)
    expect(followups).toHaveLength(templates.length)
    expect(followups.every(f => f.status === 'pending')).toBe(true)
  })

  it('stores visitor_source on new person', async () => {
    const result = await submitVisitorForm({
      first_name: 'Eve',
      last_name: 'Source',
      phone: '555-400-0004',
      visitor_source: 'Friend or family',
    })
    expect(result.person.visitor_source).toBe('Friend or family')
  })

  it('due dates are offset by template delay_days from today', async () => {
    const today = new Date().toISOString().split('T')[0]
    const result = await submitVisitorForm({ first_name: 'Frank', last_name: 'Dates', phone: '555-500-0005' })
    const followups = await db.getVisitorFollowups(result.person.id)
    const step1 = followups.find(f => f.step_number === 1)
    expect(step1?.due_date).toBe(today) // delay_days: 0
  })
})

// ── getActivePipelines ────────────────────────────────────────────────────────

describe('getActivePipelines', () => {
  it('returns a pipeline entry for each person with followups', async () => {
    await submitVisitorForm({ first_name: 'Grace', last_name: 'P1', phone: '555-600-0006' })
    await submitVisitorForm({ first_name: 'Henry', last_name: 'P2', phone: '555-600-0007' })

    const pipelines = await getActivePipelines()
    const names = pipelines.map(p => p.person.first_name)
    expect(names).toContain('Grace')
    expect(names).toContain('Henry')
  })

  it('isComplete is false when any step is pending', async () => {
    const { person } = await submitVisitorForm({ first_name: 'Iris', last_name: 'Inc', phone: '555-700-0008' })
    const pipelines = await getActivePipelines()
    const pipeline = pipelines.find(p => p.person.id === person.id)
    expect(pipeline?.isComplete).toBe(false)
  })

  it('isComplete is true when all steps are completed or skipped', async () => {
    const { person } = await submitVisitorForm({ first_name: 'Jack', last_name: 'Done', phone: '555-700-0009' })
    const followups = await db.getVisitorFollowups(person.id)
    await Promise.all(followups.map(f => completeStep(f.id, 'staff-1')))

    const pipelines = await getActivePipelines()
    const pipeline = pipelines.find(p => p.person.id === person.id)
    expect(pipeline?.isComplete).toBe(true)
  })

  it('nextStep points to the first pending step', async () => {
    const { person } = await submitVisitorForm({ first_name: 'Kate', last_name: 'Next', phone: '555-800-0010' })
    const followups = await db.getVisitorFollowups(person.id)
    const sorted = [...followups].sort((a, b) => a.step_number - b.step_number)

    // Complete the first step
    await completeStep(sorted[0].id, 'staff-1')

    const pipelines = await getActivePipelines()
    const pipeline = pipelines.find(p => p.person.id === person.id)
    expect(pipeline?.nextStep?.step_number).toBe(sorted[1].step_number)
  })

  it('active pipelines sort before complete ones', async () => {
    const { person: pa } = await submitVisitorForm({ first_name: 'Leo', last_name: 'Active', phone: '555-900-0011' })
    const { person: pc } = await submitVisitorForm({ first_name: 'Mia', last_name: 'Complete', phone: '555-900-0012' })
    const completedFollowups = await db.getVisitorFollowups(pc.id)
    await Promise.all(completedFollowups.map(f => completeStep(f.id, 'staff-1')))

    const pipelines = await getActivePipelines()
    const idxActive = pipelines.findIndex(p => p.person.id === pa.id)
    const idxComplete = pipelines.findIndex(p => p.person.id === pc.id)
    expect(idxActive).toBeLessThan(idxComplete)
  })
})

// ── completeStep / skipStep ───────────────────────────────────────────────────

describe('completeStep', () => {
  it('marks a step as completed with completed_at and completed_by', async () => {
    const { person } = await submitVisitorForm({ first_name: 'Nina', last_name: 'C', phone: '555-010-0013' })
    const [step] = await db.getVisitorFollowups(person.id)
    const updated = await completeStep(step.id, 'staff-user-1', 'Called and left voicemail')

    expect(updated.status).toBe('completed')
    expect(updated.completed_by).toBe('staff-user-1')
    expect(updated.notes).toBe('Called and left voicemail')
    expect(updated.completed_at).toBeTruthy()
  })

  it('completeStep without notes still sets completed_at', async () => {
    const { person } = await submitVisitorForm({ first_name: 'Owen', last_name: 'C', phone: '555-011-0014' })
    const [step] = await db.getVisitorFollowups(person.id)
    const updated = await completeStep(step.id, 'staff-1')
    expect(updated.status).toBe('completed')
    expect(updated.completed_at).toBeTruthy()
  })
})

describe('skipStep', () => {
  it('marks a step as skipped', async () => {
    const { person } = await submitVisitorForm({ first_name: 'Pam', last_name: 'S', phone: '555-012-0015' })
    const [step] = await db.getVisitorFollowups(person.id)
    const updated = await skipStep(step.id)
    expect(updated.status).toBe('skipped')
  })
})

// ── getVisitorStats ───────────────────────────────────────────────────────────

describe('getVisitorStats', () => {
  it('total counts distinct people with followup steps', async () => {
    const beforeStats = await getVisitorStats()
    await submitVisitorForm({ first_name: 'Quinn', last_name: 'Stats', phone: '555-020-0016' })
    const afterStats = await getVisitorStats()
    expect(afterStats.total).toBeGreaterThan(beforeStats.total)
  })

  it('activePipelines increases when a new visitor is added', async () => {
    const before = await getVisitorStats()
    await submitVisitorForm({ first_name: 'Ray', last_name: 'Active', phone: '555-021-0017' })
    const after = await getVisitorStats()
    expect(after.activePipelines).toBeGreaterThan(before.activePipelines)
  })

  it('activePipelines decreases when all steps are completed', async () => {
    const { person } = await submitVisitorForm({ first_name: 'Sue', last_name: 'Done', phone: '555-022-0018' })
    const before = await getVisitorStats()

    const followups = await db.getVisitorFollowups(person.id)
    await Promise.all(followups.map(f => completeStep(f.id, 'staff-1')))

    const after = await getVisitorStats()
    expect(after.activePipelines).toBeLessThan(before.activePipelines)
  })
})
