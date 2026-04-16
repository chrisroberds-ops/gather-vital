import { useState, useCallback } from 'react'
import KioskSetup from './KioskSetup'
import PhoneEntry from './PhoneEntry'
import ChildSelector from './ChildSelector'
import CheckinConfirmation from './CheckinConfirmation'
import NewFamilyForm from './NewFamilyForm'
import { useKioskId, useActiveSession } from '@/features/checkin/checkin-hooks'
import {
  lookupParentByPhone,
  performCheckin,
  registerNewFamily,
  generatePickupCode,
} from '@/features/checkin/checkin-service'
import type { LookupResult } from '@/features/checkin/checkin-service'
import { displayName } from '@/shared/utils/format'

type Screen =
  | { name: 'phone' }
  | { name: 'children'; lookup: LookupResult; phone: string }
  | { name: 'confirm'; checkedIn: Array<{ name: string; pickupCode: string }> }
  | { name: 'new_family'; phone?: string }

export default function KioskApp() {
  const { kioskId, setKioskId } = useKioskId()
  const { session, loading: sessionLoading } = useActiveSession()
  const [screen, setScreen] = useState<Screen>({ name: 'phone' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setScreen({ name: 'phone' })
    setError(null)
    setLoading(false)
  }, [])

  // ── Kiosk not configured yet ────────────────────────────────────────────────
  if (!kioskId) {
    return <KioskSetup onSetup={setKioskId} />
  }

  // ── No open session ─────────────────────────────────────────────────────────
  if (!sessionLoading && !session) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-700 to-gray-900 flex items-center justify-center px-8">
        <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Check-In Not Open</h1>
          <p className="text-gray-500 text-sm">
            Check-in hasn't been opened yet. A staff member will start a session when it's time.
          </p>
          <p className="text-xs text-gray-400 mt-6">Kiosk: {kioskId}</p>
        </div>
      </div>
    )
  }

  // ── Phone entry ─────────────────────────────────────────────────────────────
  if (screen.name === 'phone') {
    async function handlePhone(phone: string) {
      if (!session) return
      setLoading(true)
      setError(null)
      try {
        const result = await lookupParentByPhone(phone, session.id)
        if (!result) {
          setError("We couldn't find that number. First time here?")
          setLoading(false)
          return
        }
        setScreen({ name: 'children', lookup: result, phone })
      } catch {
        setError('Something went wrong. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    return (
      <PhoneEntry
        onSubmit={handlePhone}
        onNewFamily={() => setScreen({ name: 'new_family' })}
        loading={loading}
        error={error}
      />
    )
  }

  // ── Child selection ─────────────────────────────────────────────────────────
  if (screen.name === 'children') {
    const { lookup } = screen

    async function handleConfirm(selectedOptions: LookupResult['children']) {
      if (!session || !kioskId) return
      setLoading(true)
      setError(null)
      try {
        const results: Array<{ name: string; pickupCode: string }> = []
        for (const option of selectedOptions) {
          const checkin = await performCheckin({
            sessionId: session.id,
            childId: option.child.id,
            parentId: lookup.parent.id,
            householdId: option.householdId,
            pickupCode: option.pickupCode,
            kioskId,
          })
          const childDisplayName = option.child.preferred_name
            ? `${option.child.preferred_name} ${option.child.last_name}`
            : displayName(option.child)
          results.push({ name: childDisplayName, pickupCode: checkin.pickup_code })
        }
        setScreen({ name: 'confirm', checkedIn: results })
      } catch {
        setError('Check-in failed. Please see a staff member.')
      } finally {
        setLoading(false)
      }
    }

    return (
      <ChildSelector
        parentName={displayName(lookup.parent)}
        children={lookup.children}
        onConfirm={handleConfirm}
        onBack={reset}
        loading={loading}
      />
    )
  }

  // ── Confirmation ────────────────────────────────────────────────────────────
  if (screen.name === 'confirm') {
    return (
      <CheckinConfirmation
        children={screen.checkedIn}
        onReset={reset}
      />
    )
  }

  // ── New family registration ─────────────────────────────────────────────────
  if (screen.name === 'new_family') {
    async function handleNewFamily(data: Parameters<typeof registerNewFamily>[0]) {
      if (!session || !kioskId) return
      setLoading(true)
      setError(null)
      try {
        const { parent, children } = await registerNewFamily(data)
        // Auto check-in all children
        const results: Array<{ name: string; pickupCode: string }> = []
        for (const child of children) {
          const pickupCode = generatePickupCode()
          const checkin = await performCheckin({
            sessionId: session.id,
            childId: child.id,
            parentId: parent.id,
            householdId: (await import('@/services').then(m => m.db.getPersonHouseholds(parent.id)))[0].id,
            pickupCode,
            kioskId,
          })
          const childName = `${child.first_name} ${child.last_name}`
          results.push({ name: childName, pickupCode: checkin.pickup_code })
        }
        setScreen({ name: 'confirm', checkedIn: results })
      } catch (err) {
        setError('Registration failed. Please see a staff member.')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    return (
      <NewFamilyForm
        onSubmit={handleNewFamily}
        onBack={() => setScreen({ name: 'phone' })}
        loading={loading}
        error={error}
      />
    )
  }

  return null
}
