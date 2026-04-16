import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getAllGroups,
  getEnrichedMembers,
  addMember,
  removeMember,
  updateMemberStatus,
  signUpForGroup,
  GROUP_TYPE_LABELS,
  type EnrichedMember,
} from './group-service'
import GroupForm from './GroupForm'
import { db } from '@/services'
import { displayName } from '@/shared/utils/format'
import Avatar from '@/shared/components/Avatar'
import Badge from '@/shared/components/Badge'
import Button from '@/shared/components/Button'
import Card from '@/shared/components/Card'
import EmptyState from '@/shared/components/EmptyState'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'
import { Input } from '@/shared/components/FormFields'
import type { Group, GroupType, GroupMemberStatus, Person } from '@/shared/types'

const TYPE_VARIANT: Record<string, 'info' | 'success' | 'warning' | 'default'> = {
  small_group: 'info',
  class: 'success',
  ministry: 'warning',
  support: 'default',
  other: 'default',
}

export default function GroupsDirectory() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<GroupType | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showNewGroup, setShowNewGroup] = useState(false)

  const reload = useCallback(async () => {
    const data = await getAllGroups()
    setGroups(data.sort((a, b) => a.name.localeCompare(b.name)))
    setLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])

  const filtered = groups.filter(g => {
    if (typeFilter !== 'all' && g.group_type !== typeFilter) return false
    if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-48">
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search groups..."
          />
        </div>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
          {(['all', ...Object.keys(GROUP_TYPE_LABELS)] as (GroupType | 'all')[]).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 font-medium ${typeFilter === t ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {t === 'all' ? 'All' : GROUP_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <Button onClick={() => setShowNewGroup(true)}>+ New group</Button>
      </div>

      <span className="text-sm text-gray-400">{filtered.length} group{filtered.length !== 1 ? 's' : ''}</span>

      {filtered.length === 0 ? (
        <EmptyState title="No groups found" description={search ? 'Try a different search.' : 'Create a group to get started.'} />
      ) : (
        <div className="space-y-2">
          {filtered.map(group => (
            <GroupRow
              key={group.id}
              group={group}
              expanded={expandedId === group.id}
              onToggle={() => setExpandedId(expandedId === group.id ? null : group.id)}
              onUpdated={reload}
            />
          ))}
        </div>
      )}

      <Modal isOpen={showNewGroup} onClose={() => setShowNewGroup(false)} title="Create Group">
        <GroupForm onDone={() => { setShowNewGroup(false); void reload() }} />
      </Modal>
    </div>
  )
}

function GroupRow({
  group, expanded, onToggle, onUpdated,
}: {
  group: Group
  expanded: boolean
  onToggle: () => void
  onUpdated: () => void
}) {
  const navigate = useNavigate()
  const [members, setMembers] = useState<EnrichedMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)

  useEffect(() => {
    if (!expanded) return
    setMembersLoading(true)
    getEnrichedMembers(group.id).then(m => { setMembers(m); setMembersLoading(false) })
  }, [expanded, group.id])

  async function handleRemove(personId: string) {
    await removeMember(group.id, personId)
    setMembers(await getEnrichedMembers(group.id))
  }

  async function handleStatusChange(memberId: string, status: GroupMemberStatus) {
    await updateMemberStatus(memberId, status)
    setMembers(await getEnrichedMembers(group.id))
  }

  const activeCount = members.filter(m => m.member.status === 'active').length
  const waitlistCount = members.filter(m => m.member.status === 'waitlisted').length

  return (
    <Card>
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer select-none"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="font-semibold text-gray-900">{group.name}</div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Badge variant={TYPE_VARIANT[group.group_type] ?? 'default'}>
                {GROUP_TYPE_LABELS[group.group_type] ?? group.group_type}
              </Badge>
              {group.meeting_day && (
                <span className="text-xs text-gray-500">{group.meeting_day}{group.meeting_time ? ` · ${group.meeting_time}` : ''}</span>
              )}
              {group.location && <span className="text-xs text-gray-400">{group.location}</span>}
              {!group.is_active && <Badge variant="danger">Inactive</Badge>}
              {!group.is_open && <Badge variant="default">Closed</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          <span className="text-sm text-gray-400 hidden sm:block">
            {activeCount} member{activeCount !== 1 ? 's' : ''}
            {waitlistCount > 0 ? ` · ${waitlistCount} waitlisted` : ''}
            {group.max_capacity ? ` / ${group.max_capacity}` : ''}
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
          {group.description && (
            <p className="text-sm text-gray-600">{group.description}</p>
          )}

          {membersLoading ? (
            <Spinner size="sm" />
          ) : members.length === 0 ? (
            <p className="text-sm text-gray-400">No members yet.</p>
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
                        onClick={e => e.stopPropagation()}
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

          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowAddMember(true)}>
              + Add member
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowEdit(true)}>
              Edit group
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/groups/${group.id}`)}>
              Attendance →
            </Button>
          </div>

          <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title={`Edit: ${group.name}`}>
            <GroupForm group={group} onDone={() => { setShowEdit(false); onUpdated() }} />
          </Modal>

          <Modal isOpen={showAddMember} onClose={() => setShowAddMember(false)} title={`Add member to ${group.name}`}>
            <AddMemberForm
              groupId={group.id}
              existingPersonIds={members.map(m => m.person.id)}
              onDone={() => {
                setShowAddMember(false)
                getEnrichedMembers(group.id).then(setMembers)
              }}
            />
          </Modal>
        </div>
      )}
    </Card>
  )
}

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
