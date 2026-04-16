import { Link } from 'react-router-dom'
import { isTestMode } from '@/config/firebase'

export default function PublicLandingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">G</span>
            </div>
            <span className="font-bold text-gray-900 text-lg">Gather</span>
          </div>
          <Link
            to="/login"
            className="text-sm font-medium text-primary-600 hover:text-primary-700 px-4 py-2 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors"
          >
            Member sign in
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {isTestMode && (
          <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <strong>TEST MODE — Public view.</strong> This is what an unlogged-in visitor sees.
            Use the <Link to="/login" className="underline font-medium">login page</Link> tier switcher to explore other access levels.
          </div>
        )}

        {/* Hero */}
        <div className="text-center mb-14">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Welcome to Community Church</h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto">
            We're glad you're here. Explore our groups, check out upcoming events, or let us know you visited.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <FeatureCard
            icon="👥"
            title="Browse Groups"
            description="Find a small group, class, or ministry team that fits your life."
            href="/embed/groups"
            linkLabel="See all groups"
          />
          <FeatureCard
            icon="📅"
            title="Upcoming Events"
            description="Church-wide gatherings, workshops, retreats, and community nights."
            href="/embed/events"
            linkLabel="See all events"
          />
          <FeatureCard
            icon="👋"
            title="New Here?"
            description="Fill out a quick form and we'll personally reach out to welcome you."
            href="/embed/visitor-form"
            linkLabel="Say hello"
          />
        </div>

        {/* Sign-in prompt */}
        <div className="bg-primary-50 border border-primary-100 rounded-2xl p-8 text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Already part of the community?</h2>
          <p className="text-gray-500 text-sm mb-4">
            Sign in to view your groups, confirm volunteer assignments, and register for events.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            Sign in to your account
          </Link>
        </div>
      </main>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
  href,
  linkLabel,
}: {
  icon: string
  title: string
  description: string
  href: string
  linkLabel: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-500 text-sm flex-1 mb-4">{description}</p>
      <Link
        to={href}
        className="text-sm font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
      >
        {linkLabel}
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  )
}
