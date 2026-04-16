import { useAuth } from '@/auth/AuthContext'
import { AccessTier } from '@/shared/types'

export default function DashboardPlaceholder() {
  const { user } = useAuth()
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h1>
      <p className="text-gray-500 mb-6">Welcome to Gather. The full dashboard arrives in Phase 5.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'People Directory', href: '/admin/people', desc: 'Browse and manage people records', available: true },
          { label: 'Kids Check-In', href: '/admin/checkin', desc: 'Manage Sunday check-in sessions', available: false, phase: 2 },
          { label: 'Volunteer Scheduling', href: '/admin/volunteers', desc: 'Teams, schedules, and confirmations', available: false, phase: 3 },
          { label: 'Groups', href: '/admin/groups', desc: 'Small groups, classes, and ministries', available: false, phase: 4 },
          { label: 'Events', href: '/admin/events', desc: 'Event registration and management', available: false, phase: 4 },
          { label: 'Visitor Pipeline', href: '/admin/visitors', desc: 'New visitor follow-up workflow', available: false, phase: 5 },
          ...(user?.isFinanceAdmin || (user?.tier ?? 0) >= AccessTier.Executive
            ? [{ label: 'Giving', href: '/admin/giving', desc: 'Giving records and statements', available: false, phase: 7 }]
            : []),
        ].map(item => (
          <a
            key={item.label}
            href={item.available ? item.href : undefined}
            className={`block p-5 bg-white rounded-xl border border-gray-200 transition-shadow ${item.available ? 'hover:shadow-md cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-gray-900 text-sm">{item.label}</h3>
              {!item.available && (
                <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full whitespace-nowrap">
                  Phase {'phase' in item ? item.phase : ''}
                </span>
              )}
            </div>
            <p className="text-gray-500 text-xs mt-1">{item.desc}</p>
          </a>
        ))}
      </div>
    </div>
  )
}
