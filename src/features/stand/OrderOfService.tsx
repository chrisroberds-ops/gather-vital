/**
 * /stand/plans/:planId — Order of service for a service plan.
 * Lists songs in order with title, key, and BPM.
 */

import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { db } from '@/services'
import { getSongsForPlan, getPdfAttachments } from './music-stand-service'
import {
  getActiveSession,
  createStandSession,
  joinSession,
  leaveSession,
  endSession,
  standBus,
} from './session-sync-service'
import type { ServicePlan, MusicStandSession } from '@/shared/types'
import type { PlanSongEntry } from './music-stand-service'

export default function OrderOfService() {
  const { planId } = useParams<{ planId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [plan, setPlan] = useState<ServicePlan | null>(null)
  const [songs, setSongs] = useState<PlanSongEntry[]>([])
  const [session, setSession] = useState<MusicStandSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionLoading, setSessionLoading] = useState(false)

  useEffect(() => {
    if (!planId) return
    Promise.all([
      db.getServicePlan(planId),
      getSongsForPlan(planId),
      getActiveSession(planId),
    ]).then(([p, s, sess]) => {
      setPlan(p)
      setSongs(s)
      setSession(sess)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [planId])

  // Listen for session events (someone started/ended a session)
  useEffect(() => {
    return standBus.subscribe(event => {
      if (event.type === 'session_started' && event.payload.plan_id === planId) {
        db.getMusicStandSession(event.session_id).then(s => setSession(s))
      }
      if (event.type === 'session_ended' && session?.id === event.session_id) {
        setSession(prev => prev ? { ...prev, is_active: false } : null)
      }
    })
  }, [planId, session?.id])

  const isLeader = user?.tier !== undefined && user.tier >= 3 // Staff+

  async function handleStartSession() {
    if (!planId || !user?.personId) return
    setSessionLoading(true)
    try {
      const sess = await createStandSession(planId, user.personId)
      setSession(sess)
    } finally {
      setSessionLoading(false)
    }
  }

  async function handleJoinSession() {
    if (!session || !user?.personId) return
    setSessionLoading(true)
    try {
      const updated = await joinSession(session.id, user.personId)
      setSession(updated)
    } finally {
      setSessionLoading(false)
    }
  }

  async function handleLeaveSession() {
    if (!session || !user?.personId) return
    setSessionLoading(true)
    try {
      const updated = await leaveSession(session.id, user.personId)
      setSession(updated)
    } finally {
      setSessionLoading(false)
    }
  }

  const handleEndSession = useCallback(async () => {
    if (!session) return
    setSessionLoading(true)
    try {
      const updated = await endSession(session.id)
      setSession(updated)
    } finally {
      setSessionLoading(false)
    }
  }, [session])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <p className="text-gray-400">Service plan not found.</p>
      </div>
    )
  }

  const userIsJoined = session?.joined_person_ids.includes(user?.personId ?? '') ?? false
  const sessionMemberCount = (session?.joined_person_ids.length ?? 0)

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 pt-safe pt-6 pb-4 border-b border-gray-800">
        <button
          onClick={() => navigate('/stand')}
          className="text-gray-400 hover:text-white text-2xl leading-none"
          aria-label="Back"
        >
          ‹
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-white truncate">{plan.name}</h1>
          <p className="text-gray-400 text-xs">
            {new Date(plan.service_date + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
            })}
          </p>
        </div>
      </header>

      {/* Session banner */}
      {session?.is_active && (
        <div className="bg-indigo-900/60 border-b border-indigo-700 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-indigo-300 text-sm font-medium">
                🔴 Live Session — {sessionMemberCount} musician{sessionMemberCount !== 1 ? 's' : ''} joined
              </p>
              <p className="text-indigo-400 text-xs mt-0.5">
                {isLeader ? 'You are leading this session' : 'Leader is controlling page turns'}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              {!isLeader && !userIsJoined && (
                <button
                  onClick={handleJoinSession}
                  disabled={sessionLoading}
                  className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  Join
                </button>
              )}
              {!isLeader && userIsJoined && (
                <button
                  onClick={handleLeaveSession}
                  disabled={sessionLoading}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  Leave
                </button>
              )}
              {isLeader && (
                <button
                  onClick={handleEndSession}
                  disabled={sessionLoading}
                  className="text-xs bg-red-800 hover:bg-red-700 text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  End Session
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Start session CTA (for leaders only, when no active session) */}
      {isLeader && !session?.is_active && (
        <div className="px-4 py-3 border-b border-gray-800">
          <button
            onClick={handleStartSession}
            disabled={sessionLoading}
            className="w-full text-sm bg-indigo-700 hover:bg-indigo-600 text-white rounded-xl py-2.5 font-medium disabled:opacity-50 transition-colors"
          >
            {sessionLoading ? 'Starting…' : '▶ Start Synchronized Session'}
          </button>
        </div>
      )}

      {/* Song list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full">
        {songs.length === 0 && (
          <p className="text-gray-500 text-center mt-16">No songs in this service plan.</p>
        )}
        <ul className="space-y-3">
          {songs.map(({ item, song }, idx) => {
            const pdfs = getPdfAttachments(song)
            const hasPdf = pdfs.length > 0
            const hasMp3 = !!song.demo_url

            return (
              <li key={item.id}>
                <button
                  onClick={() => navigate(`/stand/plans/${planId}/songs/${song.id}`)}
                  className="w-full text-left bg-gray-900 border border-gray-800 rounded-2xl px-5 py-4 hover:bg-gray-800 active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-gray-600 text-sm font-mono w-6 text-right shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white text-base">{song.title}</p>
                      <div className="flex items-center gap-3 mt-1 text-gray-400 text-sm">
                        {song.key && (
                          <span className="bg-gray-800 rounded px-1.5 py-0.5 text-xs font-medium">
                            {song.key}
                          </span>
                        )}
                        {song.bpm && (
                          <span className="text-xs">♩ {song.bpm} BPM</span>
                        )}
                        {song.artist && (
                          <span className="text-xs text-gray-500 truncate">{song.artist}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {hasMp3 && <span title="Audio available" className="text-green-500 text-sm">♪</span>}
                      {hasPdf && <span title="Sheet music available" className="text-blue-400 text-sm">📄</span>}
                      <span className="text-gray-600">›</span>
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
