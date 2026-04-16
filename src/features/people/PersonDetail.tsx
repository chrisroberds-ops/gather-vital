import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getPerson, getPersonWithHouseholds, archivePerson, unarchivePerson, displayName } from './people-service'
import HouseholdManager from './HouseholdManager'
import Avatar from '@/shared/components/Avatar'
import Badge, { membershipBadgeVariant, flagBadgeVariant } from '@/shared/components/Badge'
import Button from '@/shared/components/Button'
import Card from '@/shared/components/Card'
import Spinner from '@/shared/components/Spinner'
import { formatPhone, formatDate, formatAge } from '@/shared/utils/format'
import { db } from '@/services'
import type { Person, CheckinFlag } from '@/shared/types'

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [person, setPerson] = useState<Person | null>(null)
  const [flags, setFlags] = useState<CheckinFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [deactivating, setDeactivating] = useState(false)
  const [showHouseholds, setShowHouseholds] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      getPerson(id),
      db.getCheckinFlagsForPerson(id),
    ]).then(([p, f]) => {
      setPerson(p)
      setFlags(f)
      setLoading(false)
    })
  }, [id])

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  }

  if (!person) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Person not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate('/admin/people')}>
          Back to People
        </Button>
      </div>
    )
  }

  async function handleToggleArchive() {
    if (!person) return
    setDeactivating(true)
    try {
      const updated = person.is_archived
        ? await unarchivePerson(person.id)
        : await archivePerson(person.id)
      setPerson(updated)
    } finally {
      setDeactivating(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/admin/people" className="hover:text-gray-700">People</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{displayName(person)}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start gap-5 mb-6">
        <Avatar name={displayName(person)} photoUrl={person.photo_url} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{displayName(person)}</h1>
            {person.is_archived && <Badge variant="default">Archived</Badge>}
            {!person.is_active && !person.is_archived && <Badge variant="default">Inactive</Badge>}
            {person.is_child && <Badge variant="purple">Child</Badge>}
            {person.membership_status && (
              <Badge variant={membershipBadgeVariant(person.membership_status)}>
                {person.membership_status.replace('_', ' ')}
              </Badge>
            )}
          </div>
          {person.preferred_name && (
            <p className="text-sm text-gray-500 mt-0.5">Legal name: {person.first_name} {person.last_name}</p>
          )}
          {person.pronouns && (
            <p className="text-sm text-gray-500">{person.pronouns}</p>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="secondary" onClick={() => navigate(`/admin/people/${person.id}/edit`)}>
            Edit
          </Button>
          <Button
            variant={person.is_archived ? 'secondary' : 'danger'}
            loading={deactivating}
            onClick={() => void handleToggleArchive()}
          >
            {person.is_archived ? 'Unarchive' : 'Archive'}
          </Button>
        </div>
      </div>

      {/* Flags */}
      {flags.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <h3 className="font-semibold text-red-800 text-sm mb-2 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Active Flags — Staff Only
          </h3>
          <div className="space-y-2">
            {flags.map(flag => (
              <div key={flag.id} className="flex items-start gap-2">
                <Badge variant={flagBadgeVariant(flag.flag_type)}>
                  {flag.flag_type.replace('_', ' ')}
                </Badge>
                <p className="text-sm text-red-700">{flag.flag_message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Basic info */}
        <Card title="Basic Information">
          <dl className="divide-y divide-gray-50">
            {[
              { label: 'First name', value: person.first_name },
              { label: 'Last name', value: person.last_name },
              { label: 'Preferred name', value: person.preferred_name },
              { label: 'Pronouns', value: person.pronouns },
              { label: 'Gender identity', value: person.gender_identity },
              { label: 'Date of birth', value: `${formatDate(person.date_of_birth)}${person.date_of_birth ? ` (age ${formatAge(person.date_of_birth)})` : ''}` },
              { label: 'Grade', value: person.grade },
              { label: 'Relationship status', value: person.relationship_status?.replace('-', ' ') },
            ].map(({ label, value }) => (
              <div key={label} className="flex px-5 py-3 text-sm">
                <dt className="w-36 text-gray-500 flex-shrink-0">{label}</dt>
                <dd className="text-gray-900">{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Contact */}
        <Card title="Contact Information">
          <dl className="divide-y divide-gray-50">
            {[
              { label: 'Phone', value: formatPhone(person.phone) },
              { label: 'Email', value: person.email },
              { label: 'Membership', value: person.membership_status?.replace('_', ' ') },
              { label: 'Visitor source', value: person.visitor_source },
              { label: 'First visit', value: formatDate(person.first_visit_date) },
            ].map(({ label, value }) => (
              <div key={label} className="flex px-5 py-3 text-sm">
                <dt className="w-36 text-gray-500 flex-shrink-0">{label}</dt>
                <dd className="text-gray-900">{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Health & safety (children) */}
        {person.is_child && (
          <Card title="Health & Safety">
            <dl className="divide-y divide-gray-50">
              {[
                { label: 'Allergies', value: person.allergies, warn: true },
                { label: 'Medical notes', value: person.medical_notes },
                { label: 'Special needs', value: person.special_needs },
              ].map(({ label, value, warn }) => (
                <div key={label} className="flex px-5 py-3 text-sm">
                  <dt className="w-36 text-gray-500 flex-shrink-0">{label}</dt>
                  <dd className={warn && value ? 'text-amber-700 font-medium' : 'text-gray-900'}>
                    {value ?? '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        )}

        {/* Life events */}
        {(person.baptism_date || person.membership_date || person.salvation_date) && (
          <Card title="Life Events">
            <dl className="divide-y divide-gray-50">
              {[
                { label: 'Baptism',    value: formatDate(person.baptism_date) },
                { label: 'Membership', value: formatDate(person.membership_date) },
                { label: 'Salvation',  value: formatDate(person.salvation_date) },
              ].filter(r => r.value && r.value !== '—').map(({ label, value }) => (
                <div key={label} className="flex px-5 py-3 text-sm">
                  <dt className="w-36 text-gray-500 flex-shrink-0">{label}</dt>
                  <dd className="text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        )}

        {/* Custom fields */}
        {(person.custom_field_1 || person.custom_field_2) && (
          <Card title="Additional Information">
            <dl className="divide-y divide-gray-50">
              {person.custom_field_1 && (
                <div className="flex px-5 py-3 text-sm">
                  <dt className="w-36 text-gray-500 flex-shrink-0">Custom 1</dt>
                  <dd className="text-gray-900">{person.custom_field_1}</dd>
                </div>
              )}
              {person.custom_field_2 && (
                <div className="flex px-5 py-3 text-sm">
                  <dt className="w-36 text-gray-500 flex-shrink-0">Custom 2</dt>
                  <dd className="text-gray-900">{person.custom_field_2}</dd>
                </div>
              )}
            </dl>
          </Card>
        )}
      </div>

      {/* Households */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-gray-900">Households</h2>
          <Button variant="ghost" size="sm" onClick={() => setShowHouseholds(!showHouseholds)}>
            {showHouseholds ? 'Hide' : 'Manage households'}
          </Button>
        </div>
        {showHouseholds && <HouseholdManager personId={person.id} />}
        {!showHouseholds && <HouseholdSummary personId={person.id} />}
      </div>
    </div>
  )
}

function HouseholdSummary({ personId }: { personId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getPersonWithHouseholds>>>(null)
  const navigate = useNavigate()

  useEffect(() => {
    getPersonWithHouseholds(personId).then(setData)
  }, [personId])

  if (!data) return <Spinner size="sm" />
  if (data.households.length === 0) {
    return <p className="text-sm text-gray-400 mt-1">Not linked to any household.</p>
  }

  return (
    <div className="space-y-2">
      {data.households.map(({ household, memberRecord }) => (
        <div
          key={household.id}
          className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg text-sm cursor-pointer hover:border-primary-300 transition-colors"
          onClick={() => navigate(`/admin/households/${household.id}`)}
        >
          <div className="flex-1">
            <div className="font-medium text-gray-900">{household.name}</div>
            {household.address_line_1 && (
              <div className="text-gray-500 text-xs">
                {household.address_line_1}{household.city ? `, ${household.city}` : ''}
              </div>
            )}
          </div>
          <Badge variant={memberRecord.role === 'adult' ? 'info' : 'purple'}>{memberRecord.role}</Badge>
        </div>
      ))}
    </div>
  )
}
