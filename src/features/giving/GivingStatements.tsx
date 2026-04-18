import { useState, useEffect } from 'react'
import { getAnnualGivingStatement, formatCurrency, formatMethod } from './giving-service'
import { db } from '@/services'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'
import { displayName } from '@/features/people/people-service'
import type { Person } from '@/shared/types'
import type { GivingStatement } from './giving-service'

export default function GivingStatements() {
  const [people,    setPeople]    = useState<Person[]>([])
  const [personId,  setPersonId]  = useState('')
  const [year,      setYear]      = useState(new Date().getFullYear())
  const [statement, setStatement] = useState<GivingStatement | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [loadingPeople, setLoadingPeople] = useState(true)

  useEffect(() => {
    db.getPeople().then(ppl => {
      setPeople(ppl.filter(p => !p.is_child && p.is_active).sort((a, b) => a.last_name.localeCompare(b.last_name)))
      setLoadingPeople(false)
    })
  }, [])

  async function handleGenerate() {
    if (!personId) return
    setLoading(true)
    setStatement(null)
    const stmt = await getAnnualGivingStatement(personId, year)
    setStatement(stmt)
    setLoading(false)
  }

  function handlePrint() {
    window.print()
  }

  const selectedPerson = people.find(p => p.id === personId)
  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 print:hidden">
        <h2 className="text-sm font-semibold text-gray-700">Generate annual giving statement</h2>
        <p className="text-xs text-gray-500">
          Select a donor and tax year to generate a printable giving statement for their records.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-600 mb-1">Donor</label>
            {loadingPeople ? (
              <Spinner size="sm" />
            ) : (
              <select
                value={personId}
                onChange={e => setPersonId(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Select person…</option>
                {people.map(p => <option key={p.id} value={p.id}>{displayName(p)}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tax year</label>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <Button onClick={() => void handleGenerate()} loading={loading} disabled={!personId}>
            Generate
          </Button>
        </div>
      </div>

      {loading && <div className="flex justify-center py-8"><Spinner /></div>}

      {statement && selectedPerson && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5 print:border-0 print:p-0">
          {/* Print button */}
          <div className="flex justify-end print:hidden">
            <Button variant="secondary" onClick={handlePrint}>Print / Save PDF</Button>
          </div>

          {/* Statement header */}
          <div className="border-b border-gray-200 pb-5">
            <h1 className="text-xl font-bold text-gray-900">{year} Annual Giving Statement</h1>
            <p className="text-sm text-gray-600 mt-1">
              Prepared for: <strong>{displayName(selectedPerson)}</strong>
            </p>
            {selectedPerson.email && (
              <p className="text-xs text-gray-500">{selectedPerson.email}</p>
            )}
          </div>

          {statement.records.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              No giving records found for {displayName(selectedPerson)} in {year}.
            </p>
          ) : (
            <>
              {/* Donations table */}
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Donation history</h2>
                <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Date</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Fund</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Method</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {statement.records.map(r => (
                      <tr key={r.id}>
                        <td className="px-4 py-2.5 text-gray-600 tabular-nums">{r.date}</td>
                        <td className="px-4 py-2.5 text-gray-700">{r.fund}</td>
                        <td className="px-4 py-2.5 text-gray-600">{formatMethod(r.method)}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-900 tabular-nums">
                          {formatCurrency(r.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-sm font-bold text-gray-900">
                        Total {year} contributions
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 tabular-nums">
                        {formatCurrency(statement.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Fund summary */}
              {statement.byFund.length > 1 && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-700 mb-3">By fund</h2>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-100">
                      {statement.byFund.map(({ fund, total }) => (
                        <tr key={fund}>
                          <td className="py-1.5 text-gray-700">{fund}</td>
                          <td className="py-1.5 text-right font-medium tabular-nums">{formatCurrency(total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tax disclaimer */}
              <div className="border-t border-gray-100 pt-4 text-xs text-gray-400 space-y-1">
                <p>
                  No goods or services were provided in exchange for these contributions, except for
                  intangible religious benefits.
                </p>
                <p>Please retain this statement for your tax records.</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
