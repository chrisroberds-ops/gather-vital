/**
 * BulkPdfUpload
 *
 * Full-page view for attaching chord chart PDFs to songs in bulk.
 *
 * Two interaction modes:
 *   1. Page-level drop — drag multiple PDFs onto the page; each PDF is
 *      auto-matched to the closest song by filename similarity and staged
 *      (highlighted green). Staff review the matches and click "Upload N
 *      matched PDFs" to process the batch.
 *   2. Row-level drop / browse — drag one PDF onto a specific song row (or
 *      click "browse") to assign it explicitly; upload begins immediately.
 *
 * Songs that already have a chord_chart_url show a green checkmark.
 * Files are uploaded via uploadSongPdf (TEST_MODE → base64 data URL).
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSongs, updateSong } from './worship-service'
import { validateSongPdf, uploadSongPdf } from '@/services/storage-service'
import type { Song } from '@/shared/types'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'

// ── Filename similarity ───────────────────────────────────────────────────────

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function matchScore(filename: string, title: string): number {
  const fnWords = normalizeName(filename).split(' ').filter(Boolean)
  const titleWords = normalizeName(title).split(' ').filter(Boolean)
  if (!fnWords.length || !titleWords.length) return 0
  const fnSet = new Set(fnWords)
  const overlap = titleWords.filter(w => fnSet.has(w)).length
  return overlap / Math.max(fnWords.length, titleWords.length)
}

/** Returns the song id of the best-matching unassigned song, or null if no match clears the threshold. */
function findBestMatch(filename: string, rows: SongUploadRow[]): string | null {
  const THRESHOLD = 0.3
  let bestId: string | null = null
  let bestScore = THRESHOLD
  for (const row of rows) {
    if (row.uploadedUrl || row.pendingFile) continue
    const score = matchScore(filename, row.song.title)
    if (score > bestScore) {
      bestScore = score
      bestId = row.song.id
    }
  }
  return bestId
}

// ── Types ─────────────────────────────────────────────────────────────────────

type RowStatus = 'idle' | 'uploading' | 'done' | 'error'

interface SongUploadRow {
  song: Song
  pendingFile: File | null
  /** Non-null when the song already has a PDF (from library) or after a successful upload. */
  uploadedUrl: string | null
  status: RowStatus
  error: string | null
  /** True when this row was matched automatically via page-level drop (highlighted green). */
  suggested: boolean
}

// ── BulkPdfUpload ─────────────────────────────────────────────────────────────

export default function BulkPdfUpload() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<SongUploadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pageOver, setPageOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const dragCounter = useRef(0)

  useEffect(() => {
    getSongs().then(songs => {
      setRows(
        songs.map(s => ({
          song: s,
          pendingFile: null,
          uploadedUrl: s.chord_chart_url ?? null,
          status: s.chord_chart_url ? 'done' : 'idle',
          error: null,
          suggested: false,
        })),
      )
      setLoading(false)
    })
  }, [])

  // ── Single-row upload ──────────────────────────────────────────────────────

  async function uploadRow(songId: string, file: File): Promise<void> {
    setRows(prev => prev.map(r => r.song.id === songId ? { ...r, status: 'uploading', error: null } : r))
    try {
      const url = await uploadSongPdf(file)
      await updateSong(songId, { chord_chart_url: url })
      setRows(prev =>
        prev.map(r =>
          r.song.id === songId
            ? { ...r, status: 'done', uploadedUrl: url, pendingFile: null, suggested: false }
            : r,
        ),
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setRows(prev => prev.map(r => r.song.id === songId ? { ...r, status: 'error', error: msg } : r))
    }
  }

  // ── Row-level drag-and-drop ────────────────────────────────────────────────

  function handleRowDrop(e: DragEvent<HTMLTableRowElement>, songId: string) {
    e.preventDefault()
    e.stopPropagation()
    setPageOver(false)
    dragCounter.current = 0
    const file = e.dataTransfer.files[0]
    if (!file) return
    const err = validateSongPdf(file)
    if (err) {
      setRows(prev => prev.map(r => r.song.id === songId ? { ...r, error: err, status: 'error' } : r))
      return
    }
    void uploadRow(songId, file)
  }

  // ── Page-level drag-and-drop ───────────────────────────────────────────────

  const handlePageDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragCounter.current++
    setPageOver(true)
  }, [])

  const handlePageDragLeave = useCallback(() => {
    dragCounter.current--
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setPageOver(false)
    }
  }, [])

  const handlePageDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }, [])

  function handlePageDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    dragCounter.current = 0
    setPageOver(false)

    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf')
    if (!files.length) return

    setRows(prev => {
      // Take a snapshot and mutate it progressively so each match is removed from
      // the pool before the next file is evaluated.
      let updated = [...prev]
      for (const file of files) {
        const bestId = findBestMatch(file.name, updated)
        if (bestId) {
          updated = updated.map(r =>
            r.song.id === bestId
              ? { ...r, pendingFile: file, suggested: true, error: null, status: 'idle' as RowStatus }
              : r,
          )
        }
      }
      return updated
    })
  }

  // ── Batch upload (all staged/pending rows) ─────────────────────────────────

  const pendingRows = rows.filter(r => r.pendingFile && r.status !== 'uploading' && r.status !== 'done')

  async function uploadAllPending() {
    if (!pendingRows.length || uploading) return
    setUploading(true)
    setProgress({ done: 0, total: pendingRows.length })
    let done = 0
    for (const row of pendingRows) {
      if (!row.pendingFile) continue
      await uploadRow(row.song.id, row.pendingFile)
      done++
      setProgress({ done, total: pendingRows.length })
    }
    setUploading(false)
    setProgress(null)
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  const doneCount = rows.filter(r => r.status === 'done').length
  const totalCount = rows.length

  return (
    <div
      className="min-h-screen bg-gray-50"
      onDragEnter={handlePageDragEnter}
      onDragLeave={handlePageDragLeave}
      onDragOver={handlePageDragOver}
      onDrop={handlePageDrop}
    >
      {/* Full-page drop overlay */}
      {pageOver && (
        <div className="fixed inset-0 z-50 bg-primary-500/10 border-4 border-dashed border-primary-500 pointer-events-none flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl px-10 py-8 text-center">
            <svg className="w-12 h-12 text-primary-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <p className="text-xl font-semibold text-gray-900">Drop PDFs to auto-match</p>
            <p className="text-sm text-gray-500 mt-1">Each file will be matched to the closest song by filename</p>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <button
              onClick={() => navigate('/admin/worship/songs')}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium mb-2 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Song Library
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Bulk Chord Chart Upload</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {loading
                ? 'Loading…'
                : `${doneCount} of ${totalCount} song${totalCount !== 1 ? 's' : ''} have a chord chart PDF`}
            </p>
          </div>

          <div className="flex items-center gap-3 mt-1">
            {progress && (
              <span className="text-sm text-gray-500">
                Uploading {progress.done} / {progress.total}…
              </span>
            )}
            {pendingRows.length > 0 && (
              <Button onClick={() => void uploadAllPending()} disabled={uploading}>
                {uploading && <Spinner size="sm" />}
                Upload {pendingRows.length} matched PDF{pendingRows.length !== 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </div>

        {/* Hint banner */}
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
          </svg>
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> Drag multiple PDFs anywhere on this page to auto-match by filename similarity.
            Or drag a PDF directly onto a song row to assign it explicitly. Max 10 MB per file.
          </p>
        </div>

        {/* Progress bar */}
        {progress && (
          <div className="mb-4">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 transition-all duration-300"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : rows.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl px-8 py-16 text-center text-gray-500">
            No songs in the library yet.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 w-8" />
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Song</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 hidden sm:table-cell">Artist</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Chord Chart PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(row => (
                  <SongRow
                    key={row.song.id}
                    row={row}
                    onRowDrop={handleRowDrop}
                    onClearPending={() =>
                      setRows(prev =>
                        prev.map(r =>
                          r.song.id === row.song.id
                            ? { ...r, pendingFile: null, suggested: false, status: 'idle', error: null }
                            : r,
                        ),
                      )
                    }
                    onUpload={uploadRow}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── SongRow ───────────────────────────────────────────────────────────────────

interface SongRowProps {
  row: SongUploadRow
  onRowDrop: (e: DragEvent<HTMLTableRowElement>, songId: string) => void
  onClearPending: () => void
  onUpload: (songId: string, file: File) => Promise<void>
}

function SongRow({ row, onRowDrop, onClearPending, onUpload }: SongRowProps) {
  const [rowOver, setRowOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { song, status, suggested, pendingFile, error } = row
  const isUploading = status === 'uploading'
  const isDone = status === 'done'

  function handleDragOver(e: DragEvent<HTMLTableRowElement>) {
    e.preventDefault()
    e.stopPropagation()
    setRowOver(true)
  }
  function handleDragLeave(e: DragEvent<HTMLTableRowElement>) {
    e.stopPropagation()
    setRowOver(false)
  }
  function handleDrop(e: DragEvent<HTMLTableRowElement>) {
    setRowOver(false)
    onRowDrop(e, song.id)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    void onUpload(song.id, file)
    e.target.value = ''
  }

  const rowBg = suggested
    ? 'bg-green-50'
    : rowOver
    ? 'bg-primary-50'
    : ''

  const ringClass = rowOver ? 'ring-2 ring-inset ring-primary-400' : ''

  return (
    <tr
      className={`transition-colors ${rowBg} ${ringClass}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Status icon */}
      <td className="px-4 py-3 w-8 text-center">
        {isDone ? (
          <svg className="w-5 h-5 text-green-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : isUploading ? (
          <Spinner size="sm" />
        ) : null}
      </td>

      {/* Song title */}
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{song.title}</div>
        {song.ccli_number && (
          <div className="text-xs text-gray-400">CCLI {song.ccli_number}</div>
        )}
      </td>

      {/* Artist */}
      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
        {song.artist ?? '—'}
      </td>

      {/* Drop zone / status cell */}
      <td className="px-4 py-3">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />

        {isDone && !pendingFile ? (
          /* Song already has a PDF */
          <div className="flex items-center gap-2">
            <span className="text-xs text-green-600 font-medium">PDF attached</span>
            <button
              onClick={() => inputRef.current?.click()}
              className="text-xs text-gray-400 hover:text-gray-600"
              title="Replace existing PDF"
            >
              Replace
            </button>
          </div>
        ) : pendingFile ? (
          /* Staged (auto-matched or explicit) — awaiting upload */
          <div className="flex items-center gap-2 flex-wrap">
            {suggested && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                Auto-matched
              </span>
            )}
            <span className="text-xs text-gray-700 truncate max-w-[180px]" title={pendingFile.name}>
              {pendingFile.name}
            </span>
            <button
              onClick={() => void onUpload(song.id, pendingFile)}
              disabled={isUploading}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium disabled:opacity-40 shrink-0"
            >
              Upload
            </button>
            <button
              onClick={onClearPending}
              className="text-xs text-gray-400 hover:text-red-500 shrink-0"
              title="Remove staged file"
            >
              ✕
            </button>
          </div>
        ) : error ? (
          /* Upload error */
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-600">{error}</span>
            <button
              onClick={() => inputRef.current?.click()}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              Try again
            </button>
          </div>
        ) : (
          /* Idle — show drop target */
          <button
            onClick={() => inputRef.current?.click()}
            className={`text-xs border border-dashed rounded-lg px-3 py-1.5 transition-colors ${
              rowOver
                ? 'border-primary-400 text-primary-600 bg-primary-50'
                : 'border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600'
            }`}
          >
            Drop PDF here or click to browse
          </button>
        )}
      </td>
    </tr>
  )
}
