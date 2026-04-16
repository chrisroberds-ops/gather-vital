import { useState } from 'react'
import { useLiveCheckins } from './checkin-hooks'
import FlagAlertBanner from './FlagAlertBanner'
import MedicalAlertBanner from './MedicalAlertBanner'
import Badge from '@/shared/components/Badge'
import Spinner from '@/shared/components/Spinner'
import EmptyState from '@/shared/components/EmptyState'
import Button from '@/shared/components/Button'
import Modal from '@/shared/components/Modal'
import { displayName } from '@/shared/utils/format'
import { performDirectorOverride } from './checkin-service'
import { useAppConfig } from '@/services/app-config-context'
import { DEFAULT_KIDS_ROOMS } from '@/shared/types'
import type { CheckinFlag, CheckinSession } from '@/shared/types'
import type { CheckinRow } from './checkin-hooks'
import { useAuth } from '@/auth/AuthContext'

interface Props {
  sessionId: string
  session?: CheckinSession
}

type ViewMode = 'all' | 'byClass'

// ── Late Pickup Detection ─────────────────────────────────────────────────────

function isLatePickup(checkin: CheckinRow['checkin'], session: CheckinSession | undefined, lateMinutes: number): boolean {
  if (checkin.status !== 'checked_in' || !session) return false
  // Parse service_time like "9:00 AM" into a Date object for today
  const match = session.service_time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return false
  let hours = parseInt(match[1], 10)
  const mins = parseInt(match[2], 10)
  const ampm = match[3].toUpperCase()
  if (ampm === 'PM' && hours !== 12) hours += 12
  if (ampm === 'AM' && hours === 12) hours = 0

  const sessionDate = new Date(session.date + 'T00:00:00')
  sessionDate.setHours(hours, mins, 0, 0)
  const endTime = new Date(sessionDate.getTime() + lateMinutes * 60_000)
  return Date.now() > endTime.getTime()
}

// ── Director Override Modal ───────────────────────────────────────────────────

interface OverrideModalProps {
  row: CheckinRow
  rooms: string[]
  staffId: string
  onClose: () => void
  onDone: () => void
}

function DirectorOverrideModal({ row, rooms, staffId, onClose, onDone }: OverrideModalProps) {
  const childName = row.child ? displayName(row.child) : 'this child'
  const [room, setRoom] = useState(row.checkin.override_room ?? '')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!room) { setError('Please select a room.'); return }
    if (!reason.trim()) { setError('A reason is required.'); return }
    setSaving(true)
    try {
      await performDirectorOverride(row.checkin.id, room, reason.trim(), staffId)
      onDone()
      onClose()
    } catch {
      setError('Failed to save override. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Move ${childName}`}>
      <div className="space-y-4 p-1">
        <p className="text-sm text-gray-600">
          Director override: move <strong>{childName}</strong> to a different room. This action is logged.
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">New room</label>
          <select value={room} onChange={e => setRoom(e.target.value)}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">— Select room —</option>
            {rooms.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Reason (required)</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g., Child requested, age reassignment, parent request…"
            rows={3}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void handleSave()} loading={saving}>Save override</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Roster Table ──────────────────────────────────────────────────────────────

interface RosterTableProps {
  rows: CheckinRow[]
  acknowledgedFlags: Set<string>
  acknowledgedHealth: Set<string>
  session: CheckinSession | undefined
  lateMinutes: number
  roomNames: string[]
  staffId: string
  onRefresh: () => void
}

function RosterTable({ rows, acknowledgedFlags, acknowledgedHealth, session, lateMinutes, roomNames, staffId, onRefresh }: RosterTableProps) {
  const [overrideRow, setOverrideRow] = useState<CheckinRow | null>(null)

  if (rows.length === 0) return null

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-gray-500">Child</th>
              <th className="px-5 py-3 text-left font-medium text-gray-500 hidden sm:table-cell">Grade / Room</th>
              <th className="px-5 py-3 text-left font-medium text-gray-500">Code</th>
              <th className="px-5 py-3 text-left font-medium text-gray-500 hidden md:table-cell">Kiosk</th>
              <th className="px-5 py-3 text-left font-medium text-gray-500">Status</th>
              <th className="px-5 py-3 text-left font-medium text-gray-500 hidden lg:table-cell">Time In</th>
              <th className="px-5 py-3 text-left font-medium text-gray-500" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(({ checkin, child, flags }) => {
              const hasUnacknowledgedFlags = flags.some(f => !acknowledgedFlags.has(`${checkin.id}-${f.id}`))
              const hasHealthAlert = (child?.allergies?.trim() || child?.medical_notes?.trim()) && !acknowledgedHealth.has(checkin.id)
              const needsAttention = hasUnacknowledgedFlags || !!hasHealthAlert
              const late = isLatePickup(checkin, session, lateMinutes)
              const room = checkin.override_room ?? child?.grade ?? '—'
              return (
                <tr key={checkin.id} className={`${needsAttention ? 'bg-red-50' : late ? 'bg-amber-50' : ''}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {needsAttention && <span title="Has active flags or health alert" className="text-red-500 text-xs">⚠️</span>}
                      {late && !needsAttention && <span title="Late pickup" className="text-amber-500 text-xs">🕐</span>}
                      <span className="font-medium text-gray-900">
                        {child ? displayName(child) : checkin.child_id.slice(0, 8)}
                      </span>
                    </div>
                    {checkin.override_room && (
                      <div className="text-xs text-primary-600 mt-0.5">Moved → {checkin.override_room}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden sm:table-cell">{room}</td>
                  <td className="px-5 py-3 font-mono font-bold text-gray-900">{checkin.pickup_code}</td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell text-xs">{checkin.kiosk_id}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-col gap-1">
                      <Badge variant={checkin.status === 'checked_in' ? 'success' : 'default'}>
                        {checkin.status === 'checked_in' ? 'In' : 'Out'}
                      </Badge>
                      {late && <Badge variant="warning">Late pickup</Badge>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs hidden lg:table-cell">
                    {new Date(checkin.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-5 py-3">
                    {checkin.status === 'checked_in' && (
                      <button
                        onClick={() => setOverrideRow({ checkin, child, flags })}
                        className="text-xs text-primary-600 hover:text-primary-800 font-medium whitespace-nowrap"
                      >
                        Move room
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {overrideRow && (
        <DirectorOverrideModal
          row={overrideRow}
          rooms={roomNames}
          staffId={staffId}
          onClose={() => setOverrideRow(null)}
          onDone={onRefresh}
        />
      )}
    </>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CheckinRoster({ sessionId, session }: Props) {
  const { rows, loading, refresh } = useLiveCheckins(sessionId)
  const { config } = useAppConfig()
  const { user } = useAuth()
  const [acknowledgedFlags, setAcknowledgedFlags] = useState<Set<string>>(new Set())
  const [acknowledgedHealth, setAcknowledgedHealth] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>('all')

  const lateMinutes = config.late_pickup_minutes ?? 30
  const roomNames = (config.kids_rooms ?? DEFAULT_KIDS_ROOMS).map(r => r.name)
  const staffId = user?.personId ?? 'system'

  const flaggedRows = rows.filter(
    r =>
      r.checkin.status === 'checked_in' &&
      r.flags.length > 0 &&
      r.flags.some(f => !acknowledgedFlags.has(`${r.checkin.id}-${f.id}`)),
  )

  const healthAlertRows = rows.filter(
    r =>
      r.checkin.status === 'checked_in' &&
      (r.child?.allergies?.trim() || r.child?.medical_notes?.trim()) &&
      !acknowledgedHealth.has(r.checkin.id),
  )

  function acknowledgeFlags(checkinId: string, flags: CheckinFlag[]) {
    setAcknowledgedFlags(prev => {
      const next = new Set(prev)
      flags.forEach(f => next.add(`${checkinId}-${f.id}`))
      return next
    })
  }

  function acknowledgeHealth(checkinId: string) {
    setAcknowledgedHealth(prev => new Set(prev).add(checkinId))
  }

  const checkedIn = rows.filter(r => r.checkin.status === 'checked_in')
  const checkedOut = rows.filter(r => r.checkin.status === 'checked_out')

  if (loading) {
    return <div className="flex justify-center py-8"><Spinner /></div>
  }

  const tableProps = {
    acknowledgedFlags, acknowledgedHealth, session, lateMinutes, roomNames, staffId,
    onRefresh: refresh,
  }

  // Group by room/grade for "By Class" view
  function renderByClass() {
    const groups = new Map<string, CheckinRow[]>()
    for (const row of checkedIn) {
      const label = row.checkin.override_room ?? row.child?.grade ?? 'Unassigned'
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label)!.push(row)
    }
    // Sort group names using roomNames order, then alpha
    const sorted = [...groups.entries()].sort(([a], [b]) => {
      const ai = roomNames.indexOf(a)
      const bi = roomNames.indexOf(b)
      if (ai >= 0 && bi >= 0) return ai - bi
      if (ai >= 0) return -1
      if (bi >= 0) return 1
      return a.localeCompare(b)
    })
    if (sorted.length === 0) {
      return <EmptyState title="No check-ins yet" description="Kids will appear here as they check in at the kiosks." />
    }
    return (
      <div className="space-y-4">
        {sorted.map(([label, groupRows]) => (
          <ClassGroup key={label} label={label} rows={groupRows} tableProps={tableProps} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Health alerts */}
      {healthAlertRows.length > 0 && (
        <div className="space-y-3">
          {healthAlertRows.map(r => (
            <MedicalAlertBanner
              key={`health-${r.checkin.id}`}
              childName={r.child ? displayName(r.child) : 'Unknown'}
              allergies={r.child?.allergies}
              medicalNotes={r.child?.medical_notes}
              onAcknowledge={() => acknowledgeHealth(r.checkin.id)}
            />
          ))}
        </div>
      )}

      {/* Flag alerts */}
      {flaggedRows.length > 0 && (
        <div className="space-y-3">
          {flaggedRows.map(r => (
            <FlagAlertBanner
              key={r.checkin.id}
              childName={r.child ? displayName(r.child) : 'Unknown'}
              flags={r.flags}
              onAcknowledge={() => acknowledgeFlags(r.checkin.id, r.flags)}
            />
          ))}
        </div>
      )}

      {/* Stats + view toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid grid-cols-3 gap-3 flex-1">
          {[
            { label: 'Checked In', value: checkedIn.length, color: 'text-green-700' },
            { label: 'Checked Out', value: checkedOut.length, color: 'text-gray-600' },
            { label: 'Total', value: rows.length, color: 'text-primary-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          ))}
        </div>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs self-start">
          {(['all', 'byClass'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              className={`px-4 py-2 font-medium ${viewMode === v ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {v === 'all' ? 'All Kids' : 'By Class'}
            </button>
          ))}
        </div>
      </div>

      {/* Roster */}
      {rows.length === 0 ? (
        <EmptyState title="No check-ins yet" description="Kids will appear here as they check in at the kiosks." />
      ) : viewMode === 'all' ? (
        <RosterTable rows={rows} {...tableProps} />
      ) : (
        renderByClass()
      )}
    </div>
  )
}

// ── Class Group (collapsible) ─────────────────────────────────────────────────

function ClassGroup({ label, rows, tableProps }: {
  label: string
  rows: CheckinRow[]
  tableProps: Omit<RosterTableProps, 'rows'>
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 text-left hover:bg-gray-100 transition-colors"
      >
        <span className="font-semibold text-gray-800">{label}</span>
        <span className="text-xs text-gray-500 flex items-center gap-2">
          {rows.length} {rows.length === 1 ? 'child' : 'children'}
          <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </span>
      </button>
      {open && <RosterTable rows={rows} {...tableProps} />}
    </div>
  )
}
