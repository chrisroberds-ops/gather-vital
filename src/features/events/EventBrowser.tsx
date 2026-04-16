import { useState, useEffect } from 'react'
import { getUpcomingEvents, registerForEvent, formatCost } from './event-service'
import { db } from '@/services'
import { formatDate } from '@/shared/utils/format'
import EmptyState from '@/shared/components/EmptyState'
import Modal from '@/shared/components/Modal'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'
import type { Event } from '@/shared/types'

export default function EventBrowser() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [registerEvent, setRegisterEvent] = useState<Event | null>(null)

  useEffect(() => {
    getUpcomingEvents().then(e => { setEvents(e); setLoading(false) })
  }, [])

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  if (events.length === 0) {
    return <EmptyState title="No upcoming events" description="Check back soon!" />
  }

  return (
    <div className="space-y-4">
      {events.map(event => (
        <EventCard key={event.id} event={event} onRegister={() => setRegisterEvent(event)} />
      ))}

      <Modal isOpen={!!registerEvent} onClose={() => setRegisterEvent(null)} title={`Register: ${registerEvent?.name ?? ''}`}>
        {registerEvent && (
          <RegisterForm event={registerEvent} onDone={() => setRegisterEvent(null)} />
        )}
      </Modal>
    </div>
  )
}

function EventCard({ event, onRegister }: { event: Event; onRegister: () => void }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-sm transition-shadow">
      {event.image_url && (
        <img src={event.image_url} alt={event.name} className="w-full h-36 object-cover" />
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 text-lg">{event.name}</h3>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-600 flex-wrap">
              <span>{formatDate(event.event_date)}{event.event_time ? ` · ${event.event_time}` : ''}</span>
              {event.location && <span className="text-gray-400">{event.location}</span>}
              <span className={event.has_cost ? 'text-gray-700 font-medium' : 'text-green-600 font-medium'}>
                {formatCost(event)}
              </span>
            </div>
            {event.description && (
              <p className="text-sm text-gray-600 mt-2 line-clamp-2">{event.description}</p>
            )}
          </div>

          {/* Date badge */}
          <div className="flex-shrink-0 text-center bg-primary-50 rounded-xl px-3 py-2">
            <div className="text-xs font-medium text-primary-600 uppercase">
              {new Date(event.event_date + 'T12:00:00').toLocaleString('default', { month: 'short' })}
            </div>
            <div className="text-2xl font-bold text-primary-700 leading-none mt-0.5">
              {new Date(event.event_date + 'T12:00:00').getDate()}
            </div>
          </div>
        </div>

        {event.registration_required && (
          <div className="mt-4">
            <Button size="sm" onClick={onRegister}>Register</Button>
          </div>
        )}
      </div>
    </div>
  )
}

function RegisterForm({ event, onDone }: { event: Event; onDone: () => void }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ waitlisted: boolean; alreadyRegistered: boolean } | null>(null)

  const inputClass = 'border border-gray-300 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary-500'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    let person = null
    if (phone) {
      const all = await db.getPeople()
      person = all.find(p => p.phone?.replace(/\D/g, '') === phone.replace(/\D/g, '')) ?? null
    }
    if (!person && email) {
      const all = await db.getPeople()
      person = all.find(p => p.email?.toLowerCase() === email.toLowerCase()) ?? null
    }
    if (!person) {
      person = await db.createPerson({
        first_name: firstName,
        last_name: lastName,
        phone: phone || undefined,
        email: email || undefined,
        is_active: true,
        is_child: false,
      })
    }
    const res = await registerForEvent(event.id, person.id)
    setResult({ waitlisted: res.waitlisted, alreadyRegistered: res.alreadyRegistered })
    setSaving(false)
  }

  if (result) {
    return (
      <div className="space-y-4 text-center py-2">
        <div className="text-4xl">{result.alreadyRegistered ? '✓' : result.waitlisted ? '⏳' : '🎉'}</div>
        <div>
          <p className="font-semibold text-gray-900">
            {result.alreadyRegistered ? 'Already registered!' : result.waitlisted ? 'Added to waitlist' : 'You\'re registered!'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {result.alreadyRegistered
              ? 'You\'re already registered for this event.'
              : result.waitlisted
              ? 'We\'ll reach out if a spot opens up.'
              : event.has_cost
              ? 'Payment details will be sent to you.'
              : 'See you there!'}
          </p>
        </div>
        <Button onClick={onDone}>Done</Button>
      </div>
    )
  }

  return (
    <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
      <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-600">
        <div className="font-medium text-gray-900">{event.name}</div>
        <div className="mt-0.5">{formatDate(event.event_date)}{event.event_time ? ` · ${event.event_time}` : ''}</div>
        {event.has_cost && <div className="text-primary-700 font-medium mt-0.5">{formatCost(event)}</div>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>First name</label>
          <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Last name</label>
          <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} required className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>Phone</label>
        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000" className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass} />
      </div>
      <Button type="submit" loading={saving} disabled={!firstName.trim() || !lastName.trim()}>
        Complete registration
      </Button>
    </form>
  )
}
