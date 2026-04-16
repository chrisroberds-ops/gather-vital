import { useState } from 'react'

interface Props {
  onSetup: (kioskId: string) => void
}

const PRESET_KIOSK_IDS = ['kiosk-1', 'kiosk-2', 'kiosk-3', 'kiosk-4']

export default function KioskSetup({ onSetup }: Props) {
  const [custom, setCustom] = useState('')

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-8">
      <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full text-center">
        <div className="text-5xl mb-4">📍</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Kiosk Setup</h1>
        <p className="text-gray-500 text-sm mb-8">
          Assign this kiosk an ID. This is stored locally and determines which printer receives labels.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {PRESET_KIOSK_IDS.map(id => (
            <button
              key={id}
              onClick={() => onSetup(id)}
              className="py-4 px-6 rounded-2xl border-2 border-gray-200 text-gray-700 font-semibold hover:border-primary-500 hover:bg-primary-50 transition-colors"
            >
              {id}
            </button>
          ))}
        </div>

        <div className="text-gray-400 text-sm mb-4">or enter a custom ID</div>

        <div className="flex gap-2">
          <input
            type="text"
            value={custom}
            onChange={e => setCustom(e.target.value)}
            placeholder="e.g. lobby-left"
            className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) onSetup(custom.trim()) }}
          />
          <button
            onClick={() => { if (custom.trim()) onSetup(custom.trim()) }}
            disabled={!custom.trim()}
            className="px-5 py-3 bg-primary-600 text-white rounded-xl font-semibold disabled:opacity-40 hover:bg-primary-700 transition-colors"
          >
            Set
          </button>
        </div>
      </div>
    </div>
  )
}
