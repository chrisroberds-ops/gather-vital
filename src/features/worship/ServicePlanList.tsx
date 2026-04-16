import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getServicePlans, createServicePlan, deleteServicePlan } from './worship-service'
import type { ServicePlan } from '@/shared/types'
import { useAppConfig } from '@/services/app-config-context'
import { useAuth } from '@/auth/AuthContext'
import Button from '@/shared/components/Button'
import Badge from '@/shared/components/Badge'
import EmptyState from '@/shared/components/EmptyState'
import Spinner from '@/shared/components/Spinner'
import { inputCls, labelCls, selectCls } from '@/features/setup/SetupWizard'
import type { ServiceTime } from '@/shared/types'

export default function ServicePlanList() {
  const navigate = useNavigate()
  const { config } = useAppConfig()
  const { user } = useAuth()
  const serviceTimes: ServiceTime[] = config.service_times ?? []

  const [plans, setPlans] = useState<ServicePlan[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [creating, setCreating] = useState(false)

  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0])
  const [newTimeId, setNewTimeId] = useState(serviceTimes[0]?.id ?? '')

  useEffect(() => {
    getServicePlans().then(p => { setPlans(p); setLoading(false) })
  }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const plan = await createServicePlan({
        name: newName.trim(),
        service_date: newDate,
        service_time_id: newTimeId || undefined,
        created_by: user?.uid ?? 'staff',
      })
      setPlans(prev => [plan, ...prev])
      setShowNew(false)
      setNewName('')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(plan: ServicePlan) {
    if (!confirm(`Delete service plan "${plan.name}"?`)) return
    await deleteServicePlan(plan.id)
    setPlans(prev => prev.filter(p => p.id !== plan.id))
  }

  const stLabel = (id?: string) => {
    if (!id) return '—'
    const st = serviceTimes.find(t => t.id === id)
    if (!st) return id
    return `${st.day} ${st.time}${st.label ? ` (${st.label})` : ''}`
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Service Plans</h1>
          <p className="text-gray-500 text-sm mt-0.5">Build and manage your order of service.</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Plan
        </Button>
      </div>

      {showNew && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6 space-y-4">
          <h2 className="font-semibold text-gray-800">New Service Plan</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <label className={labelCls}>Plan Name *</label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Sunday Morning" autoFocus className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Service Time</label>
              <select value={newTimeId} onChange={e => setNewTimeId(e.target.value)} className={selectCls}>
                <option value="">—</option>
                {serviceTimes.map(st => (
                  <option key={st.id} value={st.id}>{st.day} {st.time}{st.label ? ` (${st.label})` : ''}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={creating} disabled={!newName.trim()}>Create Plan</Button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : plans.length === 0 ? (
          <EmptyState title="No service plans yet"
            description="Create your first service plan to start building your order of service."
            action={<Button onClick={() => setShowNew(true)}>New Plan</Button>} />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Plan</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 hidden sm:table-cell">Service Time</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {plans.map(plan => (
                <tr key={plan.id} className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/admin/worship/services/${plan.id}`)}>
                  <td className="px-4 py-3 font-medium text-gray-900">{plan.name}</td>
                  <td className="px-4 py-3 text-gray-600">{plan.service_date}</td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{stLabel(plan.service_time_id)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={plan.is_finalized ? 'success' : 'default'}>
                      {plan.is_finalized ? 'Finalized' : 'Draft'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <button onClick={() => void handleDelete(plan)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
