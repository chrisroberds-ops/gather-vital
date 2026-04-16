/**
 * PDF viewer for Music Stand.
 *
 * Features:
 * - Page navigation: swipe, tap edges, keyboard arrows, foot pedal (arrow keys)
 * - Two-page side-by-side in landscape orientation
 * - Pinch-to-zoom with level saved per PDF per user
 * - Page reordering saved per user
 * - Annotation overlay (highlight, pen, text)
 * - Dark mode toggle
 *
 * In TEST_MODE we render the PDF URL in an iframe as there is no PDF.js bundle.
 * A real production build would use react-pdf or a similar library.
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react'
import { savePdfPreferences, getPdfPreferences, getAnnotationsForSong } from './music-stand-service'
import type { MusicStandAnnotation, UserPdfPreferences } from '@/shared/types'

export interface PdfViewerProps {
  /** URL of the PDF to display */
  pdfUrl: string
  /** Total number of pages (unknown until PDF loads — defaults to 1) */
  pageCount?: number
  /** Current page controlled externally (0-based) */
  currentPage: number
  onPageChange: (page: number) => void
  userId: string
  songId: string
  darkMode?: boolean
  landscape?: boolean
  /** Show annotation tools */
  showAnnotations?: boolean
  otherUserAnnotations?: MusicStandAnnotation[]
}

const ANNOTATION_COLORS = ['#FACC15', '#FB923C', '#4ADE80', '#60A5FA', '#F472B6']

export default function PdfViewer({
  pdfUrl,
  pageCount = 1,
  currentPage,
  onPageChange,
  userId,
  songId,
  darkMode = false,
  landscape = false,
  showAnnotations = false,
  otherUserAnnotations = [],
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [prefs, setPrefs] = useState<UserPdfPreferences | null>(null)
  const [annotations, setAnnotations] = useState<MusicStandAnnotation[]>([])
  const [activeTool, setActiveTool] = useState<'highlighter' | 'pen' | 'text' | null>(null)
  const [activeColor, setActiveColor] = useState(ANNOTATION_COLORS[0])
  const [zoomLevel, setZoomLevel] = useState(1)
  const [pageOrder, setPageOrder] = useState<number[]>([])

  // Touch tracking for swipe and pinch
  const touchStartX = useRef<number | null>(null)
  const lastTouchDist = useRef<number | null>(null)

  // Load preferences and annotations
  useEffect(() => {
    getPdfPreferences(userId, pdfUrl).then(p => {
      if (p) {
        setPrefs(p)
        setZoomLevel(p.zoom_level)
        setPageOrder(p.page_order)
      }
    })
    getAnnotationsForSong(userId, songId, pdfUrl).then(setAnnotations)
  }, [userId, songId, pdfUrl])

  // Keyboard / foot-pedal navigation (arrow keys)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        onPageChange(Math.min(currentPage + 1, effectivePageCount - 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        onPageChange(Math.max(currentPage - 1, 0))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [currentPage, onPageChange, pageCount])

  // Resolve effective page order
  const effectivePageCount = pageCount
  const orderedPages = pageOrder.length === pageCount
    ? pageOrder
    : Array.from({ length: pageCount }, (_, i) => i)

  // The physical page for the current logical position
  const physicalPage = orderedPages[currentPage] ?? currentPage

  // Save zoom preference with debounce
  const saveZoom = useCallback(async (zoom: number) => {
    await savePdfPreferences(userId, pdfUrl, { zoom_level: zoom, page_order: pageOrder })
  }, [userId, pdfUrl, pageOrder])

  // Touch handlers
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX
      lastTouchDist.current = null
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      lastTouchDist.current = Math.hypot(dx, dy)
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current !== null && e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - touchStartX.current
      if (Math.abs(dx) > 60) {
        if (dx < 0) onPageChange(Math.min(currentPage + 1, effectivePageCount - 1))
        else onPageChange(Math.max(currentPage - 1, 0))
      }
      touchStartX.current = null
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && lastTouchDist.current !== null) {
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      const dist = Math.hypot(dx, dy)
      const scale = dist / lastTouchDist.current
      const newZoom = Math.max(0.5, Math.min(4, zoomLevel * scale))
      setZoomLevel(newZoom)
      lastTouchDist.current = dist
      saveZoom(newZoom)
    }
  }

  // Edge tap navigation
  function onContainerClick(e: React.MouseEvent) {
    if (activeTool) return // Don't navigate while annotating
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const third = rect.width / 3
    if (x < third) onPageChange(Math.max(currentPage - 1, 0))
    else if (x > third * 2) onPageChange(Math.min(currentPage + 1, effectivePageCount - 1))
  }

  // Page reorder
  function movePage(fromIdx: number, toIdx: number) {
    const newOrder = [...orderedPages]
    const [moved] = newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, moved)
    setPageOrder(newOrder)
    savePdfPreferences(userId, pdfUrl, { zoom_level: zoomLevel, page_order: newOrder })
  }

  // Landscape: show two pages side-by-side
  const showTwoPages = landscape && effectivePageCount > 1
  const rightPage = showTwoPages ? orderedPages[Math.min(currentPage + 1, effectivePageCount - 1)] : null

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-100'
  const filterStyle = darkMode ? { filter: 'invert(1) hue-rotate(180deg)' } : {}

  return (
    <div className={`flex flex-col h-full ${bgClass}`}>
      {/* Annotation toolbar */}
      {showAnnotations && (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700">
          {(['highlighter', 'pen', 'text'] as const).map(tool => (
            <button
              key={tool}
              onClick={() => setActiveTool(t => t === tool ? null : tool)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                activeTool === tool
                  ? 'bg-white text-gray-900'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tool === 'highlighter' ? '🖊 Highlight' : tool === 'pen' ? '✏ Draw' : 'T Text'}
            </button>
          ))}
          {activeTool && (
            <div className="flex items-center gap-1 ml-2">
              {ANNOTATION_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setActiveColor(c)}
                  className={`w-5 h-5 rounded-full transition-transform ${activeColor === c ? 'scale-125' : ''}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          )}
          <span className="ml-auto text-xs text-gray-500">
            {annotations.filter(a => a.page_number === physicalPage).length} annotation(s)
          </span>
        </div>
      )}

      {/* PDF display area */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden relative select-none"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchMove={onTouchMove}
        onClick={onContainerClick}
      >
        {/* Left edge tap zone indicator */}
        <div className="absolute left-0 top-0 bottom-0 w-1/5 opacity-0 z-10" />
        {/* Right edge tap zone indicator */}
        <div className="absolute right-0 top-0 bottom-0 w-1/5 opacity-0 z-10" />

        <div
          className={`flex gap-2 ${showTwoPages ? 'w-full' : ''}`}
          style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
        >
          {/* Primary page */}
          <PageFrame
            pdfUrl={pdfUrl}
            page={physicalPage}
            style={filterStyle}
            className={showTwoPages ? 'flex-1' : 'w-full max-w-2xl mx-auto'}
          />

          {/* Second page (landscape mode) */}
          {rightPage !== null && (
            <PageFrame
              pdfUrl={pdfUrl}
              page={rightPage}
              style={filterStyle}
              className="flex-1"
            />
          )}
        </div>

        {/* Annotation overlays for current page */}
        {annotations
          .filter(a => a.page_number === physicalPage)
          .map(a => (
            <AnnotationOverlay key={a.id} annotation={a} />
          ))
        }
        {otherUserAnnotations
          .filter(a => a.page_number === physicalPage)
          .map(a => (
            <AnnotationOverlay key={a.id} annotation={a} dimmed />
          ))
        }
      </div>

      {/* Page navigation bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-t border-gray-800">
        <button
          onClick={() => onPageChange(Math.max(currentPage - 1, 0))}
          disabled={currentPage === 0}
          className="text-white text-2xl px-3 disabled:opacity-30"
          aria-label="Previous page"
        >
          ‹
        </button>

        <div className="flex items-center gap-1">
          {Array.from({ length: effectivePageCount }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => onPageChange(idx)}
              className={`w-2 h-2 rounded-full transition-colors ${
                idx === currentPage ? 'bg-white' : 'bg-gray-600 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => onPageChange(Math.min(currentPage + 1, effectivePageCount - 1))}
          disabled={currentPage >= effectivePageCount - 1}
          className="text-white text-2xl px-3 disabled:opacity-30"
          aria-label="Next page"
        >
          ›
        </button>
      </div>

      {/* Page reorder controls (collapsed by default) */}
      {effectivePageCount > 1 && (
        <details className="bg-gray-900 border-t border-gray-800">
          <summary className="px-4 py-2 text-xs text-gray-500 cursor-pointer hover:text-gray-300">
            Reorder pages ▾
          </summary>
          <div className="flex flex-wrap gap-2 px-4 pb-3">
            {orderedPages.map((physPage, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <span className="text-xs text-gray-400">Page {idx + 1}</span>
                {idx > 0 && (
                  <button
                    onClick={() => movePage(idx, idx - 1)}
                    className="text-xs text-gray-500 hover:text-white"
                  >
                    ←
                  </button>
                )}
                {idx < effectivePageCount - 1 && (
                  <button
                    onClick={() => movePage(idx, idx + 1)}
                    className="text-xs text-gray-500 hover:text-white"
                  >
                    →
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface PageFrameProps {
  pdfUrl: string
  page: number
  style?: React.CSSProperties
  className?: string
}

function PageFrame({ pdfUrl, page, style, className = '' }: PageFrameProps) {
  // In TEST_MODE there is no PDF.js. We render the PDF URL in an iframe for
  // any real URL, or a placeholder for non-URL test data.
  const isRealUrl = pdfUrl.startsWith('http') || pdfUrl.startsWith('/')

  if (!isRealUrl) {
    return (
      <div
        className={`${className} bg-white rounded overflow-hidden flex items-center justify-center aspect-[8.5/11]`}
        style={style}
      >
        <div className="text-gray-400 text-center p-8">
          <p className="text-4xl mb-2">📄</p>
          <p className="text-sm">PDF Page {page + 1}</p>
          <p className="text-xs text-gray-300 mt-1 break-all max-w-xs">{pdfUrl}</p>
        </div>
      </div>
    )
  }

  const src = `${pdfUrl}#page=${page + 1}`

  return (
    <iframe
      src={src}
      title={`PDF page ${page + 1}`}
      className={`${className} aspect-[8.5/11] border-0 rounded overflow-hidden`}
      style={style}
    />
  )
}

interface AnnotationOverlayProps {
  annotation: MusicStandAnnotation
  dimmed?: boolean
}

function AnnotationOverlay({ annotation, dimmed = false }: AnnotationOverlayProps) {
  const opacity = dimmed ? 0.4 : 0.8
  return (
    <div
      className="absolute pointer-events-none"
      style={{ opacity }}
      title={`${annotation.tool} annotation`}
    >
      {annotation.tool === 'text' && (
        <div
          className="absolute text-xs font-medium px-1 rounded"
          style={{
            color: annotation.color,
            top: 40,
            left: 40,
          }}
        >
          {annotation.data}
        </div>
      )}
      {(annotation.tool === 'highlighter' || annotation.tool === 'pen') && (
        <svg className="absolute inset-0 w-full h-full" style={{ opacity: annotation.tool === 'highlighter' ? 0.4 : 1 }}>
          <path
            d={annotation.data}
            stroke={annotation.color}
            strokeWidth={annotation.tool === 'highlighter' ? 16 : 3}
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  )
}
