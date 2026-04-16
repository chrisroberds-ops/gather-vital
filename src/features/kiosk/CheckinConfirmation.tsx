import { useEffect, useState } from 'react'

interface CheckedInChild {
  name: string
  pickupCode: string
}

interface Props {
  children: CheckedInChild[]
  onReset: () => void
}

const AUTO_RESET_SECONDS = 10

export default function CheckinConfirmation({ children, onReset }: Props) {
  const [seconds, setSeconds] = useState(AUTO_RESET_SECONDS)

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) {
          clearInterval(interval)
          onReset()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [onReset])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-green-500 to-green-700 px-8 py-12">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm text-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">You're all set!</h1>
        <p className="text-gray-500 text-sm mb-8">
          Labels are printing. Keep your pickup code{children.length > 1 ? 's' : ''} handy for pickup.
        </p>

        <div className="space-y-3 mb-8">
          {children.map(child => (
            <div
              key={child.pickupCode}
              className="flex items-center justify-between bg-gray-50 rounded-2xl px-5 py-4"
            >
              <span className="font-medium text-gray-900">{child.name}</span>
              <div className="text-right">
                <div className="text-xs text-gray-500">Pickup code</div>
                <div className="text-2xl font-bold text-primary-600 font-mono tracking-widest">
                  {child.pickupCode}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-sm text-gray-400">
          Screen resets in <span className="font-semibold text-gray-600">{seconds}s</span>
        </div>

        <button
          onClick={onReset}
          className="mt-4 w-full py-3 border border-gray-200 rounded-2xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  )
}
