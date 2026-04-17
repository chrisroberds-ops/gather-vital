/**
 * PDF viewer for Music Stand — PDF.js rendering with annotation support.
 *
 * Features:
 * - PDF.js (CDN) renders each page as a <canvas> element at 1.5× scale
 * - Transparent SVG annotation layer on top of each page canvas
 * - Annotation tools: highlighter, pen (SVG paths), text (foreignObject input)
 * - Annotations saved per user / song / page via music-stand-service
 * - Pinch-to-zoom with zoom level saved per user per PDF
 * - Page navigation: swipe, tap edges, keyboard arrows, foot pedal
 * - Two-page side-by-side in landscape mode
 * - Page reordering saved per user
 * - Dark mode via CSS filter on canvas
 * - Fallback to <iframe> if PDF.js CDN is unreachable
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react'
import { loadPdfJs } from './pdf-js-loader'
import {
  savePdfPreferences,
  getPdfPreferences,
  getAnnotationsForSong,
  createAnnotation,
} from './music-stand-service'
import type { MusicStandAnnotation, AnnotationTool } from '@/shared/types'

// ── Minimal PDF.js types ───────────────────────────────────────────────────────

interface PdfViewport {
  width: number
  height: number
}

interface PdfRenderTask {
  promise: Promise<void>
  cancel(): void
}

interface PdfPageProxy {
  getViewport(opts: { scale: number }): PdfViewport
  render(ctx: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): PdfRenderTask
}

interface PdfDocumentProxy {
  numPages: number
  getPage(pageNumber: number): Promise<PdfPageProxy>  // 1-indexed
}

interface PdfjsLib {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument(params: { url: string }): { promise: Promise<PdfDocumentProxy> }
}

function getPdfjsLib(): PdfjsLib | null {
  return (window as unknown as { pdfjsLib?: PdfjsLib }).pdfjsLib ?? null
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Base scale for PDF rendering. Canvas will be CSS-scaled to fit the container. */
const PDF_RENDER_SCALE = 1.5

export const ANNOTATION_COLORS = ['#FACC15', '#FB923C', '#4ADE80', '#60A5FA', '#F472B6']

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PdfViewerProps {
  pdfUrl: string
  /** Hint for initial page count before PDF.js resolves the real count. */
  pageCount?: number
  currentPage: number
  onPageChange: (page: number) => void
  userId: string
  songId: string
  darkMode?: boolean
  landscape?: boolean
  showAnnotations?: boolean
  otherUserAnnotations?: MusicStandAnnotation[]
}

// ── PdfViewer ─────────────────────────────────────────────────────────────────

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

  // PDF.js document state
  const [pdfDoc, setPdfDoc] = useState<PdfDocumentProxy | null>(null)
  const [pdfLoading, setPdfLoading] = useState(true)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [pdfJsAvailable, setPdfJsAvailable] = useState(false)

  // Annotation state
  const [annotations, setAnnotations] = useState<MusicStandAnnotation[]>([])
  const [activeTool, setActiveTool] = useState<AnnotationTool | null>(null)
  const [activeColor, setActiveColor] = useState(ANNOTATION_COLORS[0])

  // Zoom and page order (persisted per user per PDF)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [pageOrder, setPageOrder] = useState<number[]>([])

  // Touch tracking for swipe and pinch-to-zoom
  const touchStartX = useRef<number | null>(null)
  const lastTouchDist = useRef<number | null>(null)

  // ── Load PDF.js + document ──────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    setPdfLoading(true)
    setPdfDoc(null)
    setPdfError(null)

    loadPdfJs().then(loaded => {
      if (cancelled) return
      setPdfJsAvailable(loaded)

      if (!loaded) {
        setPdfLoading(false)
        return
      }

      const lib = getPdfjsLib()
      if (!lib) { setPdfLoading(false); return }

      lib.getDocument({ url: pdfUrl }).promise
        .then(doc => {
          if (!cancelled) {
            setPdfDoc(doc)
            setPdfLoading(false)
          }
        })
        .catch((err: Error) => {
          if (!cancelled) {
            setPdfError(err?.message ?? 'Failed to load PDF')
            setPdfLoading(false)
          }
        })
    })

    return () => { cancelled = true }
  }, [pdfUrl])

  // ── Load preferences and annotations ───────────────────────────────────────

  useEffect(() => {
    getPdfPreferences(userId, pdfUrl).then(p => {
      if (p) {
        setZoomLevel(p.zoom_level)
        setPageOrder(p.page_order)
      }
    })
    getAnnotationsForSong(userId, songId, pdfUrl).then(setAnnotations)
  }, [userId, songId, pdfUrl])

  // ── Page count and order ────────────────────────────────────────────────────

  const effectivePageCount = pdfDoc ? pdfDoc.numPages : pageCount
  const orderedPages = pageOrder.length === effectivePageCount
    ? pageOrder
    : Array.from({ length: effectivePageCount }, (_, i) => i)
  const physicalPage = orderedPages[currentPage] ?? currentPage

  // ── Keyboard / foot-pedal navigation ───────────────────────────────────────

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
  }, [currentPage, onPageChange, effectivePageCount])

  // ── Zoom persistence ────────────────────────────────────────────────────────

  const saveZoom = useCallback(async (zoom: number) => {
    await savePdfPreferences(userId, pdfUrl, { zoom_level: zoom, page_order: pageOrder })
  }, [userId, pdfUrl, pageOrder])

  // ── Touch: swipe and pinch ─────────────────────────────────────────────────

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
      void saveZoom(newZoom)
    }
  }

  // ── Edge tap navigation ─────────────────────────────────────────────────────

  function onContainerClick(e: React.MouseEvent) {
    if (activeTool) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const third = rect.width / 3
    if (x < third) onPageChange(Math.max(currentPage - 1, 0))
    else if (x > third * 2) onPageChange(Math.min(currentPage + 1, effectivePageCount - 1))
  }

  // ── Page reorder ────────────────────────────────────────────────────────────

  function movePage(fromIdx: number, toIdx: number) {
    const newOrder = [...orderedPages]
    const [moved] = newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, moved)
    setPageOrder(newOrder)
    void savePdfPreferences(userId, pdfUrl, { zoom_level: zoomLevel, page_order: newOrder })
  }

  // ── Annotation save ─────────────────────────────────────────────────────────

  async function handleAnnotationCreated(pageNum: number, data: string, tool: AnnotationTool) {
    const annotation = await createAnnotation({
      userId,
      songId,
      pdfUrl,
      pageNumber: pageNum,
      tool,
      color: activeColor,
      data,
    })
    setAnnotations(prev => [...prev, annotation])
  }

  // ── Landscape two-page ──────────────────────────────────────────────────────

  const showTwoPages = landscape && effectivePageCount > 1
  const rightPage = showTwoPages
    ? orderedPages[Math.min(currentPage + 1, effectivePageCount - 1)]
    : null

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-100'

  // Helpers to filter annotations per page
  const pageAnnotations = (pageNum: number) =>
    annotations.filter(a => a.page_number === pageNum)
  const pageOtherAnnotations = (pageNum: number) =>
    otherUserAnnotations.filter(a => a.page_number === pageNum)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={`flex flex-col h-full ${bgClass}`}>

      {/* Annotation toolbar */}
      {showAnnotations && (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
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
        {/* Transparent edge-tap zones */}
        <div className="absolute left-0 top-0 bottom-0 w-1/5 opacity-0 z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-1/5 opacity-0 z-10 pointer-events-none" />

        {pdfLoading ? (
          /* Loading spinner while PDF.js initialises / PDF fetches */
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs">Loading PDF…</p>
          </div>

        ) : pdfError || !pdfJsAvailable ? (
          /* Fallback: browser's native PDF viewer via <iframe> */
          <div className={`flex gap-2 ${showTwoPages ? 'w-full' : ''}`}
            style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center top' }}>
            <FallbackIframe
              pdfUrl={pdfUrl}
              pageNum={physicalPage}
              darkMode={darkMode}
              className={showTwoPages ? 'flex-1' : 'w-full max-w-2xl mx-auto'}
            />
            {rightPage !== null && (
              <FallbackIframe
                pdfUrl={pdfUrl}
                pageNum={rightPage}
                darkMode={darkMode}
                className="flex-1"
              />
            )}
          </div>

        ) : pdfDoc ? (
          /* PDF.js canvas pages with annotation layers */
          <div
            className={`flex gap-2 ${showTwoPages ? 'w-full items-start' : ''}`}
            style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center top' }}
          >
            <PdfPageWithAnnotations
              pdfDoc={pdfDoc}
              pageIndex={physicalPage}
              darkMode={darkMode}
              annotations={pageAnnotations(physicalPage)}
              otherUserAnnotations={pageOtherAnnotations(physicalPage)}
              activeTool={showAnnotations ? activeTool : null}
              activeColor={activeColor}
              onAnnotationCreated={(data, tool) =>
                void handleAnnotationCreated(physicalPage, data, tool)
              }
              className={showTwoPages ? 'flex-1' : 'max-w-2xl mx-auto w-full'}
            />
            {rightPage !== null && (
              <PdfPageWithAnnotations
                pdfDoc={pdfDoc}
                pageIndex={rightPage}
                darkMode={darkMode}
                annotations={pageAnnotations(rightPage)}
                otherUserAnnotations={pageOtherAnnotations(rightPage)}
                activeTool={showAnnotations ? activeTool : null}
                activeColor={activeColor}
                onAnnotationCreated={(data, tool) =>
                  void handleAnnotationCreated(rightPage, data, tool)
                }
                className="flex-1"
              />
            )}
          </div>

        ) : null}
      </div>

      {/* Page navigation bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-t border-gray-800 flex-shrink-0">
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

      {/* Page reorder controls */}
      {effectivePageCount > 1 && (
        <details className="bg-gray-900 border-t border-gray-800">
          <summary className="px-4 py-2 text-xs text-gray-500 cursor-pointer hover:text-gray-300">
            Reorder pages ▾
          </summary>
          <div className="flex flex-wrap gap-2 px-4 pb-3">
            {orderedPages.map((_, idx) => (
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

// ── PdfPageWithAnnotations ────────────────────────────────────────────────────

interface PdfPageWithAnnotationsProps {
  pdfDoc: PdfDocumentProxy
  pageIndex: number
  darkMode: boolean
  annotations: MusicStandAnnotation[]
  otherUserAnnotations: MusicStandAnnotation[]
  activeTool: AnnotationTool | null
  activeColor: string
  onAnnotationCreated: (data: string, tool: AnnotationTool) => void
  className?: string
}

interface TextInputState {
  svgX: number
  svgY: number
  value: string
}

function PdfPageWithAnnotations({
  pdfDoc,
  pageIndex,
  darkMode,
  annotations,
  otherUserAnnotations,
  activeTool,
  activeColor,
  onAnnotationCreated,
  className = '',
}: PdfPageWithAnnotationsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const renderTaskRef = useRef<PdfRenderTask | null>(null)

  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null)
  const [pageRendering, setPageRendering] = useState(true)
  const [currentPath, setCurrentPath] = useState('')
  const [textInput, setTextInput] = useState<TextInputState | null>(null)
  const drawing = useRef(false)

  // ── Render PDF page ─────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    setPageRendering(true)
    setCurrentPath('')

    pdfDoc.getPage(pageIndex + 1).then(page => {
      if (cancelled) return
      const viewport = page.getViewport({ scale: PDF_RENDER_SCALE })
      const canvas = canvasRef.current
      if (!canvas || cancelled) return

      canvas.width = viewport.width
      canvas.height = viewport.height
      setCanvasSize({ w: viewport.width, h: viewport.height })

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const renderTask = page.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = renderTask

      renderTask.promise
        .then(() => { if (!cancelled) setPageRendering(false) })
        .catch(() => { /* render was cancelled */ })
    }).catch(() => {
      if (!cancelled) setPageRendering(false)
    })

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
    }
  }, [pdfDoc, pageIndex])

  // ── SVG coordinate conversion ───────────────────────────────────────────────

  /**
   * Converts a pointer event's screen coordinates to SVG user-space coordinates.
   * Uses SVG's getScreenCTM() which correctly accounts for CSS transforms on
   * ancestor elements (including the zoom container).
   */
  function getSvgCoords(e: React.PointerEvent): { x: number; y: number } | null {
    const svg = svgRef.current
    if (!svg) return null
    try {
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const ctm = svg.getScreenCTM()
      if (!ctm) return null
      const svgPt = pt.matrixTransform(ctm.inverse())
      return { x: Math.round(svgPt.x), y: Math.round(svgPt.y) }
    } catch {
      return null
    }
  }

  // ── Drawing pointer handlers ────────────────────────────────────────────────

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!activeTool) return

    if (activeTool === 'text') {
      const pos = getSvgCoords(e)
      if (pos) setTextInput({ svgX: pos.x, svgY: pos.y, value: '' })
      return
    }

    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const pos = getSvgCoords(e)
    if (pos) setCurrentPath(`M ${pos.x} ${pos.y}`)
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drawing.current || !activeTool || activeTool === 'text') return
    const pos = getSvgCoords(e)
    if (pos) setCurrentPath(p => `${p} L ${pos.x} ${pos.y}`)
  }

  function onPointerUp() {
    if (!drawing.current) return
    drawing.current = false
    // Only save if the path has at least one line segment
    if (currentPath && currentPath.includes(' L ')) {
      onAnnotationCreated(currentPath, activeTool as AnnotationTool)
    }
    setCurrentPath('')
  }

  // ── Text annotation ─────────────────────────────────────────────────────────

  function commitTextAnnotation() {
    if (textInput?.value.trim()) {
      onAnnotationCreated(
        JSON.stringify({ text: textInput.value, x: textInput.svgX, y: textInput.svgY }),
        'text',
      )
    }
    setTextInput(null)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className={`relative ${className}`}
      style={{ lineHeight: 0 }}
    >
      {/* PDF canvas — dark mode via CSS filter (non-destructive, no re-render needed) */}
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          filter: darkMode ? 'invert(1) hue-rotate(180deg)' : 'none',
        }}
      />

      {/* SVG annotation layer — sits on top of canvas, same visual dimensions */}
      {canvasSize && (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${canvasSize.w} ${canvasSize.h}`}
          preserveAspectRatio="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            // Only capture pointer events when a drawing tool is active
            pointerEvents: activeTool ? 'all' : 'none',
            cursor: activeTool ? 'crosshair' : 'default',
            overflow: 'visible',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {/* Other users' annotations (dimmed) */}
          {otherUserAnnotations.map(a => (
            <AnnotationShape key={a.id} annotation={a} dimmed />
          ))}

          {/* Own annotations */}
          {annotations.map(a => (
            <AnnotationShape key={a.id} annotation={a} />
          ))}

          {/* In-progress drawing path */}
          {currentPath && activeTool && activeTool !== 'text' && (
            <path
              d={currentPath}
              stroke={activeColor}
              strokeWidth={activeTool === 'highlighter' ? 16 : 3}
              strokeOpacity={activeTool === 'highlighter' ? 0.4 : 1}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Text annotation input via SVG foreignObject */}
          {textInput && (
            <foreignObject
              x={textInput.svgX}
              y={textInput.svgY - 24}
              width={220}
              height={32}
            >
              {/* xmlns is required for HTML inside SVG foreignObject */}
              <input
                // @ts-expect-error — React doesn't type xmlns on plain elements
                xmlns="http://www.w3.org/1999/xhtml"
                type="text"
                autoFocus
                value={textInput.value}
                onChange={e =>
                  setTextInput(t =>
                    t ? { ...t, value: (e.target as HTMLInputElement).value } : null,
                  )
                }
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitTextAnnotation() }
                  if (e.key === 'Escape') setTextInput(null)
                }}
                onBlur={commitTextAnnotation}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.6)',
                  border: 'none',
                  borderBottom: `2px solid ${activeColor}`,
                  outline: 'none',
                  color: activeColor,
                  fontSize: 14,
                  fontFamily: 'monospace',
                  padding: '4px 6px',
                  borderRadius: '2px 2px 0 0',
                }}
              />
            </foreignObject>
          )}
        </svg>
      )}

      {/* Page rendering spinner (shown until PDF.js finishes the render task) */}
      {pageRendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-200/40 pointer-events-none">
          <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

// ── AnnotationShape ───────────────────────────────────────────────────────────

function AnnotationShape({
  annotation,
  dimmed = false,
}: {
  annotation: MusicStandAnnotation
  dimmed?: boolean
}) {
  const baseOpacity = dimmed ? 0.4 : 0.9

  if (annotation.tool === 'pen' || annotation.tool === 'highlighter') {
    return (
      <path
        d={annotation.data}
        stroke={annotation.color}
        strokeWidth={annotation.tool === 'highlighter' ? 16 : 3}
        strokeOpacity={annotation.tool === 'highlighter' ? 0.4 * baseOpacity : baseOpacity}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )
  }

  if (annotation.tool === 'text') {
    try {
      const { text, x, y } = JSON.parse(annotation.data) as {
        text: string
        x: number
        y: number
      }
      return (
        <text
          x={x}
          y={y}
          fill={annotation.color}
          fontSize={14}
          fontFamily="monospace"
          opacity={baseOpacity}
        >
          {text}
        </text>
      )
    } catch {
      return null
    }
  }

  return null
}

// ── FallbackIframe ─────────────────────────────────────────────────────────────

/**
 * Shown when PDF.js fails to load (CDN unreachable) or when the PDF document
 * itself throws a load error. Falls back to the browser's native PDF viewer.
 */
function FallbackIframe({
  pdfUrl,
  pageNum,
  darkMode,
  className = '',
}: {
  pdfUrl: string
  pageNum: number
  darkMode: boolean
  className?: string
}) {
  const isRealUrl = pdfUrl.startsWith('http') || pdfUrl.startsWith('/')
  const filterStyle: React.CSSProperties = darkMode
    ? { filter: 'invert(1) hue-rotate(180deg)' }
    : {}

  if (!isRealUrl) {
    // Data URL or placeholder — show a static placeholder card
    return (
      <div
        className={`${className} bg-white rounded overflow-hidden flex items-center justify-center aspect-[8.5/11]`}
        style={filterStyle}
      >
        <div className="text-gray-400 text-center p-8">
          <p className="text-4xl mb-2">📄</p>
          <p className="text-sm">PDF Page {pageNum + 1}</p>
        </div>
      </div>
    )
  }

  return (
    <iframe
      src={`${pdfUrl}#page=${pageNum + 1}`}
      title={`PDF page ${pageNum + 1}`}
      className={`${className} aspect-[8.5/11] border-0 rounded overflow-hidden`}
      style={filterStyle}
    />
  )
}
