import { db } from '@/services'
import { sendSMS, sendEmail } from '@/services/notification-service'
import type { Person, VisitorFollowup, FollowupTemplate } from '@/shared/types'

// ── Visitor form submission ───────────────────────────────────────────────────

export interface VisitorFormData {
  first_name: string
  last_name: string
  phone?: string
  email?: string
  visitor_source?: string
  address_line_1?: string
  city?: string
  state?: string
  zip?: string
}

export interface SubmitVisitorResult {
  person: Person
  followupsCreated: number
  alreadyInPipeline: boolean
}

export async function submitVisitorForm(data: VisitorFormData): Promise<SubmitVisitorResult> {
  const today = new Date().toISOString().split('T')[0]

  // Find existing person by phone or email; create if not found
  let person: Person | null = null
  if (data.phone) {
    const all = await db.getPeople()
    const normalised = data.phone.replace(/\D/g, '')
    person = all.find(p => p.phone?.replace(/\D/g, '') === normalised) ?? null
  }
  if (!person && data.email) {
    const all = await db.getPeople()
    person = all.find(p => p.email?.toLowerCase() === data.email!.toLowerCase()) ?? null
  }

  if (!person) {
    person = await db.createPerson({
      first_name: data.first_name,
      last_name: data.last_name,
      phone: data.phone ?? '',
      email: data.email,
      is_active: true,
      is_child: false,
      visitor_source: data.visitor_source,
      first_visit_date: today,
      membership_status: 'visitor',
    })
  } else {
    // Update first_visit_date if not already set
    if (!person.first_visit_date) {
      person = await db.updatePerson(person.id, {
        first_visit_date: today,
        membership_status: person.membership_status ?? 'visitor',
        visitor_source: data.visitor_source ?? person.visitor_source,
      })
    }
  }

  // Check if this person already has followup steps
  const existing = await db.getVisitorFollowups(person.id)
  if (existing.length > 0) {
    return { person, followupsCreated: 0, alreadyInPipeline: true }
  }

  // Create followup steps from templates
  const templates = await db.getFollowupTemplates()
  const sorted = [...templates].sort((a, b) => a.step_number - b.step_number)

  await Promise.all(
    sorted.map(t => {
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + t.delay_days)
      return db.createVisitorFollowup({
        person_id: person!.id,
        step_number: t.step_number,
        step_name: t.step_name,
        due_date: dueDate.toISOString().split('T')[0],
        status: 'pending',
      })
    })
  )

  // Send the step-1 (day 0) notification if it exists
  const step1 = sorted.find(t => t.delay_days === 0)
  if (step1 && person) {
    const text = step1.template_text.replace('{{first_name}}', person.first_name)
    if (step1.method === 'text' && person.phone) {
      await sendSMS({ to: person.phone, body: text })
    } else if (step1.method === 'email' && person.email) {
      await sendEmail({ to: person.email, subject: step1.step_name, body: text })
    }
  }

  return { person, followupsCreated: sorted.length, alreadyInPipeline: false }
}

// ── Pipeline view data ────────────────────────────────────────────────────────

export interface PersonPipeline {
  person: Person
  steps: VisitorFollowup[]
  nextStep: VisitorFollowup | null
  isComplete: boolean
  overdueCount: number
}

export async function getActivePipelines(): Promise<PersonPipeline[]> {
  const today = new Date().toISOString().split('T')[0]
  const allFollowups = await db.getVisitorFollowups()

  // Group by person
  const byPerson = new Map<string, VisitorFollowup[]>()
  for (const f of allFollowups) {
    if (!byPerson.has(f.person_id)) byPerson.set(f.person_id, [])
    byPerson.get(f.person_id)!.push(f)
  }

  const pipelines: PersonPipeline[] = []

  for (const [personId, steps] of byPerson) {
    const sorted = [...steps].sort((a, b) => a.step_number - b.step_number)
    const isComplete = sorted.every(s => s.status === 'completed' || s.status === 'skipped')
    const nextStep = sorted.find(s => s.status === 'pending') ?? null
    const overdueCount = sorted.filter(s => s.status === 'pending' && s.due_date < today).length

    const person = await db.getPerson(personId)
    if (!person) continue

    pipelines.push({ person, steps: sorted, nextStep, isComplete, overdueCount })
  }

  // Active (incomplete) first, then complete; within each group sort by next due date
  return pipelines.sort((a, b) => {
    if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1
    const aDate = a.nextStep?.due_date ?? '9999'
    const bDate = b.nextStep?.due_date ?? '9999'
    return aDate.localeCompare(bDate)
  })
}

// ── Step actions ──────────────────────────────────────────────────────────────

export async function completeStep(
  stepId: string,
  completedBy: string,
  notes?: string,
): Promise<VisitorFollowup> {
  return db.updateVisitorFollowup(stepId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    completed_by: completedBy,
    notes,
  })
}

export async function skipStep(stepId: string): Promise<VisitorFollowup> {
  return db.updateVisitorFollowup(stepId, { status: 'skipped' })
}

// ── Dashboard summary ─────────────────────────────────────────────────────────

export interface VisitorStats {
  total: number
  activePipelines: number
  overdueSteps: number
  completedThisWeek: number
}

export async function getVisitorStats(): Promise<VisitorStats> {
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const allFollowups = await db.getVisitorFollowups()

  const personIds = new Set(allFollowups.map(f => f.person_id))
  const byPerson = new Map<string, VisitorFollowup[]>()
  for (const f of allFollowups) {
    if (!byPerson.has(f.person_id)) byPerson.set(f.person_id, [])
    byPerson.get(f.person_id)!.push(f)
  }

  let activePipelines = 0
  for (const steps of byPerson.values()) {
    const allDone = steps.every(s => s.status === 'completed' || s.status === 'skipped')
    if (!allDone) activePipelines++
  }

  const overdueSteps = allFollowups.filter(f => f.status === 'pending' && f.due_date < today).length
  const completedThisWeek = allFollowups.filter(
    f => f.status === 'completed' && f.completed_at && f.completed_at >= weekAgo,
  ).length

  return {
    total: personIds.size,
    activePipelines,
    overdueSteps,
    completedThisWeek,
  }
}
