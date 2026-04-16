import { useState, useRef } from 'react'
import { lookupByPickupCode, performCheckout, getPersonCrossTab, getOpenSession } from './checkin-service'
import { addToPickupQueue, clearPickupEntry } from '@/features/display/pickup-queue-service'
import { db } from '@/services'
import type { Checkin } from '@/shared/types'
import { displayName } from '@/shared/utils/format'
import Spinner from '@/shared/components/Spinner'

interface Props {
  sessionId: string
  staffPersonId: string
}

const ATTEMPT_THRESHOLD = 3

export default function CheckoutPanel({ sessionId, staffPersonId }: Props) {
  const [code, setCode] = useState('')
  const [matched, setMatched] = useState<{ checkin: Checkin; childName: string; queueEntryId: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [flagAlert, setFlagAlert] = useState<string | null>(null)

  // Track consecutive failed attempts per code to detect 3-strike pattern
  const failureCountRef = useRef<Map<string, number>>(new Map())

  async function handleLookup() {
    if (!code.trim()) return
    setLoading(true)
    setError(null)
    setSuccess(null)
    setFlagAlert(null)
    setMatched(null)
    try {
      const checkin = await lookupByPickupCode(code.trim(), sessionId)
      if (!checkin) {
        // Log failed attempt
        const codeKey = code.trim()
        const prev = failureCountRef.current.get(codeKey) ?? 0
        const next = prev + 1
        failureCountRef.current.set(codeKey, next)

        await db.createPickupAttempt({
          session_id: sessionId,
          checkin_id: '',
          code_entered: codeKey,
          attempted_by: staffPersonId,
          success: false,
        })

        if (next >= ATTEMPT_THRESHOLD) {
          // Try to find the checkin by scanning recently returned codes — use the raw code match
          // Since lookup already failed, alert staff about repeated failures
          setFlagAlert(
            `⚠️ Code "${codeKey}" has failed ${next} times. This may be an unauthorized pickup attempt. Alert your team.`
          )
          failureCountRef.current.set(codeKey, 0) // reset after alert
        }

        setError('No active check-in found for that code.')
        setLoading(false)
        return
      }

      // Log successful lookup attempt
      await db.createPickupAttempt({
        session_id: sessionId,
        checkin_id: checkin.id,
        code_entered: code.trim(),
        attempted_by: staffPersonId,
        success: true,
      })

      // Reset failure count on success
      failureCountRef.current.set(code.trim(), 0)

      const child = await getPersonCrossTab(checkin.child_id)
      const childName = child ? displayName(child) : 'Unknown'
      const room = checkin.override_room ?? child?.grade ?? 'Lobby'

      // Add to lobby display immediately — the TV shows the child is being retrieved.
      let queueEntryId = ''
      const session = await getOpenSession()
      if (session) {
        try {
          const entry = await addToPickupQueue({
            session_id: session.id,
            checkin_id: checkin.id,
            child_name: childName,
            room,
            pickup_code: code.trim(),
          })
          queueEntryId = entry.id
        } catch (err) {
          console.error('Failed to add to pickup queue:', err)
        }
      }

      setMatched({ checkin, childName, queueEntryId })
    } catch {
      setError('Lookup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmCheckout() {
    if (!matched) return
    setLoading(true)
    setError(null)
    try {
      await performCheckout(matched.checkin.id, staffPersonId)
      // Remove from lobby display — checkout is the clear trigger.
      if (matched.queueEntryId) {
        try {
          await clearPickupEntry(matched.queueEntryId)
        } catch (err) {
          console.error('Failed to clear pickup queue entry:', err)
        }
      }
      setSuccess(`${matched.childName} has been checked out.`)
      setMatched(null)
      setCode('')
    } catch {
      setError('Checkout failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h3 className="font-semibold text-gray-800 mb-4">Pickup / Checkout</h3>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void handleLookup() }}
          placeholder="Enter 4-digit pickup code"
          maxLength={4}
          className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button
          onClick={() => void handleLookup()}
          disabled={!code.trim() || loading}
          className="px-5 py-3 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-40 transition-colors"
        >
          {loading ? <Spinner size="sm" /> : 'Look up'}
        </button>
      </div>

      {flagAlert && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3 font-medium">
          {flagAlert}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-3">{error}</div>
      )}

      {success && (
        <div className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3 mb-3">✓ {success}</div>
      )}

      {matched && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-amber-600 font-medium uppercase tracking-wide">Confirm pickup</div>
            <div className="font-semibold text-gray-900 mt-0.5">{matched.childName}</div>
            <div className="text-sm text-gray-500">Code: <span className="font-mono font-bold">{code}</span></div>
          </div>
          <button
            onClick={() => void handleConfirmCheckout()}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-40 transition-colors"
          >
            {loading ? <Spinner size="sm" /> : 'Check Out'}
          </button>
        </div>
      )}
    </div>
  )
}
