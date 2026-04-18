import { useState, useRef } from 'react'
import { parseGivingCsv, commitGivingImport, formatCurrency, formatMethod } from './giving-service'
import type { GivingImportRow } from './giving-service'
import Button from '@/shared/components/Button'

interface Props {
  onImported: () => void
}

type Step = 'upload' | 'preview' | 'done'

export default function GivingImport({ onImported }: Props) {
  const [step,       setStep]      = useState<Step>('upload')
  const [rows,       setRows]      = useState<GivingImportRow[]>([])
  const [errors,     setErrors]    = useState<string[]>([])
  const [importing,  setImporting] = useState(false)
  const [result,     setResult]    = useState<{ created: number; skipped: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const { rows: parsed, errors: errs } = parseGivingCsv(text)
      setRows(parsed)
      setErrors(errs)
      setStep('preview')
    }
    reader.readAsText(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  async function handleImport() {
    setImporting(true)
    try {
      const r = await commitGivingImport(rows)
      setResult(r)
      setStep('done')
    } finally {
      setImporting(false)
    }
  }

  if (step === 'done' && result) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center space-y-4">
        <div className="text-4xl">✅</div>
        <h2 className="text-lg font-bold text-gray-900">Import complete</h2>
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-green-700">{result.created} records</span> imported.
          {result.skipped > 0 && (
            <> <span className="text-amber-600">{result.skipped} skipped</span> (person name not found in database).</>
          )}
        </p>
        <Button onClick={onImported}>View records</Button>
      </div>
    )
  }

  if (step === 'preview') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Preview — {rows.length} rows parsed
            {errors.length > 0 && <span className="ml-2 text-amber-600">· {errors.length} errors</span>}
          </h2>
          <button onClick={() => setStep('upload')} className="text-xs text-gray-400 hover:text-gray-600">
            ← Back
          </button>
        </div>

        {errors.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
            <p className="text-xs font-semibold text-amber-800">Parse warnings:</p>
            {errors.map((e, i) => <p key={i} className="text-xs text-amber-700">{e}</p>)}
          </div>
        )}

        {rows.length > 0 ? (
          <>
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-gray-100 bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-gray-500 font-semibold">Name</th>
                    <th className="px-4 py-2 text-left text-gray-500 font-semibold">Date</th>
                    <th className="px-4 py-2 text-left text-gray-500 font-semibold">Amount</th>
                    <th className="px-4 py-2 text-left text-gray-500 font-semibold">Fund</th>
                    <th className="px-4 py-2 text-left text-gray-500 font-semibold">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-gray-900">{r.firstName} {r.lastName}</td>
                      <td className="px-4 py-2 text-gray-600 tabular-nums">{r.date}</td>
                      <td className="px-4 py-2 font-semibold tabular-nums">{formatCurrency(r.amount)}</td>
                      <td className="px-4 py-2 text-gray-600">{r.fund}</td>
                      <td className="px-4 py-2 text-gray-600">{formatMethod(r.method)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
              Unmatched names will be <strong>skipped</strong> — the import matches by first + last name.
              Add the person to the database first if they're missing.
            </div>

            <div className="flex gap-2">
              <Button onClick={() => void handleImport()} loading={importing}>
                Import {rows.length} records
              </Button>
              <Button variant="secondary" onClick={() => setStep('upload')}>Cancel</Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">No valid rows found in the CSV.</p>
        )}
      </div>
    )
  }

  // Step: upload
  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Import from Planning Center</h2>
        <p className="text-xs text-gray-500 mb-4">
          Export giving data from Planning Center Giving → Reports → Donations.
          The CSV must include columns for: First Name, Last Name, Received Date, Amount, Fund Name, Payment Method.
        </p>

        <div
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors"
        >
          <p className="text-3xl mb-2">📄</p>
          <p className="text-sm font-medium text-gray-700">Drop CSV here or click to browse</p>
          <p className="text-xs text-gray-400 mt-1">Planning Center Giving export (.csv)</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>
    </div>
  )
}
