import { useState } from 'react'

interface Props {
  childName: string
  allergies?: string
  medicalNotes?: string
  onAcknowledge: () => void
}

/**
 * Automatic health-and-safety banner shown when a child's Person record
 * contains content in the allergies or medical_notes fields.
 * Requires no manual CheckinFlag — triggers from existing profile data.
 */
export default function MedicalAlertBanner({ childName, allergies, medicalNotes, onAcknowledge }: Props) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div
      role="alert"
      className="bg-red-600 text-white rounded-2xl p-4 flex items-start gap-4 border-4 border-red-800 shadow-lg"
    >
      <div className="text-3xl flex-shrink-0" aria-hidden>🚨</div>
      <div className="flex-1 min-w-0">
        <div className="font-black text-base uppercase tracking-widest">
          ⚕ Allergy / Medical Alert
        </div>
        <div className="font-bold text-lg mt-0.5">{childName}</div>
        {allergies && (
          <div className="mt-1.5 bg-red-700/60 rounded-lg px-3 py-1.5 text-sm font-semibold">
            <span className="uppercase tracking-wide text-red-200 text-xs font-bold">Allergies: </span>
            {allergies}
          </div>
        )}
        {medicalNotes && (
          <div className="mt-1 bg-red-700/60 rounded-lg px-3 py-1.5 text-sm font-semibold">
            <span className="uppercase tracking-wide text-red-200 text-xs font-bold">Medical notes: </span>
            {medicalNotes}
          </div>
        )}
        <div className="text-xs text-red-200 mt-2 font-medium">
          Inform the room volunteer before the child enters.
        </div>
      </div>
      <button
        onClick={() => { setDismissed(true); onAcknowledge() }}
        className="flex-shrink-0 bg-white text-red-700 hover:bg-red-50 font-bold text-sm rounded-lg px-3 py-1.5 border-2 border-white transition-colors"
      >
        Acknowledge
      </button>
    </div>
  )
}
