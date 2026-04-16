/**
 * SongImportModal
 *
 * 4-step wizard (Upload → Map → Preview → Done) for importing songs.
 * Two modes detected automatically:
 *   - Planning Center: headers are recognised, mapping step is skipped
 *   - Generic CSV: manual field-mapping step shown
 */

import { useState, useRef, useCallback } from 'react'
import Modal from '@/shared/components/Modal'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'
import {
  parseCsv,
  SONG_FIELDS,
  isPlanningCenterCsv,
  buildPlanningCenterMapping,
  buildAutoMapping,
  buildSongPreview,
  commitSongImport,
  type SongPreviewRow,
  type SongImportResult,
} from './song-import-service'

type Step = 'upload' | 'map' | 'preview' | 'done'

interface Props {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
}

const STEPS: { id: Step; label: string }[] = [
  { id: 'upload',  label: 'Upload' },
  { id: 'map',     label: 'Map Fields' },
  { id: 'preview', label: 'Preview' },
  { id: 'done',    label: 'Done' },
]

export default function SongImportModal({ isOpen, onClose, onImported }: Props) {
  const [step, setStep]       = useState<Step>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows]       = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [isPc, setIsPc]       = useState(false)
  const [preview, setPreview] = useState<SongPreviewRow[]>([])
  const [previewing, setPreviewing] = useState(false)
  const [importing, setImporting]   = useState(false)
  const [result, setResult]   = useState<SongImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setStep('upload')
    setHeaders([])
    setRows([])
    setMapping({})
    setIsPc(false)
    setPreview([])
    setResult(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const parsed = parseCsv(text)
      setHeaders(parsed.headers)
      setRows(parsed.rows)
      const pc = isPlanningCenterCsv(parsed.headers)
      setIsPc(pc)
      if (pc) {
        setMapping(buildPlanningCenterMapping(parsed.headers))
        // Skip mapping step for PC imports — go straight to preview
        void buildAndPreview(parsed.rows, buildPlanningCenterMapping(parsed.headers))
      } else {
        setMapping(buildAutoMapping(parsed.headers))
        setStep('map')
      }
    }
    reader.readAsText(file)
  }

  const buildAndPreview = useCallback(async (
    r: Record<string, string>[],
    m: Record<string, string>,
  ) => {
    setPreviewing(true)
    const p = await buildSongPreview(r, m)
    setPreview(p)
    setPreviewing(false)
    setStep('preview')
  }, [])

  async function handleCommit() {
    setImporting(true)
    try {
      const res = await commitSongImport(preview)
      setResult(res)
      setStep('done')
      onImported()
    } finally {
      setImporting(false)
    }
  }

  const readyCt    = preview.filter(r => r.status === 'ready').length
  const dupCt      = preview.filter(r => r.status === 'duplicate').length
  const skippedCt  = preview.filter(r => r.status === 'skipped').length
  const currentIdx = STEPS.findIndex(s => s.id === step)

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import Songs">
      <div className="min-w-[560px] max-w-2xl">
        {/* Step bar */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 text-sm ${i <= currentIdx ? 'text-primary-700 font-medium' : 'text-gray-400'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i < currentIdx  ? 'bg-primary-600 text-white'
                  : i === currentIdx ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-600'
                  : 'bg-gray-100 text-gray-400'
                }`}>{i + 1}</span>
                <span className="hidden sm:inline text-xs">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-6 h-0.5 ${i < currentIdx ? 'bg-primary-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Upload */}
        {step === 'upload' && (
          <UploadStep onFile={handleFile} fileRef={fileRef} previewing={previewing} />
        )}

        {/* Map (generic CSV only) */}
        {step === 'map' && (
          <MapStep
            headers={headers}
            rows={rows}
            mapping={mapping}
            setMapping={setMapping}
            onBack={() => setStep('upload')}
            onNext={() => void buildAndPreview(rows, mapping)}
            loading={previewing}
          />
        )}

        {/* Preview */}
        {step === 'preview' && (
          <PreviewStep
            preview={preview}
            isPc={isPc}
            readyCt={readyCt}
            dupCt={dupCt}
            skippedCt={skippedCt}
            onBack={() => setStep(isPc ? 'upload' : 'map')}
            onConfirm={() => void handleCommit()}
            importing={importing}
          />
        )}

        {/* Done */}
        {step === 'done' && result && (
          <DoneStep result={result} onImportMore={reset} onClose={handleClose} />
        )}
      </div>
    </Modal>
  )
}

// ── Upload step ───────────────────────────────────────────────────────────────

function UploadStep({
  onFile,
  fileRef,
  previewing,
}: {
  onFile: (f: File) => void
  fileRef: React.RefObject<HTMLInputElement>
  previewing: boolean
}) {
  const [dragging, setDragging] = useState(false)

  if (previewing) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-gray-500">Checking for duplicates…</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Planning Center CSV</h3>
        <p className="text-xs text-gray-500">
          Export your songs from Planning Center Services → Songs → Export to CSV.
          Column names are detected automatically — no mapping required.
        </p>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Generic CSV</h3>
        <p className="text-xs text-gray-500">
          Any CSV with a Title column. You'll map columns to fields on the next step.
        </p>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          dragging ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
        }`}
        onClick={() => fileRef.current?.click()}
      >
        <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
        </svg>
        <p className="text-sm font-medium text-gray-700">Drop CSV here or click to browse</p>
        <p className="text-xs text-gray-400 mt-1">.csv files only</p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
        />
      </div>
    </div>
  )
}

// ── Map step (generic CSV) ────────────────────────────────────────────────────

function MapStep({
  headers,
  rows,
  mapping,
  setMapping,
  onBack,
  onNext,
  loading,
}: {
  headers: string[]
  rows: Record<string, string>[]
  mapping: Record<string, string>
  setMapping: (m: Record<string, string>) => void
  onBack: () => void
  onNext: () => void
  loading: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Map your CSV columns to song fields. Columns mapped to "Ignore" are skipped.
        </p>
        <span className="text-xs text-gray-400">{rows.length} rows</span>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">CSV Column</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Sample</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Maps to</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {headers.map(h => (
              <tr key={h}>
                <td className="px-4 py-2 font-medium text-gray-700 text-xs">{h}</td>
                <td className="px-4 py-2 text-gray-400 text-xs truncate max-w-[140px]">
                  {rows[0]?.[h] ?? ''}
                </td>
                <td className="px-4 py-2">
                  <select
                    value={mapping[h] ?? 'ignore'}
                    onChange={e => setMapping({ ...mapping, [h]: e.target.value })}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="ignore">— Ignore —</option>
                    {SONG_FIELDS.map(f => (
                      <option key={f.key} value={f.key}>
                        {f.label}{f.required ? ' *' : ''}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
        <Button size="sm" loading={loading} onClick={onNext}>
          Preview →
        </Button>
      </div>
    </div>
  )
}

// ── Preview step ──────────────────────────────────────────────────────────────

function PreviewStep({
  preview,
  isPc,
  readyCt,
  dupCt,
  skippedCt,
  onBack,
  onConfirm,
  importing,
}: {
  preview: SongPreviewRow[]
  isPc: boolean
  readyCt: number
  dupCt: number
  skippedCt: number
  onBack: () => void
  onConfirm: () => void
  importing: boolean
}) {
  return (
    <div className="space-y-4">
      {isPc && (
        <div className="flex items-center gap-2 text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded-lg px-3 py-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
          </svg>
          Planning Center import detected — columns mapped automatically.
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-center">
          <p className="text-2xl font-bold text-green-700">{readyCt}</p>
          <p className="text-xs text-green-600 mt-0.5">Ready to import</p>
        </div>
        <div className={`border rounded-xl px-4 py-3 text-center ${dupCt > 0 ? 'bg-yellow-50 border-yellow-100' : 'bg-gray-50 border-gray-100'}`}>
          <p className={`text-2xl font-bold ${dupCt > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>{dupCt}</p>
          <p className={`text-xs mt-0.5 ${dupCt > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>Duplicates</p>
        </div>
        <div className={`border rounded-xl px-4 py-3 text-center ${skippedCt > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
          <p className={`text-2xl font-bold ${skippedCt > 0 ? 'text-red-500' : 'text-gray-400'}`}>{skippedCt}</p>
          <p className={`text-xs mt-0.5 ${skippedCt > 0 ? 'text-red-500' : 'text-gray-400'}`}>Skipped</p>
        </div>
      </div>

      {/* Row list */}
      <div className="border border-gray-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-500">Title</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 hidden sm:table-cell">Artist</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 hidden md:table-cell">CCLI</th>
              {isPc && <th className="px-3 py-2 text-left font-medium text-gray-500 hidden lg:table-cell">Chord Chart</th>}
              <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {preview.map(row => {
              const chartSnippet = row.mapped.chord_chart_text
                ? row.mapped.chord_chart_text.split('\n').find(l => l.trim()) ?? ''
                : ''
              return (
                <tr key={row.index} className={
                  row.status === 'ready'     ? 'bg-white'
                  : row.status === 'duplicate' ? 'bg-yellow-50'
                  : 'bg-red-50'
                }>
                  <td className="px-3 py-2 font-medium text-gray-800">{row.mapped.title || <span className="text-gray-400 italic">—</span>}</td>
                  <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">{row.mapped.artist || '—'}</td>
                  <td className="px-3 py-2 text-gray-400 hidden md:table-cell">{row.mapped.ccli_number || '—'}</td>
                  {isPc && (
                    <td className="px-3 py-2 text-gray-400 font-mono hidden lg:table-cell max-w-[160px] truncate" title={chartSnippet}>
                      {chartSnippet ? chartSnippet.slice(0, 40) : <span className="italic">—</span>}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    {row.status === 'ready' && (
                      <span className="text-green-600 font-medium">✓ Ready</span>
                    )}
                    {row.status === 'duplicate' && (
                      <span className="text-yellow-600 font-medium" title={row.reason}>⚠ Duplicate</span>
                    )}
                    {row.status === 'skipped' && (
                      <span className="text-red-500 font-medium" title={row.reason}>✕ Skipped</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {dupCt > 0 && (
        <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2">
          {dupCt} duplicate{dupCt !== 1 ? 's' : ''} will be skipped — songs with the same title (and CCLI number when available) already exist in your library.
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
        <Button
          size="sm"
          loading={importing}
          disabled={readyCt === 0}
          onClick={onConfirm}
        >
          Import {readyCt} song{readyCt !== 1 ? 's' : ''} →
        </Button>
      </div>
    </div>
  )
}

// ── Done step ─────────────────────────────────────────────────────────────────

function DoneStep({
  result,
  onImportMore,
  onClose,
}: {
  result: SongImportResult
  onImportMore: () => void
  onClose: () => void
}) {
  return (
    <div className="text-center space-y-4 py-4">
      <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
        <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Import complete</h3>
        <p className="text-sm text-gray-500 mt-1">
          {result.imported} song{result.imported !== 1 ? 's' : ''} added to your library.
          {result.duplicates > 0 ? ` ${result.duplicates} duplicate${result.duplicates !== 1 ? 's' : ''} skipped.` : ''}
          {result.skipped > 0 ? ` ${result.skipped} row${result.skipped !== 1 ? 's' : ''} skipped (missing required fields).` : ''}
        </p>
      </div>
      <div className="flex justify-center gap-2 pt-2">
        <Button variant="secondary" size="sm" onClick={onImportMore}>Import another file</Button>
        <Button size="sm" onClick={onClose}>Done</Button>
      </div>
    </div>
  )
}
