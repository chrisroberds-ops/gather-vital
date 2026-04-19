import { useState, useEffect } from 'react'
import TeamsManager from './TeamsManager'
import ScheduleView from './ScheduleView'
import ScheduleGenerator from './ScheduleGenerator'
import Modal from '@/shared/components/Modal'
import Button from '@/shared/components/Button'
import Badge from '@/shared/components/Badge'
import { db } from '@/services'
import { displayName } from '@/features/people/people-service'
import { useNavigate, Link } from 'react-router-dom'
import type { Person } from '@/shared/types'

type Tab = 'teams' | 'schedule' | 'background'

// ── Background Checks Tab ────────────────────────────────────────────────────

function BackgroundChecksTab() {
  const navigate = useNavigate()
  const [volunteers, setVolunteers] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    db.getPeople().then(people => {
      const today = new Date()
      const soon = new Date(today)
      soon.setDate(soon.getDate() + 30)
      const soonStr = soon.toISOString().split('T')[0]
      const todayStr = today.toISOString().split('T')[0]

      // Show non-child people whose check is missing or expiring within 30 days
      const atRisk = people.filter(p => {
        if (p.is_child || !p.is_active) return false
        if (!p.background_check_expiry) return true // never recorded
        return p.background_check_expiry <= soonStr // expired or expiring soon
      })
      // Sort: expired first, then by expiry date
      atRisk.sort((a, b) => {
        const ae = a.background_check_expiry ?? ''
        const be = b.background_check_expiry ?? ''
        if (!ae && !be) return 0
        if (!ae) return -1
        if (!be) return 1
        return ae < be ? -1 : 1
      })
      setVolunteers(atRisk)
      setLoading(false)
    })
  }, [])

  const today = new Date().toISOString().split('T')[0]

  if (loading) return <p className="text-sm text-gray-500 py-4">Loading…</p>

  if (volunteers.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-2xl mb-2">✅</p>
        <p className="font-medium text-gray-700">All background checks are current</p>
        <p className="text-sm mt-1">No checks expiring within the next 30 days.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Expired or expiring within 30 days</h3>
        <Badge variant="warning">{volunteers.length} need attention</Badge>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left">
            <th className="px-4 py-2 font-medium text-gray-500">Name</th>
            <th className="px-4 py-2 font-medium text-gray-500">Expiry</th>
            <th className="px-4 py-2 font-medium text-gray-500">Status</th>
          </tr>
        </thead>
        <tbody>
          {volunteers.map(v => {
            const expired = v.background_check_expiry && v.background_check_expiry < today
            return (
              <tr key={v.id}
                className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/admin/people/${v.id}/edit`)}>
                <td className="px-4 py-3 font-medium text-gray-900">{displayName(v)}</td>
                <td className="px-4 py-3 text-gray-600">
                  {v.background_check_expiry ?? <span className="text-gray-400 italic">Never recorded</span>}
                </td>
                <td className="px-4 py-3">
                  {!v.background_check_expiry
                    ? <Badge variant="default">Missing</Badge>
                    : expired
                    ? <Badge variant="danger">Expired</Badge>
                    : <Badge variant="warning">Expiring soon</Badge>
                  }
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function VolunteerDashboard() {
  const [tab, setTab] = useState<Tab>('schedule')
  const [showGenerator, setShowGenerator] = useState(false)
  const [scheduleKey, setScheduleKey] = useState(0)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'schedule',   label: 'Schedule' },
    { id: 'teams',      label: 'Teams' },
    { id: 'background', label: 'Background Checks' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-2 font-medium ${tab === t.id ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'schedule' && (
          <div className="flex items-center gap-2">
            <Link
              to="/admin/volunteers/runsheet"
              className="text-sm px-4 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
            >
              Run sheet
            </Link>
            <Button onClick={() => setShowGenerator(true)}>Generate schedule</Button>
          </div>
        )}
      </div>

      {tab === 'schedule'   && <ScheduleView key={scheduleKey} showAttendance />}
      {tab === 'teams'      && <TeamsManager />}
      {tab === 'background' && <BackgroundChecksTab />}

      <Modal isOpen={showGenerator} onClose={() => setShowGenerator(false)} title="Generate Schedule">
        <ScheduleGenerator onDone={() => {
          setShowGenerator(false)
          setScheduleKey(k => k + 1)
        }} />
      </Modal>
    </div>
  )
}
