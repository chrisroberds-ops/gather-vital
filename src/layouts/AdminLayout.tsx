import React, { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { setCurrentUserForGuards } from '@/auth/guards'
import { AccessTier, DEFAULT_MODULES, type ModuleConfig } from '@/shared/types'
import { isTestMode } from '@/config/firebase'
import { tierHomePath } from '@/shared/utils/tierNav'
import { useAppConfig } from '@/services/app-config-context'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavGroupItem {
  to: string
  label: string
  icon: React.ReactNode
  minTier: AccessTier
  moduleKey?: keyof ModuleConfig
  requireFinance?: boolean
  /** Opens in a new tab instead of navigating */
  external?: boolean
}

interface NavGroup {
  id: string
  label: string
  emoji: string
  /** If current pathname starts with this prefix, this group auto-expands */
  pathPrefix?: string
  items: NavGroupItem[]
}

// ── Shared icon wrapper ───────────────────────────────────────────────────────

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="w-5 h-5 flex-shrink-0">{children}</span>
}

// ── Chevron ───────────────────────────────────────────────────────────────────

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

// ── Nav group definitions ─────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'people',
    label: 'People',
    emoji: '👥',
    items: [
      {
        to: '/admin/people',
        label: 'People Directory',
        minTier: AccessTier.Staff,
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Icon>
        ),
      },
      {
        to: '/admin/households',
        label: 'Households',
        minTier: AccessTier.Staff,
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </Icon>
        ),
      },
      {
        to: '/admin/visitors',
        label: 'Visitors',
        minTier: AccessTier.Staff,
        moduleKey: 'visitors',
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </Icon>
        ),
      },
      {
        to: '/admin/import',
        label: 'Import',
        minTier: AccessTier.Staff,
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </Icon>
        ),
      },
    ],
  },

  {
    id: 'ministry',
    label: 'Ministry',
    emoji: '🏠',
    items: [
      {
        to: '/admin/checkin',
        label: 'Check-In',
        minTier: AccessTier.Staff,
        moduleKey: 'checkin',
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </Icon>
        ),
      },
      {
        to: '/admin/groups',
        label: 'Groups',
        minTier: AccessTier.Staff,
        moduleKey: 'groups',
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Icon>
        ),
      },
      {
        to: '/admin/events',
        label: 'Events',
        minTier: AccessTier.Staff,
        moduleKey: 'events',
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </Icon>
        ),
      },
      {
        to: '/admin/volunteers',
        label: 'Volunteers',
        minTier: AccessTier.Staff,
        moduleKey: 'volunteers',
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </Icon>
        ),
      },
      {
        to: '/admin/volunteers/runsheet',
        label: 'Run Sheet',
        minTier: AccessTier.Staff,
        moduleKey: 'volunteers',
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          </Icon>
        ),
      },
      {
        to: '/admin/attendance',
        label: 'Attendance',
        minTier: AccessTier.Staff,
        moduleKey: 'attendance',
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </Icon>
        ),
      },
    ],
  },

  {
    id: 'worship',
    label: 'Worship',
    emoji: '🎵',
    pathPrefix: '/admin/worship',
    items: [
      {
        to: '/admin/worship/services',
        label: 'Service Plans',
        minTier: AccessTier.Staff,
        moduleKey: 'worship',
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </Icon>
        ),
      },
      {
        to: '/admin/worship/songs',
        label: 'Song Library',
        minTier: AccessTier.Staff,
        moduleKey: 'worship',
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </Icon>
        ),
      },
      {
        to: '/admin/worship/ccli',
        label: 'CCLI Report',
        minTier: AccessTier.Staff,
        moduleKey: 'worship',
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </Icon>
        ),
      },
      {
        to: '/stand',
        label: 'Music Stand',
        minTier: AccessTier.Authenticated,
        moduleKey: 'worship',
        external: true,
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V8l10-2v11" />
              <circle cx="7" cy="19" r="2" fill="currentColor" stroke="none" />
              <circle cx="17" cy="17" r="2" fill="currentColor" stroke="none" />
            </svg>
          </Icon>
        ),
      },
      {
        to: '/display/service',
        label: 'Stage Display',
        minTier: AccessTier.Staff,
        moduleKey: 'worship',
        external: true,
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </Icon>
        ),
      },
    ],
  },

  {
    id: 'communicate',
    label: 'Communicate',
    emoji: '💬',
    items: [
      {
        to: '/admin/communications',
        label: 'Bulk Messaging',
        minTier: AccessTier.Staff,
        moduleKey: 'communications',
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </Icon>
        ),
      },
      {
        to: '/admin/giving',
        label: 'Giving',
        minTier: AccessTier.Staff,
        requireFinance: true,
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </Icon>
        ),
      },
      {
        to: '/admin/embeds',
        label: 'Embeds & QR',
        minTier: AccessTier.Staff,
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </Icon>
        ),
      },
    ],
  },

  {
    id: 'admin',
    label: 'Admin',
    emoji: '⚙️',
    items: [
      {
        to: '/admin/reports/monthly',
        label: 'Monthly Report',
        minTier: AccessTier.Staff,
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </Icon>
        ),
      },
      {
        to: '/admin/settings',
        label: 'Settings',
        minTier: AccessTier.Executive,
        icon: (
          <Icon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Icon>
        ),
      },
    ],
  },
]

// ── localStorage helpers for group open state ─────────────────────────────────

const GROUPS_LS_KEY = 'gather:sidebar_groups'

function loadOpenGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(GROUPS_LS_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {}
  return new Set<string>()
}

function persistOpenGroups(groups: Set<string>): void {
  try {
    localStorage.setItem(GROUPS_LS_KEY, JSON.stringify([...groups]))
  } catch {}
}

// Returns true if the given pathname belongs to a group (for auto-expand).
function isGroupActive(group: NavGroup, pathname: string): boolean {
  if (group.pathPrefix && pathname.startsWith(group.pathPrefix)) return true
  return group.items.some(
    item => !item.external && (pathname === item.to || pathname.startsWith(item.to + '/')),
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminLayout() {
  const { user, signOut, setTestTier } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { config, labels } = useAppConfig()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(loadOpenGroups)

  // Redirect to setup wizard if setup is not complete
  useEffect(() => {
    if (!config.setup_complete) {
      navigate('/setup', { replace: true })
    }
  }, [config.setup_complete, navigate])

  // Auto-expand the group containing the current route
  useEffect(() => {
    const activeGroup = NAV_GROUPS.find(g => isGroupActive(g, location.pathname))
    if (activeGroup) {
      setOpenGroups(prev => {
        if (prev.has(activeGroup.id)) return prev
        const next = new Set(prev)
        next.add(activeGroup.id)
        persistOpenGroups(next)
        return next
      })
    }
  }, [location.pathname])

  const modules = config.modules ?? DEFAULT_MODULES

  // Filter items for a group by tier, finance flag, and module flag
  function visibleItems(group: NavGroup): NavGroupItem[] {
    return group.items
      .map(item => {
        // Apply dynamic terminology labels
        if (item.to === '/admin/volunteers') return { ...item, label: labels.volunteers }
        if (item.to === '/admin/groups')     return { ...item, label: labels.groups }
        if (item.to === '/admin/giving')     return { ...item, label: labels.giving }
        return item
      })
      .filter(item => {
        if ((user?.tier ?? 0) < item.minTier) return false
        if (item.requireFinance && !user?.isFinanceAdmin) return false
        if (item.moduleKey && !modules[item.moduleKey]) return false
        return true
      })
  }

  function toggleGroup(id: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      persistOpenGroups(next)
      return next
    })
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const tierColors: Record<AccessTier, string> = {
    [AccessTier.Public]: 'bg-gray-100 text-gray-600',
    [AccessTier.Authenticated]: 'bg-blue-100 text-blue-700',
    [AccessTier.GroupLeader]: 'bg-purple-100 text-purple-700',
    [AccessTier.Staff]: 'bg-green-100 text-green-700',
    [AccessTier.Executive]: 'bg-orange-100 text-orange-700',
  }

  const tierLabels: Record<AccessTier, string> = {
    [AccessTier.Public]: 'Public',
    [AccessTier.Authenticated]: 'Member',
    [AccessTier.GroupLeader]: 'Leader',
    [AccessTier.Staff]: 'Staff',
    [AccessTier.Executive]: 'Executive',
  }

  // All visible items across all groups — used for the collapsed (icon-only) desktop view
  const allVisibleItems = NAV_GROUPS.flatMap(g => visibleItems(g))

  // ── Shared nav item renderer ──────────────────────────────────────────────

  function renderNavItem(item: NavGroupItem, isMobile: boolean, isCollapsedDesktop: boolean) {
    const baseClass = `flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5`
    const centeredClass = isCollapsedDesktop ? 'justify-center' : ''

    if (item.external) {
      return (
        <a
          key={item.to}
          href={item.to}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => isMobile && setMobileOpen(false)}
          className={`${baseClass} ${centeredClass} text-gray-600 hover:bg-gray-100 hover:text-gray-900`}
          title={isCollapsedDesktop ? item.label : undefined}
        >
          {item.icon}
          {!isCollapsedDesktop && (
            <>
              <span className="flex-1">{item.label}</span>
              <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </>
          )}
        </a>
      )
    }

    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === '/admin'}
        onClick={() => isMobile && setMobileOpen(false)}
        className={({ isActive }) =>
          `${baseClass} ${centeredClass} ${
            isActive
              ? 'bg-primary-50 text-primary-700 font-medium'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`
        }
        title={isCollapsedDesktop ? item.label : undefined}
      >
        {item.icon}
        {!isCollapsedDesktop && <span className="flex-1">{item.label}</span>}
      </NavLink>
    )
  }

  // ── Sidebar content ────────────────────────────────────────────────────────

  const sidebarContent = (isMobile: boolean) => {
    const isCollapsedDesktop = collapsed && !isMobile

    return (
      <>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-200">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
            {config.logo_url
              ? <img src={config.logo_url} alt="" className="w-full h-full object-cover" />
              : <span className="text-white font-bold text-sm">{(config.church_name?.[0] ?? 'G').toUpperCase()}</span>
            }
          </div>
          {(!collapsed || isMobile) && (
            <span className="font-bold text-gray-900 text-lg truncate">{config.church_name || 'Gather'}</span>
          )}
          {!isMobile && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="ml-auto text-gray-400 hover:text-gray-600 p-1 rounded"
              aria-label="Toggle sidebar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={collapsed ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} />
              </svg>
            </button>
          )}
          {isMobile && (
            <button
              onClick={() => setMobileOpen(false)}
              className="ml-auto text-gray-400 hover:text-gray-600 p-1 rounded"
              aria-label="Close sidebar"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {/* Dashboard — standalone, always at top */}
          <NavLink
            to="/admin"
            end
            onClick={() => isMobile && setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 ${
                isCollapsedDesktop ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
            title={isCollapsedDesktop ? 'Dashboard' : undefined}
          >
            <Icon>
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </Icon>
            {!isCollapsedDesktop && <span className="flex-1">Dashboard</span>}
          </NavLink>

          {isCollapsedDesktop ? (
            // ── Collapsed desktop: flat icon list, no group structure ──────────
            allVisibleItems.map(item => renderNavItem(item, false, true))
          ) : (
            // ── Expanded: grouped collapsible sections ────────────────────────
            NAV_GROUPS.map(group => {
              const items = visibleItems(group)
              if (items.length === 0) return null
              const isOpen = openGroups.has(group.id)

              return (
                <div key={group.id}>
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="w-full flex items-center gap-2 mx-2 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors mt-2 mb-0.5"
                    style={{ width: 'calc(100% - 1rem)' }}
                  >
                    <span>{group.emoji}</span>
                    <span className="flex-1 text-left">{group.label}</span>
                    <Chevron open={isOpen} />
                  </button>

                  {/* Group items */}
                  {isOpen && items.map(item => renderNavItem(item, isMobile, false))}
                </div>
              )
            })
          )}
        </nav>

        {/* User footer */}
        <div className="border-t border-gray-200 p-3">
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className={`w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 transition-colors ${isCollapsedDesktop ? 'justify-center' : ''}`}
            >
              <div className="w-7 h-7 bg-primary-200 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-primary-700 text-xs font-bold">
                  {user?.displayName?.[0] ?? user?.email?.[0] ?? '?'}
                </span>
              </div>
              {!isCollapsedDesktop && (
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-medium text-gray-900 truncate">
                    {user?.displayName ?? user?.email ?? 'Unknown'}
                  </p>
                  {user && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${tierColors[user.tier]}`}>
                      {tierLabels[user.tier]}
                      {user.isFinanceAdmin ? ' + Finance' : ''}
                    </span>
                  )}
                </div>
              )}
            </button>

            {userMenuOpen && (
              <div className="absolute bottom-full left-0 w-48 mb-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                {isTestMode && (
                  <>
                    <div className="px-3 py-1.5 text-xs text-gray-500 font-medium uppercase tracking-wide">
                      Switch Tier (Test Mode)
                    </div>
                    {[
                      AccessTier.Authenticated,
                      AccessTier.GroupLeader,
                      AccessTier.Staff,
                      AccessTier.Executive,
                    ].map(tier => (
                      <button
                        key={tier}
                        onClick={() => {
                          setCurrentUserForGuards({ tier, isFinanceAdmin: false })
                          setTestTier(tier)
                          setUserMenuOpen(false)
                          navigate(tierHomePath(tier))
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        {tierLabels[tier]}
                      </button>
                    ))}
                    <div className="border-t border-gray-100 my-1" />
                  </>
                )}
                <button
                  onClick={() => { void handleSignOut(); setUserMenuOpen(false) }}
                  className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar overlay */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 flex flex-col
        transform transition-transform duration-200
        lg:hidden
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {sidebarContent(true)}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`${collapsed ? 'w-16' : 'w-56'} hidden lg:flex flex-shrink-0 bg-white border-r border-gray-200 flex-col transition-all duration-200`}
      >
        {sidebarContent(false)}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-gray-500 hover:text-gray-700 p-1 rounded"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center overflow-hidden">
            {config.logo_url
              ? <img src={config.logo_url} alt="" className="w-full h-full object-cover" />
              : <span className="text-white font-bold text-xs">{(config.church_name?.[0] ?? 'G').toUpperCase()}</span>
            }
          </div>
          <span className="font-semibold text-gray-900 text-sm truncate">{config.church_name || 'Gather'}</span>
        </div>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
