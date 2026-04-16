import { useState, useRef } from 'react'
import {
  lookupByPickupCode,
  performCheckout,
  getPersonCrossTab,
  getOpenSession,
  getHouseholdCheckoutGroup,
  type HouseholdCheckoutGroup,
} from './checkin-service'
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

interface MatchedGroup {
  group: HouseholdCheckoutGroup
  /** Checkin IDs the staff has selected for checkout — defaults to all authorized children */
  selectedIds: Set<string>
  /** Map of checkinId → queueEntryId (for clearing the lobby display after checkout) */
  queueEntries: Map<string, string>
}

export default function CheckoutPanel({ sessionId, staffPersonId }: Props) {
  const [code, setCode] = useState('')
  const [matched, setMatched] = useState<MatchedGroup | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [flagAlert, setFlagAlert] = useState<string | null>(null)

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
        const codeKey = code.trim()
        const prev = failureCountRef.current.get(codeKey) ?? 0
        const next = prev + 1
        failureCountRef.current.set(codeKey, next)

        await db.createPickupAttempt({
          session_id: sessionId,
          checkin_id: '',
          code_entered: codeKey,
        })

        if (next >= ATTEMPT_THRESHOLD) {
          setFlagAlert(
            `⚠️ Code "${codeKey}" has failed ${next} times. This may be an unauthorized pickup attempt. Alert your team.`
          )
          failureCountRef.current.set(codeKey, 0)
        }

        setError('No active check-in found for that code.')
        setLoading(false)
        return
      }

      await db.createPickupAttempt({
        session_id: sessionId,
        checkin_id: checkin.id,
        code_entered: code.trim(),
      })

      failureCountRef.current.set(code.trim(), 0)

      // Build the household group (may have additional children)
      const group = await getHouseholdCheckoutGroup(checkin, code.trim(), sessionId)

      // Add primary child to lobby display immediately
      const queueEntries = new Map<string, string>()
      const session = await getOpenSession()
      if (session) {
        try {
          const entry = await addToPickupQueue({
            session_id: session.id,
            checkin_id: checkin.id,
            child_name: group.primary.childName,
            room: group.primary.room,
            pickup_code: code.trim(),
          })
          queueEntries.set(checkin.id, entry.id)
        } catch (err) {
          console.error('Failed to add to pickup queue:', err)
        }
      }

      // Default selection: primary + all authorized additional children
      const selectedIds = new Set<string>([checkin.id])
      for (const entry of group.additional) {
        if (entry.authorized) selectedIds.add(entry.checkin.id)
      }

      setMatched({ group, selectedIds, queueEntries })
    } catch {
      setError('Lookup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function toggleChild(checkinId: string) {
    if (!matched) return
    const next = new Set(matched.selectedIds)
    if (next.has(checkinId)) next.delete(checkinId)
    else next.add(checkinId)
    setMatched({ ...matched, selectedIds: next })
  }

  async function handleConfirmCheckout() {
    if (!matched) return
    setLoading(true)
    setError(null)
    try {
      const { group, selectedIds, queueEntries } = matched
      const session = await getOpenSession()

      // Collect all checkins to process
      const allEntries = [
        { checkin: group.primary.checkin, childName: group.primary.childName, room: group.primary.room },
        ...group.additional.map(a => ({ checkin: a.checkin, childName: a.childName, room: a.room })),
      ]

      const checkedOutNames: string[] = []

      for (const entry of allEntries) {
        if (!selectedIds.has(entry.checkin.id)) continue

        await performCheckout(entry.checkin.id, staffPersonId)

        // Add additional children to lobby display before clearing
        if (entry.checkin.id !== group.primary.checkin.id && session && !queueEntries.has(entry.checkin.id)) {
          try {
            const queueEntry = await addToPickupQueue({
              session_id: session.id,
              checkin_id: entry.checkin.id,
              child_name: entry.childName,
              room: entry.room,
              pickup_code: code.trim(),
            })
            queueEntries.set(entry.checkin.id, queueEntry.id)
          } catch (err) {
            console.error('Failed to add to pickup queue:', err)
          }
        }

        // Clear from lobby display
        const queueEntryId = queueEntries.get(entry.checkin.id)
        if (queueEntryId) {
          try {
            await clearPickupEntry(queueEntryId)
          } catch (err) {
            console.error('Failed to clear pickup queue entry:', err)
          }
        }

        checkedOutNames.push(entry.childName)
      }

      const nameList = checkedOutNames.join(', ')
      setSuccess(
        checkedOutNames.length === 1
          ? `${nameList} has been checked out.`
          : `${nameList} have been checked out.`
      )
      setMatched(null)
      setCode('')
    } catch {
      setError('Checkout failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const isGrouped = matched && matched.group.additional.length > 0

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

      {/* ── Single-child checkout (no siblings checked in) ─── */}
      {matched && !isGrouped && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-amber-600 font-medium uppercase tracking-wide">Confirm pickup</div>
            <div className="font-semibold text-gray-900 mt-0.5">{matched.group.primary.childName}</div>
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

      {/* ── Grouped household checkout ─── */}
      {matched && isGrouped && (
        <div className="space-y-3">
          {/* Pickup notes — yellow warning */}
          {matched.group.pickupNotes && (
            <div className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex gap-2">
              <span className="flex-shrink-0">⚠️</span>
              <span><strong>Pickup note:</strong> {matched.group.pickupNotes}</span>
            </div>
          )}

          {/* Staff confirmation prompt */}
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            ⚠️ Please confirm you are checking out all authorized children for this adult. Uncheck any children not leaving with this adult before confirming.
          </div>

          {/* Child list */}
          <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
            {/* Primary child — always shown, always selectable */}
            <GroupedChild
              childName={matched.group.primary.childName}
              room={matched.group.primary.room}
              checked={matched.selectedIds.has(matched.group.primary.checkin.id)}
              authorized={true}
              isPrimary
              onChange={() => toggleChild(matched.group.primary.checkin.id)}
            />

            {/* Additional household children */}
            {matched.group.additional.map(entry => (
              <GroupedChild
                key={entry.checkin.id}
                childName={entry.childName}
                room={entry.room}
                checked={matched.selectedIds.has(entry.checkin.id)}
                authorized={entry.authorized}
                onChange={() => { if (entry.authorized) toggleChild(entry.checkin.id) }}
              />
            ))}
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="text-xs text-gray-500">
              {matched.selectedIds.size} of {1 + matched.group.additional.filter(a => a.authorized).length} authorized children selected
            </div>
            <button
              onClick={() => void handleConfirmCheckout()}
              disabled={loading || matched.selectedIds.size === 0}
              className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-40 transition-colors"
            >
              {loading ? <Spinner size="sm" /> : `Check Out ${matched.selectedIds.size > 1 ? `${matched.selectedIds.size} Children` : 'Child'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface GroupedChildProps {
  childName: string
  room: string
  checked: boolean
  authorized: boolean
  isPrimary?: boolean
  onChange: () => void
}

function GroupedChild({ childName, room, checked, authorized, isPrimary, onChange }: GroupedChildProps) {
  return (
    <label
      className={`flex items-center gap-3 px-4 py-3 ${authorized ? 'cursor-pointer hover:bg-gray-50' : 'opacity-50 cursor-not-allowed bg-gray-50'}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={!authorized}
        className="w-4 h-4 rounded accent-green-600 disabled:cursor-not-allowed"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{childName}</span>
          {isPrimary && (
            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Code match</span>
          )}
        </div>
        <div className="text-xs text-gray-500">{room}</div>
        {!authorized && (
          <div className="text-xs text-orange-600 mt-0.5">Not on authorization list for this adult</div>
        )}
      </div>
    </label>
  )
}
