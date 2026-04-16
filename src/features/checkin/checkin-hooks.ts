import { useState, useEffect, useCallback } from 'react'
import { db } from '@/services'
import { checkinBus } from '@/services/checkin-event-bus'
import type { Checkin, CheckinSession, CheckinFlag, Person } from '@/shared/types'
import { getOpenSession, getSessionCheckins, getPersonCrossTab } from './checkin-service'

// ── useActiveSession ──────────────────────────────────────────────────────────

export function useActiveSession() {
  const [session, setSession] = useState<CheckinSession | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const s = await getOpenSession()
    setSession(s)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const unsub = checkinBus.subscribe(event => {
      if (event.type === 'session_created' || event.type === 'session_updated') {
        refresh()
      }
    })
    // Belt-and-suspenders: storage events fire in other tabs when localStorage
    // changes, catching the case where BroadcastChannel isn't available.
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'gather_open_session') refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      unsub()
      window.removeEventListener('storage', onStorage)
    }
  }, [refresh])

  return { session, loading, refresh }
}

// ── useLiveCheckins ───────────────────────────────────────────────────────────

export interface CheckinRow {
  checkin: Checkin
  child: Person | null
  flags: CheckinFlag[]
}

export function useLiveCheckins(sessionId: string | null) {
  const [rows, setRows] = useState<CheckinRow[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!sessionId) { setRows([]); setLoading(false); return }
    // getSessionCheckins reads from localStorage — works across tabs
    const checkins = await getSessionCheckins(sessionId)
    const enriched = await Promise.all(
      checkins.map(async checkin => {
        const [child, flags] = await Promise.all([
          getPersonCrossTab(checkin.child_id),
          db.getCheckinFlagsForPerson(checkin.child_id),
        ])
        return { checkin, child, flags: flags.filter(f => f.is_active) }
      }),
    )
    setRows(enriched)
    setLoading(false)
  }, [sessionId])

  useEffect(() => {
    setLoading(true)
    refresh()
    const unsub = checkinBus.subscribe(event => {
      if (event.type === 'checkin_created' || event.type === 'checkin_updated') {
        refresh()
      }
    })
    // Storage events fire in other tabs when localStorage changes
    const onStorage = (e: StorageEvent) => {
      if (sessionId && e.key === `gather_checkins_${sessionId}`) refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      unsub()
      window.removeEventListener('storage', onStorage)
    }
  }, [refresh, sessionId])

  return { rows, loading, refresh }
}

// ── useKioskId ────────────────────────────────────────────────────────────────

const KIOSK_ID_KEY = 'gather_kiosk_id'

export function useKioskId() {
  const [kioskId, setKioskIdState] = useState<string | null>(
    () => localStorage.getItem(KIOSK_ID_KEY),
  )

  const setKioskId = useCallback((id: string) => {
    localStorage.setItem(KIOSK_ID_KEY, id)
    setKioskIdState(id)
  }, [])

  const clearKioskId = useCallback(() => {
    localStorage.removeItem(KIOSK_ID_KEY)
    setKioskIdState(null)
  }, [])

  return { kioskId, setKioskId, clearKioskId }
}
