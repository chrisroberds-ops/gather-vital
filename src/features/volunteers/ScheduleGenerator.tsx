import { useState, useEffect } from 'react'
import { getTeams, generateSchedule, type GenerateResult } from './volunteer-service'
import Button from '@/shared/components/Button'
import type { Team } from '@/shared/types'

interface Props {
  onDone: () => void
}

export default function ScheduleGenerator({ onDone }: Props) {
  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamId] = useState('')
  const [position, setPosition] = useState('')
  const [startDate, setStartDate] = useState(nextSunday())
  const [endDate, setEndDate] = useState(weeksOut(8))
  const [skipConflicts, setSkipConflicts] = useState(true)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)

  useEffect(() => {
    getTeams().then(t => {
      setTeams(t)
      if (t.length > 0) setTeamId(t[0].id)
    })
  }, [])

  async function handleGenerate() {
    if (!teamId) return
    setRunning(true)
    setResult(null)
    const res = await generateSchedule({ teamId, startDate, endDate, position: position || 'Volunteer', skipConflicts })
    setResult(res)
    setRunning(false)
  }

  const inputClass = 'border border-gray-300 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary-500'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Auto-generates schedule entries for all team members based on their rotation preferences, respecting blackout dates.
      </p>

      <div>
        <label className={labelClass}>Team</label>
        <select value={teamId} onChange={e => setTeamId(e.target.value)} className={inputClass}>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      <div>
        <label className={labelClass}>Position label</label>
        <input
          type="text"
          value={position}
          onChange={e => setPosition(e.target.value)}
          placeholder="e.g. Lead Vocals, Camera 1, Greeter"
          className={inputClass}
        />
        <p className="text-xs text-gray-400 mt-1">Applied to all generated slots. You can edit individual entries afterwards.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Start date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>End date</label>
          <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} className={inputClass} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={skipConflicts}
          onChange={e => setSkipConflicts(e.target.checked)}
          className="w-4 h-4 rounded text-primary-600"
        />
        Skip if person is already scheduled for another team that Sunday
      </label>

      {result && (
        <div className={`rounded-xl px-4 py-3 text-sm ${result.created > 0 ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
          <div className="font-medium text-gray-900">
            {result.created > 0
              ? `${result.created} slot${result.created !== 1 ? 's' : ''} created${result.skipped > 0 ? `, ${result.skipped} skipped` : ''}`
              : `No slots created${result.skipped > 0 ? ` — ${result.skipped} skipped` : ''}`
            }
          </div>
          {result.reasons.length > 0 && (
            <ul className="mt-2 space-y-0.5 max-h-32 overflow-y-auto">
              {result.reasons.map((r, i) => (
                <li key={i} className="text-gray-500 text-xs">{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button loading={running} disabled={!teamId} onClick={() => void handleGenerate()}>
          {result ? 'Generate again' : 'Generate schedule'}
        </Button>
        {result && result.created > 0 && (
          <Button variant="secondary" onClick={onDone}>View schedule</Button>
        )}
        {result && result.created === 0 && (
          <Button variant="ghost" onClick={onDone}>Close</Button>
        )}
      </div>
    </div>
  )
}

function nextSunday(): string {
  const d = new Date()
  d.setDate(d.getDate() + (7 - d.getDay()) % 7 || 7)
  return d.toISOString().split('T')[0]
}

function weeksOut(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + (7 - d.getDay()) % 7 || 7)
  d.setDate(d.getDate() + (n - 1) * 7)
  return d.toISOString().split('T')[0]
}
