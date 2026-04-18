import { useState, useEffect, useCallback } from 'react'
import {
  getEnrichedSchedule,
  updateScheduleStatus,
  deleteScheduleEntry,
  markServed,
  type EnrichedScheduleEntry,
} from './volunteer-service'
import { displayName, formatDate } from '@/shared/utils/format'
import Badge from '@/shared/components/Badge'
import Button from '@/shared/components/Button'
import EmptyState from '@/shared/components/EmptyState'
import Spinner from '@/shared/components/Spinner'
import type { VolunteerScheduleStatus } from '@/shared/types'

interface Props {
  teamId?: string
  personId?: string
  /** If true, shows confirm/decline controls inline (member self-service view) */
  selfService?: boolean
  /**
   * If true, shows the attendance (served) column so coordinators can mark
   * attendance after each service. Staff/Executive only — not shown in self-service mode.
   */
  showAttendance?: boolean
}

const STATUS_VARIANT: Record<VolunteerScheduleStatus, 'success' | 'warning' | 'danger' | 'default'> = {
  confirmed: 'success',
  pending: 'warning',
  declined: 'danger',
  cancelled: 'default',
}

// ── Attendance cell ───────────────────────────────────────────────────────────

function AttendanceCell({
  entry,
  busy,
  onMark,
}: {
  entry: EnrichedScheduleEntry['entry']
  busy: boolean
  onMark: (id: string, served: boolean | null) => void
}) {
  if (busy) return <Spinner size="sm" />

  // Already marked — show status + undo
  if (entry.served === true) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
          ✓ Served
        </span>
        <button
          onClick={() => onMark(entry.id, null)}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          undo
        </button>
      </div>
    )
  }

  if (entry.served === false) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
          ✗ No-show
        </span>
        <button
          onClick={() => onMark(entry.id, null)}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          undo
        </button>
      </div>
    )
  }

  // Not yet marked
  return (
    <div className="flex items-center gap-1">
      <span className="text-gray-300 mr-1">—</span>
      <button
        onClick={() => onMark(entry.id, true)}
        title="Mark as served"
        className="w-6 h-6 rounded-full bg-green-50 hover:bg-green-100 text-green-600 flex items-center justify-center text-sm transition-colors"
      >
        ✓
      </button>
      <button
        onClick={() => onMark(entry.id, false)}
        title="Mark as no-show"
        className="w-6 h-6 rounded-full bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex items-center justify-center text-sm transition-colors"
      >
        ✗
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ScheduleView({ teamId, personId, selfService = false, showAttendance = false }: Props) {
  const [rows, setRows] = useState<EnrichedScheduleEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'upcoming' | 'all'>('upcoming')
  const [updating, setUpdating] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const data = await getEnrichedSchedule(teamId, personId)
    setRows(data.sort((a, b) => a.entry.scheduled_date.localeCompare(b.entry.scheduled_date)))
    setLoading(false)
  }, [teamId, personId])

  useEffect(() => { setLoading(true); void reload() }, [reload])

  const today = new Date().toISOString().split('T')[0]
  const displayed = filter === 'upcoming'
    ? rows.filter(r => r.entry.scheduled_date >= today)
    : rows

  // Group by date
  const byDate = new Map<string, EnrichedScheduleEntry[]>()
  for (const row of displayed) {
    const d = row.entry.scheduled_date
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)!.push(row)
  }

  async function handleStatus(entryId: string, status: VolunteerScheduleStatus) {
    setUpdating(entryId)
    await updateScheduleStatus(entryId, status)
    await reload()
    setUpdating(null)
  }

  async function handleDelete(entryId: string) {
    setUpdating(entryId)
    await deleteScheduleEntry(entryId)
    await reload()
    setUpdating(null)
  }

  async function handleMark(entryId: string, served: boolean | null) {
    setUpdating(entryId)
    await markServed(entryId, served)
    await reload()
    setUpdating(null)
  }

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>

  // Whether to show the attendance column in coordinator view
  const showAttendanceCol = showAttendance && !selfService

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
          {(['upcoming', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 font-medium ${filter === f ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {f === 'upcoming' ? 'Upcoming' : 'All'}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-400">{displayed.length} entries</span>
      </div>

      {byDate.size === 0 ? (
        <EmptyState
          title="No schedule entries"
          description={filter === 'upcoming' ? 'No upcoming assignments. Switch to "All" to see past entries.' : 'No entries yet. Use "Generate schedule" to create them.'}
        />
      ) : (
        <div className="space-y-4">
          {[...byDate.entries()].map(([date, entries]) => {
            // Attendance summary for this date (coordinator view only)
            const markedCount = entries.filter(e => e.entry.served === true).length
            const totalCount = entries.length

            return (
              <div key={date}>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {formatDate(date)}
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-50">
                      {entries.map(({ entry, person, team }) => (
                        <tr key={entry.id}>
                          <td className="px-5 py-3">
                            <div className="font-medium text-gray-900">
                              {person ? displayName(person) : '—'}
                            </div>
                            {!teamId && team && (
                              <div className="text-xs text-gray-400">{team.name}</div>
                            )}
                          </td>
                          <td className="px-5 py-3 text-gray-600 hidden sm:table-cell">
                            {entry.position}
                          </td>
                          <td className="px-5 py-3">
                            <Badge variant={STATUS_VARIANT[entry.status]}>{entry.status}</Badge>
                          </td>
                          {showAttendanceCol && (
                            <td className="px-5 py-3">
                              <AttendanceCell
                                entry={entry}
                                busy={updating === entry.id}
                                onMark={handleMark}
                              />
                            </td>
                          )}
                          <td className="px-5 py-3 text-right">
                            {updating === entry.id && !showAttendanceCol ? (
                              <Spinner size="sm" />
                            ) : selfService ? (
                              <div className="flex gap-2 justify-end">
                                {entry.status !== 'confirmed' && (
                                  <button
                                    onClick={() => void handleStatus(entry.id, 'confirmed')}
                                    className="text-xs text-green-600 hover:text-green-800 font-medium"
                                  >
                                    Confirm
                                  </button>
                                )}
                                {entry.status !== 'declined' && (
                                  <button
                                    onClick={() => void handleStatus(entry.id, 'declined')}
                                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                                  >
                                    Decline
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="flex gap-2 justify-end">
                                {entry.status === 'pending' && (
                                  <button
                                    onClick={() => void handleStatus(entry.id, 'confirmed')}
                                    className="text-xs text-green-600 hover:text-green-800 font-medium"
                                  >
                                    Confirm
                                  </button>
                                )}
                                <button
                                  onClick={() => void handleDelete(entry.id)}
                                  className="text-xs text-red-400 hover:text-red-600"
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Attendance summary line */}
                  {showAttendanceCol && (
                    <div className="px-5 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-500 flex items-center gap-1">
                      <span className="font-medium text-gray-700">{markedCount} of {totalCount}</span>
                      {' '}confirmed as served
                      {markedCount < totalCount && (
                        <span className="ml-1 text-amber-600">· {totalCount - markedCount} not yet marked</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
