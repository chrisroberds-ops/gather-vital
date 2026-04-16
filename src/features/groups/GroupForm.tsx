import { useState } from 'react'
import { createGroup, updateGroup, GROUP_TYPE_LABELS, MEETING_DAYS } from './group-service'
import { Input, Select } from '@/shared/components/FormFields'
import Button from '@/shared/components/Button'
import type { Group, GroupType } from '@/shared/types'

interface Props {
  group?: Group
  onDone: () => void
}

const GROUP_TYPES = Object.entries(GROUP_TYPE_LABELS) as [GroupType, string][]

export default function GroupForm({ group, onDone }: Props) {
  const [name, setName] = useState(group?.name ?? '')
  const [description, setDescription] = useState(group?.description ?? '')
  const [groupType, setGroupType] = useState<GroupType>(group?.group_type ?? 'small_group')
  const [meetingDay, setMeetingDay] = useState(group?.meeting_day ?? '')
  const [meetingTime, setMeetingTime] = useState(group?.meeting_time ?? '')
  const [location, setLocation] = useState(group?.location ?? '')
  const [category, setCategory] = useState(group?.category ?? '')
  const [hookText, setHookText] = useState(group?.hook_text ?? '')
  const [maxCapacity, setMaxCapacity] = useState(group?.max_capacity?.toString() ?? '')
  const [imageUrl, setImageUrl] = useState(group?.image_url ?? '')
  const [isOpen, setIsOpen] = useState(group?.is_open ?? true)
  const [isVisible, setIsVisible] = useState(group?.is_visible ?? true)
  const [isActive, setIsActive] = useState(group?.is_active ?? true)
  const [saving, setSaving] = useState(false)

  const inputClass = 'border border-gray-300 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary-500'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const data = {
      name,
      description: description || undefined,
      group_type: groupType,
      meeting_day: meetingDay || undefined,
      meeting_time: meetingTime || undefined,
      location: location || undefined,
      category: category || undefined,
      hook_text: hookText || undefined,
      max_capacity: maxCapacity ? parseInt(maxCapacity) : undefined,
      image_url: imageUrl || undefined,
      is_open: isOpen,
      is_visible: isVisible,
      is_active: isActive,
      childcare_available: false,
    }
    if (group) {
      await updateGroup(group.id, data)
    } else {
      await createGroup(data)
    }
    onDone()
  }

  return (
    <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
      <Input label="Group name" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Young Adults" />

      <div>
        <label className={labelClass}>Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          placeholder="What is this group about?"
          className={`${inputClass} resize-none`}
        />
      </div>

      <div>
        <label className={labelClass}>Hook text (short tagline for public browser)</label>
        <input type="text" value={hookText} onChange={e => setHookText(e.target.value)} placeholder="A one-line invite" className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select label="Type" value={groupType} onChange={e => setGroupType(e.target.value as GroupType)}>
          {GROUP_TYPES.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
        </Select>
        <div>
          <label className={labelClass}>Category</label>
          <input type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Young Adults" className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select label="Meeting day" value={meetingDay} onChange={e => setMeetingDay(e.target.value)}>
          <option value="">No set day</option>
          {MEETING_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
        </Select>
        <div>
          <label className={labelClass}>Meeting time</label>
          <input type="text" value={meetingTime} onChange={e => setMeetingTime(e.target.value)} placeholder="e.g. 7:00 PM" className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Location" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Room 104" />
        <div>
          <label className={labelClass}>Max capacity</label>
          <input type="number" min="1" value={maxCapacity} onChange={e => setMaxCapacity(e.target.value)} placeholder="Unlimited" className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Image URL (optional)</label>
        <input type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." className={inputClass} />
      </div>

      <div className="flex flex-wrap gap-4 pt-1">
        {[
          { checked: isOpen, setter: setIsOpen, label: 'Open enrollment' },
          { checked: isVisible, setter: setIsVisible, label: 'Visible in public browser' },
          { checked: isActive, setter: setIsActive, label: 'Active' },
        ].map(({ checked, setter, label }) => (
          <label key={label} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={checked} onChange={e => setter(e.target.checked)} className="w-4 h-4 rounded text-primary-600" />
            {label}
          </label>
        ))}
      </div>

      <Button type="submit" loading={saving} disabled={!name.trim()}>
        {group ? 'Save changes' : 'Create group'}
      </Button>
    </form>
  )
}
