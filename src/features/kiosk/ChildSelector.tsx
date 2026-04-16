import { useState } from 'react'
import type { Person } from '@/shared/types'

interface ChildOption {
  child: Person
  householdId: string
  pickupCode: string
  alreadyCheckedIn: boolean
}

interface Props {
  parentName: string
  children: ChildOption[]
  onConfirm: (selected: ChildOption[]) => void
  onBack: () => void
  loading?: boolean
}

export default function ChildSelector({ parentName, children, onConfirm, onBack, loading }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(
      // Pre-select children not already checked in
      children.filter(c => !c.alreadyCheckedIn).map(c => c.child.id),
    ),
  )

  function toggle(childId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(childId)) next.delete(childId)
      else next.add(childId)
      return next
    })
  }

  const selectedList = children.filter(c => selected.has(c.child.id))

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-primary-600 to-primary-800 px-8 py-12">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">👨‍👩‍👧‍👦</div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back!</h1>
          <p className="text-gray-500 text-sm mt-1">Hi {parentName}! Select who you're dropping off today.</p>
        </div>

        <div className="space-y-3 mb-6">
          {children.map(option => {
            const isSelected = selected.has(option.child.id)
            const displayName = option.child.preferred_name
              ? `${option.child.preferred_name} ${option.child.last_name}`
              : `${option.child.first_name} ${option.child.last_name}`

            return (
              <button
                key={option.child.id}
                onClick={() => !option.alreadyCheckedIn && toggle(option.child.id)}
                disabled={option.alreadyCheckedIn}
                className={`
                  w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left
                  ${option.alreadyCheckedIn
                    ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                    : isSelected
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }
                `}
              >
                <div
                  className={`
                    w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors
                    ${option.alreadyCheckedIn
                      ? 'border-gray-300 bg-gray-200'
                      : isSelected
                        ? 'border-primary-600 bg-primary-600'
                        : 'border-gray-300'
                    }
                  `}
                >
                  {(isSelected || option.alreadyCheckedIn) && (
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">{displayName}</div>
                  <div className="text-sm text-gray-500">
                    {option.child.grade ?? 'No grade'}
                    {option.alreadyCheckedIn && (
                      <span className="ml-2 text-amber-600 font-medium">Already checked in</span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <button
          onClick={() => onConfirm(selectedList)}
          disabled={selectedList.length === 0 || loading}
          className="w-full py-4 bg-primary-600 text-white rounded-2xl font-bold text-lg disabled:opacity-40 hover:bg-primary-700 transition-colors"
        >
          {loading ? 'Checking in...' : `Check In ${selectedList.length > 0 ? `(${selectedList.length})` : ''}`}
        </button>

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
