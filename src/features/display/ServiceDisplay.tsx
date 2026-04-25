/**
 * /display/service — read-only stage confidence monitor.
 *
 * Designed to run on a TV or monitor at the back of the stage so the entire
 * worship team can see what song is currently active without needing their own
 * device. No auth required — it is a passive display screen.
 *
 * Data sources (in priority order):
 *  1. BroadcastChannel events from standBus (real-time, same-browser)
 *  2. 5-second polling via getAnyActiveSession (cross-device / page-refresh recovery)
 *
 * States:
 *  - "waiting" — no active MusicStandSession found
 *  - "live"    — session is active; shows current song + upcoming song
 *  - "ended"   — session just ended (brief banner, then reverts to waiting)
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { db } from '@/services'
import { getAnyActiveSession, standBus } from '@/features/stand/session-sync-service'
import { getSongsForPlan } from '@/features/stand/music-stand-service'
import type { Song, ServicePlan, MusicStandSession } from '@/shared/types'
import type { PlanSongEntry } from '@/features/stand/music-stand-service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DisplayState {
  session: MusicStandSession
  plan: ServicePlan
  songs: PlanSongEntry[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WaitingScreen({ planName }: { planName?: string }) {
  const [dots, setDots] = useState('')
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 700)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <div className="text-6xl mb-6 opacity-40">🎵</div>
      <h2 className="text-3xl font-light text-gray-400 tracking-wide">
        Waiting for service to begin{dots}
      </h2>
      {planName && (
        <p className="text-gray-600 text-lg mt-4">{planName}</p>
      )}
      <p className="text-gray-700 text-sm mt-8">
        This display will update automatically when a live session starts.
      </p>
    </div>
  )
}

interface SongCardProps {
  song: Song
  index: number
  total: number
  label?: string
  dim?: boolean
}

function SongCard({ song, index, total, label, dim = false }: SongCardProps) {
  return (
    <div className={`transition-opacity ${dim ? 'opacity-40' : 'opacity-100'}`}>
      {label && (
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 mb-2">
          {label}
        </p>
      )}
      <div className="flex items-baseline gap-4 min-w-0">
        <span className="text-gray-700 text-2xl font-mono shrink-0">{index + 1}</span>
        <div className="min-w-0">
          <h2 className={`font-bold leading-tight tracking-tight truncate ${
            dim ? 'text-3xl text-gray-400' : 'text-6xl text-white'
          }`}>
            {song.title}
          </h2>
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            {song.key && (
              <span className={`font-mono font-semibold ${dim ? 'text-gray-500 text-lg' : 'text-gray-300 text-2xl'}`}>
                {song.key}
              </span>
            )}
            {song.bpm && (
              <span className={`${dim ? 'text-gray-600 text-base' : 'text-gray-400 text-xl'}`}>
                ♩ {song.bpm} BPM
              </span>
            )}
            {song.artist && (
              <span className={`truncate ${dim ? 'text-gray-600 text-base' : 'text-gray-500 text-lg'}`}>
                {song.artist}
              </span>
            )}
          </div>
        </div>
        <span className={`ml-auto shrink-0 text-sm ${dim ? 'text-gray-700' : 'text-gray-600'}`}>
          {index + 1} / {total}
        </span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ServiceDisplay() {
  const [state, setState] = useState<DisplayState | null>(null)
  const [currentSong, setCurrentSong] = useState<Song | null>(null)
  const [justEnded, setJustEnded] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Derive the current and next song from session + songs list
  const songs = state?.songs ?? []
  const currentIdx = currentSong
    ? songs.findIndex(e => e.song.id === currentSong.id)
    : -1
  const nextEntry = currentIdx >= 0 && currentIdx < songs.length - 1
    ? songs[currentIdx + 1]
    : null

  // Load full display state for a session
  const loadSessionState = useCallback(async (
    session: MusicStandSession,
    planId: string
  ) => {
    const [plan, songEntries] = await Promise.all([
      db.getServicePlan(planId),
      getSongsForPlan(planId),
    ])
    if (!plan) return

    setState({ session, plan, songs: songEntries })

    // Resolve current song from session state
    if (session.current_song_id) {
      const song = await db.getSong(session.current_song_id)
      setCurrentSong(song)
    } else if (songEntries.length > 0) {
      // Session started but no song selected yet — show first song as "ready"
      setCurrentSong(songEntries[0].song)
    } else {
      setCurrentSong(null)
    }
  }, [])

  // Scan for any active session
  const pollForSession = useCallback(async () => {
    const result = await getAnyActiveSession()
    if (result) {
      setJustEnded(false)
      await loadSessionState(result.session, result.planId)
    } else if (!state) {
      // No session and no state — stay in waiting mode
      setState(null)
    }
  }, [state, loadSessionState])

  // Initial load + polling
  useEffect(() => {
    void pollForSession()
    pollRef.current = setInterval(() => void pollForSession(), 5000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Subscribe to standBus events
  useEffect(() => {
    return standBus.subscribe(async event => {
      if (event.type === 'session_started') {
        setJustEnded(false)
        // Load the new session
        const result = await getAnyActiveSession()
        if (result) await loadSessionState(result.session, result.planId)
      }

      if (event.type === 'session_ended') {
        setState(prev => prev
          ? { ...prev, session: { ...prev.session, is_active: false } }
          : null
        )
        setJustEnded(true)
        setCurrentSong(null)
        setTimeout(() => setJustEnded(false), 8000)
      }

      if (event.type === 'song_changed') {
        const songId = event.payload.song_id as string
        const song = await db.getSong(songId)
        setCurrentSong(song)
        // Also update the session's current_song_id in local state
        setState(prev => prev
          ? { ...prev, session: { ...prev.session, current_song_id: songId } }
          : null
        )
      }

      // page_turned: page changes don't affect this display — we show song info only
    })
  }, [loadSessionState])

  const isLive = state?.session.is_active === true
  const memberCount = (state?.session.joined_person_ids.length ?? 0) + (state?.session ? 1 : 0) // +1 for leader

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col select-none">
      {/* Header bar */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-gray-900">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎵</span>
          <div>
            <p className="text-white font-semibold text-sm">
              {state?.plan.name ?? 'Service Display'}
            </p>
            {state?.plan.service_date && (
              <p className="text-gray-500 text-xs">{formatDate(state.plan.service_date)}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {justEnded && (
            <span className="text-amber-400 text-sm font-medium animate-pulse">
              Session ended
            </span>
          )}
          {isLive && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-400 text-sm font-medium uppercase tracking-wider">
                Live
              </span>
              <span className="text-gray-600 text-sm">
                · {memberCount} musician{memberCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          {!isLive && !justEnded && (
            <span className="text-gray-700 text-sm">Standby</span>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col justify-center px-12 py-8">
        {!isLive && !justEnded ? (
          <WaitingScreen planName={state?.plan.name} />
        ) : currentSong ? (
          <>
            {/* Current song — large */}
            <div className="mb-12">
              <SongCard
                song={currentSong}
                index={currentIdx >= 0 ? currentIdx : 0}
                total={songs.length}
                label="Now"
              />
            </div>

            {/* Divider */}
            <div className="border-t border-gray-800 mb-10" />

            {/* Up next */}
            {nextEntry ? (
              <SongCard
                song={nextEntry.song}
                index={currentIdx + 1}
                total={songs.length}
                label="Up next"
                dim
              />
            ) : (
              <p className="text-gray-700 text-sm uppercase tracking-widest">
                Last song
              </p>
            )}
          </>
        ) : isLive ? (
          // Live session but no song selected yet
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <p className="text-gray-500 text-2xl">Session active</p>
            <p className="text-gray-700 text-base mt-2">
              Waiting for worship leader to select a song…
            </p>
          </div>
        ) : (
          <WaitingScreen />
        )}
      </main>

      {/* Song list strip */}
      {isLive && songs.length > 0 && (
        <footer className="border-t border-gray-900 px-8 py-3">
          <div className="flex items-center gap-1 overflow-x-hidden">
            {songs.map(({ song, item }, idx) => {
              const isCurrent = song.id === currentSong?.id
              const isPast = currentIdx >= 0 && idx < currentIdx
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors ${
                    isCurrent
                      ? 'bg-white text-gray-900'
                      : isPast
                      ? 'text-gray-700'
                      : 'text-gray-500'
                  }`}
                >
                  <span className="text-gray-500 font-mono">{idx + 1}</span>
                  <span className="max-w-[8rem] truncate">{song.title}</span>
                </div>
              )
            })}
          </div>
        </footer>
      )}
    </div>
  )
}
