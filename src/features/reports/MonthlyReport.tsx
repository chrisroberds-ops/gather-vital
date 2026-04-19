import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { useAppConfig } from '@/services/app-config-context'
import { db } from '@/services'
import { sendEmail } from '@/services/notification-service'
import {
  computeMonthlyReport,
  getStoredMonthData,
  parseHistoricalCsv,
  commitHistoricalImport,
  trendArrow,
  trendPct,
  countSundaysInMonth,
  type MonthlyReportData,
  type HistoricalRow,
} from './monthly-report-service'
import { formatCurrency } from '@/features/giving/giving-service'
import Spinner from '@/shared/components/Spinner'
import Button from '@/shared/components/Button'
import Card from '@/shared/components/Card'

// ── Month helpers ─────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function prevMonthOf(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

function prevYearOf(year: number, month: number): { year: number; month: number } {
  return { year: year - 1, month }
}

// ── Trend badge ───────────────────────────────────────────────────────────────

function TrendBadge({
  current,
  previous,
  unit = '',
}: {
  current: number
  previous: number | null | undefined
  unit?: string
}) {
  const arrow = trendArrow(current, previous)
  const pct = trendPct(current, previous)
  if (arrow === null) return <span className="text-xs text-gray-400">N/A</span>
  const color = arrow === '↑' ? 'text-green-600' : arrow === '↓' ? 'text-red-500' : 'text-gray-500'
  return (
    <span className={`text-xs font-medium ${color}`}>
      {arrow} {pct !== null ? `${Math.abs(pct)}%` : unit}
    </span>
  )
}

// ── Budget color ──────────────────────────────────────────────────────────────

function budgetColor(pct: number): string {
  if (pct >= 100) return 'text-green-600'
  if (pct >= 80) return 'text-amber-600'
  return 'text-red-500'
}

// ── Section card ──────────────────────────────────────────────────────────────

function ReportSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 print:border print:rounded-none print:shadow-none">
      <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  )
}

function MetricRow({
  label,
  value,
  sub,
  trend,
}: {
  label: string
  value: string | number
  sub?: string
  trend?: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-base font-semibold text-gray-900">{value}</span>
        {sub && <span className="text-xs text-gray-500">{sub}</span>}
        {trend}
      </span>
    </div>
  )
}

// ── Historical Import Modal ───────────────────────────────────────────────────

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [rows, setRows] = useState<HistoricalRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const csv = ev.target?.result as string
      const result = parseHistoricalCsv(csv)
      setRows(result.rows)
      setErrors(result.errors)
      setStep('preview')
    }
    reader.readAsText(file)
  }

  async function handleCommit() {
    setSaving(true)
    const { saved } = await commitHistoricalImport(rows)
    setSavedCount(saved)
    setStep('done')
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Import Historical Data</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Upload a CSV with columns: <code className="bg-gray-100 px-1 rounded text-xs">year, month, avg_weekly_attendance, giving_total, unique_givers, group_participants, confirmed_servers, kids_count, students_count</code>
              </p>
              <p className="text-sm text-gray-500">All columns except <code className="bg-gray-100 px-1 rounded text-xs">year</code> and <code className="bg-gray-100 px-1 rounded text-xs">month</code> are optional.</p>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-8 cursor-pointer hover:border-primary-400 transition-colors">
                <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span className="text-sm text-gray-600">Click to select CSV file</span>
                <input type="file" accept=".csv" className="sr-only" onChange={handleFile} />
              </label>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-red-700 mb-1">Parse errors ({errors.length}):</p>
                  <ul className="text-xs text-red-600 space-y-0.5">
                    {errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
              {rows.length > 0 && (
                <>
                  <p className="text-sm text-gray-600">{rows.length} row{rows.length !== 1 ? 's' : ''} ready to import:</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Year', 'Month', 'Avg Att.', 'Giving', 'Givers', 'Engaged', 'Servers', 'Kids', 'Students'].map(h => (
                            <th key={h} className="px-2 py-1.5 text-left font-medium text-gray-600">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-2 py-1.5">{r.year}</td>
                            <td className="px-2 py-1.5">{MONTH_NAMES[r.month - 1]}</td>
                            <td className="px-2 py-1.5">{r.avg_weekly_attendance ?? '—'}</td>
                            <td className="px-2 py-1.5">{r.giving_total != null ? formatCurrency(r.giving_total) : '—'}</td>
                            <td className="px-2 py-1.5">{r.unique_givers ?? '—'}</td>
                            <td className="px-2 py-1.5">{r.group_participants ?? '—'}</td>
                            <td className="px-2 py-1.5">{r.confirmed_servers ?? '—'}</td>
                            <td className="px-2 py-1.5">{r.kids_count ?? '—'}</td>
                            <td className="px-2 py-1.5">{r.students_count ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {rows.length === 0 && errors.length === 0 && (
                <p className="text-sm text-gray-500">No rows parsed. Please check your file format.</p>
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">✓</div>
              <p className="font-semibold text-gray-900">{savedCount} month{savedCount !== 1 ? 's' : ''} imported</p>
              <p className="text-sm text-gray-500 mt-1">Historical data is now available for trend comparisons.</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          {step === 'done' ? (
            <Button onClick={() => { onDone(); onClose() }}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              {step === 'preview' && rows.length > 0 && (
                <Button loading={saving} onClick={() => void handleCommit()}>
                  Import {rows.length} row{rows.length !== 1 ? 's' : ''}
                </Button>
              )}
              {step === 'preview' && rows.length === 0 && (
                <Button variant="ghost" onClick={() => setStep('upload')}>Try again</Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main report page ──────────────────────────────────────────────────────────

export default function MonthlyReport() {
  const { user } = useAuth()
  const { config } = useAppConfig()

  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const [report, setReport] = useState<MonthlyReportData | null>(null)
  const [loading, setLoading] = useState(true)

  // Previous month comparisons
  const [prevData, setPrevData] = useState<{
    avgWeekly: number; givingTotal: number; engagedCount: number; servedCount: number
  } | null>(null)

  // Rolling 12-month average attendance
  const [rolling12, setRolling12] = useState<number | null>(null)
  // Same month last year
  const [prevYearAvg, setPrevYearAvg] = useState<number | null>(null)

  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const monthlyBudget = (config.annual_giving_budget ?? 0) / 12

  const loadReport = useCallback(async () => {
    setLoading(true)
    setEmailSent(false)

    const [reportData, prevMonthStored, prevYearStored] = await Promise.all([
      computeMonthlyReport(year, month, monthlyBudget),
      (async () => {
        const pm = prevMonthOf(year, month)
        // Try live data first, fall back to stored history
        const live = await computeMonthlyReport(pm.year, pm.month, monthlyBudget)
        if (live.headcounts.length > 0 || live.engagedCount > 0) {
          return { avgWeekly: live.avgWeekly, givingTotal: live.givingTotal, engagedCount: live.engagedCount, servedCount: live.servedCount }
        }
        return getStoredMonthData(pm.year, pm.month)
      })(),
      (async () => {
        const py = prevYearOf(year, month)
        const live = await computeMonthlyReport(py.year, py.month, monthlyBudget)
        if (live.headcounts.length > 0) return live.avgWeekly
        const stored = await getStoredMonthData(py.year, py.month)
        return stored?.avgWeekly ?? null
      })(),
    ])

    // Rolling 12-month average attendance
    const allEntries = await db.getAttendanceEntries()
    const cutoff = new Date(year, month - 1, 1)
    cutoff.setMonth(cutoff.getMonth() - 12)
    const recentEntries = allEntries.filter(e => {
      const d = new Date(e.date)
      return d >= cutoff && (d.getFullYear() < year || (d.getFullYear() === year && d.getMonth() + 1 <= month))
    })
    if (recentEntries.length > 0) {
      // Compute total Sundays in the 12-month window
      let sundays = 0
      for (let i = 0; i < 12; i++) {
        const d = new Date(year, month - 1 - i, 1)
        sundays += countSundaysInMonth(d.getFullYear(), d.getMonth() + 1)
      }
      const totalHeads = recentEntries.reduce((s, e) => s + e.auditorium_count, 0)
      setRolling12(sundays > 0 ? Math.round((totalHeads / sundays) * 10) / 10 : null)
    } else {
      setRolling12(null)
    }

    setReport(reportData)
    setPrevData(prevMonthStored)
    setPrevYearAvg(prevYearStored)
    setLoading(false)
  }, [year, month, monthlyBudget])

  useEffect(() => { void loadReport() }, [loadReport])

  async function handleEmailReport() {
    if (!report) return
    const recipients = (config.report_recipients ?? '').split(',').map(e => e.trim()).filter(Boolean)
    if (recipients.length === 0) {
      alert('No report recipients configured. Add emails to Settings → Communications → Report Recipients.')
      return
    }
    setEmailSending(true)
    const subject = `${MONTH_NAMES[month - 1]} ${year} Vital Signs Report — ${config.church_name}`
    const body = buildEmailHtml(report, config.church_name, user?.isFinanceAdmin ?? false, monthlyBudget)
    await Promise.all(recipients.map(to => sendEmail({ to, subject, html: body })))
    setEmailSending(false)
    setEmailSent(true)
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="p-6 max-w-5xl print:p-0 print:max-w-none">
      {/* Print header (hidden on screen) */}
      <div className="hidden print:block mb-6">
        {config.logo_url && (
          <img src={config.logo_url} alt={config.church_name} className="h-10 mb-2" />
        )}
        <h1 className="text-2xl font-bold">{config.church_name}</h1>
        <p className="text-gray-600">Monthly Vital Signs Report — {MONTH_NAMES[month - 1]} {year}</p>
      </div>

      {/* Screen header */}
      <div className="print:hidden mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Monthly Vital Signs Report</h1>
            <p className="text-sm text-gray-500 mt-0.5">{config.church_name}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => setShowImport(true)}>
              Import historical data
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={emailSending}
              onClick={() => void handleEmailReport()}
            >
              {emailSent ? 'Sent ✓' : 'Email report'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              Print / PDF
            </Button>
          </div>
        </div>

        {/* Month / year selector */}
        <div className="flex items-center gap-3 mt-4">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i + 1}>{name}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      )}

      {!loading && report && (
        <div className="space-y-4">
          {/* ── Attendance ─────────────────────────────────────────────────── */}
          <ReportSection title="Attendance">
            <MetricRow
              label="Average weekly attendance"
              value={report.avgWeekly}
              sub={`${report.headcounts.length} service${report.headcounts.length !== 1 ? 's' : ''} recorded`}
              trend={<TrendBadge current={report.avgWeekly} previous={prevData?.avgWeekly} />}
            />
            <MetricRow
              label="vs rolling 12-month average"
              value={rolling12 != null ? rolling12 : '—'}
              trend={rolling12 != null ? <TrendBadge current={report.avgWeekly} previous={rolling12} /> : undefined}
            />
            <MetricRow
              label="vs same month last year"
              value={prevYearAvg != null ? prevYearAvg : '—'}
              trend={prevYearAvg != null ? <TrendBadge current={report.avgWeekly} previous={prevYearAvg} /> : undefined}
            />
            {report.headcounts.length === 0 && (
              <p className="text-xs text-amber-600 mt-2">
                No attendance entries found for this month.{' '}
                <a href="/admin/attendance" className="underline hover:text-amber-800">Enter headcounts →</a>
              </p>
            )}
          </ReportSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* ── Engagement ───────────────────────────────────────────────── */}
            <ReportSection title="Engagement">
              <MetricRow
                label="In a group this month"
                value={report.engagedCount}
                sub={`${report.engagementPctValue}% of attenders`}
                trend={<TrendBadge current={report.engagedCount} previous={prevData?.engagedCount} />}
              />
            </ReportSection>

            {/* ── Service ──────────────────────────────────────────────────── */}
            <ReportSection title="Service">
              <MetricRow
                label="Confirmed as served"
                value={report.servedCount}
                sub={`${report.servicePctValue}% of attenders`}
                trend={<TrendBadge current={report.servedCount} previous={prevData?.servedCount} />}
              />
            </ReportSection>
          </div>

          {/* ── Giving ───────────────────────────────────────────────────────── */}
          <ReportSection title="Giving">
            {user?.isFinanceAdmin ? (
              <>
                <MetricRow
                  label="Monthly giving total"
                  value={formatCurrency(report.givingTotal)}
                  trend={<TrendBadge current={report.givingTotal} previous={prevData?.givingTotal} />}
                />
                {monthlyBudget > 0 && (
                  <MetricRow
                    label="vs monthly budget"
                    value={
                      <span className={budgetColor(report.budgetPctValue)}>
                        {report.budgetPctValue}% ({formatCurrency(monthlyBudget)})
                      </span>
                    }
                  />
                )}
                <MetricRow
                  label="Unique givers"
                  value={report.uniqueGivers}
                  sub={`${report.givingPctValue}% of attenders`}
                />
              </>
            ) : (
              <MetricRow
                label="Giving participation rate"
                value={`${report.givingPctValue}%`}
                sub="of average attenders gave this month"
              />
            )}
            {report.uniqueGivers === 0 && (
              <p className="text-xs text-amber-600 mt-2">
                No giving records found for this month.{' '}
                {user?.isFinanceAdmin && (
                  <a href="/admin/giving" className="underline hover:text-amber-800">Enter giving data →</a>
                )}
              </p>
            )}
          </ReportSection>

          {/* ── Kids & Students ───────────────────────────────────────────────── */}
          <ReportSection title="Kids & Students">
            <MetricRow
              label="Kids (Pre-K – 5th grade)"
              value={report.kidsCount}
              sub={`${report.kidsPctValue}% of attenders`}
            />
            <MetricRow
              label="Students (6th – 12th grade)"
              value={report.studentsCount}
              sub={`${report.studentsPctValue}% of attenders`}
            />
            <MetricRow
              label="Combined"
              value={report.kidsCount + report.studentsCount}
              sub={`${Math.round(((report.kidsCount + report.studentsCount) / Math.max(report.avgWeekly, 1)) * 100)}% of attenders`}
            />
            {report.kidsCount === 0 && report.studentsCount === 0 && (
              <p className="text-xs text-amber-600 mt-2">
                No check-in sessions found for this month.{' '}
                <a href="/admin/checkin" className="underline hover:text-amber-800">Open check-in →</a>
              </p>
            )}
          </ReportSection>
        </div>
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onDone={() => void loadReport()}
        />
      )}
    </div>
  )
}

// ── Email HTML builder ────────────────────────────────────────────────────────

function buildEmailHtml(
  report: MonthlyReportData,
  churchName: string,
  isFinanceAdmin: boolean,
  monthlyBudget: number,
): string {
  const month = MONTH_NAMES[report.month - 1]
  const rows = [
    ['Average weekly attendance', String(report.avgWeekly)],
    ['Engagement (in a group)', `${report.engagedCount} (${report.engagementPctValue}%)`],
    ['Service (confirmed served)', `${report.servedCount} (${report.servicePctValue}%)`],
    ...(isFinanceAdmin
      ? [
          ['Monthly giving total', formatCurrency(report.givingTotal)],
          ...(monthlyBudget > 0
            ? [['vs monthly budget', `${report.budgetPctValue}% of ${formatCurrency(monthlyBudget)}`]]
            : []),
          ['Unique givers', `${report.uniqueGivers} (${report.givingPctValue}%)`],
        ]
      : [['Giving participation', `${report.givingPctValue}% of attenders`]]),
    ['Kids (Pre-K – 5th)', `${report.kidsCount} (${report.kidsPctValue}%)`],
    ['Students (6th – 12th)', `${report.studentsCount} (${report.studentsPctValue}%)`],
  ]

  const tableRows = rows
    .map(([label, value]) => `<tr><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;">${label}</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-weight:600;text-align:right;">${value}</td></tr>`)
    .join('')

  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111827;">
      <h2 style="font-size:18px;font-weight:700;margin-bottom:4px;">${churchName}</h2>
      <p style="color:#6b7280;margin-bottom:20px;">Monthly Vital Signs Report — ${month} ${report.year}</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead><tr style="background:#f9fafb;"><th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;letter-spacing:.05em;">METRIC</th><th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;letter-spacing:.05em;">VALUE</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p style="font-size:11px;color:#9ca3af;margin-top:16px;">Generated by Gather — ${new Date().toLocaleDateString()}</p>
    </div>
  `
}
