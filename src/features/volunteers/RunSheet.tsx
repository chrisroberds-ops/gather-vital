import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { db } from '@/services'
import { useAppConfig } from '@/services/app-config-context'
import {
  getEnrichedSchedule,
  markServed,
  type EnrichedScheduleEntry,
} from './volunteer-service'
import {
  groupEntriesByTeam,
  filterByServiceTime,
  nextServiceDate,
  isKidsTeam,
  type RunSheetTeamGroup,
  type RunSheetEntry,
} from './runsheet-service'
import { displayName } from '@/shared/utils/format'
import { formatPhone } from '@/shared/utils/format'
import Spinner from '@/shared/components/Spinner'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmed',
  pending:   '',
  declined:  'Declined',
  cancelled: 'Cancelled',
}

function serviceTimeLabel(id: string | null, serviceTimes: import('@/shared/types').ServiceTime[]): string {
  if (!id) return 'All services'
  const st = serviceTimes.find(s => s.id === id)
  if (!st) return 'All services'
  return st.label ?? `${st.day} ${st.time}`
}

// ── Volunteer row (screen) ────────────────────────────────────────────────────

function VolunteerRow({
  entry,
  checkedIn,
  onToggle,
  isKids,
}: {
  entry: RunSheetEntry
  checkedIn: boolean
  onToggle: (id: string, checked: boolean) => void
  isKids: boolean
}) {
  const { schedule, person, isFirstTime, isTeamLead } = entry
  const declined = schedule.status === 'declined'
  const cancelled = schedule.status === 'cancelled'
  const muted = declined || cancelled

  return (
    <tr className={`border-b border-gray-100 last:border-0 ${muted ? 'opacity-50' : ''}`}>
      {/* Checkbox — on-screen only */}
      <td className="pl-4 pr-2 py-2.5 print:hidden w-8">
        {!declined && !cancelled && (
          <input
            type="checkbox"
            checked={checkedIn}
            onChange={e => onToggle(schedule.id, e.target.checked)}
            className="w-4 h-4 rounded accent-primary-600 cursor-pointer"
          />
        )}
      </td>
      {/* Print checkbox — print only, empty square */}
      <td className="pl-4 pr-2 py-2.5 hidden print:table-cell w-8 print:align-middle">
        <div className="w-4 h-4 border-2 border-gray-400 rounded-sm inline-block" />
      </td>

      {/* Name + badges */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isTeamLead && (
            <span className="text-amber-500" title="Team lead">★</span>
          )}
          <span className={`text-sm font-medium ${muted ? 'text-gray-400' : 'text-gray-900'}`}>
            {person ? displayName(person) : schedule.person_id}
          </span>
          {schedule.status === 'confirmed' && !declined && (
            <span className="text-green-600 text-xs" title="Confirmed via email">✓</span>
          )}
          {isFirstTime && !muted && (
            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full leading-tight">
              NEW
            </span>
          )}
          {declined && (
            <span className="text-[10px] font-medium bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full leading-tight">
              Declined
            </span>
          )}
        </div>
      </td>

      {/* Role / position */}
      <td className="px-3 py-2.5 text-sm text-gray-600">
        {isKids && schedule.position.includes('—')
          ? schedule.position   // already formatted as "Room — Role"
          : schedule.position}
      </td>

      {/* Phone */}
      <td className="px-3 py-2.5 text-sm text-gray-500 tabular-nums">
        {person?.phone ? formatPhone(person.phone) : '—'}
      </td>
    </tr>
  )
}

// ── Team section ──────────────────────────────────────────────────────────────

function TeamSection({
  group,
  checkedIn,
  onToggle,
}: {
  group: RunSheetTeamGroup
  checkedIn: Set<string>
  onToggle: (id: string, checked: boolean) => void
}) {
  const { team, entries, confirmedCount, totalCount } = group
  const kids = isKidsTeam(team)
  const active = entries.filter(e => e.schedule.status !== 'cancelled')
  const checkedCount = active.filter(e => checkedIn.has(e.schedule.id)).length

  return (
    <div className="mb-6 print:break-inside-avoid">
      {/* Team header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border border-gray-200 rounded-t-xl print:rounded-none print:bg-white print:border-b-2 print:border-gray-300">
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
          {team.name}
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 print:hidden">
            <span className="font-semibold text-gray-800">{checkedCount}</span> checked in
          </span>
          <span className="text-xs text-gray-500">
            <span className="font-semibold text-gray-800">{confirmedCount} of {totalCount}</span> confirmed
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="border border-t-0 border-gray-200 rounded-b-xl overflow-hidden print:border print:rounded-none">
        <table className="w-full">
          <thead className="hidden print:table-header-group bg-gray-50">
            <tr>
              <th className="pl-4 pr-2 py-1.5 text-left text-[10px] text-gray-400 font-medium w-8" />
              <th className="px-3 py-1.5 text-left text-[10px] text-gray-400 font-medium">Name</th>
              <th className="px-3 py-1.5 text-left text-[10px] text-gray-400 font-medium">
                {kids ? 'Room / Role' : 'Role'}
              </th>
              <th className="px-3 py-1.5 text-left text-[10px] text-gray-400 font-medium">Phone</th>
            </tr>
          </thead>
          <tbody>
            {active.map(entry => (
              <VolunteerRow
                key={entry.schedule.id}
                entry={entry}
                checkedIn={checkedIn.has(entry.schedule.id)}
                onToggle={onToggle}
                isKids={kids}
              />
            ))}
            {active.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-sm text-gray-400 text-center">
                  No volunteers scheduled.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RunSheet() {
  const { config } = useAppConfig()
  const [searchParams] = useSearchParams()

  const serviceTimes = config.service_times ?? []
  const defaultDate = searchParams.get('date') ?? nextServiceDate(serviceTimes)

  const [selectedDate,      setSelectedDate]      = useState(defaultDate)
  const [serviceTimeFilter, setServiceTimeFilter] = useState<string | null>(null)
  const [groups,            setGroups]            = useState<RunSheetTeamGroup[]>([])
  const [loading,           setLoading]           = useState(true)
  const [checkedIn,         setCheckedIn]         = useState<Set<string>>(new Set())
  const [resetting,         setResetting]         = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setCheckedIn(new Set())

    const [enriched, allEntries, teams] = await Promise.all([
      getEnrichedSchedule(),
      db.getVolunteerSchedule(),
      db.getTeams(),
    ])

    // Filter to selected date
    const forDate = enriched.filter(e => e.entry.scheduled_date === selectedDate)

    // Apply service time filter
    const filtered = filterByServiceTime(forDate, serviceTimeFilter)

    // Load team members for all relevant teams
    const teamIds = [...new Set(filtered.map(e => e.entry.team_id))]
    const membersList = await Promise.all(teamIds.map(id => db.getTeamMembers(id)))
    const teamMembersMap = new Map(teamIds.map((id, i) => [id, membersList[i]]))

    const grouped = groupEntriesByTeam(filtered, teams, teamMembersMap, allEntries)

    // Restore checked-in state from served field
    const alreadyServed = new Set(
      filtered
        .filter(e => e.entry.served === true)
        .map(e => e.entry.id),
    )

    setGroups(grouped)
    setCheckedIn(alreadyServed)
    setLoading(false)
  }, [selectedDate, serviceTimeFilter])

  useEffect(() => { void load() }, [load])

  async function handleToggle(id: string, checked: boolean) {
    setCheckedIn(prev => {
      const next = new Set(prev)
      checked ? next.add(id) : next.delete(id)
      return next
    })
    await markServed(id, checked ? true : null)
  }

  async function handleResetAll() {
    setResetting(true)
    const allIds = groups.flatMap(g =>
      g.entries
        .filter(e => e.schedule.status !== 'cancelled' && e.schedule.status !== 'declined')
        .map(e => e.schedule.id),
    )
    await Promise.all(allIds.map(id => markServed(id, null)))
    setCheckedIn(new Set())
    setResetting(false)
  }

  const totalActive = groups.flatMap(g =>
    g.entries.filter(e => e.schedule.status !== 'cancelled' && e.schedule.status !== 'declined'),
  ).length
  const totalCheckedIn = groups.flatMap(g =>
    g.entries.filter(
      e =>
        e.schedule.status !== 'cancelled' &&
        e.schedule.status !== 'declined' &&
        checkedIn.has(e.schedule.id),
    ),
  ).length

  const stLabel = serviceTimeLabel(serviceTimeFilter, serviceTimes)

  return (
    <div className="p-6 max-w-4xl print:p-0 print:max-w-none">
      {/* Print header */}
      <div className="hidden print:block mb-4">
        <div className="flex items-start justify-between border-b-2 border-gray-300 pb-3 mb-4">
          <div>
            {config.logo_url && (
              <img src={config.logo_url} alt={config.church_name} className="h-8 mb-1" />
            )}
            <h1 className="text-lg font-bold">{config.church_name}</h1>
            <p className="text-sm text-gray-600">Volunteer Run Sheet — {selectedDate}</p>
            {serviceTimeFilter && <p className="text-sm text-gray-600">{stLabel}</p>}
          </div>
        </div>
      </div>

      {/* Screen header */}
      <div className="print:hidden mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Volunteer Run Sheet</h1>
        <p className="text-sm text-gray-500 mt-0.5">{config.church_name}</p>
      </div>

      {/* Controls */}
      <div className="print:hidden flex flex-wrap items-end gap-4 mb-5">
        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium">Service Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {serviceTimes.length > 1 && (
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">Service Time</label>
            <select
              value={serviceTimeFilter ?? ''}
              onChange={e => setServiceTimeFilter(e.target.value || null)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All services</option>
              {serviceTimes.map(st => (
                <option key={st.id} value={st.id}>
                  {st.label ?? `${st.day} ${st.time}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex-1" />

        <button
          onClick={() => window.print()}
          className="text-sm px-4 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
        >
          Print / PDF
        </button>
      </div>

      {/* Live check-in summary + reset */}
      {!loading && groups.length > 0 && (
        <div className="print:hidden flex items-center justify-between bg-primary-50 border border-primary-200 rounded-xl px-4 py-2.5 mb-5">
          <span className="text-sm font-semibold text-primary-800">
            {totalCheckedIn} of {totalActive} checked in
          </span>
          {totalCheckedIn > 0 && (
            <button
              onClick={() => void handleResetAll()}
              disabled={resetting}
              className="text-xs text-primary-600 hover:underline disabled:opacity-50"
            >
              {resetting ? 'Resetting…' : 'Reset all'}
            </button>
          )}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      )}

      {!loading && groups.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-1">No volunteers scheduled for {selectedDate}</p>
          <p className="text-sm">
            {serviceTimeFilter
              ? 'Try switching to "All services" or a different date.'
              : 'Schedule volunteers from the Volunteers tab.'}
          </p>
        </div>
      )}

      {!loading && groups.length > 0 && (
        <div>
          {groups.map(group => (
            <TeamSection
              key={group.team.id}
              group={group}
              checkedIn={checkedIn}
              onToggle={(id, checked) => void handleToggle(id, checked)}
            />
          ))}
        </div>
      )}

      {/* Legend — screen only */}
      {!loading && groups.length > 0 && (
        <div className="print:hidden mt-6 flex flex-wrap gap-4 text-xs text-gray-500 border-t border-gray-100 pt-4">
          <span><span className="text-amber-500">★</span> Team lead</span>
          <span><span className="text-green-600 font-medium">✓</span> Confirmed via email</span>
          <span>
            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">NEW</span>
            {' '}First time in this role
          </span>
          <span><span className="opacity-50">Name</span> — Declined / not coming</span>
        </div>
      )}
    </div>
  )
}
