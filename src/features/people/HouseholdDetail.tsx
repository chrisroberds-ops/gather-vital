import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { db } from '@/services'
import { displayName, formatPhone } from '@/shared/utils/format'
import Avatar from '@/shared/components/Avatar'
import Badge from '@/shared/components/Badge'
import Card from '@/shared/components/Card'
import Spinner from '@/shared/components/Spinner'
import type { Household, Person, HouseholdMember } from '@/shared/types'

interface MemberRow {
  member: HouseholdMember
  person: Person
}

export default function HouseholdDetail() {
  const { id } = useParams<{ id: string }>()
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([
      db.getHousehold(id),
      db.getHouseholdMembers(id),
    ]).then(async ([hh, memberRecords]) => {
      setHousehold(hh)
      const rows = await Promise.all(
        memberRecords.map(async m => {
          const person = await db.getPerson(m.person_id)
          return person ? { member: m, person } : null
        })
      )
      setMembers(rows.filter((r): r is MemberRow => r !== null))
      setLoading(false)
    })
  }, [id])

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  }

  if (!household) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Household not found.</p>
        <Link to="/admin/people" className="mt-4 inline-block text-sm text-primary-600 hover:underline">
          Back to People
        </Link>
      </div>
    )
  }

  const adults = members.filter(r => r.member.role === 'adult')
  const children = members.filter(r => r.member.role === 'child')
  const others = members.filter(r => r.member.role === 'other')

  const hasAddress = household.address_line_1 || household.city

  return (
    <div className="p-6 max-w-4xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/admin/people" className="hover:text-gray-700">People</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{household.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{household.name}</h1>
        {hasAddress && (
          <p className="text-gray-500 text-sm mt-1">
            {[
              household.address_line_1,
              household.address_line_2,
              household.city,
              household.state,
              household.zip,
            ].filter(Boolean).join(', ')}
          </p>
        )}
      </div>

      <div className="space-y-4">
        {adults.length > 0 && (
          <Card title={`Adults (${adults.length})`}>
            <MemberTable rows={adults} />
          </Card>
        )}

        {children.length > 0 && (
          <Card title={`Children (${children.length})`}>
            <MemberTable rows={children} showGrade />
          </Card>
        )}

        {others.length > 0 && (
          <Card title={`Other (${others.length})`}>
            <MemberTable rows={others} />
          </Card>
        )}

        {members.length === 0 && (
          <p className="text-sm text-gray-400 py-4">No members linked to this household.</p>
        )}
      </div>
    </div>
  )
}

function MemberTable({ rows, showGrade = false }: { rows: MemberRow[]; showGrade?: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 text-left">
          <th className="px-5 py-3 font-medium text-gray-500">Name</th>
          {showGrade && <th className="px-5 py-3 font-medium text-gray-500 hidden sm:table-cell">Grade</th>}
          <th className="px-5 py-3 font-medium text-gray-500 hidden sm:table-cell">Phone</th>
          <th className="px-5 py-3 font-medium text-gray-500 hidden md:table-cell">Email</th>
          <th className="px-5 py-3 font-medium text-gray-500">Role</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ member, person }, idx) => (
          <tr
            key={member.id}
            className={`border-b border-gray-50 ${idx === rows.length - 1 ? 'border-b-0' : ''}`}
          >
            <td className="px-5 py-3">
              <Link
                to={`/admin/people/${person.id}`}
                className="flex items-center gap-3 group"
              >
                <Avatar name={displayName(person)} photoUrl={person.photo_url} size="sm" />
                <div>
                  <span className="font-medium text-gray-900 group-hover:text-primary-600 transition-colors">
                    {displayName(person)}
                  </span>
                  {!person.is_active && (
                    <span className="ml-2 text-xs text-gray-400">(inactive)</span>
                  )}
                </div>
              </Link>
            </td>
            {showGrade && (
              <td className="px-5 py-3 text-gray-500 hidden sm:table-cell">
                {person.grade ?? '—'}
              </td>
            )}
            <td className="px-5 py-3 text-gray-600 hidden sm:table-cell">
              {formatPhone(person.phone)}
            </td>
            <td className="px-5 py-3 text-gray-500 hidden md:table-cell truncate max-w-40">
              {person.email ?? '—'}
            </td>
            <td className="px-5 py-3">
              <Badge variant={member.role === 'adult' ? 'info' : member.role === 'child' ? 'purple' : 'default'}>
                {member.role}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
