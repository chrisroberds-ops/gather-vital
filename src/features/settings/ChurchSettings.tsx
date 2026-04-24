import { useState, useEffect } from 'react'
import { useAppConfig, applyPrimaryColor } from '@/services/app-config-context'
import { db, getChurchId } from '@/services'
import { sendEmail } from '@/services/notification-service'
import {
  DEFAULT_TERMINOLOGY, DEFAULT_KIDS_ROOMS, DEFAULT_SERVING_TEAMS,
  DEFAULT_DASHBOARD_METRICS, DEFAULT_MODULES,
  type ServiceTime, type KidsRoom, type WeekDay, type ModuleConfig,
  type GivingFund,
} from '@/shared/types'
import {
  PresetSelector, Toggle, COLOR_PRESETS,
  inputCls, labelCls,
} from '@/features/setup/SetupWizard'
import Button from '@/shared/components/Button'
import LogoUpload from '@/shared/components/LogoUpload'

// ── Shared helpers ────────────────────────────────────────────────────────────

type SectionId =
  | 'identity' | 'branding' | 'services' | 'kids'
  | 'groups' | 'volunteers' | 'communications' | 'email' | 'dashboard'
  | 'modules' | 'giving'

const SECTIONS: { id: SectionId; label: string; icon: string }[] = [
  { id: 'identity',       label: 'Identity',        icon: '🏛️' },
  { id: 'modules',        label: 'Modules',          icon: '🧩' },
  { id: 'branding',       label: 'Branding',         icon: '🎨' },
  { id: 'services',       label: 'Service Times',    icon: '🕐' },
  { id: 'kids',           label: 'Kids Ministry',    icon: '👶' },
  { id: 'groups',         label: 'Groups',           icon: '👥' },
  { id: 'volunteers',     label: 'Volunteers',       icon: '🙋' },
  { id: 'communications', label: 'Communications',   icon: '📬' },
  { id: 'email',          label: 'Email',            icon: '✉️' },
  { id: 'dashboard',      label: 'Dashboard',        icon: '📊' },
  { id: 'giving',         label: 'Giving',           icon: '💳' },
]

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
              onChange={() => onChange(opt.value)} className="mt-0.5 accent-primary-600" />
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

function SectionCard({
  title, description, onSave, saving, saved, children,
}: {
  title: string
  description?: string
  onSave: () => void
  saving: boolean
  saved: boolean
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>
      {children}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        <Button onClick={onSave} loading={saving}>Save changes</Button>
        {saved && <span className="text-sm text-green-600 font-medium">Saved!</span>}
      </div>
    </div>
  )
}

function useSave(fn: () => Promise<void>) {
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  async function save() {
    setSaving(true)
    try {
      await fn()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }
  return { saving, saved, save }
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ChurchSettings() {
  const [section, setSection] = useState<SectionId>('identity')

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Church Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Each section saves independently.</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar nav */}
        <nav className="w-44 flex-shrink-0 space-y-1">
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors text-left ${
                section === s.id ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              <span>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {section === 'identity'       && <IdentitySection />}
          {section === 'modules'        && <ModulesSection />}
          {section === 'branding'       && <BrandingSection />}
          {section === 'services'       && <ServicesSection />}
          {section === 'kids'           && <KidsSection />}
          {section === 'groups'         && <GroupsSection />}
          {section === 'volunteers'     && <VolunteersSection />}
          {section === 'communications' && <CommunicationsSection />}
          {section === 'email'          && <EmailSection />}
          {section === 'dashboard'      && <DashboardSection />}
          {section === 'giving'         && <GivingSection />}
        </div>
      </div>
    </div>
  )
}

// ── Section 1: Identity ───────────────────────────────────────────────────────

const CONGREGATION_PRESETS = ['Members', 'Attenders', 'Family', 'Community']

function IdentitySection() {
  const { config, updateConfig } = useAppConfig()
  const [churchName,  setChurchName]  = useState(config.church_name)
  const [logoUrl,     setLogoUrl]     = useState(config.logo_url ?? '')
  const [address,     setAddress]     = useState(config.address ?? '')
  const [phone,       setPhone]       = useState(config.phone ?? '')
  const [website,     setWebsite]     = useState(config.website ?? '')
  const [congTerm,    setCongTerm]    = useState(config.congregation_term ?? 'Members')

  useEffect(() => {
    setChurchName(config.church_name)
    setLogoUrl(config.logo_url ?? '')
    setAddress(config.address ?? '')
    setPhone(config.phone ?? '')
    setWebsite(config.website ?? '')
    setCongTerm(config.congregation_term ?? 'Members')
  }, [config])

  const { saving, saved, save } = useSave(async () => {
    const name = churchName.trim() || config.church_name
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'my-church'

    // Keep the Church entity in sync with the configured name/slug.
    const existingChurch = await db.getChurch(getChurchId())
    if (existingChurch) {
      await db.updateChurch(existingChurch.id, { name, slug })
    }

    await updateConfig({
      church_name: name,
      logo_url: logoUrl.trim() || undefined,
      address:  address.trim()  || undefined,
      phone:    phone.trim()    || undefined,
      website:  website.trim()  || undefined,
      congregation_term: congTerm || 'Members',
    })
  })

  return (
    <SectionCard title="Church identity" description="Basic information visible across the app." onSave={save} saving={saving} saved={saved}>
      <div>
        <label className={labelCls}>Church name</label>
        <input type="text" value={churchName} onChange={e => setChurchName(e.target.value)} className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Phone</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Website</label>
          <input type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourchurch.com" className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Address</label>
        <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St, City, ST 00000" className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Logo <span className="text-gray-400 font-normal">(optional)</span></label>
        <LogoUpload value={logoUrl || undefined} onChange={url => setLogoUrl(url)} />
      </div>

      <PresetSelector
        label="What do you call your congregation?"
        presets={CONGREGATION_PRESETS}
        value={congTerm}
        onChange={setCongTerm}
      />
    </SectionCard>
  )
}

// ── Section 2: Branding ───────────────────────────────────────────────────────

function BrandingSection() {
  const { config, updateConfig } = useAppConfig()
  const [primary,   setPrimary]   = useState(config.primary_color)
  const [secondary, setSecondary] = useState(config.secondary_color ?? '#10b981')

  useEffect(() => {
    setPrimary(config.primary_color)
    setSecondary(config.secondary_color ?? '#10b981')
  }, [config])

  function selectPrimary(hex: string) { setPrimary(hex); applyPrimaryColor(hex) }

  const { saving, saved, save } = useSave(() =>
    updateConfig({ primary_color: primary, secondary_color: secondary }),
  )

  return (
    <SectionCard title="Branding" description="Colors used across the admin panel, kiosk, and embeds." onSave={save} saving={saving} saved={saved}>
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

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
        <p className="text-xs text-gray-500 font-medium mb-2">Preview</p>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
            style={{ backgroundColor: primary }}>
            {config.church_name?.[0] ?? 'C'}
          </div>
          <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: primary }} />
          <div className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold" style={{ backgroundColor: primary }}>Primary</div>
          <div className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold" style={{ backgroundColor: secondary }}>Accent</div>
        </div>
      </div>
    </SectionCard>
  )
}

// ── Section: Modules ─────────────────────────────────────────────────────────

const MODULE_SETTINGS: { key: keyof ModuleConfig; label: string; description: string }[] = [
  { key: 'checkin',        label: 'Kids Check-In',      description: 'Self-service kiosk, pickup codes, and room management.' },
  { key: 'volunteers',     label: 'Volunteers',          description: 'Team scheduling, roles, and background check tracking.' },
  { key: 'groups',         label: 'Small Groups',        description: 'Group directory, membership, and public group browser embed.' },
  { key: 'events',         label: 'Events',              description: 'Event calendar, registration, and public events embed.' },
  { key: 'visitors',       label: 'Visitor Pipeline',    description: 'Visitor intake form, follow-up steps, and welcome workflow.' },
  { key: 'worship',        label: 'Worship Planning',    description: 'Song library, service builder, team assignments, and run sheets.' },
  { key: 'giving',         label: 'Giving',              description: 'Contribution records, fund tracking, and giving statements.' },
  { key: 'attendance',     label: 'Attendance Tracking', description: 'Aggregate headcounts and per-service attendance records.' },
  { key: 'communications', label: 'Communications Log',  description: 'Audit log of all emails and SMS messages sent through the app.' },
]

function ModulesSection() {
  const { config, updateConfig } = useAppConfig()
  const [modules, setModules] = useState<ModuleConfig>(config.modules ?? DEFAULT_MODULES)

  useEffect(() => {
    setModules(config.modules ?? DEFAULT_MODULES)
  }, [config])

  function toggle(key: keyof ModuleConfig) {
    setModules(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const { saving, saved, save } = useSave(() => updateConfig({ modules }))

  return (
    <SectionCard
      title="Feature modules"
      description="Enable or disable platform features. Changes take effect immediately."
      onSave={save}
      saving={saving}
      saved={saved}
    >
      <div className="space-y-4">
        {MODULE_SETTINGS.map(mod => (
          <div key={mod.key} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
            <Toggle
              label={mod.label}
              description={mod.description}
              checked={modules[mod.key]}
              onChange={() => toggle(mod.key)}
            />
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// ── Section 3: Service Times ──────────────────────────────────────────────────

const DAYS: WeekDay[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function ServicesSection() {
  const { config, updateConfig } = useAppConfig()
  const [times,     setTimes]     = useState<ServiceTime[]>(config.service_times ?? [])
  const [campuses,  setCampuses]  = useState<string[]>(config.campuses ?? [])
  const [multiSite, setMultiSite] = useState((config.campuses?.length ?? 0) > 0)
  const [draftDay,  setDraftDay]  = useState<WeekDay>('Sunday')
  const [draftTime, setDraftTime] = useState('9:00 AM')
  const [draftLbl,  setDraftLbl]  = useState('')

  useEffect(() => {
    setTimes(config.service_times ?? [])
    setCampuses(config.campuses ?? [])
    setMultiSite((config.campuses?.length ?? 0) > 0)
  }, [config])

  function addTime() {
    const id = `st-${Date.now()}`
    setTimes(prev => [...prev, { id, day: draftDay, time: draftTime, label: draftLbl.trim() || undefined }])
    setDraftLbl('')
  }

  const { saving, saved, save } = useSave(() =>
    updateConfig({ service_times: times, campuses: multiSite ? campuses : [] }),
  )

  return (
    <SectionCard title="Service times" description="Default options when opening a check-in session." onSave={save} saving={saving} saved={saved}>
      <div className="space-y-2">
        <label className={labelCls}>Regular service times</label>
        <div className="flex gap-2 flex-wrap">
          <select value={draftDay} onChange={e => setDraftDay(e.target.value as WeekDay)}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
            {DAYS.map(d => <option key={d}>{d}</option>)}
          </select>
          <input type="text" value={draftTime} onChange={e => setDraftTime(e.target.value)}
            placeholder="9:00 AM" className="border border-gray-300 rounded-xl px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <input type="text" value={draftLbl} onChange={e => setDraftLbl(e.target.value)}
            placeholder="Label (optional)" className="border border-gray-300 rounded-xl px-3 py-2 text-sm flex-1 min-w-24 focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <button type="button" onClick={addTime}
            className="px-3 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-xl">+ Add</button>
        </div>
        {times.map(t => (
          <div key={t.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <span className="font-medium text-gray-800">{t.day} · {t.time}{t.label ? ` — ${t.label}` : ''}</span>
            <button type="button" onClick={() => setTimes(prev => prev.filter(x => x.id !== t.id))}
              className="text-gray-400 hover:text-red-500 ml-2">×</button>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <Toggle
          label="Multiple campuses or buildings"
          checked={multiSite}
          onChange={v => { setMultiSite(v); if (!v) setCampuses([]) }}
        />
        {multiSite && (
          <EditableList label="Campus / building names" items={campuses} onChange={setCampuses}
            placeholder="e.g. Main Campus, East Campus" />
        )}
      </div>
    </SectionCard>
  )
}

// ── Section 4: Kids Ministry ──────────────────────────────────────────────────

function KidsSection() {
  const { config, updateConfig } = useAppConfig()
  const [rooms,       setRooms]       = useState<KidsRoom[]>(config.kids_rooms ?? DEFAULT_KIDS_ROOMS)
  const [labelFields, setLabelFields] = useState(config.label_print_fields ?? { allergies: true, parent_phone: true, photo: false })
  const [autoFlag,    setAutoFlag]    = useState(config.auto_flag_allergies ?? true)
  const [policy,      setPolicy]      = useState<'code' | 'visual'>(config.pickup_policy ?? 'code')
  const [kioskCount,  setKioskCount]  = useState(config.kiosk_count ?? 1)
  const [editingRoom, setEditingRoom] = useState<string | null>(null)

  useEffect(() => {
    setRooms(config.kids_rooms ?? DEFAULT_KIDS_ROOMS)
    setLabelFields(config.label_print_fields ?? { allergies: true, parent_phone: true, photo: false })
    setAutoFlag(config.auto_flag_allergies ?? true)
    setPolicy(config.pickup_policy ?? 'code')
    setKioskCount(config.kiosk_count ?? 1)
  }, [config])

  function updateRoom(id: string, patch: Partial<KidsRoom>) {
    setRooms(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  function addRoom() {
    const id = `room-${Date.now()}`
    setRooms(prev => [...prev, { id, name: 'New Room' }])
    setEditingRoom(id)
  }

  const { saving, saved, save } = useSave(() =>
    updateConfig({
      kids_rooms: rooms,
      label_print_fields: labelFields,
      auto_flag_allergies: autoFlag,
      pickup_policy: policy,
      kiosk_count: kioskCount,
    }),
  )

  return (
    <SectionCard title="Kids ministry" description="Rooms, labels, and pickup policies for check-in." onSave={save} saving={saving} saved={saved}>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className={labelCls}>Age / grade rooms</label>
          <button type="button" onClick={addRoom} className="text-xs text-primary-600 font-medium hover:text-primary-800">+ Add room</button>
        </div>
        {rooms.map(room => (
          <div key={room.id} className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 bg-gray-50">
            {editingRoom === room.id
              ? <input type="text" value={room.name} autoFocus
                  onChange={e => updateRoom(room.id, { name: e.target.value })}
                  onBlur={() => setEditingRoom(null)}
                  className="text-sm font-medium bg-white border border-gray-300 rounded-lg px-2 py-1 flex-1 focus:outline-none" />
              : <button type="button" onClick={() => setEditingRoom(room.id)}
                  className="text-sm font-medium text-gray-900 flex-1 text-left hover:text-primary-600">{room.name}</button>
            }
            <span className="text-xs text-gray-500">Ages</span>
            <input type="number" value={room.min_age ?? ''} min={0} max={18}
              onChange={e => updateRoom(room.id, { min_age: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="min" className="w-14 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none" />
            <span className="text-xs text-gray-400">–</span>
            <input type="number" value={room.max_age ?? ''} min={0} max={18}
              onChange={e => updateRoom(room.id, { max_age: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="max" className="w-14 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none" />
            <button type="button" onClick={() => setRooms(prev => prev.filter(r => r.id !== room.id))}
              className="text-gray-300 hover:text-red-500 font-bold ml-1">×</button>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-gray-100 pt-4">
        <label className={labelCls}>What prints on the check-in label?</label>
        <p className="text-xs text-gray-400">Child name, room, and pickup code always print.</p>
        {([
          ['allergies',    'Allergy flag (⚠ if child has allergies on file)'],
          ['parent_phone', 'Parent phone number'],
          ['photo',        'Child photo (if on file)'],
        ] as const).map(([key, lbl]) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
            <input type="checkbox" checked={labelFields[key]}
              onChange={e => setLabelFields(prev => ({ ...prev, [key]: e.target.checked }))}
              className="accent-primary-600" />
            {lbl}
          </label>
        ))}
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <Toggle
          label="Auto-flag allergy / medical notes on check-in"
          description="Show a red alert banner on the check-in dashboard for children with allergies or medical notes"
          checked={autoFlag}
          onChange={setAutoFlag}
        />
        <RadioGroup
          label="Pickup policy"
          value={policy}
          onChange={setPolicy}
          options={[
            { value: 'code',   label: 'Matching pickup code required' },
            { value: 'visual', label: 'Visual ID check only' },
          ]}
        />
        <div>
          <label className={labelCls}>Typical number of kiosk stations</label>
          <input type="number" value={kioskCount} min={1} max={20}
            onChange={e => setKioskCount(Number(e.target.value))}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
      </div>
    </SectionCard>
  )
}

// ── Section 5: Groups ─────────────────────────────────────────────────────────

const GROUP_TYPE_OPTIONS = [
  { value: 'Small Groups',    label: 'Small Groups' },
  { value: 'Life Groups',     label: 'Life Groups' },
  { value: 'Bible Study',     label: 'Bible Study' },
  { value: 'Recovery',        label: 'Recovery' },
  { value: 'Youth',           label: 'Youth' },
  { value: 'Interest Groups', label: 'Interest Groups' },
  { value: 'Serving Teams',   label: 'Serving Teams' },
  { value: 'Classes',         label: 'Classes' },
]

const GROUP_LABEL_PRESETS = ['Small Groups', 'Life Groups', 'Connect Groups', 'Community Groups']
const VOL_LABEL_PRESETS   = ['Volunteers', 'Serve Teams', 'Ministry Teams']
const MEMBER_PRESETS      = ['Members', 'Congregation', 'Attendees', 'People']
const GIVING_PRESETS      = ['Giving', 'Stewardship', 'Tithes & Offerings']
const KIDS_PRESETS        = ['Kids Check-In', "Children's Ministry Check-In"]
const SERVICE_PRESETS     = ['Service Order', 'Order of Worship', 'Worship Plan']

function GroupsSection() {
  const { config, updateConfig } = useAppConfig()
  const [groupTypes,       setGroupTypes]       = useState<string[]>(config.group_types ?? ['Small Groups', 'Bible Study'])
  const [groupsLabel,      setGroupsLabel]      = useState(config.terminology.groups_label)
  const [volunteersLabel,  setVolunteersLabel]  = useState(config.terminology.volunteers_label)
  const [membersLabel,     setMembersLabel]     = useState(config.terminology.members_label)
  const [givingLabel,      setGivingLabel]      = useState(config.terminology.giving_label)
  const [kidsLabel,        setKidsLabel]        = useState(config.terminology.kids_label)
  const [serviceLabel,     setServiceLabel]     = useState(config.terminology.service_label)
  const [leadersRoster,    setLeadersRoster]    = useState(config.group_leaders_see_roster ?? true)
  const [requiresApproval, setRequiresApproval] = useState(config.group_signup_requires_approval ?? false)

  useEffect(() => {
    setGroupTypes(config.group_types ?? ['Small Groups', 'Bible Study'])
    setGroupsLabel(config.terminology.groups_label)
    setVolunteersLabel(config.terminology.volunteers_label)
    setMembersLabel(config.terminology.members_label)
    setGivingLabel(config.terminology.giving_label)
    setKidsLabel(config.terminology.kids_label)
    setServiceLabel(config.terminology.service_label)
    setLeadersRoster(config.group_leaders_see_roster ?? true)
    setRequiresApproval(config.group_signup_requires_approval ?? false)
  }, [config])

  const { saving, saved, save } = useSave(() =>
    updateConfig({
      group_types: groupTypes,
      group_leaders_see_roster: leadersRoster,
      group_signup_requires_approval: requiresApproval,
      terminology: {
        ...config.terminology,
        groups_label: groupsLabel,
        volunteers_label: volunteersLabel,
        members_label: membersLabel,
        giving_label: givingLabel,
        kids_label: kidsLabel,
        service_label: serviceLabel,
      },
    }),
  )

  return (
    <SectionCard title="Groups & terminology" description="Configure groups and the labels used throughout the app." onSave={save} saving={saving} saved={saved}>
      <CheckboxGroup
        label="What types of groups do you run?"
        options={GROUP_TYPE_OPTIONS}
        values={groupTypes}
        onChange={setGroupTypes}
      />

      <div className="border-t border-gray-100 pt-4 space-y-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Terminology labels</p>
        <PresetSelector label="Groups" presets={GROUP_LABEL_PRESETS} value={groupsLabel} onChange={setGroupsLabel} />
        <PresetSelector label="Volunteer teams" presets={VOL_LABEL_PRESETS} value={volunteersLabel} onChange={setVolunteersLabel} />
        <PresetSelector label="Congregation" presets={MEMBER_PRESETS} value={membersLabel} onChange={setMembersLabel} />
        <PresetSelector label="Giving" presets={GIVING_PRESETS} value={givingLabel} onChange={setGivingLabel} />
        <PresetSelector label="Kids ministry" presets={KIDS_PRESETS} value={kidsLabel} onChange={setKidsLabel} />
        <PresetSelector label="Service order" presets={SERVICE_PRESETS} value={serviceLabel} onChange={setServiceLabel} />
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <Toggle label="Group leaders can see their own member roster" checked={leadersRoster} onChange={setLeadersRoster} />
        <Toggle label="Public sign-up requires staff approval" checked={requiresApproval} onChange={setRequiresApproval} />
      </div>
    </SectionCard>
  )
}

// ── Section 6: Volunteers ─────────────────────────────────────────────────────

function VolunteersSection() {
  const { config, updateConfig } = useAppConfig()
  const [teams,        setTeams]        = useState<string[]>(config.serving_teams ?? DEFAULT_SERVING_TEAMS)
  const [advance,      setAdvance]      = useState<'weekly' | 'bi-weekly' | 'monthly'>(config.schedule_advance ?? 'weekly')
  const [scheduling,   setScheduling]   = useState<'self' | 'coordinator'>(config.volunteer_scheduling ?? 'coordinator')
  const [notification, setNotification] = useState<'email' | 'sms' | 'both'>(config.volunteer_notification ?? 'email')

  useEffect(() => {
    setTeams(config.serving_teams ?? DEFAULT_SERVING_TEAMS)
    setAdvance(config.schedule_advance ?? 'weekly')
    setScheduling(config.volunteer_scheduling ?? 'coordinator')
    setNotification(config.volunteer_notification ?? 'email')
  }, [config])

  const { saving, saved, save } = useSave(() =>
    updateConfig({ serving_teams: teams, schedule_advance: advance, volunteer_scheduling: scheduling, volunteer_notification: notification }),
  )

  return (
    <SectionCard title="Volunteers" description="Serving teams and scheduling preferences." onSave={save} saving={saving} saved={saved}>
      <EditableList label="Serving teams" items={teams} onChange={setTeams} placeholder="Add a team…" />

      <RadioGroup label="How far in advance do you build schedules?" value={advance} onChange={setAdvance}
        options={[
          { value: 'weekly',    label: 'Weekly' },
          { value: 'bi-weekly', label: 'Bi-weekly' },
          { value: 'monthly',   label: 'Monthly' },
        ]} />

      <RadioGroup label="How do volunteers get scheduled?" value={scheduling} onChange={setScheduling}
        options={[
          { value: 'coordinator', label: 'Coordinator assigns them' },
          { value: 'self',        label: 'Volunteers self-schedule' },
        ]} />

      <RadioGroup label="Preferred volunteer notification method" value={notification} onChange={setNotification}
        options={[
          { value: 'email', label: 'Email' },
          { value: 'sms',   label: 'SMS / Text' },
          { value: 'both',  label: 'Both email and SMS' },
        ]} />
    </SectionCard>
  )
}

// ── Section 7: Communications ─────────────────────────────────────────────────

const FOLLOWUP_OWNER_OPTIONS = ['Lead Pastor', 'Connections Pastor', 'Admin', 'Auto-assign']

function CommunicationsSection() {
  const { config, updateConfig } = useAppConfig()
  const [outreach,         setOutreach]         = useState<'email' | 'sms' | 'both'>(config.primary_outreach ?? 'email')
  const [followupSteps,    setFollowupSteps]    = useState(config.visitor_followup_steps ?? 3)
  const [followupOwner,    setFollowupOwner]    = useState(config.visitor_followup_owner ?? 'Connections Pastor')
  const [customOwner,      setCustomOwner]      = useState(!FOLLOWUP_OWNER_OPTIONS.includes(config.visitor_followup_owner ?? 'Connections Pastor'))
  const [weeklyReport,     setWeeklyReport]     = useState(config.weekly_report ?? false)
  const [reportEmail,      setReportEmail]      = useState(config.weekly_report_email ?? '')
  const [reportRecipients, setReportRecipients] = useState(config.report_recipients ?? '')

  useEffect(() => {
    setOutreach(config.primary_outreach ?? 'email')
    setFollowupSteps(config.visitor_followup_steps ?? 3)
    const owner = config.visitor_followup_owner ?? 'Connections Pastor'
    setFollowupOwner(owner)
    setCustomOwner(!FOLLOWUP_OWNER_OPTIONS.includes(owner))
    setWeeklyReport(config.weekly_report ?? false)
    setReportEmail(config.weekly_report_email ?? '')
    setReportRecipients(config.report_recipients ?? '')
  }, [config])

  const { saving, saved, save } = useSave(() =>
    updateConfig({
      primary_outreach: outreach,
      visitor_followup_steps: followupSteps,
      visitor_followup_owner: followupOwner,
      weekly_report: weeklyReport,
      weekly_report_email: weeklyReport ? reportEmail : undefined,
      report_recipients: reportRecipients || undefined,
    }),
  )

  return (
    <SectionCard title="Communications & follow-up" description="How you reach visitors and your congregation." onSave={save} saving={saving} saved={saved}>
      <RadioGroup label="Primary outreach method" value={outreach} onChange={setOutreach}
        options={[
          { value: 'email', label: 'Email' },
          { value: 'sms',   label: 'SMS / Text' },
          { value: 'both',  label: 'Both email and SMS' },
        ]} />

      <div>
        <label className={labelCls}>Follow-up steps for first-time visitors</label>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={10} value={followupSteps}
            onChange={e => setFollowupSteps(Number(e.target.value))}
            className="flex-1 accent-primary-600" />
          <span className="text-sm font-semibold text-gray-800 w-6 text-center">{followupSteps}</span>
        </div>
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
          <button type="button" onClick={() => { setCustomOwner(true); setFollowupOwner('') }}
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

      <div className="border-t border-gray-100 pt-4">
        <label className={labelCls}>Report recipients (Monthly Vital Signs)</label>
        <input
          type="text"
          value={reportRecipients}
          onChange={e => setReportRecipients(e.target.value)}
          placeholder="pastor@church.com, exec@church.com"
          className={inputCls}
        />
        <p className="text-xs text-gray-400 mt-1">
          Comma-separated emails. These receive the report when you click "Email report" on the Monthly Vital Signs page.
        </p>
      </div>
    </SectionCard>
  )
}

// ── Section 8: Dashboard ──────────────────────────────────────────────────────

const METRIC_OPTIONS = [
  { value: 'attendance', label: 'Attendance' },
  { value: 'giving',     label: 'Giving' },
  { value: 'volunteers', label: 'Volunteers' },
  { value: 'groups',     label: 'Groups' },
  { value: 'visitors',   label: 'Visitors' },
  { value: 'kids',       label: 'Kids Check-in' },
]

function DashboardSection() {
  const { config, updateConfig } = useAppConfig()
  const [metrics,        setMetrics]        = useState<string[]>(config.dashboard_metrics ?? DEFAULT_DASHBOARD_METRICS)
  const [showYoy,        setShowYoy]        = useState(config.show_yoy ?? true)
  const [annualBudget,   setAnnualBudget]   = useState(String(config.annual_giving_budget ?? ''))

  useEffect(() => {
    setMetrics(config.dashboard_metrics ?? DEFAULT_DASHBOARD_METRICS)
    setShowYoy(config.show_yoy ?? true)
    setAnnualBudget(String(config.annual_giving_budget ?? ''))
  }, [config])

  const { saving, saved, save } = useSave(() =>
    updateConfig({
      dashboard_metrics: metrics,
      show_yoy: showYoy,
      annual_giving_budget: annualBudget ? parseFloat(annualBudget) : undefined,
    }),
  )

  return (
    <SectionCard title="Dashboard & reports" description="Choose what leadership sees front and center." onSave={save} saving={saving} saved={saved}>
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
      <div>
        <label className={labelCls}>Annual giving budget ($)</label>
        <input
          type="number"
          min={0}
          step={1000}
          value={annualBudget}
          onChange={e => setAnnualBudget(e.target.value)}
          placeholder="e.g. 250000"
          className={inputCls}
        />
        <p className="text-xs text-gray-400 mt-1">
          Used on the Monthly Vital Signs Report to show giving vs. monthly target (annual ÷ 12).
        </p>
      </div>
    </SectionCard>
  )
}

// ── Email provider section ─────────────────────────────────────────────────────

function EmailSection() {
  const { config, updateConfig } = useAppConfig()
  const [provider,       setProvider]       = useState<'gmail' | 'resend'>(config.email_provider ?? 'resend')
  const [gmailAddress,   setGmailAddress]   = useState(config.gmail_address   ?? '')
  const [gmailPassword,  setGmailPassword]  = useState(config.gmail_app_password ?? '')
  const [resendKey,      setResendKey]      = useState(config.resend_api_key  ?? '')
  const [testEmail,      setTestEmail]      = useState('')
  const [sending,        setSending]        = useState(false)
  const [testResult,     setTestResult]     = useState<'sent' | 'error' | null>(null)

  useEffect(() => {
    setProvider(config.email_provider ?? 'resend')
    setGmailAddress(config.gmail_address ?? '')
    setGmailPassword(config.gmail_app_password ?? '')
    setResendKey(config.resend_api_key ?? '')
  }, [config])

  const { saving, saved, save } = useSave(() =>
    updateConfig({
      email_provider: provider,
      gmail_address:      provider === 'gmail'  ? (gmailAddress.trim()  || undefined) : undefined,
      gmail_app_password: provider === 'gmail'  ? (gmailPassword.trim() || undefined) : undefined,
      resend_api_key:     provider === 'resend' ? (resendKey.trim()     || undefined) : undefined,
    }),
  )

  async function handleTestEmail() {
    if (!testEmail.trim()) return
    setSending(true)
    setTestResult(null)
    try {
      await sendEmail({
        to: testEmail.trim(),
        subject: 'Test email from Gather',
        body: `This is a test email from Gather.\n\nProvider: ${provider}\nChurch: ${config.church_name}`,
      })
      setTestResult('sent')
    } catch {
      setTestResult('error')
    } finally {
      setSending(false)
    }
  }

  return (
    <SectionCard
      title="Email provider"
      description="Configure how transactional emails (volunteer schedules, event confirmations, etc.) are sent."
      onSave={save}
      saving={saving}
      saved={saved}
    >
      <RadioGroup
        label="Email provider"
        value={provider}
        onChange={setProvider}
        options={[
          {
            value: 'resend',
            label: 'Resend',
            description: 'Recommended — 3,000 free emails/month. API key sent directly from the browser.',
          },
          {
            value: 'gmail',
            label: 'Gmail SMTP',
            description: 'Use your Gmail account. Requires a server-side proxy (see docs).',
          },
        ]}
      />

      {provider === 'resend' && (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Resend API key</label>
            <input
              type="password"
              value={resendKey}
              onChange={e => setResendKey(e.target.value)}
              placeholder="re_…"
              className={inputCls}
              autoComplete="off"
            />
            <p className="text-xs text-gray-400 mt-1">
              Get a free API key at{' '}
              <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">
                resend.com
              </a>
              . Leave blank to use the <code className="bg-gray-100 px-1 rounded">VITE_RESEND_API_KEY</code> env variable.
            </p>
          </div>
        </div>
      )}

      {provider === 'gmail' && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 space-y-1">
            <p className="font-medium">Gmail SMTP requires a server-side proxy</p>
            <p>
              Browsers cannot open raw SMTP connections. You must configure a backend
              function that reads these credentials and sends via Nodemailer or a similar library.
              Until then, emails are skipped with a console warning.
            </p>
          </div>
          <div>
            <label className={labelCls}>Gmail address</label>
            <input
              type="email"
              value={gmailAddress}
              onChange={e => setGmailAddress(e.target.value)}
              placeholder="yourchurch@gmail.com"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>App Password</label>
            <input
              type="password"
              value={gmailPassword}
              onChange={e => setGmailPassword(e.target.value)}
              placeholder="xxxx xxxx xxxx xxxx"
              className={inputCls}
              autoComplete="off"
            />
            <p className="text-xs text-gray-400 mt-1">
              Use a{' '}
              <a
                href="https://support.google.com/accounts/answer/185833"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 underline"
              >
                Gmail App Password
              </a>
              , not your regular account password. Requires 2-Step Verification enabled.
            </p>
          </div>
        </div>
      )}

      {/* Send test email */}
      <div className="border-t border-gray-100 pt-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Send a test email</p>
        <div className="flex gap-2">
          <input
            type="email"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="test@example.com"
            className={`${inputCls} flex-1`}
          />
          <Button onClick={() => void handleTestEmail()} loading={sending} variant="secondary">
            Send test
          </Button>
        </div>
        {testResult === 'sent' && (
          <p className="text-xs text-green-600 font-medium">Test email sent successfully.</p>
        )}
        {testResult === 'error' && (
          <p className="text-xs text-red-600 font-medium">
            Failed to send. Check your provider configuration and browser console for details.
          </p>
        )}
      </div>
    </SectionCard>
  )
}

// ── Section 11: Giving ────────────────────────────────────────────────────────

function GivingSection() {
  const { config, updateConfig } = useAppConfig()

  // ── Stripe Connect state ──────────────────────────────────────────────────
  const stripeAccountId = config.stripe_account_id ?? null
  const stripeStatus: 'connected' | 'pending' | 'not_connected' =
    stripeAccountId ? 'connected' : 'not_connected'

  const [disconnecting, setDisconnecting] = useState(false)

  function handleStartOnboarding() {
    // TODO [Stripe Connect]: Replace this log with a redirect to your Stripe Connect onboarding URL.
    // The real flow:
    //   1. Your server calls stripe.oauth.authorizeUrl({ client_id, scope: 'read_write', ... })
    //   2. Redirect the browser to that URL
    //   3. After the church owner completes OAuth, Stripe redirects back to your /stripe-connect/callback
    //   4. Your callback exchanges the code for stripe_account_id and saves it to AppConfig
    // See: https://stripe.com/docs/connect/oauth-reference
    console.log('TODO: Redirect to Stripe onboarding')
    alert('Stripe onboarding not yet wired. See PROGRESS.md for implementation notes.')
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      // TEST_MODE: just clears the stripe_account_id.
      // TODO [Stripe Connect]: In production, first call Stripe API to deauthorize the account:
      //   await stripe.oauth.deauthorize({ client_id, stripe_user_id: stripeAccountId })
      await updateConfig({ stripe_account_id: null })
    } finally {
      setDisconnecting(false)
    }
  }

  // ── Fund config ───────────────────────────────────────────────────────────
  const [funds, setFunds] = useState<GivingFund[]>(
    config.giving_funds ?? [{ id: 'general', name: 'General Fund' }]
  )
  const [newFundName, setNewFundName] = useState('')

  useEffect(() => {
    setFunds(config.giving_funds ?? [{ id: 'general', name: 'General Fund' }])
  }, [config.giving_funds])

  function addFund() {
    const name = newFundName.trim()
    if (!name) return
    const fundId = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (funds.find(f => f.id === fundId)) return
    setFunds([...funds, { id: fundId, name }])
    setNewFundName('')
  }

  function removeFund(id: string) {
    setFunds(funds.filter(f => f.id !== id))
  }

  // ── Preset amounts config ─────────────────────────────────────────────────
  const [presets, setPresets] = useState<number[]>(
    config.giving_preset_amounts ?? [25, 50, 100, 250]
  )
  const [newPreset, setNewPreset] = useState('')

  useEffect(() => {
    setPresets(config.giving_preset_amounts ?? [25, 50, 100, 250])
  }, [config.giving_preset_amounts])

  function addPreset() {
    const val = parseFloat(newPreset)
    if (isNaN(val) || val <= 0) return
    if (presets.includes(val)) return
    setPresets([...presets, val].sort((a, b) => a - b))
    setNewPreset('')
  }

  function removePreset(val: number) {
    setPresets(presets.filter(p => p !== val))
  }

  const { saving, saved, save } = useSave(async () => {
    await updateConfig({ giving_funds: funds, giving_preset_amounts: presets })
  })

  return (
    <div className="space-y-6">
      {/* ── Stripe Connect ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Connect your bank account</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Link a Stripe account to accept online donations through the giving embed.
          </p>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-3">
          {stripeStatus === 'connected' && (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-700">Connected</p>
                <p className="text-xs text-gray-500 font-mono">{stripeAccountId}</p>
              </div>
            </>
          )}
          {stripeStatus === 'pending' && (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-700">Pending verification</p>
                <p className="text-xs text-gray-500">Stripe may still be verifying your account details.</p>
              </div>
            </>
          )}
          {stripeStatus === 'not_connected' && (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-gray-300 flex-shrink-0" />
              <p className="text-sm font-medium text-gray-500">Not connected</p>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {stripeStatus === 'not_connected' && (
            <Button onClick={handleStartOnboarding}>
              Start Stripe Connect
            </Button>
          )}
          {stripeStatus === 'connected' && (
            <Button
              variant="secondary"
              onClick={() => void handleDisconnect()}
              loading={disconnecting}
            >
              Disconnect
            </Button>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 space-y-1">
          <p className="font-medium">How Stripe Connect works</p>
          <p>
            Clicking "Start Stripe Connect" will redirect your church administrator to Stripe's
            onboarding flow. After completing it, Stripe redirects back to Gather with an account ID
            that is stored here. Once connected, donations submitted via the giving embed are processed
            directly into your church's Stripe account. See <code>PROGRESS.md</code> for wiring instructions.
          </p>
        </div>
      </div>

      {/* ── Fund configuration ───────────────────────────────────────────────── */}
      <SectionCard
        title="Giving funds"
        description="Funds donors can designate when giving online."
        onSave={save}
        saving={saving}
        saved={saved}
      >
        <div className="space-y-3">
          {funds.map(fund => (
            <div key={fund.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
              <span className="flex-1 text-sm font-medium text-gray-800">{fund.name}</span>
              <span className="text-xs text-gray-400 font-mono">{fund.id}</span>
              {funds.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeFund(fund.id)}
                  className="text-gray-300 hover:text-red-500 font-bold text-base leading-none ml-1"
                >
                  ×
                </button>
              )}
            </div>
          ))}

          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={newFundName}
              onChange={e => setNewFundName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFund() } }}
              placeholder="Add fund (e.g. Missions)"
              className={inputCls}
            />
            <button
              type="button"
              onClick={addFund}
              className="px-3 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors whitespace-nowrap"
            >
              + Add
            </button>
          </div>
        </div>
      </SectionCard>

      {/* ── Preset amounts ───────────────────────────────────────────────────── */}
      <SectionCard
        title="Preset donation amounts"
        description="Quick-pick buttons shown on the giving embed form."
        onSave={save}
        saving={saving}
        saved={saved}
      >
        <div className="flex flex-wrap gap-2">
          {presets.map(p => (
            <span key={p} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded-full font-medium">
              ${p}
              <button
                type="button"
                onClick={() => removePreset(p)}
                className="text-gray-400 hover:text-red-500 font-bold leading-none ml-0.5"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            min="1"
            step="1"
            value={newPreset}
            onChange={e => setNewPreset(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPreset() } }}
            placeholder="Amount (e.g. 500)"
            className={`${inputCls} flex-1`}
          />
          <button
            type="button"
            onClick={addPreset}
            className="px-3 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors whitespace-nowrap"
          >
            + Add
          </button>
        </div>
      </SectionCard>
    </div>
  )
}
