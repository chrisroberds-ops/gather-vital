import { useState } from 'react'
import { useAppConfig } from '@/services/app-config-context'

interface Props {
  onSubmit: (phone: string) => void
  onNewFamily: () => void
  loading?: boolean
  error?: string | null
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

function formatDisplay(digits: string): string {
  // Format as (XXX) XXX-XXXX as user types
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export default function PhoneEntry({ onSubmit, onNewFamily, loading, error }: Props) {
  const { config } = useAppConfig()
  const [digits, setDigits] = useState('')

  function handleKey(key: string) {
    if (key === '⌫') {
      setDigits(d => d.slice(0, -1))
    } else if (digits.length < 10) {
      const next = digits + key
      setDigits(next)
      if (next.length === 10) {
        onSubmit('+1' + next)
      }
    }
  }

  function handleClear() {
    setDigits('')
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-primary-600 to-primary-800 px-8 py-12">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          {config.logo_url
            ? <img src={config.logo_url} alt={config.church_name || 'Church'} className="h-14 mx-auto mb-3 object-contain" />
            : <div className="text-4xl mb-3">👋</div>
          }
          <h1 className="text-2xl font-bold text-gray-900">
            {config.church_name || 'Welcome!'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">Enter your phone number to check in your kids</p>
        </div>

        {/* Display */}
        <div
          className={`text-center text-3xl font-mono font-semibold tracking-widest mb-2 h-10 ${
            digits.length === 0 ? 'text-gray-300' : 'text-gray-900'
          }`}
        >
          {digits.length === 0 ? '(___) ___-____' : formatDisplay(digits)}
        </div>

        {error && (
          <div className="text-center text-sm text-red-600 mb-4 bg-red-50 rounded-xl py-2 px-3">
            {error}
          </div>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          {KEYS.map((key, idx) => (
            key === '' ? (
              <div key={idx} />
            ) : (
              <button
                key={idx}
                onClick={() => handleKey(key)}
                disabled={loading || (key !== '⌫' && digits.length >= 10)}
                className={`
                  h-16 rounded-2xl text-xl font-semibold transition-all active:scale-95
                  ${key === '⌫'
                    ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    : 'bg-gray-50 text-gray-900 hover:bg-primary-50 hover:text-primary-700 border border-gray-200'
                  }
                  disabled:opacity-40
                `}
              >
                {loading && digits.length === 10 && key === '⌫' ? '...' : key}
              </button>
            )
          ))}
        </div>

        {digits.length > 0 && (
          <button
            onClick={handleClear}
            className="w-full mt-3 py-3 text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        )}

        <div className="mt-6 pt-6 border-t border-gray-100 text-center">
          <p className="text-sm text-gray-400 mb-2">First time here?</p>
          <button
            onClick={onNewFamily}
            className="text-primary-600 font-medium text-sm hover:underline"
          >
            New here? Let's get you set up!
          </button>
        </div>
      </div>
    </div>
  )
}
