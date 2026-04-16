import { useState } from 'react'
import type { Grade } from '@/shared/types'

interface ChildInput {
  firstName: string
  lastName: string
  grade: string
  dateOfBirth: string
  allergies: string
}

interface Props {
  initialPhone?: string
  onSubmit: (data: {
    parentFirstName: string
    parentLastName: string
    parentPhone: string
    parentEmail: string
    children: ChildInput[]
  }) => void
  onBack: () => void
  loading?: boolean
  error?: string | null
}

const GRADES: Grade[] = ['Pre-K', 'K', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th']

const emptyChild = (): ChildInput => ({ firstName: '', lastName: '', grade: '', dateOfBirth: '', allergies: '' })

export default function NewFamilyForm({ initialPhone = '', onSubmit, onBack, loading, error }: Props) {
  const [parentFirstName, setParentFirstName] = useState('')
  const [parentLastName, setParentLastName] = useState('')
  const [parentPhone, setParentPhone] = useState(initialPhone.replace('+1', ''))
  const [parentEmail, setParentEmail] = useState('')
  const [children, setChildren] = useState<ChildInput[]>([emptyChild()])

  function updateChild(idx: number, field: keyof ChildInput, value: string) {
    setChildren(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }

  function addChild() {
    setChildren(prev => [...prev, emptyChild()])
  }

  function removeChild(idx: number) {
    setChildren(prev => prev.filter((_, i) => i !== idx))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      parentFirstName,
      parentLastName,
      parentPhone: '+1' + parentPhone.replace(/\D/g, ''),
      parentEmail,
      children,
    })
  }

  const isValid =
    parentFirstName.trim() &&
    parentLastName.trim() &&
    parentPhone.replace(/\D/g, '').length === 10 &&
    children.every(c => c.firstName.trim() && c.lastName.trim() && c.grade)

  const inputClass = 'w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-600 to-primary-800 px-4 py-8 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🎉</div>
          <h1 className="text-xl font-bold text-gray-900">Welcome! Let's get you set up.</h1>
          <p className="text-gray-500 text-sm mt-1">This takes about 2 minutes.</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Your Info</h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className={labelClass}>First name *</label>
                <input className={inputClass} value={parentFirstName} onChange={e => setParentFirstName(e.target.value)} required />
              </div>
              <div>
                <label className={labelClass}>Last name *</label>
                <input className={inputClass} value={parentLastName} onChange={e => setParentLastName(e.target.value)} required />
              </div>
            </div>
            <div className="mb-3">
              <label className={labelClass}>Phone number *</label>
              <input
                className={inputClass}
                type="tel"
                value={parentPhone}
                onChange={e => setParentPhone(e.target.value)}
                placeholder="(555) 123-4567"
                required
              />
            </div>
            <div>
              <label className={labelClass}>Email (optional)</label>
              <input className={inputClass} type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
              Your Kids
            </h2>
            {children.map((child, idx) => (
              <div key={idx} className="border border-gray-200 rounded-2xl p-4 mb-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">Child {idx + 1}</span>
                  {children.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeChild(idx)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelClass}>First name *</label>
                    <input
                      className={inputClass}
                      value={child.firstName}
                      onChange={e => updateChild(idx, 'firstName', e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Last name *</label>
                    <input
                      className={inputClass}
                      value={child.lastName}
                      onChange={e => updateChild(idx, 'lastName', e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelClass}>Grade *</label>
                    <select
                      className={inputClass}
                      value={child.grade}
                      onChange={e => updateChild(idx, 'grade', e.target.value)}
                      required
                    >
                      <option value="">Select...</option>
                      {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Date of birth</label>
                    <input
                      className={inputClass}
                      type="date"
                      value={child.dateOfBirth}
                      onChange={e => updateChild(idx, 'dateOfBirth', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Allergies (appears on label)</label>
                  <input
                    className={inputClass}
                    value={child.allergies}
                    onChange={e => updateChild(idx, 'allergies', e.target.value)}
                    placeholder="e.g. Peanuts, Tree nuts"
                  />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addChild}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-2xl text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors"
            >
              + Add another child
            </button>
          </div>

          <button
            type="submit"
            disabled={!isValid || loading}
            className="w-full py-4 bg-primary-600 text-white rounded-2xl font-bold text-lg disabled:opacity-40 hover:bg-primary-700 transition-colors"
          >
            {loading ? 'Registering...' : 'Register & Check In'}
          </button>
        </form>

        <button
          onClick={onBack}
          className="w-full mt-3 py-3 text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back
        </button>
      </div>
    </div>
  )
}
