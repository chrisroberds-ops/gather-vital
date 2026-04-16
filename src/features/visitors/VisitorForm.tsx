import { useState } from 'react'
import { submitVisitorForm } from './visitor-service'
import { useAppConfig } from '@/services/app-config-context'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'

const inputClass = 'border border-gray-300 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary-500'
const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

type Step = 'form' | 'success'

const SOURCES = [
  'Website',
  'Social media',
  'Friend or family',
  'Drive by',
  'Community event',
  'Other',
]

export default function VisitorForm() {
  const { config } = useAppConfig()
  const [step, setStep] = useState<Step>('form')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alreadyKnown, setAlreadyKnown] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const result = await submitVisitorForm({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        visitor_source: source || undefined,
      })
      setAlreadyKnown(result.alreadyInPipeline)
      setStep('success')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (step === 'success') {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 text-center p-6 space-y-4">
        <div className="text-5xl">{alreadyKnown ? '👋' : '🎉'}</div>
        <div>
          <p className="text-xl font-semibold text-gray-900">
            {alreadyKnown ? `Welcome back, ${firstName}!` : `Thanks, ${firstName}!`}
          </p>
          <p className="text-sm text-gray-500 mt-2 max-w-xs">
            {alreadyKnown
              ? "We already have you in our system. We're so glad you're here today."
              : "We're glad you joined us today. Someone from our team will be in touch soon!"}
          </p>
        </div>
        <Button variant="secondary" onClick={() => { setStep('form'); setFirstName(''); setLastName(''); setPhone(''); setEmail(''); setSource('') }}>
          Submit another
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-md mx-auto">
      <div className="text-center mb-6">
        {config.logo_url && (
          <img
            src={config.logo_url}
            alt={config.church_name || 'Church logo'}
            className="h-14 mx-auto mb-4 object-contain"
          />
        )}
        <h1 className="text-2xl font-bold text-gray-900">
          {config.church_name ? `Welcome to ${config.church_name}!` : 'Welcome!'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">We'd love to get to know you. Fill out the form below.</p>
      </div>

      <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>First name *</label>
            <input
              type="text"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              required
              autoComplete="given-name"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Last name *</label>
            <input
              type="text"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              required
              autoComplete="family-name"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="(555) 000-0000"
            autoComplete="tel"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>How did you hear about us?</label>
          <select value={source} onChange={e => setSource(e.target.value)} className={inputClass}>
            <option value="">Select one (optional)</option>
            {SOURCES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button
          type="submit"
          loading={saving}
          disabled={!firstName.trim() || !lastName.trim()}
          className="w-full justify-center"
        >
          Submit
        </Button>
      </form>

      {/* QR code section — shown when this page is loaded directly (not in iframe) */}
      <QrCodeSection />
    </div>
  )
}

function QrCodeSection() {
  // Only show if we can derive a URL (non-iframe context)
  const url = typeof window !== 'undefined' ? window.location.href : null
  if (!url) return null

  // Don't show QR inside an iframe
  if (typeof window !== 'undefined' && window.self !== window.top) return null

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}`

  return (
    <div className="mt-8 pt-6 border-t border-gray-200 text-center">
      <p className="text-xs text-gray-400 mb-3">Or scan to open on a phone</p>
      <img
        src={qrUrl}
        alt="QR code for this visitor form"
        className="mx-auto rounded-lg"
        width={160}
        height={160}
      />
    </div>
  )
}
