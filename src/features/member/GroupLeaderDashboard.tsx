import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { db } from '@/services'
import { displayName, formatPhone } from '@/shared/utils/format'
import Avatar from '@/shared/components/Avatar'
import Badge from '@/shared/components/Badge'
import Card from '@/shared/components/Card'
import Spinner from '@/shared/components/Spinner'
import EmptyState from '@/shared/components/EmptyState'
import type { Group, GroupMember, Person } from '@/shared/types'

interface MemberRow {
  member: GroupMember
  person: Person
}

export default function GroupLeaderDashboard() {
  const { user } = useAuth()
  const [myGroups, setMyGroups] = useState<Group[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [roster, setRoster] = useState<MemberRow[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.personId) { setLoading(false); return }
    db.getGroups(true).then(all => {
      const led = all.filter(g => g.leader_id === user.personId)
      setMyGroups(led)
      if (led.length > 0) setSelectedGroupId(led[0].id)
      setLoading(false)
    })
  }, [user?.personId])

  useEffect(() => {
    if (!selectedGroupId) return
    setRosterLoading(true)
    db.getGroupMembers(selectedGroupId).then(async members => {
      const rows = await Promise.all(
        members.map(async m => {
          const person = await db.getPerson(m.person_id)
          return person ? { member: m, person } : null
        })
      )
      setRoster(rows.filter((r): r is MemberRow => r !== null))
      setRosterLoading(false)
    })
  }, [selectedGroupId])

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  const selectedGroup = myGroups.find(g => g.id === selectedGroupId)
  const active = roster.filter(r => r.member.status === 'active')
  const waitlisted = roster.filter(r => r.member.status === 'waitlisted')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Group Leader View</h1>
        <p className="text-gray-500 text-sm mt-1">
          You can see your own group's roster and details. You cannot see other groups or the full people directory.
        </p>
      </div>

      {myGroups.length === 0 ? (
        <EmptyState
          title="No groups assigned"
          description="You're not listed as a leader for any group. Contact a staff member to be assigned."
        />
      ) : (
        <>
          {/* Group selector (if leader of multiple) */}
          {myGroups.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {myGroups.map(g => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGroupId(g.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    g.id === selectedGroupId
                      ? 'bg-primary-600 text-white border-transparent'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}

          {selectedGroup && (
            <>
              {/* Group info card */}
              <Card>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{selectedGroup.name}</h2>
                      {selectedGroup.description && (
                        <p className="text-gray-500 text-sm mt-1">{selectedGroup.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end">
                      <Badge variant={selectedGroup.is_open ? 'success' : 'default'}>
                        {selectedGroup.is_open ? 'Open' : 'Closed'}
                      </Badge>
                      <Badge variant={selectedGroup.is_visible ? 'info' : 'default'}>
                        {selectedGroup.is_visible ? 'Public' : 'Hidden'}
                      </Badge>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-100">
                    {[
                      { label: 'Day', value: selectedGroup.meeting_day ?? '—' },
                      { label: 'Time', value: selectedGroup.meeting_time ?? '—' },
                      { label: 'Location', value: selectedGroup.location ?? '—' },
                      {
                        label: 'Capacity',
                        value: selectedGroup.max_capacity
                          ? `${active.length} / ${selectedGroup.max_capacity}`
                          : `${active.length} (no cap)`,
                      },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <dt className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</dt>
                        <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </Card>

              {/* Roster */}
              <Card
                title={`Active Members (${active.length})`}
                action={
                  waitlisted.length > 0 ? (
                    <span className="text-xs text-amber-600 font-medium">
                      {waitlisted.length} waitlisted
                    </span>
                  ) : undefined
                }
              >
                {rosterLoading ? (
                  <div className="flex justify-center py-8"><Spinner /></div>
                ) : active.length === 0 ? (
                  <EmptyState title="No active members" description="No one has joined this group yet." />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left">
                        <th className="px-5 py-3 font-medium text-gray-500">Name</th>
                        <th className="px-5 py-3 font-medium text-gray-500 hidden sm:table-cell">Phone</th>
                        <th className="px-5 py-3 font-medium text-gray-500 hidden md:table-cell">Email</th>
                        <th className="px-5 py-3 font-medium text-gray-500">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.map(({ member, person }, idx) => (
                        <tr
                          key={member.id}
                          className={`border-b border-gray-50 ${idx === active.length - 1 ? 'border-b-0' : ''}`}
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={displayName(person)} size="sm" />
                              <span className="font-medium text-gray-900">{displayName(person)}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-gray-600 hidden sm:table-cell">
                            {formatPhone(person.phone)}
                          </td>
                          <td className="px-5 py-3 text-gray-500 hidden md:table-cell truncate max-w-40">
                            {person.email ?? '—'}
                          </td>
                          <td className="px-5 py-3 text-gray-500 text-xs">
                            {member.joined_at.slice(0, 10)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>

              {/* Waitlist */}
              {waitlisted.length > 0 && (
                <Card title={`Waitlist (${waitlisted.length})`}>
                  <ul className="divide-y divide-gray-50">
                    {waitlisted.map(({ member, person }) => (
                      <li key={member.id} className="px-5 py-3 flex items-center gap-3">
                        <Avatar name={displayName(person)} size="sm" />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">{displayName(person)}</div>
                          <div className="text-xs text-gray-500">{person.email ?? formatPhone(person.phone)}</div>
                        </div>
                        <Badge variant="warning">Waitlisted</Badge>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* Access explanation */}
      <div className="bg-gray-100 rounded-xl p-5 text-sm text-gray-500">
        <p className="font-medium text-gray-700 mb-1">As a Group Leader you can:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>See your group's full roster (name, phone, email)</li>
          <li>See who is waitlisted</li>
          <li>See group details and capacity</li>
        </ul>
        <p className="font-medium text-gray-700 mt-3 mb-1">You cannot see:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Other groups you don't lead</li>
          <li>The full people directory</li>
          <li>Medical notes, giving records, check-in flags</li>
          <li>Admin-only reports or system settings</li>
        </ul>
        <p className="mt-3">
          Need staff access?{' '}
          <Link to="/login" className="text-primary-600 hover:underline">Switch to Staff tier</Link> on the login page.
        </p>
      </div>
    </div>
  )
}
