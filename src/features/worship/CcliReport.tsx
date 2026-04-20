import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAppConfig } from '@/services/app-config-context'
import {
  computeCcliReport,
  defaultDateRange,
  formatCcliCsv,
  type CcliReport as CcliReportData,
} from './ccli-report-service'

export default function CcliReport() {
  const { config } = useAppConfig()
  const [range, setRange] = useState(defaultDateRange)
  const [report, setReport] = useState<CcliReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setReport(null)
    computeCcliReport(range.from, range.to)
      .then(r => { setReport(r); setLoading(false) })
      .catch(() => setLoading(false))
  }, [range.from, range.to])

  function handleDownloadCsv() {
    if (!report || report.rows.length === 0) return
    const csv = formatCcliCsv(report.rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ccli-usage-${range.from}-to-${range.to}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const hasMissingCcli = report?.rows.some(r => !r.ccliNumber) ?? false
  const hasRows = (report?.rows.length ?? 0) > 0

  return (
    <div className="p-6 max-w-5xl print:p-4 print:max-w-none">
      {/* Print-only header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {config.church_name || 'Church'} — CCLI Song Usage Report
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Period: {range.from} to {range.to}
        </p>
        <p className="text-sm text-gray-600">
          Generated: {new Date().toLocaleDateString()}
        </p>
      </div>

      {/* Screen header */}
      <div className="flex items-start justify-between mb-5 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CCLI Song Usage Report</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Track song usage for your bi-annual CCLI license filing
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => window.print()}
            className="text-sm px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
          >
            Print Report
          </button>
          <button
            onClick={handleDownloadCsv}
            disabled={!hasRows}
            className="text-sm px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Download CSV
          </button>
        </div>
      </div>

      {/* Compliance notice — always visible on screen, hidden in print */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5 print:hidden">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-blue-800">
            <strong>Gather Vital tracks your song usage but does not automatically file CCLI reports.</strong>{' '}
            You are responsible for submitting this report to{' '}
            <a
              href="https://ccli.com"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-blue-900"
            >
              ccli.com
            </a>{' '}
            every six months using your church&rsquo;s CCLI license number.
          </p>
        </div>
      </div>

      {/* Date range selector */}
      <div className="flex items-center gap-3 mb-5 print:hidden">
        <label className="text-sm font-medium text-gray-700">From</label>
        <input
          type="date"
          value={range.from}
          onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <label className="text-sm font-medium text-gray-700">To</label>
        <input
          type="date"
          value={range.to}
          onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Missing CCLI warning */}
      {hasMissingCcli && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 mb-5 print:hidden">
          <div className="flex gap-3">
            <span className="text-yellow-600 text-base flex-shrink-0 leading-5">⚠</span>
            <p className="text-sm text-yellow-800">
              Some songs are missing CCLI numbers. Add them in the{' '}
              <Link to="/admin/worship/songs" className="underline hover:text-yellow-900">
                Song Library
              </Link>{' '}
              before filing your report.
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16 print:hidden">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !hasRows ? (
        <div className="text-center py-16 text-gray-500 print:hidden">
          <p className="text-3xl mb-3">🎵</p>
          <p className="font-medium text-gray-700">No songs found in this period</p>
          <p className="text-sm mt-1">
            No service plans with songs were found between {range.from} and {range.to}.
          </p>
          <Link
            to="/admin/worship/services"
            className="inline-block mt-4 text-sm text-primary-600 hover:text-primary-700 underline"
          >
            Go to service planning →
          </Link>
        </div>
      ) : (
        <>
          {/* Summary line */}
          <p className="text-sm font-medium text-gray-700 mb-4">
            {report!.totalSongs} song{report!.totalSongs !== 1 ? 's' : ''} used across{' '}
            {report!.totalServices} service{report!.totalServices !== 1 ? 's' : ''} in this period
          </p>

          {/* Song table */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden print:border print:rounded-none">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 print:bg-white">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Song Title</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 hidden sm:table-cell">Artist / Author</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">CCLI #</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Times Used</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 hidden lg:table-cell print:table-cell">Services Used In</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {report!.rows.map(row => (
                  <tr key={row.songId} className="hover:bg-gray-50 transition-colors print:hover:bg-white">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.title}</td>
                    <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                      {row.artist ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {row.ccliNumber ? (
                        <span className="text-gray-900 font-mono text-xs">{row.ccliNumber}</span>
                      ) : (
                        <span className="text-yellow-600 font-medium text-xs">⚠ Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-semibold">{row.timesUsed}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell print:table-cell">
                      {row.serviceDates.join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
