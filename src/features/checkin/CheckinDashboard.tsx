import { useActiveSession } from './checkin-hooks'
import SessionSetup from './SessionSetup'
import CheckinRoster from './CheckinRoster'
import CheckoutPanel from './CheckoutPanel'
import Spinner from '@/shared/components/Spinner'
import { useAuth } from '@/auth/AuthContext'

const STAFF_PERSON_ID = 'system' // fallback when no linked person record

export default function CheckinDashboard() {
  const { user } = useAuth()
  const { session, loading, refresh } = useActiveSession()
  const staffPersonId = user?.personId ?? STAFF_PERSON_ID

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kids Check-In</h1>
        <p className="text-gray-500 text-sm mt-1">
          Open a session to begin. Kiosks will show the phone entry screen once a session is active.
        </p>
      </div>

      <SessionSetup
        session={session}
        onSessionChange={refresh}
        staffPersonId={staffPersonId}
      />

      {session && (
        <>
          <CheckoutPanel sessionId={session.id} staffPersonId={staffPersonId} />
          <CheckinRoster sessionId={session.id} session={session} />
        </>
      )}
    </div>
  )
}
