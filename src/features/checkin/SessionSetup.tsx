import { useState } from 'react'
import { openSession, closeSession } from './checkin-service'
import type { CheckinSession } from '@/shared/types'
import Spinner from '@/shared/components/Spinner'

interface Props {
  session: CheckinSession | null
  onSessionChange: () => void
  staffPersonId: string
}

const SERVICE_TIMES = ['8:00 AM', '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM']

export default function SessionSetup({ session, onSessionChange, staffPersonId }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [serviceTime, setServiceTime] = useState('10:30 AM')
  const [loading, setLoading] = useState(false)

  async function handleOpen() {
    setLoading(true)
    try {
      const d = new Date(date + 'T12:00:00')
      const formatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      await openSession(`${formatted} · ${serviceTime}`, date, serviceTime, staffPersonId)
      onSessionChange()
    } finally {
      setLoading(false)
    }
  }

  async function handleClose() {
    if (!session) return
    setLoading(true)
    try {
      await closeSession(session.id)
      onSessionChange()
    } finally {
      setLoading(false)
    }
  }

  if (session) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="font-semibold text-green-800">Session Open</span>
          </div>
          <div className="text-sm text-green-700 mt-0.5">{session.name}</div>
        </div>
        <button
          onClick={handleClose}
          disabled={loading}
          className="px-4 py-2 bg-white border border-red-300 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 disabled:opacity-40 transition-colors"
        >
          {loading ? <Spinner size="sm" /> : 'Close Session'}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
      <h3 className="font-semibold text-gray-800 mb-4">Open a Check-In Session</h3>
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Service time</label>
          <select
            value={serviceTime}
            onChange={e => setServiceTime(e.target.value)}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {SERVICE_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <button
          onClick={handleOpen}
          disabled={loading}
          className="px-5 py-2 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-40 transition-colors"
        >
          {loading ? <Spinner size="sm" /> : 'Open Session'}
        </button>
      </div>
    </div>
  )
}
