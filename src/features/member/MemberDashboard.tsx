import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { db } from '@/services'
import { updateScheduleStatus } from '@/features/volunteers/volunteer-service'
import { sendEmail } from '@/services/notification-service'
import { displayName, formatPhone, formatDate } from '@/shared/utils/format'
import Avatar from '@/shared/components/Avatar'
import Badge from '@/shared/components/Badge'
import Card from '@/shared/components/Card'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'
import type { Person, Group, VolunteerSchedule, EventRegistration, Event } from '@/shared/types'

export default function MemberDashboard() {
  const { user } = useAuth()
  const [person, setPerson] = useState<Person | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [schedule, setSchedule] = useState<VolunteerSchedule[]>([])
  const [registrations, setRegistrations] = useState<Array<{ reg: EventRegistration; event: Event }>>([])
  const [staffMembers, setStaffMembers] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingShift, setUpdatingShift] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!user?.personId) { setLoading(false); return }

    const today = new Date().toISOString().split('T')[0]

    const [p, g, sched, regs, events, staff] = await Promise.all([
      db.getPerson(user.personId),
      db.getPersonGroups(user.personId),
      db.getVolunteerSchedule(undefined, user.personId),
      db.getPersonEventRegistrations(user.personId),
      db.getEvents(),
      db.getStaffMembers(),
    ])
    setPerson(p)
    setGroups(g)
    setStaffMembers(staff)
    // Only upcoming
    setSchedule(sched.filter(s => s.scheduled_date >= today).slice(0, 5))
    // Combine registrations with event data
    const eventMap = new Map(events.map(e => [e.id, e]))
    setRegistrations(
      regs
        .filter(r => r.status === 'registered' && eventMap.has(r.event_id))
        .map(r => ({ reg: r, event: eventMap.get(r.event_id)! }))
        .filter(({ event }) => event.event_date >= today)
        .slice(0, 5)
    )
    setLoading(false)
  }, [user?.personId])

  useEffect(() => { void loadData() }, [loadData])

  async function handleShiftStatus(shiftId: string, status: 'confirmed' | 'declined') {
    setUpdatingShift(shiftId)
    await updateScheduleStatus(shiftId, status)
    await loadData()
    setUpdatingShift(null)
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  if (!user?.personId) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">👤</div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">No profile linked</h2>
        <p className="text-gray-500 text-sm">Your account isn't linked to a person record yet. Contact a staff member.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Profile header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 flex items-center gap-5">
        {person && (
          <>
            <Avatar name={displayName(person)} photoUrl={person.photo_url} size="lg" />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900">{displayName(person)}</h1>
              {person.pronouns && <p className="text-gray-500 text-sm">{person.pronouns}</p>}
              <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-600">
                {person.email && <span>{person.email}</span>}
                {person.phone && <span>{formatPhone(person.phone)}</span>}
              </div>
              {person.membership_status && (
                <div className="mt-2">
                  <Badge variant="success">{person.membership_status.replace('_', ' ')}</Badge>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* My Groups */}
        <Card title="My Groups" action={
          <Link to="/embed/groups" className="text-xs text-primary-600 hover:underline">Browse all</Link>
        }>
          {groups.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-gray-400">You're not in any groups yet.</p>
              <Link
                to="/embed/groups"
                className="mt-2 inline-block text-sm text-primary-600 font-medium hover:underline"
              >
                Browse groups →
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {groups.map(group => (
                <li key={group.id} className="px-5 py-3">
                  <div className="font-medium text-gray-900 text-sm">{group.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {group.meeting_day}{group.meeting_time ? ` · ${group.meeting_time}` : ''}
                    {group.location ? ` · ${group.location}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Volunteer Schedule */}
        <Card title="My Upcoming Volunteer Shifts">
          {schedule.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-gray-400">No upcoming volunteer assignments.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {schedule.map(s => (
                <li key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900">{s.position}</div>
                    <div className="text-xs text-gray-500">{formatDate(s.scheduled_date)}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {updatingShift === s.id ? (
                      <Spinner size="sm" />
                    ) : s.status === 'pending' ? (
                      <>
                        <button
                          onClick={() => void handleShiftStatus(s.id, 'confirmed')}
                          className="text-xs text-green-600 hover:text-green-800 font-medium"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => void handleShiftStatus(s.id, 'declined')}
                          className="text-xs text-red-500 hover:text-red-700 font-medium"
                        >
                          Decline
                        </button>
                      </>
                    ) : (
                      <StatusBadge status={s.status} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Upcoming Events */}
        <Card title="My Event Registrations" action={
          <Link to="/embed/events" className="text-xs text-primary-600 hover:underline">Browse all</Link>
        }>
          {registrations.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-gray-400">No upcoming event registrations.</p>
              <Link to="/embed/events" className="mt-2 inline-block text-sm text-primary-600 font-medium hover:underline">
                Browse events →
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {registrations.map(({ reg, event }) => (
                <li key={reg.id} className="px-5 py-3">
                  <div className="text-sm font-medium text-gray-900">{event.name}</div>
                  <div className="text-xs text-gray-500">
                    {formatDate(event.event_date)}{event.event_time ? ` · ${event.event_time}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Profile details */}
        {person && (
          <Card title="My Profile">
            <dl className="divide-y divide-gray-50">
              {[
                { label: 'First visit', value: formatDate(person.first_visit_date) },
                { label: 'Date of birth', value: formatDate(person.date_of_birth) },
                { label: 'Relationship', value: person.relationship_status?.replace('-', ' ') },
              ].map(({ label, value }) => (
                <div key={label} className="flex px-5 py-3 text-sm">
                  <dt className="w-28 text-gray-500 flex-shrink-0">{label}</dt>
                  <dd className="text-gray-900">{value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
      </div>

      {/* Contact Staff */}
      <ContactStaffSection
        staffMembers={staffMembers}
        memberName={person ? displayName(person) : (user?.displayName ?? 'Member')}
        memberEmail={person?.email ?? user?.email}
      />

      {/* What members can't see */}
      <div className="bg-gray-100 rounded-xl p-5 text-sm text-gray-500">
        <p className="font-medium text-gray-700 mb-1">What you can do as a member:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>View your own profile and household</li>
          <li>Browse and sign up for groups and events</li>
          <li>Confirm or decline volunteer assignments</li>
        </ul>
        <p className="font-medium text-gray-700 mt-3 mb-1">What you cannot see:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Other people's records (people directory is staff-only)</li>
          <li>Giving records</li>
          <li>Check-in flags or medical notes</li>
          <li>Hidden groups or admin-only reports</li>
        </ul>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    confirmed: 'success',
    pending: 'warning',
    declined: 'danger',
    cancelled: 'default',
  }
  return (
    <Badge variant={variants[status] ?? 'default'}>
      {status}
    </Badge>
  )
}

// ── Contact Staff ─────────────────────────────────────────────────────────────

interface ContactStaffProps {
  staffMembers: Person[]
  memberName: string
  memberEmail?: string
}

function ContactStaffSection({ staffMembers, memberName, memberEmail }: ContactStaffProps) {
  const [modalStaff, setModalStaff] = useState<Person | null>(null)

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Contact Staff</h2>
      {staffMembers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="text-3xl mb-2">👋</div>
          <p className="text-sm text-gray-500">No staff contacts available — check back soon</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {staffMembers.map(staff => {
            const hasEmail = Boolean(staff.email)
            return (
              <div
                key={staff.id}
                className={`bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4 ${!hasEmail ? 'opacity-60' : ''}`}
              >
                <Avatar name={displayName(staff)} photoUrl={staff.photo_url} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-sm truncate">{displayName(staff)}</div>
                  {staff.job_title && (
                    <div className="text-xs text-gray-500 mt-0.5 truncate">{staff.job_title}</div>
                  )}
                  {!hasEmail && (
                    <div className="text-xs text-gray-400 mt-1">No email on file</div>
                  )}
                </div>
                <button
                  onClick={() => setModalStaff(staff)}
                  disabled={!hasEmail}
                  className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border border-primary-200 text-primary-700 hover:bg-primary-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
                >
                  Send Message
                </button>
              </div>
            )
          })}
        </div>
      )}

      {modalStaff && (
        <MessageModal
          staff={modalStaff}
          memberName={memberName}
          memberEmail={memberEmail}
          onClose={() => setModalStaff(null)}
        />
      )}
    </div>
  )
}

interface MessageModalProps {
  staff: Person
  memberName: string
  memberEmail?: string
  onClose: () => void
}

function MessageModal({ staff, memberName, memberEmail, onClose }: MessageModalProps) {
  const [subject, setSubject] = useState(`Message from ${memberName}`)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState('')

  async function handleSend() {
    if (!message.trim() || !staff.email) return
    setSending(true)
    try {
      await sendEmail({
        to: staff.email,
        subject,
        body: message,
        personId: staff.id,
        replyTo: memberEmail,
      })
      await db.createCommunicationsLogEntry({
        person_id: staff.id,
        channel: 'email',
        subject,
        recipient: staff.email,
        success: true,
        sender_name: memberName,
        is_bulk: false,
      })
      setToast('Message sent!')
      setTimeout(() => { onClose() }, 1500)
    } catch {
      setToast('Failed to send — please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal isOpen title={`Message ${displayName(staff)}`} onClose={onClose} size="md">
      <div className="space-y-4">
        {toast && (
          <div className={`text-sm px-4 py-2 rounded-lg ${toast.startsWith('Failed') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {toast}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <div className="text-sm text-gray-900 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
            {displayName(staff)}
          </div>
        </div>

        <div>
          <label htmlFor="msg-subject" className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
          <input
            id="msg-subject"
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
        </div>

        <div>
          <label htmlFor="msg-body" className="block text-xs font-medium text-gray-500 mb-1">
            Message <span className="text-gray-400">({message.length}/1000)</span>
          </label>
          <textarea
            id="msg-body"
            rows={5}
            maxLength={1000}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Write your message…"
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSend()}
            disabled={!message.trim() || sending}
            className="text-sm font-medium px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
