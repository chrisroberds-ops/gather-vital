import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, setChurchId, getChurchId } from '@/services'
import { useAppConfig, applyPrimaryColor } from '@/services/app-config-context'
import {
  DEFAULT_TERMINOLOGY, DEFAULT_KIDS_ROOMS, DEFAULT_SERVING_TEAMS,
  DEFAULT_DASHBOARD_METRICS, DEFAULT_MODULES,
  type ServiceTime, type KidsRoom, type WeekDay, type ModuleConfig,
} from '@/shared/types'
import Button from '@/shared/components/Button'
import LogoUpload from '@/shared/components/LogoUpload'

// ── Shared UI helpers ─────────────────────────────────────────────────────────

export const inputCls = 'border border-gray-300 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary-500'
export const labelCls = 'block text-xs font-medium text-gray-600 mb-1'
export const selectCls = 'border border-gray-300 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white'

export const COLOR_PRESETS = [
  { label: 'Indigo',  hex: '#6366f1' },
  { label: 'Violet',  hex: '#8b5cf6' },
  { label: 'Blue',    hex: '#3b82f6' },
  { label: 'Emerald', hex: '#10b981' },
  { label: 'Rose',    hex: '#f43f5e' },
  { label: 'Orange',  hex: '#f97316' },
  { label: 'Slate',   hex: '#475569' },
]

export function PresetSelector({
  label, presets, value, onChange,
}: {
  label: string
  presets: string[]
  value: string
  onChange: (v: string) => void
}) {
  const isCustom = value !== '' && !presets.includes(value)
  return (
    <div className="space-y-1.5">
      <label className={labelCls}>{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {presets.map(p => (
          <button key={p} type="button" onClick={() => onChange(p)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${value === p ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {p}
          </button>
        ))}
        <button type="button" onClick={() => onChange('')}
          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${isCustom || value === '' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Custom…
        </button>
      </div>
      {(isCustom || value === '') && (
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          autoFocus placeholder="Enter custom label" className={inputCls} />
      )}
    </div>
  )
}

export function Toggle({
  label, description, checked, onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {description && <div className="text-xs text-gray-500 mt-0.5">{description}</div>}
      </div>
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative flex-shrink-0 w-10 h-6 rounded-full transition-colors ${checked ? 'bg-primary-600' : 'bg-gray-200'}`}>
        <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </button>
    </div>
  )
}

function RadioGroup<T extends string>({
  label, options, value, onChange,
}: {
  label: string
  options: { value: T; label: string; description?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className={labelCls}>{label}</label>
      <div className="space-y-2">
        {options.map(opt => (
          <label key={opt.value} className="flex items-start gap-3 cursor-pointer">
            <input type="radio" value={opt.value} checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="mt-0.5 accent-primary-600" />
            <div>
              <div className="text-sm font-medium text-gray-800">{opt.label}</div>
              {opt.description && <div className="text-xs text-gray-500">{opt.description}</div>}
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}

function CheckboxGroup({
  label, options, values, onChange,
}: {
  label: string
  options: { value: string; label: string }[]
  values: string[]
  onChange: (v: string[]) => void
}) {
  function toggle(val: string) {
    onChange(values.includes(val) ? values.filter(v => v !== val) : [...values, val])
  }
  return (
    <div className="space-y-1.5">
      <label className={labelCls}>{label}</label>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
            <input type="checkbox" checked={values.includes(opt.value)}
              onChange={() => toggle(opt.value)} className="accent-primary-600" />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  )
}

function EditableList({
  label, items, onChange, placeholder,
}: {
  label: string
  items: string[]
  onChange: (items: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  function add() {
    const t = draft.trim()
    if (t && !items.includes(t)) { onChange([...items, t]); setDraft('') }
  }
  return (
    <div className="space-y-1.5">
      <label className={labelCls}>{label}</label>
      <div className="flex gap-2">
        <input type="text" value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder ?? 'Add item…'} className={inputCls} />
        <button type="button" onClick={add}
          className="px-3 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors whitespace-nowrap">
          + Add
        </button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {items.map((item, i) => (
            <span key={i} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">
              {item}
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="ml-0.5 text-gray-400 hover:text-red-500 font-bold">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Progress indicator ────────────────────────────────────────────────────────

const SECTION_LABELS = [
  'Identity', 'Modules', 'Branding', 'Services', 'Kids Ministry',
  'Groups', 'Volunteers', 'Communications', 'Dashboard',
]

function ProgressBar({ currentStep }: { currentStep: number }) {
  // currentStep: 1-9 for sections, 0 for welcome, 10 for done
  if (currentStep === 0 || currentStep === 10) return null
  const active = currentStep - 1  // 0-indexed
  return (
    <div className="mb-6">
      <div className="flex items-center gap-1 mb-2">
        {SECTION_LABELS.map((label, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className={`w-full h-1.5 rounded-full transition-all ${i < active ? 'bg-primary-400' : i === active ? 'bg-primary-600' : 'bg-gray-200'}`} />
          </div>
        ))}
      </div>
      <p className="text-center text-xs font-semibold text-primary-600 uppercase tracking-widest">
        Section {currentStep} of 9 · {SECTION_LABELS[active]}
      </p>
    </div>
  )
}

// ── Wizard shell ──────────────────────────────────────────────────────────────

export default function SetupWizard() {
  const navigate = useNavigate()
  const { config, updateConfig, reloadConfig } = useAppConfig()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  const churchName = config.church_name !== 'My Church' ? config.church_name : ''

  function advance() { setStep(s => s + 1) }
  function back()    { setStep(s => Math.max(0, s - 1)) }

  async function save(data: Parameters<typeof updateConfig>[0], next = true) {
    setSaving(true)
    try { await updateConfig(data) } finally { setSaving(false) }
    if (next) advance()
  }

  async function finish() {
    setSaving(true)
    try {
      await updateConfig({ setup_complete: true })
      navigate('/admin')
    } finally {
      setSaving(false)
    }
  }

  // Church header — visible once identity is set (step ≥ 2, i.e. Module Toggles and beyond)
  const showChurchHeader = step >= 2 && !!config.church_name && config.church_name !== 'My Church'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4 pt-8">
      {/* Church branding header (replaces "Gather" branding once identity is set) */}
      {showChurchHeader && (
        <div className="flex items-center gap-3 mb-6">
          {config.logo_url
            ? <img src={config.logo_url} alt="Logo" className="h-8 w-8 object-contain rounded" />
            : <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white text-sm font-bold">
                {config.church_name[0]}
              </div>
          }
          <span className="font-semibold text-gray-900">{config.church_name}</span>
        </div>
      )}

      <div className="w-full max-w-lg">
        <ProgressBar currentStep={step} />

        {step === 0  && <StepWelcome onNext={advance} />}
        {step === 1  && <Step1Identity onNext={data => void save(data)} saving={saving} />}
        {step === 2  && <Step2ModuleToggles onNext={data => void save(data)} onBack={back} saving={saving} />}
        {step === 3  && <Step2Branding onNext={data => void save(data)} onBack={back} saving={saving} />}
        {step === 4  && <Step3ServiceTimes onNext={data => void save(data)} onBack={back} onSkip={advance} saving={saving} />}
        {step === 5  && <Step4KidsMinistry onNext={data => void save(data)} onBack={back} onSkip={advance} saving={saving} />}
        {step === 6  && <Step5Groups onNext={data => void save(data)} onBack={back} onSkip={advance} saving={saving} />}
        {step === 7  && <Step6Volunteers onNext={data => void save(data)} onBack={back} onSkip={advance} saving={saving} />}
        {step === 8  && <Step7Communications onNext={data => void save(data)} onBack={back} onSkip={advance} saving={saving} />}
        {step === 9  && <Step8Dashboard onNext={data => void save(data)} onBack={back} onSkip={advance} saving={saving} />}
        {step === 10 && <StepDone onFinish={() => void finish()} saving={saving} />}
      </div>
    </div>
  )
}

// ── Step components ───────────────────────────────────────────────────────────

function WizardCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-5">
      {children}
    </div>
  )
}

function NavRow({
  onBack, onSkip, onNext, nextLabel = 'Next →', nextDisabled, saving,
}: {
  onBack?: () => void
  onSkip?: () => void
  onNext: () => void
  nextLabel?: string
  nextDisabled?: boolean
  saving?: boolean
}) {
  return (
    <div className="flex gap-2 pt-2">
      {onBack && <Button variant="secondary" onClick={onBack}>← Back</Button>}
      <div className="flex-1" />
      {onSkip && (
        <button type="button" onClick={onSkip}
          className="text-sm text-gray-400 hover:text-gray-600 px-3">
          Skip
        </button>
      )}
      <Button onClick={onNext} loading={saving} disabled={nextDisabled}>{nextLabel}</Button>
    </div>
  )
}

// ── Step 0: Welcome ───────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <WizardCard>
      <div className="text-center space-y-4">
        <div className="text-5xl">⛪</div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to setup</h1>
          <p className="text-gray-500 mt-2 text-sm leading-relaxed">
            Walk through 9 quick sections to configure your church. Each section saves
            independently — you can stop at any time and come back later.
          </p>
        </div>
        <Button onClick={onNext} className="w-full justify-center">Get started →</Button>
      </div>
    </WizardCard>
  )
}

// ── Step 1: Church Identity ───────────────────────────────────────────────────

function Step1Identity({
  onNext, saving,
}: {
  onNext: (data: Parameters<ReturnType<typeof useAppConfig>['updateConfig']>[0]) => void
  saving: boolean
}) {
  const { config, updateConfig, reloadConfig } = useAppConfig()
  const [churchName,       setChurchName]       = useState(config.church_name !== 'My Church' ? config.church_name : '')
  const [logoUrl,          setLogoUrl]          = useState(config.logo_url ?? '')
  const [address,          setAddress]          = useState(config.address ?? '')
  const [phone,            setPhone]            = useState(config.phone ?? '')
  const [website,          setWebsite]          = useState(config.website ?? '')
  const [congregationTerm, setCongregationTerm] = useState(config.congregation_term ?? 'Members')
  const [localSaving,      setLocalSaving]      = useState(false)

  const CONGREGATION_PRESETS = ['Members', 'Attenders', 'Family', 'Community']

  async function handleNext() {
    setLocalSaving(true)
    try {
      const name = churchName.trim() || 'My Church'
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        || `church-${Date.now()}`

      // Always sync the Church entity — handles first-time setup AND re-runs of
      // the wizard (e.g. changing the name after initial configuration).
      const currentId = getChurchId()
      const existingChurch = await db.getChurch(currentId)
      console.group('[Gather Setup] Syncing Church entity')
      console.log('current church_id:', currentId)
      console.log('existing Church entity:', existingChurch)
      console.log('saving name:', name, '  slug:', slug)

      if (existingChurch) {
        const updated = await db.updateChurch(existingChurch.id, { name, slug })
        console.log('Church entity after update:', updated)
      } else {
        const church = await db.createChurch({
          name,
          slug,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago',
          is_active: true,
        })
        console.log('Created new Church entity:', church)
        setChurchId(church.id)
        await reloadConfig()
      }
      console.groupEnd()

      await updateConfig({
        church_name: name,
        logo_url: logoUrl.trim() || undefined,
        address:  address.trim()  || undefined,
        phone:    phone.trim()    || undefined,
        website:  website.trim()  || undefined,
        congregation_term: congregationTerm || 'Members',
      })
    } finally {
      setLocalSaving(false)
    }
    onNext({})
  }

  return (
    <WizardCard>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Church identity</h2>
        <p className="text-sm text-gray-500 mt-1">Basic information about your church. All fields except name are optional.</p>
      </div>

      <div>
        <label className={labelCls}>Church name *</label>
        <input type="text" value={churchName} onChange={e => setChurchName(e.target.value)}
          placeholder="Sample Community Church" autoFocus className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Phone</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
            placeholder="(555) 000-0000" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Website</label>
          <input type="url" value={website} onChange={e => setWebsite(e.target.value)}
            placeholder="https://yourchurch.com" className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Address</label>
        <input type="text" value={address} onChange={e => setAddress(e.target.value)}
          placeholder="123 Main St, City, ST 00000" className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Logo <span className="text-gray-400 font-normal">(optional)</span></label>
        <LogoUpload value={logoUrl || undefined} onChange={url => setLogoUrl(url)} />
        <p className="text-xs text-gray-400 mt-1">PNG or JPG only, max 2 MB. Changeable later in Settings.</p>
      </div>

      <PresetSelector
        label="What do you call your congregation?"
        presets={CONGREGATION_PRESETS}
        value={congregationTerm}
        onChange={setCongregationTerm}
      />

      <NavRow
        onNext={() => void handleNext()}
        nextDisabled={!churchName.trim()}
        saving={localSaving || saving}
        nextLabel="Save & continue →"
      />
    </WizardCard>
  )
}

// ── Step 2: Module Toggles ────────────────────────────────────────────────────

const MODULE_DEFS: { key: keyof ModuleConfig; label: string; description: string; hint: string }[] = [
  { key: 'checkin',        label: 'Kids Check-In',      description: 'Self-service kiosk for checking children in and out.',         hint: 'Turn off if you do not have a children\'s ministry.' },
  { key: 'volunteers',     label: 'Volunteers',          description: 'Team management, scheduling, and background check tracking.',   hint: 'Turn off for very small churches with informal service roles.' },
  { key: 'groups',         label: 'Small Groups',        description: 'Group directory, membership, and attendance for life groups.',  hint: 'Turn off if groups are managed outside this system.' },
  { key: 'events',         label: 'Events',              description: 'Event calendar, registration, and capacity management.',        hint: 'Turn off if you use a separate event registration platform.' },
  { key: 'visitors',       label: 'Visitor Pipeline',    description: 'Visitor cards, follow-up steps, and welcome workflow.',         hint: 'Turn off if visitor tracking is handled by another tool.' },
  { key: 'worship',        label: 'Worship Planning',    description: 'Song library, service builder, and run sheets for worship.',    hint: 'Turn off if your worship team uses Planning Center or similar.' },
  { key: 'giving',         label: 'Giving',              description: 'Contribution records, statements, and fund reporting.',         hint: 'Disabled by default — enable once Giving is fully set up.' },
  { key: 'attendance',     label: 'Attendance Tracking', description: 'Aggregate headcounts and per-service attendance records.',      hint: 'Turn off if you do not track weekly attendance numbers.' },
  { key: 'communications', label: 'Communications Log',  description: 'History of every email and SMS sent through the platform.',     hint: 'Recommended on — logs all outbound messages for reference.' },
]

function Step2ModuleToggles({
  onNext, onBack, saving,
}: {
  onNext: (data: Parameters<ReturnType<typeof useAppConfig>['updateConfig']>[0]) => void
  onBack: () => void
  saving: boolean
}) {
  const { config } = useAppConfig()
  const [modules, setModules] = useState<ModuleConfig>(config.modules ?? DEFAULT_MODULES)

  function toggle(key: keyof ModuleConfig) {
    setModules(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <WizardCard>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Feature modules</h2>
        <p className="text-sm text-gray-500 mt-1">Enable only the features your church actively uses. You can change these anytime in Settings.</p>
      </div>

      <div className="space-y-4">
        {MODULE_DEFS.map(mod => (
          <div key={mod.key} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
            <Toggle
              label={mod.label}
              description={mod.description}
              checked={modules[mod.key]}
              onChange={() => toggle(mod.key)}
            />
            <p className="text-xs text-gray-400 mt-1.5 ml-0 italic">{mod.hint}</p>
          </div>
        ))}
      </div>

      <NavRow
        onBack={onBack}
        onNext={() => onNext({ modules })}
        saving={saving}
        nextLabel="Save & continue →"
      />
    </WizardCard>
  )
}

// ── Step 2: Branding ──────────────────────────────────────────────────────────

function Step2Branding({
  onNext, onBack, saving,
}: {
  onNext: (data: Parameters<ReturnType<typeof useAppConfig>['updateConfig']>[0]) => void
  onBack: () => void
  saving: boolean
}) {
  const { config } = useAppConfig()
  const [primary,   setPrimary]   = useState(config.primary_color)
  const [secondary, setSecondary] = useState(config.secondary_color ?? '#10b981')

  function selectPrimary(hex: string) {
    setPrimary(hex)
    applyPrimaryColor(hex)
  }

  return (
    <WizardCard>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Brand colors</h2>
        <p className="text-sm text-gray-500 mt-1">These apply to the admin panel, kiosk, and embeds.</p>
      </div>

      <div>
        <label className={labelCls}>Primary color</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {COLOR_PRESETS.map(p => (
            <button key={p.hex} type="button" onClick={() => selectPrimary(p.hex)} title={p.label}
              className={`w-9 h-9 rounded-full border-2 transition-all ${primary === p.hex ? 'border-gray-900 scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: p.hex }} />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <input type="color" value={primary} onChange={e => selectPrimary(e.target.value)}
            className="w-9 h-9 rounded-lg border border-gray-300 cursor-pointer p-0.5" />
          <span className="text-sm text-gray-600">Custom</span>
          <code className="text-xs text-gray-400 ml-auto">{primary}</code>
        </div>
      </div>

      <div>
        <label className={labelCls}>Secondary / accent color</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {COLOR_PRESETS.map(p => (
            <button key={p.hex} type="button" onClick={() => setSecondary(p.hex)} title={p.label}
              className={`w-9 h-9 rounded-full border-2 transition-all ${secondary === p.hex ? 'border-gray-900 scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: p.hex }} />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <input type="color" value={secondary} onChange={e => setSecondary(e.target.value)}
            className="w-9 h-9 rounded-lg border border-gray-300 cursor-pointer p-0.5" />
          <span className="text-sm text-gray-600">Custom</span>
          <code className="text-xs text-gray-400 ml-auto">{secondary}</code>
        </div>
      </div>

      {/* Color preview */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
        <p className="text-xs text-gray-500 font-medium mb-2">Preview</p>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
            style={{ backgroundColor: primary }}>
            {config.church_name?.[0] ?? 'C'}
          </div>
          <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: primary }} />
          <div className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
            style={{ backgroundColor: primary }}>Primary</div>
          <div className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
            style={{ backgroundColor: secondary }}>Accent</div>
        </div>
      </div>

      <NavRow
        onBack={onBack}
        onNext={() => onNext({ primary_color: primary, secondary_color: secondary })}
        saving={saving}
        nextLabel="Save & continue →"
      />
    </WizardCard>
  )
}

// ── Step 3: Service Times ─────────────────────────────────────────────────────

const DAYS: WeekDay[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function Step3ServiceTimes({
  onNext, onBack, onSkip, saving,
}: {
  onNext: (data: Parameters<ReturnType<typeof useAppConfig>['updateConfig']>[0]) => void
  onBack: () => void
  onSkip: () => void
  saving: boolean
}) {
  const { config } = useAppConfig()
  const [times,           setTimes]           = useState<ServiceTime[]>(config.service_times ?? [])
  const [campuses,        setCampuses]        = useState<string[]>(config.campuses ?? [])
  const [multiSite,       setMultiSite]       = useState((config.campuses?.length ?? 0) > 0)
  const [trackAttendance, setTrackAttendance] = useState<'individual' | 'aggregate' | 'none'>(config.track_adult_attendance ?? 'aggregate')

  // New-time draft
  const [draftDay,   setDraftDay]   = useState<WeekDay>('Sunday')
  const [draftTime,  setDraftTime]  = useState('9:00 AM')
  const [draftLabel, setDraftLabel] = useState('')

  function addTime() {
    const id = `st-${Date.now()}`
    setTimes(prev => [...prev, { id, day: draftDay, time: draftTime, label: draftLabel.trim() || undefined }])
    setDraftLabel('')
  }

  function removeTime(id: string) {
    setTimes(prev => prev.filter(t => t.id !== id))
  }

  return (
    <WizardCard>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Service times</h2>
        <p className="text-sm text-gray-500 mt-1">These become the default options when opening a check-in session.</p>
      </div>

      {/* Time entry */}
      <div className="space-y-2">
        <label className={labelCls}>Regular service times</label>
        <div className="flex gap-2 flex-wrap">
          <select value={draftDay} onChange={e => setDraftDay(e.target.value as WeekDay)}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
            {DAYS.map(d => <option key={d}>{d}</option>)}
          </select>
          <input type="text" value={draftTime} onChange={e => setDraftTime(e.target.value)}
            placeholder="9:00 AM" className="border border-gray-300 rounded-xl px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <input type="text" value={draftLabel} onChange={e => setDraftLabel(e.target.value)}
            placeholder="Label (e.g. Traditional)" className="border border-gray-300 rounded-xl px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <button type="button" onClick={addTime}
            className="px-3 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
            + Add
          </button>
        </div>
        {times.length > 0 && (
          <div className="space-y-1.5">
            {times.map(t => (
              <div key={t.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <span className="font-medium text-gray-800">{t.day} · {t.time}{t.label ? ` — ${t.label}` : ''}</span>
                <button type="button" onClick={() => removeTime(t.id)} className="text-gray-400 hover:text-red-500 ml-2">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <Toggle
          label="Multiple campuses or buildings"
          description="Let you name each location separately"
          checked={multiSite}
          onChange={v => { setMultiSite(v); if (!v) setCampuses([]) }}
        />
        {multiSite && (
          <EditableList
            label="Campus / building names"
            items={campuses}
            onChange={setCampuses}
            placeholder="e.g. Main Campus, East Campus"
          />
        )}
      </div>

      <div className="border-t border-gray-100 pt-4">
        <RadioGroup
          label="How do you track adult attendance?"
          options={[
            { value: 'aggregate',   label: 'Aggregate headcounts',           description: 'Record total counts per service (auditorium, students, online, kids).' },
            { value: 'individual',  label: 'Individual adult tracking',       description: 'Mark attendance for each adult member individually.' },
            { value: 'none',        label: 'Kids & volunteers only',          description: 'Only track attendance during check-in; no separate adult records.' },
          ]}
          value={trackAttendance}
          onChange={setTrackAttendance}
        />
      </div>

      <NavRow
        onBack={onBack}
        onSkip={onSkip}
        onNext={() => onNext({ service_times: times, campuses: multiSite ? campuses : [], track_adult_attendance: trackAttendance })}
        saving={saving}
        nextLabel="Save & continue →"
      />
    </WizardCard>
  )
}

// ── Step 4: Kids Ministry ─────────────────────────────────────────────────────

function Step4KidsMinistry({
  onNext, onBack, onSkip, saving,
}: {
  onNext: (data: Parameters<ReturnType<typeof useAppConfig>['updateConfig']>[0]) => void
  onBack: () => void
  onSkip: () => void
  saving: boolean
}) {
  const { config } = useAppConfig()
  const [rooms,       setRooms]       = useState<KidsRoom[]>(config.kids_rooms ?? DEFAULT_KIDS_ROOMS)
  const [labelFields, setLabelFields] = useState(config.label_print_fields ?? { allergies: true, parent_phone: true, photo: false })
  const [autoFlag,    setAutoFlag]    = useState(config.auto_flag_allergies ?? true)
  const [policy,      setPolicy]      = useState<'code' | 'visual'>(config.pickup_policy ?? 'code')
  const [kioskCount,  setKioskCount]  = useState(config.kiosk_count ?? 1)

  // Room editing
  const [editingRoom, setEditingRoom] = useState<string | null>(null)

  function updateRoom(id: string, patch: Partial<KidsRoom>) {
    setRooms(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  function addRoom() {
    const id = `room-${Date.now()}`
    setRooms(prev => [...prev, { id, name: 'New Room' }])
    setEditingRoom(id)
  }

  function removeRoom(id: string) {
    setRooms(prev => prev.filter(r => r.id !== id))
  }

  return (
    <WizardCard>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Kids ministry</h2>
        <p className="text-sm text-gray-500 mt-1">Configure check-in rooms, labels, and pickup policies.</p>
      </div>

      {/* Rooms */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className={labelCls}>Age / grade rooms</label>
          <button type="button" onClick={addRoom}
            className="text-xs text-primary-600 font-medium hover:text-primary-800">
            + Add room
          </button>
        </div>
        <div className="space-y-1.5">
          {rooms.map(room => (
            <div key={room.id} className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
                {editingRoom === room.id
                  ? (
                    <input type="text" value={room.name} autoFocus
                      onChange={e => updateRoom(room.id, { name: e.target.value })}
                      onBlur={() => setEditingRoom(null)}
                      className="text-sm font-medium bg-white border border-gray-300 rounded-lg px-2 py-1 flex-1 focus:outline-none focus:ring-1 focus:ring-primary-500" />
                  )
                  : (
                    <button type="button" onClick={() => setEditingRoom(room.id)}
                      className="text-sm font-medium text-gray-900 flex-1 text-left hover:text-primary-600">
                      {room.name}
                    </button>
                  )
                }
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>Ages:</span>
                  <input type="number" value={room.min_age ?? ''} min={0} max={18}
                    onChange={e => updateRoom(room.id, { min_age: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="min" className="w-14 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none" />
                  <span>–</span>
                  <input type="number" value={room.max_age ?? ''} min={0} max={18}
                    onChange={e => updateRoom(room.id, { max_age: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="max" className="w-14 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none" />
                </div>
                <button type="button" onClick={() => removeRoom(room.id)}
                  className="text-gray-300 hover:text-red-500 text-sm font-bold">×</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Label fields */}
      <div className="space-y-2 border-t border-gray-100 pt-4">
        <label className={labelCls}>What prints on the check-in label?</label>
        <p className="text-xs text-gray-400">Child name, room, and pickup code always print.</p>
        <div className="space-y-2">
          {([
            ['allergies',    'Allergy flag (⚠ if child has allergies on file)'],
            ['parent_phone', 'Parent phone number'],
            ['photo',        'Child photo (if on file)'],
          ] as const).map(([key, lbl]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input type="checkbox"
                checked={labelFields[key]}
                onChange={e => setLabelFields(prev => ({ ...prev, [key]: e.target.checked }))}
                className="accent-primary-600" />
              {lbl}
            </label>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <Toggle
          label="Auto-flag allergy / medical notes on check-in"
          description="Show a red alert banner on the check-in dashboard for any child with allergies or medical notes"
          checked={autoFlag}
          onChange={setAutoFlag}
        />

        <RadioGroup
          label="Pickup policy"
          value={policy}
          onChange={setPolicy}
          options={[
            { value: 'code',   label: 'Matching pickup code required',  description: 'Staff must verify the 4-digit code' },
            { value: 'visual', label: 'Visual ID check only',            description: 'Staff visually confirms the parent' },
          ]}
        />

        <div>
          <label className={labelCls}>Typical number of kiosk stations</label>
          <input type="number" value={kioskCount} min={1} max={20}
            onChange={e => setKioskCount(Number(e.target.value))}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
      </div>

      <NavRow
        onBack={onBack}
        onSkip={onSkip}
        onNext={() => onNext({
          kids_rooms: rooms,
          label_print_fields: labelFields,
          auto_flag_allergies: autoFlag,
          pickup_policy: policy,
          kiosk_count: kioskCount,
        })}
        saving={saving}
        nextLabel="Save & continue →"
      />
    </WizardCard>
  )
}

// ── Step 5: Groups ────────────────────────────────────────────────────────────

const GROUP_TYPE_OPTIONS = [
  { value: 'Small Groups',   label: 'Small Groups' },
  { value: 'Life Groups',    label: 'Life Groups' },
  { value: 'Bible Study',    label: 'Bible Study' },
  { value: 'Recovery',       label: 'Recovery' },
  { value: 'Youth',          label: 'Youth' },
  { value: 'Interest Groups', label: 'Interest Groups' },
  { value: 'Serving Teams',  label: 'Serving Teams' },
  { value: 'Classes',        label: 'Classes' },
]
const GROUP_LABEL_PRESETS  = ['Small Groups', 'Life Groups', 'Connect Groups', 'Community Groups']
const VOL_LABEL_PRESETS    = ['Volunteers', 'Serve Teams', 'Ministry Teams']

function Step5Groups({
  onNext, onBack, onSkip, saving,
}: {
  onNext: (data: Parameters<ReturnType<typeof useAppConfig>['updateConfig']>[0]) => void
  onBack: () => void
  onSkip: () => void
  saving: boolean
}) {
  const { config } = useAppConfig()
  const [groupTypes,       setGroupTypes]       = useState<string[]>(config.group_types ?? ['Small Groups', 'Bible Study'])
  const [groupsLabel,      setGroupsLabel]      = useState(config.terminology.groups_label)
  const [volunteersLabel,  setVolunteersLabel]  = useState(config.terminology.volunteers_label)
  const [leadersRoster,    setLeadersRoster]    = useState(config.group_leaders_see_roster ?? true)
  const [requiresApproval, setRequiresApproval] = useState(config.group_signup_requires_approval ?? false)

  return (
    <WizardCard>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Groups</h2>
        <p className="text-sm text-gray-500 mt-1">Configure how groups work at your church.</p>
      </div>

      <CheckboxGroup
        label="What types of groups do you run?"
        options={GROUP_TYPE_OPTIONS}
        values={groupTypes}
        onChange={setGroupTypes}
      />

      <PresetSelector
        label="What do you call your groups?"
        presets={GROUP_LABEL_PRESETS}
        value={groupsLabel}
        onChange={setGroupsLabel}
      />

      <PresetSelector
        label="What do you call your volunteer teams?"
        presets={VOL_LABEL_PRESETS}
        value={volunteersLabel}
        onChange={setVolunteersLabel}
      />

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <Toggle
          label="Group leaders can see their own member roster"
          description="Leaders log in and view the list of people in their group"
          checked={leadersRoster}
          onChange={setLeadersRoster}
        />
        <Toggle
          label="Public sign-up requires staff approval"
          description="New sign-ups are held for review before being confirmed"
          checked={requiresApproval}
          onChange={setRequiresApproval}
        />
      </div>

      <NavRow
        onBack={onBack}
        onSkip={onSkip}
        onNext={() => onNext({
          group_types: groupTypes,
          group_leaders_see_roster: leadersRoster,
          group_signup_requires_approval: requiresApproval,
          terminology: {
            ...config.terminology,
            groups_label: groupsLabel,
            volunteers_label: volunteersLabel,
          },
        })}
        saving={saving}
        nextLabel="Save & continue →"
      />
    </WizardCard>
  )
}

// ── Step 6: Volunteers ────────────────────────────────────────────────────────

function Step6Volunteers({
  onNext, onBack, onSkip, saving,
}: {
  onNext: (data: Parameters<ReturnType<typeof useAppConfig>['updateConfig']>[0]) => void
  onBack: () => void
  onSkip: () => void
  saving: boolean
}) {
  const { config } = useAppConfig()
  const [teams,        setTeams]        = useState<string[]>(config.serving_teams ?? DEFAULT_SERVING_TEAMS)
  const [advance,      setAdvance]      = useState<'weekly' | 'bi-weekly' | 'monthly'>(config.schedule_advance ?? 'weekly')
  const [scheduling,   setScheduling]   = useState<'self' | 'coordinator'>(config.volunteer_scheduling ?? 'coordinator')
  const [notification, setNotification] = useState<'email' | 'sms' | 'both'>(config.volunteer_notification ?? 'email')

  return (
    <WizardCard>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Volunteers</h2>
        <p className="text-sm text-gray-500 mt-1">How you build and manage your serving schedule.</p>
      </div>

      <EditableList
        label="Serving teams"
        items={teams}
        onChange={setTeams}
        placeholder="Add a team…"
      />

      <RadioGroup
        label="How far in advance do you build schedules?"
        value={advance}
        onChange={setAdvance}
        options={[
          { value: 'weekly',    label: 'Weekly' },
          { value: 'bi-weekly', label: 'Bi-weekly' },
          { value: 'monthly',   label: 'Monthly' },
        ]}
      />

      <RadioGroup
        label="How do volunteers get scheduled?"
        value={scheduling}
        onChange={setScheduling}
        options={[
          { value: 'coordinator', label: 'Coordinator assigns them',    description: 'A team leader builds and sends the schedule' },
          { value: 'self',        label: 'Volunteers self-schedule',    description: 'Volunteers pick their own slots' },
        ]}
      />

      <RadioGroup
        label="Preferred volunteer notification method"
        value={notification}
        onChange={setNotification}
        options={[
          { value: 'email', label: 'Email' },
          { value: 'sms',   label: 'SMS / Text' },
          { value: 'both',  label: 'Both email and SMS' },
        ]}
      />

      <NavRow
        onBack={onBack}
        onSkip={onSkip}
        onNext={() => onNext({
          serving_teams: teams,
          schedule_advance: advance,
          volunteer_scheduling: scheduling,
          volunteer_notification: notification,
        })}
        saving={saving}
        nextLabel="Save & continue →"
      />
    </WizardCard>
  )
}

// ── Step 7: Communications ────────────────────────────────────────────────────

const FOLLOWUP_OWNER_OPTIONS = [
  'Lead Pastor', 'Connections Pastor', 'Admin', 'Auto-assign',
]

function Step7Communications({
  onNext, onBack, onSkip, saving,
}: {
  onNext: (data: Parameters<ReturnType<typeof useAppConfig>['updateConfig']>[0]) => void
  onBack: () => void
  onSkip: () => void
  saving: boolean
}) {
  const { config } = useAppConfig()
  const [outreach,        setOutreach]        = useState<'email' | 'sms' | 'both'>(config.primary_outreach ?? 'email')
  const [followupSteps,   setFollowupSteps]   = useState(config.visitor_followup_steps ?? 3)
  const [followupOwner,   setFollowupOwner]   = useState(config.visitor_followup_owner ?? 'Connections Pastor')
  const [weeklyReport,    setWeeklyReport]    = useState(config.weekly_report ?? false)
  const [reportEmail,     setReportEmail]     = useState(config.weekly_report_email ?? '')
  const [customOwner,     setCustomOwner]     = useState(!FOLLOWUP_OWNER_OPTIONS.includes(config.visitor_followup_owner ?? 'Connections Pastor'))

  return (
    <WizardCard>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Communications & follow-up</h2>
        <p className="text-sm text-gray-500 mt-1">How you reach visitors and your congregation.</p>
      </div>

      <RadioGroup
        label="Primary outreach method"
        value={outreach}
        onChange={setOutreach}
        options={[
          { value: 'email', label: 'Email' },
          { value: 'sms',   label: 'SMS / Text' },
          { value: 'both',  label: 'Both email and SMS' },
        ]}
      />

      <div>
        <label className={labelCls}>Follow-up steps for first-time visitors</label>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={10} value={followupSteps}
            onChange={e => setFollowupSteps(Number(e.target.value))}
            className="flex-1 accent-primary-600" />
          <span className="text-sm font-semibold text-gray-800 w-6 text-center">{followupSteps}</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">How many touch-points your visitor pipeline runs before closing.</p>
      </div>

      <div className="space-y-1.5">
        <label className={labelCls}>Who owns visitor follow-up?</label>
        <div className="flex flex-wrap gap-1.5">
          {FOLLOWUP_OWNER_OPTIONS.map(opt => (
            <button key={opt} type="button"
              onClick={() => { setFollowupOwner(opt); setCustomOwner(false) }}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${followupOwner === opt && !customOwner ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {opt}
            </button>
          ))}
          <button type="button"
            onClick={() => { setCustomOwner(true); setFollowupOwner('') }}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${customOwner ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Custom…
          </button>
        </div>
        {customOwner && (
          <input type="text" value={followupOwner} onChange={e => setFollowupOwner(e.target.value)}
            autoFocus placeholder="Enter role or name" className={inputCls} />
        )}
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <Toggle
          label="Weekly summary report"
          description="Receive a weekly email digest of attendance, giving, and visitor stats"
          checked={weeklyReport}
          onChange={setWeeklyReport}
        />
        {weeklyReport && (
          <div>
            <label className={labelCls}>Report recipient email</label>
            <input type="email" value={reportEmail} onChange={e => setReportEmail(e.target.value)}
              placeholder="pastor@yourchurch.com" className={inputCls} />
          </div>
        )}
      </div>

      <NavRow
        onBack={onBack}
        onSkip={onSkip}
        onNext={() => onNext({
          primary_outreach: outreach,
          visitor_followup_steps: followupSteps,
          visitor_followup_owner: followupOwner,
          weekly_report: weeklyReport,
          weekly_report_email: weeklyReport ? reportEmail : undefined,
        })}
        saving={saving}
        nextLabel="Save & continue →"
      />
    </WizardCard>
  )
}

// ── Step 8: Dashboard ─────────────────────────────────────────────────────────

const METRIC_OPTIONS = [
  { value: 'attendance', label: 'Attendance' },
  { value: 'giving',     label: 'Giving' },
  { value: 'volunteers', label: 'Volunteers' },
  { value: 'groups',     label: 'Groups' },
  { value: 'visitors',   label: 'Visitors' },
  { value: 'kids',       label: 'Kids Check-in' },
]

function Step8Dashboard({
  onNext, onBack, onSkip, saving,
}: {
  onNext: (data: Parameters<ReturnType<typeof useAppConfig>['updateConfig']>[0]) => void
  onBack: () => void
  onSkip: () => void
  saving: boolean
}) {
  const { config } = useAppConfig()
  const [metrics, setMetrics] = useState<string[]>(config.dashboard_metrics ?? DEFAULT_DASHBOARD_METRICS)
  const [showYoy, setShowYoy] = useState(config.show_yoy ?? true)

  return (
    <WizardCard>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Dashboard vital signs</h2>
        <p className="text-sm text-gray-500 mt-1">Choose what leadership sees front and center.</p>
      </div>

      <CheckboxGroup
        label="Which metrics should appear on the dashboard?"
        options={METRIC_OPTIONS}
        values={metrics}
        onChange={setMetrics}
      />

      <Toggle
        label="Show year-over-year comparisons"
        description="Display percentage change vs. the same period last year"
        checked={showYoy}
        onChange={setShowYoy}
      />

      <NavRow
        onBack={onBack}
        onSkip={onSkip}
        onNext={() => onNext({ dashboard_metrics: metrics, show_yoy: showYoy })}
        saving={saving}
        nextLabel="Save & continue →"
      />
    </WizardCard>
  )
}

// ── Done ──────────────────────────────────────────────────────────────────────

function StepDone({ onFinish, saving }: { onFinish: () => void; saving: boolean }) {
  const { config } = useAppConfig()
  return (
    <WizardCard>
      <div className="text-center space-y-3">
        <div className="text-4xl">🎉</div>
        <h2 className="text-xl font-bold text-gray-900">Setup complete!</h2>
        <p className="text-sm text-gray-500">
          {config.church_name} is ready to go. You can update any of these settings later
          from the admin panel under Settings.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 text-sm">
        {config.logo_url && (
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-gray-500">Logo</span>
            <img src={config.logo_url} alt="Church logo" className="h-8 max-w-[120px] object-contain rounded" />
          </div>
        )}
        {[
          ['Church',        config.church_name],
          ['Primary color', config.primary_color],
          ['Service times', (config.service_times?.length ?? 0) > 0 ? `${config.service_times!.length} configured` : 'Not set'],
          ['Kids rooms',    (config.kids_rooms?.length ?? 0) > 0 ? `${config.kids_rooms!.length} rooms` : 'Not set'],
          ['Groups label',  config.terminology.groups_label],
          ['Volunteers',    `${config.serving_teams?.length ?? 0} teams`],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-gray-500">{k}</span>
            <span className="font-medium text-gray-900 flex items-center gap-2">
              {k === 'Primary color' && (
                <span className="w-3 h-3 rounded-full border border-gray-200 inline-block"
                  style={{ backgroundColor: String(v) }} />
              )}
              {v}
            </span>
          </div>
        ))}
      </div>

      <Button onClick={onFinish} loading={saving} className="w-full justify-center">
        Go to dashboard →
      </Button>
    </WizardCard>
  )
}
