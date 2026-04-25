import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AuthProvider } from '@/auth/AuthContext'
import { AppConfigProvider } from '@/services/app-config-context'
import { requireAuth, requireGroupLeader, requireStaff, requireExecutive, requireFinanceAdmin } from '@/auth/guards'
import ErrorBoundary from '@/shared/components/ErrorBoundary'
import ModuleGuard from '@/shared/components/ModuleGuard'
import AdminLayout from '@/layouts/AdminLayout'
import PublicLayout from '@/layouts/PublicLayout'
import MemberLayout from '@/layouts/MemberLayout'
import KioskLayout from '@/layouts/KioskLayout'
import EmbedLayout from '@/layouts/EmbedLayout'
import LoginPage from '@/auth/LoginPage'

// Lazy-loaded pages
const PeopleDirectory = lazy(() => import('@/features/people/PeopleDirectory'))
const PersonDetail = lazy(() => import('@/features/people/PersonDetail'))
const PersonForm = lazy(() => import('@/features/people/PersonForm'))
const AdminDashboard = lazy(() => import('@/features/dashboard/AdminDashboard'))
const KioskApp = lazy(() => import('@/features/kiosk/KioskApp'))
const CheckinDashboard = lazy(() => import('@/features/checkin/CheckinDashboard'))
const HouseholdDetail = lazy(() => import('@/features/people/HouseholdDetail'))
const VolunteerDashboard = lazy(() => import('@/features/volunteers/VolunteerDashboard'))
const GroupsDirectory = lazy(() => import('@/features/groups/GroupsDirectory'))
const GroupDetail = lazy(() => import('@/features/groups/GroupDetail'))
const GroupBrowser = lazy(() => import('@/features/groups/GroupBrowser'))
const EventsManager = lazy(() => import('@/features/events/EventsManager'))
const EventBrowser = lazy(() => import('@/features/events/EventBrowser'))
const VisitorPipeline = lazy(() => import('@/features/visitors/VisitorPipeline'))
const VisitorForm = lazy(() => import('@/features/visitors/VisitorForm'))
const SetupWizard = lazy(() => import('@/features/setup/SetupWizard'))
const ChurchSettings = lazy(() => import('@/features/settings/ChurchSettings'))
const ImportPage = lazy(() => import('@/features/import/ImportPage'))
const EmbedsPage = lazy(() => import('@/features/embeds/EmbedsPage'))
const UnauthorizedPage = lazy(() => import('@/features/shared-pages/UnauthorizedPage'))
const PublicLandingPage = lazy(() => import('@/features/public-pages/PublicLandingPage'))
const MemberDashboard = lazy(() => import('@/features/member/MemberDashboard'))
const GroupLeaderDashboard = lazy(() => import('@/features/member/GroupLeaderDashboard'))

// New pages — foundational additions
const AttendanceEntryPage = lazy(() => import('@/features/attendance/AttendanceEntry'))
const CommunicationsLog = lazy(() => import('@/features/communications/CommunicationsLog'))

// Live pickup display
const PickupDisplay = lazy(() => import('@/features/display/PickupDisplay'))
// Service stage display (read-only confidence monitor)
const ServiceDisplay = lazy(() => import('@/features/display/ServiceDisplay'))

// Worship planning
const WorshipDashboard = lazy(() => import('@/features/worship/WorshipDashboard'))
const SongLibrary = lazy(() => import('@/features/worship/SongLibrary'))
const SongForm = lazy(() => import('@/features/worship/SongForm'))
const BulkPdfUpload = lazy(() => import('@/features/worship/BulkPdfUpload'))
const ServicePlanList = lazy(() => import('@/features/worship/ServicePlanList'))
const ServiceBuilder = lazy(() => import('@/features/worship/ServiceBuilder'))

// Music Stand
const StandLayout = lazy(() => import('@/features/stand/StandLayout'))
const PlanList = lazy(() => import('@/features/stand/PlanList'))
const OrderOfService = lazy(() => import('@/features/stand/OrderOfService'))
const SongView = lazy(() => import('@/features/stand/SongView'))

// Confirmation / public action pages (no auth required)
const ConfirmPage = lazy(() => import('@/features/public-pages/ConfirmPage'))

// Giving & Finance (Finance Admin only)
const GivingDashboard = lazy(() => import('@/features/giving/GivingDashboard'))
const GivingStatements = lazy(() => import('@/features/giving/GivingStatements'))
const GivingEmbed = lazy(() => import('@/features/giving/GivingEmbed'))

// Reports
const MonthlyReport = lazy(() => import('@/features/reports/MonthlyReport'))

// Volunteer Run Sheet
const RunSheet = lazy(() => import('@/features/volunteers/RunSheet'))

// CCLI Usage Report
const CcliReport = lazy(() => import('@/features/worship/CcliReport'))

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full min-h-48">
      <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingFallback />}>{children}</Suspense>
}

function ComingSoon({ title, phase, embed = false }: { title: string; phase: number; embed?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center ${embed ? 'min-h-32 p-6' : 'min-h-[60vh]'} text-center`}>
      <div className="text-4xl mb-3">🚧</div>
      <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
      <p className="text-gray-500 text-sm mt-1">Coming in Phase {phase}</p>
    </div>
  )
}

const router = createBrowserRouter([
  // ── Root redirect → public landing ─────────────────────────────────────────
  {
    path: '/',
    element: <Navigate to="/public" replace />,
  },

  // ── Setup wizard (authenticated, full-screen — no admin shell) ─────────────
  {
    path: '/setup',
    loader: requireAuth(),
    element: <Wrap><SetupWizard /></Wrap>,
  },

  // ── Live pickup display (no auth, full-screen, no chrome) ──────────────────
  {
    path: '/display',
    element: <Wrap><PickupDisplay /></Wrap>,
  },

  // ── Service stage display — read-only confidence monitor (no auth) ──────────
  {
    path: '/display/service',
    element: <Wrap><ServiceDisplay /></Wrap>,
  },

  // ── Music Stand (authenticated, full-screen, no admin chrome) ──────────────
  {
    path: '/stand',
    loader: requireAuth(),
    element: <Wrap><StandLayout /></Wrap>,
    children: [
      { index: true, element: <Wrap><PlanList /></Wrap> },
      { path: 'plans/:planId', element: <Wrap><OrderOfService /></Wrap> },
      { path: 'plans/:planId/songs/:songId', element: <Wrap><SongView /></Wrap> },
    ],
  },

  // ── One-click confirmation (no auth required) ──────────────────────────────
  {
    path: '/confirm',
    element: <Wrap><ConfirmPage /></Wrap>,
  },

  // ── Public pages (no auth required) ────────────────────────────────────────
  {
    path: '/',
    element: <PublicLayout />,
    children: [
      { path: 'public', element: <Wrap><PublicLandingPage /></Wrap> },
      { path: 'login', element: <LoginPage /> },
      { path: 'unauthorized', element: <Wrap><UnauthorizedPage /></Wrap> },
    ],
  },

  // ── Member self-service (Authenticated+) ───────────────────────────────────
  {
    path: '/',
    element: <MemberLayout />,
    children: [
      {
        path: 'my',
        loader: requireAuth(),
        element: <Wrap><MemberDashboard /></Wrap>,
      },
      {
        path: 'leader',
        loader: requireGroupLeader(),
        element: <Wrap><GroupLeaderDashboard /></Wrap>,
      },
    ],
  },

  // ── Admin shell (Staff+) ────────────────────────────────────────────────────
  {
    path: '/',
    element: <AdminLayout />,
    children: [
      // Convenience aliases
      { path: 'admin/dashboard', element: <Navigate to="/admin" replace /> },
      {
        path: 'admin',
        loader: requireStaff(),
        element: <Wrap><AdminDashboard /></Wrap>,
      },
      {
        path: 'admin/people',
        loader: requireStaff(),
        element: <Wrap><PeopleDirectory /></Wrap>,
      },
      {
        path: 'admin/people/new',
        loader: requireStaff(),
        element: <Wrap><PersonForm /></Wrap>,
      },
      {
        path: 'admin/people/:id',
        loader: requireStaff(),
        element: <Wrap><PersonDetail /></Wrap>,
      },
      {
        path: 'admin/people/:id/edit',
        loader: requireStaff(),
        element: <Wrap><PersonForm /></Wrap>,
      },
      {
        path: 'admin/households/:id',
        loader: requireStaff(),
        element: <Wrap><HouseholdDetail /></Wrap>,
      },
      {
        path: 'admin/checkin',
        loader: requireStaff(),
        element: (
          <Wrap>
            <ModuleGuard module="checkin">
              <CheckinDashboard />
            </ModuleGuard>
          </Wrap>
        ),
      },
      {
        path: 'admin/volunteers',
        loader: requireStaff(),
        element: (
          <Wrap>
            <ModuleGuard module="volunteers">
              <VolunteerDashboard />
            </ModuleGuard>
          </Wrap>
        ),
      },
      {
        path: 'admin/groups',
        loader: requireStaff(),
        element: (
          <Wrap>
            <ModuleGuard module="groups">
              <GroupsDirectory />
            </ModuleGuard>
          </Wrap>
        ),
      },
      {
        path: 'admin/groups/:id',
        loader: requireGroupLeader(),
        element: (
          <Wrap>
            <ModuleGuard module="groups">
              <GroupDetail />
            </ModuleGuard>
          </Wrap>
        ),
      },
      {
        path: 'admin/events',
        loader: requireStaff(),
        element: (
          <Wrap>
            <ModuleGuard module="events">
              <EventsManager />
            </ModuleGuard>
          </Wrap>
        ),
      },
      {
        path: 'admin/visitors',
        loader: requireStaff(),
        element: (
          <Wrap>
            <ModuleGuard module="visitors">
              <VisitorPipeline />
            </ModuleGuard>
          </Wrap>
        ),
      },
      {
        path: 'admin/giving',
        loader: requireFinanceAdmin(),
        element: (
          <Wrap>
            <ModuleGuard module="giving">
              <GivingDashboard />
            </ModuleGuard>
          </Wrap>
        ),
      },
      {
        path: 'admin/giving/statements',
        loader: requireFinanceAdmin(),
        element: (
          <Wrap>
            <ModuleGuard module="giving">
              <GivingStatements />
            </ModuleGuard>
          </Wrap>
        ),
      },
      // ── Attendance ──────────────────────────────────────────────────────────
      {
        path: 'admin/attendance',
        loader: requireStaff(),
        element: (
          <Wrap>
            <ModuleGuard module="attendance">
              <AttendanceEntryPage />
            </ModuleGuard>
          </Wrap>
        ),
      },
      // ── Communications ──────────────────────────────────────────────────────
      {
        path: 'admin/communications',
        loader: requireStaff(),
        element: (
          <Wrap>
            <ModuleGuard module="communications">
              <CommunicationsLog />
            </ModuleGuard>
          </Wrap>
        ),
      },
      // ── Worship Planning (nested under WorshipDashboard layout) ────────────
      {
        path: 'admin/worship',
        loader: requireStaff(),
        element: (
          <Wrap>
            <ModuleGuard module="worship">
              <WorshipDashboard />
            </ModuleGuard>
          </Wrap>
        ),
        children: [
          { path: 'songs',             element: <Wrap><SongLibrary /></Wrap> },
          { path: 'songs/bulk-pdf',   element: <Wrap><BulkPdfUpload /></Wrap> },
          { path: 'songs/new',        element: <Wrap><SongForm mode="create" /></Wrap> },
          { path: 'songs/:id/edit',   element: <Wrap><SongForm mode="edit" /></Wrap> },
          { path: 'services',         element: <Wrap><ServicePlanList /></Wrap> },
          { path: 'services/:id',     element: <Wrap><ServiceBuilder /></Wrap> },
          { path: 'ccli',             element: <Wrap><CcliReport /></Wrap> },
        ],
      },
      // ── Volunteer Run Sheet ─────────────────────────────────────────────────
      {
        path: 'admin/volunteers/runsheet',
        loader: requireStaff(),
        element: <Wrap><RunSheet /></Wrap>,
      },
      // ── Reports ────────────────────────────────────────────────────────────
      {
        path: 'admin/reports/monthly',
        loader: requireStaff(),
        element: <Wrap><MonthlyReport /></Wrap>,
      },
      // ── Settings / Import / Embeds ──────────────────────────────────────────
      {
        path: 'admin/settings',
        loader: requireExecutive(),
        element: <Wrap><ChurchSettings /></Wrap>,
      },
      {
        path: 'admin/import',
        loader: requireStaff(),
        element: <Wrap><ImportPage /></Wrap>,
      },
      {
        path: 'admin/embeds',
        loader: requireStaff(),
        element: <Wrap><EmbedsPage /></Wrap>,
      },
    ],
  },

  // ── Kiosk shell ────────────────────────────────────────────────────────────
  {
    path: '/kiosk',
    element: <KioskLayout />,
    children: [
      {
        index: true,
        element: (
          <Wrap>
            <ModuleGuard module="checkin" embed>
              <KioskApp />
            </ModuleGuard>
          </Wrap>
        ),
      },
    ],
  },

  // ── Embed shell (public, iframe-friendly) ──────────────────────────────────
  {
    path: '/embed',
    element: <EmbedLayout />,
    children: [
      {
        path: 'groups',
        element: (
          <Wrap>
            <ModuleGuard module="groups" embed>
              <GroupBrowser />
            </ModuleGuard>
          </Wrap>
        ),
      },
      {
        path: 'events',
        element: (
          <Wrap>
            <ModuleGuard module="events" embed>
              <EventBrowser />
            </ModuleGuard>
          </Wrap>
        ),
      },
      {
        path: 'visitor-form',
        element: (
          <Wrap>
            <ModuleGuard module="visitors" embed>
              <VisitorForm />
            </ModuleGuard>
          </Wrap>
        ),
      },
      {
        path: 'giving',
        element: (
          <Wrap>
            <ModuleGuard module="giving" embed>
              <GivingEmbed />
            </ModuleGuard>
          </Wrap>
        ),
      },
    ],
  },
])

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppConfigProvider>
          <RouterProvider router={router} />
        </AppConfigProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
