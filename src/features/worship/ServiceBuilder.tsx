import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getEnrichedServicePlan,
  addServicePlanItem,
  updateServicePlanItem,
  deleteServicePlanItem,
  reorderServicePlanItems,
  addServiceAssignment,
  removeServiceAssignment,
  finalizeServicePlan,
  updateServicePlan,
  buildRunSheet,
  getSongs,
} from './worship-service'
import { db } from '@/services'
import { useAppConfig } from '@/services/app-config-context'
import type {
  ServicePlan, ServicePlanItem, ServicePlanItemType,
  ServiceAssignment, Song, Person,
} from '@/shared/types'
import { sendEmail } from '@/services/notification-service'
import Badge from '@/shared/components/Badge'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'
import Modal from '@/shared/components/Modal'
import EmptyState from '@/shared/components/EmptyState'
import { inputCls, labelCls, selectCls } from '@/features/setup/SetupWizard'
import type { EnrichedServicePlan } from './worship-service'

const ITEM_TYPE_LABELS: Record<ServicePlanItemType, string> = {
  song: '🎵 Song',
  scripture: '📖 Scripture',
  sermon: '🎤 Sermon',
  communion: '🍞 Communion',
  baptism: '💧 Baptism',
  bumper_video: '📽 Bumper Video',
  announcement: '📢 Announcement',
  custom: '✏️ Custom',
}

const IS_TEST = import.meta.env.VITE_TEST_MODE === 'true'

export default function ServiceBuilder() {
  const { id: planId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { config } = useAppConfig()
  const worshipRoles = config.worship_roles ?? ['Lead Vocals', 'Keys', 'Drums', 'Acoustic Guitar', 'Electric Guitar', 'Bass', 'Video', 'Audio', 'Lighting', 'Greeter']

  const [enriched, setEnriched] = useState<EnrichedServicePlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [songs, setSongs] = useState<Song[]>([])
  const [people, setPeople] = useState<Person[]>([])

  // Add item state
  const [showAddItem, setShowAddItem] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const [itemType, setItemType] = useState<ServicePlanItemType>('song')
  const [itemDuration, setItemDuration] = useState('')
  const [itemSongId, setItemSongId] = useState('')
  const [itemSongLeaderId, setItemSongLeaderId] = useState('')
  const [itemScriptureRef, setItemScriptureRef] = useState('')
  const [itemReaderId, setItemReaderId] = useState('')
  const [itemSermonTitle, setItemSermonTitle] = useState('')
  const [itemPreacherId, setItemPreacherId] = useState('')
  const [itemLabel, setItemLabel] = useState('')
  const [itemNotes, setItemNotes] = useState('')

  // Add assignment state
  const [showAddAssignment, setShowAddAssignment] = useState(false)
  const [assignPersonId, setAssignPersonId] = useState('')
  const [assignRole, setAssignRole] = useState(worshipRoles[0] ?? '')
  const [addingAssignment, setAddingAssignment] = useState(false)

  // Run sheet / email state
  const [startTime, setStartTime] = useState('10:00')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  useEffect(() => {
    if (!planId) return
    Promise.all([
      planId ? (() => { setLoading(true); return getEnrichedServicePlan(planId) })() : Promise.resolve(null),
      getSongs(),
      db.getPeople(),
    ]).then(([e, s, p]) => {
      setEnriched(e)
      setSongs(s)
      setPeople(p.filter(person => person.is_active && !person.is_child))
      setLoading(false)
    })
  }, [planId])

  async function reload() {
    if (!planId) return
    const e = await getEnrichedServicePlan(planId)
    setEnriched(e)
  }

  async function handleAddItem() {
    if (!planId) return
    setAddingItem(true)
    try {
      await addServicePlanItem(planId, {
        item_type: itemType,
        duration_minutes: itemDuration ? parseInt(itemDuration) : undefined,
        song_id: itemType === 'song' && itemSongId ? itemSongId : undefined,
        song_leader_id: itemType === 'song' && itemSongLeaderId ? itemSongLeaderId : undefined,
        scripture_reference: itemType === 'scripture' && itemScriptureRef ? itemScriptureRef : undefined,
        reader_id: itemType === 'scripture' && itemReaderId ? itemReaderId : undefined,
        sermon_title: itemType === 'sermon' && itemSermonTitle ? itemSermonTitle : undefined,
        preacher_id: itemType === 'sermon' && itemPreacherId ? itemPreacherId : undefined,
        label: (['announcement', 'custom', 'communion', 'baptism', 'bumper_video'].includes(itemType) && itemLabel) ? itemLabel : undefined,
        notes: itemNotes || undefined,
      })
      await reload()
      setShowAddItem(false)
      setItemSongId('')
      setItemSongLeaderId('')
      setItemScriptureRef('')
      setItemReaderId('')
      setItemSermonTitle('')
      setItemPreacherId('')
      setItemLabel('')
      setItemNotes('')
      setItemDuration('')
    } finally {
      setAddingItem(false)
    }
  }

  async function handleDeleteItem(itemId: string) {
    await deleteServicePlanItem(itemId)
    await reload()
  }

  async function handleMoveItem(item: ServicePlanItem, direction: 'up' | 'down') {
    if (!enriched) return
    const items = [...enriched.items]
    const idx = items.findIndex(i => i.id === item.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= items.length) return
    const orderedIds = items.map(i => i.id)
    const temp = orderedIds[idx]
    orderedIds[idx] = orderedIds[swapIdx]
    orderedIds[swapIdx] = temp
    if (!planId) return
    await reorderServicePlanItems(planId, orderedIds)
    await reload()
  }

  async function handleAddAssignment() {
    if (!planId || !assignPersonId || !assignRole) return
    setAddingAssignment(true)
    try {
      await addServiceAssignment(planId, assignPersonId, assignRole)
      await reload()
      setShowAddAssignment(false)
      setAssignPersonId('')
    } finally {
      setAddingAssignment(false)
    }
  }

  async function handleRemoveAssignment(id: string) {
    await removeServiceAssignment(id)
    await reload()
  }

  async function handleFinalize() {
    if (!planId) return
    await finalizeServicePlan(planId)
    await reload()
  }

  async function handleEmailTeam() {
    if (!enriched || !planId) return
    setSendingEmail(true)
    try {
      const runSheet = await buildRunSheet(planId, startTime)
      const serviceDate = enriched.plan.service_date

      if (IS_TEST) {
        console.log('[ServiceBuilder] Email team — run sheet:', runSheet)
        setEmailSent(true)
        return
      }

      for (const { assignment, person } of enriched.assignments) {
        if (!person?.email) continue
        const lines = runSheet.map(line => {
          const label = ITEM_TYPE_LABELS[line.item.item_type] ?? line.item.item_type
          const detail = line.songTitle ?? line.item.sermon_title ?? line.item.scripture_reference ?? line.item.label ?? ''
          return `${line.startTime}  ${label}${detail ? ` — ${detail}` : ''}  (${line.item.duration_minutes ?? 0} min)`
        }).join('\n')

        await sendEmail({
          to: person.email,
          subject: `${enriched.plan.name} — Service Plan for ${serviceDate}`,
          body: `Hi ${person.first_name},\n\nHere is the service order for ${serviceDate}:\n\n${lines}\n\nYour role: ${assignment.role}\n\nTotal runtime: ${enriched.totalMinutes} minutes\n\nGather`,
          personId: person.id,
        })
      }
      setEmailSent(true)
    } finally {
      setSendingEmail(false)
    }
  }

  function personLabel(id: string) {
    const p = people.find(x => x.id === id)
    return p ? `${p.first_name} ${p.last_name}` : id
  }

  function songLabel(id: string) {
    const s = songs.find(x => x.id === id)
    return s ? s.title : id
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  if (!enriched) return (
    <div className="p-8 text-center">
      <p className="text-gray-500">Service plan not found.</p>
      <Button variant="ghost" className="mt-4" onClick={() => navigate('/admin/worship/services')}>Back</Button>
    </div>
  )

  const { plan, items, assignments, totalMinutes } = enriched

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/worship/services')}
          className="text-gray-400 hover:text-gray-600 p-1 rounded">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{plan.name}</h1>
            <Badge variant={plan.is_finalized ? 'success' : 'default'}>
              {plan.is_finalized ? 'Finalized' : 'Draft'}
            </Badge>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{plan.service_date} · {totalMinutes} min total</p>
        </div>
        {!plan.is_finalized && (
          <Button onClick={handleFinalize} variant="secondary">Finalize Plan</Button>
        )}
      </div>

      {/* Run sheet controls */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-semibold text-gray-800 mb-3">Run Sheet</h2>
        <div className="flex items-center gap-3">
          <div>
            <label className={labelCls}>Service start time</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputCls} style={{ width: '120px' }} />
          </div>
          <div className="flex gap-2 items-end">
            <button onClick={() => window.print()}
              className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              🖨️ Print
            </button>
            <button onClick={() => void handleEmailTeam()} disabled={sendingEmail || assignments.length === 0}
              className="px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-40 transition-colors">
              {sendingEmail ? 'Sending…' : '📧 Email Team'}
            </button>
          </div>
          {emailSent && <span className="text-sm text-green-600">✓ Sent</span>}
        </div>
      </div>

      {/* Order of service */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Order of Service</h2>
          <Button size="sm" onClick={() => setShowAddItem(true)}>+ Add Item</Button>
        </div>

        {items.length === 0 ? (
          <EmptyState title="No items yet" description="Add songs, scripture, sermon, and more." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-500 w-8">#</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Type</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Detail</th>
                <th className="px-4 py-2 text-right font-medium text-gray-500">Min</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item, idx) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="px-4 py-3 text-gray-700">{ITEM_TYPE_LABELS[item.item_type]}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {item.song_id && <span className="font-medium">{songLabel(item.song_id)}</span>}
                    {item.song_leader_id && <span className="text-gray-400 text-xs ml-2">— {personLabel(item.song_leader_id)}</span>}
                    {item.scripture_reference && <span>{item.scripture_reference}</span>}
                    {item.reader_id && <span className="text-gray-400 text-xs ml-2">— {personLabel(item.reader_id)}</span>}
                    {item.sermon_title && <span className="font-medium">{item.sermon_title}</span>}
                    {item.preacher_id && <span className="text-gray-400 text-xs ml-2">— {personLabel(item.preacher_id)}</span>}
                    {item.label && <span>{item.label}</span>}
                    {item.notes && <div className="text-xs text-gray-400 mt-0.5">{item.notes}</div>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{item.duration_minutes ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => void handleMoveItem(item, 'up')} disabled={idx === 0}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">↑</button>
                      <button onClick={() => void handleMoveItem(item, 'down')} disabled={idx === items.length - 1}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">↓</button>
                      <button onClick={() => void handleDeleteItem(item.id)}
                        className="p-1 text-red-400 hover:text-red-600 text-xs">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-100">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-xs text-gray-500 font-medium">Total runtime</td>
                <td className="px-4 py-2 text-right font-semibold text-gray-900">{totalMinutes} min</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Team assignments */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Team Assignment</h2>
          <Button size="sm" onClick={() => setShowAddAssignment(true)}>+ Assign</Button>
        </div>
        {assignments.length === 0 ? (
          <EmptyState title="No team assigned" description="Assign volunteers to roles for this service." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Person</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Role</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {assignments.map(({ assignment, person }) => (
                <tr key={assignment.id}>
                  <td className="px-4 py-3 text-gray-900">
                    {person ? `${person.first_name} ${person.last_name}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{assignment.role}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => void handleRemoveAssignment(assignment.id)}
                      className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Item Modal */}
      <Modal isOpen={showAddItem} onClose={() => setShowAddItem(false)} title="Add Item">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Item Type</label>
              <select value={itemType} onChange={e => setItemType(e.target.value as ServicePlanItemType)} className={selectCls}>
                {(Object.keys(ITEM_TYPE_LABELS) as ServicePlanItemType[]).map(t => (
                  <option key={t} value={t}>{ITEM_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Duration (minutes)</label>
              <input type="number" value={itemDuration} onChange={e => setItemDuration(e.target.value)}
                placeholder="5" min="0" className={inputCls} />
            </div>
          </div>

          {itemType === 'song' && (
            <>
              <div>
                <label className={labelCls}>Song</label>
                <select value={itemSongId} onChange={e => setItemSongId(e.target.value)} className={selectCls}>
                  <option value="">— select song —</option>
                  {songs.map(s => <option key={s.id} value={s.id}>{s.title}{s.key ? ` (${s.key})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Song Leader</label>
                <select value={itemSongLeaderId} onChange={e => setItemSongLeaderId(e.target.value)} className={selectCls}>
                  <option value="">— select person —</option>
                  {people.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
                </select>
              </div>
            </>
          )}

          {itemType === 'scripture' && (
            <>
              <div>
                <label className={labelCls}>Scripture Reference</label>
                <input type="text" value={itemScriptureRef} onChange={e => setItemScriptureRef(e.target.value)}
                  placeholder="e.g. John 3:16" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Reader</label>
                <select value={itemReaderId} onChange={e => setItemReaderId(e.target.value)} className={selectCls}>
                  <option value="">— select person —</option>
                  {people.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
                </select>
              </div>
            </>
          )}

          {itemType === 'sermon' && (
            <>
              <div>
                <label className={labelCls}>Sermon Title</label>
                <input type="text" value={itemSermonTitle} onChange={e => setItemSermonTitle(e.target.value)}
                  placeholder="Sermon title" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Preacher</label>
                <select value={itemPreacherId} onChange={e => setItemPreacherId(e.target.value)} className={selectCls}>
                  <option value="">— select person —</option>
                  {people.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
                </select>
              </div>
            </>
          )}

          {['announcement', 'custom', 'communion', 'baptism', 'bumper_video'].includes(itemType) && (
            <div>
              <label className={labelCls}>Label / Title</label>
              <input type="text" value={itemLabel} onChange={e => setItemLabel(e.target.value)}
                placeholder="Label or title" className={inputCls} />
            </div>
          )}

          <div>
            <label className={labelCls}>Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="text" value={itemNotes} onChange={e => setItemNotes(e.target.value)}
              placeholder="Any notes…" className={inputCls} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddItem(false)}>Cancel</Button>
            <Button onClick={handleAddItem} loading={addingItem}>Add Item</Button>
          </div>
        </div>
      </Modal>

      {/* Add Assignment Modal */}
      <Modal isOpen={showAddAssignment} onClose={() => setShowAddAssignment(false)} title="Assign Team Member">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Person</label>
            <select value={assignPersonId} onChange={e => setAssignPersonId(e.target.value)} className={selectCls}>
              <option value="">— select person —</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Role</label>
            <select value={assignRole} onChange={e => setAssignRole(e.target.value)} className={selectCls}>
              {worshipRoles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddAssignment(false)}>Cancel</Button>
            <Button onClick={handleAddAssignment} loading={addingAssignment} disabled={!assignPersonId || !assignRole}>
              Assign
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
