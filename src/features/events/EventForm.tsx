import { useState } from 'react'
import { createEvent, updateEvent } from './event-service'
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
  const [saving, setSaving] = useState(false)

  const inputClass = 'border border-gray-300 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary-500'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const data = {
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
    if (event) {
      await updateEvent(event.id, data)
    } else {
      await createEvent(data)
    }
    onDone()
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

      <Button type="submit" loading={saving} disabled={!name.trim() || !eventDate}>
        {event ? 'Save changes' : 'Create event'}
      </Button>
    </form>
  )
}
