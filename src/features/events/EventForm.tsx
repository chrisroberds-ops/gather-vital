import { useState } from 'react'
import { createEvent, updateEvent, createRecurringSeries } from './event-service'
import { RECURRENCE_LABELS, DEFAULT_OCCURRENCES, MAX_OCCURRENCES, type RecurrencePattern } from './recurrence-service'
import { Input } from '@/shared/components/FormFields'
import Button from '@/shared/components/Button'
import type { Event } from '@/shared/types'

interface Props {
  event?: Event
  onDone: () => void
}

export default function EventForm({ event, onDone }: Props) {
  const [name, setName] = useState(event?.name ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [eventDate, setEventDate] = useState(event?.event_date ?? '')
  const [eventTime, setEventTime] = useState(event?.event_time ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [maxCapacity, setMaxCapacity] = useState(event?.max_capacity?.toString() ?? '')
  const [registrationRequired, setRegistrationRequired] = useState(event?.registration_required ?? true)
  const [hasCost, setHasCost] = useState(event?.has_cost ?? false)
  const [costAmount, setCostAmount] = useState(event?.cost_amount?.toString() ?? '')
  const [costDescription, setCostDescription] = useState(event?.cost_description ?? '')
  const [imageUrl, setImageUrl] = useState(event?.image_url ?? '')
  const [isActive, setIsActive] = useState(event?.is_active ?? true)

  // Recurrence (only for new events)
  const [recurrence, setRecurrence] = useState<RecurrencePattern>('none')
  const [occurrenceCount, setOccurrenceCount] = useState(DEFAULT_OCCURRENCES)

  const [saving, setSaving] = useState(false)
  const [generatedCount, setGeneratedCount] = useState<number | null>(null)

  const isEditing = !!event
  const isRecurring = !isEditing && recurrence !== 'none'

  const inputClass = 'border border-gray-300 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary-500'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

  function buildEventData() {
    return {
      name,
      description: description || undefined,
      event_date: eventDate,
      event_time: eventTime || undefined,
      location: location || undefined,
      max_capacity: maxCapacity ? parseInt(maxCapacity) : undefined,
      registration_required: registrationRequired,
      has_cost: hasCost,
      cost_amount: hasCost && costAmount ? parseFloat(costAmount) : undefined,
      cost_description: hasCost && costDescription ? costDescription : undefined,
      image_url: imageUrl || undefined,
      is_active: isActive,
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const data = buildEventData()

    if (isEditing) {
      await updateEvent(event.id, data)
      onDone()
    } else if (isRecurring) {
      const { events } = await createRecurringSeries(data, recurrence, occurrenceCount)
      setGeneratedCount(events.length)
      setSaving(false)
      // Show success state briefly, then close
      setTimeout(() => onDone(), 1800)
    } else {
      await createEvent(data)
      onDone()
    }
  }

  // Success screen after series generation
  if (generatedCount !== null) {
    return (
      <div className="text-center py-8 space-y-3">
        <div className="text-4xl">✅</div>
        <p className="text-lg font-semibold text-gray-900">Series created!</p>
        <p className="text-sm text-gray-500">
          {generatedCount} event{generatedCount !== 1 ? 's' : ''} created for this{' '}
          {RECURRENCE_LABELS[recurrence].toLowerCase()} series.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
      <Input label="Event name" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Summer Cookout" />

      <div>
        <label className={labelClass}>Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          placeholder="What should people know about this event?"
          className={`${inputClass} resize-none`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Date</label>
          <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Time</label>
          <input type="text" value={eventTime} onChange={e => setEventTime(e.target.value)} placeholder="e.g. 6:30 PM" className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Location" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Fellowship Hall" />
        <div>
          <label className={labelClass}>Max capacity</label>
          <input type="number" min="1" value={maxCapacity} onChange={e => setMaxCapacity(e.target.value)} placeholder="Unlimited" className={inputClass} />
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={hasCost} onChange={e => setHasCost(e.target.checked)} className="w-4 h-4 rounded text-primary-600" />
          This event has a cost
        </label>

        {hasCost && (
          <div className="ml-6 grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Amount ($)</label>
              <input type="number" min="0" step="0.01" value={costAmount} onChange={e => setCostAmount(e.target.value)} placeholder="0.00" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Cost description</label>
              <input type="text" value={costDescription} onChange={e => setCostDescription(e.target.value)} placeholder="e.g. Per person" className={inputClass} />
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={registrationRequired} onChange={e => setRegistrationRequired(e.target.checked)} className="w-4 h-4 rounded text-primary-600" />
          Registration required
        </label>

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="w-4 h-4 rounded text-primary-600" />
          Active (visible in event browser)
        </label>
      </div>

      <div>
        <label className={labelClass}>Image URL (optional)</label>
        <input type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." className={inputClass} />
      </div>

      {/* ── Recurrence section (new events only) ── */}
      {!isEditing && (
        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Recurrence</p>

          <div className="space-y-1.5">
            {(Object.keys(RECURRENCE_LABELS) as RecurrencePattern[]).map(pattern => (
              <label key={pattern} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="recurrence"
                  value={pattern}
                  checked={recurrence === pattern}
                  onChange={() => setRecurrence(pattern)}
                  className="accent-primary-600"
                />
                {RECURRENCE_LABELS[pattern]}
              </label>
            ))}
          </div>

          {recurrence !== 'none' && (
            <div className="flex items-center gap-3 pt-1">
              <label className="text-sm text-gray-600 whitespace-nowrap">Total occurrences:</label>
              <input
                type="number"
                min={2}
                max={MAX_OCCURRENCES}
                value={occurrenceCount}
                onChange={e => setOccurrenceCount(Math.min(MAX_OCCURRENCES, Math.max(2, parseInt(e.target.value) || 2)))}
                className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <span className="text-xs text-gray-400">max {MAX_OCCURRENCES}</span>
            </div>
          )}
        </div>
      )}

      {/* Recurring series indicator when editing */}
      {isEditing && event.recurrence_series_id && (
        <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-100 rounded-xl">
          <span className="text-xs text-purple-700 font-medium">Part of a recurring series</span>
          <span className="text-xs text-purple-500">— editing this occurrence only</span>
        </div>
      )}

      <Button type="submit" loading={saving} disabled={!name.trim() || !eventDate}>
        {isEditing
          ? 'Save changes'
          : isRecurring
          ? `Generate ${occurrenceCount} occurrences`
          : 'Create event'}
      </Button>
    </form>
  )
}
