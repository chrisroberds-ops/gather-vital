import { useState, useEffect, useCallback } from 'react'
import {
  getUpcomingEvents,
  getPastEvents,
  getEnrichedRegistrations,
  cancelRegistration,
  formatCost,
  type EnrichedRegistration,
} from './event-service'
import EventForm from './EventForm'
import { db } from '@/services'
import { displayName, formatDate } from '@/shared/utils/format'
import { downloadCsv } from '@/shared/utils/csv'
import Avatar from '@/shared/components/Avatar'
import Badge from '@/shared/components/Badge'
import Button from '@/shared/components/Button'
import Card from '@/shared/components/Card'
import EmptyState from '@/shared/components/EmptyState'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'
import type { Event } from '@/shared/types'

type Tab = 'upcoming' | 'past'

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'default'> = {
  registered: 'success',
  waitlisted: 'warning',
  cancelled: 'default',
}

const PAYMENT_VARIANT: Record<string, 'success' | 'warning' | 'default'> = {
  paid: 'success',
  pending: 'warning',
  not_required: 'default',
}

export default function EventsManager() {
  const [tab, setTab] = useState<Tab>('upcoming')
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showNewEvent, setShowNewEvent] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    const data = tab === 'upcoming' ? await getUpcomingEvents() : await getPastEvents()
    setEvents(data)
    setLoading(false)
  }, [tab])

  useEffect(() => { setExpandedId(null); void reload() }, [reload])

  async function handleExport() {
    const headers = ['Event Name', 'Date', 'Registered', 'Waitlisted']
    const rows = await Promise.all(
      events.map(async event => {
        const regs = await db.getEventRegistrations(event.id)
        const registered = regs.filter(r => r.status === 'registered').length
        const waitlisted = regs.filter(r => r.status === 'waitlisted').length
        return [event.name, event.event_date, String(registered), String(waitlisted)]
      })
    )
    downloadCsv(`events-${tab}-export.csv`, [headers, ...rows])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
          {(['upcoming', 'past'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 font-medium capitalize ${tab === t ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {events.length > 0 && (
            <Button variant="secondary" onClick={() => void handleExport()}>Export CSV</Button>
          )}
          <Button onClick={() => setShowNewEvent(true)}>+ New event</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : events.length === 0 ? (
        <EmptyState
          title={tab === 'upcoming' ? 'No upcoming events' : 'No past events'}
          description={tab === 'upcoming' ? 'Create an event to get started.' : ''}
        />
      ) : (
        <div className="space-y-2">
          {events.map(event => (
            <EventRow
              key={event.id}
              event={event}
              expanded={expandedId === event.id}
              onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)}
              onUpdated={reload}
            />
          ))}
        </div>
      )}

      <Modal isOpen={showNewEvent} onClose={() => setShowNewEvent(false)} title="Create Event">
        <EventForm onDone={() => { setShowNewEvent(false); void reload() }} />
      </Modal>
    </div>
  )
}

function EventRow({
  event, expanded, onToggle, onUpdated,
}: {
  event: Event
  expanded: boolean
  onToggle: () => void
  onUpdated: () => void
}) {
  const [registrations, setRegistrations] = useState<EnrichedRegistration[]>([])
  const [regsLoading, setRegsLoading] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)

  useEffect(() => {
    if (!expanded) return
    setRegsLoading(true)
    getEnrichedRegistrations(event.id).then(r => { setRegistrations(r); setRegsLoading(false) })
  }, [expanded, event.id])

  async function handleCancel(regId: string) {
    setCancelling(regId)
    await cancelRegistration(regId, event.id)
    setRegistrations(await getEnrichedRegistrations(event.id))
    setCancelling(null)
  }

  const registeredCount = registrations.filter(r => r.registration.status === 'registered').length
  const waitlistCount = registrations.filter(r => r.registration.status === 'waitlisted').length

  return (
    <Card>
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer select-none"
        onClick={onToggle}
      >
        <div className="min-w-0">
          <div className="font-semibold text-gray-900">{event.name}</div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-gray-600">{formatDate(event.event_date)}{event.event_time ? ` · ${event.event_time}` : ''}</span>
            {event.location && <span className="text-xs text-gray-400">{event.location}</span>}
            <span className="text-xs text-gray-500">{formatCost(event)}</span>
            {event.recurrence_series_id && <Badge variant="purple">Recurring series</Badge>}
            {!event.is_active && <Badge variant="danger">Inactive</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          <span className="text-sm text-gray-400 hidden sm:block">
            {registeredCount} registered
            {waitlistCount > 0 ? ` · ${waitlistCount} waitlisted` : ''}
            {event.max_capacity ? ` / ${event.max_capacity}` : ''}
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-4">
          {event.description && <p className="text-sm text-gray-600">{event.description}</p>}

          {regsLoading ? (
            <Spinner size="sm" />
          ) : registrations.length === 0 ? (
            <p className="text-sm text-gray-400">No registrations yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="py-2 font-medium text-gray-500">Person</th>
                  <th className="py-2 font-medium text-gray-500">Status</th>
                  {event.has_cost && <th className="py-2 font-medium text-gray-500 hidden sm:table-cell">Payment</th>}
                  <th className="py-2 font-medium text-gray-500 hidden sm:table-cell">Registered</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {registrations.map(({ registration, person }) => (
                  <tr key={registration.id}>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        {person && <Avatar name={displayName(person)} size="sm" />}
                        <span className="font-medium text-gray-900">{person ? displayName(person) : '—'}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant={STATUS_VARIANT[registration.status] ?? 'default'}>
                        {registration.status}
                      </Badge>
                    </td>
                    {event.has_cost && (
                      <td className="py-2 pr-3 hidden sm:table-cell">
                        <Badge variant={PAYMENT_VARIANT[registration.payment_status] ?? 'default'}>
                          {registration.payment_status.replace('_', ' ')}
                        </Badge>
                      </td>
                    )}
                    <td className="py-2 pr-3 text-gray-500 text-xs hidden sm:table-cell">
                      {new Date(registration.registered_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 text-right">
                      {cancelling === registration.id ? (
                        <Spinner size="sm" />
                      ) : (
                        <button
                          onClick={() => void handleCancel(registration.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <Button variant="ghost" size="sm" onClick={() => setShowEdit(true)}>Edit event</Button>

          <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title={`Edit: ${event.name}`}>
            <EventForm event={event} onDone={() => { setShowEdit(false); onUpdated() }} />
          </Modal>
        </div>
      )}
    </Card>
  )
}
