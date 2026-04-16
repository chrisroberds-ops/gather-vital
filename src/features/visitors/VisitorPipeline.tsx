import { useState, useEffect, useCallback } from 'react'
import { getActivePipelines, completeStep, skipStep, type PersonPipeline } from './visitor-service'
import { useAuth } from '@/auth/AuthContext'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'
import EmptyState from '@/shared/components/EmptyState'
import type { VisitorFollowup } from '@/shared/types'

const METHOD_ICONS: Record<string, string> = {
  text: '💬',
  email: '✉️',
  call: '📞',
  task: '✅',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-amber-600',
  completed: 'text-green-600',
  skipped: 'text-gray-400',
}

export default function VisitorPipeline() {
  const { user } = useAuth()
  const [pipelines, setPipelines] = useState<PersonPipeline[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<'active' | 'complete' | 'all'>('active')

  const load = useCallback(async () => {
    setLoading(true)
    setPipelines(await getActivePipelines())
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = pipelines.filter(p => {
    if (filter === 'active') return !p.isComplete
    if (filter === 'complete') return p.isComplete
    return true
  })

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  const activeCt = pipelines.filter(p => !p.isComplete).length
  const overdueCt = pipelines.reduce((sum, p) => sum + p.overdueCount, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visitor Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeCt} active {activeCt === 1 ? 'pipeline' : 'pipelines'}
            {overdueCt > 0 && <span className="text-red-500 ml-2">· {overdueCt} overdue</span>}
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['active', 'complete', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-sm px-4 py-1.5 rounded-full font-medium transition-colors capitalize ${
              filter === f
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No visitors here" description="Visitors will appear once they submit the visitor form." />
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <PipelineRow
              key={p.person.id}
              pipeline={p}
              isExpanded={expanded === p.person.id}
              onToggle={() => setExpanded(prev => prev === p.person.id ? null : p.person.id)}
              userId={user?.uid ?? ''}
              onUpdate={load}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PipelineRow({
  pipeline,
  isExpanded,
  onToggle,
  userId,
  onUpdate,
}: {
  pipeline: PersonPipeline
  isExpanded: boolean
  onToggle: () => void
  userId: string
  onUpdate: () => void
}) {
  const { person, steps, nextStep, isComplete, overdueCount } = pipeline
  const today = new Date().toISOString().split('T')[0]
  const completedCount = steps.filter(s => s.status === 'completed' || s.status === 'skipped').length

  return (
    <div className="border border-gray-200 rounded-2xl bg-white overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold text-sm flex-shrink-0">
            {person.first_name[0]}{person.last_name[0]}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-gray-900 truncate">
              {person.first_name} {person.last_name}
            </div>
            <div className="text-xs text-gray-500">
              {isComplete ? (
                <span className="text-green-600">Pipeline complete</span>
              ) : nextStep ? (
                <>
                  Next: {nextStep.step_name}
                  {' · '}
                  <span className={nextStep.due_date < today ? 'text-red-500' : ''}>
                    due {nextStep.due_date}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          {overdueCount > 0 && (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
              {overdueCount} overdue
            </span>
          )}
          <div className="text-xs text-gray-400">{completedCount}/{steps.length}</div>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-1">
          {/* Person contact info */}
          <div className="text-xs text-gray-500 mb-3 flex gap-4">
            {person.phone && <span>📱 {person.phone}</span>}
            {person.email && <span>✉️ {person.email}</span>}
            {person.first_visit_date && <span>🗓 First visit: {person.first_visit_date}</span>}
          </div>
          {steps.map(step => (
            <StepRow
              key={step.id}
              step={step}
              userId={userId}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function StepRow({
  step,
  userId,
  onUpdate,
}: {
  step: VisitorFollowup
  userId: string
  onUpdate: () => void
}) {
  const [saving, setSaving] = useState<'complete' | 'skip' | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState('')
  const today = new Date().toISOString().split('T')[0]
  const isOverdue = step.status === 'pending' && step.due_date < today

  async function handleComplete() {
    if (showNotes) {
      setSaving('complete')
      await completeStep(step.id, userId, notes || undefined)
      setSaving(null)
      setShowNotes(false)
      setNotes('')
      onUpdate()
    } else {
      setShowNotes(true)
    }
  }

  async function handleSkip() {
    setSaving('skip')
    await skipStep(step.id)
    setSaving(null)
    onUpdate()
  }

  return (
    <div className={`rounded-xl px-3 py-2.5 ${
      step.status === 'pending' ? 'bg-gray-50' : 'bg-white opacity-60'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-base mt-0.5">{METHOD_ICONS[step.step_name === 'Follow-Up Call' ? 'call' : step.step_name === 'Welcome Text' || step.step_name === 'Check-In' ? 'text' : 'email'] ?? '✅'}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${STATUS_COLORS[step.status]}`}>
                {step.step_number}. {step.step_name}
              </span>
              {isOverdue && (
                <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">overdue</span>
              )}
            </div>
            <div className="text-xs text-gray-400">
              {step.status === 'completed'
                ? `Completed ${step.completed_at?.split('T')[0] ?? ''}`
                : step.status === 'skipped'
                ? 'Skipped'
                : `Due ${step.due_date}`}
            </div>
            {step.notes && (
              <div className="text-xs text-gray-500 mt-1 italic">{step.notes}</div>
            )}
          </div>
        </div>

        {step.status === 'pending' && (
          <div className="flex gap-1.5 flex-shrink-0">
            <Button
              size="sm"
              onClick={() => void handleComplete()}
              loading={saving === 'complete'}
              disabled={saving !== null}
            >
              {showNotes ? 'Save' : 'Done'}
            </Button>
            {!showNotes && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleSkip()}
                loading={saving === 'skip'}
                disabled={saving !== null}
              >
                Skip
              </Button>
            )}
          </div>
        )}
      </div>

      {showNotes && step.status === 'pending' && (
        <div className="mt-2 space-y-1.5">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add a note (optional)"
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
          <button
            onClick={() => setShowNotes(false)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
