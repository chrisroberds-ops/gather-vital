import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchPeople, getActivePeople, displayName } from './people-service'
import { useDebounce } from '@/shared/hooks/useDebounce'
import Avatar from '@/shared/components/Avatar'
import Badge, { membershipBadgeVariant } from '@/shared/components/Badge'
import Button from '@/shared/components/Button'
import EmptyState from '@/shared/components/EmptyState'
import Spinner from '@/shared/components/Spinner'
import { formatPhone, formatAge } from '@/shared/utils/format'
import type { Person } from '@/shared/types'

type FilterPeople = 'all' | 'adults' | 'children'
type FilterStatus = 'active' | 'all' | 'archived'

const PAGE_SIZE = 25

export default function PeopleDirectory() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [filterPeople, setFilterPeople] = useState<FilterPeople>('all')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('active')
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)

  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    setLoading(true)
    setPage(0)
    const load = async () => {
      try {
        let results: Person[]
        if (debouncedQuery.trim()) {
          results = await searchPeople(debouncedQuery)
        } else {
          results = await getActivePeople()
        }
        setPeople(results)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [debouncedQuery])

  const filtered = people.filter(p => {
    if (filterStatus === 'active'   && (!p.is_active || p.is_archived)) return false
    if (filterStatus === 'all'      && p.is_archived) return false
    if (filterStatus === 'archived' && !p.is_archived) return false
    if (filterPeople === 'adults'   && p.is_child) return false
    if (filterPeople === 'children' && !p.is_child) return false
    return true
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">People</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? 'Loading…' : `${filtered.length} ${filtered.length === 1 ? 'person' : 'people'}`}
          </p>
        </div>
        <Button onClick={() => navigate('/admin/people/new')}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Person
        </Button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, phone, or email…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <div className="flex border border-gray-300 rounded-lg overflow-hidden">
          {(['all', 'adults', 'children'] as FilterPeople[]).map(f => (
            <button
              key={f}
              onClick={() => { setFilterPeople(f); setPage(0) }}
              className={`px-3 py-2 text-xs font-medium capitalize transition-colors ${
                filterPeople === f ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex border border-gray-300 rounded-lg overflow-hidden">
          {([
            { value: 'active',   label: 'Active' },
            { value: 'all',      label: 'All' },
            { value: 'archived', label: 'Archived' },
          ] as { value: FilterStatus; label: string }[]).map(f => (
            <button
              key={f.value}
              onClick={() => { setFilterStatus(f.value); setPage(0) }}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                filterStatus === f.value ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : paginated.length === 0 ? (
          <EmptyState
            title={query ? 'No results' : 'No people yet'}
            description={query ? `No one matched "${query}".` : 'Add the first person to get started.'}
            action={!query ? <Button onClick={() => navigate('/admin/people/new')}>Add Person</Button> : undefined}
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Phone</th>
                <th className="px-4 py-3 font-medium text-gray-500 hidden lg:table-cell">Email</th>
                <th className="px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Type</th>
                <th className="px-4 py-3 font-medium text-gray-500 hidden lg:table-cell">Membership</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((person, idx) => (
                <tr
                  key={person.id}
                  onClick={() => navigate(`/admin/people/${person.id}`)}
                  className={`cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50 ${
                    !person.is_active ? 'opacity-50' : ''
                  } ${idx === paginated.length - 1 ? 'border-b-0' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={displayName(person)} photoUrl={person.photo_url} size="sm" />
                      <div>
                        <div className="font-medium text-gray-900">{displayName(person)}</div>
                        {person.preferred_name && (
                          <div className="text-xs text-gray-400">Legal: {person.first_name}</div>
                        )}
                        {person.is_child && person.grade && (
                          <div className="text-xs text-gray-400">{person.grade} grade</div>
                        )}
                        {!person.is_active && (
                          <Badge variant="default">Inactive</Badge>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                    {formatPhone(person.phone)}
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden lg:table-cell truncate max-w-48">
                    {person.email ?? '—'}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div className="flex flex-col gap-1">
                      <Badge variant={person.is_child ? 'purple' : 'info'}>
                        {person.is_child ? `Child${person.grade ? ` · ${person.grade}` : ''}` : `Adult${formatAge(person.date_of_birth) !== '—' ? ` · ${formatAge(person.date_of_birth)}` : ''}`}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {person.membership_status ? (
                      <Badge variant={membershipBadgeVariant(person.membership_status)}>
                        {person.membership_status.replace('_', ' ')}
                      </Badge>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {page + 1} of {totalPages} · {filtered.length} total
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
