import { useState, useEffect } from 'react'
import { getBlackouts, addBlackout, removeBlackout } from './volunteer-service'
import type { VolunteerBlackout } from '@/shared/types'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'

interface Props {
  personId: string
  compact?: boolean
}

export default function BlackoutManager({ personId, compact = false }: Props) {
  const [blackouts, setBlackouts] = useState<VolunteerBlackout[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  async function reload() {
    const data = await getBlackouts(personId)
    setBlackouts(data.sort((a, b) => a.start_date.localeCompare(b.start_date)))
    setLoading(false)
  }

  useEffect(() => { void reload() }, [personId])

  async function handleAdd() {
    if (!startDate || !endDate) return
    setSaving(true)
    await addBlackout(personId, startDate, endDate <= startDate ? startDate : endDate, reason || undefined)
    setStartDate(''); setEndDate(''); setReason(''); setAdding(false)
    await reload()
    setSaving(false)
  }

  async function handleRemove(id: string) {
    setRemoving(id)
    await removeBlackout(id)
    await reload()
    setRemoving(null)
  }

  if (loading) return <Spinner size="sm" />

  const inputClass = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="space-y-3">
      {blackouts.length === 0 && !adding && (
        <p className="text-sm text-gray-400">No blackout dates set.</p>
      )}

      {blackouts.map(b => (
        <div key={b.id} className="flex items-center justify-between gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <div>
            <span className="font-medium text-gray-900">
              {b.start_date === b.end_date ? b.start_date : `${b.start_date} → ${b.end_date}`}
            </span>
            {b.reason && <span className="text-gray-500 ml-2">— {b.reason}</span>}
          </div>
          <Button
            variant="danger"
            size="sm"
            loading={removing === b.id}
            onClick={() => void handleRemove(b.id)}
          >
            Remove
          </Button>
        </div>
      ))}

      {adding ? (
        <div className={`${compact ? '' : 'bg-gray-50 rounded-xl p-4'} space-y-3`}>
          <div className="flex gap-2 flex-wrap">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} className={inputClass} />
            </div>
            <div className="flex-1 min-w-32">
              <label className="block text-xs text-gray-500 mb-1">Reason (optional)</label>
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Vacation" className={`${inputClass} w-full`} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" loading={saving} disabled={!startDate} onClick={() => void handleAdd()}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          + Add blackout dates
        </Button>
      )}
    </div>
  )
}
