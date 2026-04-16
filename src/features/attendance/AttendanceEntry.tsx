import { useState, useEffect } from 'react'
import { db } from '@/services'
import { useAppConfig } from '@/services/app-config-context'
import { createAttendanceEntry, getAttendanceEntries, sumEntry } from './attendance-service'
import type { AttendanceEntry, ServiceTime } from '@/shared/types'
import Spinner from '@/shared/components/Spinner'
import EmptyState from '@/shared/components/EmptyState'
import { inputCls, labelCls, selectCls } from '@/features/setup/SetupWizard'

export default function AttendanceEntryPage() {
  const { config } = useAppConfig()
  const serviceTimes: ServiceTime[] = config.service_times ?? []

  const [entries, setEntries] = useState<AttendanceEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  // Form state
  const [serviceTimeId, setServiceTimeId] = useState(serviceTimes[0]?.id ?? '')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [auditorium, setAuditorium] = useState('')
  const [students, setStudents] = useState('')
  const [online, setOnline] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    getAttendanceEntries().then(e => { setEntries(e); setLoading(false) })
  }, [])

  async function handleSave() {
    if (!serviceTimeId || !auditorium) return
    setSaving(true)
    setSuccess(false)
    try {
      const newEntry = await createAttendanceEntry({
        service_time_id: serviceTimeId,
        date,
        auditorium_count: parseInt(auditorium) || 0,
        students_count: students ? parseInt(students) : undefined,
        online_count: online ? parseInt(online) : undefined,
        notes: notes || undefined,
        recorded_by: 'staff',
      })
      setEntries(prev => [newEntry, ...prev])
      setAuditorium('')
      setStudents('')
      setOnline('')
      setNotes('')
      setSuccess(true)
    } finally {
      setSaving(false)
    }
  }

  const stLabel = (id: string) => {
    const st = serviceTimes.find(t => t.id === id)
    if (!st) return id
    return `${st.day} ${st.time}${st.label ? ` (${st.label})` : ''}`
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Attendance Entry</h1>
        <p className="text-gray-500 text-sm mt-1">Record attendance headcounts for each service.</p>
      </div>

      {/* Entry form */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Record Attendance</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Service Time</label>
            <select value={serviceTimeId} onChange={e => setServiceTimeId(e.target.value)} className={selectCls}>
              {serviceTimes.map(st => (
                <option key={st.id} value={st.id}>{st.day} {st.time}{st.label ? ` (${st.label})` : ''}</option>
              ))}
              {serviceTimes.length === 0 && <option value="">No service times configured</option>}
            </select>
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Auditorium Count *</label>
            <input type="number" value={auditorium} onChange={e => setAuditorium(e.target.value)}
              placeholder="0" min="0" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Students <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="number" value={students} onChange={e => setStudents(e.target.value)}
              placeholder="0" min="0" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Online <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="number" value={online} onChange={e => setOnline(e.target.value)}
              placeholder="0" min="0" className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Optional notes…" className={inputCls} />
        </div>
        {success && (
          <div className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-2">✓ Attendance recorded.</div>
        )}
        <button onClick={handleSave} disabled={saving || !auditorium || !serviceTimeId}
          className="px-5 py-2 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-40 transition-colors">
          {saving ? 'Saving…' : 'Save Entry'}
        </button>
      </div>

      {/* Recent entries */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-4 pt-4 pb-2 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Recent Entries</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : entries.length === 0 ? (
          <EmptyState title="No entries yet" description="Record your first attendance entry above." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Service</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Auditorium</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 hidden sm:table-cell">Students</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 hidden sm:table-cell">Online</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.map(e => {
                const s = sumEntry(e)
                return (
                  <tr key={e.id}>
                    <td className="px-4 py-3 text-gray-900">{e.date}</td>
                    <td className="px-4 py-3 text-gray-600">{stLabel(e.service_time_id)}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{s.auditorium}</td>
                    <td className="px-4 py-3 text-right text-gray-500 hidden sm:table-cell">{s.students || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-500 hidden sm:table-cell">{s.online || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-primary-700">{s.total}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
