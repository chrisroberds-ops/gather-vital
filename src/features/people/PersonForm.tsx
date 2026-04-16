import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getPerson, createPerson, updatePerson, displayName } from './people-service'
import Button from '@/shared/components/Button'
import { Input, Select, Textarea } from '@/shared/components/FormFields'
import Spinner from '@/shared/components/Spinner'
import type { Person, Grade, MembershipStatus, RelationshipStatus } from '@/shared/types'

const GRADES: Grade[] = ['Pre-K', 'K', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th']
const MEMBERSHIP_STATUSES: MembershipStatus[] = ['member', 'regular_attender', 'visitor', 'inactive']
const RELATIONSHIP_STATUSES: RelationshipStatus[] = ['married', 'single', 'partnered', 'divorced', 'co-parenting', 'widowed', 'other']

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return raw
}

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))
}

type FormData = {
  first_name: string
  last_name: string
  preferred_name: string
  pronouns: string
  email: string
  phone: string
  date_of_birth: string
  is_child: boolean
  grade: string
  gender_identity: string
  relationship_status: string
  membership_status: string
  allergies: string
  medical_notes: string
  special_needs: string
  custom_field_1: string
  custom_field_2: string
  visitor_source: string
  first_visit_date: string
  is_active: boolean
  // Life events
  baptism_date: string
  membership_date: string
  salvation_date: string
  // Volunteer
  background_check_date: string
  background_check_expiry: string
  training_completed: boolean
}

function personToForm(p: Person): FormData {
  return {
    first_name: p.first_name,
    last_name: p.last_name,
    preferred_name: p.preferred_name ?? '',
    pronouns: p.pronouns ?? '',
    email: p.email ?? '',
    phone: p.phone,
    date_of_birth: p.date_of_birth ?? '',
    is_child: p.is_child,
    grade: p.grade ?? '',
    gender_identity: p.gender_identity ?? '',
    relationship_status: p.relationship_status ?? '',
    membership_status: p.membership_status ?? '',
    allergies: p.allergies ?? '',
    medical_notes: p.medical_notes ?? '',
    special_needs: p.special_needs ?? '',
    custom_field_1: p.custom_field_1 ?? '',
    custom_field_2: p.custom_field_2 ?? '',
    visitor_source: p.visitor_source ?? '',
    first_visit_date: p.first_visit_date ?? '',
    is_active: p.is_active,
    baptism_date: p.baptism_date ?? '',
    membership_date: p.membership_date ?? '',
    salvation_date: p.salvation_date ?? '',
    background_check_date: p.background_check_date ?? '',
    background_check_expiry: p.background_check_expiry ?? '',
    training_completed: p.training_completed ?? false,
  }
}

const defaultForm: FormData = {
  first_name: '',
  last_name: '',
  preferred_name: '',
  pronouns: '',
  email: '',
  phone: '',
  date_of_birth: '',
  is_child: false,
  grade: '',
  gender_identity: '',
  relationship_status: '',
  membership_status: '',
  allergies: '',
  medical_notes: '',
  special_needs: '',
  custom_field_1: '',
  custom_field_2: '',
  visitor_source: '',
  first_visit_date: '',
  is_active: true,
  baptism_date: '',
  membership_date: '',
  salvation_date: '',
  background_check_date: '',
  background_check_expiry: '',
  training_completed: false,
}

export default function PersonForm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [form, setForm] = useState<FormData>(defaultForm)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [existingPerson, setExistingPerson] = useState<Person | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getPerson(id).then(p => {
      if (p) {
        setExistingPerson(p)
        setForm(personToForm(p))
      }
      setLoading(false)
    })
  }, [id])

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }))
  }

  function validate(): boolean {
    const newErrors: Partial<Record<keyof FormData, string>> = {}
    if (!form.first_name.trim()) newErrors.first_name = 'First name is required'
    if (!form.last_name.trim()) newErrors.last_name = 'Last name is required'
    if (!form.phone.trim()) {
      newErrors.phone = 'Phone number is required'
    } else if (!isValidPhone(form.phone)) {
      newErrors.phone = 'Enter a valid 10-digit phone number'
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Enter a valid email address'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setSaving(true)
    try {
      const payload: Omit<Person, 'id' | 'created_at' | 'updated_at'> = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        preferred_name: form.preferred_name.trim() || undefined,
        pronouns: form.pronouns.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: normalizePhone(form.phone),
        date_of_birth: form.date_of_birth || undefined,
        is_child: form.is_child,
        grade: (form.is_child && form.grade ? form.grade as Grade : undefined),
        gender_identity: form.gender_identity.trim() || undefined,
        relationship_status: (form.relationship_status as RelationshipStatus) || undefined,
        membership_status: (form.membership_status as MembershipStatus) || undefined,
        allergies: form.allergies.trim() || undefined,
        medical_notes: form.medical_notes.trim() || undefined,
        special_needs: form.special_needs.trim() || undefined,
        custom_field_1: form.custom_field_1.trim() || undefined,
        custom_field_2: form.custom_field_2.trim() || undefined,
        visitor_source: form.visitor_source.trim() || undefined,
        first_visit_date: form.first_visit_date || undefined,
        is_active: form.is_active,
        photo_url: existingPerson?.photo_url,
        baptism_date: form.baptism_date || undefined,
        membership_date: form.membership_date || undefined,
        salvation_date: form.salvation_date || undefined,
        background_check_date: form.background_check_date || undefined,
        background_check_expiry: form.background_check_expiry || undefined,
        training_completed: form.training_completed || undefined,
      }

      if (isEdit && id) {
        await updatePerson(id, payload)
        navigate(`/admin/people/${id}`)
      } else {
        const created = await createPerson(payload)
        navigate(`/admin/people/${created.id}`)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  }

  const pageTitle = isEdit
    ? `Edit ${existingPerson ? displayName(existingPerson) : 'Person'}`
    : 'Add Person'

  return (
    <div className="p-6 max-w-2xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/admin/people" className="hover:text-gray-700">People</Link>
        {isEdit && existingPerson && (
          <>
            <span>/</span>
            <Link to={`/admin/people/${id}`} className="hover:text-gray-700">
              {displayName(existingPerson)}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-gray-900 font-medium">{isEdit ? 'Edit' : 'New Person'}</span>
      </nav>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">{pageTitle}</h1>

      <form onSubmit={e => void handleSubmit(e)} className="space-y-6">
        {/* Basic info */}
        <section>
          <h2 className="font-semibold text-gray-700 text-sm mb-3 uppercase tracking-wide">Basic Information</h2>
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First name"
                required
                value={form.first_name}
                onChange={e => set('first_name', e.target.value)}
                error={errors.first_name}
                autoComplete="given-name"
              />
              <Input
                label="Last name"
                required
                value={form.last_name}
                onChange={e => set('last_name', e.target.value)}
                error={errors.last_name}
                autoComplete="family-name"
              />
            </div>
            <Input
              label="Preferred name"
              value={form.preferred_name}
              onChange={e => set('preferred_name', e.target.value)}
              hint="Used everywhere in place of their legal first name"
            />
            <Input
              label="Pronouns"
              value={form.pronouns}
              onChange={e => set('pronouns', e.target.value)}
              placeholder="e.g., she/her, he/him, they/them"
            />
            <Input
              label="Gender identity"
              value={form.gender_identity}
              onChange={e => set('gender_identity', e.target.value)}
            />
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="is_child"
                checked={form.is_child}
                onChange={e => set('is_child', e.target.checked)}
                className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
              />
              <label htmlFor="is_child" className="text-sm font-medium text-gray-700">
                This person is a child
              </label>
            </div>
            {form.is_child && (
              <Select
                label="Grade"
                value={form.grade}
                onChange={e => set('grade', e.target.value)}
              >
                <option value="">— Select grade —</option>
                {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
              </Select>
            )}
            <Input
              label="Date of birth"
              type="date"
              value={form.date_of_birth}
              onChange={e => set('date_of_birth', e.target.value)}
            />
            {!form.is_child && (
              <Select
                label="Relationship status"
                value={form.relationship_status}
                onChange={e => set('relationship_status', e.target.value)}
              >
                <option value="">— Select —</option>
                {RELATIONSHIP_STATUSES.map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('-', ' ')}</option>
                ))}
              </Select>
            )}
          </div>
        </section>

        {/* Contact */}
        <section>
          <h2 className="font-semibold text-gray-700 text-sm mb-3 uppercase tracking-wide">Contact</h2>
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <Input
              label="Phone number"
              required
              type="tel"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              error={errors.phone}
              placeholder="(555) 123-4567"
              hint="Primary identifier — used for kiosk check-in lookup"
              autoComplete="tel"
            />
            <Input
              label="Email address"
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              error={errors.email}
              autoComplete="email"
            />
            <Select
              label="Membership status"
              value={form.membership_status}
              onChange={e => set('membership_status', e.target.value)}
            >
              <option value="">— Select —</option>
              {MEMBERSHIP_STATUSES.map(s => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </Select>
            <Input
              label="First visit date"
              type="date"
              value={form.first_visit_date}
              onChange={e => set('first_visit_date', e.target.value)}
            />
            <Input
              label="How did you hear about us?"
              value={form.visitor_source}
              onChange={e => set('visitor_source', e.target.value)}
            />
          </div>
        </section>

        {/* Health (children only) */}
        {form.is_child && (
          <section>
            <h2 className="font-semibold text-gray-700 text-sm mb-3 uppercase tracking-wide">Health & Safety</h2>
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <Input
                label="Allergies"
                value={form.allergies}
                onChange={e => set('allergies', e.target.value)}
                hint="Displayed on check-in label"
              />
              <Textarea
                label="Medical notes"
                value={form.medical_notes}
                onChange={e => set('medical_notes', e.target.value)}
                hint="Visible to staff only"
              />
              <Textarea
                label="Special needs"
                value={form.special_needs}
                onChange={e => set('special_needs', e.target.value)}
                hint="Visible to staff only"
              />
            </div>
          </section>
        )}

        {/* Life events (adults only) */}
        {!form.is_child && (
          <section>
            <h2 className="font-semibold text-gray-700 text-sm mb-3 uppercase tracking-wide">Life Events</h2>
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <Input
                label="Salvation date"
                type="date"
                value={form.salvation_date}
                onChange={e => set('salvation_date', e.target.value)}
              />
              <Input
                label="Baptism date"
                type="date"
                value={form.baptism_date}
                onChange={e => set('baptism_date', e.target.value)}
              />
              <Input
                label="Membership date"
                type="date"
                value={form.membership_date}
                onChange={e => set('membership_date', e.target.value)}
              />
            </div>
          </section>
        )}

        {/* Volunteer / background check */}
        <section>
          <h2 className="font-semibold text-gray-700 text-sm mb-3 uppercase tracking-wide">Volunteer</h2>
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <Input
              label="Background check date"
              type="date"
              value={form.background_check_date}
              onChange={e => set('background_check_date', e.target.value)}
            />
            <Input
              label="Background check expiry"
              type="date"
              value={form.background_check_expiry}
              onChange={e => set('background_check_expiry', e.target.value)}
            />
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="training_completed"
                checked={form.training_completed}
                onChange={e => set('training_completed', e.target.checked)}
                className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
              />
              <label htmlFor="training_completed" className="text-sm font-medium text-gray-700">
                Training completed
              </label>
            </div>
          </div>
        </section>

        {/* Custom fields */}
        <section>
          <h2 className="font-semibold text-gray-700 text-sm mb-3 uppercase tracking-wide">Additional Fields</h2>
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <Input
              label="Custom field 1"
              value={form.custom_field_1}
              onChange={e => set('custom_field_1', e.target.value)}
              hint="Label configured in church settings"
            />
            <Input
              label="Custom field 2"
              value={form.custom_field_2}
              onChange={e => set('custom_field_2', e.target.value)}
              hint="Label configured in church settings"
            />
          </div>
        </section>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" loading={saving}>
            {isEdit ? 'Save changes' : 'Add person'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(isEdit && id ? `/admin/people/${id}` : '/admin/people')}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
