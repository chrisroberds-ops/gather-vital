import { useState, useEffect } from 'react'
import { getVisibleGroups, signUpForGroup, GROUP_TYPE_LABELS, type GroupWithCapacity } from './group-service'
import { db } from '@/services'
import EmptyState from '@/shared/components/EmptyState'
import Modal from '@/shared/components/Modal'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'
import type { GroupType } from '@/shared/types'

const TYPE_COLORS: Record<string, string> = {
  small_group: 'bg-blue-100 text-blue-700',
  class: 'bg-green-100 text-green-700',
  ministry: 'bg-amber-100 text-amber-700',
  support: 'bg-purple-100 text-purple-700',
  other: 'bg-gray-100 text-gray-700',
}

export default function GroupBrowser() {
  const [groups, setGroups] = useState<GroupWithCapacity[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<GroupType | 'all'>('all')
  const [signUpGroup, setSignUpGroup] = useState<GroupWithCapacity | null>(null)

  useEffect(() => {
    getVisibleGroups().then(g => { setGroups(g.sort((a, b) => a.name.localeCompare(b.name))); setLoading(false) })
  }, [])

  const types = [...new Set(groups.map(g => g.group_type))]

  const filtered = groups.filter(g => {
    if (typeFilter !== 'all' && g.group_type !== typeFilter) return false
    if (search && !g.name.toLowerCase().includes(search.toLowerCase()) &&
        !g.hook_text?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div className="space-y-6">
      {/* Search + filter */}
      <div className="space-y-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search groups..."
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {types.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {(['all', ...types] as (GroupType | 'all')[]).map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                  typeFilter === t
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t === 'all' ? 'All groups' : GROUP_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No groups found" description="Try a different search or filter." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(group => (
            <GroupCard key={group.id} group={group} onSignUp={() => setSignUpGroup(group)} />
          ))}
        </div>
      )}

      <Modal isOpen={!!signUpGroup} onClose={() => setSignUpGroup(null)} title={`Join: ${signUpGroup?.name ?? ''}`}>
        {signUpGroup && (
          <SignUpForm
            group={signUpGroup}
            onDone={() => setSignUpGroup(null)}
          />
        )}
      </Modal>
    </div>
  )
}

function GroupCard({ group, onSignUp }: { group: GroupWithCapacity; onSignUp: () => void }) {
  const colorClass = TYPE_COLORS[group.group_type] ?? TYPE_COLORS.other

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-sm transition-shadow">
      {group.image_url ? (
        <img src={group.image_url} alt={group.name} className="w-full h-32 object-cover" />
      ) : (
        <div className={`w-full h-20 flex items-center justify-center ${colorClass.replace('text-', 'bg-').split(' ')[0]} bg-opacity-20`}>
          <span className={`text-3xl font-bold ${colorClass.split(' ')[1]}`}>
            {group.name.charAt(0)}
          </span>
        </div>
      )}
      <div className="p-4 space-y-3">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-gray-900">{group.name}</h3>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${colorClass}`}>
              {GROUP_TYPE_LABELS[group.group_type]}
            </span>
          </div>
          {group.hook_text && (
            <p className="text-sm text-gray-600 mt-1">{group.hook_text}</p>
          )}
        </div>

        <div className="space-y-1 text-xs text-gray-500">
          {group.meeting_day && (
            <div>{group.meeting_day}{group.meeting_time ? ` · ${group.meeting_time}` : ''}</div>
          )}
          {group.location && <div>{group.location}</div>}
          {group.category && <div className="text-gray-400">{group.category}</div>}
          {group.availableSpots !== null && (
            <div className={group.isAtCapacity ? 'text-amber-600 font-medium' : 'text-gray-400'}>
              {group.isAtCapacity ? 'Full — join waitlist' : `${group.availableSpots} spot${group.availableSpots !== 1 ? 's' : ''} available`}
            </div>
          )}
        </div>

        {!group.is_open ? (
          <div className="text-xs text-center text-gray-400 py-1">Enrollment closed</div>
        ) : group.isAtCapacity ? (
          <Button size="sm" variant="secondary" onClick={onSignUp} className="w-full justify-center">
            Join waitlist
          </Button>
        ) : (
          <Button size="sm" onClick={onSignUp} className="w-full justify-center">
            Sign up
          </Button>
        )}
      </div>
    </div>
  )
}

function SignUpForm({ group, onDone }: { group: Group; onDone: () => void }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ waitlisted: boolean; alreadyMember: boolean } | null>(null)

  const inputClass = 'border border-gray-300 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary-500'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    // Find existing person by phone, or create new
    let person = null
    if (phone) {
      const all = await db.getPeople()
      person = all.find(p => p.phone?.replace(/\D/g, '') === phone.replace(/\D/g, '')) ?? null
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
    const res = await signUpForGroup(group.id, person.id)
    setResult({ waitlisted: res.waitlisted, alreadyMember: res.alreadyMember })
    setSaving(false)
  }

  if (result) {
    return (
      <div className="space-y-4 text-center py-2">
        <div className="text-4xl">{result.alreadyMember ? '✓' : result.waitlisted ? '⏳' : '🎉'}</div>
        <div>
          <p className="font-semibold text-gray-900">
            {result.alreadyMember ? 'You\'re already a member!' : result.waitlisted ? 'You\'ve been added to the waitlist' : `Welcome to ${group.name}!`}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {result.alreadyMember
              ? 'You\'re already signed up for this group.'
              : result.waitlisted
              ? 'We\'ll reach out when a spot opens up.'
              : 'The group leader will be in touch soon.'}
          </p>
        </div>
        <Button onClick={onDone}>Done</Button>
      </div>
    )
  }

  return (
    <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
      <p className="text-sm text-gray-500">Enter your info and we'll get you connected.</p>
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
        Sign up
      </Button>
    </form>
  )
}
