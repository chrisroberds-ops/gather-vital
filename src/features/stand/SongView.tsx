/**
 * /stand/plans/:planId/songs/:songId — full-screen song view.
 *
 * Features:
 * - PDF viewer with all attachments selectable
 * - Audio player (if demo MP3 attached)
 * - Integrated metronome (BPM from song library)
 * - Annotation tools
 * - Dark mode toggle
 * - Song navigation drawer (swipe up/down or list)
 * - Synchronized page turns via standBus
 * - Foot pedal support (arrow keys)
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { db } from '@/services'
import {
  getSongsForPlan,
  getPdfAttachments,
} from './music-stand-service'
import {
  getActiveSession,
  emitPageTurn,
  emitSongChange,
  standBus,
} from './session-sync-service'
import PdfViewer from './PdfViewer'
import AudioPlayer from './AudioPlayer'
import Metronome from './Metronome'
import type { Song, MusicStandSession } from '@/shared/types'
import type { PlanSongEntry, PdfAttachment } from './music-stand-service'

export default function SongView() {
  const { planId, songId } = useParams<{ planId: string; songId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [songs, setSongs] = useState<PlanSongEntry[]>([])
  const [song, setSong] = useState<Song | null>(null)
  const [pdfs, setPdfs] = useState<PdfAttachment[]>([])
  const [activePdfIdx, setActivePdfIdx] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [session, setSession] = useState<MusicStandSession | null>(null)
  const [darkMode, setDarkMode] = useState(false)
  const [showAudio, setShowAudio] = useState(false)
  const [showMetronome, setShowMetronome] = useState(false)
  const [showAnnotations, setShowAnnotations] = useState(false)
  const [showSongList, setShowSongList] = useState(false)
  const [landscape, setLandscape] = useState(false)
  const [loading, setLoading] = useState(true)
  // Text chord chart view — active when no PDF exists, or toggled when both exist
  const [showTextView, setShowTextView] = useState(false)
  const [textZoom, setTextZoom] = useState(1.0)

  // Touch tracking for vertical swipe (song navigation)
  const touchStartY = useRef<number | null>(null)

  const currentSongIdx = songs.findIndex(e => e.song.id === songId)
  const isLeader = (user?.tier ?? 0) >= 3 // Staff+
  const isInSession = session?.is_active &&
    (session.leader_person_id === user?.personId ||
     session.joined_person_ids.includes(user?.personId ?? ''))

  // Load data
  useEffect(() => {
    if (!planId || !songId) return
    Promise.all([
      getSongsForPlan(planId),
      db.getSong(songId),
      getActiveSession(planId),
    ]).then(([planSongs, s, sess]) => {
      setSongs(planSongs)
      if (s) {
        setSong(s)
        const attachments = getPdfAttachments(s)
        console.log('[SongView] PDF attachments for', s.title, {
          chord_chart_url: s.chord_chart_url,
          pdf_urls: s.pdf_urls,
          chord_chart_text: s.chord_chart_text ? `${s.chord_chart_text.slice(0, 80)}…` : undefined,
          attachments,
        })
        setPdfs(attachments)
        // Default to text view when no PDF exists but chord chart text is present
        setShowTextView(attachments.length === 0 && !!s.chord_chart_text)
      }
      setSession(sess)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [planId, songId])

  // Listen for landscape orientation
  useEffect(() => {
    function checkOrientation() {
      setLandscape(window.innerWidth > window.innerHeight)
    }
    checkOrientation()
    window.addEventListener('resize', checkOrientation)
    return () => window.removeEventListener('resize', checkOrientation)
  }, [])

  // Subscribe to session events (page turns from leader)
  useEffect(() => {
    return standBus.subscribe(event => {
      if (!isInSession || !session) return
      if (event.session_id !== session.id) return

      if (event.type === 'page_turned') {
        const page = event.payload.page as number
        setCurrentPage(page)
      }
      if (event.type === 'song_changed') {
        const newSongId = event.payload.song_id as string
        const page = (event.payload.page as number) ?? 0
        if (newSongId !== songId) {
          navigate(`/stand/plans/${planId}/songs/${newSongId}`, { replace: true })
        } else {
          setCurrentPage(page)
        }
      }
    })
  }, [isInSession, session, songId, planId, navigate])

  // Page change handler — emits to session if leader
  const handlePageChange = useCallback(async (page: number) => {
    setCurrentPage(page)
    if (isLeader && session?.is_active) {
      await emitPageTurn(session.id, page)
    }
  }, [isLeader, session])

  // Navigate to adjacent song
  async function navigateToSong(idx: number) {
    if (idx < 0 || idx >= songs.length) return
    const nextSong = songs[idx].song
    if (isLeader && session?.is_active) {
      await emitSongChange(session.id, nextSong.id, 0)
    }
    navigate(`/stand/plans/${planId}/songs/${nextSong.id}`)
  }

  // Vertical swipe for song navigation
  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartY.current === null) return
    const dy = e.changedTouches[0].clientY - touchStartY.current
    touchStartY.current = null
    if (Math.abs(dy) > 100) {
      if (dy < 0) navigateToSong(currentSongIdx + 1) // swipe up = next
      else navigateToSong(currentSongIdx - 1)         // swipe down = prev
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!song) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <p className="text-gray-400">Song not found.</p>
      </div>
    )
  }

  const activePdf = pdfs[activePdfIdx]
  const bgClass = darkMode ? 'bg-black' : 'bg-gray-950'
  const chromeOpacity = darkMode ? 'opacity-40' : 'opacity-100'
  const hasChordText = !!song.chord_chart_text
  const hasPdfs = pdfs.length > 0
  // When both exist, showTextView toggles between them; when only text, always text
  const useTextView = showTextView || (!hasPdfs && hasChordText)

  return (
    <div
      className={`min-h-screen ${bgClass} flex flex-col`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Top chrome */}
      <header className={`${chromeOpacity} transition-opacity flex items-center gap-2 px-3 pt-safe pt-4 pb-2 border-b border-gray-800`}>
        <button
          onClick={() => navigate(`/stand/plans/${planId}`)}
          className="text-gray-400 hover:text-white text-xl"
          aria-label="Back to plan"
        >
          ‹
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">{song.title}</p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {song.key && <span>{song.key}</span>}
            {song.bpm && <span>♩{song.bpm}</span>}
            {song.artist && <span>{song.artist}</span>}
          </div>
        </div>

        {/* Toolbar icons */}
        <div className="flex items-center gap-1">
          {/* PDF selector (only when multiple PDFs and showing PDF view) */}
          {pdfs.length > 1 && !useTextView && (
            <select
              value={activePdfIdx}
              onChange={e => { setActivePdfIdx(Number(e.target.value)); setCurrentPage(0) }}
              className="text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded px-1 py-0.5"
            >
              {pdfs.map((pdf, i) => (
                <option key={i} value={i}>{pdf.label}</option>
              ))}
            </select>
          )}

          {/* Text/PDF toggle — only when both are available */}
          {hasPdfs && hasChordText && (
            <ToolButton
              active={useTextView}
              onClick={() => setShowTextView(v => !v)}
              label="T"
              title={useTextView ? 'Switch to PDF view' : 'Switch to text view'}
            />
          )}

          {/* Text zoom controls — only in text view */}
          {useTextView && (
            <>
              <ToolButton
                active={false}
                onClick={() => setTextZoom(z => Math.min(z + 0.2, 2.4))}
                label="A+"
                title="Larger text"
              />
              <ToolButton
                active={false}
                onClick={() => setTextZoom(z => Math.max(z - 0.2, 0.6))}
                label="A−"
                title="Smaller text"
              />
            </>
          )}

          <ToolButton
            active={showAnnotations}
            onClick={() => setShowAnnotations(a => !a)}
            label="✏"
            title="Annotations"
          />
          {song.demo_url && (
            <ToolButton
              active={showAudio}
              onClick={() => setShowAudio(a => !a)}
              label="♪"
              title="Audio player"
            />
          )}
          {song.bpm && (
            <ToolButton
              active={showMetronome}
              onClick={() => setShowMetronome(m => !m)}
              label="♩"
              title="Metronome"
            />
          )}
          <ToolButton
            active={darkMode}
            onClick={() => setDarkMode(d => !d)}
            label="◑"
            title="Dark mode"
          />
          <ToolButton
            active={showSongList}
            onClick={() => setShowSongList(l => !l)}
            label="☰"
            title="Song list"
          />
        </div>
      </header>

      {/* Session badge */}
      {session?.is_active && isInSession && (
        <div className={`${chromeOpacity} flex items-center gap-1.5 px-4 py-1.5 bg-indigo-900/50 border-b border-indigo-800`}>
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-indigo-300 text-xs">
            {isLeader ? 'Leading session' : 'Synced to leader'}
          </span>
        </div>
      )}

      {/* Metronome panel */}
      {showMetronome && song.bpm && (
        <div className={`${chromeOpacity} transition-opacity px-4 py-3 bg-gray-900 border-b border-gray-800`}>
          <Metronome bpm={song.bpm} />
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0">
        {useTextView && song.chord_chart_text ? (
          <ChordChartTextView
            text={song.chord_chart_text}
            zoom={textZoom}
            darkMode={darkMode}
            hasPdf={hasPdfs}
          />
        ) : activePdf ? (
          <PdfViewer
            pdfUrl={activePdf.url}
            currentPage={currentPage}
            onPageChange={handlePageChange}
            userId={user?.uid ?? 'anon'}
            songId={song.id}
            darkMode={darkMode}
            landscape={landscape}
            showAnnotations={showAnnotations}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <p className="text-4xl mb-3">📄</p>
              <p>No PDF attached to this song.</p>
            </div>
          </div>
        )}
      </div>

      {/* Audio player panel */}
      {showAudio && song.demo_url && (
        <div className={`${chromeOpacity} transition-opacity px-4 py-3 border-t border-gray-800`}>
          <AudioPlayer src={song.demo_url} title={song.title} />
        </div>
      )}

      {/* Song list drawer */}
      {showSongList && (
        <div className="absolute inset-y-0 right-0 w-72 bg-gray-900 border-l border-gray-800 z-40 flex flex-col shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <h3 className="text-white font-semibold text-sm">Songs</h3>
            <button onClick={() => setShowSongList(false)} className="text-gray-400 hover:text-white">✕</button>
          </div>
          <ul className="flex-1 overflow-y-auto py-2">
            {songs.map(({ song: s, item }, idx) => (
              <li key={item.id}>
                <button
                  onClick={() => { navigateToSong(idx); setShowSongList(false) }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-800 transition-colors ${
                    s.id === songId ? 'bg-gray-800 border-l-2 border-white' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-xs w-4">{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{s.title}</p>
                      <div className="flex gap-2 text-xs text-gray-500">
                        {s.key && <span>{s.key}</span>}
                        {s.bpm && <span>♩{s.bpm}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Navigation arrows (prev/next song) */}
      <div className={`${chromeOpacity} transition-opacity flex items-center justify-between px-4 py-3 border-t border-gray-800`}>
        <button
          onClick={() => navigateToSong(currentSongIdx - 1)}
          disabled={currentSongIdx <= 0}
          className="text-sm text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
        >
          ← Prev song
        </button>
        <span className="text-gray-600 text-xs">
          {currentSongIdx + 1} / {songs.length}
        </span>
        <button
          onClick={() => navigateToSong(currentSongIdx + 1)}
          disabled={currentSongIdx >= songs.length - 1}
          className="text-sm text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
        >
          Next song →
        </button>
      </div>
    </div>
  )
}

// ── Chord chart text view ─────────────────────────────────────────────────────

function ChordChartTextView({
  text,
  zoom,
  darkMode,
  hasPdf,
}: {
  text: string
  zoom: number
  darkMode: boolean
  hasPdf: boolean
}) {
  const textColor = darkMode ? 'text-gray-100' : 'text-gray-100'
  const bgColor   = darkMode ? 'bg-black'      : 'bg-gray-950'
  const bannerBg  = darkMode ? 'bg-gray-900'   : 'bg-gray-900'

  return (
    <div className={`flex-1 flex flex-col min-h-0 ${bgColor}`}>
      {/* Indicator banner */}
      <div className={`${bannerBg} border-b border-gray-800 px-4 py-1.5 flex items-center gap-2`}>
        <span className="text-xs text-gray-400">
          Text chord chart
          {!hasPdf && (
            <span className="text-gray-600 ml-1">— upload a PDF for annotation support</span>
          )}
        </span>
      </div>

      {/* Scrollable chord chart */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <pre
          className={`${textColor} whitespace-pre-wrap font-mono leading-relaxed`}
          style={{ fontSize: `${Math.round(18 * zoom)}px` }}
        >
          {text}
        </pre>
      </div>
    </div>
  )
}

// ── Tool button ───────────────────────────────────────────────────────────────

function ToolButton({
  active,
  onClick,
  label,
  title,
}: {
  active: boolean
  onClick: () => void
  label: string
  title: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-colors ${
        active ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white hover:bg-gray-800'
      }`}
    >
      {label}
    </button>
  )
}
