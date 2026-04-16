import { useState, useRef, useCallback } from 'react'
import { db } from '@/services'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'
import type { MembershipStatus, GroupType, GivingMethod } from '@/shared/types'

// ── CSV Parser ────────────────────────────────────────────────────────────────

function parseCsv(raw: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const nonEmpty = lines.filter(l => l.trim())
  if (nonEmpty.length === 0) return { headers: [], rows: [] }

  function parseRow(line: string): string[] {
    const fields: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        fields.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    fields.push(cur.trim())
    return fields
  }

  const headers = parseRow(nonEmpty[0])
  const rows = nonEmpty.slice(1).map(line => {
    const vals = parseRow(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
    return row
  }).filter(row => Object.values(row).some(v => v.trim()))

  return { headers, rows }
}

// ── Field definitions ─────────────────────────────────────────────────────────

type ImportType = 'people' | 'households' | 'groups' | 'giving'

interface SystemField {
  key: string
  label: string
  required: boolean
  hint?: string
}

const PEOPLE_FIELDS: SystemField[] = [
  { key: 'first_name',         label: 'First Name',         required: true },
  { key: 'last_name',          label: 'Last Name',          required: true },
  { key: 'preferred_name',     label: 'Preferred Name',     required: false },
  { key: 'email',              label: 'Email',              required: false },
  { key: 'phone',              label: 'Phone',              required: false },
  { key: 'date_of_birth',      label: 'Date of Birth',      required: false, hint: 'YYYY-MM-DD or MM/DD/YYYY' },
  { key: 'is_child',           label: 'Is Child',           required: false, hint: '"true", "yes", "1", "child"' },
  { key: 'gender_identity',    label: 'Gender',             required: false },
  { key: 'membership_status',  label: 'Membership Status',  required: false, hint: 'member | regular_attender | visitor | inactive' },
  { key: 'allergies',          label: 'Allergies',          required: false },
]

const HOUSEHOLD_FIELDS: SystemField[] = [
  { key: 'name',           label: 'Household Name',  required: true },
  { key: 'address_line_1', label: 'Address Line 1',  required: false },
  { key: 'address_line_2', label: 'Address Line 2',  required: false },
  { key: 'city',           label: 'City',            required: false },
  { key: 'state',          label: 'State',           required: false },
  { key: 'zip',            label: 'ZIP Code',        required: false },
]

const GROUP_FIELDS: SystemField[] = [
  { key: 'name',         label: 'Group Name',   required: true },
  { key: 'description',  label: 'Description',  required: false },
  { key: 'group_type',   label: 'Group Type',   required: false, hint: 'small_group | class | ministry | support | other' },
  { key: 'meeting_day',  label: 'Meeting Day',  required: false },
  { key: 'meeting_time', label: 'Meeting Time', required: false },
  { key: 'location',     label: 'Location',     required: false },
  { key: 'max_capacity', label: 'Max Capacity', required: false },
]

const GIVING_FIELDS: SystemField[] = [
  { key: 'person_email', label: 'Person Email (lookup)', required: true, hint: 'Used to match existing person records' },
  { key: 'date',         label: 'Gift Date',             required: true, hint: 'YYYY-MM-DD or MM/DD/YYYY' },
  { key: 'amount',       label: 'Amount',                required: true, hint: 'Numeric, e.g. 50.00' },
  { key: 'fund',         label: 'Fund',                  required: false, hint: 'e.g. General, Missions, Building' },
  { key: 'method',       label: 'Payment Method',        required: false, hint: 'cash | check | online_card | online_ach' },
  { key: 'notes',        label: 'Notes',                 required: false },
]

function fieldsFor(type: ImportType): SystemField[] {
  if (type === 'people')     return PEOPLE_FIELDS
  if (type === 'households') return HOUSEHOLD_FIELDS
  if (type === 'groups')     return GROUP_FIELDS
  return GIVING_FIELDS
}

const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  people:     'People',
  households: 'Households',
  groups:     'Groups',
  giving:     'Giving Records',
}

// ── Types ─────────────────────────────────────────────────────────────────────

type RowStatus = 'ready' | 'duplicate' | 'skipped'

interface PreviewRow {
  index: number
  raw: Record<string, string>
  mapped: Record<string, string>
  status: RowStatus
  reason?: string
}

type Mapping = Record<string, string>  // csvColumn → systemFieldKey | 'ignore'

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeDate(v: string): string {
  if (!v) return ''
  const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  const m = v.match(mmddyyyy)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return v  // assume already ISO
}

function isTruthy(v: string): boolean {
  return ['true', 'yes', '1', 'child', 'y'].includes(v.trim().toLowerCase())
}

function coerceMembershipStatus(v: string): MembershipStatus {
  const norm = v.trim().toLowerCase().replace(/\s+/g, '_')
  const valid: MembershipStatus[] = ['member', 'regular_attender', 'visitor', 'inactive']
  return valid.includes(norm as MembershipStatus) ? (norm as MembershipStatus) : 'visitor'
}

function coerceGroupType(v: string): GroupType {
  const norm = v.trim().toLowerCase().replace(/\s+/g, '_')
  const valid: GroupType[] = ['small_group', 'class', 'ministry', 'support', 'other']
  return valid.includes(norm as GroupType) ? (norm as GroupType) : 'small_group'
}

function coerceGivingMethod(v: string): GivingMethod {
  const norm = v.trim().toLowerCase().replace(/[\s-]+/g, '_')
  const valid: GivingMethod[] = ['cash', 'check', 'online_card', 'online_ach']
  return valid.includes(norm as GivingMethod) ? (norm as GivingMethod) : 'cash'
}

function applyMapping(row: Record<string, string>, mapping: Mapping): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [csvCol, sysKey] of Object.entries(mapping)) {
    if (sysKey && sysKey !== 'ignore') {
      const val = row[csvCol]?.trim() ?? ''
      if (val) out[sysKey] = val
    }
  }
  return out
}

// ── Main component ────────────────────────────────────────────────────────────

type Step = 'upload' | 'map' | 'preview' | 'done'

export default function ImportPage() {
  const [step, setStep] = useState<Step>('upload')
  const [importType, setImportType] = useState<ImportType>('people')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Mapping>({})
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [previewing, setPreviewing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number; duplicates: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Step 1: Upload ──────────────────────────────────────────────────────────

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const parsed = parseCsv(text)
      setHeaders(parsed.headers)
      setRows(parsed.rows)
      // Auto-map columns whose names closely match system field labels
      const fields = fieldsFor(importType)
      const autoMap: Mapping = {}
      parsed.headers.forEach(h => {
        const norm = h.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const match = fields.find(f => {
          const fNorm = f.key.replace(/_/g, '')
          const hNorm = norm.replace(/_/g, '')
          return fNorm === hNorm || f.label.toLowerCase().replace(/[^a-z0-9]/g, '') === norm.replace(/_/g, '')
        })
        autoMap[h] = match ? match.key : 'ignore'
      })
      setMapping(autoMap)
      setStep('map')
    }
    reader.readAsText(file)
  }

  // ── Step 2: Map → Step 3: Preview ─────────────────────────────────────────

  const buildPreview = useCallback(async () => {
    setPreviewing(true)
    const fields = fieldsFor(importType)
    const required = fields.filter(f => f.required).map(f => f.key)

    const previewed: PreviewRow[] = []

    if (importType === 'people') {
      // Load existing people for duplicate detection (by phone or email)
      const existing = await db.getPeople()
      const byPhone = new Map(existing.map(p => [p.phone?.replace(/\D/g, ''), p]))
      const byEmail = new Map(existing.map(p => [p.email?.toLowerCase(), p]))

      for (let i = 0; i < rows.length; i++) {
        const mapped = applyMapping(rows[i], mapping)
        const missingReq = required.filter(k => !mapped[k])
        if (missingReq.length > 0) {
          previewed.push({ index: i, raw: rows[i], mapped, status: 'skipped', reason: `Missing: ${missingReq.join(', ')}` })
          continue
        }
        const phone = mapped.phone?.replace(/\D/g, '')
        const email = mapped.email?.toLowerCase()
        const isDup = (phone && byPhone.has(phone)) || (email && byEmail.has(email))
        previewed.push({ index: i, raw: rows[i], mapped, status: isDup ? 'duplicate' : 'ready' })
      }
    } else if (importType === 'households') {
      const existing = await db.getHouseholds()
      const byName = new Map(existing.map(h => [h.name.toLowerCase(), h]))
      for (let i = 0; i < rows.length; i++) {
        const mapped = applyMapping(rows[i], mapping)
        const missingReq = required.filter(k => !mapped[k])
        if (missingReq.length > 0) {
          previewed.push({ index: i, raw: rows[i], mapped, status: 'skipped', reason: `Missing: ${missingReq.join(', ')}` })
          continue
        }
        const isDup = byName.has(mapped.name?.toLowerCase())
        previewed.push({ index: i, raw: rows[i], mapped, status: isDup ? 'duplicate' : 'ready' })
      }
    } else if (importType === 'groups') {
      const existing = await db.getGroups(true)
      const byName = new Map(existing.map(g => [g.name.toLowerCase(), g]))
      for (let i = 0; i < rows.length; i++) {
        const mapped = applyMapping(rows[i], mapping)
        const missingReq = required.filter(k => !mapped[k])
        if (missingReq.length > 0) {
          previewed.push({ index: i, raw: rows[i], mapped, status: 'skipped', reason: `Missing: ${missingReq.join(', ')}` })
          continue
        }
        const isDup = byName.has(mapped.name?.toLowerCase())
        previewed.push({ index: i, raw: rows[i], mapped, status: isDup ? 'duplicate' : 'ready' })
      }
    } else {
      // giving: look up person by email
      const existing = await db.getPeople()
      const byEmail = new Map(existing.map(p => [p.email?.toLowerCase(), p]))
      for (let i = 0; i < rows.length; i++) {
        const mapped = applyMapping(rows[i], mapping)
        const missingReq = required.filter(k => !mapped[k])
        if (missingReq.length > 0) {
          previewed.push({ index: i, raw: rows[i], mapped, status: 'skipped', reason: `Missing: ${missingReq.join(', ')}` })
          continue
        }
        const email = mapped.person_email?.toLowerCase()
        if (email && !byEmail.has(email)) {
          previewed.push({ index: i, raw: rows[i], mapped, status: 'skipped', reason: 'No matching person found for email' })
          continue
        }
        previewed.push({ index: i, raw: rows[i], mapped, status: 'ready' })
      }
    }

    setPreview(previewed)
    setPreviewing(false)
    setStep('preview')
  }, [importType, rows, mapping])

  // ── Step 3: Confirm → Import ───────────────────────────────────────────────

  async function commitImport() {
    setImporting(true)
    const toImport = preview.filter(r => r.status === 'ready')
    let imported = 0

    try {
      if (importType === 'people') {
        for (const row of toImport) {
          const m = row.mapped
          await db.createPerson({
            first_name: m.first_name,
            last_name: m.last_name,
            preferred_name: m.preferred_name,
            email: m.email,
            phone: m.phone ?? '',
            date_of_birth: normalizeDate(m.date_of_birth),
            is_child: isTruthy(m.is_child ?? ''),
            gender_identity: m.gender_identity,
            membership_status: m.membership_status ? coerceMembershipStatus(m.membership_status) : 'visitor',
            allergies: m.allergies,
            is_active: true,
          })
          imported++
        }
      } else if (importType === 'households') {
        for (const row of toImport) {
          const m = row.mapped
          await db.createHousehold({
            name: m.name,
            address_line_1: m.address_line_1,
            address_line_2: m.address_line_2,
            city: m.city,
            state: m.state,
            zip: m.zip,
          })
          imported++
        }
      } else if (importType === 'groups') {
        for (const row of toImport) {
          const m = row.mapped
          await db.createGroup({
            name: m.name,
            description: m.description,
            group_type: coerceGroupType(m.group_type ?? ''),
            meeting_day: m.meeting_day,
            meeting_time: m.meeting_time,
            location: m.location,
            max_capacity: m.max_capacity ? parseInt(m.max_capacity, 10) : undefined,
            is_open: true,
            is_visible: true,
            childcare_available: false,
            is_active: true,
          })
          imported++
        }
      } else {
        const allPeople = await db.getPeople()
        const byEmail = new Map(allPeople.map(p => [p.email?.toLowerCase(), p]))
        for (const row of toImport) {
          const m = row.mapped
          const person = byEmail.get(m.person_email?.toLowerCase())
          if (!person) continue
          const amount = parseFloat(m.amount.replace(/[$,]/g, ''))
          if (isNaN(amount)) continue
          await db.createGivingRecord({
            person_id: person.id,
            amount,
            date: normalizeDate(m.date),
            method: coerceGivingMethod(m.method ?? ''),
            fund: m.fund ?? 'General',
            source: 'imported',
            notes: m.notes,
          })
          imported++
        }
      }
    } finally {
      setImporting(false)
    }

    const skipped = preview.filter(r => r.status === 'skipped').length
    const duplicates = preview.filter(r => r.status === 'duplicate').length
    setResult({ imported, skipped, duplicates })
    setStep('done')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const readyCt     = preview.filter(r => r.status === 'ready').length
  const dupCt       = preview.filter(r => r.status === 'duplicate').length
  const skippedCt   = preview.filter(r => r.status === 'skipped').length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">CSV Import</h1>
        <p className="text-sm text-gray-500 mt-1">
          Import people, households, groups, or giving records from a CSV file.
          Nothing is saved until you confirm on the preview screen.
        </p>
      </div>

      {/* Step indicator */}
      <StepBar step={step} />

      {step === 'upload' && (
        <UploadStep
          importType={importType}
          setImportType={type => { setImportType(type); setHeaders([]); setRows([]) }}
          onFile={handleFile}
          fileRef={fileRef}
        />
      )}

      {step === 'map' && (
        <MapStep
          importType={importType}
          headers={headers}
          rows={rows}
          mapping={mapping}
          setMapping={setMapping}
          onBack={() => setStep('upload')}
          onNext={() => void buildPreview()}
          loading={previewing}
        />
      )}

      {step === 'preview' && (
        <PreviewStep
          preview={preview}
          readyCt={readyCt}
          dupCt={dupCt}
          skippedCt={skippedCt}
          importType={importType}
          onBack={() => setStep('map')}
          onConfirm={() => void commitImport()}
          importing={importing}
        />
      )}

      {step === 'done' && result && (
        <DoneStep
          result={result}
          importType={importType}
          onReset={() => { setStep('upload'); setResult(null); setPreview([]) }}
        />
      )}
    </div>
  )
}

// ── StepBar ───────────────────────────────────────────────────────────────────

const STEPS: { id: Step; label: string }[] = [
  { id: 'upload',  label: 'Upload' },
  { id: 'map',     label: 'Map Fields' },
  { id: 'preview', label: 'Preview' },
  { id: 'done',    label: 'Done' },
]

function StepBar({ step }: { step: Step }) {
  const current = STEPS.findIndex(s => s.id === step)
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <div className={`flex items-center gap-2 text-sm ${i <= current ? 'text-primary-700 font-medium' : 'text-gray-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              i < current  ? 'bg-primary-600 text-white'
              : i === current ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-600'
              : 'bg-gray-100 text-gray-400'
            }`}>{i + 1}</span>
            <span className="hidden sm:inline">{s.label}</span>
          </div>
          {i < STEPS.length - 1 && <div className={`w-8 h-0.5 ${i < current ? 'bg-primary-400' : 'bg-gray-200'}`} />}
        </div>
      ))}
    </div>
  )
}

// ── Step 1: Upload ─────────────────────────────────────────────────────────────

function UploadStep({
  importType, setImportType, onFile, fileRef,
}: {
  importType: ImportType
  setImportType: (t: ImportType) => void
  onFile: (f: File) => void
  fileRef: React.RefObject<HTMLInputElement>
}) {
  const [dragging, setDragging] = useState(false)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
      {/* Import type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">What are you importing?</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.entries(IMPORT_TYPE_LABELS) as [ImportType, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setImportType(k)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                importType === k
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Planning Center note */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 flex gap-2">
        <span className="flex-shrink-0">ℹ️</span>
        <span>
          <strong>Planning Center users:</strong> Export your data from Planning Center Online
          (People → Export, Groups → Export, etc.). The auto-mapper will recognise Planning Center's
          column headers and pre-fill the field mappings for you.
        </span>
      </div>

      {/* File drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) onFile(file)
        }}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
          dragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
        }`}
      >
        <div className="text-3xl mb-3">📄</div>
        <p className="text-sm font-medium text-gray-700">Drop your CSV file here</p>
        <p className="text-xs text-gray-400 mt-1">or click to browse</p>
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

// ── Step 2: Map fields ─────────────────────────────────────────────────────────

function MapStep({
  importType, headers, rows, mapping, setMapping, onBack, onNext, loading,
}: {
  importType: ImportType
  headers: string[]
  rows: Record<string, string>[]
  mapping: Mapping
  setMapping: (m: Mapping) => void
  onBack: () => void
  onNext: () => void
  loading: boolean
}) {
  const fields = fieldsFor(importType)
  const usedKeys = Object.values(mapping).filter(v => v && v !== 'ignore')

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Map CSV columns to fields</h2>
        <p className="text-sm text-gray-500 mt-1">
          {rows.length} rows detected · Assign each CSV column to a system field, or choose "Ignore".
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase">CSV Column</th>
              <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase">Sample Values</th>
              <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">Map To</th>
            </tr>
          </thead>
          <tbody>
            {headers.map(h => {
              const samples = rows.slice(0, 3).map(r => r[h]).filter(Boolean).join(', ')
              return (
                <tr key={h} className="border-b border-gray-100">
                  <td className="py-2 pr-4 font-medium text-gray-800 whitespace-nowrap">{h}</td>
                  <td className="py-2 pr-4 text-gray-400 max-w-xs truncate text-xs">{samples || '—'}</td>
                  <td className="py-2">
                    <select
                      value={mapping[h] ?? 'ignore'}
                      onChange={e => setMapping({ ...mapping, [h]: e.target.value })}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-48"
                    >
                      <option value="ignore">— Ignore —</option>
                      {fields.map(f => (
                        <option
                          key={f.key}
                          value={f.key}
                          disabled={usedKeys.includes(f.key) && mapping[h] !== f.key}
                        >
                          {f.label}{f.required ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Required fields checklist */}
      <div className="bg-gray-50 rounded-xl p-4">
        <p className="text-xs font-medium text-gray-600 mb-2">Required fields</p>
        <div className="flex flex-wrap gap-2">
          {fields.filter(f => f.required).map(f => {
            const mapped = usedKeys.includes(f.key)
            return (
              <span
                key={f.key}
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  mapped ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                }`}
              >
                {mapped ? '✓' : '✗'} {f.label}
              </span>
            )
          })}
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack}>← Back</Button>
        <div className="flex-1" />
        <Button
          onClick={onNext}
          loading={loading}
          disabled={fields.filter(f => f.required).some(f => !usedKeys.includes(f.key))}
        >
          Preview import →
        </Button>
      </div>
    </div>
  )
}

// ── Step 3: Preview ────────────────────────────────────────────────────────────

function PreviewStep({
  preview, readyCt, dupCt, skippedCt, importType, onBack, onConfirm, importing,
}: {
  preview: PreviewRow[]
  readyCt: number
  dupCt: number
  skippedCt: number
  importType: ImportType
  onBack: () => void
  onConfirm: () => void
  importing: boolean
}) {
  const [show, setShow] = useState<RowStatus | 'all'>('all')

  const filtered = show === 'all' ? preview : preview.filter(r => r.status === show)
  const primaryKey = importType === 'people' ? ['first_name', 'last_name', 'email']
    : importType === 'households' ? ['name', 'city']
    : importType === 'groups' ? ['name', 'group_type']
    : ['person_email', 'date', 'amount']

  const statusBadge: Record<RowStatus, string> = {
    ready:     'bg-green-100 text-green-700',
    duplicate: 'bg-amber-100 text-amber-700',
    skipped:   'bg-red-100 text-red-600',
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Import preview</h2>
        <p className="text-sm text-gray-500 mt-1">
          Review before confirming. Duplicates and skipped rows will <strong>not</strong> be imported.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Ready to import', count: readyCt,   color: 'bg-green-50 text-green-700 border-green-200' },
          { label: 'Duplicates',       count: dupCt,    color: 'bg-amber-50 text-amber-700 border-amber-200' },
          { label: 'Skipped',          count: skippedCt, color: 'bg-red-50 text-red-600 border-red-200' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 text-center ${s.color}`}>
            <div className="text-2xl font-bold">{s.count}</div>
            <div className="text-xs font-medium mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 text-sm">
        {([['all', 'All'], ['ready', 'Ready'], ['duplicate', 'Duplicates'], ['skipped', 'Skipped']] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setShow(k)}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              show === k ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Preview table */}
      <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Status</th>
              {primaryKey.map(k => (
                <th key={k} className="text-left px-3 py-2 text-xs font-medium text-gray-500 capitalize">
                  {k.replace(/_/g, ' ')}
                </th>
              ))}
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.slice(0, 200).map(row => (
              <tr key={row.index}>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge[row.status]}`}>
                    {row.status}
                  </span>
                </td>
                {primaryKey.map(k => (
                  <td key={k} className="px-3 py-2 text-gray-700">{row.mapped[k] ?? '—'}</td>
                ))}
                <td className="px-3 py-2 text-xs text-gray-400">{row.reason ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 200 && (
          <p className="text-xs text-gray-400 text-center py-2">Showing first 200 of {filtered.length} rows</p>
        )}
      </div>

      <div className="flex gap-3 pt-1">
        <Button variant="secondary" onClick={onBack}>← Back</Button>
        <div className="flex-1" />
        <Button
          onClick={onConfirm}
          loading={importing}
          disabled={readyCt === 0}
          className="min-w-40"
        >
          Import {readyCt} {IMPORT_TYPE_LABELS[importType]} →
        </Button>
      </div>
    </div>
  )
}

// ── Step 4: Done ──────────────────────────────────────────────────────────────

function DoneStep({
  result, importType, onReset,
}: {
  result: { imported: number; skipped: number; duplicates: number }
  importType: ImportType
  onReset: () => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center space-y-6">
      <div className="text-4xl">{result.imported > 0 ? '✅' : '⚠️'}</div>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Import complete</h2>
        <p className="text-gray-500 text-sm mt-1">{IMPORT_TYPE_LABELS[importType]} import finished.</p>
      </div>
      <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-green-700">{result.imported}</div>
          <div className="text-xs text-green-600">Imported</div>
        </div>
        <div className="bg-amber-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-amber-700">{result.duplicates}</div>
          <div className="text-xs text-amber-600">Skipped (dup)</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-gray-700">{result.skipped}</div>
          <div className="text-xs text-gray-500">Skipped (err)</div>
        </div>
      </div>
      <Button onClick={onReset} variant="secondary">Import another file</Button>
    </div>
  )
}
