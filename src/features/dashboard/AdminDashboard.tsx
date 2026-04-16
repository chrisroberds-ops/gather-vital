import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '@/services'
import { getVisitorStats } from '@/features/visitors/visitor-service'
import { useAuth } from '@/auth/AuthContext'
import { useAppConfig } from '@/services/app-config-context'
import { AccessTier, DEFAULT_MODULES } from '@/shared/types'
import Spinner from '@/shared/components/Spinner'

// ── Shared widget shell ───────────────────────────────────────────────────────

function Widget({
  title,
  href,
  children,
  loading = false,
}: {
  title: string
  href: string
  children: React.ReactNode
  loading?: boolean
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <Link to={href} className="text-xs text-primary-600 hover:underline font-medium">
          View all →
        </Link>
      </div>
      <div className="px-4 pb-4 flex-1">
        {loading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : children}
      </div>
    </div>
  )
}

function Stat({ value, label, accent = false }: { value: string | number; label: string; accent?: boolean }) {
  return (
    <div>
      <div className={`text-3xl font-bold ${accent ? 'text-primary-600' : 'text-gray-900'}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

// ── Attendance Widget ─────────────────────────────────────────────────────────

function AttendanceWidget() {
  const [data, setData] = useState<{ total: number; active: number } | null>(null)

  useEffect(() => {
    db.getPeople().then(people => {
      setData({
        total: people.length,
        active: people.filter(p => p.is_active && !p.is_child).length,
      })
    })
  }, [])

  return (
    <Widget title="Attendance" href="/admin/people" loading={data === null}>
      {data && (
        <div className="flex gap-6 pt-1">
          <Stat value={data.active} label="Active adults" accent />
          <Stat value={data.total} label="Total records" />
        </div>
      )}
    </Widget>
  )
}

// ── Volunteers Widget ─────────────────────────────────────────────────────────

function VolunteersWidget() {
  const [data, setData] = useState<{ upcoming: number; pending: number } | null>(null)

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    db.getVolunteerSchedule().then(schedules => {
      setData({
        upcoming: schedules.filter(s => s.scheduled_date >= today && s.status !== 'cancelled').length,
        pending: schedules.filter(s => s.scheduled_date >= today && s.status === 'pending').length,
      })
    })
  }, [])

  return (
    <Widget title="Volunteers" href="/admin/volunteers" loading={data === null}>
      {data && (
        <div className="flex gap-6 pt-1">
          <Stat value={data.upcoming} label="Upcoming slots" accent />
          <Stat value={data.pending} label="Awaiting confirmation" />
        </div>
      )}
    </Widget>
  )
}

// ── Groups Widget ─────────────────────────────────────────────────────────────

function GroupsWidget() {
  const [data, setData] = useState<{ groups: number; members: number; open: number } | null>(null)

  useEffect(() => {
    db.getGroups(false).then(async groups => {
      let totalMembers = 0
      let open = 0
      await Promise.all(groups.map(async g => {
        const members = await db.getGroupMembers(g.id)
        totalMembers += members.filter(m => m.status === 'active').length
        if (g.is_open) open++
      }))
      setData({ groups: groups.length, members: totalMembers, open })
    })
  }, [])

  return (
    <Widget title="Groups" href="/admin/groups" loading={data === null}>
      {data && (
        <div className="flex gap-6 pt-1">
          <Stat value={data.groups} label="Active groups" accent />
          <Stat value={data.members} label="Total members" />
          <Stat value={data.open} label="Open for signup" />
        </div>
      )}
    </Widget>
  )
}

// ── Visitors Widget ───────────────────────────────────────────────────────────

function VisitorsWidget() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getVisitorStats>> | null>(null)

  useEffect(() => {
    getVisitorStats().then(setData)
  }, [])

  return (
    <Widget title="Visitor Pipeline" href="/admin/visitors" loading={data === null}>
      {data && (
        <div className="flex gap-6 pt-1 flex-wrap">
          <Stat value={data.total} label="Total visitors" accent />
          <Stat value={data.activePipelines} label="Active pipelines" />
          {data.overdueSteps > 0 && (
            <div>
              <div className="text-3xl font-bold text-red-500">{data.overdueSteps}</div>
              <div className="text-xs text-gray-500 mt-0.5">Overdue steps</div>
            </div>
          )}
          <Stat value={data.completedThisWeek} label="Completed this week" />
        </div>
      )}
    </Widget>
  )
}

// ── Kids Widget ───────────────────────────────────────────────────────────────

function KidsWidget() {
  const [data, setData] = useState<{ kids: number; sessions: number } | null>(null)

  useEffect(() => {
    Promise.all([db.getPeople(), db.getCheckinSessions()]).then(([people, sessions]) => {
      setData({
        kids: people.filter(p => p.is_child && p.is_active).length,
        sessions: sessions.length,
      })
    })
  }, [])

  return (
    <Widget title="Kids Check-In" href="/admin/checkin" loading={data === null}>
      {data && (
        <div className="flex gap-6 pt-1">
          <Stat value={data.kids} label="Registered kids" accent />
          <Stat value={data.sessions} label="Check-in sessions" />
        </div>
      )}
    </Widget>
  )
}

// ── Events Widget ─────────────────────────────────────────────────────────────

function EventsWidget() {
  const [data, setData] = useState<{ upcoming: number; registrations: number } | null>(null)

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    db.getEvents().then(async events => {
      const upcoming = events.filter(e => e.is_active && e.event_date >= today)
      let registrations = 0
      await Promise.all(upcoming.map(async e => {
        const regs = await db.getEventRegistrations(e.id)
        registrations += regs.filter(r => r.status === 'registered').length
      }))
      setData({ upcoming: upcoming.length, registrations })
    })
  }, [])

  return (
    <Widget title="Upcoming Events" href="/admin/events" loading={data === null}>
      {data && (
        <div className="flex gap-6 pt-1">
          <Stat value={data.upcoming} label="Upcoming events" accent />
          <Stat value={data.registrations} label="Total registrations" />
        </div>
      )}
    </Widget>
  )
}

// ── Quick links ───────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { label: 'Add person', href: '/admin/people/new' },
  { label: 'Start check-in', href: '/admin/checkin' },
  { label: 'View groups', href: '/admin/groups' },
  { label: 'Visitor form', href: '/embed/visitor-form' },
]

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { user } = useAuth()
  const { config } = useAppConfig()
  const modules = config.modules ?? DEFAULT_MODULES

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Good to see you{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}.
        </p>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        {QUICK_LINKS.map(l => (
          <Link
            key={l.href}
            to={l.href}
            className="text-sm px-4 py-1.5 bg-white border border-gray-200 rounded-full text-gray-700 hover:bg-gray-50 transition-colors font-medium"
          >
            {l.label}
          </Link>
        ))}
      </div>

      {/* Widgets grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <AttendanceWidget />
        {modules.volunteers && <VolunteersWidget />}
        {modules.groups     && <GroupsWidget />}
        {modules.visitors   && <VisitorsWidget />}
        {modules.checkin    && <KidsWidget />}
        {modules.events     && <EventsWidget />}
        {modules.giving && (user?.isFinanceAdmin || (user?.tier ?? 0) >= AccessTier.Executive) && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col justify-between opacity-60">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Giving</h3>
              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Phase 7</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">Giving records and donor statements coming soon.</p>
          </div>
        )}
      </div>
    </div>
  )
}
