import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getGivingRecords,
  createGivingRecord,
  updateGivingRecord,
  deleteGivingRecord,
  computeGivingSummary,
  formatCurrency,
  formatMethod,
  type GivingSummary,
} from './giving-service'
import GivingImport from './GivingImport'
import { db } from '@/services'
import Button from '@/shared/components/Button'
import Badge from '@/shared/components/Badge'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'
import EmptyState from '@/shared/components/EmptyState'
import { displayName } from '@/features/people/people-service'
import type { GivingRecord, GivingMethod, Person } from '@/shared/types'

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = 'records' | 'summary' | 'import'

const inputCls = 'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

const METHOD_OPTIONS: { value: GivingMethod; label: string }[] = [
  { value: 'cash',       label: 'Cash' },
  { value: 'check',      label: 'Check' },
  { value: 'online_card', label: 'Credit/Debit Card' },
  { value: 'online_ach', label: 'Bank Transfer (ACH)' },
]

const METHOD_VARIANT: Record<GivingMethod, 'success' | 'warning' | 'default' | 'purple'> = {
  cash:        'success',
  check:       'warning',
  online_card: 'purple',
  online_ach:  'default',
}

// ── Record form ───────────────────────────────────────────────────────────────

interface RecordFormProps {
  initial?: GivingRecord
  people: Person[]
  onSave: () => void
  onCancel: () => void
}

function RecordForm({ initial, people, onSave, onCancel }: RecordFormProps) {
  const [personId, setPersonId] = useState(initial?.person_id ?? '')
  const [amount,   setAmount]   = useState(initial ? String(initial.amount) : '')
  const [date,     setDate]     = useState(initial?.date ?? new Date().toISOString().split('T')[0])
  const [method,   setMethod]   = useState<GivingMethod>(initial?.method ?? 'cash')
  const [fund,     setFund]     = useState(initial?.fund ?? 'General')
  const [notes,    setNotes]    = useState(initial?.notes ?? '')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const adults = people.filter(p => !p.is_child && p.is_active)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amountNum = parseFloat(amount)
    if (!personId) { setError('Please select a person.'); return }
    if (isNaN(amountNum) || amountNum <= 0) { setError('Enter a valid amount.'); return }
    if (!date) { setError('Please select a date.'); return }

    setSaving(true)
    setError('')
    try {
      if (initial) {
        await updateGivingRecord(initial.id, {
          person_id: personId,
          amount: amountNum,
          date,
          method,
          fund: fund.trim() || 'General',
          notes: notes.trim() || undefined,
        })
      } else {
        await createGivingRecord({
          personId,
          amount: amountNum,
          date,
          method,
          fund: fund.trim() || 'General',
          notes: notes.trim() || undefined,
        })
      }
      onSave()
    } catch {
      setError('Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div>
        <label className={labelCls}>Person *</label>
        <select value={personId} onChange={e => setPersonId(e.target.value)} className={inputCls} required>
          <option value="">Select person…</option>
          {adults.map(p => (
            <option key={p.id} value={p.id}>{displayName(p)}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Amount ($) *</label>
          <input type="number" min="0.01" step="0.01" value={amount}
            onChange={e => setAmount(e.target.value)} className={inputCls} placeholder="0.00" required />
        </div>
        <div>
          <label className={labelCls}>Date *</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Method</label>
          <select value={method} onChange={e => setMethod(e.target.value as GivingMethod)} className={inputCls}>
            {METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Fund</label>
          <input type="text" value={fund} onChange={e => setFund(e.target.value)}
            placeholder="General" className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Notes (optional)</label>
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="e.g. check #1042" className={inputCls} />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="submit" loading={saving}>{initial ? 'Save changes' : 'Add record'}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}

// ── Summary panel ─────────────────────────────────────────────────────────────

function SummaryPanel({ summary }: { summary: GivingSummary }) {
  const max = Math.max(...summary.monthlyTotals.map(m => m.total), 1)

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">YTD Total</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.ytd)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Records</p>
          <p className="text-2xl font-bold text-gray-900">{summary.totalRecords}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Funds</p>
          <p className="text-2xl font-bold text-gray-900">{summary.fundBreakdown.length}</p>
        </div>
      </div>

      {/* Monthly trend sparkline */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Monthly giving — last 12 months</h3>
        <div className="flex items-end gap-1.5 h-24">
          {summary.monthlyTotals.map(({ month, total }) => (
            <div key={month} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-primary-500 rounded-t-sm transition-all hover:bg-primary-600"
                style={{ height: `${Math.round((total / max) * 80) + (total > 0 ? 4 : 0)}px` }}
                title={`${month}: ${formatCurrency(total)}`}
              />
              <span className="text-[9px] text-gray-400 rotate-45 origin-left mt-1 whitespace-nowrap">
                {month.slice(5)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Fund breakdown */}
      {summary.fundBreakdown.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">By fund</h3>
          <div className="space-y-3">
            {summary.fundBreakdown.map(({ fund, total, pct }) => (
              <div key={fund}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-800">{fund}</span>
                  <span className="text-gray-500">{formatCurrency(total)} · {pct}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Records table ─────────────────────────────────────────────────────────────

function RecordsTable({
  records,
  people,
  onEdit,
  onDelete,
}: {
  records: GivingRecord[]
  people: Map<string, Person>
  onEdit: (r: GivingRecord) => void
  onDelete: (id: string) => void
}) {
  const [filterFund,   setFilterFund]   = useState('')
  const [filterMethod, setFilterMethod] = useState<'' | GivingMethod>('')
  const [filterPerson, setFilterPerson] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const funds = [...new Set(records.map(r => r.fund))].sort()

  const filtered = records.filter(r => {
    if (filterFund   && r.fund !== filterFund) return false
    if (filterMethod && r.method !== filterMethod) return false
    if (filterPerson && r.person_id !== filterPerson) return false
    return true
  })

  async function handleDelete(id: string) {
    setDeleting(id)
    await onDelete(id)
    setDeleting(null)
  }

  const uniquePeople = [...new Set(records.map(r => r.person_id))]
    .map(id => people.get(id))
    .filter((p): p is Person => !!p)
    .sort((a, b) => a.last_name.localeCompare(b.last_name))

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={filterPerson} onChange={e => setFilterPerson(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600">
          <option value="">All people</option>
          {uniquePeople.map(p => <option key={p.id} value={p.id}>{displayName(p)}</option>)}
        </select>
        <select value={filterFund} onChange={e => setFilterFund(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600">
          <option value="">All funds</option>
          {funds.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={filterMethod} onChange={e => setFilterMethod(e.target.value as '' | GivingMethod)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600">
          <option value="">All methods</option>
          {METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {(filterFund || filterMethod || filterPerson) && (
          <button onClick={() => { setFilterFund(''); setFilterMethod(''); setFilterPerson('') }}
            className="text-xs text-primary-600 hover:underline">
            Clear filters
          </button>
        )}
        <span className="text-xs text-gray-400 self-center ml-auto">{filtered.length} records</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No records" description="No giving records match your filters." />
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 text-left">
              <tr>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500">Person</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500">Date</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500">Amount</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 hidden sm:table-cell">Fund</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">Method</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(r => {
                const person = people.get(r.person_id)
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {person ? displayName(person) : <span className="text-gray-400 italic">Unknown</span>}
                    </td>
                    <td className="px-5 py-3 text-gray-600 tabular-nums">{r.date}</td>
                    <td className="px-5 py-3 font-semibold text-gray-900 tabular-nums">{formatCurrency(r.amount)}</td>
                    <td className="px-5 py-3 text-gray-600 hidden sm:table-cell">{r.fund}</td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      <Badge variant={METHOD_VARIANT[r.method]}>{formatMethod(r.method)}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => onEdit(r)}
                          className="text-xs text-primary-600 hover:text-primary-800 font-medium">Edit</button>
                        {deleting === r.id
                          ? <Spinner size="sm" />
                          : <button onClick={() => void handleDelete(r.id)}
                              className="text-xs text-red-400 hover:text-red-600">Delete</button>
                        }
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GivingDashboard() {
  const navigate = useNavigate()
  const [tab,       setTab]      = useState<Tab>('records')
  const [records,   setRecords]  = useState<GivingRecord[]>([])
  const [people,    setPeople]   = useState<Map<string, Person>>(new Map())
  const [allPeople, setAllPeople] = useState<Person[]>([])
  const [summary,   setSummary]  = useState<GivingSummary | null>(null)
  const [loading,   setLoading]  = useState(true)
  const [showForm,  setShowForm] = useState(false)
  const [editing,   setEditing]  = useState<GivingRecord | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const [recs, ppl] = await Promise.all([
      getGivingRecords(),
      db.getPeople(),
    ])
    setRecords(recs)
    setAllPeople(ppl)
    const map = new Map(ppl.map(p => [p.id, p]))
    setPeople(map)
    setSummary(computeGivingSummary(recs))
    setLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])

  function handleEdit(r: GivingRecord) {
    setEditing(r)
    setShowForm(true)
  }

  async function handleDelete(id: string) {
    await deleteGivingRecord(id)
    await reload()
  }

  function handleFormSave() {
    setShowForm(false)
    setEditing(null)
    void reload()
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'records', label: 'Records' },
    { id: 'summary', label: 'Summary' },
    { id: 'import',  label: 'Import' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-2 font-medium ${tab === t.id ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'records' && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate('/admin/giving/statements')}>
              Statements
            </Button>
            <Button onClick={() => { setEditing(null); setShowForm(true) }}>
              + Add record
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <>
          {tab === 'records' && (
            <RecordsTable
              records={records}
              people={people}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
          {tab === 'summary' && summary && <SummaryPanel summary={summary} />}
          {tab === 'import' && <GivingImport onImported={() => { setTab('records'); void reload() }} />}
        </>
      )}

      {/* Add / Edit modal */}
      <Modal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditing(null) }}
        title={editing ? 'Edit giving record' : 'Add giving record'}
      >
        <RecordForm
          initial={editing ?? undefined}
          people={allPeople}
          onSave={handleFormSave}
          onCancel={() => { setShowForm(false); setEditing(null) }}
        />
      </Modal>
    </div>
  )
}
