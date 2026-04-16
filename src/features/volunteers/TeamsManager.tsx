import { useState, useEffect, useCallback } from 'react'
import {
  getTeams,
  createTeam,
  updateTeam,
  getEnrichedTeamMembers,
  addTeamMember,
  removeTeamMember,
  updateMemberRotation,
  type EnrichedMember,
} from './volunteer-service'
import { db } from '@/services'
import { displayName } from '@/shared/utils/format'
import Avatar from '@/shared/components/Avatar'
import Badge from '@/shared/components/Badge'
import Button from '@/shared/components/Button'
import Card from '@/shared/components/Card'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'
import EmptyState from '@/shared/components/EmptyState'
import { Input, Select } from '@/shared/components/FormFields'
import type { Team, RotationPreference, TeamMemberRole, Person } from '@/shared/types'

const ROTATION_LABELS: Record<RotationPreference, string> = {
  every_week: 'Every week',
  '1st_sunday': '1st Sunday',
  '2nd_sunday': '2nd Sunday',
  '3rd_sunday': '3rd Sunday',
  '4th_sunday': '4th Sunday',
  '5th_sunday': '5th Sunday',
  every_other: 'Every other week',
  as_needed: 'As needed',
}

const ROTATIONS = Object.entries(ROTATION_LABELS) as [RotationPreference, string][]

export default function TeamsManager() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null)
  const [showNewTeam, setShowNewTeam] = useState(false)

  const reload = useCallback(async () => {
    const t = await getTeams()
    setTeams(t)
    setLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>

  return (
    <div className="space-y-3">
      {teams.length === 0 && (
        <EmptyState title="No teams yet" description="Create a team to start managing volunteers." />
      )}

      {teams.map(team => (
        <TeamRow
          key={team.id}
          team={team}
          expanded={expandedTeamId === team.id}
          onToggle={() => setExpandedTeamId(expandedTeamId === team.id ? null : team.id)}
          onUpdated={reload}
        />
      ))}

      <Button variant="secondary" onClick={() => setShowNewTeam(true)}>+ New team</Button>

      <Modal isOpen={showNewTeam} onClose={() => setShowNewTeam(false)} title="Create Team">
        <NewTeamForm onDone={() => { setShowNewTeam(false); void reload() }} />
      </Modal>
    </div>
  )
}

function TeamRow({
  team, expanded, onToggle, onUpdated,
}: {
  team: Team
  expanded: boolean
  onToggle: () => void
  onUpdated: () => void
}) {
  const [members, setMembers] = useState<EnrichedMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)

  useEffect(() => {
    if (!expanded) return
    setMembersLoading(true)
    getEnrichedTeamMembers(team.id).then(m => { setMembers(m); setMembersLoading(false) })
  }, [expanded, team.id])

  async function handleRemove(personId: string) {
    await removeTeamMember(team.id, personId)
    const updated = await getEnrichedTeamMembers(team.id)
    setMembers(updated)
  }

  async function handleRotationChange(memberId: string, pref: RotationPreference) {
    await updateMemberRotation(memberId, pref)
    const updated = await getEnrichedTeamMembers(team.id)
    setMembers(updated)
  }

  return (
    <Card>
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer select-none"
        onClick={onToggle}
      >
        <div>
          <div className="font-semibold text-gray-900">{team.name}</div>
          {team.description && (
            <div className="text-xs text-gray-500 mt-0.5">{team.description}</div>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-3">
          {membersLoading ? (
            <Spinner size="sm" />
          ) : members.length === 0 ? (
            <p className="text-sm text-gray-400">No members yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="py-2 font-medium text-gray-500">Member</th>
                  <th className="py-2 font-medium text-gray-500 hidden sm:table-cell">Role</th>
                  <th className="py-2 font-medium text-gray-500">Rotation</th>
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
                    <td className="py-2 pr-3 hidden sm:table-cell">
                      <Badge variant={member.role === 'coordinator' ? 'warning' : member.role === 'leader' ? 'info' : 'default'}>
                        {member.role}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={member.rotation_preference}
                        onChange={e => void handleRotationChange(member.id, e.target.value as RotationPreference)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        onClick={e => e.stopPropagation()}
                      >
                        {ROTATIONS.map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </td>
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

          <Button variant="secondary" size="sm" onClick={() => setShowAddMember(true)}>
            + Add member
          </Button>

          <Modal isOpen={showAddMember} onClose={() => setShowAddMember(false)} title={`Add member to ${team.name}`}>
            <AddMemberForm
              teamId={team.id}
              existingPersonIds={members.map(m => m.person.id)}
              onDone={() => {
                setShowAddMember(false)
                getEnrichedTeamMembers(team.id).then(setMembers)
              }}
            />
          </Modal>
        </div>
      )}
    </Card>
  )
}

function NewTeamForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await createTeam({ name, description: description || undefined })
    onDone()
  }

  return (
    <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
      <Input label="Team name" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Music" />
      <Input label="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} placeholder="What this team does" />
      <Button type="submit" loading={saving} disabled={!name.trim()}>Create Team</Button>
    </form>
  )
}

function AddMemberForm({
  teamId,
  existingPersonIds,
  onDone,
}: {
  teamId: string
  existingPersonIds: string[]
  onDone: () => void
}) {
  const [people, setPeople] = useState<Person[]>([])
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<TeamMemberRole>('member')
  const [rotation, setRotation] = useState<RotationPreference>('every_week')
  const [saving, setSaving] = useState(false)
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    db.getPeople().then(all => {
      setPeople(all.filter(p => p.is_active && !p.is_child && !existingPersonIds.includes(p.id)))
    })
  }, [])

  const filtered = people.filter(p =>
    !search || displayName(p).toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8)

  async function handleAdd() {
    if (!selectedId) return
    setSaving(true)
    await addTeamMember(teamId, selectedId, role, rotation)
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
      <Select label="Role" value={role} onChange={e => setRole(e.target.value as TeamMemberRole)}>
        <option value="member">Member</option>
        <option value="leader">Leader</option>
        <option value="coordinator">Coordinator</option>
      </Select>
      <Select label="Rotation" value={rotation} onChange={e => setRotation(e.target.value as RotationPreference)}>
        {ROTATIONS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
      </Select>
      <Button loading={saving} disabled={!selectedId} onClick={() => void handleAdd()}>Add to Team</Button>
    </div>
  )
}
