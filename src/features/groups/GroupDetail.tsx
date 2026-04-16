/**
 * /admin/groups/:id — Group detail page.
 *
 * Two tabs:
 *   Members  — roster with status management (lifted from GroupsDirectory)
 *   Attendance — log meetings, mark present/absent, history, rates, CSV export
 */

import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db } from '@/services'
import {
  getEnrichedMembers,
  removeMember,
  updateMemberStatus,
  signUpForGroup,
  GROUP_TYPE_LABELS,
  type EnrichedMember,
} from './group-service'
import {
  createMeeting,
  deleteMeeting,
  saveAttendance,
  getMeetingsWithAttendance,
  getMemberAttendanceRates,
  getGroupAttendanceRate,
  exportGroupAttendanceCsv,
  type MeetingWithAttendance,
  type MemberAttendanceRate,
} from './group-attendance-service'
import GroupForm from './GroupForm'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'
import Button from '@/shared/components/Button'
import Avatar from '@/shared/components/Avatar'
import Badge from '@/shared/components/Badge'
import { Input } from '@/shared/components/FormFields'
import { displayName } from '@/shared/utils/format'
import type { Group, GroupMemberStatus, Person, GroupAttendanceStatus } from '@/shared/types'

type Tab = 'members' | 'attendance'

const TYPE_VARIANT: Record<string, 'info' | 'success' | 'warning' | 'default'> = {
  small_group: 'info',
  class: 'success',
  ministry: 'warning',
  support: 'default',
  other: 'default',
}

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [group, setGroup] = useState<Group | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('members')
  const [showEdit, setShowEdit] = useState(false)

  const loadGroup = useCallback(async () => {
    if (!id) return
    const g = await db.getGroup(id)
    setGroup(g)
    setLoading(false)
  }, [id])

  useEffect(() => { void loadGroup() }, [loadGroup])

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>

  if (!group) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-lg">Group not found.</p>
        <button onClick={() => navigate('/admin/groups')} className="text-sm text-primary-600 mt-2">
          ← Back to groups
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 pt-5 pb-0">
        <div className="flex items-start justify-between mb-3">
          <div>
            <button
              onClick={() => navigate('/admin/groups')}
              className="text-xs text-gray-400 hover:text-gray-600 mb-1 flex items-center gap-1"
            >
              ← Groups
            </button>
            <h1 className="text-xl font-bold text-gray-900">{group.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant={TYPE_VARIANT[group.group_type] ?? 'default'}>
                {GROUP_TYPE_LABELS[group.group_type] ?? group.group_type}
              </Badge>
              {group.meeting_day && (
                <span className="text-xs text-gray-500">
                  {group.meeting_day}{group.meeting_time ? ` · ${group.meeting_time}` : ''}
                </span>
              )}
              {group.location && <span className="text-xs text-gray-400">{group.location}</span>}
              {!group.is_active && <Badge variant="danger">Inactive</Badge>}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowEdit(true)}>
            Edit
          </Button>
        </div>

        {/* Tabs */}
        <nav className="flex gap-0">
          {(['members', 'attendance'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition-colors ${
                activeTab === tab
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {activeTab === 'members' && (
          <MembersTab groupId={group.id} groupName={group.name} />
        )}
        {activeTab === 'attendance' && (
          <AttendanceTab groupId={group.id} />
        )}
      </div>

      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title={`Edit: ${group.name}`}>
        <GroupForm group={group} onDone={() => { setShowEdit(false); void loadGroup() }} />
      </Modal>
    </div>
  )
}

// ── Members Tab ───────────────────────────────────────────────────────────────

function MembersTab({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [members, setMembers] = useState<EnrichedMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  const reload = useCallback(async () => {
    const m = await getEnrichedMembers(groupId)
    setMembers(m)
    setLoading(false)
  }, [groupId])

  useEffect(() => { void reload() }, [reload])

  async function handleRemove(personId: string) {
    await removeMember(groupId, personId)
    void reload()
  }

  async function handleStatusChange(memberId: string, status: GroupMemberStatus) {
    await updateMemberStatus(memberId, status)
    void reload()
  }

  if (loading) return <Spinner />

  const activeCount = members.filter(m => m.member.status === 'active').length
  const waitlistCount = members.filter(m => m.member.status === 'waitlisted').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {activeCount} active{waitlistCount > 0 ? ` · ${waitlistCount} waitlisted` : ''}
        </p>
        <Button size="sm" onClick={() => setShowAdd(true)}>+ Add member</Button>
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No members yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left">
              <th className="py-2 font-medium text-gray-500">Member</th>
              <th className="py-2 font-medium text-gray-500">Status</th>
              <th className="py-2 font-medium text-gray-500 hidden sm:table-cell">Joined</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {members.map(({ member, person }) => (
              <tr key={member.id}>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={displayName(person)} size="sm" />
                    <span className="font-medium text-gray-900">{displayName(person)}</span>
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <select
                    value={member.status}
                    onChange={e => void handleStatusChange(member.id, e.target.value as GroupMemberStatus)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="active">Active</option>
                    <option value="waitlisted">Waitlisted</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </td>
                <td className="py-2 pr-3 text-gray-500 hidden sm:table-cell text-xs">{member.joined_at}</td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => void handleRemove(person.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title={`Add member to ${groupName}`}>
        <AddMemberForm
          groupId={groupId}
          existingPersonIds={members.map(m => m.person.id)}
          onDone={() => { setShowAdd(false); void reload() }}
        />
      </Modal>
    </div>
  )
}

// ── Attendance Tab ────────────────────────────────────────────────────────────

function AttendanceTab({ groupId }: { groupId: string }) {
  const [meetings, setMeetings] = useState<MeetingWithAttendance[]>([])
  const [memberRates, setMemberRates] = useState<MemberAttendanceRate[]>([])
  const [overallRate, setOverallRate] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [showLogMeeting, setShowLogMeeting] = useState(false)
  const [expandedMeetingId, setExpandedMeetingId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [m, rates, overall] = await Promise.all([
      getMeetingsWithAttendance(groupId),
      getMemberAttendanceRates(groupId),
      getGroupAttendanceRate(groupId),
    ])
    setMeetings(m)
    setMemberRates(rates)
    setOverallRate(overall.rate)
    setLoading(false)
  }, [groupId])

  useEffect(() => { void reload() }, [reload])

  async function handleDelete(meetingId: string) {
    if (!confirm('Delete this meeting and all its attendance records?')) return
    await deleteMeeting(meetingId)
    void reload()
  }

  async function handleExport() {
    const csv = await exportGroupAttendanceCsv(groupId)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `group-attendance.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      {meetings.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Meetings logged" value={String(meetings.length)} />
          <StatCard label="Overall attendance" value={`${Math.round(overallRate * 100)}%`} />
          <StatCard label="Members tracked" value={String(memberRates.length)} />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setShowLogMeeting(true)}>+ Log meeting</Button>
        {meetings.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => void handleExport()}>
            Export CSV
          </Button>
        )}
      </div>

      {/* Per-member rates */}
      {memberRates.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Member attendance rates</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="py-1.5 font-medium text-gray-500">Member</th>
                <th className="py-1.5 font-medium text-gray-500 text-right">Attended</th>
                <th className="py-1.5 font-medium text-gray-500 text-right">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {memberRates.map(r => (
                <tr key={r.personId}>
                  <td className="py-1.5 text-gray-900">{r.name}</td>
                  <td className="py-1.5 text-gray-500 text-right text-xs">{r.present} / {r.total}</td>
                  <td className="py-1.5 text-right">
                    <span className={`text-xs font-medium ${r.rate >= 0.75 ? 'text-green-600' : r.rate >= 0.5 ? 'text-yellow-600' : 'text-red-500'}`}>
                      {Math.round(r.rate * 100)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Meeting history */}
      {meetings.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No meetings logged yet. Click "+ Log meeting" to record your first meeting.</p>
      ) : (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Meeting history</h3>
          <div className="space-y-2">
            {meetings.map(({ meeting, attendance, presentCount, totalCount }) => (
              <div key={meeting.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 select-none"
                  onClick={() => setExpandedMeetingId(
                    expandedMeetingId === meeting.id ? null : meeting.id
                  )}
                >
                  <div>
                    <span className="font-medium text-gray-900 text-sm">{meeting.date}</span>
                    {meeting.notes && (
                      <span className="text-xs text-gray-400 ml-2">{meeting.notes}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      {presentCount} / {totalCount} present
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); void handleDelete(meeting.id) }}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${expandedMeetingId === meeting.id ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {expandedMeetingId === meeting.id && (
                  <MeetingAttendanceEditor
                    groupId={groupId}
                    meetingId={meeting.id}
                    savedAttendance={attendance}
                    onSaved={() => void reload()}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal isOpen={showLogMeeting} onClose={() => setShowLogMeeting(false)} title="Log meeting">
        <LogMeetingForm
          groupId={groupId}
          onDone={() => { setShowLogMeeting(false); void reload() }}
        />
      </Modal>
    </div>
  )
}

// ── Log Meeting form ──────────────────────────────────────────────────────────

function LogMeetingForm({ groupId, onDone }: { groupId: string; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [members, setMembers] = useState<EnrichedMember[]>([])
  const [attendance, setAttendance] = useState<Map<string, GroupAttendanceStatus>>(new Map())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getEnrichedMembers(groupId).then(m => {
      const active = m.filter(e => e.member.status === 'active')
      setMembers(active)
      const initial = new Map<string, GroupAttendanceStatus>()
      for (const e of active) initial.set(e.person.id, 'present')
      setAttendance(initial)
    })
  }, [groupId])

  function toggleStatus(personId: string) {
    setAttendance(prev => {
      const next = new Map(prev)
      const cur = next.get(personId) ?? 'present'
      next.set(personId, cur === 'present' ? 'absent' : 'present')
      return next
    })
  }

  async function handleSave() {
    if (!date) return
    setSaving(true)
    try {
      const meeting = await createMeeting(groupId, date, notes || undefined)
      const records = [...attendance.entries()].map(([personId, status]) => ({ personId, status }))
      await saveAttendance(meeting.id, records)
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Guest speaker"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-gray-400">No active members to mark attendance for.</p>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">Mark attendance</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-xs text-gray-500 hover:text-gray-700"
                onClick={() => setAttendance(new Map(members.map(m => [m.person.id, 'present'])))}
              >
                All present
              </button>
              <button
                type="button"
                className="text-xs text-gray-500 hover:text-gray-700"
                onClick={() => setAttendance(new Map(members.map(m => [m.person.id, 'absent'])))}
              >
                All absent
              </button>
            </div>
          </div>
          <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {members.map(({ person }) => {
              const status = attendance.get(person.id) ?? 'present'
              return (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => toggleStatus(person.id)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors ${status === 'present' ? 'bg-green-50' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <Avatar name={displayName(person)} size="sm" />
                    <span className="font-medium text-gray-900">{displayName(person)}</span>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    status === 'present'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {status}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <Button loading={saving} disabled={!date} onClick={() => void handleSave()}>
        Save meeting
      </Button>
    </div>
  )
}

// ── Meeting attendance editor (inline in history) ─────────────────────────────

function MeetingAttendanceEditor({
  groupId,
  meetingId,
  savedAttendance,
  onSaved,
}: {
  groupId: string
  meetingId: string
  savedAttendance: import('@/shared/types').GroupAttendance[]
  onSaved: () => void
}) {
  const [members, setMembers] = useState<EnrichedMember[]>([])
  const [attendance, setAttendance] = useState<Map<string, GroupAttendanceStatus>>(new Map())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getEnrichedMembers(groupId).then(m => {
      const active = m.filter(e => e.member.status === 'active')
      setMembers(active)
      const map = new Map<string, GroupAttendanceStatus>()
      for (const e of active) {
        const existing = savedAttendance.find(a => a.person_id === e.person.id)
        map.set(e.person.id, existing?.status ?? 'absent')
      }
      setAttendance(map)
    })
  }, [groupId, meetingId, savedAttendance])

  function toggleStatus(personId: string) {
    setAttendance(prev => {
      const next = new Map(prev)
      const cur = next.get(personId) ?? 'absent'
      next.set(personId, cur === 'present' ? 'absent' : 'present')
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const records = [...attendance.entries()].map(([personId, status]) => ({ personId, status }))
      await saveAttendance(meetingId, records)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  if (members.length === 0) return null

  return (
    <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
      <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden bg-white">
        {members.map(({ person }) => {
          const status = attendance.get(person.id) ?? 'absent'
          return (
            <button
              key={person.id}
              type="button"
              onClick={() => toggleStatus(person.id)}
              className={`w-full flex items-center justify-between px-4 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${status === 'present' ? 'bg-green-50' : ''}`}
            >
              <span className="font-medium text-gray-900">{displayName(person)}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                status === 'present'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {status}
              </span>
            </button>
          )
        })}
      </div>
      <Button size="sm" loading={saving} onClick={() => void handleSave()}>
        Update attendance
      </Button>
    </div>
  )
}

// ── Add Member Form ───────────────────────────────────────────────────────────

function AddMemberForm({
  groupId,
  existingPersonIds,
  onDone,
}: {
  groupId: string
  existingPersonIds: string[]
  onDone: () => void
}) {
  const [people, setPeople] = useState<Person[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    db.getPeople().then(all => {
      setPeople(all.filter(p => p.is_active && !p.is_child && !existingPersonIds.includes(p.id)))
    })
  }, [])

  const filtered = people
    .filter(p => !search || displayName(p).toLowerCase().includes(search.toLowerCase()))
    .slice(0, 8)

  async function handleAdd() {
    if (!selectedId) return
    setSaving(true)
    await signUpForGroup(groupId, selectedId)
    onDone()
  }

  return (
    <div className="space-y-4">
      <Input
        label="Search people"
        value={search}
        onChange={e => { setSearch(e.target.value); setSelectedId('') }}
        placeholder="Name..."
      />
      {filtered.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden max-h-44 overflow-y-auto">
          {filtered.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors ${selectedId === p.id ? 'bg-primary-50 text-primary-700' : ''}`}
            >
              <Avatar name={displayName(p)} size="sm" />
              {displayName(p)}
            </button>
          ))}
        </div>
      )}
      <Button loading={saving} disabled={!selectedId} onClick={() => void handleAdd()}>
        Add to Group
      </Button>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  )
}
