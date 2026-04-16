import { useState } from 'react'
import type { CheckinFlag } from '@/shared/types'

interface Props {
  childName: string
  flags: CheckinFlag[]
  onAcknowledge: () => void
}

const FLAG_COLORS: Record<string, string> = {
  custody_alert: 'bg-red-600',
  behavioral: 'bg-amber-500',
  medical: 'bg-blue-600',
  other: 'bg-gray-600',
}

const FLAG_LABELS: Record<string, string> = {
  custody_alert: 'CUSTODY ALERT',
  behavioral: 'BEHAVIORAL NOTE',
  medical: 'MEDICAL ALERT',
  other: 'ALERT',
}

export default function FlagAlertBanner({ childName, flags, onAcknowledge }: Props) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || flags.length === 0) return null

  const topFlag = flags[0]
  const color = FLAG_COLORS[topFlag.flag_type] ?? 'bg-gray-600'
  const label = FLAG_LABELS[topFlag.flag_type] ?? 'ALERT'

  return (
    <div className={`${color} text-white rounded-2xl p-4 flex items-start gap-4 animate-pulse-once`}>
      <div className="text-2xl flex-shrink-0">⚠️</div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm uppercase tracking-wide">{label}</div>
        <div className="font-semibold">{childName}</div>
        {flags.map(flag => (
          <div key={flag.id} className="text-sm mt-1 opacity-90">{flag.flag_message}</div>
        ))}
        {flags.length > 1 && (
          <div className="text-xs mt-1 opacity-75">+{flags.length - 1} more flag{flags.length > 2 ? 's' : ''}</div>
        )}
      </div>
      <button
        onClick={() => { setDismissed(true); onAcknowledge() }}
        className="flex-shrink-0 text-white/80 hover:text-white text-sm font-medium border border-white/40 rounded-lg px-3 py-1.5"
      >
        Acknowledge
      </button>
    </div>
  )
}
